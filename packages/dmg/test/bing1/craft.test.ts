import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { fromRoot } from "../../src/py.js";
import { craftOptions, craftSource, type LibraryAffix } from "../../src/bingCraft.js";

/* mechanics.md#bing-craft — expected embers from the live affix weights. */
const library: LibraryAffix[] = JSON.parse(fs.readFileSync(fromRoot("data/affix_library.json"), "utf-8")).affixes;

describe("Bing rare crafting", () => {
  test("T1 Melee on a 2H hammer at item level 86: 1 / (20000/240000 × 100/20000) = 2,400 Precious Embers", () => {
    const melee = craftOptions(library, "Two-Handed Hammer", 86)
      .find(o => o.tier === "T1" && /Melee Damage$/.test(o.text) && o.grade === "Basic")!;
    expect(melee.text).toBe("+216% Melee Damage");
    expect(melee.ember).toBe("Precious Ember");
    expect(melee.expectedEmbers).toBeCloseTo(2400, 6);
  });

  test("item level gates tiers: at 72 the best Melee tier is T4, and it is easier to land", () => {
    const at72 = craftOptions(library, "Two-Handed Hammer", 72).filter(o => /Melee Damage$/.test(o.text) && o.grade === "Basic");
    expect(at72.map(o => o.tier)).toEqual(["T4", "T5", "T6", "T7"]);
    // P(tier ≥ T4) = (3200+3200+6250+6250 → T4 is the best of 18,900 allowed weight) = 3200/18900
    expect(at72[0].expectedEmbers).toBeCloseTo(12 * 18900 / 3200, 6);
  });

  test("+6 Attack Skill Level needs item level 100", () => {
    expect(craftOptions(library, "Two-Handed Hammer", 99).some(o => /Attack Skill Level/.test(o.text))).toBe(false);
    expect(craftOptions(library, "Two-Handed Hammer", 100).some(o => o.text === "+6 to Attack Skill Level")).toBe(true);
  });

  test("a craft option becomes a ledger source on its item, with its own family and grade cap", () => {
    const o = craftOptions(library, "Two-Handed Hammer", 100).find(x => x.text === "+6 to Attack Skill Level")!;
    const s = craftSource(o, "mainHand", 123)!;
    expect(s.edits).toEqual([["add", "aux.skill_level", 6]]);
    expect(s.slot).toBe("mainHand.prefix");
    expect(s.caps).toEqual(["mainHand.ultimate"]);
    expect(s.cost).toBe(123);
    expect(s.family).toBe(`mainHand_${o.affixId}`);
    const life = craftOptions(library, "Ring", 86).find(x => /Max Life$/.test(x.text))!;
    expect(craftSource(life, "ring1", 1)).toBeNull();
  });
});
