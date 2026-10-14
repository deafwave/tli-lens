import { describe, expect, test } from 'vitest';
import { DEFAULT_KNOBS, newMem, path, rankable, resolve, step } from '../src/search';
import type { Change, Evaluator, Figure, GenCtx, Generator, Move, State } from '../src/types';

// Stub: a loadout is { labels }; a change is { label }. Label "+x%" multiplies by 1+x/100; "E" + "R" together multiply by 3;
// "bad" drops piece "p".
type L = { labels: string[] };
const ch = (label: string) => ({ label }) as unknown as Change;
function figureOf(labels: string[]): Figure {
  let v = 100;
  for (const l of labels) { const m = /^\+(\d+)%/.exec(l); if (m) v *= 1 + Number(m[1]) / 100; }
  if (labels.includes('E') && labels.includes('R')) v *= 3;
  return { life100: v, life0: v, kill: v, partial: labels.includes('bad') ? ['p'] : [] };
}
function stub() {
  const calls: string[] = [];
  const ev: Evaluator = {
    pin: 'stub', async close() {},
    async run(loadout, changes, ctx) {
      calls.push(JSON.stringify([(loadout as L).labels, changes, ctx]));
      const labels = [...(loadout as L).labels, ...changes.map((c) => (c as unknown as { label: string }).label)];
      return { loadout: { labels }, figure: figureOf(labels), dropped: [] };
    },
  };
  return { ev, calls };
}
const mv = (label: string, o: Partial<Move> = {}): Move => ({ kind: 'gear', label, acquisition: true, costFE: 1, minLevel: 0, changes: [ch(label)], ...o });
const rc = (label: string): Move => mv(label, { acquisition: false, costFE: 0 });
const state = (o: Partial<State> = {}): State => ({ loadout: { labels: [] }, owned: [], fe: 1000, level: 100, skill: 'iceShot', ...o });
const ctx = (): GenCtx => ({ prices: { season: 's', fetchedAt: 'x', price: () => null }, level: 100, notSearched: new Set() });
const fixed = (...ms: Move[]): Generator => () => ms;
const once = (m: Move): Generator => (s) => ((s.loadout as L).labels.includes(m.label) ? [] : [m]);
const base = figureOf([]);
const K = DEFAULT_KNOBS;

test('rankable rejects a figure that dropped a new piece', () => {
  const b = { life100: 1, life0: 1, kill: 1, partial: ['a'] };
  expect(rankable(b, { ...b, partial: ['a'] })).toBe(true);
  expect(rankable(b, { ...b, partial: ['a', 'b'] })).toBe(false);
  expect(rankable(b, { ...b, partial: [], stop: 'x' })).toBe(false);
});

describe('step', () => {
  test('takes the best gain per FE and records the step', async () => {
    const r = await step(state(), base, stub().ev, [fixed(mv('+10%', { costFE: 1 }), mv('+30%', { costFE: 10 }), mv('+5%', { costFE: 1 }))], [], ctx(), K);
    expect(r!.step.move.label).toBe('+10%');
    expect(r!.step.before).toBe(base);
    expect(r!.step.after.kill).toBeCloseTo(110);
    expect(r!.step.triggered).toEqual([]);
    expect(r!.step.cumFE).toBe(1);
    expect(r!.state.fe).toBe(999);
  });

  test('a free owned-item move beats any paid move and is consumed', async () => {
    const owned = [{ itemId: 'i1' }] as State['owned'];
    const r = await step(state({ owned }), base, stub().ev, [fixed(mv('+50%', { costFE: 1 }), mv('+1%', { costFE: 0, consumes: 'i1' }))], [], ctx(), K);
    expect(r!.step.move.label).toBe('+1%');
    expect(r!.state.owned).toEqual([]);
    expect(r!.state.fe).toBe(1000);
  });

  test('churn gate: +4% reconfiguration not taken, +6% taken', async () => {
    const acq = fixed(mv('+10%'));
    const lo = await step(state(), base, stub().ev, [acq], [once(rc('+4%'))], ctx(), K);
    expect(lo!.step.triggered).toEqual([]);
    const hi = await step(state(), base, stub().ev, [acq], [once(rc('+6%'))], ctx(), K);
    expect(hi!.step.triggered.map((m) => m.label)).toEqual(['+6%']);
    expect(hi!.step.after.kill).toBeCloseTo(100 * 1.1 * 1.06);
  });

  test('resolve is best-improvement hill climb capped by maxRounds', async () => {
    const r = await resolve(state(), stub().ev, [fixed(rc('+6%'), rc('+20%'))], ctx(), { ...K, maxRounds: 2 });
    expect(r.taken.map((m) => m.label)).toEqual(['+20%', '+20%']);
    expect(r.figure.kill).toBeCloseTo(144);
  });

  test('an enabler whose value appears after a reconfiguration beats a bigger plain gain', async () => {
    const r = await step(state(), base, stub().ev, [fixed(mv('+20%'), mv('E', { enabler: true }))], [fixed(rc('R'))], ctx(), K);
    expect(r!.step.move.label).toBe('E');
    expect(r!.step.triggered.map((m) => m.label)).toEqual(['R']);
    expect(r!.step.after.kill).toBeCloseTo(300);
  });

  test('unpriced is listed, never taken; non-rankable is reported, never taken', async () => {
    const mem = newMem();
    const bad = mv('bad', { changes: [ch('bad'), ch('+80%')] });
    const r = await step(state(), base, stub().ev, [fixed(mv('+90%', { costFE: null }), bad, mv('+2%'))], [], ctx(), K, mem);
    expect(r!.step.move.label).toBe('+2%');
    expect([...mem.unpriced]).toEqual(['+90%']);
    expect([...mem.notCalculable].join()).toContain('bad: dropped p');
  });

  test('a move above the hero level is never evaluated', async () => {
    const { ev, calls } = stub();
    const r = await step(state({ level: 60 }), base, ev, [fixed(mv('+50%', { minLevel: 61 }), mv('+1%'))], [], ctx(), K);
    expect(r!.step.move.label).toBe('+1%');
    expect(calls.some((c) => c.includes('+50%'))).toBe(false);
  });

  test('budgetFE excludes moves that cost more than the remaining FE', async () => {
    const k = { ...K, budgetFE: 10 };
    const r = await step(state(), base, stub().ev, [fixed(mv('+50%', { costFE: 100 }), mv('+1%', { costFE: 5 }))], [], ctx(), k);
    expect(r!.step.move.label).toBe('+1%');
    expect(await step(state(), base, stub().ev, [fixed(mv('+50%', { costFE: 100 }))], [], ctx(), k)).toBeNull();
  });

  test('never evaluates the same (loadout, changes, ctx) twice in a step', async () => {
    const { ev, calls } = stub();
    await step(state(), base, ev, [fixed(mv('+10%'), mv('+10%b', { changes: [ch('+10%')] }), mv('E', { enabler: true }))], [fixed(rc('R'))], ctx(), K);
    expect(new Set(calls).size).toBe(calls.length);
  });

  test('lazy greedy does not re-evaluate stale low scores', async () => {
    const { ev, calls } = stub();
    const mem = newMem();
    const ms = [mv('+10%'), mv('+9%'), mv('+1%'), mv('+2%')];
    const k = { ...K, topK: 1 };
    const s1 = await step(state(), base, ev, [fixed(...ms)], [], ctx(), k, mem);
    const n = calls.length;
    await step(s1!.state, s1!.step.after, ev, [fixed(...ms.slice(1))], [], ctx(), k, mem);
    expect(calls.length - n).toBeLessThan(ms.length - 1);
  });
});

describe('path', () => {
  const ms = [mv('+10%'), mv('+20%', { costFE: 4 }), mv('+3%')];
  const gen: Generator = (s) => ms.filter((m) => !(s.loadout as L).labels.includes(m.label));
  const run = (k = K) => path(state(), stub().ev, [gen], [], () => ctx(), k);

  test('runs until nothing improves and accumulates FE', async () => {
    const r = await run();
    expect(r.steps.map((x) => x.move.label)).toEqual(['+10%', '+20%', '+3%']);
    expect(r.steps.map((x) => x.cumFE)).toEqual([1, 5, 6]);
    expect(r.start).toEqual(base);
  });

  test('stops at maxSteps and at targetKill', async () => {
    expect((await run({ ...K, maxSteps: 1 })).steps).toHaveLength(1);
    expect((await run({ ...K, targetKill: 105 })).steps).toHaveLength(1);
  });

  test('reports unpriced and the generators notSearched union', async () => {
    const c = ctx();
    const g: Generator = (_s, cx) => { cx.notSearched.add('rule X not ported'); return [mv('?', { costFE: null })]; };
    const r = await path(state(), stub().ev, [g], [], () => c, K);
    expect(r.unpriced).toEqual(['?']);
    expect(r.notSearched).toEqual(['rule X not ported']);
    expect(r.steps).toEqual([]);
  });

  test('a switch move changes state.skill and later candidates come from the new skill', async () => {
    const g: Generator = (s) => s.skill === 'iceShot'
      ? [mv('switch', { kind: 'switch', skill: 'hoa', changes: [ch('+10%')] })]
      : (s.loadout as L).labels.includes('+7%') ? [] : [mv('+7%')];
    const r = await path(state(), stub().ev, [g], [], () => ctx(), K);
    expect(r.steps.map((x) => x.move.label)).toEqual(['switch', '+7%']);
  });
});
