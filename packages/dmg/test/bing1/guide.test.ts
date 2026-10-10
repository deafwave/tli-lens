import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { fromRoot } from "../../src/py.js";
import { buildGuide, guidePool, talentPoints, DEFAULT_STAGES } from "../../src/bingGuide.js";

/* mechanics.md#bing-guide — invariants of the level-60 → endgame guide, on fixed test prices. */
const library = JSON.parse(fs.readFileSync(fromRoot("data/affix_library.json"), "utf-8")).affixes;
const PRICES: Record<string, number> = {
  "Precious Ember": 0.06, "Matchless Ember": 0.3, "Ultimate Ember": 20,
  "Fool's Crown": 57, "Death's Touch": 55, "Ruinous Star": 3, "Blade-dancer's Steps": 15,
  "Formation Breaker": 12, "Broken Sun Ring": 15, "Kaleidoscope": 7,
  "Weapon Amplification": 1, "Erosion Amplification": 1, "Cruelty": 2, "Precise Projectiles": 3,
};
const inputs = { library, price: (n: string) => PRICES[n] };

describe("Bing guide", () => {
  let guide: ReturnType<typeof buildGuide> | undefined;
  const g = () => (guide ??= buildGuide(inputs));

  test("starts near zero at level 60 and never loses DPS between stages", () => {
    expect(g().zeroDps).toBeGreaterThan(100);
    expect(g().zeroDps).toBeLessThan(10_000);
    const dps = g().stages.map(s => s.dps);
    for (let i = 1; i < dps.length; i++) expect(dps[i]).toBeGreaterThanOrEqual(dps[i - 1]);
    expect(dps.at(-1)! / g().zeroDps).toBeGreaterThan(1e6);
  }, 60_000);

  test("spending stays within the cumulative budget; nothing above its stage level", () => {
    const { pool } = guidePool(inputs);
    const byId = new Map(pool.map(s => [s.id, s]));
    let budget = 0, spent = 0;
    for (const [n, st] of g().stages.entries()) {
      budget += DEFAULT_STAGES[n].budget;
      spent += st.spent;
      expect(spent).toBeLessThanOrEqual(budget + 1e-6);
    }
    for (const step of g().steps)
      for (const id of step.ids) expect(byId.get(id)?.level ?? 0).toBeLessThanOrEqual(DEFAULT_STAGES[step.stage].level);
  }, 60_000);

  test("talent trees fit the level's points; a legendary clears its slot's rare lines", () => {
    const { pool, start } = guidePool(inputs);
    const byId = new Map([...start, ...pool].map(s => [s.id, s]));
    for (const [n, st] of g().stages.entries()) {
      const points = st.sources.map(id => byId.get(id)!).filter(s => s.slot === "talent")
        .reduce((p, s) => p + (s.size ?? 1), 0);
      expect(points).toBeLessThanOrEqual(talentPoints(DEFAULT_STAGES[n].level));
      if (st.sources.includes("deaths_touch")) expect(st.sources.some(id => id.startsWith("craft_gloves_"))).toBe(false);
    }
  }, 60_000);

  test("rare items respect 3 prefix / 3 suffix / 2 Ultimate even when no legendary is affordable", () => {
    const LEGENDARY = new Set(["Fool's Crown", "Death's Touch", "Ruinous Star", "Blade-dancer's Steps",
      "Formation Breaker", "Broken Sun Ring", "Kaleidoscope"]);
    const rareOnly = { library, price: (n: string) => (LEGENDARY.has(n) ? undefined : PRICES[n]) };
    const { pool, start } = guidePool(rareOnly);
    const byId = new Map([...start, ...pool].map(s => [s.id, s]));
    const last = buildGuide(rareOnly).stages.at(-1)!;
    const count = new Map<string, number>();
    for (const s of last.sources.map(id => byId.get(id)!))
      for (const key of [s.slot, ...s.caps ?? []]) if (key) count.set(key, (count.get(key) ?? 0) + 1);
    for (const [key, n] of count)
      if (/\.(prefix|suffix)$/.test(key)) expect(n, key).toBeLessThanOrEqual(3);
      else if (key.endsWith(".ultimate")) expect(n, key).toBeLessThanOrEqual(2);
  }, 300_000);   // ~90–100s alone: the budgeted walk is slow (bingGuide)
});
