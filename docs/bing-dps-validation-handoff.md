# Bing / Hammer of Ash — DPS model handoff and execution plan (2026-10-10, updated 2026-10-11 at pause)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to run §8 task by task. Steps use checkbox (`- [ ]`) syntax. **Read §0 first**
> (status at pause, run order, user grants), then §1–§7 once; each task card in §8 is self-contained for its
> implementer (`task-brief` extracts it). The rebuild cards P1/P2/R1/R2/R3 are in §8.R.

**Goal:** a DPS model trustworthy enough to drive a combinatorial optimizer — which gear upgrades to buy/craft,
which slates and pedigrees to chase, which talents to change — from a level-60 start to tens of trillions.

**Architecture:** every model change is argued from an in-game measurement on the training dummy (memory-read,
game-time DPS) with the model's prediction written first; each measurement lands in a vitest case and each mechanic
in `docs/mechanics.md`. Coverage work drives every line in the catalogs to mapped-or-irrelevant; the optimizer
extends `bingProgression.ts` once the model and coverage hold.

**Tech stack:** TypeScript + vitest (`packages/dmg`), Node tools in `.claude/skills/` (`tli-game`, `bing-ab-test`),
the Rust memory reader `../poorchlight/tli_dump` (elevated shell), the running Torchlight: Infinite client.

**Add-on:** `docs/external-sources-handoff.md`, tasks E1–E8: leads from third-party planners and 91tob, some
folded into Tasks 3, 6, 7, 8, 12 and 25 here. Read it before starting those tasks.

**Spec:** this document §1–§3 (state, fitted constants, discrepancies), `docs/mechanics.md` (the mechanics truth) and
the invariants in `CLAUDE.md`.

**Where to work:** `rehan_guide` on `main` (GitHub `deafwave/rehan-torchlight`, remote `torchlight`). The old
`rehan_guide_bing` worktree is detached at main and is removed once no session runs in it
(`git worktree remove ../rehan_guide_bing`). Memory reader: sibling repo `poorchlight` (`ChandlerFerry/poorchlight`).
Game control: `.claude/skills/tli-game` (read its SKILL.md first; Torchlight's PID changes on restart —
`tasklist | grep torchlight`).

---

## 0. Status at pause (2026-10-11) — read this first

**Paused by the user** (the game is in use by another agent; "I don't know when I'll next resume"). Resume rules:

- **Game testing is paused** until the user says resume. Before any GAME task: ask, then run the §7 preflight.
- **Run order changed** (user decision 2026-10-11): the per-constant tasks were replaced by a **first-principles
  rebuild** — the model is built from the game texts and the damage formula; every non-text quantity is measured
  **directly** with the per-hit read, never back-solved from total DPS. Cards P1, P2, R1, R2, R3 are in §8.R.
  P1, R1, R2 are done. **Next: R3** (GAME — needs resume) **or the OFFLINE tasks 5, 12, 13, 18, 20, 22** (runnable
  any time without the game).
- **User grants (2026-10-11):** agents may take off gear, unspec pactspirits, move slates, swap Hero Traits (swap
  back) and relog; reverse-engineering new poorchlight reads is approved (commit locally, **never push poorchlight**).
  **Not allowed:** switching to Rehan or any other character — **Task 25 is removed; focus purely on Bing1 until it
  is perfect.** Purchases (Trade House) stay the user's.
- **Second calibration build (Task 9):** re-spec DeafwaveB into a materially different loadout, measure, restore
  exactly (the user chose this over another character).
- **Pro-build play style (Task 10, user):** a skill or Hero Trait with an automation/activation (auto-cast) support
  or an automated trait is not pressed; one without is pressed by hand.
- **91tob** (`docs/91tob.md`) is a hint source only — the user does not trust it. A read-only cross-check
  (`.superpowers/sdd/bing-dps-validation-handoff/91tob-crosscheck.md`, local, git-ignored) listed candidates; R1
  confirmed two (Demolisher +215% applies to hits only; Shotgun falloff leaves explosions at 30%) and refuted two
  (monster armor at the dummy; a crit-only layer). Its Bing hero texts do not match the live EN game — never import
  them. The external-sources add-on (`docs/external-sources-handoff.md`) is another session's work.
- **Pushes:** nothing in this run has been pushed. `rehan_guide` main is ahead of `torchlight/main`; Task 26 does
  `git fetch torchlight && git rebase torchlight/main && git push torchlight main`. poorchlight `a6ef905`
  (`--hit-watch`) is local only.
- **SDD workspace** (git-ignored): `.superpowers/sdd/bing-dps-validation-handoff/` — `progress.md` (ledger with every
  ruling), `task-*-report.md`, `rebuild-tasks.md`, review packages. Raw data: `../scratch/predictions.jsonl`,
  `measurements.jsonl`, `watch/*.csv`, `r1/`, `r2/` (analysis scripts `top.py`, `an8.py`, `cases.mts`, `decomp.mts`).

**Run log (2026-10-10 → 11), subagent-driven on `main`, every task reviewed:**

| task | outcome | commits |
|---|---|---|
| 0 throw-rate law | law measured (5 states ±2.2%); model switch blocked then → landed in R2 | `661df70`, `efe83bf` |
| 1 spot / proximity | **deferred** — no position read existed (now approved → P2) | — |
| 2 Obliterate timer | `OBLITERATE_TIMER_SCALE` shown to be a throw-rate stand-in; stacks follow the law → removed in R2 | `e0f8397`, `607c3bf` |
| 3 FC hits per throw | per-frame totals can't count hits → per-hit read built (P1); `FC_AUTO_HITS` removed in R2 | `9adcd64` |
| 4 projectile held-out A/B | both-off ÷1.864 inconsistent with the 10-10 singles; same-session singles re-measured; q/k removed in R2 | `1ca9e7a`, `af586f8`, `961fcae` |
| P1 per-hit read | `tli_dump --hit-watch` + `combat.mjs --hits`; Σ per-hit = dummy total to 1e-10 | poorchlight `a6ef905`; `57f6f6f` |
| R1 per-hit damage | every hit type ±3%, ten per-hit A/Bs ±3% | `02ed2b4`, `a86ad10` |
| R2 counted hits | throw law in; five §2 constants + Bull's Rage uptimes removed | `a54afe2`, `fee0edd`, `b0ae837` |

`pnpm test`: **626 green** at `b0ae837` (45 files; the count includes another session's untracked `clientDps` test).

**Tooling learned this run:**
- The dummy count stops on its own → click **Recount**: `game.ps1 click 310 545` (doesn't move the character).
- `combat.mjs` keeps every run's CSV at `../scratch/watch/<label>.csv`; `--hits` adds `<label>-hits.csv` (one row per
  hit: frame, damage, kind, crit, skill, flags, volley index; kind 4 = Deterioration tick, flags 16 = empowered
  pummel, 15 = un-empowered pummel, 40 = explosion) and `hits`, `hitsPerS`, `hitTypes`, `hitSumRatio` to the
  measurement row. `--hits` runs two busy readers → sim speed drops to ~0.9×: use it for hit-structure reads (DPS
  per game-second is unaffected). The dummy must be the targeted health bar. The read's addresses break on a game
  patch.
- **Single 30s total-DPS windows scatter ±10–12%** (Kaleidoscope 8s turns, Bull's Rage, random 2- vs 4-bomb throws).
  Total-DPS A/Bs below ~÷1.3 are unreliable; **per-hit ratios at the top level are the instrument** (within 0.5%
  between brackets). Top level = hits within 8% of the hit type's max (Bull's Rage on, Kaleidoscope phys/erosion
  turn), crit and non-crit separately (`../scratch/r1/top.py`).
- `ops.mjs install` searches the picker by name: a gem you don't own (Multiple Projectiles) made the first result
  (Slow Projectile) get re-inserted before the name check aborted. Check ownership (`tli_dump --ui-json` → bag)
  before `install`. (Not yet fixed in `ops.mjs`.)
- `ops.mjs` waits for Torchlight to be the foreground window; with Discord in front it times out (the user must bring
  the game forward). A `| tail` pipe once masked an `ops` timeout and a chain measured base windows as an A/B — check
  exit codes.
- Subagents could not write `.md` report files into the SDD workspace (harness block) — have them write `.txt` or
  return the report in the reply.
- Python text-mode writes on Windows produced CRLF (`1ca9e7a`) — write with `newline=''`.

---

## 1. Where things stand

**Model structure (Firepower Coverage builds, `rotation.counted_hits`; `docs/mechanics.md#bing-per-hit`,
`#bing-hit-counts`)** — every term is a text or a direct per-hit / cast read:
- **Throw rate** = 1/s × (1 + Σ increased AS) × Π(1 + additional AS); weapon base APS, weapon-local "+X% gear Attack
  Speed" and skill-scoped AS (Steamroll) are excluded (Blast Nova text; Task 0). Period = round(30/rate) logic
  frames. User's build: 30/22 = **1.364 throws/s** (measured 1.342–1.386).
- **Bombs per throw** 2.5 (Blast Barrage "25% chance to +2"; measured 2.511).
- **Empowered bomb** = 1 **pummel** + (10–11 frames later) **Q = 7 explosions** in one frame (Q = Ember quantity
  1 + 2 HoA + 2 Blast Nova + 2 Iron Lion; measured 7.013 per bomb — that Q follows projectile quantity is *inferred*:
  no Multiple Projectiles gem to test). **Un-empowered bomb** = pummel only. Embers never hit as their own rows.
- **Empowered share**: HoA "gains Demolisher Charge once every 3 s" → n = ceil(3 × rate); Formation Breaker
  ("Interval 0.25s") with a Sentry → n = 1 (every bomb empowered at base). Flame Core off → every 5th throw (17 of
  85 measured).
- **Per hit**: Demolisher +215% additional **hit** damage on empowered hits only; Broken Sun +41% area on empowered
  hits; Shotgun falloff → explosions deal 30%; Upheaval's rolled +32% explosion line. Crit is rolled **once per
  bomb** (0.5705 model / 0.559 measured; ×3.24).
- **Deterioration**: one tick per stack every 9.75 frames, 4 ticks per stack (chance 0.98); tick k = 0.6 × (1 + Σ
  "+X% Deterioration Damage") × Π(more) × its own hit × (1 + 0.3(k−1)) = **1.446 × hit** on this build. The
  Deterioration lines are the tick's **own pool** (refutes the July "joins the hit's increased sum" rule — but see
  §3 #6). Ticks are ~89% of damage.
- **Obliterate**: every throw enhanced (period ≥ 0.6s > the stated 0.5s timer).
- **Bull's Rage**: 6s duration, 10s cooldown ÷ recovery (AM: Demolisher +18%, memory +10% now mapped) → 7.70s, cast
  at the next charge gain → uptime 0.774 base / 0.545 Flame Core off (cast-watch 0.767 / 0.545). Well-Fought Battle
  ×1.33 (11% × 3 stacks at L24). Blocked by "Unable to trigger Empower Skills" (Tyrant's).
- **Kaleidoscope**: rings turn in lockstep; Erosion/Physical turns reach the whole Obliterated hit, the Elemental
  turn only the fire-history half (×1.314 high ÷ elemental).
- **Skill levels**: "+1 to All Skills' Levels" raises auras, curses, Bull's Rage (auras read L21 per hit); HoA L21
  ×1.10 is *inferred* (tooltip "Level 20+1, 369%").
- Manual-throw rigs (the July bare rig, `blast-nova.test.ts`) keep the July fold (`hits_per_bomb` 0.8353,
  `demolisher_empower_mult` 3.65) — they were never read per hit.

**Measured cases** (`packages/dmg/test/bing1/import.test.ts`, `blast-nova.test.ts`; model at `b0ae837`):

| case | measured | model | Δ | status |
|---|---|---|---|---|
| per hit, top level non-crit: empowered pummel / explosion / un-empowered pummel | 1.964 / 0.780 / 0.4445B | 1.937 / 0.767 / 0.4361B | −1.4 / −1.7 / −1.9% | ±3% |
| per-hit A/Bs: Upheaval, PP, FC, Steamroll, Slow Proj, Fusion, Passivation, Weapon Amp, Erosion Amp, Cruelty; r2 SP off, both off | — | — | worst −1.7% | ±3% |
| baseline, R1 session's 18 base windows | 458.5B | 452.2B | −1.4% | ±2% (a post-hoc re-read of pre-R2 windows) |
| baseline 2026-10-10 | 467.3B | 452.2B | −3.2% | R8-pinned |
| Timid / Fusion / Passivation / Steamroll / Cruelty off | ÷1.414 / 1.192 / 1.622 / 1.405 / 1.507 | ÷1.400 / 1.208 / 1.640 / 1.425 / 1.4995 | ≤1.4% | ±2% |
| Upheaval off | ÷1.217 | ÷1.2168 | 0.0% | ±2% (flipped back) |
| held-out PP + SP off | ÷1.864 | ÷1.840 | −1.3% | ±5% (flipped back) |
| same-session SP off | ÷1.324 | ÷1.305 | −1.4% | ±5% |
| blank Mallet / Sword +18% gear AS | 72.3 / 82.6B | 71.3 / 80.4B | −1.4 / −2.6% | ±5% |
| Tyrant's Smoldering Hold | 221.4B (÷2.080) | 225.6B (÷2.005) | +1.9 / −3.6% | ±5% |
| Deterioration stacks maul / Mallet / Sword / Tyrant's | 41.93 / ×1.245 / ×1.258 / ×0.927 | 42.2 / ×1.222 / ×1.222 / ×0.917 | ≤2.8% | ±10% |
| **open — R8-pinned (model value asserted, MEASURED beside it)** | | | | |
| PP off 10-10 / same-session; SP off 10-10 (total DPS) | ÷1.320 / ÷1.245; ÷1.202 | ÷1.410; ÷1.305 | +6.8…+13% | §3 #1 |
| Flame Core off | ÷4.09 | ÷4.318 | +5.6% | §3 #2 |
| blank Black Pass Claymore / Claymore +25% gear phys | 80.7 / 102.7B | 74.3 / 92.9B | −7.9 / −9.5% | §3 #3 |
| July export (older state, no prism placements) | 557.75B | 468.4B | −16% | §3 #5 |
| July chain s4 / s5 / full state | ×1.153 / 17,602.5 / 557.75B | ×1.190 / 19,701 / 672.9B | | §3 #6 |
| r2 SP off / both off (total DPS, void windows: baselines 10.5% apart) | ÷1.351 / ÷1.821 | ÷1.305 / ÷1.840 | | informational pin |
| Boots of Devastation (Hasten) | 676.9B | not a test yet | | Task 12 |

Unmeasured Pro builds: pro-1t (1T stated) model **142.6B**; the 40T build model **228T** — both far off (Task 10).

---

## 2. What is still fitted or assumed (the main risk)

**Removed in R2** (replacement measured and tested): the weapon-APS throw rule (`aux.throw_at_weapon_aps`),
`FC_AUTO_HITS`, the H fold-in (`H_REAL`, `H_BARE`), `non_projectile_share` q, `proj_speed_hit_exp` k,
`EXPLOSION_SHARE`, `OBLITERATE_TIMER_SCALE`, Bull's Rage uptime 0.75 / 0.58, and M on the counted path.

| still fitted / assumed | value | where | why it stays | task |
|---|---|---|---|---|
| July manual-throw fold | `hits_per_bomb` 0.8353, M 3.65, `H_ARROWS`, unquantized throw rate | `BING_ZERO`, `bingLedger.ts` | manual throws were never read per hit; only the July rig uses them | Task 8 (re-scoped), Task 3 Step 4 |
| `resid_attack_speed` | — | hand ledger | unattributed sheet attack speed the law still counts | R3 |
| Q = Ember quantity → explosions | 7 | `bombCounts` | inferred; the count-only A/B needs a Multiple Projectiles gem (not owned) or an Iron Lion spirit swap (pact board not readable) | R3 / Task 4 |
| HoA L21 ×1.10 | — | `#skill-levels` | inferred from the tooltip; levels > 21 unverified (40T ÷2.36) | Task 15 |
| Upheaval "+20% additional damage" dropped | — | `bingKit.ts` | measured absent on one build; SS13 text unread (tlidb 404) | R3 |
| Formation Breaker Sentry-proximity +30% taken zeroed | — | `bingImport.ts` | measured off at one spot, player at range under FC; a Sentry at the boss may differ | P2 / R3 |
| proximity lines live (Solar Ring) | ÷1.61 if wrong | `bingDiagnose.ts` UNVERIFIED | no position read yet | P2 |

`pnpm bing diagnose <build> --season ss13` still lists the Pro-only UNVERIFIED assumptions (skill levels, tick grid,
lucky, corruption, low-life, profane…) — Tasks 10, 15.

---

## 3. Open discrepancies (the R3 list)

| # | discrepancy | evidence so far | task |
|---|---|---|---|
| 1 | **PP off / SP off total-DPS ratios** (÷1.320, ÷1.245, ÷1.202) vs the model's ÷1.41 / ÷1.31 | per-hit reads give ÷1.406–1.411 / ÷1.310–1.328 on every hit in two sessions with counts unchanged; the R1 session's own PP-off total read ÷1.57 — the total windows look like noise, not a mechanic | R3 |
| 2 | **Flame Core off** ÷4.09 vs ÷4.318 | e = 1/5 and uptime 0.545 measured; the R1 bracket read ÷4.53; FC-off windows swing 89.6–118B | R3 |
| 3 | **Blank Mallet vs blank Claymore**: +11.6% measured for +15 base phys; model +4.3% (R1's fit had hidden it) | — | Task 11 |
| 4 | **10-10 baseline** 467.3 vs 452.2B | the R1 session's 18 windows read 458.5B (−1.4%); decomposition: pummel 3.828 vs 3.815B, explosion 1.523 vs 1.511B, pummels/s 3.438 vs 3.409, explosions/s 24.09 vs 23.86, tick÷hit 8.196 vs 8.217 — all within 1.3% | R3 |
| 5 | **July export −16%** | older game state; the export lacks prism placements | R3 |
| 6 | **July chain s4 tick-share conflict**: the direct A/B of the +24% Deterioration line (×1.153) favours ticks ×1.19 (old rule) over own-pool ×1.24 unless the July rig's tick share is ~0.64, not 0.79 | not H, not R2 (`detDps` scales with `hitDps`); candidates: the unencoded July lunar affix, `enhancedShare` | R3 |
| 7 | **Both-off crit share** 0.58–0.59 vs 0.51–0.52 at base / SP off (~4σ, ~1,500 hits) → mean per-hit ratio ÷1.74–1.77 vs top-level ÷1.85 | r2 per-hit CSVs | R3 |
| 8 | **Hasten** (Boots of Devastation): 676.9 vs 654.2B in the old model; value unknown | — | Task 12 |
| 9 | **One-handed weapons untested**; every "when holding a Two-Handed Weapon" line assumed true | — | Tasks 13, 14 |
| 10 | **Pro builds far off** (pro-1t 142.6B vs 1T; 40T 228T) | play style answered (§0) | Task 10 |
| 11 | **Position**: the proximity lines and the Sentry line depend on the spot | baselines 480 → 433B between spots (10-10); the per-hit read can now separate them | P2 |
| 12 | Dead knobs after R2: `proj_speed_inc_pct` / `proj_speed_more_pct` written but unread (`seasons.ts:109`, `bingKit.ts:142`, `bingLedger.ts:180`); Mighty Arrow kismet `hits_per_bomb` ×1.3286 inert on counted builds; "folded into hits_per_bomb" reasons stale (`bingAffixMap.ts:135`, `bingImport.ts:117`) | R2 review | R3 / Task 5 |

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
- `pnpm test` stays green (626 at `b0ae837`). **Never loosen an existing tolerance or delete a measured case** to make
  a change pass — a change that breaks a measured A/B is a failed change.
- `CLAUDE.md` invariants: the `docs/mechanics.md` row lands before the code; failing test first; after any model or
  parser change `pnpm test && pnpm page`, then refresh the page prose numbers. Stale prose is a bug.
- **One game driver at a time.** Only the dispatched GAME task runs `ops.mjs`, `combat.mjs`, `state.mjs`,
  `game.ps1`, `tli_dump` or `scripts/scrape_build.mjs`. OFFLINE tasks never run them.
- Game-time DPS only (`combat.mjs` field `dps`, never `wallDps`). 30-second windows, A-B-A bracketing.
- Every in-game number compared to the model lands in a test, with a comment
  `// measured ÷X (YYYY-MM-DD, label <label>); predicted ÷Y first`.
- **Ruling R8 (2026-10-11):** a measured case the model misses by more than its tolerance and that no
  text/measurement can fix yet is not refit and not loosened — the test pins today's model value with MEASURED beside
  it and a "flip to measured once fixed" comment, and the case is named in §3. A pin flips back to asserting the
  measured value at its **original** tolerance as soon as the model hits it.
- **No new fitted constants** (rebuild rule): every count, share, uptime or multiplier is a quoted game text or a
  direct per-hit / cast-watch measurement — never back-solved from total DPS. A §2 constant is removed only when its
  measured replacement is in and tested.
- Per-hit reads (`combat.mjs --hits`) are the primary instrument for A/Bs; total-DPS windows are secondary (§0).
- The user may be using the PC: never set `TLI_FORCE_FLICK`; `ops` waits for Torchlight to come to front.
- **Needs-user steps never stall the run.** Purchases (Trade House) and other characters are the user's (Rehan is
  off-limits — §0); gear/pactspirit/slate changes, Hero Trait swaps, relogs and poorchlight reverse-engineering are
  granted (2026-10-11). The controller defers that task, records the
  ask under `## Waiting on the user` in the SDD ledger, and runs the next runnable task; it asks the user once, in one
  batch, when only blocked tasks remain.

---

## 6. Review focus

The five failure modes most likely to ship past the tests; the task reviewer checks each on every GAME task.

1. **Prediction written after the measurement** (a post-hoc fit reported as a confirmation). Every `measurements.jsonl`
   label the task cites has a `predictions.jsonl` row with the same label and an earlier `at`.
2. **The character moved between A and B** (proximity lines are worth ÷1.61 on this build). The A-B-A baselines agree
   within 3% and, once P2 lands, the logged positions match. (Total-DPS baselines often miss 3% from noise alone —
   §0; a per-hit A/B is judged on the per-hit top levels, which agree within 0.5% between brackets. Windows that fail
   the rule become informational pins, never measured cases.)
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

**Run order** (revised 2026-10-11; respect `Depends on`; needs-user tasks defer per §5). Status: ✅ done, ⏸ deferred,
➡ superseded by the rebuild, ✖ removed.

| task | lane | status | needs user | depends on | model |
|---|---|---|---|---|---|
| 0 Bomb throw-rate law | GAME | ✅ law measured; in the model via R2 | — | — | most capable |
| 1 Measuring spot and proximity | GAME | ⏸ → P2 | — | P1 | standard |
| 2 Obliterate timer rule | GAME | ✅ (constant removed in R2) | — | 0 | most capable |
| 3 Firepower Coverage hits per throw | GAME | ✅ FC path via P1/R2; Step 4 (manual-throw fold, FC off trait) open | — | R2 | most capable |
| 4 Projectile channel held-out A/B | GAME | ✅ (q/k removed in R2); count-only A/B open (no Multiple Projectiles gem) | purchase or spirit swap | — | standard |
| **P1** per-hit read | GAME | ✅ | — | — | most capable |
| **R1** per-hit damage | GAME | ✅ | — | P1 | most capable |
| **R2** counted hits | GAME | ✅ | — | P1, R1 | most capable |
| **R3** total DPS compare + A/B audit | GAME + OFFLINE | **next** (needs resume) | — | R2 | most capable |
| **P2** position read (+ Task 1) | GAME | todo | — | P1 | most capable |
| 5 Gear projectile speed lines | OFFLINE | todo — re-scope: counts don't follow speed (R2), so speed lines are geometry no-ops again; clean the dead knobs (§3 #12) | — | — | cheap |
| 6 Upheaval explosion share | GAME | ➡ `EXPLOSION_SHARE` removed; Upheaval flipped to ÷1.2168 | — | — | — |
| 7 Cooldown-skill uptime from mechanics | OFFLINE → GAME | ➡ Bull's Rage done in R2; remaining: Timid / Entangled Pain / Fixate uptimes, `+1 Max Charges` | — | — | standard |
| 8 Demolisher empower multiplier | GAME | ➡ counted path uses texts; M survives only in the July manual fold | — | 3 Step 4 | standard |
| 9 Second calibration build | GAME | todo — re-spec DeafwaveB (§0) | — | R3 | standard |
| 10 Third calibration build (Pro) | GAME | todo — play style answered (§0) | — | 9 | standard |
| 11 Mallet vs Claymore | OFFLINE → GAME | todo (§3 #3) | — | R3 | standard |
| 12 Hasten | OFFLINE | todo | — | — | standard |
| 13 Weapon-handedness requirements | OFFLINE | todo | — | — | standard |
| 14 One-handed weapon A/Bs | GAME | todo | — | 13 | standard |
| 15 HoA levels above 21 | OFFLINE | todo | optional | — | standard |
| 16 Scrape ≥10 more Pro Builds | GAME | todo | — | — | standard |
| 17 Scraped-build unknowns → 0 | OFFLINE | todo | — | 7, 16 | standard |
| 18 Library unknowns: irrelevant batch | OFFLINE | todo | — | — | cheap |
| 19 Library unknowns: damage-shaped | OFFLINE | todo | — | 12, 18 | standard |
| 20 Catalog coverage test | OFFLINE | todo | — | — | standard |
| 21 Catalog unknowns → 0 | OFFLINE | todo | — | 20 | standard |
| 22 Talent tree graph | OFFLINE | todo | — | — | standard |
| 23 Joint optimizer | OFFLINE | todo | — | 17, 19, 21, 22 | most capable |
| 24 Validate optimizer picks in game | GAME | todo | yes (purchases) | 23 | standard |
| 25 Rehan model revalidation | — | ✖ removed by the user (Bing1 only) | — | — | — |
| 26 Close-out | OFFLINE | todo | — | all | cheap |

Suggested next: R3 when the game is free; meanwhile OFFLINE 12 → 13 → 18 → 5 → 20 → 22 (each touches
`bingAffixMap.ts` or the snapshot — run them one at a time).

**Dispatch additions** (on top of the SDD implementer template): name the card's **Skills** as "invoke these skills
first"; for a GAME task add "you hold the game for this task: you are the only process driving it; end with
`ops.mjs close` and a `state` identical to the start".

**Report contract additions for GAME tasks** (in the report file): a table `label | predicted ÷ | measured ÷ | Δ%`;
the `predictions.jsonl` and `measurements.jsonl` rows the task used, verbatim; `ops.mjs state` before and after;
any user asks.

**Reviewer additions:** check §6 on every GAME task; check §5 on every task.

---

## 8. Tasks

### 8.R Rebuild cards (user decision 2026-10-11)

The model is built from the game texts and the damage formula. Each non-text quantity (geometry, cadence, hidden
behaviour) is **measured once, directly**, never back-solved from total DPS. Total DPS is compared last; a mismatch
means a missing or wrong mechanic, found and named, not tuned. §5 binds every card (R8 pins, no new fitted constants).

### Task P1: poorchlight per-hit damage read

> ✅ **Done (2026-10-11).** `tli_dump --hit-watch <secs>` (poorchlight `a6ef905`, local) and `combat.mjs --hits`
> (`57f6f6f`). Σ per-hit = the dummy total to 1e-10 in every window; ~3,700–4,100 hits per 30s. Layout documented
> in poorchlight `docs/MEMORY_LAYOUT.md` ("Per-hit damage events"); fields named from observation: skill id, flags,
> volley index, kind 4 = Deterioration. Caveats: addresses break on a game patch; a frame can be lost if two hurt
> messages land within 1 ms (the ratio check flags it); the dummy must be the targeted bar. Deferred minors:
> `combat.mjs:108-109` throws before appending the row on a hit-watch error; empty-stdout JSON guard;
> `combat.rs:398` owner read aborts the walk (use `.ok()` + continue).

### Task P2: poorchlight player/dummy position read (resumes Task 1)

**Lane:** GAME (memory RE, approved) · **Skills:** tli-game, bing-ab-test · **Depends on:** P1

- [ ] Find the player's (and the dummy's) world position; add it to `--combat-json`; document in `MEMORY_LAYOUT.md`;
  commit in poorchlight (no push).
- [ ] Run Task 1 Steps 2a–5 (`pos` / `dummyDist` in the `combat.mjs` row, the 0.5-unit abort rule in bing-ab-test,
  the proximity A/B). With the per-hit read, split the proximity lines (Solar Ring) from the Sentry-proximity line
  (§2) by hit type and spot.

**Done when:** Task 1's "Done when" holds and the Sentry-line zeroing is either confirmed at a second spot or
replaced by a distance rule.

### Task R1: per-hit damage from the sheet

> ✅ **Done (2026-10-11).** Every hit type (empowered pummel, explosion, un-empowered pummel, Deterioration tick) and
> crit share/multiplier within 3%; ten per-hit A/Bs within 3%. Mechanics found (`#bing-per-hit`): Deterioration tick
> = 0.6 × own pool × hit (was ×1.57 low); Demolisher +215% on hits only; Shotgun 30%; Broken Sun +41% area on
> empowered hits; Upheaval's "+20% additional" absent (one build); Formation Breaker Sentry-proximity line off at
> the dummy (one spot); Kaleidoscope turns; skill levels (HoA L21 inferred); Well-Fought Battle ×1.33. Commits
> `02ed2b4`, `a86ad10`.

### Task R2: hits per second from the texts (throw law in, fitted constants out)

> ✅ **Done (2026-10-11).** Counted model (`#bing-hit-counts`, `bombCounts`): throw law, 2.5 bombs/throw, empowered
> bomb = pummel + Q explosions, un-empowered = pummel, n = ceil(3 × rate) / Formation Breaker n = 1, Bull's Rage
> uptime from cooldown + charge cadence, live stacks from counted inflictions. Removed: weapon-APS throw rule,
> `FC_AUTO_HITS`, H fold-in, q, k, `EXPLOSION_SHARE`, `OBLITERATE_TIMER_SCALE`, Bull's Rage 0.75/0.58, M on the
> counted path. Seven cases R8-pinned → R3. Commits `a54afe2`, `fee0edd`, `b0ae837` (review fix: the Solar Ring
> graft carries Solar Ring only; void-window total A/Bs became informational pins).

### Task R3: total DPS compare and A/B audit

**Lane:** OFFLINE + GAME (re-measures; needs resume) · **Skills:** bing-dps-model, bing-ab-test, tli-game,
tlidb-lookup · **Depends on:** R2 · **Model:** most capable

- [ ] Work §3 #1–#7 and #12 in order of impact. For each: predict, then measure **per hit** (`combat.mjs --hits`) in
  the same session as its baseline, A-B-A; name the hit type / mechanic that differs; mechanics row → failing test →
  fix from a text or a direct measurement. A total-DPS window pair that fails the 3% bracketing rule is void.
  - #1 PP/SP off totals: re-measure per hit + total in one session; if per-hit ÷1.41/÷1.31 holds and totals still
    differ, look for a count change (hits/s per type) the earlier windows missed — else retire the 10-10 total ratios
    as noise (keep them in the test as void with the reason).
  - #2 Flame Core off: per-hit counts of empowered vs un-empowered throws and Bull's Rage uptime in the same windows.
  - #4 baseline: more base windows in one session; the decomposition is already within 1.3% per term.
  - #6 July s4 tick share: decide between the own-pool rule and the old rule with a direct A/B of a "+X%
    Deterioration Damage" source on the current build (per-hit tick ÷ hit ratio).
  - #7 both-off crit share: re-measure; if real, find the crit mechanic (texts).
  - #12 dead knobs: remove, fix the stale reasons.
- [ ] `resid_attack_speed`: attribute it (sheet vs sources) or name it.
- [ ] Update `docs/mechanics.md`, this document §0–§3, `pnpm test && pnpm page`, page prose.

**Done when:** every measured case passes its original tolerance or is a pinned, named open discrepancy, and no
fitted constant is left that a measurement could replace.

### Task 0: Bomb throw-rate law (Blast Nova)

> ✅ **Done (2026-10-11).** Law measured: 1/s × (1+Σinc AS) × Π additional AS, weapon base APS, weapon-local and skill-scoped AS excluded — 5 states within 2.2% (`#bing-bombs`). Blocked from the model at the time (Flame Core off, Tyrant's); landed in R2 with the counted hits. Commits `661df70`, `efe83bf`.

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

> ⏸ **Deferred → P2.** No existing poorchlight read has player/dummy position (Step 2b). The RE is now approved; P2 builds the read and then runs Steps 2a–5. Reference screenshots: `../scratch/spot-ref.png`, `spot-canonical.png`.

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

> ✅ **Done.** Deterioration stacks follow the measured throw rate at three weapons (Mallet ×1.245, Sword ×1.258, Tyrant's ×0.927); under the law every throw is enhanced, so `OBLITERATE_TIMER_SCALE` was a throw-rate stand-in — removed in R2. `cycleDps` returns live stacks. Commits `e0f8397`, `607c3bf`.

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

> ✅ **Done for Firepower Coverage builds** (via P1 → R2: `FC_AUTO_HITS` replaced by counted pummel + explosions). Open: Step 4 (manual-throw fold with Firepower Coverage off — a trait swap is now granted) to replace the July fold's `hits_per_bomb` / M. Commit `9adcd64`.

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

> ✅ **Done** (q/k removed in R2: both hit types are projectile-typed; counts don't follow projectile speed). The both-off ÷1.864 now matches (÷1.840). Open: the count-only A/B (Iron Lion's +2 is the spirit's own effect — spirit swap only, pact board not readable; no Multiple Projectiles gem owned). Commits `1ca9e7a`, `af586f8`, `961fcae`.

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

> **Re-scope (2026-10-11):** R2 measured that hit counts do not change with projectile speed, so the Step 2 test below is obsolete; instead keep speed lines as geometry no-ops with a reason citing R2's count reads, and remove the dead knobs (`proj_speed_inc_pct` / `proj_speed_more_pct`, §3 #12).

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

> ➡ **Superseded by R2** — `EXPLOSION_SHARE` is gone; explosions are counted and Upheaval's rolled +32% applies to them (Upheaval off ÷1.2168 vs ÷1.217 measured). Only reopen if a second Upheaval roll disagrees.

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

> ➡ **Bull's Rage done in R2** (6s / 10s cooldown ÷ recovery, cast on charge gain; 0.774 / 0.545 measured 0.767 / 0.545; Cooldown Recovery lines mapped to `rotation.cdr_inc_pct`). Remaining: Timid, Entangled Pain, Fixate uptimes; `+1 Max Charges` (Task 17).

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

> ➡ **Counted path done in R2** (HoA +215% additional hit damage × Broken Sun area × "…Demolisher consumed" lines, all from texts; R1 measured empowered ÷ un-empowered pummel 4.42 vs 4.44). M = 3.65 survives only in the July manual-throw fold — do this only together with Task 3 Step 4.

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

> **User (2026-10-11):** re-spec DeafwaveB into a materially different loadout (gear/supports/slates/traits are granted), measure, then restore exactly. Prefer per-hit A/Bs (§0). Run after R3.

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

> **User (2026-10-11) play style:** a skill or Hero Trait with an automation/activation support or an automated trait is not pressed; one without is pressed by hand. pro-1t now models 142.6B (1T stated), 40T 228T.

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

> **Note (2026-10-11):** under the counted model the gap is +11.6% measured vs +4.3% model (R1's fit had hidden it); the throw law no longer uses weapon base APS, so Step 0 is done — start at Step 1.

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

> ✖ **Removed by the user (2026-10-11):** no switching to Rehan; focus purely on Bing1 until it is perfect.

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
  Also (2026-10-11): fold the deferred minors from the SDD ledger (`progress.md` "minor (deferred)" lines) — e.g.
  `#bing-bombs` still carries the superseded "throw_rate_base follows weapon APS … confirmed 2026-07-20" claim;
  `ops.mjs install` ownership check; `combat.mjs --hits` error handling (log `hitsError` instead of throwing).
- [ ] **Step 2:** rewrite §1–§3 from the tests: constants replaced leave §2, discrepancies closed leave §3, new
  baselines in §1; list every task still waiting on the user.
- [ ] **Step 3:** `git fetch torchlight && git rebase torchlight/main && git push torchlight main`.

**Done when:** this document describes the tested state and main is pushed.
