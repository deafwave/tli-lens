import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// @dps/* = the pinned dps-debug model (read-only). DPS_DEBUG_PIN overrides the pin's root (the dps-debug checkout, not model/).
const pin = process.env.DPS_DEBUG_PIN ?? fileURLToPath(new URL('../../../dps-debug/.worktrees/guide-pin', import.meta.url));
export default defineConfig({
  resolve: { alias: [{ find: /^@dps\/(.*)$/, replacement: `${pin.replace(/\/g, '/')}/model/$1` }] },
  test: { testTimeout: 120_000 },
});
