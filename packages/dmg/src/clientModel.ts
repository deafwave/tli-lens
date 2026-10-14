/* Modifier pools over records compiled from the game client's own affix graphs
   (dps-debug/tools/build_model.py -> run_model.py -> export_model.py; data/client/builds/<slug>.json).
   Aggregation mirrors FUN_141bdddc0 (bucket 1 base, 2 flat range, 3 increased, 4 additional) and the tag gate
   FUN_141d154b0: a record applies when all of its tags are in the context. */

export type Filter = [number, number[]?] | null;

export interface Rec {
  src: string;
  cls: number;
  scope: string;          // "player" | "skill:<name>" | "buff:<name|id>"
  node: number;           // affix node type (101/363/364/321 attribute, 624 on-trigger, 119/632 per-X, 108 field)
  filter: Filter;         // [1, targets] (1 self, 3 minions, 8 enemies) or [filterId] (103 weapon, 107 distance, ...)
  attr?: number;
  field?: number;
  bucket?: number;
  lo: number;
  hi?: number;
  tags?: number[];
  trigger?: boolean;
  per?: number;
  source?: number;
  label?: number;
  extPoints?: number;     // prism ExtAffix: value already multiplied by the node's points
  P?: number[];           // the granting class's parameters (e.g. chance% of a chance line)
}

export interface SkillInfo { sid: number; level: number; tags: number[]; kind: string; slot: number; buff?: number }
export interface BuildModel {
  slug: string; source: string; skills: Record<string, SkillInfo>; records: Rec[];
  skillDamagePct: Record<string, number>;   // config_skill_damage kind-2 weapon % at min(level, 20)
  pageStats?: { strength?: number; source: string } | null;   // stats the game itself shows for the build
}

export interface PoolOptions {
  skill?: string;                    // include "skill:<skill>" records (supports, gem grants)
  tags: Set<number>;                 // skill tags + context tags + state tags
  scale?: (r: Rec) => number;        // aura/curse effect on buff records
  stacks?: (r: Rec) => number;       // per-stack buffs ("(multiplies)"): the record counts this many times
  exclude?: (r: Rec) => boolean;
  nodes?: number[];                  // default: attribute nodes
  targets?: number;                  // filter-1 target that must be listed (default 1 = self)
}

const ATTR_NODES = [101];   // 363/364/321 are item-local (gear base/implicit, weapon) and never reach the player pools

export class Pool {
  readonly mods = new Map<number, { bucket: number; lo: number; hi: number; src: string }[]>();
  constructor(records: Rec[], o: PoolOptions) {
    const nodes = o.nodes ?? ATTR_NODES;
    for (const r of records) {
      if (!nodes.includes(r.node) || r.attr === undefined) continue;
      const f = r.filter;
      if (f && (f[0] !== 1 || !(f[1] ?? []).includes(o.targets ?? 1))) continue;
      if (r.scope.startsWith("skill:") && r.scope !== `skill:${o.skill}`) continue;
      if (!(r.tags ?? []).every((t) => o.tags.has(t))) continue;
      if (o.exclude?.(r)) continue;
      const k = o.scale?.(r) ?? 1;
      const list = this.mods.get(r.attr) ?? [];
      for (let n = o.stacks?.(r) ?? 1; n > 0; n--) list.push({ bucket: r.bucket ?? 0, lo: r.lo * k, hi: (r.hi ?? 0) * k, src: r.src });
      this.mods.set(r.attr, list);
    }
  }
  private sum(attr: number, bucket: number, pick: "lo" | "hi" = "lo"): number {
    return (this.mods.get(attr) ?? []).filter((m) => m.bucket === bucket).reduce((a, m) => a + m[pick], 0);
  }
  base(attr: number): number { return this.sum(attr, 1); }
  inc(...attrs: number[]): number { return attrs.reduce((a, at) => a + this.sum(at, 3), 0); }
  more(...attrs: number[]): number {
    let m = 1;
    for (const at of attrs) for (const x of this.mods.get(at) ?? []) if (x.bucket === 4) m *= 1 + x.lo / 100;
    return m;
  }
  flat(attr: number): [number, number] { return [this.sum(attr, 2), this.sum(attr, 2, "hi")]; }
}

/** Records of one node type matching scope/tags (on-trigger 624, per-X 119/632, fields 108). */
export function select(records: Rec[], node: number | number[], o: { skill?: string; tags: Set<number> }): Rec[] {
  const nodes = Array.isArray(node) ? node : [node];
  return records.filter((r) => nodes.includes(r.node)
    && !(r.scope.startsWith("skill:") && r.scope !== `skill:${o.skill}`)
    && (r.tags ?? []).every((t) => o.tags.has(t)));
}

/** Attribute ids (EConfigAttributes) used by the calculators. */
export const A = {
  strength: 1, auraEffect: 3401, buffDuration: 3402, critRating: 4802, critDamage: 4803,
  phys: 5002, fire: 5107, cold: 5109, lightning: 5108, erosion: 5402, erosionPen: 5414,
  all: 5719, damageTaken: 5720, erosionTaken: 5408, elemental: 5727, attackSpeed: 6001, deterioration: 6302,
} as const;

/** Tags (EConfigSkillTag / EConfigCharState and the 5000xxx/5100xxx context tags seen in records). */
export const T = {
  thisSkill: 5000002, demolisherConsumed: 5000003, twoHanded: 5000792, onCrit: 5001010, minion: 5002060,
  curse: 5100301, aura: 5100305, deterioration: 5200065, lowLife: 4000410, standingStill: 4000700,
  holdingTwoHanded: 4000531, curseSkill: 6000150,
} as const;
