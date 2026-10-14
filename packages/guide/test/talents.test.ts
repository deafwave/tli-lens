import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { talentMoves, talentMovesWith } from '../src/candidates/talents';
import { POINT_OBSERVATIONS, legalAllocation, pointsAtLevel, treeCores, treeOf, treeSlotsAllowed } from '../src/talentRules';

const pin = process.env.DPS_DEBUG_PIN ?? 'C:/Users/deafwave/Documents/no_access/tli/dps-debug/.worktrees/guide-pin';
const l94 = JSON.parse(readFileSync(`${pin}/game/loadout_l94-20261013-160234.json`, 'utf8'));
const state = { loadout: l94, owned: [], fe: 0, level: 94, skill: 'iceShot' as const };
const tr = (t: Record<string, number>) => {
  const o = new Map<number, Record<number, number>>();
  for (const [k, p] of Object.entries(t)) if (p > 0) o.set(treeOf(+k), { ...o.get(treeOf(+k)), [+k]: p });
  return o;
};
const apply = (talents: Record<string, number>, cores: number[], changes: any[]) => {
  const t = { ...talents }, c = [...cores];
  for (const ch of changes) {
    if (ch.kind === 'talent') { if (ch.points > 0) t[ch.node] = ch.points; else delete t[ch.node]; }
    else if (ch.action === 'add') c.push(ch.node); else c.splice(c.indexOf(ch.node), 1);
  }
  return { t, c };
};
const gen = (level = 94) => { const ctx = { prices: {} as any, level, notSearched: new Set<string>() }; return { moves: talentMoves(state, ctx), ctx }; };

describe('talent rules', () => {
  it('points at observed levels equal the captured totals (recomputed from the captures)', () => {
    for (const o of POINT_OBSERVATIONS) {
      const player = JSON.parse(readFileSync(`${pin}/captures/${o.capture}/pre/player.json`, 'utf8'));
      const t = JSON.parse(readFileSync(`${pin}/captures/${o.capture}/pre/talents.json`, 'utf8'));
      const total = Object.values(t).flatMap((n: any) => Object.values(n)).reduce((a: number, n: any) => a + (n.IsMapping ? 0 : n.Point), 0);
      expect(player.cfg.level, o.capture).toBe(o.level);
      expect(total, o.capture).toBe(o.points);
      expect(pointsAtLevel(o.level)).toBe(o.points);
    }
  });
  it('unobserved levels use the nearest / lower bounding observed value', () => {
    expect(pointsAtLevel(94)).toBe(108);
    expect(pointsAtLevel(60)).toBe(108);
    expect(pointsAtLevel(100)).toBe(108);
  });
  it('accepts the owner L94 allocation, per tree', () => {
    for (const [t, p] of tr(l94.talents)) expect(legalAllocation(t, p), `tree ${t}`).toBe(true);
  });
  it('rejects a node whose row needs more points than spent above it, and a node with a prerequisite below max', () => {
    expect(legalAllocation(34, { 34070100: 1 })).toBe(false);
    expect(legalAllocation(34, { 34010100: 3, 34020100: 2, 34030200: 1 })).toBe(false);
    expect(legalAllocation(34, { 34010100: 2, 34020100: 1 })).toBe(false); // prereq 34010100 not at max
  });
  it('offers per slot only the trees observed there (prisms.md:69)', () => {
    const s = treeSlotsAllowed(4001);
    expect(s).toEqual([[], [], [51], [12]]);
  });
});

describe('talent moves', () => {
  const { moves: base, ctx } = gen();
  const moves = [...base, ...talentMovesWith({ 2: [34, 10] })(state, { prices: {} as any, level: 94, notSearched: new Set() })];
  it('emits point, core and tree-swap moves (swap from a synthetic slot map), all free reconfigurations', () => {
    expect(moves.some(m => m.label.startsWith('Swap talent tree'))).toBe(true);
    expect(moves.some(m => m.label.startsWith('Swap core') || m.label.startsWith('Add core'))).toBe(true);
    expect(moves.some(m => m.label.startsWith('Move a point'))).toBe(true);
    for (const m of moves) { expect(m.acquisition).toBe(false); expect(m.costFE).toBe(0); }
  });
  it('every move keeps the allocation legal, within points, cores unlocked', () => {
    for (const m of moves) {
      const { t, c } = apply(l94.talents, l94.coreTalents, m.changes);
      for (const [tree, p] of tr(t)) expect(legalAllocation(tree, p), m.label).toBe(true);
      expect(Object.values(t).reduce((a: number, b: any) => a + b, 0), m.label).toBeLessThanOrEqual(Math.max(108, pointsAtLevel(94)));
      for (const core of c) {
        const need = treeCores(treeOf(core)).find(n => n.id === core)!.need;
        expect([...(tr(t).get(treeOf(core)) ? Object.values(tr(t).get(treeOf(core))!) : [])].reduce((a, b) => a + b, 0), m.label).toBeGreaterThanOrEqual(need);
      }
    }
  });
  it('tree swap drops the old tree cores and fills the new tree', () => {
    const m = moves.find(x => x.label === 'Swap talent tree 34 for tree 10')!;
    const { t, c } = apply(l94.talents, l94.coreTalents, m.changes);
    expect(Object.keys(t).some(k => treeOf(+k) === 34)).toBe(false);
    expect(c).not.toContain(34001200);
    expect(Object.keys(t).some(k => treeOf(+k) === 10)).toBe(true);
  });
  it('with the on-disk slot evidence, trees without an observed slot are not swapped and are listed', () => {
    expect(base.some(m => m.label.startsWith('Swap talent tree'))).toBe(false);
    expect([...ctx.notSearched].some(x => x.startsWith('tree swaps for tree 34'))).toBe(true);
  });
  it('lists the unported rules, inverse images included', () => {
    expect([...ctx.notSearched].some(x => x.startsWith('inverse images'))).toBe(true);
    expect(moves.some(m => m.kind === 'inverse')).toBe(false);
  });
  it('core moves offer only unlocked cores', () => {
    const low = { ...state, loadout: { ...l94, talents: { 34010100: 3 }, coreTalents: [] } };
    const cm = talentMoves(low, { prices: {} as any, level: 94, notSearched: new Set() }).filter(m => m.kind === 'core');
    expect(cm).toHaveLength(0);
  });
  it('every loadout in game/ without Inverse Image copies satisfies the row rule', () => {
    let checked = 0;
    for (const f of readdirSync(`${pin}/game`).filter(f => /^loadout_.*json$/.test(f))) {
      const l = JSON.parse(readFileSync(`${pin}/game/${f}`, 'utf8'));
      // a copy can stand in for an original (prisms.md (c)); those states are not checkable from `talents` alone
      if ((l.resolvedTalents?.talents ?? []).some((x: any) => String(x[2]).startsWith('talent:-'))) continue;
      for (const [t, p] of tr(l.talents ?? {})) expect(legalAllocation(t, p), `${f} tree ${t}`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });
});
