import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { cycleDps } from "../../src/damageModel.js";
import { fromRoot } from "../../src/py.js";
import { applySeason } from "../../src/seasons.js";
import { importBing } from "../../src/bingImport.js";

/* mechanics.md#bing-import — the importer against the hand-encoded reference and a scraped build. */
const load = (p: string) => JSON.parse(fs.readFileSync(fromRoot(p), "utf-8"));
const july = () => importBing(load("data/bing1/real_buld_3.json"));
const hanshan = () => { const d = load("data/bing1/scraped/hanshan-40t.json"); return importBing(d.compendium, 0, d.nativeTalents, d.nativePrisms); };

describe("Bing importer", () => {
  test("July export: every line classified; crit chance matches the in-game sheet (65.05%)", () => {
    const r = july();
    expect(r.lines.filter(l => l.kind === "unknown")).toEqual([]);
    expect(r.snapshot.crit.chance_pct).toBeCloseTo(65.05, 2);
    expect(r.snapshot.additional.strength).toBeCloseTo(169.5, 6);   // sheet Str 339
  });

  test("July import sits below the hand snapshot by exactly its unexplained residuals (×1.25–1.40)", () => {
    const imp = cycleDps(applySeason(july().snapshot, "ss13")).dps;
    const hand = cycleDps(applySeason(load("data/bing1/real_buld_3_snapshot.json"), "ss13")).dps;
    expect(hand / imp).toBeGreaterThan(1.25);
    expect(hand / imp).toBeLessThan(1.40);
  });

  test("scraped 40T build: talents rebuilt from native records, traits from memories, only listed unknowns", () => {
    const r = hanshan();
    expect(r.kit.traitLevels).toMatchObject({ "Blast Barrage": 4, "Frenzy Hound": 4, "Firepower Coverage": 2 });
    expect(r.lines.some(l => l.source.startsWith("tree:"))).toBe(true);
    expect(r.lines.filter(l => l.kind === "unknown").map(l => l.text)).toEqual(["+1 Max Charges"]);
    expect(cycleDps(applySeason(r.snapshot, "ss13")).deterioration_dps).toBeGreaterThan(0);
    // Phantasmagoria (Shadowmaster, 3x3): +17.5 Str on each of the three allocated medium nodes in its area
    expect(r.lines.filter(l => l.source.startsWith("prism:") && l.text === "+17.5 Strength")).toHaveLength(3);
    // Inverse Image (Onslaughter, center col 12 row 1): reflects the 3x3 area's Medium talents at +2%
    // (Micro/Legendary −100%) keeping their points — the in-game panel's mirrored copies (user screenshot)
    const inv = r.lines.filter(l => l.source.startsWith("inverse:12:"));
    expect([...new Set(inv.map(l => l.source))].sort()).toEqual(["inverse:12:12040100", "inverse:12:12060100", "inverse:12:12060200"]);
    expect(inv.some(l => l.text === "+40% Attack Critical Strike Rating when holding a Two-Handed Weapon")).toBe(true);
  });
  test("Support Skill Level raises table-priced supports; spare Vorax and empty trees are safe", () => {
    // Off The Beaten Track +4 Support Skill Level: Critical Strike Damage Increase L20 -> L24
    expect(hanshan().sources.some(s => /Critical Strike Damage Increase L24/.test(s.label))).toBe(true);

    const d = load("data/bing1/scraped/hanshan-40t.json");
    const lo = d.compendium.loadouts.loadouts[0];
    const vxLines = (r: ReturnType<typeof importBing>) => r.lines.filter(l => l.source.startsWith("vorax:")).length;
    const base = vxLines(importBing(d.compendium, 0, d.nativeTalents, d.nativePrisms));
    const spare = structuredClone(lo.vorax.inventory[0]);
    spare.id = "unequipped-spare";
    lo.vorax.inventory.push(spare);
    delete lo.skillTree.slots[0].nodePoints;
    const r = importBing(d.compendium, 0, d.nativeTalents, d.nativePrisms);
    expect(vxLines(r)).toBe(base);
  });

  test("the Formation Breaker Sentry line needs a Sentry source", () => {
    const r = hanshan();
    const sentryLine = r.sources.find(s => /proximity to Sentries/.test(s.label));
    if (sentryLine) expect(sentryLine.requires).toContain("sentry");
  });
});
