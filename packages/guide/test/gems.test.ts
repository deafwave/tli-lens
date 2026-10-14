import { describe, expect, it } from 'vitest';
import { gemMoves, supportsFor } from '../src/candidates/gems';
import type { Skill } from '../src/types';
import { GROUND, L100, L94, applyAll, fakePrices, loadout } from './apply';

const l100 = loadout(L100), l94 = loadout(L94);
const gen = (l: Record<string, unknown>, skill: Skill, prices: Record<string, number> = {}) => {
  const notSearched = new Set<string>();
  return { moves: gemMoves({ loadout: l, owned: [], fe: 0, level: 100, skill }, { prices: fakePrices(prices), level: 100, notSearched }), notSearched };
};
type Sup = { kind: string; action: string; socket: number; gem?: { sid: number; level: number; name: string } };
const sup = (m: { changes: unknown[] }) => m.changes[0] as Sup;
type Gem = { sid: number; level: number; place: { kind: string; slot: number; ownerKind?: string; ownerSlot?: number } };
const sockets = (l: Record<string, unknown>) => (l.skills as Gem[]).filter(g => g.place.kind === 'support' && g.place.ownerSlot === 0 && g.place.ownerKind === 'active');

describe('gemMoves', () => {
  it('emits only supports the SUP1 census compiles for the skill: Steamroll on Hammer of Ash, never on Ice Shot (G2 tag gate)', () => {
    const hoa = gen(l100, 'hoa').moves.filter(m => sup(m).gem).map(m => sup(m).gem!.name), ice = gen(l94, 'iceShot').moves.filter(m => sup(m).gem).map(m => sup(m).gem!.name);
    expect(hoa).toContain('Steamroll');
    expect(ice).not.toContain('Steamroll');
    expect(new Set(ice).size).toBeGreaterThan(10);
    const ok = new Set(supportsFor('iceShot').map(s => s.name));
    expect(ice.every(n => ok.has(n))).toBe(true);
  });
  it('never offers a support the skill already holds', () => {
    const held = new Set(sockets(l100).map(g => g.sid));
    expect(gen(l100, 'hoa').moves.every(m => !sup(m).gem || !held.has(sup(m).gem!.sid))).toBe(true);
  });
  it('replace keeps the socket\'s gem level, is priced by name (null when etor has no row), remove is free', () => {
    const { moves } = gen(l100, 'hoa', { Steamroll: 12 });
    const st = moves.find(m => sup(m).gem?.name === 'Steamroll' && sup(m).socket === 1)!;
    expect([sup(st).action, sup(st).gem!.level, st.acquisition, st.costFE]).toEqual(['replace', sockets(l100).find(g => g.place.slot === 1)!.level, true, 12]);
    expect(moves.find(m => sup(m).gem?.name === 'Multistrike')!.costFE).toBeNull();
    const rm = moves.find(m => sup(m).action === 'remove')!;
    expect([rm.acquisition, rm.costFE]).toEqual([false, 0]);
  });
  it('an empty socket gets install moves; replace, install and remove apply through dps-debug applyOtherChange', () => {
    const emptied = applyAll(l100, gen(l100, 'hoa').moves.find(m => sup(m).action === 'remove' && sup(m).socket === 5)!, GROUND.hoa);
    const inst = gen(emptied, 'hoa').moves.find(m => sup(m).action === 'install')!;
    expect(sup(inst).socket).toBe(5);
    expect(sockets(applyAll(emptied, inst, GROUND.hoa)).map(g => g.sid)).toContain(sup(inst).gem!.sid);
    const rep = gen(l100, 'hoa').moves.find(m => sup(m).action === 'replace')!;
    expect(sockets(applyAll(l100, rep, GROUND.hoa)).find(g => g.place.slot === sup(rep).socket)!.sid).toBe(sup(rep).gem!.sid);
  });
  it('a main skill that is not the state\'s skill is not searched', () => {
    const r = gen(l94, 'hoa');
    expect(r.moves).toEqual([]);
    expect([...r.notSearched].join()).toMatch(/is not hoa/);
  });
});
