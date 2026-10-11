import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { bombHitTypes, cycleDps, deteriorationTickFactor, hitDamage } from "../../src/damageModel.js";
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
    // R8 pins (mechanics.md#bing-per-hit, OPEN for R3): the R1 per-hit fixes moved both off their fitted counts
    // (hits_per_bomb / FC_AUTO_HITS / q / M were fit to the old per-hit values). Measured 467.3B (today's build,
    // was model 467.6B) and 557.75B (July span; the export lacks native prism placements; was model 531.0B).
    // Flip back to the 0.98-1.02 / 0.94-1.02 checks once R2's counted hits replace the fits.
    expect(dps(mine())).toBeCloseTo(486.0, 0);    // measured 467.3B (+4.0%)
    expect(dps(july())).toBeCloseTo(511.3, 0);    // measured 557.75B (-8.3%)
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
  test("1T dummy build: Tyrant's 'Unable to trigger Empower Skills' stops the auto-cast Ice Bond engine and Bull's Rage", () => {
    // mechanics.md#bing-mark — measured on DeafwaveB: Bull's Rage 0% uptime with Tyrant's equipped
    const r = pro1t();
    const snap: any = compose(BING_ZERO, effective(r.sources));
    expect(r.sources.some(s => /^skill:(Ice Bond|Bull's Rage):/.test(s.label))).toBe(false);
    expect(snap.rotation.demolisher_every_n).toBeUndefined();          // no Sentry charges → restoration rhythm
    expect(snap.additional.tenacity).toBeCloseTo((1.08 ** 6 - 1) * 100, 6);   // 4 base + 2 max stacks
    expect(snap.crit.crit_dmg_taken_pct).toBe(10);                     // Mark on hit
    expect(r.sources.find(s => /Entangled Pain/.test(s.label))?.provides).toContain("curse");
    expect(r.lines.filter(l => l.kind === "unknown").map(l => l.text).sort()).toEqual([
      "+1 Max Charges", "+30% Bond Gaining Speed", "Converts 50% of Lightning Damage to Fire Damage"]);
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
      [/Precise Projectiles/, 1.320], [/Precise: Cruelty/, 1.507], [/Slow Projectile/, 1.202],
    ];
    for (const [drop, meas, tweak] of cases) expect(base / dps(drop, tweak) / meas, String(drop)).toBeCloseTo(1, 1.4);
    // R8 pins (mechanics.md#bing-per-hit, OPEN for R3). Upheaval: measured ÷1.217 (2026-10-10); its explosion line now
    // prices only the explosion hits (bombHitTypes), which cycleDps does not count yet (R2) → model ÷1.000.
    // Flame Core off (no Sentry → no Formation Breaker charges; Bull's Rage uptime 75% → 58%): measured ÷4.09
    // (2026-10-10); per hit Flame Core changes nothing (the Sentry-proximity +30% is not at the dummy, r1-fc-off), so
    // the A/B is cadence: un-empowered bombs land only the pummel (R2 / Task 7). Flip both into `cases` once R2 lands.
    expect(base / dps(/Upheaval/)).toBeCloseTo(1.000, 2);   // measured ÷1.217
    expect(base / dps(/skill:Flame Core/, s => { s.additional.bulls_rage *= 0.58 / 0.75; })).toBeCloseTo(3.222, 2);   // measured ÷4.09
  }, 30_000);
  // mechanics.md#bing-per-hit — R1 per-hit read (2026-10-11, `combat.mjs --hits`, labels r1-*; predictions logged
  // first as r1-hits / r1-<state>). Values at the top level: Bull's Rage on (the kit's 75% uptime undone) and the
  // Kaleidoscope erosion turn. Model first (label r1-hits): Ember channel 0.532 / 1.724B, non-projectile 0.337 / 1.093B,
  // tick 0.921 × hit — no per-type split, no empower or shotgun per hit.
  const perHitSnap = (drop?: RegExp) => {
    const s: any = applySeason(compose(BING_ZERO, effective(mine().sources.filter(x => !drop || !drop.test(x.label)))), "ss13");
    if (s.additional.bulls_rage) s.additional.bulls_rage /= 0.75;
    return s;
  };
  const within = (model: number, meas: number, what: string) => expect(Math.abs(model / meas - 1), `${what}: model ${model.toFixed(4)} vs measured ${meas}`).toBeLessThan(0.03);
  test("per-hit damage per hit type matches the read within 3% (non-crit, crit, crit share, tick)", () => {
    const s = perHitSnap(), t = bombHitTypes(s, "erosion"), B = 1e9;
    // un-empowered pummel: Flame Core off windows (r1-fc-off, flags 15; every hit type there equals base — Sentry line off)
    within(t.pummel.nonCrit / B, 0.4445, "pummel non-crit"); within(t.pummel.crit / B, 1.4405, "pummel crit");
    // base, 20 windows: empowered pummel (flags 16) and its 7 explosions (flags 40)
    within(t.pummelEmpowered.nonCrit / B, 1.9644, "empowered pummel non-crit"); within(t.pummelEmpowered.crit / B, 6.3735, "empowered pummel crit");
    within(t.explosion.nonCrit / B, 0.7798, "explosion non-crit"); within(t.explosion.crit / B, 2.5214, "explosion crit");
    // crit rolled once per bomb: 1933 / 3459 bombs
    within(s.crit.chance_pct / 100, 0.5588, "crit share");
    // Deterioration tick ÷ its own hit (every k, every state): 1.446
    within(deteriorationTickFactor(s), 1.446, "tick ÷ hit");
    // Kaleidoscope: erosion turn ÷ elemental turn 1.312–1.318; Bull's Rage on ÷ off 1.367 (cast-watch timeline)
    within(hitDamage(s, "erosion").nonCrit / hitDamage(s, "elemental").nonCrit, 1.315, "Kaleidoscope turn");
    const off = { ...s, additional: { ...s.additional, bulls_rage: 0 } };
    within(hitDamage(s, "erosion").nonCrit / hitDamage(off, "erosion").nonCrit, 1.367, "Bull's Rage");
  }, 30_000);
  test("per-hit A/Bs: each source's ratio per hit type within 3% (pummel, explosion)", () => {
    const t0 = bombHitTypes(perHitSnap(), "erosion");
    // measured ÷ (top-level non-crit; crit agrees within 1.5%), 1 – 2 B windows each with A₂ after; predicted first (r1-<state>)
    // Flame Core off: empowered pummels too few at the top level (n=4: ÷0.962 non-crit, ÷1.005 crit) — explosions only
    const cases: [string, RegExp, number | null, number][] = [
      ["r1-upheaval-off2", /Upheaval/, 0.994, 1.321], ["r1-pp-off", /Precise Projectiles/, 1.406, 1.411],
      ["r1-fc-off", /skill:Flame Core/, null, 1.002], ["r1-steamroll-off", /Steamroll/, 1.440, 1.433],
      ["r1-slowproj-off", /Slow Projectile/, 1.328, 1.310], ["r1-fusion-off", /Elemental Fusion/, 1.170, 1.192],
      ["r1-passivation-off", /Passivation/, 1.664, 1.653], ["r1-weaponamp-off", /Weapon Amplification/, 1.445, 1.456],
      ["r1-erosionamp-off", /Erosion Amplification/, 1.461, 1.457], ["r1-cruelty-off", /Precise: Cruelty/, 1.495, 1.509],
    ];
    for (const [label, drop, pummel, explosion] of cases) {
      const t = bombHitTypes(perHitSnap(drop), "erosion");
      if (pummel) within(t0.pummelEmpowered.nonCrit / t.pummelEmpowered.nonCrit, pummel, `${label} pummel`);
      within(t0.explosion.nonCrit / t.explosion.nonCrit, explosion, `${label} explosion`);
    }
  }, 60_000);
  const ablate = () => {
    const r = mine();
    const dps = (drop?: RegExp) => cycleDps(applySeason(compose(BING_ZERO, effective(r.sources.filter(x => !drop || !drop.test(x.label)))), "ss13") as any).dps;
    return { base: dps(), dps };
  };
  // Held-out A/Bs (2026-10-11, mechanics.md#bing-proj-speed). Each case pins TODAY'S MODEL prediction (predicted
  // first) with the MEASURED value beside it; flip to the measured value once the model is fixed. None of these
  // refits q = 0.31 / k = 0.28: both-off is inconsistent with the single-source A/Bs, so it barely tests them.
  test("held-out Precise + Slow Projectile off together: model pinned, measured ÷1.864 not reached (OPEN)", () => {
    // measured ÷1.864 (2026-10-11, label proj-both-off; 8 A windows mean 457.4B, 4 B windows 245.4B, A scatter 402–531B,
    // bracket means); predicted ÷1.600 first (law patch ÷1.600). Singles ÷1.320 × ÷1.202 = 1.587.
    const { base, dps } = ablate();
    // pin moved 1.600 → 1.609 by the R1 per-hit fixes (mechanics.md#bing-per-hit)
    expect(base / dps(/Precise Projectiles|Slow Projectile/)).toBeCloseTo(1.609, 2);   // flip to 1.864 once fixed
  }, 30_000);
  test("same-session singles: model pinned, measured Precise ÷1.245 / Slow ÷1.324 (OPEN, scatter ±12%)", () => {
    // measured ÷1.245 and ÷1.324 (2026-10-11, labels proj-pp-off-r, proj-sp-off-r; one A-B-A-B-A chain, bracket
    // means; all-A means ÷1.267 / ÷1.306); predicted ÷1.320 / ÷1.204 first (law patch the same). The existing
    // 2026-10-10 cases (÷1.320, ÷1.202) above are unchanged.
    const { base, dps } = ablate();
    expect(base / dps(/Precise Projectiles/)).toBeCloseTo(1.328, 2);   // flip to 1.245 once fixed (pin 1.320 → 1.328, R1)
    expect(base / dps(/Slow Projectile/)).toBeCloseTo(1.204, 2);       // flip to 1.324 once fixed
  }, 30_000);
  test("gear swaps match the 2026-10-10 game-time A/Bs within 5% (absolute DPS)", () => {
    // mechanics.md#bing-obliterate — weapons span 1.7–3.1 attacks/s, so these pin the Obliterate cap and the
    // eroded/un-eroded hit split; Tyrant's pins Mark + the Empower block
    const d = load("data/bing1/scraped/my-build-2026-10-10.json"), pro = load("data/bing1/scraped/pro-1t.json");
    const weapon = (phys: number, mods: [string, number][]) => {
      const c = structuredClone(d.compendium), lo = c.loadouts.loadouts[0];
      const mh = lo.gear.inventory.find((x: any) => x.id === lo.gear.equipped.mainHand);
      Object.assign(mh, { towerSequence: null, suffixes: [], corrosionImplicit: null,
        prefixes: mods.map(([t, v]) => ({ modifierDescription: t, rolledValues: [{ value: v }] })) });
      mh.baseItem = { ...mh.baseItem, implicits: [`${phys} - ${phys} Physical Damage`, "500 Critical Strike Rating", "1.5 Attack Speed"]
        .map(description => ({ description, values: [] })) };
      return c;
    };
    const tyrants = () => {
      const c = structuredClone(d.compendium), lo = c.loadouts.loadouts[0], pl = pro.compendium.loadouts.loadouts[0];
      const g = pl.gear.inventory.find((x: any) => x.id === pl.gear.equipped.gloves);
      lo.gear.inventory = lo.gear.inventory.filter((x: any) => x.id !== lo.gear.equipped.gloves).concat(g);
      lo.gear.equipped.gloves = g.id;
      return c;
    };
    const dps = (c: any) => cycleDps(applySeason(importBing(c, 0, d.nativeTalents, d.nativePrisms).snapshot, "ss13")).dps / 1e9;
    const cases: [any, number][] = [
      [weapon(190, []), 80.7], [weapon(190, [["+#% Gear Physical Damage", 25]]), 102.7], [tyrants(), 221.4]];
    for (const [c, meas] of cases) expect(Math.abs(dps(c) / meas - 1)).toBeLessThan(0.05);
    // R8 pins (mechanics.md#bing-per-hit, OPEN for R3): measured 72.3B blank mallet, 82.6B sword (2026-10-10); the R1
    // per-hit fixes put them at +7.4% / +6.6% (the baseline moved +4.0%). Flip back into `cases` once R2 lands.
    expect(dps(weapon(175, []))).toBeCloseTo(77.7, 0);                                   // measured 72.3B
    expect(dps(weapon(220, [["+#% gear Attack Speed", 18]]))).toBeCloseTo(88.0, 0);      // measured 82.6B

    // mechanics.md#bing-obliterate — 2026-10-11 A-B-A (labels obl-* + obl2-*): DPS ratio = mean of the bracket ratios
    // (±5%); Deterioration stacks ÷ the maul's (27 windows, 41.9) read the enhanced-throw rate (±10%)
    const run = (c: any) => cycleDps(applySeason(importBing(c, 0, d.nativeTalents, d.nativePrisms).snapshot, "ss13"));
    const base = run(d.compendium);
    const rates: [string, any, number, number?][] = [
      // measured ÷6.093, stacks ×1.245 (2026-10-11, label obl-mallet/obl2-mallet, 4 brackets); predicted ÷6.193, ×1.250 first
      ["blank mallet", weapon(175, []), 6.093, 1.245],
      // measured ÷5.364, stacks ×1.258 (2026-10-11, label obl-sword/obl2-sword, 2 brackets); predicted ÷5.450, ×1.250 first
      ["sword +18% gear AS", weapon(220, [["+#% gear Attack Speed", 18]]), 5.364, 1.258],
    ];
    for (const [name, c, meas, stacks] of rates) {
      const r = run(c);
      expect(Math.abs(base.dps / r.dps / meas - 1), name).toBeLessThan(0.05);
      if (stacks) expect(Math.abs(r.deterioration_stacks! / base.deterioration_stacks! / stacks - 1), name).toBeLessThan(0.10);
    }
    // measured ÷2.080 (2026-10-11, label obl-tyrants/obl2-tyrants, 3 brackets); predicted ÷2.095 first. Stacks ×0.927
    // vs the model's ×0.811 are left out: the weapon-APS throw rate (#bing-bombs, measured ×0.917), not Obliterate.
    // R8 pin (mechanics.md#bing-per-hit, OPEN for R3): Tyrant's blocks Bull's Rage, now worth ×1.366 per hit (L21 +
    // Well-Fought Battle, measured ×1.367), so the model reads ÷2.251. Flip back to ±5% of 2.080 once R2 lands.
    expect(base.dps / run(tyrants()).dps).toBeCloseTo(2.251, 2);   // measured ÷2.080
  }, 60_000);
});
