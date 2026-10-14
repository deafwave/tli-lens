import { describe, expect, test } from "vitest";
import {
  armorFactor, armorRatio, critChance, critMultiplier, foldMore, hitDps, resistanceFactor, stat,
} from "../src/clientDps.js";

/* Live character sheet dumped by the client's own Lua (RoleAttrMgr lines in
   UE_game.log, 2026-10-11 03:32:06) — dps-debug/evidence/charsheet_latest.tsv. */
const sheet = {
  fire: [1522647.6990037, 1702782.3598234] as [number, number],
  attackSpeed: 2.068416,
  critChancePct: 57.05,
  critRatingBonus: 1041,
  critDamage: 324,
  attackDps: 7598607.107851,
};

describe("clientDps reproduces the in-game character sheet", () => {
  test("Attack DPS to the last digit", () => {
    const dps = hitDps({
      damage: { fire: sheet.fire },
      rate: sheet.attackSpeed,
      critRating: sheet.critChancePct * 100,
      critDamage: sheet.critDamage,
    });
    expect(dps).toBeCloseTo(sheet.attackDps, 5);
  });

  test("attack speed: 1.71 base × (1+44%) × (1−16% additional)", () => {
    expect(stat(1.71, [44], [-16])).toBeCloseTo(sheet.attackSpeed, 9);
  });

  test("crit chance: 500 rating × (1+1041%) → 57.05%", () => {
    expect(critChance(stat(500, [sheet.critRatingBonus])) * 100).toBeCloseTo(sheet.critChancePct, 9);
  });
});

describe("clientDps mirrors the decompiled formulas", () => {
  test("increased sums, additional multiplies", () => {
    expect(stat(100, [50, 50], [100, 100])).toBe(800);
    expect(foldMore([100, 100])).toBe(300);
  });

  test("crit: 100% baseline, victim reduction scales only the bonus, lucky rolls twice", () => {
    expect(critMultiplier(324)).toBeCloseTo(3.24, 12);
    expect(critMultiplier(300, 50)).toBe(2);
    expect(critMultiplier(90)).toBe(1);
    expect(critChance(5000, true)).toBe(0.75);
    expect(critChance(20000)).toBe(1);
  });

  test("resistance: cap first, then penetration, unclamped", () => {
    expect(resistanceFactor(90, 75, 0)).toBe(0.25);
    expect(resistanceFactor(90, 75, 20)).toBe(0.45);
    expect(resistanceFactor(10, Infinity, 30)).toBeCloseTo(1.2, 12);
  });

  test("armor: armor / (0.9·armor + 30000), scaled by efficiency, capped, then pen", () => {
    expect(armorRatio(30000)).toBeCloseTo(30000 / 57000, 12);
    expect(armorFactor(0.5, 100, 40, 10)).toBeCloseTo(0.7, 12);
  });

  test("defences combine per element and floor at zero", () => {
    const a = { damage: { physical: [100, 100] as [number, number], fire: [100, 100] as [number, number] },
      rate: 1, critRating: 0, critDamage: 150 };
    const dps = hitDps(a, {
      armor: 30000, armorEfficiency: { physical: 100 }, res: { fire: 50 }, taken: 1.1,
    });
    expect(dps).toBeCloseTo(100 * (1 - 30000 / 57000) * 1.1 + 100 * 0.5 * 1.1, 9);
    expect(hitDps(a, { taken: -1 })).toBe(0);
  });
});
