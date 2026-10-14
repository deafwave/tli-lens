/** Evaluator: a worker_threads pool pricing loadouts with the pinned dps-debug figure entry. */
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { killAverage } from '../kill';
import { pinRoot as defaultPinRoot } from '../pin';
import type { LoadoutPatch } from '../patches';
import type { Change, EvalCtx, Evaluated, Evaluator, Loadout } from '../types';
import { createMemo, memoKey } from './memo';

export interface Job { loadout: Loadout; changes: (Change | LoadoutPatch)[]; ctx: EvalCtx }
export interface JobResult { loadout: Loadout; dropped: string[]; fig: { life100: number; life0: number; left: string[]; needs: string[]; stop?: string } }
/** One worker: runs a job, rejects with the dps-debug error message when pricing throws. */
export interface WorkerLike { run(job: Job): Promise<JobResult>; close(): Promise<void> }
export interface EvaluatorOpts {
  workers?: number; pinRoot?: string;
  /** replaces the worker_threads workers (tests) */
  factory?: (i: number) => WorkerLike;
  /** replaces the git-derived pin (the memo key's first part) */
  pin?: string;
  /** directory of the on-disk memo (none = memory only; never written when the pin is +dirty) */
  memoDir?: string;
}

/** HEAD sha of the pin, plus `+dirty` when its tree has changes (same rule as dps-debug's pinOf) */
function gitPin(root: string): string {
  const git = (...a: string[]) => execFileSync('git', ['-c', 'safe.directory=*', '-C', root, ...a], { encoding: 'utf8' }).trim();
  return git('rev-parse', 'HEAD') + (git('status', '--porcelain').length ? '+dirty' : '');
}

function threadWorker(root: string): WorkerLike {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { workerData: { pinRoot: root } });
  const pending = new Map<number, { ok: (r: JobResult) => void; fail: (e: Error) => void }>();
  let next = 0, dead: Error | undefined;
  const ready = new Promise<void>((ok, fail) => {
    w.on('message', (m: { id?: number; ready?: true; result?: JobResult; error?: string }) => {
      if (m.ready) return ok();
      const p = pending.get(m.id!); pending.delete(m.id!);
      m.error === undefined ? p?.ok(m.result!) : p?.fail(new Error(m.error));
    });
    const die = (e: Error) => { dead = e; fail(e); for (const p of pending.values()) p.fail(e); pending.clear(); };
    w.on('error', die);
    w.on('exit', c => die(new Error(`figure worker exited (${c})`)));
  });
  ready.catch(() => {});
  return {
    async run(job) {
      await ready;
      if (dead) throw dead;
      return new Promise((ok, fail) => { const id = next++; pending.set(id, { ok, fail }); w.postMessage({ id, job }); });
    },
    async close() { await w.terminate(); },
  };
}

export async function createEvaluator(o: EvaluatorOpts = {}): Promise<Evaluator> {
  const root = o.pinRoot ?? defaultPinRoot();
  const pin = o.pin ?? gitPin(root);
  const n = Math.max(1, o.workers ?? Math.min(24, os.availableParallelism() - 4));
  if (!o.factory) os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);   // process-wide; the workers are threads of it
  const workers = Array.from({ length: n }, (_, i) => (o.factory ?? (() => threadWorker(root)))(i));
  const idle = [...workers];
  const queue: (() => void)[] = [];
  const memo = createMemo<Evaluated>(pin, o.memoDir);

  const schedule = <T>(f: (w: WorkerLike) => Promise<T>): Promise<T> => new Promise<T>((ok, fail) => {
    const go = () => {
      const w = idle.pop()!;
      f(w).then(ok, fail).finally(() => { idle.push(w); queue.shift()?.(); });
    };
    idle.length ? go() : queue.push(go);
  });

  const price = (loadout: Loadout, changes: Job['changes'], ctx: EvalCtx): Promise<Evaluated> =>
    schedule(w => w.run({ loadout, changes, ctx })).then(
      ({ loadout: lo, dropped, fig }): Evaluated => ({ loadout: lo, dropped,
        figure: { life100: fig.life100, life0: fig.life0, kill: killAverage(fig.life100, fig.life0), partial: [...fig.left, ...fig.needs], ...(fig.stop ? { stop: fig.stop } : {}) } }),
      (e: Error): Evaluated => ({ loadout, dropped: [], figure: { life100: 0, life0: 0, kill: 0, partial: [], stop: e.message } }));

  return {
    pin,
    run: (loadout, changes, ctx) => memo.get(memoKey(pin, ctx.skill, ctx.level, loadout, changes), () => price(loadout, changes, ctx)),
    close: async () => { await Promise.all(workers.map(w => w.close())); },
  };
}
