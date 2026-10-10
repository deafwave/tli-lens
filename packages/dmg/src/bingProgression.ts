/* Bing progression path (mechanics.md#bing-progression): from a starting set of sources,
   repeatedly take the move with the largest DPS multiplier per source added — a single
   source (swapping out the weakest occupant of a full craft pool, or the item it
   `replaces`), a synergy pair, or a package (a Vorax piece: its base plus the best lines
   for it, found by an inner walk) — until nothing is left (build-up) or nothing gains
   (climb). A set is always scored through `effective`, so removing an item also removes
   what depended on it. Pure: no I/O. */
import { cycleDps, type Snapshot } from "./damageModel.js";
import { applySeason, type Season } from "./seasons.js";
import { compose, effective, SLOT_CAPACITY, type Source } from "./bingLedger.js";

export interface PathStep {
  ids: string[];
  labels: string[];
  removed: string[];
  dps: number;
  /** DPS multiplier this step adds (dps / previous dps) */
  gain: number;
  /** FE spent on this step (0 when free or unpriced) */
  cost: number;
}

interface Move { add: Source[]; remove: Source[]; dps: number; score: number; cost: number }

/** Capacity keys a slot counts against: its own, plus every `prefix.*` group above it. */
function capacityKeys(slot: string, cap: Record<string, number>): string[] {
  const parts = slot.split(".");
  const keys = [slot, ...parts.slice(0, -1).map((_, i) => `${parts.slice(0, i + 1).join(".")}.*`)];
  return keys.filter(k => k in cap);
}
/** Every capacity key a source counts against. */
export const keysOf = (s: Source, cap: Record<string, number> = SLOT_CAPACITY): string[] =>
  [...(s.slot ? capacityKeys(s.slot, cap) : []), ...(s.caps ?? []).filter(k => k in cap)];
const sizeOf = (s: Source) => s.size ?? 1;

export interface WalkOptions {
  untilNoGain?: boolean;
  pairs?: boolean;
  /** only sources with `level` ≤ this */
  maxLevel?: number;
  /** order by log-DPS gained per FE (free moves first); unpriced sources are skipped */
  byCost?: boolean;
  /** FE available; moves costing more than what is left are skipped */
  budget?: number;
  /** capacity overrides (e.g. the talent-point budget at this level) */
  capacity?: Record<string, number>;
}

export function walk(zero: Snapshot, start: Source[], pool: Source[], season: Season,
                     opts: WalkOptions = {}): PathStep[] {
  const dpsOf = (set: Source[]) => cycleDps(applySeason(compose(zero, effective(set)), season)).dps;
  const pairs = opts.pairs ?? true;
  const cap = { ...SLOT_CAPACITY, ...opts.capacity };
  const keys = (s: Source) => keysOf(s, cap);
  let spent = 0;
  let have = [...start];
  let left = pool.filter(s => !have.includes(s) && (s.level ?? 0) <= (opts.maxLevel ?? Infinity)
    && (!opts.byCost || s.cost !== undefined || s.package));
  let prev = dpsOf(have);
  const out: PathStep[] = [];

  while (left.length) {
    const ids = new Set(have.flatMap(s => [s.id, ...s.provides ?? []]));
    const ready = (s: Source, partner?: Source) =>
      (s.requires ?? []).every(r => ids.has(r) || r === partner?.id || !!partner?.provides?.includes(r));
    let best: Move | null = null;
    const consider = (add: Source[], remove: Source[], count = add.length): number => {
      const cost = add.reduce((c, s) => c + (s.cost ?? 0), 0);
      if (opts.budget !== undefined && spent + cost > opts.budget) return 0;
      const d = dpsOf([...have.filter(s => !remove.includes(s)), ...add]);
      // per-source geometric gain, so a pair must beat two singles to be taken together;
      // by cost: free moves first (by gain), then log-gain per FE
      const score = !opts.byCost ? (d / prev) ** (1 / count)
        : d <= prev ? -Infinity : cost > 0 ? Math.log(d / prev) / cost : 1e9 + Math.log(d / prev);
      if (!best || score > best.score + 1e-12) best = { add, remove, dps: d, score, cost };
      return d;
    };

    /** Ways to make room for `c`: the items it replaces, plus one occupant of each full pool. */
    const roomFor = (c: Source): Source[][] => {
      let options: Source[][] = [have.filter(s => c.replaces?.includes(s.id) || (!!c.family && s.family === c.family))];
      for (const key of keys(c)) {
        options = options.flatMap(removed => {
          const occupants = have.filter(s => keys(s).includes(key) && !removed.includes(s));
          const used = occupants.reduce((n, s) => n + sizeOf(s), 0);
          if (used + sizeOf(c) <= cap[key]) return [removed];
          // sized sources (talent trees) only fill free room; single lines swap one occupant out
          // a sized source (talent tree) swaps out one sized occupant that frees enough room
          return sizeOf(c) > 1
            ? occupants.filter(o => sizeOf(o) > 1 && used - sizeOf(o) + sizeOf(c) <= cap[key]).map(o => [...removed, o])
            : occupants.filter(o => sizeOf(o) === 1).map(o => [...removed, o]);
        });
      }
      return options;
    };

    const single = new Map<Source, number>();
    for (const c of left) {
      if (!ready(c) || c.package) continue;
      const rooms = roomFor(c);
      if (rooms.length) single.set(c, Math.max(...rooms.map(r => consider([c], r))));
    }

    if (pairs) {
      // ponytail: pairs only among the 12 strongest singles plus sources that need a partner;
      // a synergy between two weak singles is missed (raise PAIR_POOL if one turns up)
      const PAIR_POOL = 12;
      const strong = [...single.entries()].sort((a, b) => b[1] - a[1]).slice(0, PAIR_POOL).map(e => e[0]);
      // enablers (what other sources require — Ruinous Star) are worth ~nothing alone: always pair them
      const required = new Set(left.flatMap(s => s.requires ?? []));
      const enablers = left.filter(s => !s.package && [s.id, ...s.provides ?? []].some(x => required.has(x)));
      const pairable = [...new Set([...strong, ...enablers, ...left.filter(s => !ready(s) && !s.package)])];
      const fits = (add: Source[], remove: Source[]) => Object.keys(cap).every(k => {
        const used = [...have.filter(h => !remove.includes(h)), ...add]
          .filter(h => keys(h).includes(k)).reduce((n, h) => n + sizeOf(h), 0);
        return used <= cap[k];
      });
      for (let i = 0; i < pairable.length; i++) for (let j = i + 1; j < pairable.length; j++) {
        const [a, b] = [pairable[i], pairable[j]];
        if (!ready(a, b) || !ready(b, a) || (a.family && a.family === b.family)) continue;
        const rooms = (x: Source) => roomFor(x).slice(0, sizeOf(x) > 1 ? 3 : 1);
        for (const ra of rooms(a)) for (const rb of rooms(b)) {
          const remove = [...new Set([...ra, ...rb])];
          if (fits([a, b], remove)) consider([a, b], remove);
        }
      }
    }

    for (const p of left.filter(s => s.package && ready(s))) {
      const removed = have.filter(s => p.replaces?.includes(s.id));
      const base = [...have.filter(s => !removed.includes(s)), p];
      const lines = left.filter(s => s.requires?.includes(p.id));
      const inner = walk(zero, base, lines, season,
        { ...opts, untilNoGain: true, pairs: false, budget: opts.budget === undefined ? undefined : opts.budget - spent - (p.cost ?? 0) });
      const added = inner.flatMap(st => st.ids).map(id => lines.find(l => l.id === id)!);
      const dropped = new Set(inner.flatMap(st => st.removed));
      const kept = added.filter(l => !dropped.has(l.id));
      consider([p, ...kept], [...removed, ...have.filter(s => dropped.has(s.id))], 1 + kept.length);
    }

    if (!best) {
      if (opts.untilNoGain) break;
      throw new Error(`walk: unsatisfiable requires among ${left.map(s => s.id).join(", ")}`);
    }
    const m = best as Move;
    if (opts.untilNoGain && m.dps <= prev * 1.0005) break;
    const next = [...have.filter(s => !m.remove.includes(s)), ...m.add];
    // sources left without what they require (a corroded roll whose item a Vorax piece replaced)
    const dead = opts.untilNoGain ? next.filter(s => !effective(next).includes(s)) : [];
    out.push({ ids: m.add.map(s => s.id), labels: m.add.map(s => s.label),
               removed: [...m.remove, ...dead].map(s => s.id), dps: m.dps, gain: m.dps / prev, cost: m.cost });
    spent += m.cost;
    have = next.filter(s => !dead.includes(s));
    left = left.filter(s => !m.add.includes(s) && !m.remove.includes(s));
    prev = m.dps;
  }
  return out;
}
