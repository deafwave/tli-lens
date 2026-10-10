/* Temporary two-season switch for the Rehan model + Bing calculator (mechanics.md#seasons).

   SS13 exists only so the SS13 damage calculations can be finished. Then fail forward:
     1. delete the `ss13` entry below and narrow `Season` to "ss14"
     2. delete every *.ss13.json (written via seasonPath) and supports.ss13.json
     3. delete the page season switch (packages/page/src/season.ts)
     4. `grep -rn "SS13-temp"` must return nothing

   Only values that differ between seasons live here. Sources: SS14 patch notes
   (https://torchlight.xd.com/ss14pn/) and tlidb SS13Season/SS14Season blocks
   (Seething_Silhouette, Ice_Bond, Recuperation, Passivation, Slow_Projectile, Elemental_Fusion,
   Steamroll). */
import { supportValueAt } from "./supports.js";
import type { Snapshot } from "./damageModel.js";

export type Season = "ss13" | "ss14";
export const DEFAULT_SEASON: Season = "ss14";

type Anchors = Record<string, number>;

export interface SeasonValues {
  seething: number;          // Seething Silhouette T5: +X% additional damage while Berserk
  fury: number;              // Fury's Onslaught T5: +X% additional damage dealt by the player
  ice_bond: number;          // Ice Bond Euphoria L20: +X% additional Cold vs Frostbitten
  recuperation: Anchors;     // Combo Damage Enhancement (mechanics.md#combo-economy)
  passivation: Anchors;      // up to +X% additional Erosion Damage
  slow_projectile: Anchors;  // +X% additional damage
  fusion: Anchors;           // Elemental Fusion: +X% additional Elemental Damage
  steamroll: Anchors;        // +X% additional Melee Damage (tlidb; not in the patch notes)
  steamroll_as: number;      // Steamroll: X% Attack Speed (increased)
}

export const SEASONS: Record<Season, SeasonValues> = {
  ss13: {  // SS13-temp
    seething: 44, fury: 78, ice_bond: 28,
    recuperation: { 1: 5.5, 21: 15.5, 41: 21.5 },
    passivation: { 1: 41, 21: 61, 41: 81 },
    slow_projectile: { 1: 19.5, 21: 29.5, 41: 39.5 },
    fusion: { 1: 25.5, 21: 35.5, 41: 45.5 },
    steamroll: { 1: 31, 21: 41, 41: 51 }, steamroll_as: -15,
  },
  ss14: {
    seething: 34, fury: 68, ice_bond: 24,
    recuperation: { 1: 5.4, 21: 13.4, 41: 17.4 },
    passivation: { 1: 31, 21: 51, 41: 61 },
    slow_projectile: { 1: 18.5, 21: 28.5, 41: 33.5 },
    fusion: { 1: 22.5, 21: 32.5, 41: 36.5 },
    steamroll: { 1: 28.5, 21: 38.5, 41: 44.5 }, steamroll_as: -20,
  },
};

// Rage Infusion T5 (8 stacks x 5%) — same in both seasons
const RAGE_INFUSION = 40;

export function parseSeason(x: unknown): Season {
  const s = String(x ?? "").toLowerCase();
  return Object.hasOwn(SEASONS, s) ? (s as Season) : DEFAULT_SEASON;
}

// ponytail: one process-wide season so the CLI's many parseBuild call sites need no
// plumbing; pass `season` to parseBuild explicitly if two seasons ever run in one call.
let active: Season = DEFAULT_SEASON;
export const activeSeason = (): Season => active;
export function setActiveSeason(s: Season): void { active = s; }

/** The default season keeps the plain file name; others get a `.<season>` suffix. */
export function seasonPath(p: string, season: Season): string {
  return season === DEFAULT_SEASON ? p : p.replace(/\.json$/, `.${season}.json`);
}

/** Rehan season constants in manual_overrides.json shape (applied after that file). */
export function seasonOverrides(season: Season) {
  const v = SEASONS[season];
  // 2 decimals, the precision manual_overrides.json constants carry
  const traits = Math.round(((1 + v.seething / 100) * (1 + v.fury / 100) * (1 + RAGE_INFUSION / 100) - 1) * 10000) / 100;
  return {
    set: { "additional.ice_bond": v.ice_bond },
    add: { "additional.misc": traits },
    _sources: {
      "additional.ice_bond": `seasons.ts ${season}: Ice Bond Euphoria +${v.ice_bond}% additional Cold at L20 vs Frostbitten (mechanics.md#ice-bond)`,
      "additional.misc": `seasons.ts ${season}: Seething Silhouette +${v.seething}% (Berserk) x Fury's Onslaught +${v.fury}% x Rage Infusion +${RAGE_INFUSION}% (T5, full stacks, 100% Berserk uptime) = +${traits}% (mechanics.md#rehan-traits)`,
    },
  };
}

// Bing snapshot keys driven by `_gem_levels` (gem level incl. +support levels)
const GEM_TARGETS: Record<string, string[]> = {
  passivation: ["additional_typed", "erosion", "passivation"],
  slow_projectile: ["additional", "slow_projectile"],
  fusion: ["additional_typed", "elemental", "fusion"],
  // its attack-speed line is not re-seasoned here: rotation.attack_speed_inc_pct is a
  // sheet read whose Steamroll share is unverified (docs/bing-hoa-handoff.md)
  steamroll: ["additional", "steamroll"],
};

/** Copy of `snap` with its `_gem_levels` support values read from `season`'s anchors. */
export function applySeason<T extends Snapshot>(snap: T, season: Season): T {
  const out = structuredClone(snap);
  const levels: Record<string, number> = (out as any)._gem_levels ?? {};
  for (const [gem, lvl] of Object.entries(levels)) {
    const path = GEM_TARGETS[gem];
    if (!path) throw new Error(`applySeason: no season anchors for gem '${gem}'`);
    let d: any = out;
    for (const k of path.slice(0, -1)) d = d[k];
    d[path[path.length - 1]] = supportValueAt(SEASONS[season][gem as keyof SeasonValues] as Anchors, lvl);
  }
  return out;
}
