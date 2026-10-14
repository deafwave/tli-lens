# Prism rules the guide uses

Prism resolution happens on the game server; the client only receives the result. Task 7b generates a prism move only where the rules below determine the result and dps-debug's `{ kind: 'prism', action: 'add', node, modifierId, dyn }` change can express it. Paths are under the pin (`dps-debug/.worktrees/guide-pin`).

## Rules used

| Rule | Source |
|---|---|
| Server affix 10007 (binding `_mt43_10007_<type>_<modifier>`, first binding string only) puts `<modifier>` as an ExtAffix on every node of talent type `<type>` inside the prism area. Only type 11 (Medium Talent, `config_talent` +0x18 == 48) is used. | `re/evidence/prisms.md` (a), "Extra grants"; `catalog/0x6aa39847/config_modifier.json`; checked against `captures/A52.state-20261013-043602/pre/prisms.json` (Haze, tree 54, cell 54060200) and `captures/L104-20261013-205651/pre/prisms.json` (same item, tree 51, cell 51050200). |
| ExtAffix DynArgs = the modifier's fixed roll (min == max in `config_modifier_rolls.json`): 1204400071 gives `[6,6]`, as captured. A rolled modifier is not generated. | `catalog/0x6aa39847/config_modifier_rolls.json`, same captures. |
| Server affix 10008 (`_mt43_10008_<n>`) replaces the area by influence shape `<n>`. Shapes 1-5 and 8 are used. Shape 3 here is read as offsets (dx = column) -1..1, (dy = row) -1..2; tree 51 at (2,5) excludes the medium node at (4,5), which the other axis order would include, and tree 54 at (2,6) excludes the medium node at (1,4), which a flipped row axis would include. | `prisms.md` (b); `config_modifier.json` suffix; the two captures. |
| 10009 and 10025 need no grant. | `prisms.md`, "Extra grants". |
| Node column/row and type come from `config_talent` (`a40`, `i18`, `i4`). | `prisms.md` (a). |

## Not searched, and why

- **Buying a prism**: rolled values and the base shape of an unowned prism are not known before purchase.
- **Moving a placed prism**: what happens to the vacated and the target cell's Points is not documented.
- **10004** (the Haze's base affix 1204200101): grants a prism-wide `prisms.provide[tree].ExtraAffix`. The what-if has no change for it, so the real Haze is skipped.
- **10005** (+Points to nodes in the area): cap and stacking not documented.
- **10007 on types 2 and 4**: `prisms.md` (a) says the type-to-node mapping is unconfirmed.
- **Influence shapes 6 and 7**, a prism without 10008 (the item's base `InfluenceId` is not in the export), two 10008 affixes, and any other server affix (10003, 10006, 10010).
- **Inverse Image (10026) mirror copies**: no what-if change adds a `-<id>` mapping entry.
- **Cell legality**: no source says which nodes accept a prism. Cells offered are the kinds the owner has placed prisms on (micro, legendary medium; never a core) with no allocated Point, in trees that hold no prism. This is an assumption, listed in `notSearched`.

## Tests

`test/prisms.test.ts` recomputes the ExtAffix set for both captured Haze placements from the rules and compares it to the capture's `TalentDataList`. The Haze without its 10004 base affix is a synthetic variant (the real one is skipped).
