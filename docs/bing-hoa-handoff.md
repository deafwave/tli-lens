# Bing · Hammer of Ash calculator — design handoff

Written 2026-10-09 for the owner's next step: **finish the Bing (Escapist, Blast Nova) Hammer of
Ash DPS math**. State as of `torchlight/main` @ `ef89432`. Line refs are to that commit.

This document consolidates what exists, what is calibrated, what is still open, and the exact
measurement or code change that closes each open item. The authoritative mechanics rows remain in
`docs/mechanics.md` (anchors cited below), and the working method is the `bing-dps-model` skill
(`.claude/skills/bing-dps-model/SKILL.md`). Read that skill first; this handoff does not repeat its
protocol beyond the summary in §9.

---

## 0. Where things stand

| | SS13 | SS14 (default) |
|---|---|---|
| Real build (`real_buld_3`) model DPS | **596.21B** (det share 88.8%) | **525.91B** (×0.8821) |
| Measured in-game (SS13, 2026-07-20) | 557.75B span mean | — (season not live until Oct 15/16) |
| Model vs measured | **+6.9% hot** | — |

- The model is calibrated term by term against in-game A/B ratios. Most single levers reproduce to
  within ~1–2% (§4). There are two remaining structural errors with **opposite signs**: RS-on hits
  are over by about ×1.38, and the Deterioration pipeline is under by about ×1.33. A single factor
  F ≈ 1.35 that applies **to ticks only** would fix both (§5.1). This is the main unfinished piece
  of the math.
- SS13 and SS14 can both be computed. The page switches with `?season=ss13`. Every value that
  differs between seasons lives in `packages/dmg/src/seasons.ts` (§6).
- The page calculator works but has known UX and correctness gaps (§7).

### Priorities and plan of attack

The goal is to **min-max the Bing build: correct math, then progression** (what to upgrade next,
ranked by DPS per step). Rehan is maintained but is not the priority. Moto is out of scope.

| Phase | Work | Sections |
|---|---|---|
| **A. Finish the math** (SS13, live now) | Verify the snapshot against the live build (tli_dump, Hunter File open). Then close F ≈ 1.35, and re-read Kaleidoscope, projectile count 6 vs 7, and the Steamroll AS share | §3, §5.1, §5.4, §8 |
| **B. Progression tooling** | Bing sensitivity table, then Bing upgrade pricing (SS14 supports, slates, memories, gear bases), then the Bing page tabs | §10 |
| **C. SS14 at launch** (Oct 15/16) | To-Life vs Deterioration A/B, Steamroll AS, Nether King slate lines, purple-base proj, re-baseline | §5.2, §6.2 |
| **D. Calculator UX** | Single source of truth for supports, editable typed buckets, tick-margin readout | §7 |

---

## 1. Run it

```bash
pnpm test                                    # 571 tests; Bing spec: packages/dmg/test/bing1/blast-nova.test.ts
pnpm --filter @rehan/dmg exec vitest run test/bing1/blast-nova.test.ts test/seasons.test.ts test/supports.test.ts
pnpm --filter @rehan/dmg typecheck
pnpm dev                                     # /bing (SS14) and /bing?season=ss13
```

To compute the model for the snapshot, or for any hypothetical (edit `s` before `cycleDps`):

```bash
cd packages/dmg && npx tsx -e "
import { readFileSync } from 'node:fs';
import { cycleDps } from './src/damageModel.ts';
import { applySeason } from './src/seasons.ts';
const s = applySeason(JSON.parse(readFileSync('../../data/bing1/real_buld_3_snapshot.json','utf8')), 'ss13');
const r = cycleDps(s); console.log((r.dps/1e9).toFixed(2)+'B', 'det', (r.deterioration_dps/r.dps*100).toFixed(1)+'%');"
```

`pnpm rank data/bing1/real_buld_3_snapshot.json [--season ss13]` seasons the snapshot first
(525.91B under SS14 / 596.21B under SS13). Its perturbation list is still Rehan's, though: several
rows print `NaN` or a meaningless 0% for Bing. See §10.1.

`packages/page/src/data/bing-snapshot.json` and `data/bing1/real_buld_3_snapshot.json` are
**byte-identical copies**, and both must be edited together. Merging them into one file is a
backlog item (§7).

---

## 2. How the math flows

`cycleDps` (`damageModel.ts:559`) takes the **bomb branch** iff `rotation.bombs_per_throw` is set.
Never edit the else (Spectral Slash) branch for Bing work.

**Hit DPS** (`bombRotation`, `damageModel.ts:481-508`):

```
throwRate = throw_rate_base × (1 + attack_speed_inc_pct/100)                 linear (confirmed)
n         = demolisher_resto_pct set ? ceil(3/(1+resto/100) × throwRate) : demolisher_every_n
hitDps    = throwRate × bombs_per_throw × expectedHit × hits_per_bomb
            × (proj_base+proj_added)/proj_base × (n−1+M)/n                   M = demolisher_empower_mult
cycleTime = 1/throwRate,  uses = 1                                           Obliterate gates per THROW
```

**expectedHit** (`damageModel.ts:344`). With `s.conversion` present:

```
Σ portions  amount × pathEnvelope(typeHistory) × mitigation(finalType) × crit(typeHistory)
```

- `basePortions` (`:251`): weapon × skill% plus flats × `added_damage_effectiveness_pct`.
- `convert` (`:268`): claims are processed phys→lightning→cold→fire→erosion. If claims on a type
  exceed 100% they are scaled down proportionally. HoA phys→fire 100 plus Obliterate phys→erosion
  100 therefore splits the weapon phys **50/50** into {phys→fire→erosion} and {phys→erosion}.
  This is confirmed (mechanics.md#support-additional-sum, +81% Physical killer test).
- `pathEnvelope` (`:310`):
  - The **increased** sum (typed keys only if their type is in the history; tag keys only if the
    tag is in `s.tags`).
  - × every `additional` bucket.
  - × every `additional_typed[tag]` whose tag is in the history.
  - × `enemy_taken`.
- Erosion portions mitigate by `1 − (erosion_res − erosion_pen)` (`:194`). Every portion of the
  real build ends as erosion, so **the fire res/pen inputs do nothing on this build** (§7).

**Deterioration DoT** (`damageModel.ts:568-597`):

```
detDps = hitDps × enhancedShare × min(chance,100)/100 × hit_damage_pct/100 × tickSum
         × ratio × (1 + additional_damage_pct/100)
enhancedShare = min(1, cycleTime / obliterate_interval_s / uses)
ticks   = ceil(duration/tick_interval − 1e-9) − 1      (strictly before expiry), duration = 1s × (1+inc/100)
tickSum = Σ_{i<ticks} 1 + ramp_pct/100 × min(i, ramp_max_ticks)
ratio   = (incSum − increased.hit/100 + damage_inc_pct/100) / incSum
```

Code facts that matter for §5.1:
- The DoT is derived from `hitDps`. It therefore inherits **every** hit multiplier: all
  `additional`, every typed bucket the hit got, `enemy_taken` once (confirmed: taken applies once,
  no re-take), and crit once (confirmed: ticks do not crit).
- `incSum` (`:579-580`) sums `increased` via `increasedApplies`. It **excludes `erosion`**
  (247 on this build) and is **not history-gated**. The hit envelope, by contrast, includes
  `increased.erosion` for erosion-history portions (`:247`). The ratio's denominator therefore
  differs from the hit's actual increased sum. This is small today (about 1%), but it is the kind
  of mismatch to re-derive when you fix §5.1.

---

## 3. The real-build snapshot

`data/bing1/real_buld_3_snapshot.json` is hand-encoded from the export `real_buld_3.json` and the
in-game character sheet. The per-line citations are in mechanics.md#real-build (row
`<a name="real-build">`). Key classes:

| Class | Keys | Notes |
|---|---|---|
| **Sheet reads** (trust the sheet, don't hand-sum) | `crit.chance_pct` 65.05 (rating × (1+Σ%)/100), `crit.damage_pct` 362, `additional.strength` 169.5 (Str 339), `rotation.attack_speed_inc_pct` 37.9 (sheet AS 1.97/1.5 incl. Aggression) | Whether the sheet AS includes Steamroll's −15% is **unverified** (§6.2) |
| **Season-driven** (`_gem_levels` → `applySeason`) | passivation 24, slow_projectile 25, fusion 22, steamroll 25 | Values are recomputed per season from `seasons.ts` anchors. Never edit the baked numbers by hand |
| **Calibration fold-ins** | `rotation.hits_per_bomb` 1.6529 (= 0.8353 × H 1.98, RS-off anchored), `demolisher_empower_mult` 3.65 (±0.15), `additional.upheaval_explosion` 17.8 (measured ×1.178) | H folds geometry: FC +50% proj size, 263% skill area, arrow pair, SP saturation |
| **Structural** | `conversion` (phys→fire, phys/fire/cold→erosion), `deterioration.*` (chance 98, base 60%, dur +63%, tick 0.325, ramp 40%/6, inc 16, addl 48, Obliterate 0.5s), `demolisher_every_n` 1 (charge engine) | Tick count is **5**, sitting just above the 62.5% boundary (§5.3) |
| **Per-line at face** | the rest of `increased` / `additional` / `additional_typed` / `enemy_taken` | Talent nodes are **per point** (multiply by allocated points) |

Export facts the snapshot does **not** carry (from `real_buld_3_resolved.json`):
- The HoA supports in the export are **Elemental Fusion, Passivation, Upheaval (mag), Steamroll,
  Melee Knockback**. The snapshot models **Slow Projectile instead of Melee Knockback** (the
  "SP⇄MK swap" A/B, ÷1.005). Confirm which one is actually socketed.
- Memory slot 75 carries a lunar affix, **"40% of the bonus to Erosion Damage also applied to
  Deterioration Damage, up to +80%"**. It is unencoded, and it is a §5.1 suspect.

---

## 4. Calibration ledger (SS13, frozen-aura protocol)

Confirmed levers on the full rig (measured ÷ vs model ÷):

| Lever | Measured | Model | Status |
|---|---|---|---|
| Saintess (env + pen 10 + Repentance 1.04⁶) | ÷1.574 | ÷1.5765 | exact |
| Timid (taken applies once) | ÷1.365 | ÷1.390 | −1.8%, accepted |
| Kaleidoscope 60-ring (full value, continuous) | ÷1.735 | ÷1.60 | **+8% hot**, flagged |
| Upheaval explosion line | ÷1.414 | ×1.178 fold-in | measured → encoded |
| Pedigree + Mixture (det lever) | ÷2.294 | ÷1.838 | exposed the per-throw Obliterate fix; leftover feeds §5.1 |
| One-det-slate (−8% det-add, −5% det-dur) | ÷1.250 | between ÷1.05 (no cross) and ÷1.41 (5th tick) | ⇒ tick count is duration-sensitive |
| RS-off (hit-only anchor for H) | 13.17B | 13.17B | exact (defines H) |
| Frame count: stack life | 97±1 frames @60fps = 1.63s | duration lines **sum** | compound (1.79) refuted |

Bare-rig primitives (`blast-nova.test.ts`): Multiple Projectiles ×1.592 vs ×1.604; Quick Return
ladder; demolisher n-ladder (0%⇒3, 97%⇒2, 200%⇒1); increased-pool sum (×1.9538 vs ×1.9574);
conversion overflow (+81% Physical ×1.8106 vs ×1.81); Passivation full ×1.5998.

---

## 5. Open problems, ranked

Each item lists what we know, what would settle it, and the code change once it is settled.
Work them in this order: 5.1 is worth the most DPS, and 5.2 is the largest SS14 risk.

### 5.1 The ticks-only factor F ≈ 1.35 (the remaining SS13 residual)

- **Known.** A joint solve of the two det levers gives det/hit = 10.59 (det share ≈ 91%). The model
  det pipeline is under by ×1.88 before the 5-tick fix, and by about ×1.33 after it. Meanwhile
  RS-on hits are over by about ×1.38. Because H is anchored with RS off, the erosion-typing gain on
  hits was never measured independently. Both errors are cancelled by one factor that touches
  **ticks only**.
- **Suspects**, each with the model's own size estimate:
  1. **Forbidden Power ×1.35 exact.** It is in `additional_typed.erosion.forbidden_power` 35.
     Hypothesis: it applies to the DoT and not to hits, or the reverse. `additional.forbidden_power_ero`
     is 0 and may be the half that was meant for ticks.
  2. **Erosion Amplification ×1.42** (`erosion_amp` 42.1). Same question: hit vs tick scope.
  3. **Tick base 80% instead of 60%** on this Ruinous Star roll. That gives ×1.333 on ticks only.
  4. **The unencoded lunar affix** (§3). It contributes at most ×1.058 total (as +80% det-increased,
     ×1.0146 at +20%), so it is partial at best. Encode it regardless.
- **Settle it.** Read **tick₁ and its feeding hit** from a 60fps capture of one empowered throw.
  tick₁/hit directly measures base% × det-only multipliers. One frame pair separates suspect 3
  (base%) from 1 and 2 (multiplier scope).
  - If it is 1 or 2, take an A/B with that line removed and compare hit and tick deltas separately.
- **Code.**
  - Move the confirmed multiplier into its correct scope. For a ticks-only multiplier, add a
    `deterioration.*` field (e.g. `additional_typed_dot`) applied in the `detDps` product.
  - Then re-fit `hits_per_bomb` (H) only if the hit side moves.
  - Add the mechanics.md row first, then a failing test in the real-build describe, then code.

### 5.2 SS14: does "damage applied to Life" still reach Deterioration?

- **Patch text** (SS14 notes, Base section): *"Most True Damage in the game is no longer affected
  by bonuses that increase damage dealt to Life"*. The listed examples are Rotted Taboo, Agony of
  Lost Self, Thornfield, and on-defeat explosions. Deterioration (True Damage) is **not named**, but
  "most" is broad.
- **Exposure.** `additional.dirt_to_life` 10 and `additional.deception_to_life` 8 currently multiply
  the whole hit and therefore the DoT. If the rule covers Deterioration: **SS14 525.91B → 452.00B
  (−14.05%)**.
- **Settle it (after launch).** Same-session A/B on the dummy, with and without one to-Life source,
  compared on span means. The DoT is 88.8% of DPS, so the two hypotheses predict clearly different
  ratios: the full ×1.10 versus about ×1.011 (hit-only).
- **Code.** Introduce a `to_life` bucket that `pathEnvelope` applies to hits but the DoT divides out,
  gated per season in `seasons.ts` (`ss13: true, ss14: <measured>`).

### 5.3 The 5th-tick boundary is knife-edge

The snapshot sits at duration +63%. The 5th tick needs >+62.5% (1.625s at 0.325s strict). At
+62% the model drops to **443.25B (×0.7434)**. Any SS14 change to a Deterioration-duration source,
or the swap of a slate or memory, can flip it. Treat it as a hard constraint when evaluating SS14
gear.

**Code idea.** Surface it in the calculator: show tick count and the duration margin next to the
Deterioration line in the breakdown.

### 5.4 Smaller open items

| Item | Known | Settle it |
|---|---|---|
| Projectile quantity 6 vs 7 | The sheet says 6. Encoded 6/5. Iron Lion +2 should make 7 | Sheet read with Iron Lion on/off |
| Kaleidoscope +8% hot | ÷1.735 measured vs ÷1.60 | Re-read on a same-session baseline |
| Firepower Coverage ×0.89 residual | Memory-ladder FC read ×0.891 vs ≥1 predicted | Re-measure before reusing (mechanics row on hero traits) |
| Frenzy Hound values / trait card text | PENDING | Read the trait card text in game (tlidb now shows FH +35/40/45/50/55% additional near bombs) |
| H curve (skill area, proj speed) | Measured points only; "sweep pending" (mechanics.md#bing-skill-area) | Area/speed sweep on the bare rig. Needed before an "increased area" upgrade can be priced |
| Steamroll AS in sheet AS | See §6.2 | One sheet read with Steamroll unsocketed |

---

## 6. SS14

### 6.1 Done (`seasons.ts`, tested in `seasons.test.ts` and `supports.test.ts`)

| Gem | SS13 → SS14 (Lv1/21/41) | Real build |
|---|---|---|
| Passivation | 41/61/81 → 31/51/61 | L24: 64 → 52.5 |
| Slow Projectile | 19.5/29.5/39.5 → 18.5/28.5/33.5 (speed −30% → −20%) | L25: 31.5 → 29.5 |
| Elemental Fusion | 25.5/35.5/45.5 → 22.5/32.5/36.5 | L22: 36 → 32.7 |
| Steamroll | 31/41/51 → 28.5/38.5/44.5 (AS −15% → −20%) | L25: 43 → 39.7 |

Net: ×0.8821. Hammer of Ash, Blast Nova, Bing's traits, Multiple Projectiles, Quick Return,
Added X Damage, Timid and Upheaval are **unchanged** (tlidb SS13 vs SS14 blocks diffed). Steamroll
was not in the patch notes; tlidb is the source.

### 6.2 Not done / risks

- **Steamroll −20% AS.** It is not applied to the sheet-read `attack_speed_inc_pct`, because whether
  the sheet already includes Steamroll's −15% is unverified. If it does, SS14 is a further
  **−3.6%** (506.84B). Settle it with one sheet read without Steamroll, then add a season delta
  in `applySeason`.
- **§5.2 True Damage vs to-Life** (up to −14%).
- **Purple-tier weapon base "+projectile quantity" removed.** Check whether the Sierra maul's base
  carries it. If so, `proj_added` drops in SS14.
- **Nether King's Divinity.** The build carries a Judgment slate
  (`poorchlight/tli_dump/ui/fixtures/live-nether-king-judgment-slate.json`,
  `rehan-bing-seven-slate-divinity.json`). SS14 changes:
  - Base tiers shift up (Legendary→Ultimate, Medium→Legendary, Small→Medium, with new Small).
  - Ultimate craft "on-line non-legendary slates +20% → +10% effect".
  - "Corner of Divinity / Fallen Starlight on the line +25% → +10%".
  - Judgment gains "slates on the line +5% effect".
  - "Exile: Demolisher +20% → +10% vs Paralyzed" is a **no-op** here (paralysis chance 0).

  Re-derive whichever slate lines depend on these.
- **Legendaries, talents and pactspirits on this build.** None appear in the SS14 change lists
  (gear: Sierra, Ruinous Star, Death's Touch, Fool's Crown, Blade-dancer, Formation Breaker,
  Kaleidoscope×2, Broken Sun; trees: Goddess of Deception, Lich, Onslaughter, Shadowmaster;
  pacts: Iron Lion, Saintess, Kitty).

### 6.3 New SS14 options worth pricing (from the patch notes)

| Option | Text (abridged) | Why it matters here |
|---|---|---|
| **Rising Evil** (support) | +16.5% additional **Deterioration** damage; with Evil, 10% chance for +1 Deterioration stack | Hits the 88.8% DoT share directly. Probably the best new support for this build. Needs a `deterioration.additional_damage_pct` contribution plus a stack-chance term |
| **Honed Edge** (support) | +20% additional; 2H: +9% crit rating per 45 base weapon damage, up to +90% | Sierra's 444–503 base caps it, so about ×1.2 plus crit rating |
| **Still Charge** (Demolisher support) | +32% additional on the next use after going stationary; movement buff | The rig stands still (`standing_still` 99). Check whether "next use" survives n=1 cadence |
| **Weakness Infiltration** | +22% additional; enemies +30% infiltration effect taken | Generic multiplier |
| Target Projection / Windbolt / Seize / Blazing Scorch | Projectile Enhanced Mark; +26% with Swiftness; +26% hit with reversed knockback; fire ignite | Tag-matched, already in `supports.json` (SS14). Blazing Scorch is likely dead under full erosion conversion |
| **2H Hammer Ultimate base affixes** | Core skill supported by Lv10 Quick Return + Lv10 Crit Damage Increase, or Lv10 Melee Knockback + Lv10 Increased Area | Gear-base choice for the maul. QR moves the demolisher n ladder (already n=1 here) |

Each needs a mechanics.md row and a priced A/B prediction before it is trusted.

---

## 7. Calculator (page) backlog

Verified against the code (`calc.ts`, `main-bing.ts`, `bing.html`):

1. **Stale prose.** `bing.html:32-35` says the seed is "copied from the Rehan snapshot". It has been
   the real build since `0d2dd7e`. The `calc.ts:8-10` header says "150b-setup" and "8 sections"
   (there are 9).
2. **Not everything is editable.** `SECTIONS` (`calc.ts:12-22`) omits `additional_typed`,
   `conversion`, `paralysis`, `tags` and `_gem_levels`, and the form cannot add a missing key (e.g.
   `demolisher_resto_pct`). Most of this build's tuning surface (passivation, erosion_amp,
   forbidden_power, repentance) is therefore read-only on the page.
3. **The fire res/pen inputs are inert** on the real build, because every portion converts to
   erosion. Relabel them, or hide them when no portion ends non-erosion.
4. **Support picker double-counts.** Enabling Slow Projectile, Steamroll or Fusion stacks on top of
   the snapshot's baked values, and Fusion lands **untyped** in `additional.supports`. Passivation
   and Upheaval are absent from the picker (it only covers HoA tags; Erosion is not covered).
   - Fix: drive the snapshot's support lines from the picker (one source of truth), seeded from
     `_gem_levels`.
5. **Added X Damage routing.** All four route into `flat_added_cold` (`calc.ts:63-68`), and under
   cold→erosion they become was-cold erosion. mechanics.md#supports-ss13 says Added Erosion goes to
   `flat_added_erosion`, but that gem is not in the picker data.
6. **No HoA level input.** WAD 369 is two independent fields. The SS13 WAD table exists only on the
   guarded side (`guardedCompiler.ts:50-53`).
7. **`info` lines never reach the model.** Quick Return's restoration and Multiple Projectiles'
   +2 projectiles (mechanics.md#multi-proj, "panel wiring later") do not feed it.
8. **Smaller issues:**
   - "pick up to 5" is not enforced.
   - "Reset to build" does not reset supports.
   - The "Additional Damage Bonus" stat excludes `additional_typed`.
9. **Duplicate snapshot files** (§1). Make `bing-snapshot.json` the generated or copied artifact.

The TLI Lens guarded modules (`guardedCompiler.ts`, `bingIntrinsic.ts`, `bingFactorLedger.ts`,
`supportEvidence.ts`) are **separate and SS13-pinned**. They never import `damageModel`, they never
claim DPS, and the season switch deliberately does not touch them. Their typed blockers (landing
and overlap, 70% shotgun geometry, demolisher cadence, enemy state) are the import-side equivalent
of the calculator's fold-ins.

---

## 8. Live memory reads (tli_dump)

Re-anchored on 2026-10-09 for the updated client (`0x6aa39847`; the item records already carry
`ReminiscenceS14AwakenType`) in poorchlight `2cc4ab3`.

```powershell
# elevated terminal, game running
cd poorchlight
cargo run -q --release -p tli_dump --bin tli_dump -- --portable-json > ..\live_dump\portable.json
```

- Player Data (inventory items) is always readable.
- **The build view (skills, supports with levels, traits, gear, slates) only exists while a Hunter
  File or Pro Build page is open in game.** Open your own Hunter File on the Bing character before
  dumping. That is how to verify §3 (Melee Knockback vs Slow Projectile, gem levels, the lunar
  affix) and §6.2 (the maul's base affixes) without guessing.
- After the next client patch, `--reanchor --write-layout` again (see `tli_dump/README.md`).
- The dump overwrites the local `tli_dump/ui/fixtures/_last_live_*.json`.
  `reproject_last_live_snapshot` expects a Moto capture there, so re-capture that if you need the
  test green.

---

## 9. Protocol (summary of the `bing-dps-model` skill)

The skill's rotation table ("current" column: 2 bombs, n=3, 175-175 mallet) and its "195 tests"
describe the **bare calibration rig**, not the real build (2.5 bombs, n=1, Sierra; 571 tests).
Update the skill when phase B lands.

- **Ratios come from span means.** 3 runs each, same session, frozen auras. Spans repeat ±1.3%;
  5s-highs swing ±4.5%.
- **Absolutes are sanity-checked against the 5s-high.** The model is steady-state, so it should sit
  a few % above the span.
- **Never read an attack-speed effect off the span.** The edge loss grows with attack speed, and
  attack speed is linear.
- **Order of work:** mechanics.md row first, then a failing test, then code. Finish with
  `pnpm test && pnpm page`.
- **Encoding rules:**
  - Talent nodes are per point.
  - Read the sheet for crit, Str and AS.
  - Planner exports can reset pactspirit levels to 1.

---

## 10. Bing progression tooling (phase B)

Rehan has a full progression toolchain. Bing has none:
- `rank.ts` sensitivity table
- `catalog.ts` slate/memory ΔDPS
- `progression.ts` gear ladder
- the Linear/Bundles page tabs

`main-bing.ts` says as much: "no HoA build data exists yet to generate the other tabs". Build it in
this order. Each step is useful on its own.

### 10.1 Bing sensitivity table

`STANDARD_PERTURBATIONS` (`rank.ts`) are Rehan levers. On the Bing snapshot they give:
- `NaN` wherever `bump` adds to a missing key (`d[k] += delta` with `d[k]` undefined);
- 0% for combo, warcry and cold-pen rows.

Design:
- `BING_PERTURBATIONS`, selected when `rotation.bombs_per_throw` is set. Keep Rehan's list
  untouched.
- Make `bump` treat a missing key as 0, so "fresh" levers work.
- Levers that matter here:

| Lever | Path |
|---|---|
| +10% increased (global / erosion / attack / melee / projectile) | `increased.*` |
| +10% generic additional | new `additional.fresh` |
| +10% erosion-typed additional | `additional_typed.erosion.fresh` |
| **+10% additional Deterioration** | `deterioration.additional_damage_pct` |
| +10% Deterioration increased | `deterioration.damage_inc_pct` |
| **±5% Deterioration duration** (shows the 5th-tick cliff) | `deterioration.duration_inc_pct` |
| +5% Deterioration chance (capped at 100) | `deterioration.chance_pct` |
| +10% attack speed | `rotation.attack_speed_inc_pct` |
| +30% crit damage, +5% crit chance | `crit.*` |
| +10% erosion pen | `penetration.erosion_pct` |
| +1 projectile | `rotation.proj_added` |
| +10% enemy taken | `enemy_taken.fresh` |
| +10% geometry (proxy for area/proj-speed until the H sweep lands) | `rotation.hits_per_bomb` |
| +10% weapon phys | `base.weapon_phys_*` |

- Add a test that every Bing row is finite and that the det-duration row reports the boundary.

### 10.2 Bing upgrade pricing

- Price each §6.3 SS14 option and each candidate slate or memory line as a ΔDPS on the seasoned
  snapshot, one mechanics.md row per line.
- `catalog.ts` scores mods against Rehan applicability (`NOT_THIS_BUILD` rules, the Spectral
  Slash tag set). Generalize it with a per-build applicability profile rather than forking it.
  The Bing profile has these properties:
  - erosion-final;
  - bomb, projectile and melee tags;
  - no combo;
  - DoT-dominant, so Deterioration lines rank high;
  - proximity lines only when Solar Ring gates them in.
- Rehan stays on its current profile, so its outputs must not change. Guard that with the existing
  catalog tests.

### 10.3 Bing gear ladder and page tabs

- `progression.ts` needs a parsed export. Bing parse coverage is 77% (unhandled-stats.md), and the
  real snapshot is hand-encoded. So start with **snapshot-delta ladders**: each rung is a cited
  set of snapshot edits, not a re-parse.
- Then render the sensitivity table and the priced upgrade list on `/bing`, behind the season
  switch.

---

## 11. Retiring SS13

Once the SS13 numbers are final, follow the removal steps in the `seasons.ts` header and
`grep -rn "SS13-temp"`. For Bing, `_gem_levels` stays; only the `ss13` anchors go. Re-baseline
the real-build test (currently pinned at 596.2B under SS13) to the SS14 measurement once one
exists.
