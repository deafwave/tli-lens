/* Measure at the training dummy from memory (elevated shell; poorchlight tli_dump).
   usage: node combat.mjs [secs=120] [--label name] [--buffs]
   DPS is per GAME second: Δ total damage / (Δ logic frames / 30) — the dummy panel's own clock. The client
   simulates slower than real time when its frame rate drops (0.7–0.9× seen), so wall-clock DPS reads low and
   drifts; never compare wall-clock numbers to the model. --buffs adds a buff/debuff uptime pass (one
   --combat-json read per ~1.1s for the same duration, run afterwards).
   Appends one JSON line per run to scratch/measurements.jsonl. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const secs = Number(args.find(a => /^\d+$/.test(a)) ?? 120);
const label = args.includes("--label") ? args[args.indexOf("--label") + 1] : "";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const poor = path.resolve(here, "../../../../poorchlight");
const exe = path.join(poor, "target/release/tli_dump.exe");
const fmt = n => n >= 1e12 ? `${(n / 1e12).toFixed(3)}T` : `${(n / 1e9).toFixed(1)}B`;

execFileSync(exe, ["--combat-watch", String(secs), "--interval-ms", "10"], { cwd: poor, stdio: ["ignore", "ignore", "ignore"] });
const rows = fs.readFileSync(path.join(poor, "tli_dump/diagnostics/_last_combat_watch.csv"), "utf8").trim().split(/\r?\n/).slice(1)
  .map(l => l.split(",").map(Number)).map(([t, dmg, dur, frame]) => ({ t, dmg, dur, frame }));
const [a, b] = [rows[0], rows.at(-1)];
const gameS = (b.frame - a.frame) / 30, wallS = (b.t - a.t) / 1000;
const out = { label, at: new Date().toISOString(), wallS, gameS, speed: gameS / wallS,
  dps: (b.dmg - a.dmg) / gameS, wallDps: (b.dmg - a.dmg) / wallS, increments: rows.length - 2 };
console.log(`${label ? label + ": " : ""}DPS ${fmt(out.dps)} per game-second over ${gameS.toFixed(1)} game-s ` +
  `(${wallS.toFixed(1)} wall-s, sim speed ${out.speed.toFixed(2)}×, wall-clock ${fmt(out.wallDps)})${b.dmg < a.dmg ? "  !! count reset" : ""}`);

if (args.includes("--buffs")) {
  const up = {}, stacks = {}; let n = 0; const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) {
    const j = JSON.parse(execFileSync(exe, ["--combat-json"], { cwd: poor, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 24 }).toString("utf8"));
    n++;
    for (const x of j.buffs ?? []) up[x.name] = (up[x.name] ?? 0) + 1;
    for (const x of j.target?.debuffs ?? []) {
      up[`target:${x.name}`] = (up[`target:${x.name}`] ?? 0) + 1;
      if (x.stacks != null) (stacks[x.name] ??= []).push(x.stacks);
    }
  }
  out.uptime = Object.fromEntries(Object.entries(up).map(([k, v]) => [k, v / n]));
  out.stacks = Object.fromEntries(Object.entries(stacks).map(([k, v]) => [k, v.reduce((s, x) => s + x, 0) / v.length]));
  for (const [k, v] of Object.entries(out.uptime).sort((x, y) => y[1] - x[1]))
    console.log(`  ${(100 * v).toFixed(0).padStart(3)}%  ${k}${out.stacks[k.replace("target:", "")] != null ? `  stacks avg ${out.stacks[k.replace("target:", "")].toFixed(1)}` : ""}`);
}
const log = path.resolve(here, "../../../../scratch/measurements.jsonl");
fs.mkdirSync(path.dirname(log), { recursive: true });
fs.appendFileSync(log, JSON.stringify(out) + "\n");
