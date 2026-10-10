import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { cycleDps, type Snapshot } from "../../src/damageModel.js";
import { fromRoot } from "../../src/py.js";
import { applySeason } from "../../src/seasons.js";
import { BING_ZERO, REAL_BUILD_SOURCES, compose } from "../../src/bingLedger.js";

/* The real-build source ledger (mechanics.md#bing-ledger): every snapshot line of
   real_buld_3 attributed to the item/tree/slate/support/pact that grants it, so the
   progression can add sources one at a time from the bare rig. */

const real = (): Snapshot =>
  JSON.parse(fs.readFileSync(fromRoot("data/bing1/real_buld_3_snapshot.json"), "utf-8"));

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
    for (const s of REAL_BUILD_SOURCES) {
      expect(s.cite, s.id).toMatch(/\S/);
      for (const r of s.requires ?? []) expect(ids.has(r), `${s.id} requires ${r}`).toBe(true);
    }
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
