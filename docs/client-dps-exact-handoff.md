# Client DPS model — making it exact, not fitted (handoff 2026-10-11)

## Status 2026-10-11 (third pass) — READ THIS FIRST

### Goal (user, verbatim intent)
**No fitted model.** The calculator is only worth anything if it is *exact* at 1B and at 40T DPS. It must be the
game's own algorithm (decompiled code) fed only by memory/config reads. Accuracy is shown by **identities**, never
tolerances: sheet ranges reproduced to float precision; every recorded hit inside its predicted
[min,max]·crit·mitigation with the observed extremes on the bounds; DPS = Σ hits. If something misses, a mechanic is
missing — find it in code, never adjust a constant. "Total matches" is not evidence (see below: it hid 4 wrong inputs).

### Where the model stands now
- **Model is 17–21% LOW on every measured hit** after removing every known-wrong input. That is the honest state.
  Strict identity tests are `test.fails` in `packages/dmg/test/bingClient.test.ts` (local top hits, local DPS,
  localcorona top ember). When the model becomes right they go red → drop `.fails`.
- Current build total (localcorona, 1 window 32.8 game-s, Bull's Rage uptime 0.743): measured **1.921T**; model
  (with Mighty Arrow, now removed) was 1.758T → now **1.407T** (−27% vs measured).
- 40T pro build: model 5.47e14 → **4.377e14** without Mighty Arrow, vs title "40万亿" (4.0e13). **No measurement exists**
  (account does not own the gear). Its source/conditions are unknown — ask the user. Factors where 40T is far outside
  anything measured: 5719 more product 108 (ours 16–19), crit factor 10.1 (ours 2.3–2.8), taken 8.0 (ours 3.4),
  HoA L33, 6 Deterioration ticks, moreTrig 6.8, chanceMore 1.26 (EV of chance lines).

### Changes this session (uncommitted)
- `packages/dmg/src/bingClient.ts`: armor layer `armorFactor(armorRatio(enemyArmor), 60, 80, armorPen)`;
  `sentryProximity: true`; one `ringTakenPct: 60` (Solar and Corona: debuff 35110 at ring level 4); `armorPen` input
  (live field 2006247 = 17 with the Vorax; default 0); **Mighty Arrow ×1.25 removed** (user ruling: bombs are
  detonated by Demolisher Charges and shotgun, they never travel into the target; also no such modifier exists on the
  live dummy or player); `pool: c` exported for checks.
- `packages/dmg/test/bingClient.test.ts`: describe "localcorona against per-hit records (exact-corona)" + strict
  `test.fails` identities. Legacy `bingKit.ts` still applies Mighty Arrow (not touched).
- `poorchlight/tli_dump/src/combat.rs`: `--hit-watch` CSV now has `row80, phys, lightning, cold, fire, erosion, tags`
  (+0x80, +0x50 TArray<f64>, +0xb8 TArray<i32>, read once per stable frame). Built in `target/release`.
- `dps-debug/tools/player_mods.py`: skips the world copy without an attr comp → works on the dummy (`player_mods.py 244`).

### Verified exactly from memory (keep)
- Hit identity: `final = round½(1.18·Σ+0x50)` on 915/915 hits; Σ hits = dummy total 1.00000 (capture `exact-corona`,
  `../scratch/watch/exact-corona-hits.csv`, measurements row label `exact-corona`).
- Dummy (entity 244): armor 27270 → ratio 0.49997 × erosion eff 60 (cap 80) → armor part 0.870017 with pen 17;
  res 30 − pen 10 → 0.80; attr 5720 untagged more [60 ring, 15 slate, 30 Formation Breaker] + **tag-gated Timid more
  40.5 (second tag set {5000003}, on every HoA hit)** → taken 3.36076. Nothing else on the dummy (`../scratch/dummy_all.json`).
- Player attrs for the ember hit's own tag list (`../scratch/pmods_corona.json`): 5402, 5002, 5107, 5727, 4802, 4803,
  6001, 6302, 5414 = model pool exactly; 5719 = model × Bull's Rage (it was down at dump time).
- Tags: **99006155 = HoA's "this skill" tag** (supports' 5000002 lines appear live under it); 99000013/15/17/21 = the
  four Precise auras' own skill tags (Increased Area +21% etc. — correctly not on HoA). 4000890 E_jifazhuangtai = Bull's
  Rage up (81% of hits). 4000800 E_shifa, 4000417 mana-at-max: nothing gated on them. 5001010 = crit.
- Bull's Rage: model ×1.3739, per-hit split ×1.375–1.380. Kaleidoscope: elemental turn hits only the fire half —
  bands ×1.1835 apart (model 1.18272). Roll width (band max/min) 1.117 = model 1.1183.

### The missing ×~1.21 — what to reverse-engineer next (in order)
The per-hit pre-mitigation value is `arr[erosion] / (0.870017·0.80·3.36076)`. Everything the model multiplies that is
**not** on the player's attr map is unverified and is where the ×1.21 must be:
1. **Base**: weapon × skill weapon % + global flats. Skill weapon % is in encrypted config_skill_damage
   (`FUN_141ddddd0` kind 2, `FUN_141dafa00`); `evidence/hit_composition.md` §1/§5 only pinned c = pct × local mult.
   Read config_skill_damage for HoA (sid 1110) at its level from memory (the table is decrypted in RAM).
2. **Main stat**: live 5719 per-X entry: field 2006248 × 0.5 → more (model: 1 + 0.005·Strength). Read field 2006248's
   value and its own per-X (CharField `+0xd0`, not decoded in `player_mods.fields()`), and field 2006249 (×1 → more).
3. **Node 624 "on consume" mores** (HoA +215% tag 5000003; Broken Sun +36% tag 6000130), **filter-107 proximity**
   (core 12001400 +40/−15 more, trait 810032 +40 more, slate 21050200 +60 inc ×2), **Passivation** (node 632, filter 107):
   none of these are in the player's attr map, so they are injected per hit. Decompile how those affix nodes add
   modifiers to the hit context (runtime vtable eval/execute slots, like Affix_2320 in `evidence/ring_effects.md`)
   and confirm each value and whether it applies to embers, pummels, both.
4. **Shotgun 0.30 and Upheaval 1.32** on embers (from A/B ratios, not code): find the falloff in code (HoA text
   "Shotgun Effect falloff coefficient 70%").
5. **Crit application site** (`141de0060`, `141ddd580`, `141de3500` unread) and crit multiplier per hit (crit/non-crit
   bands in the CSV give it directly: compare top crit band ÷ top non-crit band per hit type).
6. Composition order: port `FUN_141e14330` (packets, masks, conversion) literally instead of the model's halfA/halfB.
Exact instrument for 1–2 and 6: the **character sheet** (RoleAttrMgr dump in
`C:\Program Files (x86)\Steam\steamapps\common\Torchlight Infinite\UE_game\TorchLight\Saved\Logs\UE_game.log`, extract with
`python dps-debug/tools/sheet.py LOG OUT.tsv`). It is written when the sheet is opened; the last dump (19:12 UTC) is
the maul-swap state, not the current gear. `game.ps1 key B` did NOT open it this time (needs the game in front, or
click). Reproduce `Total Main-Hand Attack Damage` [min,max] from live attrs + decoded code to float precision.

### Rules learned
- Live dumps are momentary: Bull's Rage / Kaleidoscope turn state at dump time is baked in — diff them out by name.
- The hit tag list (+0xb8) is the matcher's context for this hit; records gated on tags absent there do not apply.
- Entity ids this session: player 9, dummy 244 (change per session; dummy id from `--combat-json` debuff keys `<buff>_<id>`).
- Game state left unchanged (no gear/skill changes; `../scratch/gear-swaps.json` is `[]`).

## Why the current method plateaued

The model (`packages/dmg/src/bingClient.ts` over `data/client/builds/*.json`) was checked by comparing **outputs**:
dummy DPS windows and per-hit ratios before/after a gear swap. That method cannot separate two wrong numbers whose
product is right, and it did not:

| what looked confirmed | what it really was |
|---|---|
| local baseline matched the dummy within a few % | **three wrong inputs cancelled**: no armor layer (real ×0.70: armor 27270 → 30% on erosion), Formation Breaker +30% switched off (real ×1.30, it applies), Solar Ring +40% (real +60%). 0.70 × 1.30 × 1.6/1.4 ≈ 1.04. Read from memory this session. |
| "dummy erosion resistance 30%" | correct (attr 5401 = 30, cap 60) — but the missing armor layer is what the Vorax's +17% armor pen exposed (decoded formula ×1.2429 vs ×1.21 measured; the 2.7% sits in the Kaleidoscope-turn assumption the same swap changed). |
| Corona vs Solar Ring identical per hit | both are the same hidden debuff 35110, level-mapped to 60%. |
| Bull's Rage ×1.285 | per-hit state levels imply ≈ ×1.36; only checked indirectly. |

Rule for whoever continues: **never accept a number because the total matches.** Every input to the formula must
be read from the game (memory or config) or derived from decompiled code, and the total must then match with
nothing adjusted. A per-hit ratio is a *check*, not a *source*.

## The exact pipeline the model must reproduce

Read from code and memory (`dps-debug/evidence/hit_breakdown.md`, `dummy_mitigation.md`). Every hit:

1. **Compose** (`141de25e0` → `141e0ed00` flat adds, `141e14330` conversion + inc/more per type), then each type
   rolls in [min, max] (`141dad500`, luck).
2. **Crit** `1 + (CritDmg·k − 100)/100 · (100 − victimCritReduction)/100` (`141e11050`; exact application site not
   pinned, but crit is inside the per-type values below).
3. **Mitigation per type** (`141e12200`): `max(0, armor · res · taken_type · taken_all [· taken_elemental])`
   - armor part: `1 − (min(ratio · eff_type, cap) − armorPen)/100`, `ratio = A/(0.9·A + 30000)` for monsters
     (players: level formula). `eff_type` is a per-target char field: physical 100, **erosion 60** (0x1e9ce6),
     cap 80 (0x1e9ce1). Dummy A = **27270** → ratio 0.5 → **30.0%** on erosion.
   - res part: `(100 − (min(res, min(resCap, globalCap)) − pen))/100`; dummy erosion res **30**, cap 60.
   - taken_all: dummy attr 5720 (cached **2.392 = 1.30 Formation Breaker × 1.15 proximity slate × 1.60 Corona**,
     plus tag-gated entries such as Timid's *hit* damage taken that the cache does not show).
4. **CalcFinalHurt** (`141de05d0`): `final = round_half(Σ_type value × (1 + E_dui_shengming_ewaishanghai/100))` —
   **×1.18** here (additional damage vs Life). Verified exact on 118 hits.
5. **Deterioration tick** k (k = 0..4 here) lands 10·(k+1) frames after the hit:
   `tick_k = E_post × 0.6 × (1 + detInc) × Π more_det × 1.18 × (1 + step·min(k, cap))`, with `E_post` the hit's
   **post-mitigation, post-crit, post-taken** erosion value. Measured `E_post × 2.765067622 × (1 + 0.3k)` (spread
   ≤2e-10) = model `0.6 × 2.11 × 1.08⁸ × 1.18` exactly.

**The per-hit record is the instrument.** `FHurtHit` (stride 0xd0, `--hit-watch` source) carries at **+0x50 five
f64 per-type values [phys, lightning, cold, fire, erosion]** after crit and mitigation; `--hit-watch` does not
export them yet. With the dummy's mitigation read exactly, each hit's *pre-mitigation* per-type damage follows
exactly and can be compared to the model's composition for that hit's state — no ratios, no fitting.

## Every value in the model that is assumed instead of read

From `DEFAULT_ASSUMPTIONS` and constants in `bingClient.ts`. Each needs a memory/config read to replace it.

| model value | current | source today | how to read it exactly |
|---|---|---|---|
| `enemyErosionRes` | 30 | comment says live dummy entity; combined with no armor term | **30 confirmed** (attr 5401; cap 5409 = 60) — `tools/dummy_mitigation.py <dummy id> <player id>` |
| (missing) dummy armor + armor efficiency vs erosion | — | not modelled | **armor 27270, erosion efficiency 60%, cap 80 → 30.0% on erosion**; player armor pen (0x1e9ce7) 17 with the Vorax. Model must add this layer. |
| `solarRingTakenPct` / `coronaTakenPct` | 40 / 60 | hand-set (Corona 60 matches tooltip; Solar 40 unverified) | **60 for both at this client**: hidden dummy debuff **35110** `posuirihuan_effect` (source = player, ring skill L4) → attr 5720 by level {1: 40, 2+: 60}. Solar's 40 exists only in the tooltip/L1. Dummy 5720 list live: **[15, 60, 30]** (proximity slate, ring, Formation Breaker). `tools/entbuffs.py`, `evidence/ring_effects.md` |
| `sentryProximity` (Formation Breaker +30% taken) | false | ruling from an old A/B | dummy buff list (is debuff 35086 / its effect on the dummy?) — **applies**: dummy attr 5720 includes ×1.30 — the model's `false` is wrong |
| `buffUptime["Bull's Rage"]`, Bull's Rage value | 0.774, ×1.285 | measured uptime from samples; value from records | read the buff's live effect from the player's modifier list while up vs down |
| Kaleidoscope turn weighting | 1/3 each turn, rings in lockstep, elemental turn → fire half only | reasoning | read the ring buff ids/remaining on the player per sample; per-hit state ids |
| fire/erosion half split `halfA/halfB` (0.5/0.5) | 0.5 | conversion reasoning (phys→fire 100% + Obliterate phys→erosion 100%) | per-element damage arrays of a hit (see per-hit section) |
| `explosionScale` | 0.30 | measured ratio (shotgun falloff) | config of the falloff; per-hit index data |
| `enemyLifePct` (Passivation) | 100 | dummy is invincible | dummy life % from its entity |
| `elitePresent`, `agilityStacks`, `standingStill`, `lowLife`, `twoHanded` | true, 4, … | states assumed | player state tags / buff stacks from memory each sample |
| `sentryHitIntervalS` | 158.6/30 s | fitted cadence | Flame Core cast/hit events in the hit stream (skill 1582 rows) — direct count |
| Deterioration 60%, 0.33 s, ramp | from char_buff 180 + labels | config | confirmed per tick count / ramp this session |
| `prismExtPerPoint` | true | fit to sheet crit damage 324 | prism ExtAffix scaling from code |
| Mighty Arrow ×1.25 | hard-coded | kismet text | player modifier list |

## What memory gives today (this session's reads)

All read-only, tools in `dps-debug/tools/`, write-ups in `dps-debug/evidence/`. Entity ids change per session
(this session: player **9**, dummy **244**; `--combat-json` target.entityId reads 0 when the boss bar is down — take
the id from the target debuff keys `<buff>_<entity>`).

| tool | reads | verified against |
|---|---|---|
| `dummy_mitigation.py <dummy> <player>` | dummy armor / res / caps / armor efficiency per type / taken; player pens | sheet "Armor Non-Physical Damage Mitigation" 17.403641522819 reproduced exactly; player pen 10, armor pen 17 |
| `player_mods.py [entity] [attr ids…]` | player attribute blocks: per tag-combination records (base, spread, inc sum, more list), "per X" entries (source attr, step, coef, cap), runtime-counter entries (e.g. Fervor = counter 45) | sheet crit damage 383, crit chance 63.55%, attack speed 1.967868, erosion 247, phys 176, fire 48, additional erosion 263.34, Strength 445.16 — all exact |
| `../poorchlight tli_dump --hit-watch` (+0x50 not yet exported) | one record per hit; +0x50 = 5 post-mitigation per-type f64 | Σ hits = dummy total to 1e-10; final = round½(1.18 · Σ+0x50) on 118/118 hits |
| `tli_dump --combat-json` | player buffs, dummy debuffs with remaining/total seconds, dummy totals | dated against the per-frame capture (`combat.mjs` writes `<label>-samples.jsonl`) |

Live storage facts (`evidence/player_modifiers.md`): attribute component type 0x0c (`+0x38` map attr → block);
char fields type 0x25 (`+0x48` untagged, `+0x58` tagged). A block holds the cached untagged {min,max} at +0/+8, the
untagged record at +0x18, **tag-gated records** (0x98 B) at +0x20 — conditions are only tag requirements
(require-all on set A; sets B/C unread, likely any-of/none-of) — "per X" entries at +0x40, counters at +0x48. There
are **no per-source ids**: the game stores pre-summed values per tag combination, so the model is checked per
attribute per tag set, not per line. Unknown tags 99000013–99000021 / 99006155 are runtime states (standing still,
charge consumed, low life …) — map each by toggling the state and diffing the block (read-only).

## Procedure to reach exact

Order matters: inputs first, then composition, then totals. Each step has an exact pass criterion.

1. **Export the hit record.** Add +0x50 (5 per-type f64), +0xb8 (context tag list) and +0x80 to `--hit-watch`'s CSV
   (poorchlight `tli_dump/src`, layout in `dps-debug/evidence/hit_breakdown.md`). Pass: Σ hits = dummy total (as now)
   and `final = round½(1.18·Σ+0x50)` on every hit.
2. **Put the enemy side in the model from memory, not assumptions.** Replace `enemyErosionRes`, `sentryProximity`,
   `solarRingTakenPct`, `coronaTakenPct`, `arrows` with a snapshot from `dummy_mitigation.py` (armor 27270, erosion eff
   60, cap 80, res 30 / cap 60, attr 5720 incl. its **tag-gated** entries — resolve those next, Timid is one) and add
   the armor layer `1 − (min(ratio·eff, cap) − armorPen)/100`. Pass: for every hit, `+0x50[erosion] / (armor·res·taken)`
   equals the model's pre-mitigation erosion for that hit to float precision.
3. **Put the attacker side in the model from memory.** For each attribute the model uses (5719, 5402, 5002, 5107,
   5727, 4802, 4803, 6001, 6302, 3402, 5414, 1, field 2006400 …) compare the model's pooled inc/more for HoA's tag set
   with `player_mods.py` for the same tags. Pass: identical numbers. Any difference is a record-interpretation bug in
   `build_model.py` / `run_model.py` — fix it there, never with an assumption.
4. **States from memory, not flags.** Read the player's buff list and the tagged records' requirement tags each
   sample; map tags 99000013–99000021 / 99006155 to conditions by toggling (stand vs move, life threshold). Replace
   `standingStill`, `lowLife`, `elitePresent`, `agilityStacks`, Bull's Rage / Kaleidoscope turn weighting with the
   per-hit state recovered from the sample timeline. Pass: each hit's predicted value equals its record, not an average.
5. **Counts from the hit stream.** Throws, bombs per throw, embers per bomb, Flame Core cadence and Paralysis procs are
   counted from hit rows (skill 1110 flags 16/40, skill 1582) — never fitted constants (`sentryHitIntervalS`,
   `explosionScale` become reads or code-derived).
6. **Only then totals.** DPS = Σ over hits in a window; it must equal the dummy total exactly because it is the same
   sum. The model's *expected* DPS is then a deterministic function of measured rates and per-hit values.

Pitfall to avoid: a single A/B ratio solves one equation. Two wrong inputs can satisfy it (this session: 30% res
without armor ≈ res + armor; Solar Ring 40% × no Formation Breaker × no armor ≈ 1.04). Fix inputs by reading them.

## Corrections to make in `bingClient.ts` now (all read, none fitted)

| change | value | evidence |
|---|---|---|
| add armor layer for erosion hits | `1 − (min(0.5·60, 80) − armorPen)/100` → 0.70 (pen 0), 0.87 (pen 17) | `dummy_mitigation.md` |
| `sentryProximity` | true at the dummy (Formation Breaker / Vorax `pozhen` 35086 on the dummy, +30 in attr 5720) | `ring_effects.md`, `dummy_mitigation.md` |
| `solarRingTakenPct` | 60 | `ring_effects.md` (35110 level table) |
| armor pen input | char field 0x1e9ce7 (Vorax 17) — currently not a model input (Vorax line dropped by `build_model`, id unknown) | `dummy_mitigation.md` |
| Deterioration | formula confirmed exact incl. ×1.18 on ticks — no change | `hit_breakdown.md` |

Expected effect on the local baseline: ×0.70 × 1.30 × (1.6/1.4) = ×1.04 — the model will move *up* ~4% vs today and
must then be re-checked against hit records (step 2), not against the dummy average.
For 40T: Corona (+60, unchanged), no armor pen (×0.70 newly applied), Formation Breaker on its Vorax (`nodebuff:35086` from
`vorax#0`, ×1.30 newly applied): net ≈ ×0.91 on the current 6.01e14, before the remaining checks.

## Open items, in order

1. Export hit-record +0x50 / +0xb8 in `--hit-watch` (step 1) — everything below is checked through it.
2. Resolve the dummy's **tag-gated** attr 5720 entries (Timid is "hit damage taken"; Mighty Arrow ×1.25 is hard-coded).
3. Map runtime state tags 99000013–99000021 / 99006155 → conditions; then drop the boolean state flags.
4. Pin where crit is applied (`141de0060`, `141ddd580`, `141de3500` unread) and the Kaleidoscope turn mechanics from
   the player's buff list (`--combat-json` hides unnamed buffs — use `tools/entbuffs.py`).
5. A static root for the fight world (tools heap-scan for vtables today; entity ids change every session).
