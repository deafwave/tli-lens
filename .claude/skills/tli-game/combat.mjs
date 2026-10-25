/* Measure at the training dummy from memory (elevated shell; poorchlight reader/hits.py, and its tli_dump for --buffs).
   usage: node combat.mjs [secs=30] [--label name] [--buffs]
   DPS is the damage BEFORE the damage lock only (owner, 2026-10-18: "ONLY use pre-lock damage, ever"): the dummy's unlimited counter
   (UWoodStakeMgr, hits.STAKE) over the window ÷ game seconds (logic frames / 30, the dummy panel's own clock; the client simulates slower than
   real time when its frame rate drops, so never wall-clock). The panel's counter is after the lock (it sat at 1.43e13 / s while the pre-lock
   damage was 2.5e13 on 2026-10-18) and is never reported. Every hit is read too (hits.py's CSV kept as .cache/tli-game/watch/<label>-hits.csv):
   per source (a follower's hits are another source; the largest is taken as you), hit types, and Σ per-hit pre-lock (FHurtHit +0x38) ÷ the
   counter, which must be 1 within 0.5 %, else the run is flagged.
   --buffs adds a buff/debuff uptime pass (one tli_dump --combat-json read per ~1.1s over the same window).
   Appends one JSON line per run to .cache/tli-game/measurements.jsonl. */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const secs = Number(args.find(a => /^\d+$/.test(a)) ?? 30);
const label = args.includes("--label") ? args[args.indexOf("--label") + 1] : "";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const poor = path.resolve(here, "../../../../poorchlight"), dd = poor;
const exe = path.join(poor, "target/release/tli_dump.exe");
const fmt = n => n >= 1e12 ? `${(n / 1e12).toFixed(3)}T` : `${(n / 1e9).toFixed(1)}B`;

const watchDir = path.resolve(here, "../../../.cache/tli-game/watch");
fs.mkdirSync(watchDir, { recursive: true });
let kept = path.join(watchDir, `${label || "unlabeled"}-hits.csv`);
for (let i = 2; fs.existsSync(kept); i++) kept = path.join(watchDir, `${label || "unlabeled"}-${i}-hits.csv`);
// hits.py imports its siblings (mem, lua): not -I
let out = "";
const watch = spawn("python", [path.join(dd, "reader/hits.py"), String(secs), "--csv", kept], { cwd: dd, stdio: ["ignore", "pipe", "ignore"] });
const done = new Promise(r => { watch.stdout.on("data", d => { out += d; }); watch.on("exit", r); });
const up = {}, stacks = {}; let n = 0;
if (args.includes("--buffs")) {
  let finished = false; done.then(() => { finished = true; });
  while (!finished) {
    const j = JSON.parse(execFileSync(exe, ["--combat-json"], { cwd: poor, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 24 }).toString("utf8"));
    n++;
    for (const x of j.buffs ?? []) up[x.name] = (up[x.name] ?? 0) + 1;
    for (const x of j.target?.debuffs ?? []) {
      up[`target:${x.name}`] = (up[`target:${x.name}`] ?? 0) + 1;
      if (x.stacks != null) (stacks[x.name] ??= []).push(x.stacks);
    }
    await new Promise(r => setTimeout(r, 0));
  }
}
await done;
const h = JSON.parse(out);
if (h.error) throw new Error(`hits.py: ${h.error}`);
if (h.unlimitedDelta == null) throw new Error("hits.py read no pre-lock total (hits.STAKE for this client?): refusing to report the locked counter");

const bySource = {}, types = {};
for (const l of fs.readFileSync(kept, "utf8").trim().split(/\r?\n/).slice(1)) {
  const c = l.split(","), [kind, crit, src, flags] = [c[1], c[2], c[4], c[7]], pre = Number(c.at(-1));
  bySource[src] = (bySource[src] ?? 0) + pre;
  // kind 4 = HP-removal ticks (Deterioration); kind 0 split by flags (40 Ember volley, 16 main hit)
  const k = kind === "0" ? `hit/${flags}` : kind === "4" ? "hpRemoval" : `kind${kind}`;
  types[k] ??= { n: 0, crit: 0 }; types[k].n++; types[k].crit += Number(crit);
}
const gameS = h.gameS, sources = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
const ratio = h.sumPrelock / h.unlimitedDelta, bad = !(Math.abs(ratio - 1) <= 0.005);
const result = { label, at: new Date().toISOString(), gameS, prelock: true, dps: h.unlimitedDelta / gameS,
  you: sources[0] && { source: Number(sources[0][0]), dps: sources[0][1] / gameS },
  others: Object.fromEntries(sources.slice(1).map(([s, v]) => [s, v / gameS])),
  hits: h.hits, hitsPerS: h.hitsPerGameS, hitTypes: types, prelockSumRatio: ratio, ...(bad ? { hitSumBad: true } : {}) };
console.log(`${label ? label + ": " : ""}pre-lock DPS ${fmt(result.dps)} per game-second over ${gameS.toFixed(1)} game-s` +
  (sources.length > 1 ? `  (you, source ${sources[0][0]}: ${fmt(result.you.dps)}; ${sources.slice(1).map(([s, v]) => `source ${s}: ${(v / gameS).toPrecision(3)}`).join(", ")})` : ""));
console.log(`  hits ${h.hits} (${h.hitsPerGameS.toFixed(1)}/game-s)  Σ per-hit pre-lock ÷ pre-lock counter ${ratio.toFixed(5)}${bad ? "  !! off by >0.5%" : ""}`);
for (const [k, v] of Object.entries(types)) console.log(`    ${k.padEnd(10)} ${String(v.n).padStart(5)}  crit ${v.crit}`);
if (n) {
  result.uptime = Object.fromEntries(Object.entries(up).map(([k, v]) => [k, v / n]));
  result.stacks = Object.fromEntries(Object.entries(stacks).map(([k, v]) => [k, v.reduce((s, x) => s + x, 0) / v.length]));
  for (const [k, v] of Object.entries(result.uptime).sort((x, y) => y[1] - x[1]))
    console.log(`  ${(100 * v).toFixed(0).padStart(3)}%  ${k}${result.stacks[k.replace("target:", "")] != null ? `  stacks avg ${result.stacks[k.replace("target:", "")].toFixed(1)}` : ""}`);
}
const log = path.resolve(here, "../../../.cache/tli-game/measurements.jsonl");
fs.mkdirSync(path.dirname(log), { recursive: true });
fs.appendFileSync(log, JSON.stringify(result) + "\n");
