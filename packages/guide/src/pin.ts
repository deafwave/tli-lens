/** The pinned poorchlight checkout (read-only), its data root and its extracted catalog; the one place that finds any of them. */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** env TLI_LENS_PIN, else walk up from this module's directory until `<ancestor>/poorchlight/.worktrees/tli-lens-pin` exists
 *  (works from the main checkout and from `.worktrees/<t>`); throws `poorchlight pin not found (set TLI_LENS_PIN)` */
export function pinRoot(): string {
  if (process.env.TLI_LENS_PIN) return process.env.TLI_LENS_PIN;
  for (let d = dirname(fileURLToPath(import.meta.url)); dirname(d) !== d; d = dirname(d)) {
    const p = join(d, 'poorchlight', '.worktrees', 'tli-lens-pin');
    if (existsSync(p)) return p;
  }
  throw new Error('poorchlight pin not found (set TLI_LENS_PIN)');
}

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
/** catalog table `name` at its highest revision (`name.json`, `name.r2.json`, … → the largest rN), JSON-parsed once per process */
export function table<T = unknown>(name: string): T {
  if (!tables.has(name)) {
    const dir = catalogDir(), re = new RegExp(`^${name}(?:\\.r(\\d+))?\\.json$`);
    const rev = (f: string) => { const m = re.exec(f); return m ? Number(m[1] ?? 1) : 0; };
    const best = readdirSync(dir).filter(f => rev(f) > 0).sort((a, b) => rev(b) - rev(a))[0];
    if (!best) throw new Error(`catalog table ${name} not found in ${dir}`);
    tables.set(name, JSON.parse(readFileSync(join(dir, best), 'utf8')));
  }
  return tables.get(name) as T;
}

let commit: string | undefined;
/** `git rev-parse HEAD` of the pin, read once */
export function pinCommit(): string {
  return commit ??= execFileSync('git', ['-c', 'safe.directory=*', '-C', pinRoot(), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}
