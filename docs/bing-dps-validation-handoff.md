# Bing / Hammer of Ash — DPS model handoff (2026-10-11)

For the next agent. You have **full control of the running game** (Torchlight: Infinite; PID changes on restart —
`tasklist | grep torchlight`) through `.claude/skills/tli-game` (read its SKILL.md first). Repo `rehan_guide`
(GitHub `deafwave/rehan-torchlight`, push to `main`; another agent also pushes — `git fetch && git rebase torchlight/main`
first). Memory reader: sibling repo `poorchlight` (`tli_dump`, elevated shell).

**The dream (user):** a combinatorial optimizer — which gear upgrades to buy/craft, which slates and pedigrees to
chase, which talents to change — trustworthy from a level-60 start to tens of trillions. **We are not there.** The model
now matches *one* build (the user's, DeafwaveB) closely; the general Torchlight math and the Bing-specific mechanics
are not yet proven beyond it.

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

**Mechanics established this session** (each has a `docs/mechanics.md` row — read `#bing-dummy-loop`,
`#bing-game-time`, `#bing-hit-channels`, `#bing-proj-speed`, `#bing-cruelty`, `#bing-mark`, `#bing-obliterate`,
`#bing-prism-import`, `#bing-sentry-curse`, `#tenacity`):
- Dummy DPS is per **game second** (30 logic frames); the client slows when laggy; damage is batched per frame.
- Obliterate converts phys/ele → erosion **only on enhanced uses**; un-enhanced throws hit as fire and inflict no
  Deterioration. Deterioration inherits hit-taken multipliers (Timid A/B).
- Firepower Coverage auto-throws at character attack speed, but **not** "Attack Speed for the supported skill" (Steamroll).
- "Unable to trigger Empower Skills" stops Activation Medium from firing Empower skills (Bull's Rage 0% uptime).
- Mark on hit (+10% crit damage taken, 97% uptime); Cruelty's Elite-hit stacks double it at the dummy; Tenacity/Sacrifice;
  Ice Bond is a Sentry; Entangled Pain is a DoT-only curse; prism base affixes and 4×3 areas now import.
- Main-hand adds from other gear ("Adds X Physical Damage to the Main-Hand Weapon") are multiplied by the weapon's
  +% Gear Physical (×1.273 measured vs ×1.25 model).

---

## 2. What is fitted, not understood (the main risk)

These constants make the one build fit; each could be wrong for every other build. Replace each with mechanics.

| constant | value | where | what it absorbs | how to resolve |
|---|---|---|---|---|
| `FC_AUTO_HITS` | 1.453 | `bingLedger.ts` | hits per bomb under Firepower Coverage vs the July fold | count hits per throw directly (native entity/projectile reads, or `--combat-watch` frames with only one hit source); test on a non-FC build |
| `OBLITERATE_TIMER_SCALE` | 0.70 | `damageModel.ts` | stated 0.5s behaves like 0.35s | find the real rule: Deterioration stacks vs attack rate at more weapons (1.4–3.5/s); check whether the timer is frame-quantised, starts on consumption, or is sped up by a stat |
| `non_projectile_share` q | 0.31 | `BING_ZERO.rotation` | share of hits not projectile-typed | Precise Projectiles / Slow Projectile A/Bs at other projectile counts |
| `proj_speed_hit_exp` k | 0.28 | `BING_ZERO.rotation` | Ember hits vs projectile speed | gear with "+X% Projectile Speed" (currently a geometry no-op!) |
| `EXPLOSION_SHARE` | 0.044 | `bingLedger.ts` | Upheaval explosion line's scope | Upheaval tier swap (T0 vs T2) |
| `demolisher_empower_mult` M | 3.65 (×boots/sun) | July calibration | empowered vs normal throw | Demolisher Charge restoration-speed A/B with Flame Core off |
| Bull's Rage uptime | 0.75 / 0.58 without FC | `bingKit.ts` | Activation Medium: Demolisher cadence | derive from charge consumption rate |

---

## 3. Open discrepancies

1. **Blank Mallet vs blank Claymore**: 72.3 vs 80.7B measured (+11.6%) for +15 base phys; model says +4%. Repeated twice.
   Hammer vs sword? Item level? Snapshot bug (user: gear-change state can desync; fix = log out/in with the gear on)?
2. **Hasten** (Boots of Devastation "Has Hasten"): value unknown (needs ~+3.5% attack speed to fit).
3. **One-handed weapons untested**: Hollow Rift Axe, 2× Sierra Forge Light Hammer are in the bag (gear tab). Every
   "when holding a Two-Handed Weapon" line is currently assumed true — the importer strips the clause.
4. **Pro builds still far off** (title DPS, unknown conditions): 「寒山寺宾一5000火 1w亿」 (1T dummy) and 「寒山寺40万亿」
   (40T, probably Ordrak) — `pnpm bing diagnose data/bing1/scraped/*.json --season ss13`. After the Empower rule the 1T
   build loses its Ice Bond engine; it presumably casts Ice Bond manually or differently — ask how it's played.
5. **Position matters** (proximity lines via Solar Ring): baselines moved 480 → 433B between spots. Fix a spot.
6. `+X% Projectile Speed` / `Skill Area` lines are still geometry no-ops; skill-level scaling past 21 is unverified
   (40T build relies on it ÷2.36).
7. General (non-Bing) Torchlight math (Rehan / Spectral Slash side, `buildParser.ts`) was not revalidated this session.

---

## 4. Todo list toward the optimizer (suggested order)

1. **Commit the poorchlight reader** (uncommitted: `tli_dump/src/combat.rs`, `main.rs`, `portable.rs`, `inspector.rs`,
   `docs/MEMORY_LAYOUT.md`, `README.md` — `--combat-json`, `--combat-watch`, `--cast-watch`, `--ui-json`, probes). Ask
   the user before committing in that repo.
2. **Replace fitted constants with mechanics** (§2), one A/B each, 30s windows, prediction written first.
3. **Second and third calibration builds**: the user's July export and a scraped Pro Build re-created in game (or
   another character) — a fit on one build is not a model. Keep every measurement in a test.
4. **Close the gaps in §3** (1H weapons, Hasten, mallet/claymore, projectile speed, skill levels).
5. **Coverage for the optimizer's search space**: every craftable affix (`data/affix_library.json`), every slate
   (divinity) node, pedigree, talent node and memory line must map to edits or be explicitly irrelevant — run
   `pnpm bing diagnose` and drive `unknown` to zero across many scraped builds. Talent reallocation needs the tree
   graph (point thresholds, `fillTreesFromNative`, Inverse Image/prism rules) as a searchable structure.
6. **Optimizer**: extend `bingProgression.ts` `walk` (greedy, per-FE) to search talents/slates/pedigree jointly
   (beam search or ILP over slot capacities), priced with ETOR history (`data/etor/`). Validate its top
   recommendations in game with `ops.mjs` before trusting them.
7. Re-check the website guide (`/bing`) numbers after each model change (`pnpm page`).

---

## 5. How to work (lessons)

- **Memory first.** `node .claude/skills/tli-game/ops.mjs state` (loadout), `combat.mjs 30 --buffs` (game-time DPS +
  buff uptime + Deterioration stacks), `ops.mjs unequip/restore/aura/equip/gear-restore` (one call, verified, item-id
  restore). Screenshots only to calibrate a new UI.
- **30-second windows** while iterating (user's request); ±~5% noise from Kaleidoscope's 8s rotation.
- **Never move the character** between A and B. Blink only aimed into the trees left of the dummy (blocked).
- Clicks need Torchlight in front (`ops` waits); keys are posted in the background. ESC closes *all* panels including the
  dummy's (its counter keeps running). The bag grid scrolls — `ops` reads `scrollOffset`. Auras with Seal Conversion
  unseal Life when deactivated. The F2 Skill panel pauses the dummy's frame counter.
- If results look absurd after many gear swaps, suspect the game's snapshot bug: log out and back in.
- `pnpm test` must stay green (608 tests); slow guide tests have long timeouts.
