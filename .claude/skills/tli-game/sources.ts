/* Which model sources feed a snapshot path — compare against the in-game sheet's per-category breakdown.
   usage (from packages/dmg): npx tsx ../../.claude/skills/tli-game/sources.ts <build.json> <path-regex>...
   e.g. sources.ts ../../data/bing1/scraped/my-build-2026-10-10.json "^crit\.damage_pct$" "crit_rating" */
import { loadForImport } from "../../../packages/dmg/src/bingDiagnose.js";
import { BING_ZERO, compose, effective } from "../../../packages/dmg/src/bingLedger.js";

const [file, ...paths] = process.argv.slice(2);
const r = loadForImport(file);
const live = effective(r.sources);
const snap: any = compose(BING_ZERO, live);
const get = (p: string) => p.split(".").reduce((o, k) => o?.[k], snap);
for (const p of paths) {
  const re = new RegExp(p);
  let sum = 0;
  console.log(`== ${p}`);
  for (const s of live) for (const e of s.edits) if (re.test(String(e[1]))) {
    console.log(`  ${e[0]} ${String(e[2]).padStart(9)}  ${String(e[1]).padEnd(36)} ${s.label.replace(/\n/g, " / ").slice(0, 100)}`);
    if (e[0] === "add") sum += +e[2];
  }
  const plain = p.replace(/[$^\\]/g, "");
  const composed = /^[\w.]+$/.test(plain) ? `   composed ${plain} = ${JSON.stringify(get(plain))}` : "";
  console.log(`  Σadd ${+sum.toFixed(4)}${composed}`);
}
