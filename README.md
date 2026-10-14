# TLI Lens

Build-progression guide for Torchlight: Infinite. `packages/guide` drives the pinned dps-debug calculator
and writes `packages/page/src/data/guide.json`; `packages/page` (Vite) renders it.

- `pnpm guide ideal|advise|figure` - generate / advise / look up a figure
- `pnpm dev` / `pnpm build` - the page
- `pnpm test` - all package tests

dps-debug is the only calculator; figures are never hand-written. See `CLAUDE.md`.
