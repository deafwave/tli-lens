import { describe, expect, test } from "vitest";
import { cycleDps } from "../../src/damageModel.js";
import { applySeason } from "../../src/seasons.js";
import { BING_ZERO, REAL_BUILD_SOURCES, SLOT_CAPACITY, compose, type Source } from "../../src/bingLedger.js";
import { UPGRADES } from "../../src/bingUpgrades.js";
import { walk } from "../../src/bingProgression.js";

const dps = (set: Source[]) => cycleDps(applySeason(compose(BING_ZERO, set), "ss14")).dps;

describe("Bing progression walk (mechanics.md#bing-progression)", () => {
  let buildUp: ReturnType<typeof walk> | undefined;
  const buildUpSteps = () => (buildUp ??= walk(BING_ZERO, [], REAL_BUILD_SOURCES, "ss14"));

  test("build-up from zero takes every source and lands on the real build", () => {
    const steps = buildUpSteps();
    expect(steps.flatMap(s => s.ids).sort()).toEqual(REAL_BUILD_SOURCES.map(s => s.id).sort());
    expect(steps.at(-1)!.dps).toBeCloseTo(dps(REAL_BUILD_SOURCES), -3);
  });

  test("build-up never takes a source before what it requires", () => {
    const seen = new Set<string>();
    for (const step of buildUpSteps()) {
      for (const id of step.ids) {
        const src = REAL_BUILD_SOURCES.find(s => s.id === id)!;
        for (const r of src.requires ?? []) expect(seen.has(r) || step.ids.includes(r), `${id} before ${r}`).toBe(true);
      }
      step.ids.forEach(id => seen.add(id));
    }
  });

  test("climb only gains, honors craft-pool capacity, and drops what it replaces", () => {
    const steps = walk(BING_ZERO, REAL_BUILD_SOURCES, UPGRADES, "ss14", { untilNoGain: true });
    expect(steps.length).toBeGreaterThan(0);
    let have = [...REAL_BUILD_SOURCES];
    for (const step of steps) {
      expect(step.gain).toBeGreaterThan(1);
      have = [...have.filter(s => !step.removed.includes(s.id)),
              ...step.ids.map(id => UPGRADES.find(u => u.id === id)!)];
      for (const [slot, cap] of Object.entries(SLOT_CAPACITY))
        expect(have.filter(s => s.slot === slot).length, slot).toBeLessThanOrEqual(cap);
      for (const id of step.ids)
        for (const r of UPGRADES.find(u => u.id === id)!.replaces ?? [])
          expect(have.some(s => s.id === r), `${id} keeps ${r}`).toBe(false);
    }
    expect(steps.at(-1)!.dps).toBeCloseTo(dps(have), -3);
  });

  test("upgrades are cited and their requires resolve against the real build", () => {
    const ids = new Set([...REAL_BUILD_SOURCES, ...UPGRADES].map(s => s.id));
    expect(ids.size).toBe(REAL_BUILD_SOURCES.length + UPGRADES.length);
    for (const u of UPGRADES) {
      expect(u.cite, u.id).toMatch(/\S/);
      for (const r of [...u.requires ?? [], ...u.replaces ?? []]) expect(ids.has(r), `${u.id} → ${r}`).toBe(true);
    }
  });

  test("skill levels compose as ×1.10 per level above the build's L21", () => {
    const lvl = (n: number): Source => ({ id: "x", label: "x", group: "upgrade", cite: "t", edits: [["add", "aux.skill_level", n]] });
    expect(dps([...REAL_BUILD_SOURCES, lvl(1)]) / dps(REAL_BUILD_SOURCES)).toBeCloseTo(1.10, 6);
    // L21 → L31 crosses into the ×1.08 band at L31
    expect(dps([...REAL_BUILD_SOURCES, lvl(10)]) / dps(REAL_BUILD_SOURCES)).toBeCloseTo(1.1 ** 9 * 1.08, 6);
  });
});
