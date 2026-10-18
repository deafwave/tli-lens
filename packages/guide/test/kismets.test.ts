import { describe, expect, it } from 'vitest';
import { DESTINY_CAP, kismetMoves, pointName, pointProbes } from '../src/candidates/kismets';
import { table } from '../src/pin';
import { GROUND, L100, applyAll, fakePrices, loadout } from './apply';

const l100 = loadout(L100);   // kismets on 103 104 108 305 307, Undetermined Fates on 111 [1,1] and 211 [2]; 311 is a free Fate slot
const run = (l: Record<string, unknown>, prices: Record<string, number> = {}, pointCost?: Map<number, number>) => {
  const notSearched = new Set<string>();
  return { moves: kismetMoves({ loadout: l, owned: [], fe: 0, level: 100, skill: 'hoa' }, { prices: fakePrices(prices), level: 100, notSearched, ...(pointCost ? { pointCost } : {}) }), notSearched };
};
const ch = (m: { changes: unknown[] }) => m.changes[0] as { kind: string; action: string; point: number; modifierId?: number; rolls?: number[]; baseId?: number; extra?: number[] };
type K = { node: number; modifierId: number | null };
const plain = (m: { changes: unknown[] }, a: string) => ch(m).kind === 'kismet' && ch(m).action === a;

describe('pointName', () => {
  it('names a contract point as the page shows it: the pact, then group-position along the path, three to a group (owner, 2026-10-17: 101 102 107 103 104 108 105 106 109 110 111)', () => {
    const order = [101, 102, 107, 103, 104, 108, 105, 106, 109, 110, 111].map((n) => pointName(n));
    expect(order).toEqual(['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2']);
    expect(pointName(307, 'Kong')).toBe('Kong 1-3');
  });
});

describe('kismetMoves', () => {
  it('a size at its Destiny cap is offered no socket, only replacements (owner, 2026-10-18: Medium Destiny 4/4, the plan socketed three more Kismet: Giant)', () => {
    const cp = table<{ rows: Record<string, { i10?: number }> }>('config_contract_point').rows, mid = (n: number) => cp[n]?.i10 === 2;
    const kis = l100.kismets as K[], free = (l100.contractKeys as number[]).filter((n) => mid(n) && !kis.some((k) => k.node === n));
    const fill = free.slice(0, DESTINY_CAP[2] - kis.filter((k) => mid(k.node)).length).map((node) => ({ modifierId: 100350305, servantId: null, node, rolls: [34] }));
    const sock = (l: Record<string, unknown>) => run(l).moves.filter((m) => plain(m, 'socket') && mid(ch(m).point));
    expect(sock(l100).length).toBeGreaterThan(0);
    const full = { ...l100, kismets: [...kis, ...fill] }, { moves } = run(full);
    expect(sock(full)).toEqual([]);
    expect(moves.some((m) => plain(m, 'replace') && mid(ch(m).point))).toBe(true);
  });
  const { moves, notSearched } = run(l100, { 'Micro Fate: Fire Resistance': 7, 'Undetermined Fate': 50 });
  it('labels a point by its pact and place, never its id', () => {
    expect(moves.every((m) => !/contract point \d/.test(m.label) && / \d-\d\b/.test(m.label))).toBe(true);
  });
  it('sockets only free small / middle points of an equipped pact, replaces and removes only held kismets', () => {
    const held = new Set((l100.kismets as K[]).map(k => k.node));
    for (const m of moves.filter(x => plain(x, 'socket'))) expect(held.has(ch(m).point), m.label).toBe(false);
    for (const m of moves.filter(x => plain(x, 'replace') || plain(x, 'remove'))) expect(held.has(ch(m).point), m.label).toBe(true);
    expect(moves.some(m => ch(m).point === 110 || ch(m).point === 310)).toBe(false);   // big points are not searched
    expect([...notSearched].join()).toMatch(/big points/);
  });
  it('socket and replace are acquisitions priced by English name (null when etor has no row); remove is free', () => {
    const fire = moves.find(m => m.label.startsWith('Socket Micro Fate: Fire Resistance'))!;
    expect([fire.acquisition, fire.costFE]).toEqual([true, 7]);
    expect(moves.find(m => m.label.startsWith('Socket Micro Fate: Mana'))!.costFE).toBeNull();
    const rm = moves.find(m => plain(m, 'remove'))!;
    expect([rm.acquisition, rm.costFE]).toEqual([false, 0]);
  });
  it('no two moves have identical changes', () => {
    const keys = moves.map(m => JSON.stringify(m.changes));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('hero-level gate: minLevel is the kismet base level (config_item_base i3c), which is 0 for every kismet, so none is withheld at level 0', () => {
    const low = kismetMoves({ loadout: l100, owned: [], fe: 0, level: 0, skill: 'hoa' }, { prices: fakePrices({}), level: 0, notSearched: new Set() });
    expect(low.length).toBe(moves.length);
    expect(moves.every(m => m.minLevel === 0)).toBe(true);
  });
  it('rolls are finite numbers from the catalog ranges', () => {
    expect(moves.filter(m => plain(m, 'socket')).every(m => ch(m).rolls!.every(Number.isFinite))).toBe(true);
  });
  it('socket, replace and remove apply through dps-debug applyOtherChange', () => {
    const sock = moves.find(m => plain(m, 'socket'))!, rep = moves.find(m => plain(m, 'replace'))!, rm = moves.find(m => plain(m, 'remove'))!;
    const at = (l: Record<string, unknown>, p: number) => (l.kismets as K[]).find(k => k.node === p);
    expect(at(applyAll(l100, sock, GROUND.hoa), ch(sock).point)!.modifierId).toBe(ch(sock).modifierId);
    expect(at(applyAll(l100, rep, GROUND.hoa), ch(rep).point)!.modifierId).toBe(ch(rep).modifierId);
    expect(at(applyAll(l100, rm, GROUND.hoa), ch(rm).point)).toBeUndefined();
  });
  it('Undetermined Fate: installed on the free Fate slot only with an extra-point list the loadout shows; both install and remove are enablers', () => {
    const inst = moves.filter(m => ch(m).kind === 'fate' && ch(m).action === 'install');
    expect(inst.map(m => [ch(m).point, ch(m).baseId, JSON.stringify(ch(m).extra)]).sort()).toEqual([[311, 350900, '[1,1]'], [311, 350900, '[2]']]);
    expect(inst.every(m => m.enabler && m.acquisition && m.costFE === 50)).toBe(true);
    expect((applyAll(l100, inst[0], GROUND.hoa).kismets as K[]).some(k => k.node === 311)).toBe(true);
    const rm = moves.filter(m => ch(m).kind === 'fate' && ch(m).action === 'remove');
    expect(rm.length).toBe(2);
    expect(rm.every(m => m.enabler && !m.acquisition && m.costFE === 0)).toBe(true);
    expect((applyAll(l100, rm[0], GROUND.hoa).kismets as K[]).some(k => k.node === ch(rm[0]).point)).toBe(false);
  });
  it('a Fate whose extra points hold a kismet is not offered for removal', () => {
    const l = { ...l100, kismets: [...(l100.kismets as object[]), { modifierId: 100350007, servantId: null, node: 112, rolls: [13] }] };
    expect(run(l).moves.filter(m => ch(m).kind === 'fate' && ch(m).action === 'remove').map(m => ch(m).point)).toEqual([211]);
  });
  it('Dual Kismets are sets (ActiveNum 2): a missing pair is one move of two sockets at twice the price; a complete pair gets no third copy', () => {
    const MIGHTY = 100350734, SPINDLE = 100350742, adds = (m: { changes: unknown[] }, id: number) => m.changes.some(c => (c as { modifierId?: number }).modifierId === id);
    const { moves: ms } = run(l100, { 'Dual Kismet: Spindle': 30 });
    const spindle = ms.filter(m => adds(m, SPINDLE));
    expect(spindle).toHaveLength(1);
    const pts = spindle[0].changes.map(c => (c as { point: number }).point);
    expect([spindle[0].changes.length, new Set(pts).size, spindle[0].costFE]).toEqual([2, 2, 60]);
    expect(pts.every(p => !(l100.kismets as K[]).some(k => k.node === p))).toBe(true);
    expect(ms.some(m => adds(m, MIGHTY))).toBe(false);   // 108 + 307 hold the pair
    const at = (l: Record<string, unknown>, p: number) => (l.kismets as K[]).find(k => k.node === p)?.modifierId;
    const done = applyAll(l100, spindle[0], GROUND.hoa);
    expect(pts.map(p => at(done, p))).toEqual([SPINDLE, SPINDLE]);
  });
  it('with one copy of a Dual Kismet held, the second is a single socket or replace (it completes the set)', () => {
    const one = { ...l100, kismets: (l100.kismets as K[]).filter(k => k.node !== 307) };
    const mighty = run(one).moves.filter(m => m.changes.some(c => (c as { modifierId?: number }).modifierId === 100350734));
    expect(mighty.length).toBeGreaterThan(0);
    expect(mighty.every(m => m.changes.length === 1 && /^(Socket|Replace)/.test(m.label))).toBe(true);
  });
  it('pointProbes: one socket per free small / middle point, of a Dual Kismet the build holds none of (one copy grants nothing)', () => {
    const probes = pointProbes({ loadout: l100, owned: [], fe: 0, level: 100, skill: 'hoa' });
    const held = new Set((l100.kismets as K[]).map(k => k.node)), mods = new Set(probes.map(p => ch(p).modifierId));
    expect(probes.length).toBeGreaterThan(0);
    expect(probes.every(p => !held.has(p.point) && ch(p).point === p.point && ch(p).action === 'socket')).toBe(true);
    expect(mods.size).toBe(1);
    expect([...mods][0]).not.toBe(100350734);   // Mighty Arrow: l100 holds the pair
    expect(probes.map(p => p.point)).toEqual(expect.arrayContaining([105, 106, 109, 201, 207, 301, 308]));
  });
  it('with point costs, a kismet goes on the cheapest free point of each area and a set on the cheapest points of its size', () => {
    const cost = new Map([[109, 0.99], [207, 0.98], [208, 0.95], [209, 0.97], [308, 0.9]]);
    const { moves: ms } = run(l100, {}, cost);
    const middle = new Set(ms.filter(m => plain(m, 'socket') && m.changes.length === 1 && /Medium Fate/.test(m.label)).map(m => ch(m).point));
    expect([...middle].sort()).toEqual([109, 207, 308]);   // area 2: 207 (0.98) over 209 and 208
    const set = ms.find(m => m.changes.length === 2)!;
    expect(set.changes.map(c => (c as { point: number }).point)).toEqual([109, 207]);
  });
  it('the planner-file schema (servant page nodes) is not searched', () => {
    const r = run(loadout('re/evidence/loadout_probuild-hanshansi-bing.json'));
    expect(r.moves).toEqual([]);
    expect([...r.notSearched].join()).toMatch(/servant page node/);
  });
});
