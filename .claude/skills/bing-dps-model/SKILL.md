---
name: bing-dps-model
description: "Teaches the @rehan/dmg DPS model and how to modify it for the Bing / Hammer of Ash (Blast Nova bomb) build, driven by the packages/dmg/test/bing1/blast-nova.test.ts living spec. Covers the Snapshot shape, cycleDps's two rotation branches (Spectral Slash vs bomb), erosion/mitigation, the in-game calibration loop, and the TDD + mechanics.md discipline for changing the model safely. Use when adding a support/gear/trait to the Bing model, when a Bing DPS number looks wrong, when reconciling an in-game DPS log against the model, or when editing damageModel.ts / bing-snapshot.json. Triggers include: bing dps, hammer of ash, blast nova, bomb rotation, hits_per_bomb, demolisher, calibrate dps, bing1 test, cycleDps, erosion damage, damageModel."
---

# Bing DPS Model & Calibration

The `@rehan/dmg` damage model computes single-target boss DPS for two builds. This skill is
about the **Bing / Hammer of Ash (HoA)** build — a Blast Nova *bomb* playstyle — and the
`bing1/blast-nova.test.ts` living spec we use to calibrate the model against real in-game logs.
Everything here is code + measured ground truth. Nothing is eyeballed.

Not covered: the website (`packages/page` UI). That comes later.

## Where the code lives

| Path | What |
|---|---|
| `packages/dmg/src/damageModel.ts` | The pure model: `Snapshot`, hit/crit/mitigation math, `cycleDps` (both rotations), erosion, deterioration |
| `packages/dmg/test/bing1/blast-nova.test.ts` | **The living spec.** Each `describe` = one build step with its in-game log baked into the asserts |
| `packages/dmg/test/damageModel.test.ts` | Unit tests for the model primitives (averageHit, erosion, deterioration, bomb mechanics) |
| `packages/page/src/data/bing-snapshot.json` | The Bing build's default snapshot (the calc's boot state) — hand-editable |
| `docs/mechanics.md` | **The mechanics truth.** Every modifier cited with confidence. `#bing-bombs`, `#erosion`, `#deterioration` |

## The model in one screen

`Snapshot` sections (all `Record<string,number>` unless noted): `base`, `increased`,
`additional`, `enemy_taken`, `crit`, `penetration`, `enemy`, `rotation`, optional `deterioration`.

Damage flows through pure functions:

- `averageHit(s, skillPct?)` → the **elemental/phys** portion, pre-crit/pre-mit: weapon×skill%
  + flat adds, scaled by `damageEnvelope` (increased sum × additional product × enemy-taken).
- `erosionAvg(s)` → the **erosion** portion (its own damage type): `flat_added_erosion` ×
  effectiveness × `damageEnvelope` × `(1 + increased.erosion)`. Erosion-typed increase lives in
  `increased.erosion` and is *excluded* from `damageEnvelope` so it only touches erosion.
- `expectedHit(s)` = `(averageHit × mitigationMultiplier + erosionAvg × erosionMitigation) × critMultiplier`.
  The two portions mitigate by **different resistances**, then crit as one hit (crit is type-agnostic).
- `mitigationMultiplier` = elemental res + armor (two layers). `erosionMitigation` = erosion res only
  (erosion ignores armor and elemental res).

### `cycleDps(s)` has TWO rotation branches — know which one you're in

Selected by `rotation.bombs_per_throw`:

- **Bomb branch (Bing)** — present when `rotation.bombs_per_throw` is set:
  `hitDps = throwRate × bombs_per_throw × (expectedHit × hits_per_bomb × (proj_base+proj_added)/proj_base) × (n−1+M)/n`
  where `throwRate = throw_rate_base × (1 + attack_speed_inc_pct/100)`, `M = demolisher_empower_mult`,
  `n = demolisher_every_n` (one throw in n consumes a Demolisher Charge and is empowered ×M).
- **Spectral branch (Rehan)** — the else path: starters/finishers/Mark/clones. **Do not touch
  this for Bing work.** It is load-bearing for `progression.ts`, `rank.ts`, `catalog.ts`, and many tests.

Both branches then layer `deterioration` (Obliterate/Ruinous Star) on top identically. The Bing
snapshot keeps `deterioration.chance_pct = 0` until Obliterate is equipped.

## The Bing1 bomb rotation fields (`rotation`)

| field | meaning | current |
|---|---|---|
| `bombs_per_throw` | Blast Nova throws N bombs per attack | 2 |
| `throw_rate_base` | throws/sec before attack speed (follows weapon APS) | 1 |
| `attack_speed_inc_pct` | +% attack speed; scales `throwRate` **linearly** | 0 |
| `hits_per_bomb` | effective NORMAL-throw hits on a single target (radial spread + 0.7 shotgun) — a **calibration constant** | 0.8353 |
| `proj_base` / `proj_added` | bomb projectile count (HoA 1 base + its own +2 + Blast Nova +2 = 5); single-target hits scale ×(base+added)/base — confirmed by the Multiple Projectiles A/B | 5 / 0 |
| `demolisher_empower_mult` (M) | empowered throw ×M vs normal (+215% additional hit ⇒ ×3.15, × ~1.16 explosion overlap) — a **calibration constant** (±0.15) | 3.65 |
| `demolisher_resto_pct` → n | one throw in n consumes a Demolisher Charge; avg factor (n−1+M)/n. Charge interval = **3s ÷ (1+restoration%)** (user's in-game table, 200%⇒1.0s … 1400%⇒0.2s), consumed **at the throw** (not the 1.5s detonation) ⇒ **n = ceil(interval × throwRate)** — derived in cycleDps when `demolisher_resto_pct` is set (`demolisher_every_n` is the manual fallback). Verified at ~1 throw/s base cadence: 0%⇒3, 97%⇒2 (bare A/B + "every other one is exploding"), 100%/166%⇒2, 200%⇒1; don't sit exactly on a threshold (199% edge is display-rounding territory). **Attack speed raises throwRate and can push n back up — re-tune restoration or the demolisher share drops** | resto 0 ⇒ n=3 |

Base/enemy for the current build: weapon `175-175` phys (Destroyer Mallet), `skill_weapon_pct 369`
(HoA L20, 369% WAD), `added_damage_effectiveness_pct 369`, 100% phys→fire so `cold_res_pct` is used
as **fire res (30%)** and armor is 0. Erosion: `flat_added_erosion 50-50`, `erosion_res_pct 30`,
`increased.erosion 14`. The dummy's fire/cold/lightning res are all confirmed 30%; erosion assumed
30% uniform (back-solves 26 ± 7%).

## Confirmed mechanics (cite these; full rows in `mechanics.md`)

- **HoA converts 100% phys→fire.** Weapon and Added Physical both become fire (fire res). Added
  Fire → fire; Added Cold → cold; Added Lightning → lightning; Added Erosion → erosion.
- **Added-damage flat is scaled by the skill's `added_damage_effectiveness_pct` (369% for HoA)** —
  so a 50-flat gem contributes ~184/hit, often bigger than the bare weapon hit.
- **Erosion is a separate type** with its own resistance (`erosion_res`), unaffected by elemental
  res or armor. The lv85 dummy: fire/cold/lightning res 30% (confirmed), erosion 30% (assumed uniform).
- **Erosion-typed additional damage touches only the erosion portion** — Passivation ("up to +60%
  additional Erosion" at L20) A/B'd as an exact no-op on the zero-erosion bare build.
- **Multistrike does not trigger on Blast Nova bomb throws** (user-tested) — no-op for Bing.
- **Deterioration is calibrated** (2026-07-20 Obliterate chain, six states, span/steady eff
  0.879–0.892): chance caps at 100%; the tick **ramp is ADDITIVE** (1, 1.3, 1.6, … — tick sum 3.9
  at 1.3s, not compound 3.99); "+X% Deterioration Damage" (non-additional) **joins the increased
  SUM** for the det envelope (×(incSum+X)/incSum); "+X% additional …" is its own ×(1+v); duration
  lines sum and tick-count breakpoints are sharp (+5% duration ⇒ 4th tick ⇒ +49% tick damage).
  Fire→erosion conversion is DPS-neutral at the dummy's equal 30/30 res — post-conversion
  erosion increases are encoded as `increased.global` (no conversion plumbing needed yet).
  RESOLVED: the product rule holds — Passivation is a full ×1.60 term (measured ×1.5998 exactly).
  Fusion's under-delivery on converted damage is **conversion-overflow redistribution**
  (mechanism CONFIRMED 2026-07-20 via the +81% Physical killer test, ×1.8106 = full delivery):
  HoA's phys→fire 100% and Obliterate's phys→erosion 100% both claim the weapon phys, splitting
  it 50/50 into {phys→fire→erosion} and {phys→erosion}; a typed line applies to a path iff its
  type appears in the path's history, and typed lines COMPOUND within a path before the 50/50
  average. So: phys-typed full; fire/elemental-typed ×0.5 on weapon (Fusion L20 = 0.5×1.35+0.5
  = ×1.175 ⇒ `additional.fusion` = **17.5**); cold-typed only on was-cold portions; erosion/
  generic full on everything. PLUMBED into the model: put `Snapshot.conversion` claims +
  `additional_typed` buckets on the snapshot and encode lines at FACE VALUE — the model
  derives deliveries itself. Flat aggregates (fusion 17.5 on conversionless snapshots) stay
  valid where origins don't mix (deterioration chain) — mechanics.md#support-additional-sum.
- **Bomb geometry (Skill Area AND Projectile Speed) is real single-target damage** — embers
  auto-trace on all throws; **explosions exist only on empowered throws**, so proj speed scales
  every throw while Skill Area scales only the empowered explosion term (area value grows with
  demolisher frequency). Measured H (hits multiplier after stripping gem additional lines):
  proj −30% ⇒ ×1.189; proj +20% ⇒ ×0.889; area ×1.20 ⇒ ×1.048; proj −30% + area ×1.74 ⇒
  ×1.434; proj −30% + area ×2.26 ⇒ ×1.507. Compounding, saturating; unmodeled (fold into
  `hits_per_bomb` per build) — full table in mechanics.md#bing-skill-area.
- **Attack speed is LINEAR** on true DPS (`+27% AS → +28.6% peak`, 2026-07-20). Do not model it
  as diminishing — see the red flag below.
- **Bomb detonation delay ≈ 1.5s.** Bombs fire projectiles "in all directions"; ~1 connects on a
  single-target boss. Shotgun falloff coefficient 0.7.
- The model currently lumps cold/lightning/fire into one elemental res slot (`cold_res`), assuming
  the target's cold & lightning res also = 30%. Split into their own slots only if a log contradicts it.

## The calibration loop (the core technique)

The user equips something in-game, runs a fixed-window DPS test on a dummy, and reports numbers.
You reconcile against the model and update it. **This is the whole job.**

### CRITICAL: ratio deltas fit on SPAN MEANS; absolutes sanity-check on the 5s-high.

The user reports **span** (whole-window avg) and **5s-high** (best 5s) per run, ideally ×3 runs.

- **Spans repeat at ±1.3%; 5s-highs swing ±4.5%** (5% crit chance — the best-of-window statistic
  selects crit spikes; measured on 4 bare repeats 2026-07-19). So an A/B gem/talent effect is read
  as `span_mean(build) / span_mean(bare 1,302.5)` — the edge loss cancels in the ratio.
- The **span understates steady DPS** by a bomb-pileup edge efficiency (~0.88–0.90, measured
  0.879–0.902 across the QR demolisher ladder): bombs pile up before the first detonation (~1.5s)
  and are cut off still-airborne at the end. The loss **grows with attack speed** — never read an
  AS effect off the span (+27% AS reads ×1.116 on span; true is ×1.27, linear).
- The model outputs steady-state DPS, anchored on the bare 5s-high 1,458 (pooled mean 1,485 ± 4.5%).
  A model absolute should sit a few % ABOVE the span and near the 5s-high mean.

### The reconcile → update cycle

1. Compute the model's current number (see command below) for the exact build the user measured.
2. Compare the **span-mean ratio vs bare** to the model's predicted ratio. A consistent gap across
   builds means a **calibration constant** (`hits_per_bomb`, `demolisher_empower_mult`) or a
   **resistance** is off — back-solve it.
3. **Prefer the cleanest anchor.** A bare build (no supports, no erosion) pins `hits_per_bomb` off
   the pure weapon hit with zero res ambiguity. Ask for it rather than folding a res calibration into `hits_per_bomb`.
4. Make the change **test-first** (below), then update the `bing1` step's comment with the measured
   log (span / 5s-avg / 5s-high, date) — the spec captures ground truth every step.

## How to modify the model (non-negotiable workflow)

Project invariants (from `CLAUDE.md`) apply — a change that skips them is a bug:

1. **Failing test first.** Add/adjust the assertion in `damageModel.test.ts` (a new primitive) or
   `bing1/blast-nova.test.ts` (a build step), run it RED, then implement to GREEN.
2. **Every mechanic gets a `mechanics.md` row** with a confidence flag *before* the code lands.
   New behavior with no citation = reject it.
3. **After any change: `pnpm --filter @rehan/dmg test` must pass** (currently 195 tests). The
   Spectral/Rehan path and its tests must stay green — Bing changes are additive.

### Adding a new Bing step (the common case)

- Flat added damage → `base.flat_added_*` (elemental) or `base.flat_added_erosion_*` (erosion),
  scaled by `added_damage_effectiveness_pct`.
- A "+X% Erosion Damage" increase → `increased.erosion` (erosion-only).
- A generic/elemental increase → the matching `increased.*` key (applies to the elemental portion).
- A throughput change (attack speed) → `rotation.attack_speed_inc_pct` (linear).
- Add a `describe("Bing1 step N — ...")` to the living spec: assert the **mechanic** (a delta ratio,
  protocol-independent) plus, once you have the log, the **5s-high** absolute. Record the log in the comment.

### Compute the model's DPS for a snapshot

```bash
cd packages/dmg && node --experimental-strip-types -e "
import { cycleDps, expectedHit } from './src/damageModel.ts';
import fs from 'fs';
const s = JSON.parse(fs.readFileSync('../page/src/data/bing-snapshot.json','utf8'));
console.log('per-hit', expectedHit(s).toFixed(1), '| dps', Math.round(cycleDps(s).dps));
"
```

Change `s` fields in the `-e` string to model a hypothetical (e.g. `s.rotation.attack_speed_inc_pct = 27`).

## The REAL BUILD (real_buld_3) — full-rig calibration

`data/bing1/real_buld_3_snapshot.json` is the hand-encoded snapshot of the actual endgame
build (Sierra maul, Ruinous Star, FC/BB/FH traits, 4 auras, charge engine ⇒ n=1, three
pactspirits, kismets, 7 slates, 4 trees). The bing1 spec's "Bing real build" describe pins
it: RS-off 13.17B (the H anchor, exact), full model 443.2B vs measured 557.75B —
**open residual ×1.258** (5th-tick boundary A/B pending; erosion-typed +8%-hot pattern).
Per-line citations: mechanics.md#real-build. When touching this build, load the snapshot —
do not rebuild it from the export by hand.

### Protocol upgrades (2026-07-20 — non-negotiable for new reads)

- **Frozen auras**: unequipping gear drops energy and silently disables auras. Fix one
  aura set that survives the weakest test state, keep it across every A/B, name it in
  each report. A contaminated ratio briefly shipped (then reverted) a wrong mechanic.
- **Same-session baseline**: every A/B ratio needs its baseline spans from the same
  sitting. Sessions repeat ~1%, but gear toggling between sittings does not.
- **Sheet-first**: crit chance/damage and Strength come off the character sheet
  (`chance = rating × (1+Σ rating%)/100` — verified exact), never hand-summed.
- **Talent tree nodes are PER-POINT**: multiply the node line by allocated points
  (3pt "+9% damage" = +27%). Notables are single-value. Pactspirit nodes are single.
- **Planner exports can reset pactspirit levels to 1** — verify levels on every export.

## Red flags — STOP if you catch yourself doing these

| Thought / action | Reality |
|---|---|
| "One 5s-high moved, so the mechanic changed" | 5s-highs swing ±4.5% (crit spikes). Effects are read off SPAN-MEAN ratios (±1.3%), ideally 3 runs. |
| "Span ratio is flat under attack speed, so AS is weak" | The span edge loss grows with AS. AS is linear on steady DPS; never read AS off the span. |
| "Attack speed barely helped, model it as diminishing" | Attack speed is **linear**. A flat average is the measurement artifact, not the mechanic. |
| "I'll just edit `supports.json` by hand" | It is **generated** (see its `source` header and CLAUDE.md `scripts/` row). Regenerate rather than hand-editing — edits get overwritten. |
| "This mechanic is obvious, skip the mechanics.md row" | Invariant #1: no cited row, no code. Add the row first. |
| "I'll implement then add a test" | Invariant #4: failing test FIRST. |
| "Erosion can share the fire-res slot" | Erosion has its **own** res and ignores armor. Use `erosion_res`/`flat_added_erosion`. |
| "I'll bump `hits_per_bomb` to fit a build that has erosion in it" | That folds erosion-res error into `hits_per_bomb`. Anchor on the bare build. |
| Editing the `cycleDps` **else** (Spectral) branch for a Bing change | Wrong branch. Bing is the `bombs_per_throw` branch; the else path is Rehan and load-bearing. |
| Encoding a talent node at its printed value | Node lines are PER-POINT — a 3pt node is ×3. The sheet (crit, Str) is the cross-check. |
| Trusting a ratio without a same-session, frozen-aura baseline | Aura drops and session drift fake mechanics. One did (det double-dip) — measured, encoded, refuted, reverted in one day. |
| Dividing the Obliterate share by bombs per throw | Obliterate gates the THROW; all its bombs inflict. The ÷bombs bug hid at 2 bombs × 1/s and cost ×1.7 on the real build. |
| "Proximity lines are always-on at a dummy" | Under Firepower Coverage you stand at RANGE — Well Matched/Marksman ride Solar Ring's "within 3m". Bomb-centered lines (Frenzy Hound) do not. |

## Quick commands

- `pnpm --filter @rehan/dmg test` — run the model + bing1 suite
- `pnpm test` — full suite
- Compute a snapshot's DPS — the `node --experimental-strip-types` one-liner above
- Regenerate `supports.json` from tlidb via the generator documented in CLAUDE.md (`scripts/`) — never hand-edit it
