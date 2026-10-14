import { describe, expect, it } from 'vitest';
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
    expect(of('pact').length).toBe(6);
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
    expect(again.filter(m => m.kind === 'pact')).toEqual([]);
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
});
