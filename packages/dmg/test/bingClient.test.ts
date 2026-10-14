import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { bingDps, DEFAULT_ASSUMPTIONS } from "../src/bingClient.js";
import type { BuildModel } from "../src/clientModel.js";
import { Pool } from "../src/clientModel.js";
import { hitDps } from "../src/clientDps.js";

const load = (slug: string): BuildModel =>
  JSON.parse(fs.readFileSync(new URL(`../data/client/builds/${slug}.json`, import.meta.url), "utf-8"));

describe("40T pro build (寒山寺40万亿) from game-compiled records", () => {
  const m = load("40t");

  test("records reproduce the in-game sheet where the sheet is complete", () => {
    // sheet_40t.tsv: Erosion Damage Bonus 408, Erosion Penetration 26, Curse Effect 6, crit damage 802.2 (150 base)
    const p = new Pool(m.records, { skill: "Hammer of Ash", tags: new Set([...m.skills["Hammer of Ash"].tags, 5000002]) });
    expect(p.inc(5402)).toBe(408);
    expect(p.inc(5719)).toBeCloseTo(278.3, 9);                 // Damage Bonus (Judgment: melee slate 9 x 1.7)
    expect(p.base(5414)).toBe(26);
    expect(new Pool(m.records, { tags: new Set([5100301]) }).inc(3401)).toBe(6);
    expect(150 + p.base(4803)).toBeCloseTo(802.2, 9);   // incl. the Inverse Image copy of 12040100 at 102%
  });

  test("skill levels and support values come from the data", () => {
    expect(m.skills["Hammer of Ash"].level).toBe(33);   // 20 +6 attack +1 talent +2 +2 +2 (Judgment slates: GetRoundInt[1.7] per line)
    expect(m.skills["Precise: Erosion Amplification"].level).toBe(23);   // 20 + round(1 + 1.7) (FUN_14270fa10 mode 4)
  });

  test("crit chance equals the sheet's 89.378919% (lucky, 500 fixed rating, Fervor, prisms)", () => {
    expect(bingDps(m).critChance * 100).toBeCloseTo(89.378919, 6);
  });

  test("the in-game tooltip 269,180,549.66 is the sheet's single weapon-APS hit, and the factors to our DPS", () => {
    // sheet_40t.tsv: Total Main-Hand Attack Damage x Main-Hand Attack Speed x crit (89.378919%, 802.2%)
    const tip = hitDps({ damage: { fire: [16074997.045014, 18440157.460607] }, rate: 2.14368, critRating: 8937.8919, critDamage: 802.2 });
    expect(tip).toBeCloseTo(269180549.66204, 3);
    const r = bingDps(m);
    const sheetHit = (16074997.045014 + 18440157.460607) / 2;
    const chain = {
      rate: (r.throwRate * r.bombsPerThrow) / 2.14368,              // bombs/s vs weapon attacks/s
      hitsPerBomb: 1 + r.q * DEFAULT_ASSUMPTIONS.explosionScale * r.upheaval,
      perHit: (r.hit * r.moreTrig) / sheetHit,                      // empowered pummel, non-crit, pre-enemy
      crit: r.critFactor / (1 + 0.89378919 * (8.022 - 1)),
      enemy: r.enemy,
      deterioration: 1 + r.detFactor,
    };
    const product = Object.values(chain).reduce((a, x) => a * x, 1);
    expect(product * tip / r.dps).toBeCloseTo(1, 9);
    console.log("40T tooltip -> calculator", JSON.stringify(chain));
  });

  test("Strength from the records equals the game's 928 (pro-build Stats page) once Judgment boosts the slates", () => {
    const r = bingDps(m);
    expect(r.strength).toBe(928);
    expect(r.derivedStrength).toBe(928);
  });

  test("DPS", () => {
    const r = bingDps(m);
    expect(r.ticks).toBe(6);
    expect(r.dps).toBeGreaterThan(1e14);
    console.log(`40T build: ${r.dps.toExponential(4)} DPS`, JSON.stringify({ ...r, scales: undefined }));
  });
});

describe("local build (DeafwaveB) against the dummy measurements", () => {
  const m = load("local");
  const r = bingDps(m, { ...DEFAULT_ASSUMPTIONS, buffUptime: { "Bull's Rage": 0.774 } });   // cast-watch 0.767-0.774

  test("counts match the hit-watch reads (docs/mechanics.md #bing-hit-counts)", () => {
    expect(r.throwRate).toBeCloseTo(30 / 22, 9);       // measured 1.342-1.386
    expect(r.bombsPerThrow).toBe(2.5);                 // measured 2.511
    expect(r.q).toBe(7);                               // 7.00 explosions per empowered pummel
    expect(r.duration).toBeCloseTo(1.58, 9);           // Deterioration totalS 1.58 (live combat capture)
    expect(r.ticks).toBe(4);
  });

  test("sheet stats", () => {
    expect(r.critChance * 100).toBeCloseTo(57.05, 9);
    expect(r.critDmg).toBe(324);
    expect(r.strength).toBe(339);                      // live player entity 338.52
  });

  test("tick/hit and per-hit ratios", () => {
    expect(r.detChance).toBeCloseTo(0.98, 9);                                  // measured ticks/hit 4 x 0.98
    expect(r.detFactor).toBeCloseTo(0.98 * 0.6 * 1.64 * 1.08 ** 5 * 5.8, 9);   // tick/hit 1.446 measured x (1+1.3+1.6+1.9)
    expect(r.topExplosion / r.topPummel).toBeCloseTo(0.3 * 1.32, 9);   // measured 0.3970
  });

  test("sheet Damage Bonus 755.6 = generic increases + knockback slate (120% of +48%)", () => {
    const p = new Pool(m.records, { skill: "Hammer of Ash", tags: new Set([...m.skills["Hammer of Ash"].tags, 5000002]) });
    expect(p.inc(5719) + r.knockback).toBeCloseTo(755.6, 9);
  });

  // Strict identities, expected to FAIL until the model is the game's algorithm (docs/client-dps-exact-handoff.md).
  // They matched earlier only through cancelling errors (no armor, Formation Breaker off, Solar Ring 40, Mighty Arrow
  // ×1.25 that never applies). `test.fails` flips red once the model is right: then drop `.fails`.
  test.fails("top-level non-crit hits = the hit-watch reads (R1: 1.964B pummel, 0.7798B explosion)", () => {
    const top = bingDps(m, { ...DEFAULT_ASSUMPTIONS, buffUptime: {} });   // top level = Bull's Rage up
    expect(Math.abs(top.topPummel / 1.964e9 - 1)).toBeLessThan(0.005);
    expect(Math.abs(top.topExplosion / 0.7798e9 - 1)).toBeLessThan(0.005);
  });

  test.fails("DPS = the measured dummy average", () => {
    expect(Math.abs(r.dps / 449.0e9 - 1)).toBeLessThan(0.02);    // 2360 s dummy average 449.0B (2026-10-11)
  });
});

// Per-hit A/Bs on DeafwaveB, top-level hits (../scratch/r1/top.py, para_split.py); predictions logged first in
// ../scratch/predictions.jsonl. Variant builds come from evidence/loadout_<slug>.json with one gem changed.
describe("DeafwaveB gem swaps against the hit-watch (2026-10-11)", () => {
  const A = { ...DEFAULT_ASSUMPTIONS, buffUptime: {} };
  const local = bingDps(load("local"), A), cdi = bingDps(load("localcdi"), A);
  const gr = bingDps(load("localgr"), A), cor = bingDps(load("localcor"), A);

  test("Critical Strike Damage Increase is crit-only (label cdi-swap)", () => {
    // measured crit/non-crit ×1.385 ember, ×1.372 main; non-crit ×0.759 / ×0.769 (Slow Projectile out); predicted first
    expect(cdi.critMore / local.critMore).toBeCloseTo(1.38, 2);
    expect(Math.abs(cdi.topPummel / local.topPummel / 0.764 - 1)).toBeLessThan(0.01);
  });

  test("Paralysis: +15% damage taken x1.8 (talent 12070200), Grudge chance per Flame Core hit (grudge-para)", () => {
    // measured paralyzed/unparalyzed ×1.269-1.280 over four hit types; procs 22 of 39 Flame Core hits (56%)
    expect(gr.scales["buff:230"] / gr.paralysisUptime).toBeCloseTo(1.8, 9);
    expect(1 + 0.15 * 1.8).toBeCloseTo(1.27, 9);
    expect(gr.paralysisUptime / (4 / (DEFAULT_ASSUMPTIONS.sentryHitIntervalS * 1.2 / gr.sentryFreq))).toBeCloseTo(0.55, 9);
  });

  // Vorax/Dawn Break variants are built without the Vorax's +27% Deterioration Chance and +17% armor pen lines
  // (affix ids unknown); predict_vorax.ts / predict_db.ts add the chance line, armor pen is the armorPen input
  // (live field 2006247 = 17, dummy_mitigation.py).
  test("Vorax Limb: Digits in ring1 for the +48% Kaleidoscope (vorax-ring1): armor pen 17 -> model ×0.840 vs ×0.8185 measured (open)", () => {
    // measured top non-crit ×0.819 ember / ×0.818 main, crit/non-crit 3.87, per bomb ×1.218; predicted ×0.676, 3.83, ×1.022
    // before the armor layer. Same residual as the localcorona per-hit top check below (model 2.8% high).
    const vx = bingDps(load("localvx"), { ...A, armorPen: 17 });
    expect(vx.armor / local.armor).toBeCloseTo(0.8700165 / 0.7000165, 9);
    expect(vx.topPummel / local.topPummel).toBeCloseTo(0.840, 3);
    expect(0.8185 / (vx.topPummel / local.topPummel)).toBeCloseTo(0.975, 3);
    expect(vx.critDmg).toBe(383);
  });

  test("Dawn Break belt: +1 all skills (HoA L22), 65 Fervor ×1.32, +86 Strength (dawnbreak-belt)", () => {
    // measured top ×1.818 / ×1.830 non-crit, ×1.818 / ×1.822 crit; sheet crit chance 63.55% exact; predicted ×1.809 first
    const vx = bingDps(load("localvx"), A), db = bingDps(load("localdb"), A);
    expect(Math.abs(db.topPummel / vx.topPummel / 1.824 - 1)).toBeLessThan(0.01);
    expect(db.critChance * 100).toBeCloseTo(63.55, 6);
  });

  test("Deterioration: three more +5% duration / +8% additional damage lines give the 5th tick at 2.2x (slates-det)", () => {
    // measured duration 1.73 s (debuff totalS), ticks/hit 4.97, tick÷hit damage ×1.732, hits unchanged; predicted ×1.7375
    const db = load("localdb");
    const det = db.records.filter((r: any) => r.src.startsWith("slate:51070200"));
    const s = structuredClone(db);
    for (let i = 0; i < 3; i++) for (const r of det.slice(0, 2)) s.records.push({ ...r, src: `slate:51070200#add${i}` });
    const a = bingDps(db, A), b = bingDps(s, A);
    expect(b.duration).toBeCloseTo(1.73, 9);
    expect(b.ticks).toBe(5);
    expect(b.detFactor / a.detFactor).toBeCloseTo(1.7375, 3);
  });

  test("maul swap: +6 Attack Skill Level (HoA L22 -> L28) without the old maul's rolls (maul-plus6)", () => {
    // measured top ×0.3239-0.3246 over four hit types; sheet crit 49.9% exact; no Steep Strike population on HoA hits;
    // throws/s within ±4% of 30/round(30/rate) over five states. Predicted ×0.3235 first.
    const sl = bingDps(load("localsl"), A), mo = bingDps(load("localmaul"), A);
    expect(Math.abs(mo.topPummel / sl.topPummel / 0.3242 - 1)).toBeLessThan(0.01);
    expect(mo.critChance * 100).toBeCloseTo(49.9, 6);
  });

  test("skill level: HoA gem L20 (eff. 21) -> L3 (eff. 4) (hoa3-swap)", () => {
    // measured ×0.379 ember nc/crit, ×0.382 / ×0.384 main; ticks per bomb ×0.392; predicted ×0.379 first
    const hoa3 = bingDps(load("localhoa3"), A);
    expect(Math.abs(hoa3.topPummel / local.topPummel / 0.380 - 1)).toBeLessThan(0.01);
    expect(hoa3.ticks).toBe(local.ticks);
  });

  test("Corruption (+36% erosion taken) vs Timid (+40% hit taken) (cor-swap)", () => {
    // measured ×0.956-0.976 per hit type (mean ×0.966), tick/hit damage ×1.018; predicted ×0.971
    expect(Math.abs(cor.enemy / gr.enemy / 0.966 - 1)).toBeLessThan(0.01);
    expect(cor.detFactor).toBe(gr.detFactor);
  });
});

// Per-hit records (tli_dump --hit-watch +0x50 per-type values, +0xb8 tag list): label exact-corona, 2026-10-11,
// ../scratch/watch/exact-corona-hits.csv (915 direct hits, final = round½(1.18·Σ+0x50) on all). Current gear =
// localcorona with the Vorax (armor pen 17). Groups: skill 1110 flags 40 (ember) / 16 (pummel), crit flag, and tag
// 4000890 E_jifazhuangtai (present on 81% of HoA hits = Bull's Rage up). Live player attrs (player_mods.py 9) for the
// ember tag set equal the model pool for 5402/5002/5107/5727/4802/4803/6001/6302/5414 and 5719 x Bull's Rage.
describe("localcorona against per-hit records (exact-corona)", () => {
  const m = load("localcorona");
  const A = { ...DEFAULT_ASSUMPTIONS, armorPen: 17, buffUptime: {} };
  const r = bingDps(m, A);

  test("enemy side = the live dummy reads: armor 0.870017, res 0.80, taken 1.6·1.15·1.3·1.405 (Timid tag-gated on 5000003)", () => {
    expect(r.armor).toBeCloseTo(0.870016501, 9);
    expect(r.taken).toBeCloseTo(1.6 * 1.15 * 1.3 * 1.405, 9);   // no Mighty Arrow (bombs never travel into the target)
  });

  test("Kaleidoscope: elemental turn reaches the fire half only (bands ×1.1835 / ×1.1846 / ×1.1833 apart)", () => {
    const ring = r.kaleidoscope * r.topPummel / (r.hit * r.moreTrig * r.enemy);
    expect(Math.abs(ring / (1 + r.w * (ring - 1)) / 1.1838 - 1)).toBeLessThan(0.002);
  });

  test("Bull's Rage ×1.374 = per-hit tag 4000890 split ×1.375-1.380", () => {
    const down = bingDps(m, { ...A, buffUptime: { "Bull's Rage": 0 } });
    expect(Math.abs(r.topPummel / down.topPummel / 1.377 - 1)).toBeLessThan(0.003);
  });

  test("roll width max/min ×1.1183 = band width ×1.1168-1.1178 (n = 119-329)", () => {
    const at = (k: "lo" | "hi") => bingDps({ ...m, records: m.records.map((x) => x.bucket === 2 && x.hi ? { ...x, lo: x[k]!, hi: x[k]! } : x) }, A);
    expect(Math.abs(at("hi").topPummel / at("lo").topPummel / 1.1175 - 1)).toBeLessThan(0.001);
  });

  test.fails("top ember at max roll = measured band maximum 1.029537e9 × 1.18 (n = 119, within 0.3%)", () => {
    const hi = bingDps({ ...m, records: m.records.map((x) => x.bucket === 2 && x.hi ? { ...x, lo: x.hi } : x) }, A);
    expect(Math.abs(1.029537e9 * 1.18 / hi.topExplosion - 1)).toBeLessThan(0.003);
  });
});
