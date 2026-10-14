/** Real-figure tests spawn dps-debug workers: opt in with GUIDE_REAL=1, and never while the owner's game capture flag exists. */
import { existsSync } from 'node:fs';

export const GAME_BUSY = 'C:/Users/deafwave/Documents/no_access/tli/dps-debug/.worktrees/track-a/.cache/game.busy';
export function realSkip(): string | undefined {
  if (process.env.GUIDE_REAL !== '1') return 'real figures skipped: set GUIDE_REAL=1 to run them';
  if (existsSync(GAME_BUSY)) return `real figures skipped: ${GAME_BUSY} exists (game capture running)`;
  return undefined;
}
