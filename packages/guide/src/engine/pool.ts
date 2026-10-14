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
export interface JobResult { loadout: Loadout; dropped: string[]; fig: { life100: number; life0: number; left: string[]; needs: string[]; stop?: string; inputs?: Record<string, unknown> } }
/** One worker: runs a job, rejects with the dps-debug error message when pricing throws. */
export interface WorkerLike {
  /** settles when the worker can take jobs; rejects when its startup failed */
  ready: Promise<void>;
  run(job: Job): Promise<JobResult>;
  close(): Promise<void>;
}
/** The worker itself died (exit, crash, failed startup): not a verdict on the job. Any other rejection is dps-debug throwing on the job. */
export class WorkerDied extends Error {}
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
    const die = (e: Error) => {
      if (!(e instanceof WorkerDied)) e = new WorkerDied(`figure worker failed: ${e.message}`); dead = e; fail(e); for (const p of pending.values()) p.fail(e); pending.clear(); };
    w.on('error', die);
    w.on('exit', c => die(new WorkerDied(`figure worker exited (${c})`)));
  });
  ready.catch(() => {});
  return {
    ready,
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
  let serial = 0;
  const spawn = (): WorkerLike => (o.factory ?? (() => threadWorker(root)))(serial++);
  const workers = Array.from({ length: n }, spawn);
  const all = new Set(workers);
  const closing = () => Promise.all([...all].map(w => w.close().catch(() => {})));
  try { await Promise.all(workers.map(w => w.ready)); }
  catch (e) { await closing(); throw e; }
  const idle = [...workers];
  const queue: { go: () => void; fail: (e: Error) => void }[] = [];
  let closed = false;
  const memo = createMemo<Evaluated>(pin, o.memoDir);

  /** runs f on an idle worker (queued when none). A dead worker is dropped and replaced; `f` is retried once on the replacement. */
  const schedule = <T>(f: (w: WorkerLike) => Promise<T>): Promise<T> => new Promise<T>((ok, fail) => {
    const go = async () => {
      let w = idle.pop()!;
      try {
        for (let attempt = 0; ; attempt++) {
          try { ok(await f(w)); break; }
          catch (e) {
            if (!(e instanceof WorkerDied) || closed) { fail(e as Error); break; }
            all.delete(w); w.close().catch(() => {});
            w = spawn(); all.add(w);
            if (attempt === 1) { fail(e); break; }
          }
        }
      } finally { idle.push(w); queue.shift()?.go(); }
    };
    if (closed) return fail(new Error('evaluator closed'));
    idle.length ? void go() : queue.push({ go, fail });
  });

  /** `keep: false` marks a result that came from a worker dying twice: returned to the caller, never cached */
  const price = (loadout: Loadout, changes: Job['changes'], ctx: EvalCtx): Promise<{ v: Evaluated; keep: boolean }> =>
    schedule(w => w.run({ loadout, changes, ctx })).then(
      ({ loadout: lo, dropped, fig }) => ({ keep: true, v: { loadout: lo, dropped, ...(fig.inputs ? { inputs: fig.inputs } : {}),
        figure: { life100: fig.life100, life0: fig.life0, kill: killAverage(fig.life100, fig.life0), partial: [...fig.left, ...fig.needs], ...(fig.stop ? { stop: fig.stop } : {}) } } as Evaluated }),
      (e: Error) => {
        if (e.message === 'evaluator closed') throw e;
        return { keep: !(e instanceof WorkerDied), v: { loadout, dropped: [], figure: { life100: 0, life0: 0, kill: 0, partial: [], stop: e.message } } };
      });

  return {
    pin,
    run: (loadout, changes, ctx) => closed ? Promise.reject(new Error('evaluator closed'))
      : memo.get(memoKey(pin, ctx.skill, ctx.level, loadout, changes), () => price(loadout, changes, ctx)),
    close: async () => {
      closed = true;
      for (const q of queue.splice(0)) q.fail(new Error('evaluator closed'));
      await closing();
    },
  };
}
