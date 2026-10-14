# Talent rules used by the guide

Catalog = `dps-debug/.worktrees/guide-pin/catalog/0x6aa39847/config_talent.r2.json` (2542 rows). Confidence: confirmed / inferred / UNSOURCED.

| Rule | Value | Source | Status |
|---|---|---|---|
| Trees | 30 hero trees = 8-digit ids with leading pair 10..64; 6-digit rows are legacy, 80/90/92 are not hero trees | c30_tables.md (Panel, 1436 8-digit rows) + catalog | confirmed |
| Node fields | `i4` kind (1 micro, 3 medium, 2 core), `ic` max points, `i10` threshold, `a30` prerequisites, `a40` (column, row) | re/evidence/c30_tables.md:17-20 | confirmed (live read) |
| Prerequisite | every prerequisite node at max points | c30_tables.md "Prerequisite rule"; Net_Back_Code_810 | inferred |
| Row threshold | node needs `i10` points spent in EARLIER rows of its tree (conservative reading; c30 says "points in the panel", which is looser) | c30_tables.md; all 10 loadouts in game/ without Inverse Image copies satisfy it (test) | inferred. Loadouts with copies (129 of 140) violate it from `talents` alone: a copy stands in for an original (prisms.md (c)), so they are not checked |
| Core talents | ids `{tree}00{set}{n}00`; set 1 / set 2; unlock when the tree holds `i10` points (12/24 set 1, 24/32 set 2, per tree); one per (tree, set) | c30_tables.md (core i10); owner loadouts (tree 21 holds exactly 24 with core at 24; tree 20 holds 20001200 + 20002300) | unlock: inferred; "one per set": inferred from loadouts |
| Points per level | level >= 93: 108; below: round(107*(L-1)/99) | 108 = owner's hand-set state at player level 93 (LADDER.md L13e, loadouts); 107*(L-1)/99 = tli-lens `bingGuide.ts talentPoints` | **UNSOURCED** curve. Game text (handbook 30010) only says points come from leveling and Hunter's Forge. 108 at 93 exceeds the prior (99), so the prior is wrong or forge points count. Replace when a source exists |
| Tree slots | 4 slots; every tree allowed in every slot | every game/ loadout holds 4 trees (10/11/13/14, 12/50/51/54, 20/21/34/43, 20/21/24/34, 33/50/52/54); slot = skillTree `Index` (prisms.md:69) | count: confirmed from loadouts; "no restriction": **UNSOURCED** (none found), listed in notSearched |
| Inverse Image | mirror (x,y)->(6-x,8-y), copy `-id` at `Point x (100+P2)%`, tag `talent:-<id>@<100+EE>%` | prisms.md (c); loadout.ts:237-262 | confirmed (read) |
| Placing an Inverse Image | no dps-debug what-if change places one (`talent` points 0 keeps an existing enhancement; `slate place item` is a Divinity slate; `prism` edits ExtAffix only) | model/src/core/whatif.ts Change union | none generated; notSearched |

Moves (all free): point +1 / -1, shift one point (when the budget is full), core add / core swap inside a (tree, set), tree swap (drop tree T with its cores, fill tree U in node order with T's points; the search re-solves points). Core and tree-swap moves are `enabler`: their value may only show after a re-solve.
