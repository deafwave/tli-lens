/* Bing progression path (mechanics.md#bing-progression): from a starting set of sources,
   repeatedly take the move with the largest DPS multiplier per source added — a single
   source (swapping out the weakest occupant of a full craft pool, or the item it
   `replaces`) or a synergy pair — until nothing is left (build-up) or nothing gains (climb).
   Pure: no I/O. */
import { cycleDps, type Snapshot } from "./damageModel.js";
import { applySeason, type Season } from "./seasons.js";
import { compose, SLOT_CAPACITY, type Source } from "./bingLedger.js";

export interface PathStep {
  ids: string[];
  labels: string[];
  removed: string[];
  dps: number;
  /** DPS multiplier this step adds (dps / previous dps) */
  gain: number;
}

interface Move { add: Source[]; remove: Source[]; dps: number; score: number }

export function walk(zero: Snapshot, start: Source[], pool: Source[], season: Season,
                     opts: { untilNoGain?: boolean } = {}): PathStep[] {
  const dpsOf = (set: Source[]) => cycleDps(applySeason(compose(zero, set), season)).dps;
  let have = [...start];
  let left = pool.filter(s => !have.includes(s));
  let prev = dpsOf(have);
  const out: PathStep[] = [];

  while (left.length) {
    const ids = new Set(have.map(s => s.id));
    const ready = (s: Source, partner?: Source) => (s.requires ?? []).every(r => ids.has(r) || r === partner?.id);
    let best: Move | null = null;
    const consider = (add: Source[], remove: Source[]): number => {
      const d = dpsOf([...have.filter(s => !remove.includes(s)), ...add]);
      // per-source geometric gain, so a pair must beat two singles to be taken together
      const score = (d / prev) ** (1 / add.length);
      if (!best || score > best.score + 1e-12) best = { add, remove, dps: d, score };
      return d;
    };

    const single = new Map<Source, number>();
    for (const c of left) {
      if (!ready(c)) continue;
      const replaced = have.filter(s => c.replaces?.includes(s.id));
      const occupants = c.slot ? have.filter(s => s.slot === c.slot && !replaced.includes(s)) : [];
      const options = !c.slot || occupants.length < (SLOT_CAPACITY[c.slot] ?? Infinity)
        ? [replaced] : occupants.map(o => [...replaced, o]);
      single.set(c, Math.max(...options.map(r => consider([c], r))));
    }
    // ponytail: pairs only among the 12 strongest singles plus sources that need a partner;
    // a synergy between two weak singles is missed (raise PAIR_POOL if one turns up)
    const PAIR_POOL = 12;
    const strong = [...single.entries()].sort((a, b) => b[1] - a[1]).slice(0, PAIR_POOL).map(e => e[0]);
    const pairable = [...new Set([...strong, ...left.filter(s => !ready(s))])];
    const free = (s: Source) => !s.replaces?.length
      && (!s.slot || have.filter(h => h.slot === s.slot).length + 2 <= (SLOT_CAPACITY[s.slot] ?? Infinity));
    for (let i = 0; i < pairable.length; i++) for (let j = i + 1; j < pairable.length; j++) {
      const [a, b] = [pairable[i], pairable[j]];
      if (free(a) && free(b) && ready(a, b) && ready(b, a)) consider([a, b], []);
    }

    if (!best) {
      if (opts.untilNoGain) break;
      throw new Error(`walk: unsatisfiable requires among ${left.map(s => s.id).join(", ")}`);
    }
    const m = best as Move;
    if (opts.untilNoGain && m.dps <= prev * 1.0005) break;
    out.push({ ids: m.add.map(s => s.id), labels: m.add.map(s => s.label),
               removed: m.remove.map(s => s.id), dps: m.dps, gain: m.dps / prev });
    have = [...have.filter(s => !m.remove.includes(s)), ...m.add];
    left = left.filter(s => !m.add.includes(s));
    prev = m.dps;
  }
  return out;
}
