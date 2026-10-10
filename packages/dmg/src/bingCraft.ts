/* Rare-gear craft options for the Bing guide (mechanics.md#bing-craft).

   One ember of a grade (Precious → Basic, Matchless → Advanced, Ultimate → Ultimate) adds a
   random affix of that grade for the gear type, picked by affix weight; its tier is rolled
   by tier weight among the tiers the item level allows (data/affix_library.json, live game
   memory). Expected embers to land "affix A at tier ≥ t" is 1 / (P(A) × P(tier ≥ t)).
   T0 is a T1 line upgraded with Ultimate Ember at the Arms Dealer (tlidb Ultimate Ember);
   T0+ is a corrupted T0 (user 2026-10-09) — both priced from inputs, not weights.
   Pure: no I/O; the caller passes the library. */
import type { Source } from "./bingLedger.js";
import { affixEdits } from "./bingAffixMap.js";

export interface LibraryTier { tier: string; text: string; requiredLevel: number; weight: number }
export interface LibraryAffix {
  slot: string; grade: "Basic" | "Advanced" | "Ultimate"; side: "Prefix" | "Suffix";
  affixId: string; weight: number; effect: string; tiers: LibraryTier[];
}

export const EMBER_FOR_GRADE = { Basic: "Precious Ember", Advanced: "Matchless Ember", Ultimate: "Ultimate Ember" } as const;

export interface CraftOption {
  affixId: string; gearType: string; grade: LibraryAffix["grade"]; side: LibraryAffix["side"];
  tier: string; text: string; requiredLevel: number;
  /** expected embers of `ember` to land this affix at this tier or better */
  expectedEmbers: number; ember: string;
}

const tierRank = (t: string) => Number(t.replace(/^T/, ""));   // T1 best … T7 worst
const topRoll = (text: string) => text.replace(/\((-?[\d.]+)-(-?[\d.]+)\)/g, (_, _a, b) => b);

/** Every reachable (affix, tier) on `gearType` at `itemLevel`, with its expected ember count. */
export function craftOptions(library: LibraryAffix[], gearType: string, itemLevel: number): CraftOption[] {
  const pool = library.filter(a => a.slot === gearType);
  const gradeWeight = (g: string) => pool.filter(a => a.grade === g).reduce((s, a) => s + a.weight, 0);
  const out: CraftOption[] = [];
  for (const a of pool) {
    const allowed = a.tiers.filter(t => t.requiredLevel <= itemLevel);
    const total = allowed.reduce((s, t) => s + t.weight, 0);
    if (!total) continue;
    const pAffix = a.weight / gradeWeight(a.grade);
    for (const t of allowed) {
      const atLeast = allowed.filter(x => tierRank(x.tier) <= tierRank(t.tier)).reduce((s, x) => s + x.weight, 0);
      out.push({ affixId: a.affixId, gearType, grade: a.grade, side: a.side, tier: t.tier,
                 text: topRoll(t.text), requiredLevel: t.requiredLevel,
                 expectedEmbers: 1 / (pAffix * (atLeast / total)), ember: EMBER_FOR_GRADE[a.grade] });
    }
  }
  return out;
}

const WEAPONS = /Sword|Hammer|Axe|Claw|Dagger|Wand|Rod|Scepter|Cane|Staff|Cudgel|Pistol|Bow|Musket|Cannon/;

/** A craft option as a ledger Source on item `item` (e.g. "helmet"), or null when it adds no Bing DPS. */
export function craftSource(o: CraftOption, item: string, cost: number | null): Source | null {
  const key = `${item}_${o.affixId}`;
  const m = affixEdits(o.text, WEAPONS.test(o.gearType) ? `weapon_${key}` : `gear_${key}`);
  if (m.kind !== "mapped") return null;
  return {
    id: `craft_${key}_${o.tier}`, label: `${item} ${o.side.toLowerCase()} ${o.tier}: ${o.text.replace(/\n/g, " / ")}`,
    group: "upgrade", slot: `${item}.${o.side.toLowerCase()}`, family: `${item}_${o.affixId}`,
    caps: o.grade === "Ultimate" ? [`${item}.ultimate`] : undefined,
    edits: m.edits, cite: `data/affix_library.json ${o.gearType} ${o.affixId} ${o.tier}`,
    cost: cost ?? undefined, level: o.requiredLevel,
  };
}
