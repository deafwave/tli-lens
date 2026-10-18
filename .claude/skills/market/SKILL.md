---
name: market
description: "Rank the auction house search the player has open in Torchlight: Infinite by the model's % damage gain on your character: gear, vorax limbs and hero memories in place of what you wear (per FE), Divinity Slates in place of one of your slates; --craft ranks gear by price + expected crafting to every wanted T1 mod (market-targets.json). Reads the listings from game memory, no screenshots (a read takes ~30 ms; --watch keeps the workers warm, reads your character fresh and re-ranks on every change). Use when the user asks which market item is the best deal, the best base to craft on, or says /market."
---

# market

1. Run from the tli-lens repository root:

   ```
   pnpm -s guide:market --top 8
   ```

   - It reads the open search result from memory: `scripts/market_listings.py`, which uses dps-debug's reader through `DPS_DEBUG`, by default the sibling `../dps-debug`.
     A listing is read as dps-debug's `reader/loadout.py` reads an item you own: every AffixList list (a ring's, necklace's or belt's implicit is `FixedBaseAffix`), a hero memory's awaken data.
   - "no market search result on screen" means the auction house search isn't open. Ask the user to open it and run the command again.
   - Never click, type or press keys in the game.

2. Report the top listings in one short table: `#n` (the order on screen), the price, the % DPS gain (on the target: raw dummy DPS by default), the %/100 FE and what it replaces
   (the slot, `memory n`, or your slate n). Recommend the best gain per FE, and also the best gain outright if it costs more. A `partial` row is a piece the model
   cannot price (it names what it dropped). It is never ranked, so say it is unknown, not zero.

   - Gear: each listing in place of what you wear in its slot (a ring: the better ring slot).
   - Vorax limb: in its slot type's slot (Digits: ring1 or ring2), in place of the gear there and of your limb: one Vorax Gear at a time (tlidb); a limb you wear in another slot leaves it empty (named in the row).
   - Hero memory: in place of yours of its kind (Origin, Discipline, Progress), its awaken affixes with it.
   - Inverse Image: placed like the example build's (its three reflected Medium talents) at the listing's Medium roll, each copy at your points on its source, your originals and other prisms kept. Its Micro roll (the area's micro talent) is not priced: a row naming it is a lower bound. Medium -100 % or no reflect lines read: unknown.
   - Your character: the newest `dps-debug/game/exports/<stamp>/export-<stamp>.json` (`--export <file>` overrides it). `--watch` reads it again from the game at
     start (~16 s, alongside): unchanged, nothing is priced again; changed, every row is priced again against the new read.

3. `--craft` (gear): ranked by price + expected crafting to every wanted T1 mod instead. If a gear base has no entry in `market-targets.json`, ask the user which
   T1 mods they want. Add them, using T1 ids from `data/affix_library.json` (`tiers[0].tierAffixId` of the item's slot library), then run again.
   - Crafting cost is `craftStep`'s expected embers to roll that exact T1, at live etor ember prices. A two-handed weapon spends 2 embers per craft.
   - Max 2 advanced affixes per item. A listing with an advanced T1 mod outside the target (for example T1 Strength on a maul) can be a cheaper alternative. Mention it.

Notes:
- To test without the game: `pnpm -s guide:market --file <saved listings.json>`.
- `--watch` keeps running: one reader stays attached to the game and reads the screen 10 times a second; a new page shows at once and its rows fill in as each
  figure lands (the page on screen is priced first, a page flipped past waits; workers start at once and stay warm, your slates' own worth is priced before a
  slate search opens; Ctrl+C to stop). A page seen before ranks in under a second, also in a later run on the same character (figures are kept on disk).
  A reader that dies (the game restarted) is started again. etor prices are cached in `packages/guide/.cache/etor-snapshot.json` and fetched again every 30 minutes.
- 8 workers (about 1.4 GB each; `--workers N`): 12 or 16 price no more figures a second. A figure takes about 2 s of one core.
- Slates: every listing is screened from its lines first: one figure per distinct line (one more slate line, shared by every listing carrying it, kept on disk) times what
  emptying your slate keeps (`screenSlate`). Only the page's best 3 screens per FE and best 2 outright get exact figures; a `~` row is screened, not priced (owner,
  2026-10-18: 8,942 slates read, 21 priced, the cheap ones sold unpriced). `--exact` prices every listing.
- Slates (exact figures): a listing is priced in place of your weakest slate and of any slate that shares one of its talents; `--exact` tries every slate you hold (one figure per slate). Each try also empties your slates whose talents the listing all carries (a 2-line Corner of Divinity holding two of your 1-line ones frees one place), each freed place valued at your weakest slate of its type, the line naming the slates freed.

## Slate searches

- A listing only replaces a slate the board's caps allow (`SLATE_CAP`, `replaceable`): a **Pedigree only ever replaces your Pedigree**, a fourth Corner of Divinity only one of your three.
- A Divinity Slate search is ranked by the model's damage gain of each listing **in place of one of your slates** (the best one named; `--same-shape` only lets it replace a slate of its own shape: your board is full,
  a slate only fits where one of its shape sits), on the plan's target (raw dummy DPS by default; `--target cube3`, or `traveler` = the dummy's capped at 15T). The row names which of your slates it replaces.
- With `--same-shape`, a listing whose shape matches none of your slates is listed as not ranked.
- A Sparks of Moth Fire listing (no lines; it copies the last line of the slate on the side it rolled, named on the row) is ranked where it sits on your board as it is:
  on a free cell or in place of a slate, wherever it copies a line (`copyPlaces`); its best 3 places get exact figures, shared by every listing of that side.
- The reader sees the listings the client holds for the search: run it again (or keep `--watch` running) for each page.
