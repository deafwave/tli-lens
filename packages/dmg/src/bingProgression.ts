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
}

interface Move { add: Source[]; remove: Source[]; dps: number; score: number }

/** Capacity keys a slot counts against: its own, plus every `prefix.*` group above it. */
function capacityKeys(slot: string): string[] {
  const parts = slot.split(".");
  const keys = [slot, ...parts.slice(0, -1).map((_, i) => `${parts.slice(0, i + 1).join(".")}.*`)];
  return keys.filter(k => k in SLOT_CAPACITY);
}
/** Every capacity key a source counts against. */
export const keysOf = (s: Source): string[] =>
  [...(s.slot ? capacityKeys(s.slot) : []), ...(s.caps ?? []).filter(k => k in SLOT_CAPACITY)];

export function walk(zero: Snapshot, start: Source[], pool: Source[], season: Season,
                     opts: { untilNoGain?: boolean; pairs?: boolean } = {}): PathStep[] {
  const dpsOf = (set: Source[]) => cycleDps(applySeason(compose(zero, effective(set)), season)).dps;
  const pairs = opts.pairs ?? true;
  let have = [...start];
  let left = pool.filter(s => !have.includes(s));
  let prev = dpsOf(have);
  const out: PathStep[] = [];

  while (left.length) {
    const ids = new Set(have.flatMap(s => [s.id, ...s.provides ?? []]));
    const ready = (s: Source, partner?: Source) =>
      (s.requires ?? []).every(r => ids.has(r) || r === partner?.id || !!partner?.provides?.includes(r));
    let best: Move | null = null;
    const consider = (add: Source[], remove: Source[], count = add.length): number => {
      const d = dpsOf([...have.filter(s => !remove.includes(s)), ...add]);
      // per-source geometric gain, so a pair must beat two singles to be taken together
      const score = (d / prev) ** (1 / count);
      if (!best || score > best.score + 1e-12) best = { add, remove, dps: d, score };
      return d;
    };

    /** Ways to make room for `c`: the items it replaces, plus one occupant of each full pool. */
    const roomFor = (c: Source): Source[][] => {
      let options: Source[][] = [have.filter(s => c.replaces?.includes(s.id))];
      for (const key of keysOf(c)) {
        options = options.flatMap(removed => {
          const occupants = have.filter(s => keysOf(s).includes(key) && !removed.includes(s));
          return occupants.length < SLOT_CAPACITY[key] ? [removed] : occupants.map(o => [...removed, o]);
        });
      }
      return options;
    };

    const single = new Map<Source, number>();
    for (const c of left) {
      if (!ready(c) || c.package) continue;
      single.set(c, Math.max(...roomFor(c).map(r => consider([c], r))));
    }

    if (pairs) {
      // ponytail: pairs only among the 12 strongest singles plus sources that need a partner;
      // a synergy between two weak singles is missed (raise PAIR_POOL if one turns up)
      const PAIR_POOL = 12;
      const strong = [...single.entries()].sort((a, b) => b[1] - a[1]).slice(0, PAIR_POOL).map(e => e[0]);
      const pairable = [...new Set([...strong, ...left.filter(s => !ready(s) && !s.package)])];
      const free = (s: Source) => !s.replaces?.length && !keysOf(s).some(k =>
        have.filter(h => keysOf(h).includes(k)).length + 2 > SLOT_CAPACITY[k]);
      for (let i = 0; i < pairable.length; i++) for (let j = i + 1; j < pairable.length; j++) {
        const [a, b] = [pairable[i], pairable[j]];
        if (free(a) && free(b) && ready(a, b) && ready(b, a)) consider([a, b], []);
      }
    }

    for (const p of left.filter(s => s.package && ready(s))) {
      const removed = have.filter(s => p.replaces?.includes(s.id));
      const base = [...have.filter(s => !removed.includes(s)), p];
      const lines = left.filter(s => s.requires?.includes(p.id));
      const inner = walk(zero, base, lines, season, { untilNoGain: true, pairs: false });
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
               removed: [...m.remove, ...dead].map(s => s.id), dps: m.dps, gain: m.dps / prev });
    have = next.filter(s => !dead.includes(s));
    left = left.filter(s => !m.add.includes(s) && !m.remove.includes(s));
    prev = m.dps;
  }
  return out;
}
