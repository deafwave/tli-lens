import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { cycleDps, type Snapshot } from "../../src/damageModel.js";
import { fromRoot } from "../../src/py.js";
import { applySeason } from "../../src/seasons.js";
import { BING_ZERO, REAL_BUILD_SOURCES, compose, effective } from "../../src/bingLedger.js";

/* The real-build source ledger (mechanics.md#bing-ledger): every snapshot line of
   real_buld_3 attributed to the item/tree/slate/support/pact that grants it, so the
   progression can add sources one at a time from the bare rig. */

/** The July hand snapshot with the game-time recalibration applied: Precise Projectiles is projectile-typed and
    Cruelty's Elite-hit stacks double its aura (#bing-cruelty); R2's counted hits (mechanics.md#bing-hit-counts):
    Firepower Coverage prices pummel + explosions instead of the July hit fold (only the arrow pair's July geometry is
    left in hits_per_bomb), the throw law turns the sheet's attack speed (with Death's Touch +14% local and Steamroll's
    −15% for the supported skill) into the throw rate, Iron Lion adds 2 Embers, Upheaval's explosion line and Broken
    Sun's area line price the empowered hit types, Upheaval's +20% shows on no hit (#bing-per-hit). */
const real = (): Snapshot => {
  const s = JSON.parse(fs.readFileSync(fromRoot("data/bing1/real_buld_3_snapshot.json"), "utf-8"));
  // HoA text, per hit (mechanics.md#bing-per-hit): +215% on a Demolisher consume, Shotgun falloff 70%
  s.rotation.empower_hit_pct = 215;
  s.rotation.shotgun_falloff_pct = 70;
  s.rotation.counted_hits = 1;
  s.rotation.hits_per_bomb = 0.8353 * 1.3286;
  s.rotation.attack_speed_inc_pct = (1.379 * (1.32 + 0.15) / (1.32 * 1.14) - 1) * 100;
  s.rotation.proj_added = 2;
  s.rotation.explosion_hit_pct = 32;
  s.rotation.empower_area_pct = 41;
  s.rotation.proj_speed_inc_pct = 10;   // Precise Projectiles (mechanics.md#bing-proj-speed)
  s.additional.cruelty *= 2;   // Cruelty Elite-hit stacks (mechanics.md#bing-cruelty)
  delete s.additional.upheaval;
  delete s.additional.upheaval_explosion;
  delete s.additional.sun_area_empower;
  s.additional_typed.projectile = { precise_projectiles: s.additional.precise_projectiles };
  delete s.additional.precise_projectiles;
  return s;
};
/** Conditions the no-input dummy loop never meets (mechanics.md#bing-dummy-loop). */
const DUMMY_UNMET = new Set(["mobility_cast", "blessing"]);

/** Numeric leaves keyed by path, zeros dropped (absent ≡ 0 for every bucket). */
function leaves(o: any, p = "", out: Record<string, number> = {}): Record<string, number> {
  if (Array.isArray(o)) {
    if (p === "tags") out[`tags=${[...o].sort().join(",")}`] = 1;
    else for (const c of o) out[`${p}[${c.from}>${c.to}]`] = c.pct;
    return out;
  }
  for (const [k, v] of Object.entries(o ?? {})) {
    const q = p ? `${p}.${k}` : k;
    if (typeof v === "number") { if (v !== 0) out[q] = v; }
    else if (v && typeof v === "object") leaves(v, q, out);
  }
  return out;
}

describe("Bing real-build source ledger", () => {
  test("zero is the bare rig: 1,458 DPS anchor (bing1 step 0)", () => {
    expect(cycleDps(compose(BING_ZERO, [])).dps).toBeCloseTo(1458, 0);
  });

  test("zero + every source reproduces real_buld_3_snapshot line for line", () => {
    const got = leaves(compose(BING_ZERO, REAL_BUILD_SOURCES));
    const want = leaves(real());
    expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
    for (const k of Object.keys(want)) expect(got[k], k).toBeCloseTo(want[k], 6);
  });

  test("composed build has the snapshot's DPS in both seasons", () => {
    const c = compose(BING_ZERO, REAL_BUILD_SOURCES);
    for (const season of ["ss13", "ss14"] as const)
      expect(cycleDps(applySeason(c, season)).dps / cycleDps(applySeason(real(), season)).dps).toBeCloseTo(1, 9);
  });

  test("sources are well-formed: unique ids, cited, requirements resolve", () => {
    const ids = new Set(REAL_BUILD_SOURCES.map(s => s.id));
    expect(ids.size).toBe(REAL_BUILD_SOURCES.length);
    const provided = new Set([...ids, ...REAL_BUILD_SOURCES.flatMap(s => s.provides ?? [])]);
    for (const s of REAL_BUILD_SOURCES) {
      expect(s.cite, s.id).toMatch(/\S/);
      for (const r of s.requires ?? []) if (!DUMMY_UNMET.has(r)) expect(provided.has(r), `${s.id} requires ${r}`).toBe(true);
    }
    expect(effective(REAL_BUILD_SOURCES).map(s => s.id).sort())
      .toEqual(REAL_BUILD_SOURCES.filter(s => !s.requires?.some(r => DUMMY_UNMET.has(r))).map(s => s.id).sort());
  });

  test("dropping Broken Sun drops every Solar-Ring proximity line with it", () => {
    const left = effective(REAL_BUILD_SOURCES.filter(s => s.id !== "broken_sun")).map(s => s.id);
    for (const id of ["well_matched", "slate_corner_taken", "slate_corner_knockback"]) expect(left).not.toContain(id);
  });

  test("residuals stay small: each moves the real build by under 10%", () => {
    const all = compose(BING_ZERO, REAL_BUILD_SOURCES);
    for (const s of REAL_BUILD_SOURCES.filter(x => x.group === "residual")) {
      const without = compose(BING_ZERO, REAL_BUILD_SOURCES.filter(x => x !== s));
      const ratio = cycleDps(all).dps / cycleDps(without).dps;
      expect(Math.abs(ratio - 1), s.id).toBeLessThan(0.10);
    }
  });
});
