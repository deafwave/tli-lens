/** The pinned poorchlight checkout's root alone: vitest.config.ts reads it to alias @dps/*, before that alias exists (pin.ts imports the model through it). */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

