import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { talentMoves } from '../src/candidates/talents';
import { legalAllocation, pointsAtLevel, treeCores, treeOf, treeSlotsAllowed } from '../src/talentRules';

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
  it('points at level are the sourced anchors', () => {
    expect(pointsAtLevel(60)).toBe(Math.round(107 * 59 / 99));
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
  it('offers any tree in each of 4 slots', () => { expect(treeSlotsAllowed(4001)).toHaveLength(4); expect(treeSlotsAllowed(4001)[0]).toContain(34); });
});

describe('talent moves', () => {
  const { moves, ctx } = gen();
  it('emits point, core and tree-swap moves, all free reconfigurations', () => {
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
