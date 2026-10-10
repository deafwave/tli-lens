/* `pnpm bing diagnose <build.json>` (docs/bing-dps-validation-handoff.md): import a build, then
   show what the model's number rests on — unmodeled lines, every source's marginal multiplier
   (ablation), and how far each UNVERIFIED assumption moves it. */
import fs from "node:fs";
import { importBing, type ImportResult } from "./bingImport.js";
import { BING_ZERO, compose, effective, type Source } from "./bingLedger.js";
import { cycleDps } from "./damageModel.js";
import { applySeason, type Season } from "./seasons.js";

/** A modeling choice nobody has measured on Bing, as a switch that turns it to its conservative reading. */
export interface Assumption { id: string; what: string; drop?: RegExp; tweak?: (s: any) => void }

export const UNVERIFIED: Assumption[] = [
  { id: "tick-grid", what: "Deterioration ticks every 0.325s (frame-count fit) instead of the tooltip's 0.33s",
    tweak: s => { if (s.deterioration) s.deterioration.tick_interval_s = 0.33; } },
  { id: "skill-levels", what: "every HoA level above the reference's 21 is ×1.10 (to 30) / ×1.08",
    tweak: s => { delete s.additional.skill_levels; } },
  { id: "lucky", what: "Lucky Critical Strike: chance 1 − (1 − p)²", drop: /Lucky Critical Strike/ },
  { id: "corruption", what: "Spindle pair → Lv25 Corruption +44% Erosion taken (and a curse)", drop: /Spindle/ },
  { id: "low-life", what: "No Loose Ends active (Low Life held)", drop: /No Loose Ends|at Low Life/ },
  { id: "profane", what: "Profane always on (+7% det duration, +7% additional Erosion)", drop: /Profane/ },
  { id: "domain", what: "Precise: Domain Expansion +33% additional Area on all HoA damage", drop: /Domain Expansion/ },
  { id: "transition", what: "Transition rolls at expected value", drop: /chance for that cast/ },
  { id: "cursed", what: "vs-Cursed lines active", drop: /Cursed/ },
  { id: "corona", what: "Corona +60% taken (vs Solar Ring +40%)",
    tweak: s => { if (s.enemy_taken.solar_ring === 60) s.enemy_taken.solar_ring = 40; } },
  { id: "malleable", what: "Precise: Malleable +30% aura effect (an Elite within 10m via Solar Ring)",
    drop: /Malleable/ },
  { id: "proximity", what: "Solar Ring makes every proximity line live under Firepower Coverage",
    tweak: s => { for (const k of Object.keys(s.enemy_taken)) if (/proximity|solar/.test(k)) delete s.enemy_taken[k]; } },
];

const fmt = (d: number) => d >= 1e12 ? `${(d / 1e12).toFixed(2)}T` : d >= 1e9 ? `${(d / 1e9).toFixed(1)}B` : d.toFixed(0);

export function loadForImport(file: string): ImportResult {
  const d = JSON.parse(fs.readFileSync(file, "utf-8"));
  return d.compendium ? importBing(d.compendium, 0, d.nativeTalents, d.nativePrisms) : importBing(d);
}

export function diagnose(r: ImportResult, season: Season = "ss13", top = 30): string[] {
  const dps = (set: Source[], tweak?: (s: any) => void) => {
    const snap: any = applySeason(compose(BING_ZERO, effective(set)), season);
    tweak?.(snap);
    return cycleDps(snap).dps;
  };
  const base = dps(r.sources);
  const out: string[] = [`model ${fmt(base)} [${season}]`];
  const kinds: Record<string, number> = {};
  for (const l of r.lines) kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
  out.push(`lines ${JSON.stringify(kinds)}  traits ${JSON.stringify(r.kit.traitLevels)}`);
  for (const l of r.lines.filter(l => l.kind === "unknown")) out.push(`  UNMODELED ${l.source} | ${l.text}`);
  out.push("", `top ${top} sources by marginal multiplier (ablation):`);
  const rows = r.sources.map(s => ({ s, m: base / dps(r.sources.filter(x => x !== s)) })).sort((a, b) => b.m - a.m);
  for (const { s, m } of rows.slice(0, top)) out.push(`  ×${m.toFixed(3).padStart(7)}  ${s.label.replace(/\n/g, " / ").slice(0, 110)}`);
  out.push("", "unverified assumptions (DPS ÷ when switched to the conservative reading):");
  for (const a of UNVERIFIED) {
    const set = a.drop ? r.sources.filter(s => !a.drop!.test(s.label)) : r.sources;
    out.push(`  ÷${(base / dps(set, a.tweak)).toFixed(3).padStart(6)}  ${a.id.padEnd(13)} ${a.what}`);
  }
  return out;
}
