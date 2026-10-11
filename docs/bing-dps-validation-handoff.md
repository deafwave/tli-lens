# Bing / Hammer of Ash — DPS model handoff and execution plan (2026-10-10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to run §8 task by task. Steps use checkbox (`- [ ]`) syntax. Read §1–§7 once;
> each task card in §8 is self-contained for its implementer (`task-brief` extracts it).

**Goal:** a DPS model trustworthy enough to drive a combinatorial optimizer — which gear upgrades to buy/craft,
which slates and pedigrees to chase, which talents to change — from a level-60 start to tens of trillions.

**Architecture:** every model change is argued from an in-game measurement on the training dummy (memory-read,
game-time DPS) with the model's prediction written first; each measurement lands in a vitest case and each mechanic
in `docs/mechanics.md`. Coverage work drives every line in the catalogs to mapped-or-irrelevant; the optimizer
extends `bingProgression.ts` once the model and coverage hold.

**Tech stack:** TypeScript + vitest (`packages/dmg`), Node tools in `.claude/skills/` (`tli-game`, `bing-ab-test`),
the Rust memory reader `../poorchlight/tli_dump` (elevated shell), the running Torchlight: Infinite client.

**Spec:** this document §1–§3 (state, fitted constants, discrepancies), `docs/mechanics.md` (the mechanics truth) and
the invariants in `CLAUDE.md`.

**Where to work:** `rehan_guide` on `main` (GitHub `deafwave/rehan-torchlight`, remote `torchlight`). The old
`rehan_guide_bing` worktree is detached at main and is removed once no session runs in it
(`git worktree remove ../rehan_guide_bing`). Memory reader: sibling repo `poorchlight` (`ChandlerFerry/poorchlight`).
Game control: `.claude/skills/tli-game` (read its SKILL.md first; Torchlight's PID changes on restart —
`tasklist | grep torchlight`).

---

## 1. Where things stand

**Calibrated against the user's build** (`data/bing1/scraped/my-build-2026-10-10.json`, lv85 training dummy,
no input, standing still): model **467.3B** vs measured **~457–472B** (game-time). 15 in-game A/Bs reproduce within
±4.4% (rms 2.25%) — `packages/dmg/test/bing1/import.test.ts`:

| A/B (state off / swapped) | measured | model |
|---|---|---|
| Timid, Elemental Fusion, Passivation, Steamroll, Upheaval, Precise Projectiles, Precise: Cruelty, Slow Projectile | ÷1.19 … ÷1.62 | within 2% |
| Flame Core off (no Sentry → no Formation Breaker charges) | ÷4.12 | ÷4.14 |
| Tyrant's Smoldering Hold for Death's Touch | 221.4B | 223.0B |
| Boots of Devastation for Blade-dancer's | 676.9B | 654.2B (−3.4%, Hasten unmodeled) |
| blank Destroyer Mallet / blank Black Pass Claymore / Claymore +25% gear phys / Sword +18% gear AS | 72.3 / 80.7 / 102.7 / 82.6B | +4.4 / −2.4 / −4.2 / +3.8% |

**Mechanics established** (each has a `docs/mechanics.md` row — read `#bing-dummy-loop`, `#bing-game-time`,
`#bing-hit-channels`, `#bing-proj-speed`, `#bing-cruelty`, `#bing-mark`, `#bing-obliterate`, `#bing-prism-import`,
`#bing-sentry-curse`, `#tenacity`):
- Dummy DPS is per **game second** (30 logic frames); the client slows when laggy; damage is batched per frame.
- Obliterate converts phys/ele → erosion **only on enhanced uses**; un-enhanced throws hit as fire and inflict no
  Deterioration. Deterioration inherits hit-taken multipliers (Timid A/B).
- Firepower Coverage auto-throws at character attack speed, but **not** "Attack Speed for the supported skill" (Steamroll).
  **Suspect** — Blast Nova's own text sets the throw rate (Task 0).
- "Unable to trigger Empower Skills" stops Activation Medium from firing Empower skills (Bull's Rage 0% uptime).
- Mark on hit (+10% crit damage taken, 97% uptime); Cruelty's Elite-hit stacks double it at the dummy; Tenacity/Sacrifice;
  Ice Bond is a Sentry; Entangled Pain is a DoT-only curse; prism base affixes and 4×3 areas now import.
- Main-hand adds from other gear ("Adds X Physical Damage to the Main-Hand Weapon") are multiplied by the weapon's
  +% Gear Physical (×1.273 measured vs ×1.25 model).

**Done since the last handoff:** the poorchlight combat/UI reader (`--combat-json`, `--combat-watch`, `--cast-watch`,
`--ui-json`) is committed and pushed (poorchlight `6b09a3d`). `pnpm test`: 609 green at `8110a14`.

---

## 2. What is fitted, not understood (the main risk)

These constants make the one build fit; each could be wrong for every other build. Replace each with mechanics.

| constant | value | where | what it absorbs | task |
|---|---|---|---|---|
| throw-rate law | weapon base APS (1.5) × sheet attack speed (`aux.throw_at_weapon_aps`) | `bingLedger.ts:386-397`, `bingKit.ts:187` | a 0.48s wall-clock screenshot count; Blast Nova's text says base 1/s × attack-speed bonuses — may underlie every row below | Task 0 |
| `OBLITERATE_TIMER_SCALE` | 0.70 | `damageModel.ts` | stated 0.5s behaves like 0.35s | Task 2 |
| `FC_AUTO_HITS` | 1.453 | `bingLedger.ts` | hits per bomb under Firepower Coverage vs the July fold | Task 3 |
| `non_projectile_share` q | 0.31 | `BING_ZERO.rotation` | share of hits not projectile-typed | Task 4 |
| `proj_speed_hit_exp` k | 0.28 | `BING_ZERO.rotation` | Ember hits vs projectile speed | Tasks 4, 5 |
| `EXPLOSION_SHARE` | 0.044 | `bingLedger.ts` | Upheaval explosion line's scope | Task 6 |
| Bull's Rage uptime | 0.75 / 0.58 without FC | `bingKit.ts` | Activation Medium: Demolisher cadence | Task 7 |
| `demolisher_empower_mult` M | 3.65 (×boots/sun) | July calibration | empowered vs normal throw | Task 8 |

`pnpm bing diagnose <build> --season ss13` also lists **unverified assumptions** (DPS ÷ under the conservative
reading). On the user's build only two bite: `proximity` ÷1.61 (Task 1) and `bulls-rage` ÷1.20 (Task 7). The rest
(skill levels ÷2.36, tick grid ÷1.30, lucky, corruption, low-life, profane…) bite only Pro builds — Tasks 10, 15.

---

## 3. Open discrepancies

| # | discrepancy | task |
|---|---|---|
| 1 | **Blank Mallet vs blank Claymore**: 72.3 vs 80.7B measured (+11.6%) for +15 base phys; model says +4%. Repeated twice | Task 11 |
| 2 | **Hasten** (Boots of Devastation "Has Hasten"): value unknown (needs ~+3.5% attack speed to fit) | Task 12 |
| 3 | **One-handed weapons untested**: Hollow Rift Axe, 2× Sierra Forge Light Hammer in the bag (gear tab). Every "when holding a Two-Handed Weapon" line is assumed true — the importer strips the clause | Tasks 13, 14 |
| 4 | **Pro builds far off**: 「寒山寺宾一5000火 1w亿」 (1T dummy; model 119.5B) and 「寒山寺40万亿」 (40T, probably Ordrak; model 222T). After the Empower rule the 1T build loses its Ice Bond engine — ask how it's played | Task 10 |
| 5 | **Position matters** (proximity lines via Solar Ring): baselines moved 480 → 433B between spots | Task 1 |
| 6 | `+X% Projectile Speed` / `Skill Area` lines are geometry no-ops; skill-level scaling past 21 unverified (40T relies on it ÷2.36) | Tasks 5, 15 |
| 7 | General (non-Bing) Torchlight math (Rehan / Spectral Slash, `buildParser.ts`) not revalidated | Task 25 |

---

## 4. How to work (lessons)

- **Memory first.** `node .claude/skills/tli-game/ops.mjs state` (skills, auras, equipped gear with item ids), `combat.mjs 30 --buffs` (game-time DPS +
  buff uptime + Deterioration stacks), `ops.mjs unequip/restore/aura/equip/gear-restore` (one call, verified, item-id
  restore). Screenshots only to calibrate a new UI.
- **In-game A/Bs follow the `bing-ab-test` skill** (prediction logged first with its `predict.ts`, A-B-A bracketing,
  30-second game-time windows, restore verified). Model changes follow the `bing-dps-model` skill.
- **30-second windows** while iterating (user's request); ±~5% noise from Kaleidoscope's 8s rotation.
- **Never move the character** between A and B. Blink only aimed into the trees left of the dummy (blocked).
- Clicks need Torchlight in front (`ops` waits); keys are posted in the background. ESC closes *all* panels including the
  dummy's (its counter keeps running). The bag grid scrolls — `ops` reads `scrollOffset`. Auras with Seal Conversion
  unseal Life when deactivated. The F2 Skill panel pauses the dummy's frame counter.
- If results look absurd after many gear swaps, suspect the game's snapshot bug: log out and back in (the user does this).
- The "auto-throws every ~0.48s" figure (#bing-dummy-loop) was a screenshot count on the **wall clock**, taken before
  the game-time correction — treat it as unmeasured.
- Never leave a shell loop waiting on the game across turns — a stale wait loop from an earlier session was found
  armed to unequip Flame Core hours later.

---

## 5. Global constraints

Every task's requirements include these.

- Commit on `main` in `rehan_guide` (user 2026-10-10: "make sure everything is on MAIN"). Before every push:
  `git fetch torchlight && git rebase torchlight/main` — another agent pushes too. poorchlight changes: commit, and
  push only after the user says so.
- `pnpm test` stays green (609 at `8110a14`). **Never loosen an existing tolerance or delete a measured case** to make
  a change pass — a change that breaks a measured A/B is a failed change.
- `CLAUDE.md` invariants: the `docs/mechanics.md` row lands before the code; failing test first; after any model or
  parser change `pnpm test && pnpm page`, then refresh the page prose numbers. Stale prose is a bug.
- **One game driver at a time.** Only the dispatched GAME task runs `ops.mjs`, `combat.mjs`, `state.mjs`,
  `game.ps1`, `tli_dump` or `scripts/scrape_build.mjs`. OFFLINE tasks never run them.
- Game-time DPS only (`combat.mjs` field `dps`, never `wallDps`). 30-second windows, A-B-A bracketing.
- Every in-game number compared to the model lands in a test, with a comment
  `// measured ÷X (YYYY-MM-DD, label <label>); predicted ÷Y first`.
- The user may be using the PC: never set `TLI_FORCE_FLICK`; `ops` waits for Torchlight to come to front.
- **Needs-user steps never stall the run.** Purchases (Trade House), logging out/in, Hero Trait changes, other
  characters and approving poorchlight reverse-engineering are the user's. The controller defers that task, records the
  ask under `## Waiting on the user` in the SDD ledger, and runs the next runnable task; it asks the user once, in one
  batch, when only blocked tasks remain.

---

## 6. Review focus

The five failure modes most likely to ship past the tests; the task reviewer checks each on every GAME task.

1. **Prediction written after the measurement** (a post-hoc fit reported as a confirmation). Every `measurements.jsonl`
   label the task cites has a `predictions.jsonl` row with the same label and an earlier `at`.
2. **The character moved between A and B** (proximity lines are worth ÷1.61 on this build). The A-B-A baselines agree
   within 3% and, once Task 1 lands, the logged positions match.
3. **Game state left changed** — an item not restored, an aura left off (Life unsealed), the Skill panel open (dummy
   clock paused). `ops.mjs state` before and after the task is identical (item ids included).
4. **A refit that fixes one A/B by breaking another** — every case in `import.test.ts` keeps its tolerance; the diff
   touches no existing measured value.
5. **Coverage bought with false "irrelevant"s** — an unknown line moved to irrelevant without a reason naming why it
   cannot add Bing boss DPS (missing tag, defense-only, other skill kind), or a damage line hidden in `IRRELEVANT`.

---

## 7. Orchestration

**Lanes.** **GAME** tasks need the client running with DeafwaveB at the lv85 dummy, the dummy count running, and an
elevated shell; one at a time. **OFFLINE** tasks need only the repo. Game preflight (controller, before dispatching a
GAME task): `tasklist | grep -i torchlight` shows the client, `node .claude/skills/tli-game/ops.mjs state` succeeds,
and `node .claude/skills/tli-game/combat.mjs 5` prints a non-null `dps`. Preflight fails → run the next OFFLINE task.

**Run order** (suggested; respect `Depends on`; needs-user tasks defer per §5):

| task | lane | needs user | depends on | model |
|---|---|---|---|---|
| 0 Bomb throw-rate law | GAME | — | — | most capable |
| 1 Measuring spot and proximity | GAME | maybe (poorchlight RE) | — | standard |
| 2 Obliterate timer rule | GAME | — | 0, 1 | most capable |
| 3 Firepower Coverage hits per throw | GAME | maybe (trait swap, RE) | 0, 1 | most capable |
| 4 Projectile channel held-out A/B | GAME | — | 0, 1 | standard |
| 5 Gear projectile speed lines | OFFLINE | — | — | cheap |
| 6 Upheaval explosion share | GAME | yes (2nd Upheaval) | 1 | standard |
| 7 Cooldown-skill uptime from mechanics | OFFLINE → GAME | — | — | standard |
| 8 Demolisher empower multiplier | GAME | maybe (resto item) | 0, 1, 7 | standard |
| 9 Second calibration build | GAME | yes | 1 | standard |
| 10 Third calibration build (Pro) | GAME | yes | 9 | standard |
| 11 Mallet vs Claymore | OFFLINE → GAME | maybe (relog) | 0, 1 | standard |
| 12 Hasten | OFFLINE | — | — | standard |
| 13 Weapon-handedness requirements | OFFLINE | — | — | standard |
| 14 One-handed weapon A/Bs | GAME | — | 0, 1, 13 | standard |
| 15 HoA levels above 21 | OFFLINE | optional | — | standard |
| 16 Scrape ≥10 more Pro Builds | GAME | — | — | standard |
| 17 Scraped-build unknowns → 0 | OFFLINE | — | 7, 16 | standard |
| 18 Library unknowns: irrelevant batch | OFFLINE | — | — | cheap |
| 19 Library unknowns: damage-shaped | OFFLINE | — | 12, 18 | standard |
| 20 Catalog coverage test | OFFLINE | — | — | standard |
| 21 Catalog unknowns → 0 | OFFLINE | — | 20 | standard |
| 22 Talent tree graph | OFFLINE | — | — | standard |
| 23 Joint optimizer | OFFLINE | — | 17, 19, 21, 22 | most capable |
| 24 Validate optimizer picks in game | GAME | yes (purchases) | 23 | standard |
| 25 Rehan model revalidation | GAME | yes (Rehan character) | — | standard |
| 26 Close-out | OFFLINE | — | all | cheap |

**Dispatch additions** (on top of the SDD implementer template): name the card's **Skills** as "invoke these skills
first"; for a GAME task add "you hold the game for this task: you are the only process driving it; end with
`ops.mjs close` and a `state` identical to the start".

**Report contract additions for GAME tasks** (in the report file): a table `label | predicted ÷ | measured ÷ | Δ%`;
the `predictions.jsonl` and `measurements.jsonl` rows the task used, verbatim; `ops.mjs state` before and after;
any user asks.

**Reviewer additions:** check §6 on every GAME task; check §5 on every task.

---

## 8. Tasks

### Task 0: Bomb throw-rate law (Blast Nova)

**Lane:** GAME (passive reads + bag swaps) · **Needs user:** — · **Depends on:** —
**Skills:** bing-ab-test, bing-dps-model, tli-game, tlidb-lookup
**Files:** Modify `packages/dmg/src/bingLedger.ts:386-397` (`throw_rate_base`, attack-speed composition),
`packages/dmg/src/bingKit.ts:187-188` (Firepower Coverage `aux.throw_at_weapon_aps`), `.claude/skills/tli-game/combat.mjs`
(keep each run's combat-watch CSV) · Test: `packages/dmg/test/bing1/import.test.ts` · Doc: `docs/mechanics.md#bing-bombs`,
`#bing-dummy-loop`

**Why:** Blast Nova's in-game text (user, 2026-10-10): "Projectile Quantity +2 · When using a Non-channeling or
Non-Sentry Main Attack Projectile Skill, throw 2 bombs instead · The bomb automatically detonates 1s after landing,
firing Projectiles in all directions · There can be up to 10 undetonated bombs at the same time. Exceeding the limit
will detonate the bomb that landed first · **Base Bomb Throwing Speed is 1 time per second. 100% of the bonus and
additional bonus to Attack Speed is also applied to Bomb Throwing Speed**". The model instead throws at the weapon's
base APS (1.5, Sierra Reverberation Maul) × sheet attack speed, from a wall-clock screenshot count. An interrupted
agent's 30s capture (no input, baseline loadout) peaks at **11.0 frames = 2.727 bursts/s** (`throw-period.mjs`); the
model's base throw rate is 2.28/s; the text predicts 1 × 1.313 (sheet 1.97 / base 1.5, including the maul's −20%
additional attack speed) × 1.05 (Aggression) = **1.38 throws/s = 2.76 bombs/s**. July's bare-build spec
(`test/bing1/blast-nova.test.ts`, manual casts) also threw 1/s on the 1.5 APS Destroyer Mallet, and Tyrant's
Smoldering Hold (every throw enhanced under any timer rule) reads Deterioration stacks ×0.894 of base vs the model's
×0.811 — a throw-rate miss, not a timer miss. The fitted `OBLITERATE_TIMER_SCALE`
(a 0.725s throw period clears the 0.5s timer every throw), `FC_AUTO_HITS`, the Steamroll special case (`as_inc_skill`)
and the weapon-swap gaps (§3.1) may all be absorbing this — so it runs first.

- [ ] **Step 1 — Texts:** confirm Blast Nova's and Firepower Coverage's texts with tlidb-lookup (does Firepower Coverage
  throw at Bomb Throwing Speed or at its own rate?). The `#bing-bombs` row cites both before any code changes.
- [ ] **Step 2 — Keep the captures:** `combat.mjs` copies `../poorchlight/tli_dump/diagnostics/_last_combat_watch.csv`
  to `../scratch/watch/<label>.csv` after each run. Commit.
- [ ] **Step 3 — Predict:** per candidate, the throw rate in each state — base; Sword +18% gear AS; blank Black Pass
  Claymore; Steamroll off; Tyrant's Smoldering Hold (all already measured for DPS). Candidates: (a) today's model;
  (b) the text: 1/s × (1 + Σ increased AS) × Π(1 + additional AS), weapon base APS and local "+X% gear Attack Speed"
  excluded; (c) increased attack speed not applied at all (~1.44/s at base, the interrupted agent's reading). Append one
  row per state to `../scratch/predictions.jsonl` (`{"label":"tr-<state>","at":"<ISO time>","throwRate":{"a":…,"b":…,"c":…}}`)
  before Step 4.
- [ ] **Step 4 — Measure:** per state, A-B-A with two `combat.mjs 30 --label tr-<state> --buffs` windows (bing-ab-test),
  then `node .claude/skills/bing-ab-test/throw-period.mjs ../scratch/watch/tr-*.csv`.
- [ ] **Step 5 — Decide:** compare each state's burst frequency ÷ base with each candidate's throw-rate ratio (the
  two-bomb harmonic cancels in the ratio); the law is the candidate within ±3% on every state. The absolute rate
  (throws = bursts, or bursts ÷ 2) follows from the winner. No candidate fits → report the table and stop.
- [ ] **Step 6 — Implement:** failing test first (the per-state throw rate from the composed snapshot equals the
  measured ratio ±3%), then the law. Re-run every test and refit only the §2 constants the law makes inconsistent
  (`OBLITERATE_TIMER_SCALE`, `FC_AUTO_HITS`, q/k), never loosening a tolerance. If the 15 A/Bs and the gear swaps
  cannot all be restored, report BLOCKED with the table rather than committing a red or loosened suite.
- [ ] **Step 7 — Record:** rewrite rows `#bing-bombs` and `#bing-dummy-loop` (retire the 0.48s figure);
  `pnpm test && pnpm page`; commit `fix(dmg): bomb throw rate from Blast Nova's text, measured per state`.

**Done when:** the throw rate follows a cited law, is tested per state, and every measured case is green.


### Task 1: Measuring spot and proximity

**Lane:** GAME · **Needs user:** only if the position needs new poorchlight reverse-engineering · **Depends on:** —
**Skills:** tli-game, bing-ab-test
**Files:** Modify `.claude/skills/tli-game/combat.mjs` (log position), `.claude/skills/bing-ab-test/SKILL.md` (position
check) · Test: `packages/dmg/test/bing1/import.test.ts` (proximity case) · Doc: `docs/mechanics.md#bing-ab-2026-10-10`,
`packages/dmg/src/bingDiagnose.ts` `UNVERIFIED` (`proximity`)

**Why:** the baseline moved 480 → 433B between two spots; `proximity` (Solar Ring makes every proximity line live under
Firepower Coverage) is worth ÷1.61 on this build. Every later A/B inherits the spot.

- [ ] **Step 1 — Find a position read.** Read `../poorchlight/docs/MEMORY_LAYOUT.md` and `tli_dump/src/combat.rs`
  for the player's world position (and the dummy's). Run `tli_dump --combat-json` once and look for it.
- [ ] **Step 2a — If readable:** add `pos` (and `dummyDist` when the dummy's position is readable) to the JSON line
  `combat.mjs` appends; add to the bing-ab-test protocol: "abort the A/B if `pos` differs by more than 0.5 units between
  any two windows". Commit.
- [ ] **Step 2b — If not readable:** record the ask "poorchlight: player/dummy world position read" under Waiting on
  the user; save a reference screenshot (`game.ps1 shot ../scratch/spot-ref.png`); report DONE_WITH_CONCERNS and stop
  (Step 3 needs positions).
- [ ] **Step 3 — Predict the proximity A/B:** list the proximity sources
  (`cd packages/dmg && npx tsx ../../.claude/skills/tli-game/sources.ts ../../data/bing1/scraped/my-build-2026-10-10.json "proximity|solar"`),
  then `predict.ts ... --label prox-off --drop "<their label regex>"`.
- [ ] **Step 4 — Measure** A (canonical spot) → B (a spot outside every proximity radius in the line texts) → A, two
  30s windows per state, per bing-ab-test.
- [ ] **Step 5 — Record:** within ±5% of the prediction → mechanics row confirmed, remove `proximity` from
  `UNVERIFIED`, add the case to "model ablations match" in `import.test.ts`. Outside → report the table; the model
  change becomes a new task in the ledger. `pnpm test && pnpm page`; commit.

**Done when:** `combat.mjs` logs position (or the ask is recorded) and the proximity A/B is a test case (or reported).

### Task 2: Obliterate timer rule (replace `OBLITERATE_TIMER_SCALE`)

**Lane:** GAME · **Needs user:** — · **Depends on:** Tasks 0, 1
**Skills:** bing-dps-model, bing-ab-test, tli-game
**Files:** Modify `packages/dmg/src/damageModel.ts:604-625` · Test: `packages/dmg/test/bing1/import.test.ts`
(gear-swap cases) · Doc: `docs/mechanics.md#bing-obliterate`

**Why:** the stated 0.5s timer behaves like 0.35s. Only enhanced uses inflict Deterioration, so live Deterioration
stacks read the enhanced-use rate directly, independent of damage. If Task 0 lowered the throw rate below 2/s, every
throw may clear the 0.5s timer and the scale may simply go — check that first. `docs/mechanics.md` carries three
versions of the enhanced-share formula (two stale); leave one.

- [ ] **Step 1 — Candidates.** Write each rule as enhanced share s(T) of attack period T: (a) today,
  `min(1, T / (0.5 × 0.70))`; (b) the timer restarts on consumption and the next use after 0.5s is enhanced:
  `T / (ceil(0.5 / T) × T)`; (c) (b) with T on the 1/30s logic-frame grid; (d) the timer runs from the previous
  enhancement, uses on the 0.325s tick grid; (e) any line in the build that speeds the timer (`sources.ts ... "obliterate"`);
  (f) the timer runs on the **wall clock** while throws run on game time (game speed 0.7–0.9 × 0.5s ≈ 0.40s — the
  `speed` field of each measurement row; only runs at different speeds separate it from a fixed cap).
- [ ] **Step 2 — Screen offline.** For each candidate (a local, uncommitted switch in `cycleDps`) compute the model for
  the baseline (467.3B) and the five gear swaps in `import.test.ts` (72.3 / 80.7 / 102.7 / 82.6 / 221.4B). Drop every
  candidate more than 5% off on any.
- [ ] **Step 3 — Predict** live Deterioration stacks and DPS for each survivor at three weapons spanning attack rate
  (the equipped one, blank Destroyer Mallet, Sword +18% gear AS — confirm they are in the bag: `tli_dump --ui-json` → `gear.bag`, page 100), with `predict.ts --vs`
  variant files built like the test's `weapon()` helper (save under `../scratch/variants/`). Expose live stacks from
  `cycleDps` if it does not return them yet.
- [ ] **Step 4 — Measure** per weapon, A-B-A per bing-ab-test: `ops.mjs equip "<weapon>"`, two
  `combat.mjs 30 --label obl-<weapon> --buffs` windows (read `dps` and `stacks.Deterioration`), `ops.mjs gear-restore`.
- [ ] **Step 5 — Decide:** keep the candidate whose stacks match all three weapons within ±10% and DPS within ±5%.
  None → report the table, keep 0.70, add the data to the mechanics row as "open".
- [ ] **Step 6 — Record:** the rule replaces the constant; per-weapon stack and DPS cases join the gear-swap test;
  mechanics row rewritten with the rule and confidence. `pnpm test && pnpm page`; commit
  `fix(dmg): Obliterate enhanced-use rule from Deterioration stacks at three attack rates`.

**Done when:** `OBLITERATE_TIMER_SCALE` is gone (or the reason it stays is in the mechanics row), all tests green.

### Task 3: Firepower Coverage hits per throw (replace `FC_AUTO_HITS`)

**Lane:** GAME · **Needs user:** a Hero Trait swap (Firepower Coverage off, F4) for Step 4; approval if poorchlight
needs a new read · **Depends on:** Tasks 0, 1
**Skills:** bing-dps-model, bing-ab-test, tli-game
**Files:** Modify `packages/dmg/src/bingLedger.ts:101,207`, `packages/dmg/src/bingKit.ts:187` · Test:
`packages/dmg/test/bing1/import.test.ts` · Doc: `docs/mechanics.md#bing-hit-channels`

**Why:** 1.453 scales hits per bomb under Firepower Coverage relative to the July fold; it is fitted, not counted.

- [ ] **Step 1 — Can hits be counted?** Read `../poorchlight/tli_dump/src/combat.rs` and `docs/MEMORY_LAYOUT.md`:
  does `--combat-watch` emit per-hit events or per-frame totals? `--cast-watch` gives casts (throws).
- [ ] **Step 2 — Per-frame totals only:** hits that land in one frame merge, so counting needs a new read (projectile
  or hit entity). Record the ask "poorchlight: per-hit damage events or projectile count" under Waiting on the user,
  report BLOCKED, stop.
- [ ] **Step 3 — Per-hit events:** predict the model's hits per throw (composed `rotation.hits_per_bomb` ×
  projectile terms; print it with `sources.ts ... "hits_per_bomb"`), then measure hits ÷ throws over two 30s windows.
  Deterioration ticks fall on the 0.325s grid and must be excluded from the hit count.
- [ ] **Step 4 — Non-FC build** (needs user: Firepower Coverage off). HoA is then cast with R: post `game.ps1 key R`
  at the weapon's attack period in a background loop for the window; the same count gives the manual-cast fold.
- [ ] **Step 5 — Decide and record:** within ±5% → replace `FC_AUTO_HITS` with the counted expression (cite the
  label); all 15 A/Bs stay green. Else report the table. `pnpm test && pnpm page`; commit.

**Done when:** `FC_AUTO_HITS` is derived from counted hits, or the blocking read is recorded.

### Task 4: Projectile channel held-out A/B (q = 0.31, k = 0.28)

**Lane:** GAME · **Needs user:** — · **Depends on:** Tasks 0, 1
**Skills:** bing-ab-test, tli-game, bing-dps-model
**Files:** Test: `packages/dmg/test/bing1/import.test.ts` ("model ablations match") · Modify (only on refit):
`packages/dmg/src/bingLedger.ts:89` · Doc: `docs/mechanics.md#bing-hit-channels`, `#bing-proj-speed`

**Why:** q and k were fitted jointly to exactly two A/Bs (Precise Projectiles ÷1.320, Slow Projectile ÷1.202); a third,
independent A/B is the first real test of them.

- [ ] **Step 1 — Pick the A/B:** `sources.ts ... "proj_added|proj_base"`; choose a source that changes projectile
  count but not speed and can be removed with `ops.mjs unequip` or `aura`.
- [ ] **Step 2 — Predict** with today's q, k: `predict.ts ... --label proj-count-off --drop "<regex>"`.
- [ ] **Step 3 — Measure** A-B-A, two 30s windows per state.
- [ ] **Step 4 — Decide:** within ±5% → mechanics rows say "fitted on two A/Bs, held-out A/B confirmed (label)".
  Outside → refit q and k by least squares on the three A/Bs; every `import.test.ts` case must stay green.
- [ ] **Step 5 — Record** the case `[/<regex>/, <measured>]` in "model ablations match"; `pnpm test && pnpm page`; commit.

**Done when:** the held-out case is in the test and the rows state what q and k rest on.

### Task 5: Gear "+X% Projectile Speed" lines feed projectile speed

**Lane:** OFFLINE · **Needs user:** — · **Depends on:** —
**Skills:** bing-dps-model
**Files:** Modify `packages/dmg/src/bingAffixMap.ts` · Test: `packages/dmg/test/bing1/affix-map.test.ts` · Doc:
`docs/mechanics.md#bing-proj-speed`

**Why:** speed already drives Ember hits (`speed^k`), but gear speed lines are classified as geometry no-ops.

- [ ] **Step 1:** find today's handling: `grep -n "Projectile Speed" packages/dmg/src/bingAffixMap.ts`, and the
  units `bombRotation` reads (`rotation.proj_speed_inc_pct`, `proj_speed_more_pct` in `damageModel.ts`).
- [ ] **Step 2 — Failing test** (match the units found in Step 1):

```ts
test("projectile speed lines feed the Ember hit count", () => {
  expect(affixEdits("+20% Projectile Speed", "r")).toEqual({ kind: "mapped", edits: [["add", "rotation.proj_speed_inc_pct", 20]] });
  expect(affixEdits("+10% additional Projectile Speed", "r")).toEqual({ kind: "mapped", edits: [["add", "rotation.proj_speed_more_pct", 10]] });
});
```

- [ ] **Step 3:** run `cd packages/dmg && npx vitest run test/bing1/affix-map.test.ts` — FAIL.
- [ ] **Step 4:** add the mechanics row text first, then the two RULES entries.
- [ ] **Step 5:** run the test — PASS; `pnpm test` (if the library-unknowns snapshot changes, it may only lose
  projectile-speed lines); `pnpm page`; commit `fix(dmg): gear projectile speed lines feed Ember hits`.

**Done when:** both mappings are tested and every other test is unchanged.

### Task 6: Upheaval explosion share (replace `EXPLOSION_SHARE`)

**Lane:** GAME · **Needs user:** yes — a second Upheaval support with a different explosion roll or tier in the bag ·
**Depends on:** Task 1
**Skills:** bing-ab-test, tli-game
**Files:** Modify `packages/dmg/src/bingLedger.ts:74` · Test: `packages/dmg/test/bing1/import.test.ts` · Doc:
`docs/mechanics.md#bing-hit-channels`

**Why:** 0.044 is fitted from one A/B (Upheaval off ÷1.217 = +20% × (1 + 0.32 × share)); a second roll separates the
explosion line's scope from the flat +20%.

- [ ] **Step 1 — Predict:** with the second gem's roll r₂ (and its other line, if the tier changes it):
  `predict.ts ... --label uph-r2 --set additional.upheaval_explosion=<r₂ × 0.044>`.
- [ ] **Step 2 — Swap:** the two gems share a name, so after `ops.mjs unequip "Hammer of Ash" Upheaval` and
  `ops.mjs install "Hammer of Ash" Upheaval --slot N --socket S`, confirm the installed gem's `ItemId` in `tli_dump --ui-json` (the socket entry).
- [ ] **Step 3 — Measure** A-B-A, two 30s windows per state.
- [ ] **Step 4 — Decide and record:** solve the share from both A/Bs; the share is understood when one value fits both
  within noise. Replace the constant's fit note with both labels; `pnpm test && pnpm page`; commit.

**Done when:** the share rests on two A/Bs (or the second gem is recorded as Waiting on the user).

### Task 7: Cooldown-skill uptime from mechanics (Bull's Rage first)

**Lane:** OFFLINE, GAME only if the logged data is insufficient · **Needs user:** — · **Depends on:** —
**Skills:** bing-dps-model, tlidb-lookup, bing-ab-test (only for Step 5)
**Files:** Modify `packages/dmg/src/bingKit.ts:156-158`, `packages/dmg/src/bingAffixMap.ts` (`IRRELEVANT` "Recovery",
"Cooldown|Duration"), `packages/dmg/src/bingDiagnose.ts` (`UNVERIFIED` `bulls-rage` text) · Test:
`packages/dmg/test/bing1/import.test.ts` (remove the `bulls_rage *= 0.58 / 0.75` tweak from the Flame Core case once
the model derives it), `packages/dmg/test/bing1/affix-map.test.ts` · Doc: `docs/mechanics.md#bing-sentry-curse`

**Why:** 0.75 (0.58 without Flame Core) are measured uptimes typed in as constants, and Timid, Entangled Pain and
Fixate are assumed at full uptime. Cooldown math alone gives Bull's Rage ~95–100% (Activation Medium's +20–25%
cooldown recovery and duration, the build's +10% cooldown recovery), not the measured 75%, so the trigger condition
("upon gaining Demolisher Charge. Interval: 0.1s") likely sets it. Today `IRRELEVANT` files every cooldown-recovery
and duration line as utility, and `bingKit` drops the supports socketed on these skills (Extended Duration, Cooldown
Reduction, Well-Fought Battle…) without emitting a line; `bingKit.ts:156` and `UNVERIFIED` still say "full uptime".
A build with another Demolisher
cadence gets the wrong value.

- [ ] **Step 1:** collect `uptime["Bull's Rage"]` with each row's state from `../scratch/measurements.jsonl` (rows with
  `gameS > 0`; labels name the state).
- [ ] **Step 2:** look up Bull's Rage (Euphoria duration, cooldown) and Activation Medium's trigger rule with
  tlidb-lookup; write uptime as a function of the trigger cadence (Demolisher consumption: every Sentry use with
  Flame Core, the restoration rhythm without).
- [ ] **Step 3 — Failing test:** derived uptime within ±0.05 of 0.75 (base) and 0.58 (Flame Core off), and 0 under
  "Unable to trigger Empower Skills" (existing 1T test).
- [ ] **Step 4:** implement in `bingKit.ts`; drop the tweak from the Flame Core case; `pnpm test`.
- [ ] **Step 5 — Only if Step 1's data cannot pin the rule:** GAME, `combat.mjs 30 --buffs` at base and Flame Core
  off (A-B-A).
- [ ] **Step 6:** "Cooldown Recovery Speed" lines are `IRRELEVANT` ("utility") in `bingAffixMap.ts` today; with a
  derived uptime they feed it — map them (failing `affix-map.test.ts` case first) and check `diagnose` on every
  scraped build.
- [ ] **Step 7:** mechanics row; `pnpm page`; commit.

**Done when:** no Bull's Rage uptime constant is left, cooldown lines feed it, and the Flame Core case passes without
the tweak.

### Task 8: Demolisher empower multiplier (M = 3.65)

**Lane:** GAME · **Needs user:** maybe — a Demolisher Charge restoration-speed source if the build has none to
toggle · **Depends on:** Tasks 0, 1, 7
**Skills:** bing-ab-test, tli-game, bing-dps-model
**Files:** Modify `packages/dmg/src/bingLedger.ts:90` · Test: `packages/dmg/test/bing1/import.test.ts` · Doc:
`docs/mechanics.md` (the row citing `demolisher_empower_mult`)

**Why:** M comes from the July calibration. With Flame Core off, restoration speed is the only charge source, so a
restoration-speed A/B moves the empowered share and isolates M.

- [ ] **Step 1:** `sources.ts ... "demolisher_resto"`; pick a source removable with `ops.mjs`.
- [ ] **Step 2 — Predict:** `predict.ts ... --label resto-off-fcoff --both "skill:Flame Core" --drop "<resto regex>"`.
- [ ] **Step 3 — Measure:** `ops.mjs unequip "Flame Core"`, then A-B-A on the restoration source; `restore` puts back
  only the last item, so re-install the earlier one by name and confirm the sockets' `ItemId`s in `tli_dump --ui-json`.
- [ ] **Step 4 — Decide and record:** solve M from the measured ratio; within ±5% of 3.65 → row says confirmed (label);
  else replace M and keep every test green. `pnpm test && pnpm page`; commit.

**Done when:** M rests on a restoration-speed A/B.

### Task 9: Second calibration build

**Lane:** GAME · **Needs user:** yes — a loadout materially different from DeafwaveB's (weapon, supports or traits)
set up at the lv85 dummy: the July gear if kept, or another character · **Depends on:** Task 1
**Skills:** tli-game, bing-ab-test, bing-dps-model
**Files:** Create `data/bing1/scraped/<slug>.json`, `packages/dmg/test/bing1/calibration-<slug>.test.ts`

**Why:** a fit on one build is not a model.

- [ ] **Step 1:** with the build page open, `node scripts/scrape_build.mjs <slug> --stated "<what the user said>"`.
- [ ] **Step 2 — Predict:** the baseline (`predict.ts ... --vs` the same file prints A) and three A/Bs on the build's
  largest removable sources (`pnpm bing diagnose data/bing1/scraped/<slug>.json --season ss13`).
- [ ] **Step 3 — Measure:** baseline three 30s windows; each A/B A-B-A.
- [ ] **Step 4 — Record:** the new test mirrors `import.test.ts`'s "model matches" (absolute ±5%) and "ablations"
  (ratios ±5%) tests.
- [ ] **Step 5:** off by more than 5% → do not refit any constant to this build alone; report which sources diverge
  (diagnose ablations) and add each as a new ledger task. Commit.

**Done when:** the second build's baseline and three A/Bs are test cases.

### Task 10: Third calibration build (a Pro Build)

**Lane:** GAME · **Needs user:** yes — how 「寒山寺宾一5000火 1w亿」 is played (manual Ice Bond? positioning?),
and a Pro Build re-created on a character · **Depends on:** Task 9
**Skills:** tli-game, bing-ab-test, bing-dps-model
**Files:** Create `packages/dmg/test/bing1/calibration-<slug>.test.ts` · Doc: `docs/mechanics.md` (play-style rows)

- [ ] **Step 1:** record the user's answers as mechanics rows (confidence "reported") before modelling them.
- [ ] **Step 2–5:** as Task 9 Steps 1–5 with this build. The Pro-only `UNVERIFIED` assumptions it carries (skill
  levels, tick grid, lucky, corruption, low-life, profane, …) are the A/B candidates; each confirmed one leaves
  `UNVERIFIED` in `bingDiagnose.ts`.

**Done when:** the Pro build's baseline and A/Bs are test cases, and the assumptions it settled are out of `UNVERIFIED`.

### Task 11: Blank Mallet vs blank Claymore (+11.6% measured, +4% model)

**Lane:** OFFLINE, then GAME · **Needs user:** maybe — log out/in with each weapon equipped (snapshot bug) ·
**Depends on:** Tasks 0, 1
**Skills:** tlidb-lookup, bing-dps-model, bing-ab-test, tli-game
**Files:** Test: `packages/dmg/test/bing1/import.test.ts` (gear-swap `weapon()` cases) · Doc: `docs/mechanics.md`

- [ ] **Step 0:** re-run the comparison under Task 0's throw-rate law — if throws ignore weapon base APS, the two
  blanks' base APS no longer enters the throw rate and the gap may already be explained.
- [ ] **Step 1 — Inputs first:** look up Destroyer Mallet and Black Pass Claymore with tlidb-lookup (implicits, base
  APS, crit rating, required level). The test's `weapon()` gives both the same `1.5 Attack Speed` and
  `500 Critical Strike Rating`; if the real bases differ, fix the inputs and re-check the gap (72.3 vs 80.7B).
- [ ] **Step 2:** gap still > 5% → hypotheses: hammer- vs sword-conditional lines (`sources.ts ... "Hammer|Sword|Mace"`),
  item level, local vs global phys. Predict each.
- [ ] **Step 3 — Needs user:** log out/in with the Mallet equipped; then Mallet → Claymore → Mallet, two 30s windows
  each (bing-ab-test).
- [ ] **Step 4 — Record:** corrected inputs, any new mechanic (row first), the re-measured values in the gear-swap
  cases. `pnpm test && pnpm page`; commit.

**Done when:** both blank weapons are within ±5% with the reason written down.

### Task 12: Hasten

**Lane:** OFFLINE · **Needs user:** — · **Depends on:** —
**Skills:** tlidb-lookup, bing-dps-model
**Files:** Modify `packages/dmg/src/bingAffixMap.ts` · Test: `packages/dmg/test/bing1/affix-map.test.ts`,
`packages/dmg/test/bing1/import.test.ts` (gear swaps) · Doc: `docs/mechanics.md`

**Why:** Boots of Devastation ("Has Hasten") measured 676.9B vs model 654.2B; fitting needs ~+3.5% attack speed.
"Has Hasten" is also in the library-unknowns snapshot.

- [ ] **Step 1:** tlidb-lookup "Hasten" — effect text and values.
- [ ] **Step 2:** reproduce the 654.2B model number (`git log -S"676.9" --oneline` finds the commit that measured it).
- [ ] **Step 3 — Failing tests:** `affixEdits("Has Hasten", "r")` maps to the looked-up edits; a Boots of
  Devastation gear-swap case at 676.9B within ±5%.
- [ ] **Step 4:** mechanics row, then the rule; `pnpm test` (the library snapshot loses "Has Hasten"); `pnpm page`; commit.

**Done when:** Hasten is mapped from its tlidb text and the boots case is a test.

### Task 13: Weapon-handedness requirements

**Lane:** OFFLINE · **Needs user:** — · **Depends on:** —
**Skills:** bing-dps-model
**Files:** Modify `packages/dmg/src/bingAffixMap.ts:119,150` (stop stripping the clause), `packages/dmg/src/bingImport.ts`
(copy `requires` onto the Source; main-hand weapon `provides`) · Test: `packages/dmg/test/bing1/affix-map.test.ts`,
`packages/dmg/test/bing1/import.test.ts` · Doc: `docs/mechanics.md#bing-affix-map`

**Interfaces:**
- Produces: `AffixMapping` mapped variant gains `requires?: string[]`; lines ending "when holding a Two-Handed Weapon"
  and "… for Two-Handed Weapons" → `requires: ["two_handed"]`; "when holding a One-Handed Weapon" →
  `requires: ["one_handed"]` (today irrelevant). The main-hand weapon source `provides` `two_handed` or `one_handed`
  from its base item; `effective()` (`bingLedger.ts:340`) already drops unmet requirements.

- [ ] **Step 1 — Failing tests:**

```ts
test("handedness clauses become requirements", () => {
  const plain = affixEdits("+40% Attack Critical Strike Rating", "r");
  expect(affixEdits("+40% Attack Critical Strike Rating when holding a Two-Handed Weapon", "r"))
    .toEqual({ ...plain, requires: ["two_handed"] });
  expect(affixEdits("+40% Attack Critical Strike Rating when holding a One-Handed Weapon", "r"))
    .toEqual({ ...plain, requires: ["one_handed"] });
});
```

  plus, in `import.test.ts`: the user's build imports unchanged (467.3B ±2%), and with its main hand swapped to a
  one-handed hammer base no two-handed-only source stays in `effective(r.sources)`.
- [ ] **Step 2:** run — FAIL. **Step 3:** mechanics row, then the code. **Step 4:** `pnpm test` — every existing
  case unchanged; `pnpm page`; commit `fix(dmg): handedness clauses are requirements, not assumptions`.

**Done when:** 1H/2H lines follow the equipped weapon and all measured cases are unchanged.

### Task 14: One-handed weapon A/Bs

**Lane:** GAME · **Needs user:** — · **Depends on:** Tasks 0, 1, 13
**Skills:** bing-ab-test, tli-game, tlidb-lookup
**Files:** Test: `packages/dmg/test/bing1/import.test.ts` (gear swaps) · Doc: `docs/mechanics.md`

- [ ] **Step 1:** tlidb-lookup Hammer of Ash's weapon restrictions (can it use an axe, a one-handed hammer?).
- [ ] **Step 2 — Predict** each with a `--vs` variant (stats from `tli_dump --ui-json` → `gear.bag` affixes): Sierra Forge Light
  Hammer main hand (off-hand empty); both Light Hammers (dual wield — the model has no off-hand rule yet, so record
  the prediction as "no rule" and treat the measurement as discovery); Hollow Rift Axe if allowed.
- [ ] **Step 3 — Measure** each A-B-A (`ops.mjs equip`, `gear-restore`).
- [ ] **Step 4 — Record:** single-1H cases as tests within ±5%; dual wield → a mechanics row with the measured
  value and a new ledger task for the off-hand rule. `pnpm test && pnpm page`; commit.

**Done when:** a one-handed main hand is a tested gear swap.

### Task 15: Hammer of Ash levels above 21

**Lane:** OFFLINE · **Needs user:** optional — a +skill-level item for an in-game check · **Depends on:** —
**Skills:** tlidb-lookup, bing-dps-model
**Files:** Modify `packages/dmg/src/rank.ts` (`skillLevelAdditionalPct`, HoA path), `packages/dmg/src/bingDiagnose.ts`
(`UNVERIFIED` `skill-levels`) · Test: `packages/dmg/test/bing1/import.test.ts` · Doc: `docs/mechanics.md#skill-levels`

**Why:** every level above 21 is assumed ×1.10 (to 30) / ×1.08; the 40T build leans on it ÷2.36.

- [ ] **Step 1:** fetch Hammer of Ash's per-level table (weapon damage % per level, past 21) with tlidb-lookup.
- [ ] **Step 2 — Failing test:** the model's DPS ratio at HoA L25 vs L21 on the user's build equals the table's
  damage ratio (±0.5%).
- [ ] **Step 3:** mechanics row, then the table replaces the heuristic for HoA; remove `skill-levels` from `UNVERIFIED`.
- [ ] **Step 4:** `pnpm test && pnpm page`; commit.

**Done when:** HoA levels come from the table.

### Task 16: Scrape at least 10 more Pro Builds

**Lane:** GAME · **Needs user:** — · **Depends on:** —
**Skills:** tli-game
**Files:** Create `data/bing1/scraped/<slug>.json` ×10+

- [ ] **Step 1:** open Hammer of Ash Pro Builds in game (tli-game navigation), spread across stated DPS
  (≤1B, ~10B, ~100B, ~1T, 10T+).
- [ ] **Step 2:** each: `node scripts/scrape_build.mjs <slug> --stated "<stated DPS and what it measured>"`.
- [ ] **Step 3:** `pnpm bing diagnose data/bing1/scraped/*.json --season ss13` — paste the UNMODELED lines per build
  into the report file.
- [ ] **Step 4:** `pnpm test` unchanged; commit `data: 10 more scraped HoA Pro Builds`.

**Done when:** ≥10 new scraped builds are committed and their unknowns are listed in the report.

### Task 17: Scraped-build unknowns to zero

**Lane:** OFFLINE · **Needs user:** — · **Depends on:** Tasks 7, 16
**Skills:** bing-dps-model, tlidb-lookup
**Files:** Modify `packages/dmg/src/bingAffixMap.ts` (or `bingKit.ts` / `bingImport.ts` for structural lines) · Test:
`packages/dmg/test/bing1/import.test.ts`, `packages/dmg/test/bing1/affix-map.test.ts` · Doc: `docs/mechanics.md`

Known today: `+1 Max Charges` (40T, tree:lich), `+30% Bond Gaining Speed` and `Converts 50% of Lightning Damage to
Fire Damage` (1T), plus Task 16's list. Two dry runs (2026-10-10, unverified — check each) found:
- `+1 Max Charges` (both builds, the Lich node `+8% Cooldown Recovery Speed / +1 Max Charges`): charges are stored uses
  of cooldown skills, one back per cooldown; with auto-cast supports re-trying every 0.1s the extra charge likely never
  accumulates — but that holds only once Task 7 derives cooldown cadence. Until then it stays **unknown**. (An Empower
  support that scales per charge, Mass Effect, would make it matter.)
- `+30% Bond Gaining Speed` (the node `+12% Minion Damage / +30% Bond Gaining Speed`): tlidb's Bond page — every stack
  buffs minions — irrelevant (minion); add `Bond Gaining Speed|Max Bond Stacks|obtain Bond` to the minion entry (these
  phrases leave Ice Bond alone). It also clears the library's `+# Max Bond Stacks` and `Can obtain Bond`.
- The conversion maps to `["conv", "lightning", "fire", 50]` via one anchored rule
  `Converts N% of (Physical|Lightning|Cold|Fire) Damage to (Lightning|Cold|Fire|Erosion) Damage` ("…Damage taken to…"
  defensive lines stay out); ×1.0000 on all three builds. `scale()` in `bingImport.ts` does not scale `conv` edits by
  node points — safe for 1-point nodes only; assert or fix it.

- [ ] **Step 1 — Failing test** (replaces the per-build unknown pins in the 40T and 1T tests; a line that honestly
  stays unknown — `+1 Max Charges` until Task 7 lands — goes in an explicit `LEFT` list with its reason, so the suite
  stays green):

```ts
// lines that honestly stay unknown, each with the task that unblocks it
const LEFT = ["+1 Max Charges"];   // Task 7: cooldown cadence decides whether the extra charge ever accumulates
test("every scraped build: no unknown lines", () => {
  for (const f of fs.readdirSync(fromRoot("data/bing1/scraped"))) {
    const r = loadForImport(fromRoot(`data/bing1/scraped/${f}`));
    expect(r.lines.filter(l => l.kind === "unknown" && !LEFT.includes(l.text)).map(l => `${f}: ${l.text}`)).toEqual([]);
  }
}, 120_000);
```

  (`loadForImport` from `../../src/bingDiagnose.js`.)
- [ ] **Step 2:** per line, the bing-dps-model unknown-line procedure (evidence → row → rule). A line whose effect
  depends on an unmodeled mechanic is not "irrelevant": model it or leave it failing and report it.
- [ ] **Step 3:** `pnpm test && pnpm page`; commit per mechanic.

**Done when:** the test passes and `LEFT` holds only lines whose blocker is a named task.

### Task 18: Library unknowns — the irrelevant batch

**Lane:** OFFLINE · **Needs user:** — · **Depends on:** —
**Skills:** bing-dps-model, tlidb-lookup
**Files:** Modify `packages/dmg/src/bingAffixMap.ts` (`IRRELEVANT`) · Test: `packages/dmg/test/bing1/affix-map.test.ts`
and its snapshot

The library-unknowns snapshot (`test/bing1/__snapshots__/affix-map.test.ts.snap`) pins 32 lines. This batch takes the
ones that cannot add Bing boss DPS: Barrier lines, Command per second, Beams, Max/Min Channeled Stacks, "additional
damage when channeling", Taunt, Shadow Quantity, Ill Omen, "additional damage dealt by Nearby enemies".

- [ ] **Step 1:** per line, confirm with tlidb-lookup what it does; each `IRRELEVANT` entry's reason names the tag or
  kind the Bing build lacks (HoA tags: `bingAffixMap.ts` `HOA_LEVEL` comment). Bond lines are minion-only (Task 17's
  evidence; take them here if Task 17 hasn't). Unsure (Parabolic Projectile Split) → leave for Task 19.
- [ ] **Step 2:** a direct test per entry (`expect(affixEdits("<T1 text>", "r").kind).toBe("irrelevant")`).
- [ ] **Step 3:** `npx vitest run test/bing1/affix-map.test.ts -u`, then check `git diff` on the snapshot removes
  exactly this batch. `pnpm test`; commit.

**Done when:** the snapshot lost exactly this batch, each with a reasoned entry.

### Task 19: Library unknowns — the damage-shaped lines

**Lane:** OFFLINE · **Needs user:** — · **Depends on:** Tasks 12, 18
**Skills:** bing-dps-model, tlidb-lookup
**Files:** Modify `packages/dmg/src/bingAffixMap.ts`, `packages/dmg/src/bingLedger.ts` (`compose`, for `aux.aura_effect`)
· Test: `packages/dmg/test/bing1/affix-map.test.ts` · Doc: `docs/mechanics.md#bing-affix-map`

Remaining snapshot lines: `" # "` (a parse artefact — find its source line), `+#% All Stats`, `+#% Aura Effect`
(`UNMODELED` until `compose` reads `aux.aura_effect`), crit rating vs Traumatized, the two-line
`+#% Gear Attack Speed / -#% additional Attack Damage`, `+#% damage per # stats`, `Adds # - # Elemental Damage to the
gear`, the five gain-as/conversion lines, `Gains Attack Aggression when casting an Attack Skill`, the three
Infiltration lines, anything Task 18 left.

- [ ] **Step 1:** per line, the bing-dps-model unknown-line procedure (failing test → row → rule).
- [ ] **Step 2:** the last step replaces `toMatchSnapshot()` with `toEqual([])` and deletes the snapshot entry.
- [ ] **Step 3:** `pnpm test && pnpm page`; commit per mechanic.

**Done when:** every library affix is mapped or reasoned-irrelevant and the test asserts `[]`.

### Task 20: Catalog coverage test (talents, slates, pedigrees, memories, prisms, pacts, kismets, skills, supports)

**Lane:** OFFLINE · **Needs user:** — · **Depends on:** —
**Skills:** bing-dps-model, tli-build
**Files:** Create `packages/dmg/test/bing1/catalog-coverage.test.ts`

**Why:** the optimizer's search space is every node and line in these catalogs; each must be mapped or explicitly
irrelevant before the optimizer can price it.

- [ ] **Step 1:** find the vendored SS13 catalog `bingImport.ts` resolves GUIDs through (`resolveGuids`,
  `catalogEntries`) and how the importer turns each group's entry into text (tree nodes × points, memory template +
  max roll, slate lines, prism affixes, pact board nodes, kismets). Skills and supports go through `bingKit.ts` by
  name: a skill or support it does not know must come out as an unknown, not be skipped silently (an Empower
  support that scales per charge, Mass Effect, is the known case).
- [ ] **Step 2:** the test enumerates every entry per group, classifies it the way the importer does, and pins the
  unknown set per group with `toMatchSnapshot()` (same pattern as `affix-map.test.ts`).
- [ ] **Step 3:** `pnpm test`; commit with the per-group unknown counts in the message.

**Done when:** the test exists and its snapshot shows the per-group unknowns.

### Task 21: Catalog unknowns to zero

**Lane:** OFFLINE · **Needs user:** — · **Depends on:** Task 20
**Skills:** bing-dps-model, tlidb-lookup
**Files:** Modify `packages/dmg/src/bingAffixMap.ts`, `bingKit.ts`, `bingImport.ts` as needed · Test: Task 20's file

- [ ] **Step 1:** per group (the controller may batch a group into one dispatch), the unknown-line procedure.
- [ ] **Step 2:** finish with `toEqual([])` per group, as Task 19. `pnpm test && pnpm page`; commit per mechanic.

**Done when:** every catalog group asserts no unknowns.

### Task 22: Talent tree graph

**Lane:** OFFLINE · **Needs user:** — · **Depends on:** —
**Skills:** bing-dps-model, tli-build
**Files:** Create `packages/dmg/src/bingTalents.ts`, `packages/dmg/test/bing1/talents.test.ts`

**Interfaces:**
- Consumes: the importer's tree handling (`fillTreesFromNative`, Inverse Image / prism reflection in `bingImport.ts`) —
  reuse it, don't fork it. Node id `<tree:2><col:2><row:2>00`; columns are point thresholds 0…18 → 1…7.
- Produces: `talentGraph(treeId: string): TalentGraph` (nodes with column, row, max points, column threshold,
  prerequisites); `violations(alloc: Record<string, number>, g: TalentGraph): string[]`;
  `talentSources(alloc, g): Source[]` (the ledger sources an allocation yields, identical to the importer's).

- [ ] **Step 1 — Failing tests:** DeafwaveB's and the 40T build's allocations have no violations; taking the points out
  of a gating column makes the deeper nodes violate; `talentSources` of DeafwaveB's allocation equals the importer's
  `tree:` sources.
- [ ] **Step 2:** implement; `pnpm test`; commit.

**Done when:** an allocation can be checked and priced without a planner export.

### Task 23: Joint optimizer

**Lane:** OFFLINE · **Needs user:** — · **Depends on:** Tasks 17, 19, 21, 22
**Skills:** bing-dps-model
**Files:** Modify `packages/dmg/src/bingProgression.ts`, `packages/dmg/src/cli.ts` (`bing search`) · Test:
`packages/dmg/test/bing1/progression.test.ts`

**Interfaces:**
- Consumes: `walk(zero, start, pool, season, opts: WalkOptions)` (`bingProgression.ts:49`), `SLOT_CAPACITY`, Task 22's
  `violations` / `talentSources`, ETOR prices (`data/etor/history_1501.json`, `#bing-prices`).
- Produces: `search(zero, start, pool, season, opts: WalkOptions & { beam: number; talents?: TalentGraph }): PathStep[]`
  — beam search over gear lines, slates/pedigree and talent-point moves that keep `violations` empty, priced per FE;
  CLI `pnpm bing search <build.json> --budget <FE> --beam 8`.

- [ ] **Step 1 — Failing tests:** `beam: 1` reproduces `walk` exactly on the existing progression fixtures; no step
  lowers DPS; capacities and talent legality hold at every step; `beam: 4` ends ≥ `beam: 1` on DeafwaveB's pool.
- [ ] **Step 2:** implement; `pnpm test && pnpm page`; commit.

**Done when:** `pnpm bing search` returns a priced, legal path and the tests hold.

### Task 24: Validate the optimizer's picks in game

**Lane:** GAME · **Needs user:** yes — purchases for picks not in the bag · **Depends on:** Task 23
**Skills:** bing-ab-test, tli-game
**Files:** Test: `packages/dmg/test/bing1/import.test.ts` (or a new `optimizer-validation.test.ts`)

- [ ] **Step 1:** `pnpm bing search data/bing1/scraped/my-build-2026-10-10.json --budget <FE>`; take the top 3 picks.
- [ ] **Step 2:** picks doable with bag items or `ops.mjs` (supports, auras, bag gear): predict → measure → record.
  Purchases → Waiting on the user with the exact item and expected gain.
- [ ] **Step 3:** a pick off by more than 5% is a model bug: new ledger task. Commit.

**Done when:** every doable top-3 pick is a measured test case.

### Task 25: Rehan / Spectral Slash model revalidation

**Lane:** GAME · **Needs user:** yes — the Rehan character at the dummy · **Depends on:** — · priority: low
**Skills:** tli-game, bing-ab-test (protocol only; `predict.ts` is Bing-only — use `pnpm rank` ablations for
predictions)
**Files:** Test: `packages/dmg/test/e2e.test.ts` or a new `rehan-calibration.test.ts` · Doc: `docs/mechanics.md`

- [ ] **Step 1:** predictions from `pnpm rank` for the baseline and three supports.
- [ ] **Step 2:** measure (protocol as bing-ab-test); record as tests; commit.

**Done when:** the Rehan model has measured baseline and A/B cases.

### Task 26: Close-out

**Lane:** OFFLINE · **Needs user:** — · **Depends on:** all runnable tasks
**Skills:** —
**Files:** Modify `docs/bing-dps-validation-handoff.md` (§1–§3), `packages/page/src/main.ts` (prose numbers)

- [ ] **Step 1:** `pnpm test && pnpm page`; refresh the page prose from `pnpm rank` (CLAUDE.md invariant 3). Fix
  `docs/mechanics.md` rows that quote superseded numbers (found 2026-10-10: `#bing-sentry-curse` says the Empower block
  is unmodeled and quotes 23.5B → 151.9B; `#bing-import` says the 40T build reads 130T — `diagnose` now says 222.40T;
  `#bing-dummy-loop` says Blink is castable but its confidence column says uncastable).
- [ ] **Step 2:** rewrite §1–§3 from the tests: constants replaced leave §2, discrepancies closed leave §3, new
  baselines in §1; list every task still waiting on the user.
- [ ] **Step 3:** `git fetch torchlight && git rebase torchlight/main && git push torchlight main`.

**Done when:** this document describes the tested state and main is pushed.
