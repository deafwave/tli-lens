/* Hit-DPS calculator built only from formulas recovered from the game client
   (torchlight_infinite.exe, sha256 in dps-debug/evidence/exe.sha256). Every function names the
   native function it mirrors; the decompiled sources live in dps-debug/evidence/*.ann.c.
   All combat math in the client is SoftFloat f64 (deterministic), so plain JS numbers match it.

   Not modelled: DoT, conversion, per-tag modifier filtering, random rolls on the victim side
   (double armor, resistance inversion). Values that live in the encrypted data tables
   (resistance caps, armor efficiency, level-scaled armor constants) are inputs, not defaults. */

export type Element = "physical" | "lightning" | "cold" | "fire" | "erosion";
export type Range = [min: number, max: number];

/** UCAttributeComponent::GetFinalRange (FUN_141d28c70): increased lines are summed, every
 *  additional line multiplies separately. Base and spread are flat; `range` is [base, base+spread]. */
export function stat(base: number, inc: number[] = [], more: number[] = []): number {
  const sumInc = inc.reduce((a, b) => a + b, 0);
  return more.reduce((m, x) => m * (1 + x / 100), base * (1 + sumInc / 100));
}

export function statRange([min, max]: Range, inc: number[] = [], more: number[] = []): Range {
  return [stat(min, inc, more), stat(max, inc, more)];
}

/** The character sheet's single "Additional … Bonus" % for a list of additional lines:
 *  (Π(1+m/100) − 1)·100 (FUN_141bdddc0, source kind 4). */
export function foldMore(more: number[]): number {
  return (stat(1, [], more) - 1) * 100;
}

/** FUN_141e11050: crit if a roll in [0,100) ≤ chance%. Chance% = rating / 100
 *  (sheet: 500 base × (1 + 1041%) = 5705 → "57.05"). Lucky = two rolls, either crits. */
export function critChance(rating: number, lucky = false): number {
  const p = Math.min(1, Math.max(0, rating / 10000));
  return lucky ? 1 - (1 - p) ** 2 : p;
}

/** FUN_141e11228: 1 + (critDmg% − 100)/100 · (100 − victim crit-damage reduction%)/100; falls back
 *  to ×1 when either bracket is ≤ 0. Crit damage is the sheet total (e.g. 324 = ×3.24). */
export function critMultiplier(critDamagePct: number, victimReductionPct = 0): number {
  const bonus = critDamagePct - 100;
  const kept = 100 - victimReductionPct;
  return bonus > 0 && kept > 0 ? 1 + (bonus / 100) * (kept / 100) : 1;
}

/** FUN_141dd6ee0 / FUN_141dd6a40: penetration is subtracted after the cap and nothing clamps the
 *  result, so pen beyond the remaining resistance makes the factor exceed 1. */
export function resistanceFactor(res: number, cap = Infinity, pen = 0): number {
  return (100 - (Math.min(res, cap) - pen)) / 100;
}

/** FUN_141e12200 default branch: armor / (0.9·armor + 30000). The level-scaled branch swaps the
 *  30000 for data-table constants; pass `denominator` to use it. */
export function armorRatio(armor: number, denominator = 0.9 * armor + 30000): number {
  return armor > 0 ? armor / denominator : 0;
}

/** FUN_141e12200 / FUN_141dd6a40: same min-then-pen shape as resistance, ratio scaled by the
 *  victim's armor efficiency for that element (%). Unclamped, like the client. */
export function armorFactor(ratio: number, efficiencyPct: number, capPct = Infinity, penPct = 0): number {
  return 1 - (Math.min(ratio * efficiencyPct, capPct) - penPct) / 100;
}

export interface Enemy {
  /** Effective resistance per element (lightning/cold/fire already include "elemental resistance"). */
  res?: Partial<Record<Element, number>>;
  /** min(victim resistance cap, global cap) — both are data-table values. */
  resCap?: Partial<Record<Element, number>>;
  armor?: number;
  armorDenominator?: number;
  /** Victim armor efficiency per element, % (physical-only armor = { physical: 100 }). */
  armorEfficiency?: Partial<Record<Element, number>>;
  armorCap?: number;
  critDamageReduction?: number;
  /** Victim "damage taken" final values, used as plain multipliers (1 = none). */
  taken?: number;
  takenBy?: Partial<Record<Element, number>>;
  takenElemental?: number;
}

export interface Attacker {
  /** Final per-element hit range, i.e. statRange(base, inc, more) — the sheet's "… Damage". */
  damage: Partial<Record<Element, Range>>;
  rate: number;
  critRating: number;
  critDamage: number;
  lucky?: boolean;
  pen?: Partial<Record<Element, number>>;
  armorPen?: number;
}

const ELEMENTAL = new Set<Element>(["lightning", "cold", "fire"]);

/** FUN_141e12200 per element: armor × resistance (physical has no resistance) × taken, floored at 0. */
export function elementMultiplier(e: Element, a: Attacker, enemy: Enemy = {}): number {
  const ratio = armorRatio(enemy.armor ?? 0, enemy.armorDenominator);
  let m = armorFactor(ratio, enemy.armorEfficiency?.[e] ?? 0, enemy.armorCap, a.armorPen ?? 0);
  if (e !== "physical") m *= resistanceFactor(enemy.res?.[e] ?? 0, enemy.resCap?.[e], a.pen?.[e] ?? 0);
  m *= (enemy.takenBy?.[e] ?? 1) * (enemy.taken ?? 1);
  if (ELEMENTAL.has(e)) m *= enemy.takenElemental ?? 1;
  return Math.max(0, m);
}

/** Sheet "Attack DPS": avg hit × rate × (1 + p·(crit − 1)). Reproduces the in-game number exactly
 *  against a dummy with no defences (see test/clientDps.test.ts). */
export function hitDps(a: Attacker, enemy: Enemy = {}): number {
  let hit = 0;
  for (const [e, r] of Object.entries(a.damage) as [Element, Range][])
    hit += ((r[0] + r[1]) / 2) * elementMultiplier(e, a, enemy);
  const p = critChance(a.critRating, a.lucky);
  return hit * a.rate * (1 + p * (critMultiplier(a.critDamage, enemy.critDamageReduction) - 1));
}
