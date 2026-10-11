/* Model prediction for one in-game A/B — run BEFORE touching the game (bing-ab-test SKILL.md).
   usage (from packages/dmg):
     npx tsx ../../.claude/skills/bing-ab-test/predict.ts <build.json> --label <name>
       [--drop <source-label regex>]... [--set <path>=<n>]... [--mul <path>=<n>]... [--vs <variant build.json>]
       [--both <source-label regex>]... [--season ss13|ss14]
   A = the build without --both's sources; B = A without the dropped sources, with the set/mul tweaks (applied
   after the season), or --vs's build. A-side tweaks: run twice and divide.
   Prints A, B and A/B (the ratio combat.mjs measures as baseline ÷ variant); appends one line to
   scratch/predictions.jsonl (next to measurements.jsonl) so the review can check the prediction came first. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadForImport } from "../../../packages/dmg/src/bingDiagnose.js";
import { BING_ZERO, compose, effective, type Source } from "../../../packages/dmg/src/bingLedger.js";
import { cycleDps } from "../../../packages/dmg/src/damageModel.js";
import { applySeason, type Season } from "../../../packages/dmg/src/seasons.js";

const [file, ...rest] = process.argv.slice(2);
const opt = (k: string) => rest.flatMap((a, i) => a === k ? [rest[i + 1]] : []);
const label = opt("--label")[0], season = (opt("--season")[0] ?? "ss13") as Season;
if (!file || !label) throw new Error("usage: predict.ts <build.json> --label <name> [--drop re] [--set p=n] [--mul p=n] [--vs b.json]");

const drops = opt("--drop").map(s => new RegExp(s));
const tweaks = [...opt("--set").map(s => ["set", s]), ...opt("--mul").map(s => ["mul", s])].map(([op, s]) => {
  const [p, n] = s.split("="), keys = p.split("."), last = keys.pop()!;
  return (snap: any) => {
    const o = keys.reduce((x, k) => x[k] ??= {}, snap);
    if (op === "mul" && o[last] === undefined) throw new Error(`--mul ${p}: path is unset`);
    o[last] = op === "set" ? +n : o[last] * +n;
  };
});
const dps = (sources: Source[], tw: ((s: any) => void)[] = []) => {
  const snap: any = applySeason(compose(BING_ZERO, effective(sources)), season);
  for (const t of tw) t(snap);
  return cycleDps(snap).dps;
};

const both = opt("--both").map(s => new RegExp(s));
const a = loadForImport(file).sources.filter(s => !both.some(re => re.test(s.label)));
const dropped = a.filter(s => drops.some(re => re.test(s.label)));
if (drops.length && !dropped.length) throw new Error("--drop matched no source; list them with tli-game/sources.ts");
const vs = opt("--vs")[0];
const A = dps(a), B = vs ? dps(loadForImport(vs).sources, tweaks) : dps(a.filter(s => !dropped.includes(s)), tweaks);
const row = { label, at: new Date().toISOString(), build: file, vs, both: opt("--both"), drop: opt("--drop"), set: opt("--set"), mul: opt("--mul"),
  season, A, B, ratio: A / B, dropped: dropped.map(s => s.label.slice(0, 100)) };
const log = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../scratch/predictions.jsonl");
fs.mkdirSync(path.dirname(log), { recursive: true });
fs.appendFileSync(log, JSON.stringify(row) + "\n");
console.log(`${label}: A ${(A / 1e9).toFixed(1)}B  B ${(B / 1e9).toFixed(1)}B  A/B ÷${(A / B).toFixed(3)}`);
for (const d of row.dropped) console.log(`  dropped ${d}`);
console.log(`  -> ${log}`);
