/* Which bosses are worth farming, from ETor's run log: pnpm guide:bosses [--etor <dir>] [--prices <file>]. Prices: prices.json (yours) over ETor's. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankMaps, readEtor } from '../src/bosses';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const pricesFile = arg('--prices') ?? fileURLToPath(new URL('../../../prices.json', import.meta.url));
const mine: Record<string, number> = existsSync(pricesFile) ? JSON.parse(readFileSync(pricesFile, 'utf8')) : {};
const etor = readEtor(arg('--etor') ?? join(process.env.APPDATA ?? '', 'etor'));
const theirs = new Map(etor.priceDatabase.map(p => [p.name, p.price]));
const rows = rankMaps(etor.mapHistory, n => mine[n] ?? theirs.get(n));

const f = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString() : '-');
console.log(`ETor saved ${new Date(etor.savedAt).toLocaleString()}; FE after the 12.5 % tax, per hour of map time (town time not counted)`);
console.table(rows.map(r => ({
  boss: r.name, runs: r.runs, 'min/run': r.minutes.toFixed(1), 'loot/run': f(r.loot), 'keys/run': f(r.cost),
  'always/run': r.unpriced.length ? `unpriced: ${r.unpriced.join(', ')}` : f(r.always), 'net/run': f(r.net), 'FE/h': f(r.perHour), '± FE/h': f(r.se),
})));
const missing = [...new Set(rows.flatMap(r => r.unpriced))];
if (missing.length) console.log(`Put a price on ${missing.join(', ')} in ${pricesFile} ({ "<name>": FE }) to count it.`);
