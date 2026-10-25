import { defineConfig } from 'vitest/config';
import { pinRoot } from './src/pin.ts';

// @dps/* = the pinned poorchlight model (read-only). TLI_LENS_PIN overrides the pin's root (the poorchlight checkout, not model/).
const pin = pinRoot();
export default defineConfig({
  resolve: { alias: [{ find: /^@dps\/(.*)$/, replacement: `${pin.replaceAll('\\', '/')}/model/$1` }] },
  test: { testTimeout: 120_000, setupFiles: ['test/setup.ts'] },
});
