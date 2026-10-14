/** Two-loop progression search (spec §3.2): acquisitions ranked by kill-average gain per FE (lazy greedy),
 *  reconfigurations re-solved by a churn-gated hill climb. */
import type { Change, Evaluated, Evaluator, Figure, GenCtx, Generator, Move, State, Step } from './types';

export interface Knobs { churn: number; topK: number; maxRounds: number; refreshEvery: number; maxSteps: number; targetKill?: number; budgetFE?: number }
export const DEFAULT_KNOBS: Knobs = { churn: 0.05, topK: 5, maxRounds: 10, refreshEvery: 10, maxSteps: 400 };

/** A figure is rankable only if it dropped no piece the baseline still had, and it computed. */
export function rankable(before: Figure, after: Figure): boolean {
  return !after.stop && after.partial.every((p) => before.partial.includes(p));
}

/** Search-wide bookkeeping owned by `path` (stale scores for lazy greedy, running FE, reported lists). */
export interface Mem { scores: Map<string, number>; since: number; cumFE: number; unpriced: Set<string>; notCalculable: Set<string> }
export const newMem = (): Mem => ({ scores: new Map(), since: 0, cumFE: 0, unpriced: new Set(), notCalculable: new Set() });

const key = (m: Move) => `${m.kind}|${m.label}`;
const why = (b: Figure, a: Figure) => a.stop ? `stopped: ${a.stop}` : `dropped ${a.partial.filter((p) => !b.partial.includes(p)).join(', ')}`;

/** Memoise run() per (loadout object, changes, ctx) so one step never evaluates the same thing twice (in-flight promises shared). */
function memoEv(ev: Evaluator): Evaluator {
  const seen = new WeakMap<object, Map<string, Promise<Evaluated>>>();
  return {
    pin: ev.pin, close: () => ev.close(),
    run(loadout, changes, ctx) {
      let m = seen.get(loadout); if (!m) seen.set(loadout, m = new Map());
      const k = JSON.stringify([changes, ctx]);
      let p = m.get(k); if (!p) m.set(k, p = ev.run(loadout, changes, ctx));
      return p;
    },
  };
}

const evalMove = (s: State, m: Move, ev: Evaluator) => ev.run(s.loadout, m.changes as Change[], { level: s.level, skill: m.skill ?? s.skill });
const apply = (s: State, m: Move, e: Evaluated): State => ({
  ...s, loadout: e.loadout, fe: s.fe - (m.costFE ?? 0), skill: m.skill ?? s.skill,
  owned: m.consumes ? s.owned.filter((o) => o.itemId !== m.consumes) : s.owned,
});
const legal = (s: State, m: Move) => m.minLevel <= s.level;
const lnGain = (b: number, a: number) => (a > b ? (b > 0 ? Math.log(a / b) : Infinity) : (a > 0 ? Math.log(a / b) : b > 0 ? -Infinity : 0));
const scoreOf = (gain: number, cost: number) => (gain <= 0 ? gain : cost === 0 ? Infinity : gain / cost);

export async function resolve(s: State, ev: Evaluator, gens: Generator[], ctx: GenCtx, k: Knobs, f?: Figure, mem: Mem = newMem()):
  Promise<{ state: State; figure: Figure; taken: Move[] }> {
  let figure = f ?? (await ev.run(s.loadout, [], { level: s.level, skill: s.skill })).figure;
  const taken: Move[] = [];
  for (let round = 0; round < k.maxRounds; round++) {
    const moves = gens.flatMap((g) => g(s, ctx)).filter((m) => legal(s, m) && (m.costFE !== null || (mem.unpriced.add(m.label), false)));
    const evs = await Promise.all(moves.map((m) => evalMove(s, m, ev)));
    let best = -1;
    evs.forEach((e, i) => {
      if (!rankable(figure, e.figure)) { mem.notCalculable.add(`${moves[i].label}: ${why(figure, e.figure)}`); return; }
      if (e.figure.kill > figure.kill && e.figure.kill >= figure.kill * (1 + k.churn) && (best < 0 || e.figure.kill > evs[best].figure.kill)) best = i;
    });
    if (best < 0) break;
    s = apply(s, moves[best], evs[best]); figure = evs[best].figure; taken.push(moves[best]);
  }
  return { state: s, figure, taken };
}

export async function step(s: State, f: Figure, rawEv: Evaluator, acq: Generator[], recon: Generator[], ctx: GenCtx, k: Knobs, mem: Mem = newMem()):
  Promise<{ state: State; step: Step } | null> {
  const ev = memoEv(rawEv);
  if (mem.since >= k.refreshEvery) { mem.scores.clear(); mem.since = 0; }
  mem.since++;
  const remaining = Math.min(s.fe, (k.budgetFE ?? Infinity) - mem.cumFE);
  const cands: Move[] = [];
  for (const m of acq.flatMap((g) => g(s, ctx))) {
    if (!legal(s, m)) continue;
    if (m.costFE === null) { mem.unpriced.add(m.label); continue; }
    if (m.costFE <= remaining) cands.push(m);
  }
  // lazy greedy: unseen candidates and enablers score +∞ (evaluated now); stale scores are upper bounds
  const fresh = new Map<string, { m: Move; e: Evaluated; gain: number; score: number }>();
  const stale = (m: Move) => mem.scores.get(key(m)) ?? Infinity;
  const kth = () => [...fresh.values()].map((r) => r.score).sort((a, b) => b - a)[k.topK - 1] ?? -Infinity;
  for (;;) {
    const bar = kth();
    const todo = cands.filter((m) => !fresh.has(key(m)) && (m.enabler || stale(m) > bar))
      .sort((a, b) => stale(b) - stale(a)).slice(0, Math.max(k.topK, cands.filter((m) => m.enabler && !fresh.has(key(m))).length));
    if (!todo.length) break;
    const evs = await Promise.all(todo.map((m) => evalMove(s, m, ev)));
    todo.forEach((m, i) => {
      const e = evs[i];
      if (!rankable(f, e.figure)) { mem.notCalculable.add(`${m.label}: ${why(f, e.figure)}`); mem.scores.set(key(m), -Infinity); fresh.set(key(m), { m, e, gain: -Infinity, score: -Infinity }); return; }
      const gain = lnGain(f.kill, e.figure.kill), score = scoreOf(gain, m.costFE!);
      mem.scores.set(key(m), score); fresh.set(key(m), { m, e, gain, score });
    });
  }
  const byScore = (a: { score: number; gain: number }, b: { score: number; gain: number }) => (b.score - a.score) || (b.gain - a.gain) || 0;
  const all = [...fresh.values()].filter((r) => r.gain > -Infinity);
  const picks = new Set([...all.sort(byScore).slice(0, k.topK), ...all.filter((r) => r.m.enabler)]);
  const solved = await Promise.all([...picks].map(async (r) => {
    const s1 = apply(s, r.m, r.e);
    const res = await resolve(s1, ev, recon, ctx, k, r.e.figure, mem);
    const gain = lnGain(f.kill, res.figure.kill);
    return { r, res, gain, score: scoreOf(gain, r.m.costFE!) };
  }));
  const win = solved.filter((x) => x.gain > 0).sort(byScore)[0];
  if (!win) return null;
  const cost = win.r.m.costFE!;
  mem.cumFE += cost; mem.scores.delete(key(win.r.m));
  return { state: win.res.state, step: { level: s.level, move: win.r.m, triggered: win.res.taken, before: f, after: win.res.figure, cumFE: mem.cumFE } };
}

export async function path(s0: State, ev: Evaluator, acq: Generator[], recon: Generator[], ctxOf: (s: State) => GenCtx, k: Knobs):
  Promise<{ start: Figure; steps: Step[]; notCalculable: string[]; unpriced: string[]; notSearched: string[] }> {
  const start = (await ev.run(s0.loadout, [], { level: s0.level, skill: s0.skill })).figure;
  const mem = newMem(), notSearched = new Set<string>(), steps: Step[] = [];
  let s = s0, f = start;
  while (steps.length < k.maxSteps && !(k.targetKill !== undefined && f.kill >= k.targetKill)) {
    const ctx = ctxOf(s);
    const r = await step(s, f, ev, acq, recon, ctx, k, mem);
    ctx.notSearched.forEach((n) => notSearched.add(n));
    if (!r) break;
    steps.push(r.step); s = r.state; f = r.step.after;
  }
  return { start, steps, notCalculable: [...mem.notCalculable], unpriced: [...mem.unpriced], notSearched: [...notSearched] };
}
