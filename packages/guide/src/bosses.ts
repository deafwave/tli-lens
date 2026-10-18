/* Which boss maps pay: ETor's run log (its IndexedDB blob: a Blink envelope around a V8-serialized value) grouped by map, net FE per hour of
   map time after the 12.5 % market tax. Time in town between runs (buying keys) is not in ETor's durations. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { deserialize } from 'node:v8';

// mapId -> boss, read off the game log's VO_Boss/<Name> lines after each LevelUid (2026-10-17); entry keys in brackets
export const MAP_NAMES: Record<string, string> = {
  '2000000': 'Traveler 0 [The Beginning]', '2000002': 'Traveler 2 [The End]',
  '4010001': 'JiGang 1 [Edicts]', '4010002': 'JiGang 2 [Edicts]',
  '4020002': 'Pirate 2 [Void Sea Invitation]', '4020003': 'Pirate 3? (no boss line) [Void Sea Invitation]',
  '4030002': 'Lawbearer 2 (cube) [Desire Core]',
};

// The owner: Lawbearer always drops a Fallen Starlight, which ETor does not log (tlidb says "has a chance of dropping").
export const ALWAYS_DROPS: Record<string, { name: string; n: number }[]> = { '4030002': [{ name: 'Fallen Starlight', n: 1 }] };

export const TAX = 0.875; // what a sale nets: ETor's priceNoTax / price

export interface Run { mapId: string; status: string; duration: number; mapEarnings?: { lootNoTax: number; cost: number } }
export interface Row { mapId: string; name: string; runs: number; minutes: number; loot: number; cost: number; always: number; unpriced: string[]; net: number; perHour: number; se: number }

/** Completed runs per map, best net FE per hour first. Always-drops without a price are named in `unpriced` and count 0. */
export function rankMaps(runs: Run[], price: (name: string) => number | undefined): Row[] {
  const by = new Map<string, Run[]>();
  for (const r of runs) if (r.status === 'completed' && r.mapEarnings && r.duration > 0) by.set(r.mapId, [...(by.get(r.mapId) ?? []), r]);
  return [...by].map(([mapId, rs]) => {
    const drops = ALWAYS_DROPS[mapId] ?? [];
    const always = drops.reduce((s, d) => s + (price(d.name) ?? 0) * d.n * TAX, 0);
    const nets = rs.map(r => r.mapEarnings!.lootNoTax + r.mapEarnings!.cost + always);
    const n = rs.length, hours = rs.reduce((s, r) => s + r.duration, 0) / 3.6e6, mean = nets.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(nets.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : NaN;
    return {
      mapId, name: MAP_NAMES[mapId] ?? `map ${mapId}`, runs: n, minutes: hours * 60 / n,
      loot: rs.reduce((s, r) => s + r.mapEarnings!.lootNoTax, 0) / n, cost: rs.reduce((s, r) => s + r.mapEarnings!.cost, 0) / n,
      always, unpriced: drops.filter(d => price(d.name) === undefined).map(d => d.name),
      net: mean, perHour: mean * n / hours, se: sd * Math.sqrt(n) / hours,
    };
  }).sort((a, b) => b.perHour - a.perHour);
}

/** One ETor IndexedDB blob: skip the Blink envelope (0xFF <version> ...) to the V8 header, the next 0xFF. */
export function decodeBlob(b: Buffer): any { return deserialize(b.subarray(b.indexOf(0xff, 2))); }

/** ETor's game data: the newest blob whose key is gameData. `dir` is ETor's app data (%APPDATA%/etor). */
export function readEtor(dir: string): { mapHistory: Run[]; priceDatabase: { name: string; price: number }[]; savedAt: number } {
  const idb = join(dir, 'IndexedDB');
  const blobs = readdirSync(idb).filter(d => d.endsWith('.indexeddb.blob'))
    .flatMap(d => readdirSync(join(idb, d), { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => join(f.parentPath, f.name)))
    .map(f => ({ f, t: statSync(f).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const { f, t } of blobs) {
    let o; try { o = decodeBlob(readFileSync(f)); } catch { continue; }
    if (o?.key !== 'gameData') continue;
    const d = o.value.data.data;
    return { mapHistory: d.maps.mapHistory, priceDatabase: d.items.priceDatabase, savedAt: t };
  }
  throw new Error(`no ETor gameData blob under ${idb}`);
}
