import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { fromRoot } from "../../src/py.js";
import { affixEdits } from "../../src/bingAffixMap.js";

/* mechanics.md#bing-affix-map — every live gear affix is mapped, irrelevant, or a listed unknown. */
const library: any[] = JSON.parse(fs.readFileSync(fromRoot("data/affix_library.json"), "utf-8")).affixes;
const top = (t: string) => t.replace(/\((-?[\d.]+)-(-?[\d.]+)\)/g, (_, _a, b) => b);

describe("Bing affix map", () => {
  test("weapon and gear lines map to the ledger's buckets", () => {
    expect(affixEdits("+216% Melee Damage", "w")).toEqual({ kind: "mapped", edits: [["add", "increased.melee", 216]] });
    expect(affixEdits("+6 to Attack Skill Level", "w")).toEqual({ kind: "mapped", edits: [["add", "aux.skill_level", 6]] });
    expect(affixEdits("+100% additional Attack Damage after standing still for 0.1s. -20% additional Attack Speed", "w1"))
      .toEqual({ kind: "mapped", edits: [["add", "additional.w1", 100], ["add", "aux.as_more_w1", -20]] });
    expect(affixEdits("Adds 73 - 89 Physical Damage to the gear", "weapon_p1")).toEqual(
      { kind: "mapped", edits: [["add", "base.weapon_phys_min", 73], ["add", "base.weapon_phys_max", 89]] });
    expect(affixEdits("Adds 44 - 59 Fire Damage to Attacks and Spells", "r")).toEqual(
      { kind: "mapped", edits: [["add", "base.flat_added_fire_min", 44], ["add", "base.flat_added_fire_max", 59]] });
    expect(affixEdits("+32% additional Deterioration Duration", "r")).toEqual(
      { kind: "mapped", edits: [["add", "deterioration.duration_inc_pct", 32]] });
    expect(affixEdits("+3 Cold Skill Level", "r").kind).toBe("irrelevant");
    expect(affixEdits("+220 Max Life", "r").kind).toBe("irrelevant");
  });

  test("gear-local lines only count on the weapon", () => {
    expect(affixEdits("+80% Gear Physical Damage", "gear_p1").kind).toBe("irrelevant");
    expect(affixEdits("+80% Gear Physical Damage", "weapon_p1").kind).toBe("mapped");
  });

  test("every library affix is classified; the unknowns are the listed damage-shaped ones", () => {
    const unknown = new Set<string>();
    for (const a of library) {
      const t1 = a.tiers.find((t: any) => t.tier === "T1") ?? a.tiers[0];
      const res = affixEdits(top(t1.text), /Hammer|Sword|Axe|Claw|Dagger|Wand|Rod|Scepter|Cane|Staff|Cudgel|Pistol|Bow|Musket|Cannon/.test(a.slot) ? "weapon" : "gear");
      if (res.kind === "unknown") unknown.add(top(t1.text).replace(/[\d.]+/g, "#").split("\n")[0]);
    }
    expect([...unknown].sort()).toMatchSnapshot();
  });
});
