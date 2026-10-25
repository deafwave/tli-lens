---
name: tli-game
description: "Read and drive the running Torchlight: Infinite client: the skill lives in poorchlight (../poorchlight/.claude/skills/tli-game). Use when checking the model against the game, reading a Pro Build or the user's own build, measuring dummy DPS, or navigating game menus."
---

# tli-game

The skill and its scripts (`state.mjs`, `ops.mjs`, `combat.mjs`, `game.ps1`) live in poorchlight, the repo that reads the game:
read `../poorchlight/.claude/skills/tli-game/SKILL.md` and run them from `../poorchlight` (they write under poorchlight's `.cache/` and `game/`).
Any in-game change or measurement follows poorchlight's `game-protocol` skill. tli-lens reads the game only through `tli.exe`
(`tli export` for `plan`, `tli market` for the market skill).

Notes for tli-lens's use of a build-page read (`state.mjs`):

- The page read is whatever build page is open: a Pro Build, a Hunter File or the user's own build (`sourcePage` `ViewPlayerBDReference`,
  `hero.sourceName` = the character name). Any tab works.
- Six pactspirits are equipped: slots 1-3 battle (`installServantType` 1), 4-6 drop pactspirits (type 2, loot only; the owner's read 2026-10-17).
- Known exporter gaps: Magnificent tiers missing from poorchlight's catalog (restored from the item's tier table); 1,069 catalog GUIDs carry
  two game ids (index game ids from the raw entry list, never a GUID-keyed map); prism base attribute `1204509011` has no text anywhere.
