# External sources review — leads for the DPS models (2026-10-11)

> **For agentic workers:** this is an add-on to `docs/bing-dps-validation-handoff.md`. Its §4 (how to work),
> §5 (global constraints) and §6 (review focus) apply to every task here unchanged. Tasks are numbered **E1–E8**.
> Some only add evidence to an existing task card there; those say which.

**What this is:** five GitHub repos and the 91tob.com engine were read against our model (2026-10-10/11). They
are **leads, not truth**. None of them validates against the game as carefully as our A/Bs, and some of their code
contradicts their own sources. Nothing here changes the model without the usual path:
`docs/mechanics.md` row → failing test → in-game measurement with the prediction written first.

**How strong each kind of evidence is:**
1. **Game help text quoted verbatim** (TLIBuilder's glossary, aclinia's tooltip scrape): strong for *what* a
   mechanic is, silent on numbers our build hits.
2. **Third-party meter measurements** (TLIBuilder `docs/verification/`, 19 confirmed entries): real, but on
   other skills and characters.
3. **Engine code or rule strings with no citation** (91tob, aclinia, TLIBuilder engine): hypotheses only.
   Write them as a competing prediction next to ours.

## Sources

The clones used for this review were temporary. Cite upstream at these commits.

| Source | Commit | What's usable | Reliability |
|---|---|---|---|
| [Tyrayla/TLIBuilder](https://github.com/Tyrayla/TLIBuilder) | `c9e4639` (v0.6.10) | `docs/MASTER_GLOSSARY.md` (367 SS13 in-game help entries, verbatim); `docs/ADDITIONAL_DAMAGE_POOLING.md`; `docs/verification/*.md` (meter tests) | glossary: high · tests: medium · engine (`backend/engine/offense.py`): low. Their `DATA-LICENSE.md` asks not to lift compiled data — quote single entries with a citation, don't vendor files |
| [aclinia/torchlight-of-building](https://github.com/aclinia/torchlight-of-building) | `1da3826` | `src/data/hyperlink/hyperlinks.ts` (tlidb tooltip text) | tooltips: high · formulas: low (Frostbite at 0.5%/pt contradicts its own tooltip) |
| [wuyegouhunqu/huoju](https://github.com/wuyegouhunqu/huoju) | `1ef2ed9` | `收割.txt` (Reap cooldown-tier table) | low: unsourced, but internally consistent |
| [chaseh80/TorchlightInfiniteDPS](https://github.com/chaseh80/TorchlightInfiniteDPS), [rachanonnuk-spec/TLI-Calc](https://github.com/rachanonnuk-spec/TLI-Calc) | `e616432`, `4f05159` | nothing | — |
| 91tob.com engine | site data SS13.4 | Hammer of Ash charge rule, enemy defaults | low: unsourced rule strings. Everything known about the site: `docs/91tob.md` |

## Already rejected (don't re-investigate)

- **Every repo's core formula** `(1 + Σ inc) × ∏(1 + additional)`, Strength 0.5%/pt, crit = rating/100: they
  agree with ours, so there's nothing to change.
- **Skill levels ×1.10 / ×1.08 past 20**: aclinia and TLIBuilder state the same numbers with no source. That is
  not independent confirmation of the user's report.
- **91tob gives Precise Projectiles' +21% to the whole Hammer of Ash** (because the skill has the Projectile
  tag): our projectile and non-projectile channels are pinned by A/Bs (Task 4 still tests their shape).
- **Numb is +5% to all damage** (huoju): contradicts tlidb; doesn't matter for cold or fire builds.
- **Frostbite at 0.5% per point** (aclinia code): contradicts aclinia's own tooltip.
- **The 30Hz cast-time calculator** (TLI-Calc): see E7.

## Run order

| Task | Lane | Needs user | Depends on | Slots into | Model |
|---|---|---|---|---|---|
| E1 Spectral Slash clone cap | OFFLINE → GAME | yes (Rehan character) | — | Task 25 | standard |
| E2 Shotgun falloff reading | OFFLINE → GAME | yes (Rehan character) | E1 | Task 25; Task 3 (Bing) | most capable |
| E3 Identical "additional" lines add | OFFLINE (→ GAME if found) | maybe (duplicate-affix gear) | — | — | standard |
| E4 Hasten = Quickness? | OFFLINE | — | — | Task 12 | cheap |
| E5 Armor against erosion | OFFLINE → GAME | — | Bing Task 1 | — | standard |
| E6 Hammer of Ash charge package | OFFLINE (predictions) | — | Bing Tasks 0, 7 | Task 8 | standard |
| E7 Cooldowns snap to 1/30 s | OFFLINE | — | — | Task 7 | cheap |
| E8 Dual-wield +10% attack speed | GAME | yes (Rehan character) | — | Task 25 | cheap |

E1 and E2 are the priority: together they bound a ÷3.3 swing on the Rehan finisher, the guide's biggest open
number.

---

### Task E1: Spectral Slash clone cap

**Lane:** OFFLINE → GAME · **Needs user:** yes — the Rehan character at the dummy (run with Task 25) ·
**Depends on:** —
**Skills:** tlidb-lookup, tli-game
**Files:** `packages/dmg/src/damageModel.ts:569` (`comboRotation`), `data/snapshot.json` (`rotation.combo_points`,
`rotation.extra_clones`, `rotation.clone_falloff`) · Test: `packages/dmg/test/e2e.test.ts` · Doc: `docs/mechanics.md`
row "Combo system" (`#mark`) and the clone-falloff bullet in `#assumptions`

**Why:** our own cache (`.claude/skills/tli-build/cache/SS12.5-skill-en.json`, Spectral Slash) says *"Generates 1
additional Clone for every Combo Point consumed, **up to 4 Clone(s)**"*. The model has no cap:
`clones = r.combo_points + (r.extra_clones ?? 0)` = 8 + 1 = **9 clones**. aclinia applies the cap
(`Math.min(comboPoints, maxClones)`). The mechanics row cites "user-provided skill logic 2026-07-15" for one clone
per point, with no cap. The cached text has no line raising the cap, but the export stores ids, not text, so a
cap raise in the build can't be ruled out offline.

- [ ] **Step 1:** tlidb-lookup Spectral Slash (SS13 and SS14 blocks): is "up to 4 Clone(s)" still there? Look for
  anything that raises the cap in the build: the Seething Silhouette traits, Legion (*"+1 Clone per enemy (≤5)"* —
  does the cap bind Legion's extra too?), slates, legendaries.
- [ ] **Step 2:** ask the user (batched per §5): on a full 8-point finisher, how many clones appear — 9, or 4–5?
  If the GAME lane is open, take a screenshot burst of a finisher at the dummy instead.
- [ ] **Step 3 — Predict:** from `pnpm rank`, the finisher's clone factor `1 + clones × falloff` for clones ∈
  {9, 5, 4} × falloff ∈ {0.7, 0.3} (E2): 7.3 / 3.7, 4.5 / 2.5, 3.8 / 2.2. Write these down before any measurement.
- [ ] **Step 4:** if the cap holds: a failing test (`clones ≤ max_clones`), the mechanics row, then the code
  (a `rotation.max_clones` knob, default 4). `pnpm test && pnpm page`; refresh the `main.ts` prose from
  `pnpm rank`; commit.

**Done when:** the clone count rests on game text plus an in-game count, and the model enforces it.

### Task E2: Shotgun falloff — what the coefficient means

**Lane:** OFFLINE → GAME · **Needs user:** yes (Rehan character) · **Depends on:** E1
**Skills:** tli-game, bing-ab-test (protocol), bing-dps-model (for the Bing side)
**Files:** `packages/dmg/src/damageModel.ts:570`, `data/snapshot.json` (`clone_falloff`) · Doc: `docs/mechanics.md`
`#mark` row + `#assumptions` ("Clone shotgun falloff read as a flat 70%")

**Why:** we read Spectral Slash's *"The falloff coefficient of the Clones' Shotgun Effect is 70%"* as each later
hit **keeping** 70%. The game's help text says otherwise (TLIBuilder `MASTER_GLOSSARY.md:1797`, the same text in
aclinia `hyperlinks.ts:369`):

> "Multiple effects from the same skill can hit the same enemy. The first effect hit deals 100% damage, and
> subsequent effects hit deal less damage. This effect also applies to Ailment Damage dealt by skills.
> Most skills' subsequent on hit damage is 36%"

Most skills list a **64%** coefficient, so the coefficient looks like the share **lost**: Spectral Slash's later
clones would keep **30%**. TLIBuilder's meter tests on Shadow Strike (`docs/verification/shadow-strike.md`, shadow
coefficient also 70%) measured ×2.30 with 2 shadows and ×2.628 with 3. The flat keep-30% reading predicts ×2.318
and ×2.621; compounding misses by 8%. So the falloff is probably **flat, not compounding** (our current
assumption), with the opposite meaning. Their results also suggest the first shadow hits for full; check whether
our first clone does.

- [ ] **Step 1 — Predict:** from `pnpm rank` ablations, a Rehan A/B that changes the number of clones hitting
  (fewer combo points consumed, e.g. drop Recuperation's +1/starter; or a 1-clone vs full-clone finisher).
  Write predictions for keep-70% and keep-30%, each with the E1 cap and without it.
- [ ] **Step 2 — Measure:** A-B-A at the dummy (protocol as bing-ab-test; 30-second game-time windows).
- [ ] **Step 3:** update the row and `clone_falloff`, failing test first. `pnpm test && pnpm page`; prose; commit.
- [ ] **Step 4 (Bing note):** Hammer of Ash's text says *"该技能的猛击和爆炸可以击中同一个敌人 / 霰弹效应
  衰减系数为 70%"* (Pummel and Explosion can hit the same enemy; shotgun falloff coefficient 70%). If the
  lost-share reading holds, record it in the Task 3 card (`FC_AUTO_HITS`) and the Task 6 card
  (`EXPLOSION_SHARE`) as a candidate for what those fitted constants absorb. Don't refit here.

**Done when:** the falloff reading rests on an in-game A/B that tells the two readings apart.

### Task E3: Identical "additional" lines add together

**Lane:** OFFLINE (→ GAME if the build has duplicates) · **Needs user:** maybe — gear with a duplicated affix ·
**Depends on:** —
**Skills:** bing-dps-model
**Files:** `packages/dmg/src/buildParser.ts:744` and `:824` (compound within a bucket), the Bing ledger's
`additional` handling · Doc: `docs/mechanics.md#additional`

**Why:** TLIBuilder (`docs/ADDITIONAL_DAMAGE_POOLING.md`) quotes the game help database, *Stacks and
Multiplication Rules*:

> "Unless specially noted, the additional bonuses of the same affix are added together. When the additional
> bonuses of an affix are multiplied together, the affix will be marked with 'multiplies.'"

Different additional lines multiplying is confirmed (our 2026-07-17 toggle, ÷1.12; their two +20% lines gave
×1.44). **Identical** lines adding is text only — their own in-game check is still queued. Our parser compounds
every line within a bucket, so two copies of the same line (e.g. on two rings) multiply where the text says they
add. Per-stack lines marked "(multiplies)", like Willpower, compound, as we already model.

- [ ] **Step 1:** count identical-text "additional" lines in `data/Rehan.json` (reference loadout `more_1`) and in
  the Bing imports (`data/bing1/scraped/*.json`). For each, the DPS gap between adding and multiplying.
- [ ] **Step 2:** if every gap is under 1%, add the quote to `#additional` as "identical affixes: add (help text;
  unmeasured)" and stop. Otherwise: a failing test, then the parser and ledger rule, plus a GAME A/B on the
  largest duplicate if one can be unequipped.

**Done when:** the rule is written down and its DPS impact on our builds is known.

### Task E4: Hasten — evidence for Task 12

**Lane:** OFFLINE · **Slots into:** Bing Task 12 (do it there)

Add to Task 12 Step 1: TLIBuilder's glossary (`MASTER_GLOSSARY.md:1603`) has **Quickness**: *"Additionally
increases Attack Speed, Cast Speed, Movement Speed, and Mobility Skill Cooldown Recovery Time by 8%"*; aclinia's
tooltip (`hyperlinks.ts:1689`) carries the same text under **Hasten**. TLIBuilder only *assumes* the two are one
buff. Our fit needs ~+3.5% attack speed, not +8%. If tlidb confirms +8% additional, don't fit Hasten down to 3.5%.
Record the gap as evidence for Task 0: the throw-rate law may not scale the way the sheet's attack speed does.

### Task E5: Does armor reduce erosion?

**Lane:** OFFLINE → GAME · **Needs user:** — · **Depends on:** Bing Task 1
**Skills:** bing-dps-model, bing-ab-test
**Files:** Doc: `docs/mechanics.md#erosion` · Test: `packages/dmg/test/bing1/import.test.ts`

**Why:** `#erosion` says erosion is *"NOT reduced by elemental resistance or armor, only by Erosion Resistance"*.
The help text (TLIBuilder `MASTER_GLOSSARY.md:127`, aclinia `hyperlinks.ts:94`) says *"Armor Effective Rate —
Effective Damage Reduction Provided by Armor: 100% by default for Physical Damage. 60% by default for
Non-Physical Damage."* Erosion is non-physical. 91tob's enemy has 27,273 armor → 30% against non-physical, which
matches our 30% armor layer for fire.

- [ ] **Step 1:** check whether a measured case already tells the two apart. Obliterate's erosion hits are
  calibrated against Deterioration, so a ×0.7 may sit inside a fitted constant (`OBLITERATE_TIMER_SCALE`?).
- [ ] **Step 2:** if none does: predict, then A/B an armor-penetration source on the Obliterate build. If armor
  applies to erosion, armor pen raises erosion hits.
- [ ] **Step 3:** update the row either way, citing the glossary line.

**Done when:** `#erosion` cites a measurement for the armor question.

### Task E6: Hammer of Ash charge package (91tob) — predictions for Task 8

**Lane:** OFFLINE · **Slots into:** Bing Task 8 (and Task 0)

91tob's engine encodes, with no source (full text in `docs/91tob.md`):
- uncharged throw = Pummel only. Charged = **Pummel × 3.15 + Explosion × 3.15 × 0.9**. Projectiles and the
  explosion are mutually exclusive.
- Blast Nova's extra explosions are full, independent hits, **outside** the first explosion's shotgun pool.
- charged share = `1 / ceil(charge recovery time / attack interval)`. This is the same shape as our A/B-confirmed
  `n = ceil(3/(1+resto%) × throwRate)`, but driven by the **attack interval** instead of the throw rate. That is
  exactly Task 0's question, so it isn't evidence either way.

Add to Task 8 Step 2: alongside the fitted M = 3.65, log a competing prediction from the 91tob package
(charged/uncharged ≈ 5.99 for a bare Hammer). Bing's bombs are not their Pummel, so expect a mismatch: a large one
says M absorbs geometry, not the charge rule. Don't adopt the 0.9.

### Task E7: Cooldowns snap to 1/30 s — a hypothesis for Task 7

**Lane:** OFFLINE · **Slots into:** Bing Task 7

Three unrelated tools assume cooldowns round up to the 30 Hz server tick: huoju's Reap tier table (`收割.txt`:
tier n = n/30 s, needing cooldown recovery ≥ (30/n − 1) × 100%), aclinia's cooldown code, and TLI-Calc's cast
calculator. That fits our `#bing-game-time` note (30 logic frames = 1 game second). Add it to Task 7 as the
candidate cadence rule: `effective cooldown = ceil(30 × base / (1 + recovery)) / 30`. Test it there; don't adopt
it on this evidence.

### Task E8: Dual wield +10% additional attack speed

**Lane:** GAME · **Needs user:** yes (Rehan character; run with Task 25) · priority: low
**Files:** Doc: `docs/mechanics.md#joined-force`

TLIBuilder (`backend/engine/aggregator.py:135`) gives +10% additional attack speed when dual wielding, measured
once: 1.5 × 1.10 × 1.225 = 2.02/s on the sheet. We don't model it. Rehan runs Joined Force (the off-hand doesn't
attack), so it may not apply. Check: compare the in-game sheet's attack speed with the model's `aps` for loadout
`more_1`. A 10% gap means it applies. Record the result in `#joined-force`.
