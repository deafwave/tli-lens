import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { cycleDps } from "../../src/damageModel.js";
import { fromRoot } from "../../src/py.js";
import { applySeason } from "../../src/seasons.js";
import { importBing } from "../../src/bingImport.js";
import { BING_ZERO, compose, effective } from "../../src/bingLedger.js";

/* mechanics.md#bing-import — the importer against the hand-encoded reference and a scraped build. */
const load = (p: string) => JSON.parse(fs.readFileSync(fromRoot(p), "utf-8"));
const july = () => importBing(load("data/bing1/real_buld_3.json"));
const pro1t = () => { const d = load("data/bing1/scraped/pro-1t.json"); return importBing(d.compendium, 0, d.nativeTalents, d.nativePrisms); };
const mine = () => { const d = load("data/bing1/scraped/my-build-2026-10-10.json"); return importBing(d.compendium, 0, d.nativeTalents, d.nativePrisms); };
const hanshan = () => { const d = load("data/bing1/scraped/hanshan-40t.json"); return importBing(d.compendium, 0, d.nativeTalents, d.nativePrisms); };

describe("Bing importer", () => {
  test("July export: every line classified; crit chance matches the in-game sheet (65.05%)", () => {
    const r = july();
    expect(r.lines.filter(l => l.kind === "unknown")).toEqual([]);
    expect(r.snapshot.crit.chance_pct).toBeCloseTo(65.05, 2);
    expect(r.snapshot.additional.strength).toBeCloseTo(169.5, 6);   // sheet Str 339
  });

  test("model matches the in-game dummy (game-time DPS): today's build exactly, the July export within its missing prism data", () => {
    // mechanics.md#bing-hit-channels — DeafwaveB 2026-10-10, 4 game-time baselines 462.4/472.4/464.6/469.7B
    const dps = (r: ReturnType<typeof importBing>) => cycleDps(applySeason(r.snapshot, "ss13")).dps / 1e9;
    expect(dps(mine()) / 467.3).toBeGreaterThan(0.98);
    expect(dps(mine()) / 467.3).toBeLessThan(1.02);
    // July 557.75B span; the planner export lacks native prism placements (Haze +36 crit damage, +12% base)
    expect(dps(july()) / 557.75).toBeGreaterThan(0.94);
    expect(dps(july()) / 557.75).toBeLessThan(1.02);
  }, 30_000);

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
  test("pactspirit boards drop the nodes a kismet occupies; Iron Lion's knockback and fate import", () => {
    const sum = (r: ReturnType<typeof importBing>, label: RegExp, path: string) => r.sources
      .filter(s => label.test(s.label)).flatMap(s => s.edits)
      .reduce((t, e) => t + (e[0] === "add" && e[1] === path ? e[2] as number : 0), 0);
    // hanshan: kismets on Saintess nodes 4/5/6 (+14/+14/+28% Erosion) -> 112 - 56
    expect(sum(hanshan(), /^pactspirit: Portrait of a Fallen Saintess/, "increased.erosion")).toBe(56);
    // July: the full Iron Lion board reproduces the hand ledger's knockback source and +6 fate damage
    expect(sum(july(), /^pactspirit: Iron Lion/, "aux.knockback")).toBe(48);
    expect(sum(july(), /^pactspirit: Iron Lion/, "increased.global")).toBe(6);
  });
  test("1T dummy build: Ice Bond is a Sentry charge engine; Entangled Pain, Bull's Rage and Tenacity import", () => {
    const r = pro1t();
    const snap: any = compose(BING_ZERO, effective(r.sources));
    expect(snap.rotation.demolisher_every_n).toBe(1);
    expect(snap.rotation.demolisher_resto_pct).toBeUndefined();
    expect(snap.additional.tenacity).toBeCloseTo((1.08 ** 6 - 1) * 100, 6);   // 4 base + 2 max stacks
    expect(snap.additional.bulls_rage).toBeCloseTo(0.75 * 25.5, 9);           // L17, 75% uptime
    expect(r.sources.find(s => /Entangled Pain/.test(s.label))?.provides).toContain("curse");
    expect(r.lines.filter(l => l.kind === "unknown").map(l => l.text).sort()).toEqual([
      "+1 Max Charges", "+30% Bond Gaining Speed", "Converts 50% of Lightning Damage to Fire Damage", "Unable to trigger Empower Skills"]);
  }, 30_000);
  test("Haze prism: 4x3 area and base affix import (catalog GUIDs shared by two game ids); sheet crit damage 324", () => {
    const r = mine();
    expect(compose(BING_ZERO, effective(r.sources)).crit.damage_pct).toBe(324);   // in-game sheet 2026-10-10
    expect(r.sources.some(s => /prism:51:base: \+12% additional Base Damage for Two-Handed Weapons/.test(s.label))).toBe(true);
    expect(r.lines.filter(l => l.kind === "unknown")).toEqual([]);
  }, 30_000);
  test("model ablations match the 2026-10-10 game-time A/Bs within 2%", () => {
    // mechanics.md#bing-game-time / #bing-hit-channels — measured ratio = baseline / state-off
    const r = mine();
    const dps = (drop?: RegExp, tweak?: (s: any) => void) => {
      const s: any = applySeason(compose(BING_ZERO, effective(r.sources.filter(x => !drop || !drop.test(x.label)))), "ss13");
      tweak?.(s);
      return cycleDps(s).dps;
    };
    const base = dps();
    const cases: [RegExp, number, ((s: any) => void)?][] = [
      [/skill:Timid/, 1.414], [/Elemental Fusion/, 1.192], [/Passivation/, 1.622], [/Steamroll/, 1.405],
      [/Upheaval/, 1.217], [/Precise Projectiles/, 1.320], [/Precise: Cruelty/, 1.507], [/Slow Projectile/, 1.202],
      // Flame Core off: no Sentry → no Formation Breaker charges, no Sentry-proximity taken; Bull's Rage uptime 75% → 58%
      [/skill:Flame Core/, 4.09, s => { s.additional.bulls_rage *= 0.58 / 0.75; }],
    ];
    for (const [drop, meas, tweak] of cases) expect(base / dps(drop, tweak) / meas, String(drop)).toBeCloseTo(1, 1.4);
  }, 30_000);
});
