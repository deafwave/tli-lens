/** The pinned poorchlight checkout (read-only), its data root and its extracted catalog; the one place that finds any of them. */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSeasonTable } from '@dps/src/harness/season';
import { pinRoot } from './root';

export { pinRoot };

/** the git-ignored data (captures/, catalog/, game/), which the pin worktree does not carry: env TLI_DATA, else the pin's main checkout
 *  (the model resolves it the same way: model/src/harness/data.ts) */
export function dataRoot(): string {
  if (process.env.TLI_DATA) return resolve(process.env.TLI_DATA);
  const root = pinRoot();
  return dirname(resolve(root, execFileSync('git', ['-c', 'safe.directory=*', '-C', root, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim()));
}

/** a repo path: the pin's own copy when tracked there (re/evidence/...), else the data root's */
export function pinFile(...p: string[]): string {
  const own = join(pinRoot(), ...p);
  return existsSync(own) ? own : join(dataRoot(), ...p);
}

/** `<dataRoot>/catalog/0x6aa39847` (the client build the catalog is extracted from) */
export function catalogDir(): string { return join(dataRoot(), 'catalog', '0x6aa39847'); }

const tables = new Map<string, unknown>();
/** catalog table `name` at its highest revision (`name.json`, `name.r2.json`, … → the largest rN), the later clients' rows laid over it, JSON-parsed once per process */
export function table<T = unknown>(name: string): T {
  if (!tables.has(name)) {
    const dir = catalogDir(), re = new RegExp(`^${name}(?:\\.r(\\d+))?\\.json$`);
    const rev = (f: string) => { const m = re.exec(f); return m ? Number(m[1] ?? 1) : 0; };
    const best = readdirSync(dir).filter(f => rev(f) > 0).sort((a, b) => rev(b) - rev(a))[0];
    if (!best) throw new Error(`catalog table ${name} not found in ${dir}`);
    // the season client's and the installed client's rows over the pinned ones (the model's withSeason, one table): the season's gems, stones and names
    const t = JSON.parse(readFileSync(join(dir, best), 'utf8')) as { rows?: Record<string, unknown> };
    if (t.rows) t.rows = withSeasonTable(name, t.rows, join(dataRoot(), 'catalog'));
    tables.set(name, t);
  }
  return tables.get(name) as T;
}

let commit: string | undefined;
/** `git rev-parse HEAD` of the pin, read once */
export function pinCommit(): string {
  return commit ??= execFileSync('git', ['-c', 'safe.directory=*', '-C', pinRoot(), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}
