import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPatch, type LoadoutPatch } from '../src/patches';
import { killAverage } from '../src/kill';
import { pinRoot } from '../src/pin';
import { createEvaluator, type Job, type JobResult, type WorkerLike } from '../src/engine/pool';
import type { Change } from '../src/types';

const fig = (life100: number, life0: number, extra: Partial<JobResult['fig']> = {}) => ({ life100, life0, left: [], needs: [], ...extra });
/** stub worker: records jobs; `f` decides the figure (throwing = dps-debug throwing, reported as a rejection) */
function stub(f: (j: Job) => JobResult['fig'] = () => fig(200, 100), delay = 0) {
  const jobs: Job[] = []; let active = 0, peak = 0;
  const factory = (): WorkerLike => ({
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

describe('evaluator (real workers, pinned dps-debug)', () => {
  it('equals guideFigure in-process on the target build; patches applied; iceShot stops', async () => {
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
      const ref = fx.guideFigure(fx.openCatalog(), structuredClone(l), 'hoa', { heroLevel: 100 });
      expect(r.figure.stop).toBeUndefined();
      expect(r.figure.life100).toBe(ref.life100);
      expect(r.figure.life0).toBe(ref.life0);
      expect(r.figure.kill).toBe(killAverage(ref.life100, ref.life0));
      expect(ev.pin).toMatch(/^[0-9a-f]{40}(\+dirty)?$/);
      expect(p.loadout).toEqual(applyPatch(l, patch));
      expect(ice.figure.stop).toMatch(/not ported/);
    } finally { await ev.close(); }
  }, 900_000);
});
