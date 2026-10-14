/** Figure memo keyed by pin + skill + level + canonical JSON of (loadout, changes). In-process always; on disk only when the pin is clean. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** JSON with object keys sorted, so equal values give equal text */
export function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x);
}

export const memoKey = (pin: string, skill: string, level: number, loadout: unknown, changes: unknown): string =>
  `${pin}|${skill}|${level}|${canonical([loadout, changes])}`;

export function createMemo<T>(pin: string, dir?: string) {
  const mem = new Map<string, Promise<T>>();
  // a +dirty pin names no fixed tree: never persisted
  const disk = dir && !pin.endsWith('+dirty') ? dir : undefined;
  const file = (key: string) => join(disk!, `${createHash('sha256').update(key).digest('hex')}.json`);
  return {
    /** the memoised value for `key`, else `compute()` (concurrent callers share one computation) */
    async get(key: string, compute: () => Promise<T>): Promise<T> {
      const hit = mem.get(key);
      if (hit) return hit;
      const p = (async () => {
        if (disk && existsSync(file(key))) return JSON.parse(readFileSync(file(key), 'utf8')) as T;
        const v = await compute();
        if (disk) { mkdirSync(disk, { recursive: true }); writeFileSync(file(key), JSON.stringify(v)); }
        return v;
      })();
      mem.set(key, p);
      p.catch(() => mem.delete(key));
      return p;
    },
  };
}
