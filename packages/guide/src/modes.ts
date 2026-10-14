/** The two guide modes (spec §3.3): `runIdeal` paths the Bing1 progression from map entry, `runAdvise` advises a live character. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gearMoves, slotsOfBase } from './candidates/gear';
import { GEM_LEVEL, gemLevelAt, gemMoves } from './candidates/gems';
import { kismetMoves } from './candidates/kismets';
import { memoryMoves } from './candidates/memories';
import { pactMoves } from './candidates/pacts';
import { prismMoves } from './candidates/prisms';
import { slateMoves } from './candidates/slates';
import { switchMoves } from './candidates/switch';
import { talentMoves } from './candidates/talents';
import { traitMoves } from './candidates/traits';
import { type EtorHistory, type EtorItems, historyBook, snapshotBook } from './pricing';
import { DEFAULT_KNOBS, type Knobs, newMem, overBudget, path, rankable, step } from './search';
import { ICE_SHOT_INPUTS, idealStartNotes } from './start';
import { setTalentPoints } from './talentRules';
import type { Evaluator, Figure, GenCtx, Generator, GuideOut, Move, PriceBook, State, Step } from './types';

export const SEASON = 1501;
const etorFile = (f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../data/etor/${f}_${SEASON}.json`, import.meta.url)), 'utf8'));
export const localItems = (): EtorItems => etorFile('items');
export const localHistory = (): EtorHistory => etorFile('history');

export interface IdealKnobs extends Knobs {
  /** accepted steps per level stage before the path moves on */ stepsPerStage: number;
  startLevel: number; endLevel: number; stageStep: number;
  /** full-level talent budget (below 93 scaled by round(full x (L - 1) / 92)) */ talentPoints: number;
}
export const DEFAULT_IDEAL: IdealKnobs = { ...DEFAULT_KNOBS, stepsPerStage: 25, startLevel: 60, endLevel: 100, stageStep: 5, talentPoints: 108 };

const ALL: Generator[] = [gearMoves, gemMoves, kismetMoves, memoryMoves, pactMoves, prismMoves, slateMoves, switchMoves, talentMoves, traitMoves];
const only = (acquisition: boolean) => (g: Generator): Generator => (s, c) => g(s, c).filter((m) => m.acquisition === acquisition);

/** Mode 2: an owned (non-equipped) gear item is worn at 0 FE, once (the search drops it from `owned` when taken). */
export const ownedGear: Generator = (s) => s.owned.flatMap((it) => {
  const { slots, level } = slotsOfBase(it.baseId, s.skill);
  return slots.map((slot): Move => ({
    kind: 'gear', label: `Wear your ${it.baseName ?? it.baseId} (${it.where}) in ${slot}`, acquisition: true, costFE: 0, costNote: 'owned', minLevel: Math.max(level, it.level), consumes: it.itemId,
    changes: [{ kind: 'gear', slot, item: { baseId: it.baseId, baseName: it.baseName ?? undefined, itemId: it.itemId, level: it.level, modifiers: it.modifiers } }] as never,
  }));
});

const pct = (b: Figure, a: Figure) => `+${((a.kill / b.kill - 1) * 100).toFixed(1)} %`;

/** every acquisition at this state that has no price, one per distinct change list */
export function unpricedAcquisitions(acq: Generator[], s: State, ctx: GenCtx): Move[] {
  const seen = new Set<string>();
  return acq.flatMap((g) => g(s, ctx)).filter((m) => m.minLevel <= s.level && m.costFE === null && !seen.has(JSON.stringify(m.changes)) && seen.add(JSON.stringify(m.changes)));
}

export async function runIdeal(ev: Evaluator, k: Partial<IdealKnobs> = {}, prices?: PriceBook, onStep?: (out: GuideOut) => void): Promise<GuideOut> {
  const K = { ...DEFAULT_IDEAL, ...k };
  setTalentPoints(K.talentPoints);
  try { return await ideal(ev, K, prices, onStep); } finally { setTalentPoints(DEFAULT_IDEAL.talentPoints); }
}

async function ideal(ev: Evaluator, K: IdealKnobs, prices: PriceBook | undefined, onStep?: (out: GuideOut) => void): Promise<GuideOut> {
  const t0 = Date.now();
  const books = prices ?? historyBook(localItems(), localHistory());
  const acq = ALL.map(only(true)), recon = ALL.map(only(false));
  const ctxOf = (s: State): GenCtx => ({ prices: books, level: s.level, notSearched: new Set() });
  const start = idealStartNotes();
  let s: State = { ...start.state, level: K.startLevel };
  const notes = [...start.notes];
  const out = (o: Partial<GuideOut>): GuideOut => ({
    mode: 'ideal', pin: ev.pin, etor: { season: books.season, fetchedAt: books.fetchedAt }, knobs: { ...K, fight: ev.fight, fightNote: ev.fightNote }, startNotes: notes, steps: [], notSearched: [], unpriced: [], notCalculable: [], ...o,
  }) as GuideOut;

  const first = await ev.run(s.loadout, [], { level: s.level, skill: s.skill });
  const inputs = { ...first.inputs, ...(s.skill === 'iceShot' ? { iceShot: ICE_SHOT_INPUTS } : {}) };
  if (first.figure.stop) {
    const why = `L${s.level} ${s.skill} leg cannot be priced yet: ${first.figure.stop}`;
    notes.push(why);
    return out({ start: first.figure, inputs, notCalculable: [why] });
  }
  const mem = newMem(), steps: Step[] = [], notSearched = new Set<string>(), unpriced: string[] = [];
  let f = first.figure, stopped = false;
  /** the output so far; callers pass `partialRun` until the run completes */
  const snap = (extra: Record<string, unknown>) => out({ start: first.figure, inputs, steps: [...steps], notSearched: [...notSearched], unpriced: [...unpriced], notCalculable: [...mem.notCalculable],
    knobs: { ...K, fight: ev.fight, fightNote: ev.fightNote, ...extra } });
  for (let level = K.startLevel; level <= K.endLevel; level += K.stageStep) {
    // stage upkeep: gems level up with the hero (to what each ladder allows)
    const skills = (s.loadout.skills as { sid: number; level: number }[]).map((g) => ({ ...g, level: Math.max(g.level, gemLevelAt(g.sid, level, GEM_LEVEL)) }));
    if (level > K.startLevel) notes.push(`L${level}: gems raised to the hero-level limit`);
    s = { ...s, level, loadout: { ...s.loadout, skills } };
    f = (await ev.run(s.loadout, [], { level, skill: s.skill })).figure;
    if (f.stop) { const why = `L${level} ${s.skill} leg cannot be priced yet: ${f.stop}`; mem.notCalculable.add(why); notes.push(why); break; }
    for (let n = 0; n < K.stepsPerStage; n++) {
      if (overBudget(K, t0)) { stopped = true; break; }
      const ctx = ctxOf(s);
      const r = await step(s, f, ev, acq, recon, ctx, K, mem);
      ctx.notSearched.forEach((x) => notSearched.add(x));
      if (!r) break;
      if (level < 93) r.step.notes = [...(r.step.notes ?? []), 'talent points assumed'];
      steps.push(r.step); s = r.state; f = r.step.after;
      onStep?.(snap({ partialRun: true }));
    }
    if (stopped) break;
    // acquisitions nobody sells: what they would add, never ranked
    const ctx = ctxOf(s);
    const cands = unpricedAcquisitions(acq, s, ctx);
    const evs = await Promise.all(cands.map((m) => ev.run(s.loadout, m.changes, { level, skill: m.skill ?? s.skill })));
    ctx.notSearched.forEach((x) => notSearched.add(x));
    cands.map((m, i) => ({ m, e: evs[i].figure }))
      .filter(({ e }) => rankable(f, e) && e.kill > f.kill).sort((a, b) => b.e.kill - a.e.kill).slice(0, K.topK)
      .forEach(({ m, e }) => unpriced.push(`L${level} not on the market / unpriced: ${m.label}: ${pct(f, e)} if you get it`));
    onStep?.(snap({ partialRun: true }));
  }
  if (mem.unpriced.size) unpriced.push(`${mem.unpriced.size} distinct acquisitions had no price; the best ${K.topK} per stage are listed above`);
  return snap(stopped ? { stoppedBy: 'budget' } : {});
}

export async function runAdvise(ev: Evaluator, state: State, k: Partial<Knobs> = {}, prices?: PriceBook, onStep?: (out: GuideOut) => void): Promise<GuideOut> {
  const K = { ...DEFAULT_KNOBS, ...k };
  const books = prices ?? snapshotBook(localItems());
  const acq = [ownedGear, ...ALL.map(only(true))], recon = ALL.map(only(false));
  const base = { mode: 'advise' as const, pin: ev.pin, etor: { season: books.season, fetchedAt: books.fetchedAt }, knobs: { ...K, fight: ev.fight, fightNote: ev.fightNote, fe: state.fe, level: state.level, skill: state.skill } };
  const first = await ev.run(state.loadout, [], { level: state.level, skill: state.skill });
  if (first.figure.stop) {
    return { ...base, start: first.figure, inputs: first.inputs, steps: [], notSearched: [], unpriced: [],
      notCalculable: [`${state.skill} cannot be priced yet: ${first.figure.stop}`] };
  }
  const { stoppedBy, ...r } = await path(state, ev, acq, recon, (s) => ({ prices: books, level: s.level, notSearched: new Set() }), K,
    onStep && ((p) => onStep({ ...base, knobs: { ...base.knobs, partialRun: true }, inputs: first.inputs, ...p } as GuideOut)));
  return { ...base, ...(stoppedBy ? { knobs: { ...base.knobs, stoppedBy } } : {}), inputs: first.inputs, ...r } as GuideOut;
}
