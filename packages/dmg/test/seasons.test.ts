import fs from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { SEASONS, DEFAULT_SEASON, parseSeason, applySeason, setActiveSeason, seasonPath } from "../src/seasons.js";
import { parseBuild } from "../src/buildParser.js";
import { cycleDps, type Snapshot } from "../src/damageModel.js";
import { fromRoot } from "../src/py.js";

const BUILD = fromRoot("data/Rehan.json");
const bing = (): Snapshot =>
  JSON.parse(fs.readFileSync(fromRoot("data/bing1/real_buld_3_snapshot.json"), "utf-8"));

afterEach(() => setActiveSeason(DEFAULT_SEASON));

describe("season table", () => {
  test("defaults to SS14; unknown input falls back to it", () => {
    expect(DEFAULT_SEASON).toBe("ss14");
    expect(parseSeason("ss13")).toBe("ss13");
    expect(parseSeason("SS13")).toBe("ss13");
    expect(parseSeason("ss12")).toBe("ss14");
    expect(parseSeason(undefined)).toBe("ss14");
  });
  test("SS13 files get a .ss13 suffix; SS14 keeps the plain name", () => {
    expect(seasonPath("a/catalog.json", "ss14")).toBe("a/catalog.json");
    expect(seasonPath("a/catalog.json", "ss13")).toBe("a/catalog.ss13.json");
  });
  test("tier-5 trait and Ice Bond values", () => {
    expect(SEASONS.ss13).toMatchObject({ seething: 44, fury: 78, ice_bond: 28 });
    expect(SEASONS.ss14).toMatchObject({ seething: 34, fury: 68, ice_bond: 24 });
  });
});

describe("Bing calculator: applySeason", () => {
  test("SS13 reproduces the hand-encoded 64 / 31.5 / 36", () => {
    const s = applySeason(bing(), "ss13");
    expect(s.additional_typed!.erosion.passivation).toBeCloseTo(64, 6);
    expect(s.additional.slow_projectile).toBeCloseTo(31.5, 6);
    expect(s.additional_typed!.elemental.fusion).toBeCloseTo(36, 6);
    expect(s.additional.steamroll).toBeCloseTo(43, 6);
  });
  test("SS14 gives 52.5 / 29.5 / 32.7", () => {
    const s = applySeason(bing(), "ss14");
    expect(s.additional_typed!.erosion.passivation).toBeCloseTo(52.5, 6);
    expect(s.additional.slow_projectile).toBeCloseTo(29.5, 6);
    expect(s.additional_typed!.elemental.fusion).toBeCloseTo(32.7, 6);
    expect(s.additional.steamroll).toBeCloseTo(39.7, 6);   // tlidb SS14: 28.5/38.5/44.5
  });
  test("real build loses 11.8% from SS13 to SS14 (supports incl. Steamroll)", () => {
    const r = cycleDps(applySeason(bing(), "ss14")).dps / cycleDps(applySeason(bing(), "ss13")).dps;
    expect(r).toBeCloseTo(0.8821, 4);   // 0.9029 x Steamroll 1.397/1.43
  });
  test("does not mutate its input; no _gem_levels = unchanged copy", () => {
    const raw = bing();
    applySeason(raw, "ss14");
    expect(raw.additional_typed!.erosion.passivation).toBe(64);
    const plain = bing();
    delete (plain as any)._gem_levels;
    expect(applySeason(plain, "ss14")).toEqual(plain);
  });
});

describe("Rehan model per season", () => {
  test("SS13 reproduces the pre-SS14 reference", () => {
    setActiveSeason("ss13");
    const [snap] = parseBuild(BUILD);
    expect(snap.additional.ice_bond).toBe(28);
    expect(snap.additional.combo_enhancement).toBeCloseTo(18.2 + 62 + 61, 1);
    expect(Math.round(cycleDps(snap).dps)).toBe(1_841_090_783_563);
  });
  test("SS14 gives the nerfed reference", () => {
    setActiveSeason("ss14");
    const [snap] = parseBuild(BUILD);
    expect(snap.additional.ice_bond).toBe(24);
    expect(snap.additional.combo_enhancement).toBeCloseTo(15.2 + 62 + 61, 1);
    expect(Math.round(cycleDps(snap).dps)).toBe(1_490_459_105_411);
  });
  test("Steamroll (tower Lv25): SS13 +43% / -15% AS, SS14 +39.7% / -20% AS", () => {
    const [s13] = parseBuild(BUILD, undefined, "ss13");
    const [s14] = parseBuild(BUILD, undefined, "ss14");
    expect(s13.additional.steamroll).toBeCloseTo(43, 6);
    expect(s14.additional.steamroll).toBeCloseTo(39.7, 6);
    expect(s14.rotation.attack_speed_inc_pct - s13.rotation.attack_speed_inc_pct).toBe(-5);
  });
  test("an explicit season argument beats the active season", () => {
    setActiveSeason("ss14");
    const [snap] = parseBuild(BUILD, undefined, "ss13");
    expect(snap.additional.ice_bond).toBe(28);
  });
});
