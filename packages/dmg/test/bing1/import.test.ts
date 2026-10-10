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
  });
});
