import { mkdirSync, mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { applyPatch, type LoadoutPatch } from '../src/patches';
import { killAverage } from '../src/kill';
import { pinRoot } from '../src/pin';
import { applyInOrder } from '../src/engine/apply';
import { type Knobs, overBudget, rankable } from '../src/search';
import { writeAtomic } from '../src/atomic';
import { createEvaluator, DEFAULT_FIGHT, INFO, WorkerDied, type Job, type JobResult, type WorkerLike } from '../src/engine/pool';
import type { Change } from '../src/types';
import { realSkip } from './real';

const fig = (life100: number, life0: number, extra: Partial<JobResult['fig']> = {}) => ({ life100, life0, left: [], needs: [], ...extra });
/** stub worker: records jobs; `f` decides the figure (throwing = dps-debug throwing, reported as a rejection) */
function stub(f: (j: Job) => JobResult['fig'] = () => fig(200, 100), delay = 0) {
  const jobs: Job[] = []; let active = 0, peak = 0;
  const factory = (): WorkerLike => ({
    ready: Promise.resolve(),
    async run(j) {
      jobs.push(j); peak = Math.max(peak, ++active);
      try { await new Promise(r => setTimeout(r, delay)); return { loadout: j.loadout, dropped: ['x'], fig: f(j) }; } finally { active--; }
    },
    async close() {},
  });
  return { factory, jobs, peak: () => peak };
}
const ctx = { level: 100, skill: 'hoa' } as const;
const lo = { a: 1 };
const ch = [{ kind: 'stub' }] as unknown as Change[];

describe('evaluator (stub workers)', () => {
  it('maps the figure: kill = killAverage, partial = left + needs, dropped passes through', async () => {
    const s = stub(() => ({ life100: 200, life0: 100, left: ['L'], needs: ['N'] }));
    const ev = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p' });
    const r = await ev.run(lo, [], ctx);
    expect(r.figure).toEqual({ life100: 200, life0: 100, kill: killAverage(200, 100), partial: ['L', 'N'] });
    expect(r.dropped).toEqual(['x']);
  });
  it('informational price: notes are not omissions: figures differing only in them are rankable', async () => {
    const node = 'not in this figure: node 3030 - affix class x';
    const mk = (n: number) => () => ({ life100: 200, life0: 100, left: [], needs: [`price: roll space of ${n} joint rolls priced by the affine closed form`, node, `price: roll space of ${n + 1} joint rolls`] });
    const ev = await createEvaluator({ factory: stub(mk(5)).factory, workers: 1, pin: 'p' });
    const ev2 = await createEvaluator({ factory: stub(mk(7)).factory, workers: 1, pin: 'p' });
    const a = (await ev.run(lo, [], ctx)).figure, b = (await ev2.run(lo, [], ctx)).figure;
    expect(a.partial).toEqual([node]);
    expect(rankable(a, b)).toBe(true);
    expect(INFO[0]).toBe('price:');
  });
  it('held buff "not carried" lines are informational; "left off" stays an omission', async () => {
    const off = 'held buffs left off: 11210';
    const ev = await createEvaluator({ factory: stub(() => ({ life100: 200, life0: 100, left: [], needs: ['held buff 390 (zhanyi) not carried: no piece of this build adds it', off, 'price: x'] })).factory, workers: 1, pin: 'p' });
    expect((await ev.run(lo, [], ctx)).figure.partial).toEqual([off]);
  });
  it('memo: same call runs once (also concurrently, key order irrelevant); another pin or level never hits it', async () => {
    const s = stub(undefined, 5);
    const a = await createEvaluator({ factory: s.factory, workers: 2, pin: 'p1' });
    await Promise.all([a.run({ a: 1, b: 2 }, ch, ctx), a.run({ b: 2, a: 1 }, ch, ctx)]);
    await a.run({ a: 1, b: 2 }, ch, ctx);
    expect(s.jobs).toHaveLength(1);
    const b = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p2' });
    await b.run({ a: 1, b: 2 }, ch, ctx);
    expect(s.jobs).toHaveLength(2);
    await a.run({ a: 1, b: 2 }, ch, { level: 99, skill: 'hoa' });
    expect(s.jobs).toHaveLength(3);
  });
  it('disk memo is written for a clean pin and never for +dirty', async () => {
    for (const [pin, files] of [['abc', 1], ['abc+dirty', 0]] as const) {
      const dir = mkdtempSync(join(tmpdir(), 'memo-'));
      const ev = await createEvaluator({ factory: stub().factory, workers: 1, pin, memoDir: dir });
      await ev.run(lo, [], ctx);
      expect(readdirSync(dir)).toHaveLength(files);
      if (files) { // a fresh evaluator reads it back without running
        const s = stub();
        await (await createEvaluator({ factory: s.factory, workers: 1, pin, memoDir: dir })).run(lo, [], ctx);
        expect(s.jobs).toHaveLength(0);
        expect(JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]), 'utf8')).figure.kill).toBe(killAverage(200, 100));
      }
    }
  });
  it('fight inputs: workers get them (default bombs 10); evaluators with different fight never share a memo entry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memo-'));
    const s = stub();
    const mk = (fight?: { bombs?: number }) => createEvaluator({ factory: s.factory, workers: 1, pin: 'abc', memoDir: dir, ...(fight ? { fight } : {}) });
    const [d, five, again] = [await mk(), await mk({ bombs: 5 }), await mk({ bombs: 5 })];
    await d.run(lo, [], ctx); await five.run(lo, [], ctx); await again.run(lo, [], ctx);
    expect(s.jobs.map(j => j.fight)).toEqual([DEFAULT_FIGHT, { bombs: 5 }]);
    expect(d.fight).toEqual({ bombs: 10, inputs: { 'castLogSum id=10000000 window=4s tags=[[],[],[],[]]': 0 } });
    expect(d.fightNote).toBe('training dummy stands still (dps-debug STILL / e2e1-lib.ts)');
    // same bombs, different named input: its own entry too
    await (await mk({ bombs: 5, inputs: { x: 1 } })).run(lo, [], ctx);
    expect(readdirSync(dir)).toHaveLength(3);
  });
  it('a throwing job returns figure.stop with the message; the pool stays alive', async () => {
    const f = stub().factory;
    const ev = await createEvaluator({ workers: 1, pin: 'p', factory: () => {
      const w = f();
      return { ...w, run: async j => { if ((j.loadout as any).bad) throw new Error('boom: not a thing'); return w.run(j); } };
    } });
    const bad = await ev.run({ bad: true }, ch, ctx);
    expect(bad.figure).toMatchObject({ life100: 0, life0: 0, kill: 0, stop: 'boom: not a thing' });
    expect(bad.loadout).toEqual({ bad: true });
    expect((await ev.run(lo, [], ctx)).figure.stop).toBeUndefined();
  });
  it('a figure stop propagates as figure.stop', async () => {
    const ev = await createEvaluator({ factory: stub(() => fig(0, 0, { stop: 'not ported: Ice Shot build entry' })).factory, workers: 1, pin: 'p' });
    expect((await ev.run(lo, [], { level: 94, skill: 'iceShot' })).figure.stop).toMatch(/not ported/);
  });
  it('queues: never more jobs at once than workers', async () => {
    const s = stub(undefined, 5);
    const ev = await createEvaluator({ factory: s.factory, workers: 3, pin: 'p' });
    await Promise.all(Array.from({ length: 40 }, (_, i) => ev.run({ i }, [], ctx)));
    expect(s.jobs).toHaveLength(40);
    expect(s.peak()).toBe(3);
  });
});

describe('busy file', () => {
  it('starts no job while the file exists, keeps queue order, and resumes when it is removed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'busy-')), busyFile = join(dir, 'game.busy');
    writeFileSync(busyFile, '');
    const s = stub(), events: boolean[] = [];
    const ev = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p', busyFile, busyPollMs: 10, onBusy: p => events.push(p) });
    const runs = [1, 2, 3].map(n => ev.run({ n }, [], ctx));
    await new Promise(r => setTimeout(r, 80));
    expect(s.jobs).toHaveLength(0);
    expect(events).toEqual([true]);
    rmSync(busyFile);
    await Promise.all(runs);
    expect(s.jobs.map(j => (j.loadout as { n: number }).n)).toEqual([1, 2, 3]);
    expect(events).toEqual([true, false]);
  });
  it('a file that appears later pauses the next job, and null disables the check', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'busy-')), busyFile = join(dir, 'game.busy');
    const s = stub();
    const ev = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p', busyFile, busyPollMs: 10 });
    await ev.run({ n: 1 }, [], ctx);
    writeFileSync(busyFile, '');
    const p = ev.run({ n: 2 }, [], ctx);
    await new Promise(r => setTimeout(r, 60));
    expect(s.jobs).toHaveLength(1);
    rmSync(busyFile); await p;
    expect(s.jobs).toHaveLength(2);
    writeFileSync(busyFile, '');
    const off = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p', busyFile: null });
    await off.run({ n: 3 }, [], ctx);
    expect(s.jobs).toHaveLength(3);
  });
});

describe('busy file: retry, env, close, paused time', () => {
  const tmpBusy = () => join(mkdtempSync(join(tmpdir(), 'busy-')), 'game.busy');
  it('a retry after WorkerDied waits for the busy file too', async () => {
    const busyFile = tmpBusy(), s = stub(); let made = 0;
    const ev = await createEvaluator({ workers: 1, pin: 'p', busyFile, busyPollMs: 10, factory: () => {
      const id = made++, w = s.factory();
      return id === 0 ? { ...w, run: async () => { writeFileSync(busyFile, ''); throw new WorkerDied('boom'); } } : w;
    } });
    const p = ev.run(lo, [], ctx);
    await new Promise(r => setTimeout(r, 80));
    expect(s.jobs).toHaveLength(0);
    rmSync(busyFile);
    await p;
    expect(s.jobs).toHaveLength(1);
  });
  it('GUIDE_BUSY_FILE overrides the default', async () => {
    const busyFile = tmpBusy(); writeFileSync(busyFile, '');
    process.env.GUIDE_BUSY_FILE = busyFile;
    try {
      const s = stub();
      const ev = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p', busyPollMs: 10 });
      const p = ev.run(lo, [], ctx);
      await new Promise(r => setTimeout(r, 60));
      expect(s.jobs).toHaveLength(0);
      rmSync(busyFile); await p;
    } finally { delete process.env.GUIDE_BUSY_FILE; }
  });
  it('close() ends a pause without a resume event; paused time is tracked', async () => {
    const busyFile = tmpBusy(); writeFileSync(busyFile, '');
    const events: boolean[] = [];
    const ev = await createEvaluator({ factory: stub().factory, workers: 1, pin: 'p', busyFile, busyPollMs: 60_000, onBusy: p => events.push(p) });
    const p = ev.run(lo, [], ctx).catch(e => e);
    await new Promise(r => setTimeout(r, 30));
    expect(ev.pausedMs!()).toBeGreaterThan(0);
    await ev.close();
    await p;
    expect(events).toEqual([true]);
  });
  it('paused time is subtracted from the budget', async () => {
    const busyFile = tmpBusy(); writeFileSync(busyFile, '');
    let clock = 0;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      const ev = await createEvaluator({ factory: stub().factory, workers: 1, pin: 'p', busyFile, busyPollMs: 5 });
      const p = ev.run(lo, [], ctx);
      await new Promise(r => setTimeout(r, 30));
      clock = 10 * 60_000;
      expect(ev.pausedMs!()).toBe(10 * 60_000);
      expect(overBudget({ budgetMinutes: 5 } as Knobs, 0, ev)).toBe(false);
      expect(overBudget({ budgetMinutes: 5 } as Knobs, 0)).toBe(true);
      rmSync(busyFile); await p;
      expect(ev.pausedMs!()).toBe(10 * 60_000);
    } finally { spy.mockRestore(); }
  });
});

describe('writeAtomic', () => {
  it('writes via temp + rename, retries a failing rename, and cleans up when it keeps failing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atomic-')), f = join(dir, 'g.json');
    expect(writeAtomic(f, '{"a":1}')).toBe(true);
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ a: 1 });
    expect(readdirSync(dir)).toEqual(['g.json']);
    // a directory at the target makes rename fail (EPERM/EISDIR): returns false, no temp left, run not aborted
    const bad = join(dir, 'd'); mkdirSync(bad);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try { expect(writeAtomic(bad, 'x', 2, 1)).toBe(false); expect(warn).toHaveBeenCalled(); } finally { warn.mockRestore(); }
    expect(readdirSync(dir).sort()).toEqual(['d', 'g.json']);
  });
});

describe('worker death, startup, close', () => {
  it('a worker that dies mid-job is replaced, the job retried once, later jobs succeed', async () => {
    let made = 0, closedWorkers = 0;
    const ev = await createEvaluator({ workers: 1, pin: 'p', factory: () => {
      const id = made++, w = stub().factory();
      return { ...w, close: async () => { closedWorkers++; }, run: async j => { if (id === 0) throw new WorkerDied('exit 1'); return w.run(j); } };
    } });
    expect((await ev.run({ a: 1 }, [], ctx)).figure.stop).toBeUndefined();
    expect(made).toBe(2); expect(closedWorkers).toBe(1);
    expect((await ev.run({ a: 2 }, [], ctx)).figure.stop).toBeUndefined();
  });
  it('a crash-derived stop (retry also dies) is returned but never cached', async () => {
    let dying = true, runs = 0;
    const ev = await createEvaluator({ workers: 1, pin: 'p', factory: () => ({
      ready: Promise.resolve(), close: async () => {},
      run: async j => { runs++; if (dying) throw new WorkerDied('exit 1'); return { loadout: j.loadout, dropped: [], fig: fig(200, 100) }; },
    }) });
    expect((await ev.run(lo, [], ctx)).figure.stop).toBe('exit 1');
    expect(runs).toBe(2);
    dying = false;
    expect((await ev.run(lo, [], ctx)).figure.stop).toBeUndefined();
    expect(runs).toBe(3);
  });
  it('a crash stop is not written to disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memo-'));
    const ev = await createEvaluator({ workers: 1, pin: 'abc', memoDir: dir, factory: () => ({ ready: Promise.resolve(), close: async () => {}, run: async () => { throw new WorkerDied('x'); } }) });
    await ev.run(lo, [], ctx);
    expect(readdirSync(dir)).toHaveLength(0);
  });
  it('a corrupt disk memo file is a miss; writes leave no temp files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memo-'));
    const mk = () => createEvaluator({ factory: stub().factory, workers: 1, pin: 'abc', memoDir: dir });
    await (await mk()).run(lo, [], ctx);
    const [f] = readdirSync(dir);
    writeFileSync(join(dir, f), '{"torn');
    const s = stub();
    expect((await (await createEvaluator({ factory: s.factory, workers: 1, pin: 'abc', memoDir: dir })).run(lo, [], ctx)).figure.kill).toBe(killAverage(200, 100));
    expect(s.jobs).toHaveLength(1);
    expect(readdirSync(dir).filter(x => x.endsWith('.tmp'))).toHaveLength(0);
  });
  it('startup failure throws and closes the workers that started', async () => {
    let closedWorkers = 0, i = 0;
    await expect(createEvaluator({ workers: 3, pin: 'p', factory: () => ({
      ready: i++ === 1 ? Promise.reject(new Error('tsx registration failed')) : Promise.resolve(),
      run: async () => { throw new Error('unused'); }, close: async () => { closedWorkers++; },
    }) })).rejects.toThrow('tsx registration failed');
    expect(closedWorkers).toBe(3);
  });
  it('after close(), queued and new runs reject with "evaluator closed"', async () => {
    const ev = await createEvaluator({ factory: stub(undefined, 20).factory, workers: 1, pin: 'p' });
    const first = ev.run({ i: 1 }, [], ctx), queued = ev.run({ i: 2 }, [], ctx);
    const queuedRej = expect(queued).rejects.toThrow('evaluator closed');
    await ev.close();
    await queuedRej;
    await first;
    await expect(ev.run({ i: 3 }, [], ctx)).rejects.toThrow('evaluator closed');
  });
  it('applies [Change, Change, Patch, Change] as applyChanges([c1,c2]) -> applyPatch -> applyChanges([c4])', () => {
    const calls: string[] = [];
    const c = (n: string) => ({ kind: 'c', n }) as unknown as Change;
    const patch = { kind: 'patch', op: 'prism-provide', tree: 1, extraAffix: [] } as LoadoutPatch;
    const r = applyInOrder({ v: '' }, [c('1'), c('2'), patch, c('4')], {
      isPatch: (x): x is LoadoutPatch => (x as { kind: string }).kind === 'patch',
      applyPatch: lo => { calls.push('patch'); return { v: `${lo.v}P` }; },
      applyChanges: (lo, cs) => { calls.push(`changes[${cs.map(x => (x as any).n)}]`); return { loadout: { v: `${lo.v}C` }, dropped: [`d${calls.length}`] }; },
    });
    expect(calls).toEqual(['changes[1,2]', 'patch', 'changes[4]']);
    expect(r).toEqual({ loadout: { v: 'CPC' }, dropped: ['d1', 'd3'] });
  });
});

const skipReal = realSkip();
if (skipReal) console.warn(skipReal);
describe('evaluator (real workers, pinned dps-debug)', () => {
  it.skipIf(!!skipReal)('equals guideFigure in-process on the target build; patches applied; iceShot stops', async () => {
    const fx = await import('@dps/guide/figure');
    const root = pinRoot(), read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
    // target assembly of dps-debug guide/figure.test.ts (a): the slate file filtered to the build's slates
    const l = read('re/evidence/loadout_probuild-hanshansi-bing.json');
    const mine = new Set<number>(l.slates);
    l.slateItems = read('re/evidence/t5_slate_v2_probuild.json').filter((v: any) => v.EffectTalentIds.every((t: number) => mine.has(t)))
      .map((v: any) => ({ itemId: `probuild_${v.id}`, baseId: 0, talents: v.EffectTalentIds, influence: v }));
    const patch: LoadoutPatch = { kind: 'patch', op: 'prism-provide', tree: 1, extraAffix: [] };
    const ev = await createEvaluator({ workers: 3 });
    try {
      const [r, p, ice] = await Promise.all([
        ev.run(l, [], ctx), ev.run(l, [patch], ctx), ev.run(l, [], { level: 94, skill: 'iceShot' })]);
      const ground = { ...fx.GROUNDS.hoa, carry: { ...fx.GROUNDS.hoa.carry, fight: { bombs: 10 } } };
      const ref = fx.guideFigure(fx.openCatalog(), structuredClone(l), 'hoa', { heroLevel: 100, ground });
      expect(r.figure.stop).toBeUndefined();
      expect(r.figure.life100).toBe(ref.life100);
      expect(r.figure.life0).toBe(ref.life0);
      expect(r.figure.kill).toBe(killAverage(ref.life100, ref.life0));
      expect(ev.pin).toMatch(/^[0-9a-f]{40}(\+dirty)?$/);
      expect(p.loadout).toEqual(applyPatch(l, patch));
      expect(ice.figure.stop).toMatch(/not ported|refused: skill \d+ is limited to the weapon rows/);
    } finally { await ev.close(); }
  }, 900_000);
});

describe('figure session reuse (real worker)', () => {
  it.skipIf(!!skipReal)('one worker, same loadout twice plus a patched one: each equals a cold guideFigure', async () => {
    const fx = await import('@dps/guide/figure');
    const root = pinRoot(), read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
    const l = read('re/evidence/loadout_probuild-hanshansi-bing.json');
    const mine = new Set<number>(l.slates);
    l.slateItems = read('re/evidence/t5_slate_v2_probuild.json').filter((v: any) => v.EffectTalentIds.every((t: number) => mine.has(t)))
      .map((v: any) => ({ itemId: `probuild_${v.id}`, baseId: 0, talents: v.EffectTalentIds, influence: v }));
    const patch: LoadoutPatch = { kind: 'patch', op: 'prism-provide', tree: 1, extraAffix: [] };
    const cat = fx.openCatalog(), ground = { ...fx.GROUNDS.hoa, carry: { ...fx.GROUNDS.hoa.carry, fight: DEFAULT_FIGHT } };
    const cold = (lo: unknown) => fx.guideFigure(cat, structuredClone(lo) as never, 'hoa', { heroLevel: 100, ground });
    const ev = await createEvaluator({ workers: 1 });
    try {
      const a = await ev.run(l, [], ctx);
      const b = await ev.run(structuredClone(l), [patch], ctx);
      const a2 = await ev.run(structuredClone(l), [], ctx);
      const refA = cold(l), refB = cold(applyPatch(l, patch));
      for (const [r, ref] of [[a, refA], [a2, refA], [b, refB]] as const) {
        expect(r.figure.life100).toBe(ref.life100);
        expect(r.figure.life0).toBe(ref.life0);
      }
    } finally { await ev.close(); }
  }, 900_000);
});

describe('stated fight inputs (real worker)', () => {
  it.skipIf(!!skipReal)('the L100 Phantom Delivery loadout gets past the bombs and castLogSum stops', async () => {
    const dir = join(pinRoot(), 'game'), f = readdirSync(dir).filter(x => /^loadout_l100-.*\.json$/.test(x)).sort().pop()!;
    const ev = await createEvaluator({ workers: 1 });
    try {
      const r = await ev.run(JSON.parse(readFileSync(join(dir, f), 'utf8')), [], { level: 93, skill: 'hoa' });
      // past the bombs and castLogSum stops; it stops on a real unported mechanic of dps-debug (expected)
      expect(r.figure.stop).toMatch(/not ported: an uptime add on event 1000074/);
    } finally { await ev.close(); }
  }, 900_000);
});
