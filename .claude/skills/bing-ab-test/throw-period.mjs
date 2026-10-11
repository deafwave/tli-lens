/* Burst frequency of HoA damage from tli_dump --combat-watch CSVs (t_ms,total_damage,duration_s,frame).
   Per-logic-frame damage with the Deterioration tick phase (the global 10-frame clock) zeroed, then a periodogram
   over 6–60 frames. Each throw lobs 2 bombs, so the top peak may be the bomb rate (2× throws): compare states by
   ratio, never one state's peak against a model throw rate.
   usage: node throw-period.mjs <combat_watch.csv>... (combat.mjs overwrites
          ../poorchlight/tli_dump/diagnostics/_last_combat_watch.csv on every run — copy it per label first) */
import fs from "node:fs";

for (const file of process.argv.slice(2)) {
  const rows = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).slice(1).map(l => l.split(",").map(Number));
  const f0 = rows[0][3], n = rows.at(-1)[3] - f0 + 1, x = new Float64Array(n);
  for (let i = 1; i < rows.length; i++) x[rows[i][3] - f0] += rows[i][1] - rows[i - 1][1];
  const phase = Array.from({ length: 10 }, (_, p) => { let s = 0; for (let i = p; i < n; i += 10) s += x[i]; return s; });
  const tick = phase.indexOf(Math.max(...phase));
  const y = x.map((v, i) => (i % 10 === tick ? 0 : v)), m = y.reduce((a, b) => a + b, 0) / n;
  const P = [];
  for (let T = 6; T <= 60.0001; T += 0.1) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / T; re += (y[i] - m) * Math.cos(a); im += (y[i] - m) * Math.sin(a); }
    P.push([T, re * re + im * im]);
  }
  const mx = Math.max(...P.map(p => p[1]));
  const peaks = P.filter((p, i) => i > 0 && i < P.length - 1 && p[1] > P[i - 1][1] && p[1] >= P[i + 1][1] && p[1] > 0.08 * mx)
    .sort((a, b) => b[1] - a[1]).slice(0, 5);
  const second = Math.max(...phase.filter((_, p) => p !== tick));
  console.log(`${file}: ${(n / 30).toFixed(1)} game-s, tick phase ${tick} (${(100 * phase[tick] / x.reduce((a, b) => a + b, 0)).toFixed(0)}% of damage${second > 0.9 * phase[tick] ? ", ambiguous" : ""})`);
  for (const [T, p] of peaks) console.log(`  ${T.toFixed(1).padStart(5)} frames = ${(30 / T).toFixed(3)}/s  power ${(p / mx).toFixed(3)}`);
}
