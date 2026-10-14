# Talent rules used by the guide

Catalog = `dps-debug/.worktrees/guide-pin/catalog/0x6aa39847/config_talent.r2.json` (2542 rows). Confidence: confirmed / inferred / UNSOURCED.

| Rule | Value | Source | Status |
|---|---|---|---|
| Trees | 30 hero trees = 8-digit ids with leading pair 10..64; 6-digit rows are legacy, 80/90/92 are not hero trees | c30_tables.md (Panel, 1436 8-digit rows) + catalog | confirmed |
| Node fields | `i4` kind (1 micro, 3 medium, 2 core), `ic` max points, `i10` threshold, `a30` prerequisites, `a40` (column, row) | re/evidence/c30_tables.md:17-20 | confirmed (live read) |
| Prerequisite | every prerequisite node at max points | c30_tables.md "Prerequisite rule"; Net_Back_Code_810 | inferred |
| Row threshold | node needs `i10` points spent in EARLIER rows of its tree (conservative reading; c30 says "points in the panel", which is looser) | c30_tables.md; all 10 loadouts in game/ without Inverse Image copies satisfy it (test) | inferred. Loadouts with copies (129 of 140) violate it from `talents` alone: a copy stands in for an original (prisms.md (c)), so they are not checked |
| Core talents | ids `{tree}00{set}{n}00`; set 1 / set 2; unlock when the tree holds `i10` points (12/24 set 1, 24/32 set 2, per tree); one per (tree, set) | c30_tables.md (core i10); owner loadouts (tree 21 holds exactly 24 with core at 24; tree 20 holds 20001200 + 20002300) | unlock: inferred; "one per set": inferred from loadouts |
| Points per level | exact at observed levels: 93 -> 108 (capture L100.state-20261013-165251), 96 -> 108 (OTHERCHAR-L105.state-20261013-210519, the owner's other character); between observed levels the lower bounding value; outside 93-96 the nearest observed value (108), **an assumption** (L60 start gets 108) and `notSearched` says so | captures `pre/player.json` cfg.level + `pre/talents.json` sum of Point; no level -> points table in the catalog or re/lua/20261013-210557 (strings hold type names only) | observed values are points SPENT (a lower bound of the budget); other levels are assumptions |
| Tree slots | 4 slots (0..3). Only trees observed in a slot are offered there: slot 2 = tree 51, slot 3 = tree 12; slots 0, 1 have no observed tree. No loadout or capture records the slot of the other trees, so tree swaps are generated only between trees observed in the same slot; every other tree/slot pair goes to `notSearched` | re/evidence/prisms.md:69 (skillTree `Index`) | confirmed for the 2 pairs; the rest not observed, so not offered. Currently no real tree swap is generated until slots are read from the client |
| Inverse Image | mirror (x,y)->(6-x,8-y), copy `-id` at `Point x (100+P2)%`, tag `talent:-<id>@<100+EE>%` | prisms.md (c); loadout.ts:237-262 | confirmed (read) |
| Placing an Inverse Image | no dps-debug what-if change places one (`talent` points 0 keeps an existing enhancement; `slate place item` is a Divinity slate; `prism` edits ExtAffix only) | model/src/core/whatif.ts Change union | none generated; notSearched |

Moves (all free): point +1 / -1, shift one point (when the budget is full), core add / core swap inside a (tree, set), tree swap (drop tree T with its cores, fill tree U in node order with T's points; the search re-solves points). Core and tree-swap moves are `enabler`: their value may only show after a re-solve.
