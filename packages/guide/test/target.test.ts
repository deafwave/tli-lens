import { describe, expect, it } from 'vitest';
import { dumpToItem } from '@dps/src/core/whatif';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pinRoot } from '../src/pin';
import { targetMoves } from '../src/candidates/target';
import type { Move, Skill } from '../src/types';
import { GROUND, L100, applyAll, fakePrices, loadout } from './apply';

const l100 = loadout(L100);
const gen = (l: Record<string, unknown>, skill: Skill = 'hoa', prices: Record<string, number> = {}) => {
  const notSearched = new Set<string>();
  return { moves: targetMoves({ loadout: l, owned: [], fe: 0, level: 100, skill }, { prices: fakePrices(prices), level: 100, notSearched }), notSearched };
};
const { moves, notSearched } = gen(l100);
const of = (k: string) => moves.filter(m => m.kind === k);
const applied = (m: Move) => { try { applyAll(l100, m, GROUND.hoa); return null; } catch (e) { return (e as Error).message; } };

describe('targetMoves', () => {
  it('offers gear and pacts as enabler acquisitions', () => {
    expect(of('gear').length).toBeGreaterThan(0);
    expect(of('pact').length).toBe(5);   // 19330 is already held in another slot
    expect(moves.every(m => m.acquisition && m.enabler && m.label.startsWith('Target: '))).toBe(true);
  });
  it('pacts are not on the market and unpriced even when etor names them', () => {
    expect(of('pact').every(m => m.costFE === null && m.market === 'not-on-market')).toBe(true);
  });
  it('every gear and pact move applies through dps-debug', () => {
    for (const m of [...of('gear'), ...of('pact')]) expect(applied(m), m.label).toBeNull();
  });
  it('a held piece is not offered again; kismets appear once their pact is held', () => {
    expect(of('kismet')).toEqual([]);
    const g = of('gear')[0], p = of('pact');
    const after = [g, ...p].reduce((l, m) => applyAll(l, m, GROUND.hoa), l100);
    const again = gen(after).moves;
    expect(again.find(m => m.label === g.label)).toBeUndefined();
    expect(again.filter(m => m.kind === 'pact').map(m => m.label.replace(/ \(.*/, ''))).toEqual(['Target: Twilight Sparks']);   // freed once slot 6 holds another servant
    expect(of('pact').some(m => /Twilight Sparks/.test(m.label))).toBe(false);
    const ks = again.filter(m => m.kind === 'kismet');
    expect(ks.length).toBeGreaterThan(0);
    for (const m of ks) expect(() => applyAll(after, m, GROUND.hoa), m.label).not.toThrow();
  });
  it('names slates, memories and vorax as not searched', () => {
    expect([...notSearched].some(n => /slates/.test(n)) && [...notSearched].some(n => /hero memories/.test(n))).toBe(true);
  });
  it('Ice Shot states get no target moves', () => {
    expect(gen(loadout('game/loadout_l94-20261013-160234.json'), 'iceShot').moves).toEqual([]);
  });
  const tg = JSON.parse(readFileSync(join(pinRoot(), 're/evidence/loadout_probuild-hanshansi-bing.json'), 'utf8')) as { gear: { label: string; affixes: { id: number; dyn: number[] }[] }[] };
  const pairs = (a: { id: number; dyn: number[] }[]) => JSON.stringify(a.map(x => [x.id, x.dyn]).sort());
  const gearItem = (m: Move) => (m.changes[0] as unknown as { slot: string; item: Parameters<typeof dumpToItem>[0] });
  it('each gear move carries exactly the target item affixes (dumpToItem round trip)', () => {
    for (const m of of('gear')) {
      const { slot, item } = gearItem(m), t = tg.gear.find(g => g.label === item.baseName)!;
      expect(pairs(dumpToItem(item, slot).affixes.map(a => ({ id: a.id, dyn: a.dyn }))), m.label).toBe(pairs(t.affixes));
    }
  });
  it('a legendary with a fixed affix keeps it under modifiers.fixed', () => {
    expect(of('gear').some(m => (gearItem(m).item.modifiers.fixed?.length ?? 0) > 0)).toBe(true);
  });
  it('a legendary is priced by its gold item, a rare is unpriced with a note', () => {
    const priced = targetMoves({ loadout: l100, owned: [], fe: 0, level: 100, skill: 'hoa' }, { prices: { season: 't', fetchedAt: 't', price: k => (typeof k === 'string' ? 5 : null) }, level: 100, notSearched: new Set() }).filter(m => m.kind === 'gear');
    const gold = priced.filter(m => m.costFE === 5), rare = priced.filter(m => m.costFE === null);
    expect(gold.length).toBeGreaterThan(0);
    expect(rare.length).toBeGreaterThan(0);
    expect(rare.every(m => m.costNote === 'rare: its affixes have no market price')).toBe(true);
  });
  it('a move dps-debug rejects is skipped and named', () => {
    const noBelt = { ...l100, gear: (l100.gear as { slot: string }[]).filter(g => g.slot !== 'belt') };
    const r = gen(noBelt);
    expect(r.moves.some(m => /Waistguard/.test(m.label))).toBe(false);
    expect([...r.notSearched].some(n => /^target Dragon Scale Waistguard: /.test(n))).toBe(true);
  });
});
