---
name: tli-game
description: "Read and drive the running Torchlight: Infinite client — memory-read the build page (gear, skills+supports, talents, slates, prisms, memories, pactspirits, kismets), scrape builds, screenshot, press keys, click and hover the UI, and compare model sources against the in-game character sheet. Use when validating the Bing/HoA DPS model against the game, scraping a Pro Build or the user's own build, or navigating game menus."
---

# tli-game

**Memory first, screen second.** Everything a build page shows is in memory; read it with `state.mjs`
or `scripts/scrape_build.mjs`. Use screenshots/input only for what memory does not hold yet (the
character sheet, the dummy DPS readout) or to open a page so memory can be read. All of it needs
the **elevated** shell and the sibling repo `../poorchlight` (`target/release/tli_dump.exe` built).

## Memory reads

| Command (repo root) | What |
|---|---|
| `node .claude/skills/tli-game/state.mjs [--reuse] [--section gear\|skills\|memories\|traits\|talents\|slates\|prisms\|pacts\|kismets\|issues]` | readable dump of the open build page — every affix with its in-game text, supports by socket with Magnificent rolls, talent points per node, pact levels |
| `node scripts/scrape_build.mjs <slug> --stated "<DPS + what it measured>"` | writes `data/bing1/scraped/<slug>.json` (planner export + native talents + prism placements) for `pnpm bing diagnose data/bing1/scraped/<slug>.json --season ss13` |

The page read is whatever **build page** is open: a Pro Build, a Hunter File, or the user's own build
(`sourcePage` `ViewPlayerBDReference`, `hero.sourceName` = character name). Any tab works.

Where things live (`poorchlight/tli_dump/diagnostics/`):
- `_last_live_portable.json` → `proBuild.loadout.{hero, heroMemories, gear, skills, skillTree, divinity, etherealPrisms, pactspirits, kismets, vorax}`; affix text is in `affixes.*[].Simple` (strip `<p>`/`<e>` tags), raw ids in `.Id`, rolls in `DynArgs`.
- `_last_live_snapshot.json` (raw) → `GeniusInfos` (talent `GeniusList` node→points, `BonusTalents`), `EtherealPrismState.Placements` (the portable projection drops placements).
- Skills: `data.compendiumPlacement` = `{kind, slot, ownerKind, ownerSlot}`; level = `itemLevel`; Magnificent roll = `data.ServerPlayerItem.Prefix[].DynArgs`, tier from `identity.base.metadata.skillTierProgression`.
- Pactspirit level = `StarRank`. Six can be equipped; drop pacts (Captain Shadow, Chalk Spirit, Twilight Sparks…) are loot-only and the exporter skips them.
- Talent node id `<tree:2><col:2><row:2>00` (cols = point thresholds 0…18 → 1…7, rows 1…5).
- Known exporter gaps (handled in `scrape_build.mjs` / `bingImport.ts`): Magnificent tiers missing from poorchlight's catalog (restored from the item's tier table); 1,069 catalog GUIDs carry two game ids — index game ids from the raw entry list, never a GUID-keyed map; prism base attribute `1204509011` has no text anywhere.

## Screen and input

`powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/tli-game/game.ps1 <cmd>` — coordinates are
**game-window pixels** (client 3440×1440 on the primary monitor).

| cmd | |
|---|---|
| `shot <out.png> [x y w h] [scale]` | screenshot (default whole window at 0.5); then `Read` the png. Crop + scale 0.6–0.8 to read numbers |
| `key B` / `key ESC` | scancode key presses (VK-only keys are ignored) |
| `click x y` · `move x y` · `wheel x y -6` | legacy `mouse_event` (the game ignores SendInput clicks). **A click outside a panel walks the character** — only click on panels |
| `measure <out.png> [secs=32] [KEY every-s]` | stop any running count, Recount on the dummy panel, wait (optionally pressing a key on a timer, cursor parked on the character), screenshot the panel |
| `burst <out.png> <frames> <ms> <x y w h> [cols] [scale]` | timestamped contact sheet — count throws (hammer-up pose, crop `1640 480 160 180`), buff uptime (buff row crop `400 20 420 60`), ticks |

Keys (ESC menu lists them): **B** inventory + character sheet, F1 Trade House, F2 Skill, F3 Talent, F4 Hero Trait,
F5 Pact, M World Map, P Boon, K Season Pass, J Outfit, O Help; skill bar SPACE (Blink), R (HoA — disabled under
Firepower Coverage), mouse, E, Q, F. **ESC** opens/closes the menu; close panels with their X (character sheet X at
3354,54; menu back arrow 3370,76) — B does not always toggle the sheet shut.

Character sheet (B), right panel at x≈1900–2460: tab icons at y=320 — Overview x=2016, **Damage x=2132**,
Defense x=2248, 4th x=2364. Damage tab has a skill dropdown (Hammer of Ash) and rows; wheel over x=2180
to scroll. **Hover a row → tooltip; click the row to pin it, then click the tooltip's `Base`/`Additional
Bonus ▼` bar to expand the per-category breakdown** (Base Value / Talent / Hero Memories / Gear / Skill / Others).

**The sheet is static data only.** Its DPS (≈18M vs a real 484B) ignores buffs, procs, Deterioration,
enemy-taken and conditional lines; "Additional Damage Bonus" lists only buffs live at that instant and
hides "additional Base Damage" lines. Use it to check inputs, not outcomes: Strength, crit chance/damage,
typed increased pools, attack speed, penetration, projectile count, knockback. Then
`cd packages/dmg && npx tsx ../../.claude/skills/tli-game/sources.ts <build.json> '<path regex>'` lists the
model sources behind a stat and its composed value, to diff against the breakdown categories.

Checked 2026-10-10 on DeafwaveB (`data/bing1/scraped/my-build-2026-10-10.json`): Strength 339, crit chance
57.05%, crit damage 324 (150 base + 121 talent + 53 memory), physical 176, fire 48, erosion 247, attack
1.97/s (model ×1.05 Aggression in combat), knockback 48, erosion pen 10, projectiles 6 — all exact.

The dummy panel's **Info** tab (click 450,174) is the same sheet **captured in combat** (DPS 46M vs 18M at rest):
its Damage section (269,269) shows live buffs (Kaleidoscope turns, Bull's Rage) — sample it, values change by the second.

## DPS readings

The training dummy's panel (top-left of the hideout, crop `0 140 680 440`) shows span average, duration,
best 5s and 5s average. The user runs the timing macro; read the result by screenshot. Ratios need 3
span runs per state in one session (mechanics.md#real-build). Measured 2026-10-10: **484,260,480,426**
span over 31s for the build above; self-measured with no input 498.3B (50s) and 492.8B (32s).

Observed 2026-10-10 (no input, standing at the dummy): **auto-throws every ~0.48s = sheet APS 1.97 × Aggression
1.05** (burst count); **Bull's Rage up ~62%** (37/60 samples over 30s); **Blink cannot be cast** — Mana 17–22/520
with 498 sealed by auras, so Blade-dancer's after-Mobility +45% and Saintess Repentance (needs a Blessing) are off;
Feline Stimulant 5 stacks, Attack Aggression and the four aura buffs are always up.
