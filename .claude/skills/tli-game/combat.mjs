/* Measure at the training dummy from memory (tli_dump --combat-json; elevated shell, ~1.1s per read).
   usage: node combat.mjs [secs=60] [--label name]
   Polls the dummy's total damage, your buffs and the dummy's debuffs; prints DPS over the window
   (Δ total damage / Δ wall clock — no 1s duration rounding), per-buff uptime, and debuff stacks.
   Appends one JSON line per run to scratch/measurements.jsonl next to the repo. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const secs = Number(args.find(a => /^\d+$/.test(a)) ?? 60);
const label = args.includes("--label") ? args[args.indexOf("--label") + 1] : "";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const poor = path.resolve(here, "../../../../poorchlight");
const read = () => {
  const t = Date.now();
  const j = JSON.parse(execFileSync(path.join(poor, "target/release/tli_dump.exe"), ["--combat-json"],
    { cwd: poor, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 24 }).toString("utf8"));
  return { t: (t + Date.now()) / 2, j };
};

const samples = [read()];
while (samples.at(-1).t - samples[0].t < secs * 1000) samples.push(read());
const [a, b] = [samples[0], samples.at(-1)];
const dt = (b.t - a.t) / 1000;
const dps = (b.j.dummy.totalDamage - a.j.dummy.totalDamage) / dt;
const up = {}, stacks = {};
for (const s of samples) {
  for (const x of s.j.buffs ?? []) up[x.name] = (up[x.name] ?? 0) + 1;
  for (const x of s.j.target?.debuffs ?? []) {
    up[`target:${x.name}`] = (up[`target:${x.name}`] ?? 0) + 1;
    if (x.stacks != null) (stacks[x.name] ??= []).push(x.stacks);
  }
}
const fmt = n => n >= 1e12 ? `${(n / 1e12).toFixed(3)}T` : `${(n / 1e9).toFixed(1)}B`;
const reset = b.j.dummy.totalDamage < a.j.dummy.totalDamage;
console.log(`${label ? label + ": " : ""}DPS ${fmt(dps)} over ${dt.toFixed(1)}s (${samples.length} reads)${reset ? "  !! count was reset mid-window" : ""}`);
console.log(`dummy panel: avg ${fmt(b.j.dummy.avgDps)} over ${b.j.dummy.durationS}s, best 5s ${fmt(b.j.dummy.best5s)}`);
for (const [k, n] of Object.entries(up).sort((x, y) => y[1] - x[1]))
  console.log(`  ${(100 * n / samples.length).toFixed(0).padStart(3)}%  ${k}${stacks[k.replace("target:", "")] ? `  stacks avg ${(stacks[k.replace("target:", "")].reduce((s, v) => s + v, 0) / stacks[k.replace("target:", "")].length).toFixed(1)}` : ""}`);
const log = path.resolve(here, "../../../../scratch/measurements.jsonl");
fs.mkdirSync(path.dirname(log), { recursive: true });
fs.appendFileSync(log, JSON.stringify({ label, at: new Date(a.t).toISOString(), secs: dt, dps, reads: samples.length,
  uptime: Object.fromEntries(Object.entries(up).map(([k, n]) => [k, n / samples.length])),
  stacks: Object.fromEntries(Object.entries(stacks).map(([k, v]) => [k, v.reduce((s, x) => s + x, 0) / v.length])) }) + "\n");
