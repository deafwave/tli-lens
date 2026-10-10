import { describe, expect, test } from "vitest";
import { supportValueAt, type SupportGem } from "../src/supports.js";
import supportsData from "../../page/src/data/supports.ss13.json";  // SS13-temp
import supportsSs14 from "../../page/src/data/supports.json";
import { SEASONS } from "../src/seasons.js";
import modulesData from "../../page/src/data/modularization-skills.json";

/* mechanics.md#supports-ss13 — SS13 support-gem data transcribed from tlidb;
   values scale piecewise-linearly between the page's (LvN:v) anchors. */

describe("supportValueAt", () => {
  const multistrike = { "1": 101, "21": 121, "41": 141 };

  test("exact anchors return their value", () => {
    expect(supportValueAt(multistrike, 1)).toBe(101);
    expect(supportValueAt(multistrike, 21)).toBe(121);
    expect(supportValueAt(multistrike, 41)).toBe(141);
  });

  test("linear between anchors", () => {
    expect(supportValueAt(multistrike, 11)).toBeCloseTo(111, 9);
    expect(supportValueAt(multistrike, 31)).toBeCloseTo(131, 9);
  });

  test("clamps outside the anchor range", () => {
    expect(supportValueAt(multistrike, 0)).toBe(101);
    expect(supportValueAt(multistrike, 99)).toBe(141);
  });

  test("plateau anchors hold their step", () => {
    // Projectile Penetration: +2 at Lv1..8, +3 at Lv9..16
    const pen = { "1": 2, "8": 2, "9": 3, "16": 3, "17": 4, "24": 4, "25": 5, "99": 5 };
    expect(supportValueAt(pen, 5)).toBe(2);
    expect(supportValueAt(pen, 12)).toBe(3);
    expect(supportValueAt(pen, 30)).toBe(5);
  });
});

describe("supports.ss13.json (SS13-temp, frozen)", () => {
  const gems = supportsData.supports as SupportGem[];
  const byName = Object.fromEntries(gems.map((g) => [g.name, g]));

  // 25 tag-matched + 4 extra_gems ("Added X Damage"), minus the Added Fire
  // Damage that is both — the generator dedupes by name
  test("all 28 supports present, season marked", () => {
    expect(supportsData.season).toBe("SS13");
    expect(gems).toHaveLength(28);
    for (const g of gems) {
      expect(g.tags.length).toBeGreaterThan(0);
      expect(g.mana_mult_pct).toBeGreaterThan(0);
      expect(g.lines.length).toBeGreaterThan(0);
      for (const l of g.lines) {
        expect(["additional", "attack_speed", "added_flat", "info"]).toContain(l.kind);
        if (l.anchors) for (const v of Object.values(l.anchors)) expect(typeof v).toBe("number");
      }
    }
  });

  test("every module carries its SS13 program pool (a module runs 1-2 of them)", () => {
    const modules = modulesData.supports as SupportGem[];
    expect(modules.length).toBeGreaterThan(0);
    for (const m of modules) {
      expect(m.programs!.length, `${m.name} has no programs`).toBeGreaterThan(0);
      for (const p of m.programs!) {
        expect(p.name).toBeTruthy();
        expect(p.text).toBeTruthy();
        expect(p.tier).toBeGreaterThan(0);
      }
    }
    const goblin = modules.find((m) => m.name === "Module: Goblin Priest")!;
    const haste = goblin.programs!.find((p) => p.name === "Haste Protocol")!;
    expect(haste.text).toContain("+20% Attack, Cast, and Movement Speed");
    // Aura Overwrite / Source Code pools are SS12-only — must not leak in
    expect(goblin.programs!.some((p) => p.name.startsWith("Aura Overwrite"))).toBe(false);
  });

  test("spot values against tlidb SS13 blocks", () => {
    const ms = byName["Multistrike"].lines[0];
    expect(supportValueAt(ms.anchors!, 21)).toBe(121);
    const steam = byName["Steamroll"].lines.find((l) => l.text.includes("Melee"))!;
    expect(supportValueAt(steam.anchors!, 41)).toBe(51);
    // Haunt crosses zero: Lv17:0.2 .. Lv21:1 -> Lv20 = 0.8
    const haunt = byName["Haunt"].lines.find((l) => l.kind === "additional")!;
    expect(supportValueAt(haunt.anchors!, 20)).toBeCloseTo(0.8, 9);
    // Added Fire Damage carries the full per-level progression table
    const afd = byName["Added Fire Damage"].lines[0];
    expect(supportValueAt(afd.anchors!, 20)).toBe(73);
    expect(supportValueAt(afd.anchors2!, 20)).toBe(135);
  });
});

describe("supports.json (SS14)", () => {
  const gems = supportsSs14.supports as SupportGem[];
  const byName = Object.fromEntries(gems.map((g) => [g.name, g]));

  test("season marked; SS14 adds Blazing Scorch, Still Charge, Target Projection, Windbolt, Seize", () => {
    expect(supportsSs14.season).toBe("SS14");
    expect(gems).toHaveLength(32);
    for (const n of ["Blazing Scorch", "Still Charge", "Target Projection", "Windbolt", "Seize"])
      expect(byName[n], n).toBeTruthy();
  });
});

// the picker data and seasons.ts must agree, or the calc and the snapshot disagree
describe.each([
  ["ss13", supportsData],  // SS13-temp
  ["ss14", supportsSs14],
] as const)("seasons.ts anchors match supports data (%s)", (season, data) => {
  const byName = Object.fromEntries((data.supports as SupportGem[]).map((g) => [g.name, g]));
  const additional = (name: string) => byName[name].lines.find((l) => l.kind === "additional")!.anchors!;
  test("Elemental Fusion and Slow Projectile", () => {
    for (const lvl of [1, 21, 30, 41]) {
      expect(supportValueAt(additional("Elemental Fusion"), lvl)).toBeCloseTo(supportValueAt(SEASONS[season].fusion, lvl), 9);
      expect(supportValueAt(additional("Slow Projectile"), lvl)).toBeCloseTo(supportValueAt(SEASONS[season].slow_projectile, lvl), 9);
    }
  });
});
