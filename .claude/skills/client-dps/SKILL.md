---
name: client-dps
description: "Use when computing or extending the client-data Bing DPS calculator (packages/dmg/src/bingClient.ts, clientModel.ts, clientDps.ts) — importing a build from the live game into data/client/builds, decoding a new affix node/condition/buff from the client, or checking a calculator number against the in-game sheet or dummy. Triggers: bingDps, clientModel, build_model.py, run_model.py, export_model.py, loadout.py, affix class, behaviour tree, config_char_buff, Judgment slate, 40T build."
---

# client-dps

A Bing calculator built only from the game client's tables and code. Full handoff: `docs/client-dps-handoff.md`.
Never quote DPS from docs — rerun `cd packages/dmg && npx vitest run test/bingClient.test.ts`.

## Rules
- Game access is **read-only memory** (`../dps-debug/tools/mem.py`). No writes, injection or hooks.
- No tlidb values; no logic from `bing*.ts` / `damageModel.ts` (running the legacy CLI only to compare outputs is fine).
- Every non-data quantity goes into `BingAssumptions` with its source; every game-displayed value gets a test.

## Import a build
1. Open the build page in game (Pro Builds → Collection, or own character). Capture with poorchlight
   (`tli_dump --portable-json`) → `_last_live_portable.json` / `_last_live_snapshot.json`.
2. `cd ../dps-debug && python tools/loadout.py` (edit the slug/trait levels at the bottom) or
   `python tools/compendium_loadout.py <scraped.json> <slug>` for GUID exports.
3. With the build page still open: `python tools/prisms.py` (pro page) or `... Module.Talent.Mgr.TalentJewelryMgr`
   (own character) and save the result as `evidence/talents_<slug>.json` (prism / Inverse Image state is server-side).
4. `python tools/build_model.py <slug> && python tools/run_model.py <slug> && python tools/export_model.py <slug>`.
5. Add a describe block to `test/bingClient.test.ts` pinning every value the game shows (sheet, Stats page, overview).

## Decoding something new
- Node fields: `python tools/parsekeys.py evidence/<parse fns>.c` (key, typed parser, offset).
- Conditions: `evidence/cond_schema.json`; filters: factory `FUN_1419e4430` (filter 1 = target list 1 self/3 minion/8 enemy).
- Buffs: `tools/buffs.py <id>` (affixList JSON at row +0x160; default duration table at +0x110).
- Unknown mechanic: decompile with `../dps-debug/ghidra/decomp.sh OUT.c 0 0xADDR` and annotate with `tools/annotate.py`;
  write the finding into `../dps-debug/evidence/<topic>.md` and a ruling into the plan ledger.

## Checks that caught real bugs
- Sheet Damage Bonus / Strength / crit vs `Pool` sums (found the Judgment slate and prism points).
- Measured top-level per-hit (pummel 1.964B, explosion 0.780B) vs `bingDps(...).topPummel` with `buffUptime: {}`.
- Legacy model factor tree (`../dps-debug/scratch_review/legacy40b.mts`) for line-by-line differences.
