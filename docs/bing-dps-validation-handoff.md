# Bing / Hammer of Ash — DPS model validation handoff

Written 2026-10-10 for an agent that runs subagents and has **full control of the game**
(Torchlight: Infinite, `torchlight_infinite.exe`; it was PID 35124 on 2026-10-09 — re-check).
Repo: `rehan_guide` (GitHub `deafwave/rehan-torchlight`, push to `main`; another agent also
edits the importer and pushes there — always `git fetch && git rebase torchlight/main` before pushing). Memory reader:
sibling repo `poorchlight` (`tli_dump`).

**The question:** the DPS calculator disagrees with reality by more than any single mechanic
explains, in opposite directions on two builds. Find which mechanics are wrong, fix them in the
model with a cited `docs/mechanics.md` row and a failing test first, and leave the calculator
validated against in-game measurements.

---

## 1. The discrepancy

| Build | Model (SS13) | Reference | Off by |
|---|---|---|---|
| User's own build, July export `data/bing1/real_buld_3.json` imported automatically | **484B** | measured **557.75B** (span mean, lv85 training dummy, 2026-07-20) | **−13%** |
| Same build, hand-encoded snapshot `data/bing1/real_buld_3_snapshot.json` | 596.2B | 557.75B | +6.9% |
| Scraped Pro Build 「寒山寺40万亿」 `data/bing1/scraped/hanshan-40t.json` | **129.6T** | title says **40万亿 = 40T** | **×3.2** |
| Scraped Pro Build 「寒山寺宾一5000火 1w亿」 `data/bing1/scraped/pro-1t.json` | **246.4B** (was 23.5B) | title **1w亿 = 1T**; the user confirms it is **training-dummy DPS** | **×4 low** |

- The hand snapshot only reaches +6.9% through four **residuals** with no export line behind them
  (flat 30 phys / 22.1 erosion adds, +36% crit damage, ×1.091 attack speed, Haze prism) — see
  `mechanics.md#bing-ledger`. The automatic import has none of them.
- The 40T title is the only reference for that build. **Unknown: what that number measures**
  (which dummy/boss, span vs peak, season). Settle this first if at all possible — it can be the
  whole gap.
- The model is now **too high on one build and too low on another** (40T ×3.2 high, 1T ×4 low), so
  no global constant fixes both. Real ratio 40T/1T = 40; model ratio = 526 — something scales ~13×
  too steeply between a mid build and a maxed one (suspects: skill-levels ÷2.36, Strength 439% vs
  96% additional, the 40T-only switches in §2), or the 40T figure is not dummy DPS (§5).
- Run `pnpm bing diagnose data/bing1/scraped/pro-1t.json data/bing1/scraped/hanshan-40t.json data/bing1/real_buld_3.json --season ss13`
  to reproduce every table below.

**Fixed 2026-10-10 from the 1T build (23.5B → 246.4B):** Ice Bond is a **Sentry** skill, so with
Activation Medium: Motionless + Formation Breaker it is the n=1 charge engine (was Flame-Core-only,
×3.65); Entangled Pain (curse, +39% additional DoT taken, ticks only, ×1.33); Bull's Rage (Euphoria
+27% additional Melee, ×1.26); Tenacity Blessing with Onslaughter **Sacrifice** (+8% additional per
stack, 4+2 stacks, ×1.59 — was discarded as "mechanic this build does not use"); signed attack-speed
lines (Great Strength −10%). `mechanics.md#bing-sentry-curse`, `#tenacity`. Still unmodeled on it:
Tyrant's "**Unable to trigger Empower Skills**" (Ice Bond and Bull's Rage are Empower-tagged and
auto-cast by Activation Medium — does the glove stop that? if so the n=1 engine is wrong and the
gap grows), "+1 Max Charges", "+30% Bond Gaining Speed", 50% Lightning→Fire (moot: all→Erosion).

## 2. Where the model is confident vs where it is not

**Measured on the user's rig (bing1 spec + mechanics.md#real-build; trust these):**
additive increased pool; additional = product; Passivation ×1.60; Saintess lever ÷1.5765 (meas
÷1.574); Timid ÷1.390 (meas ÷1.365) — which also proves **Deterioration inherits the hit's
damage-taken multipliers** (89% of DPS is ticks, yet removing a hit-taken line cost the full
factor); det/hit ratio 10.59 (joint solve); Deterioration chance linear, capped 100; tick ramp
additive; duration lines **sum**; strict tick grid at 0.325s from a 60fps frame count (97±1 frames
= 1.63s); 99-stack cap (tlidb); attack speed **linear** on true DPS; Blast Barrage EV; Kaleidoscope
rings full value; Broken-Sun A/B ÷2.88; Kitty/Bug pactspirits at face; conversion overflow 50/50.

**Never measured on Bing — the suspects.** `pnpm bing diagnose` switches each to its
conservative reading (`packages/dmg/src/bingDiagnose.ts` `UNVERIFIED`):

| id | assumption | 40T build ÷ | July ÷ | how to test in game |
|---|---|---|---|---|
| skill-levels | each HoA level above 21 is ×1.10 (→30) / ×1.08 (user said "10%/level 21–30, 8% after"; 40T runs ~+9 levels) | **2.36** | 1.00 | swap one "+1 Fire/All Skill Level" slate on/off; predicted ÷1.10 |
| proximity | Solar Ring makes every proximity line (Well Matched, Marksman, "taken by enemies in Proximity") live while standing at range under Firepower Coverage | 1.84 | 1.61 | Broken Sun on/off on the user's rig (July read ÷2.88) |
| corruption | Spindle pair → Lv25 Corruption +44% Erosion taken (value at L25 extrapolated from L20 = 39) | 1.44 | — | needs a Spindle pair |
| low-life | No Loose Ends +40% active (Low Life held) | 1.40 | — | is the 40T build Low Life? |
| profane | Profane always on (+7% det duration, +7% additional Erosion) | 1.39 | — | the duration half may cross a tick boundary — see tick-grid |
| domain | Precise: Domain Expansion "+33% additional **Area** Damage" applied to all HoA damage | 1.36 | — | aura on/off |
| tick-grid | ticks every 0.325s (frame fit) vs the tooltip's 0.33s; **both builds sit within ~0.03s of a tick boundary** (July 1.63s vs 5×0.325 = 1.625; 40T 1.98s vs 6×0.325 = 1.95) | 1.30 | **1.35** | frame-count one stack's ticks; or ±5% duration A/B on the user's rig |
| lucky | Lucky Critical Strike 1−(1−p)² | 1.27 | — | tlidb confirms the rule; the open part is −40% rating + Lucky on a 2H base |
| transition | Dawn Break "Transition" rolls taken at expected value (independent ×) | 1.26 | — | — |
| cursed | "+X% additional vs Cursed" lines live (Timid / Corruption curse) | 1.25 | — | — |
| malleable | Precise: Malleable +30% aura effect (needs an Elite within 10m — assumed via Solar Ring) | 1.17 | — | — |
| corona | corroded Broken Sun "Corona" = +60% taken (Solar Ring +40%) | 1.14 | — | — |
| entangled | Entangled Pain at full uptime (5s / 8s CD) — 1T build ÷1.33 | — | — | curse on/off |
| bulls-rage | Bull's Rage Euphoria at full uptime (6s / 10s CD) — 1T build ÷1.26 | — | — | skill on/off |
| *all at once* | | **÷8** (≈130T → ≈16T) | ÷1.5 | |

**Calibration constants carried from the user's rig to every other build** (not in `UNVERIFIED`
yet — add them): `hits_per_bomb` (geometry fold-in fitted RS-off on the July rig: Firepower Coverage
+50% projectile size, 263% skill area, the Mighty Arrow pair; the 40T build has different area,
no Iron Lion, Blast Barrage L4), `demolisher_empower_mult` M = 3.65 (fitted; the 40T build multiplies
it by Boots of Devastation ×1.53 and Broken Sun ×1.28 → M 7.15 — check these "when Demolisher
Charge is consumed" lines really multiply M rather than add to the +215%), the Broken Sun
area-line delivery 28/41, the skill-level baseline (+1 inside H), and Kitty's Feline Stimulant
being live under Firepower Coverage's auto-throw (measured once, ×1.52).

**Open structural question from July (`docs/bing-hoa-handoff.md` §5.1):** after the 5-tick fix the
model's hits were ~×1.38 hot and ticks ~×1.33 cold on the user's rig — a single ticks-only factor
F ≈ 1.35 fits both (candidates: Forbidden Power ×1.35 or Erosion Amp scope, tick base 80% vs 60%).
Unresolved; it shifts weight between hit-side and tick-side mechanics, which matters for every
ranking.

## 3. Tooling

| Path | What |
|---|---|
| `packages/dmg/src/damageModel.ts` | the model (`cycleDps`; bomb branch; Deterioration incl. 99-stack cap) |
| `packages/dmg/src/bingLedger.ts` | `Source`/`compose` (derives crit incl. Lucky/fixed rating, Str, AS, skill levels, Fervor, lunar memory, knockback); the hand ledger of the July build |
| `packages/dmg/src/bingImport.ts` + `bingKit.ts` | **importer**: planner export → sources → snapshot; line classification; native talents (`fillTreesFromNative`) and prisms incl. **Inverse Image** (`nativePrismLines`) |
| `packages/dmg/src/bingAffixMap.ts` | affix text → edits (mapped / irrelevant / unknown) |
| `packages/dmg/src/bingDiagnose.ts` | `pnpm bing diagnose <files…>`: unmodeled lines, ablation, `UNVERIFIED` switches |
| `packages/dmg/test/bing1/*.test.ts` | living spec (`blast-nova.test.ts` holds every in-game measurement), ledger, import, guide |
| `docs/mechanics.md` | **the mechanics truth**: rows `#real-build`, `#bing-ledger`, `#bing-import`, `#bing-affix-map`, `#det-stack-cap`, `#deterioration` … — every change needs a row first |
| `docs/bing-hoa-handoff.md` | the July handoff (calibration ledger, F≈1.35, SS14 risks) |
| `data/bing1/scraped/` | scraped builds (`compendium` export + `nativeTalents` + `nativePrisms`) |

**Scraping a build from the game** (any Pro Build or Hunter File page open in game; the tab does
not matter — Overview is enough; re-scraping the 1T build with the Talent tab open was byte-identical):

```bash
node scripts/scrape_build.mjs <slug> --stated "<DPS as stated>"   # elevated shell; writes data/bing1/scraped/<slug>.json
pnpm bing diagnose data/bing1/scraped/<slug>.json --season ss13
```

`tli_dump` also writes the **raw** read to `poorchlight/tli_dump/diagnostics/_last_live_snapshot.json`
— it holds data the portable projection drops: `ViewPlayerData.GeniusInfos` (talent node points,
notables) and `EtherealPrismState.Items/Placements` (prism placements incl. the Inverse Image). See
how `data/bing1/scraped/hanshan-40t.json` was assembled (fields `nativeTalents`, `nativePrisms`).

**poorchlight exporter gaps** (fix there so scrapes are complete without hand-assembly):
- no catalog entry for Inverse Image (ConfigBaseId 360701) → its all-or-nothing prism install
  drops **every** placement;
- its talent proof requires a tree's full node list — an Inverse Image overwrites 6 nodes (23 of
  29 for Onslaughter) → all four trees lose allocations;
- Inverse Image rules (verified against an in-game panel screenshot): native node id
  `<tree><col:2><row:2>00` (columns = point thresholds 0…18 → 1…7, rows 1…5); 3×3 source area
  around the center; copies at (8−col, 6−row) overwrite whatever is there; each copy keeps its
  source's points; effect × (1 + roll) by node type — fixed affixes 1224626031 Micro,
  1224626011 Medium (inferred), 1224626051 Legendary.

**DPS measurement**: poorchlight has a DPS-tester macro (`Numpad+`, 30s window, optional R-hold;
`README.md`). The in-game dummy reports a span average and a best-5s; **ratios come from span
means of 3 same-session runs** (spans repeat ±1.3%, 5s-highs ±4.5%); absolutes sanity-check on the
5s-high. Freeze auras across an A/B (unequipping gear can drop energy and silently disable auras).
Never read attack-speed effects off spans (edge loss grows with AS). Full protocol:
`mechanics.md#real-build`, `.claude/skills/bing-dps-model/SKILL.md` (untracked in the main checkout).

**Not yet available (worth building):** a memory reader for the dummy's DPS readout and/or the
character sheet (crit chance, crit damage, attack speed, Strength). poorchlight's
`docs/MEMORY_LAYOUT.md` notes the attribute panel lives in Lua-only `RoleAttrMgr` tables. With it,
every A/B becomes automatic and the intermediate stats (not just DPS) are checkable.

**Gotchas**: Windows + Git Bash; files are LF except some test files (CRLF) and `docs/mechanics.md`
(mixed — edit it byte-preserving, see git history); headless Edge will not start from the elevated
shell — use Playwright's own Chromium (`npx playwright-core install chromium-headless-shell`) for
page checks; vitest's 5s timeout bites walk tests under full-suite load.

## 4. Suggested plan (subagents)

1. **Pin the reference** (researcher): what does 「寒山寺40万亿」 measure? Find the build's source
   (in-game Pro Build page notes, author, Chinese community posts — 寒山寺, Bing, 灰烬之锤, 40万亿).
   Scrape more Pro Builds that carry a DPS figure (any budget) — each is a calibration point:
   open the page in game, dump, export, `pnpm bing diagnose`.
2. **Instrument the game** (engineer, poorchlight): read the dummy DPS readout (and ideally the
   character sheet) from memory; script A/B runs (gear swap via UI automation, run the tester,
   read the result). Also fix the two exporter gaps above.
3. **Run the experiment matrix** on the user's character, ordered by `UNVERIFIED` magnitude ×
   what the user owns: skill-level step, tick-grid (±5% duration around the 5-tick boundary, and a
   frame count), Broken Sun/proximity, Domain Expansion, Lucky, Malleable, Corona, Spindle. Each
   test: model prediction written first, 3 span runs per state, same session, frozen auras.
4. **Fix the model** per result: `mechanics.md` row → failing test in `test/bing1/` → code →
   `pnpm test && pnpm page`. Move resolved items out of `UNVERIFIED`. Re-run `diagnose` on every
   scraped build; the target is all references within the measurement noise.
5. Then re-derive F≈1.35 (§2) and the calibration constants per build (H as a function of skill
   area / projectile speed — `mechanics.md#bing-skill-area` has the measured points).

## 5. User answers (2026-10-10) and what follows

- **The 40T reference is probably measured on Ordrak** (a boss; "whatever China would use"),
  not the lv85 training dummy the model targets (30% elemental / 30% erosion res, no boss
  modifiers). The user also recalls the **training dummy's readout capping around 25T**
  ("5T after 1 second → 25T?" — unverified). So before blaming any mechanic: establish Ordrak's
  resistances / damage reduction / boss-specific modifiers and level, whether Passivation-style
  "vs enemies with more Life" and Deterioration behave differently on it, and whether the dummy
  display caps. Add an `enemy` profile for Ordrak to the model and re-run `diagnose` against both
  targets. This alone may explain most of the ×3.2.
- **The next agent may drive the game** (gear swaps, the DPS tester) — **but the user has little
  spare gear to swap.** Prefer experiments that need no new items: aura / support / curse toggles,
  talent respecs, slate and memory swaps the user owns, ±duration via kismets/slates around the
  tick boundary, standing still vs moving, Broken Sun on/off. Make up for limited A/B options with
  (a) memory reads of the character sheet and the DPS readout (every toggle then checks
  intermediate stats too) and (b) many more scraped Pro Builds with stated DPS figures — each is a
  calibration point at no in-game cost.

Still to ask: which of the `UNVERIFIED` suspects the user can toggle (a Spindle pair, a corroded
Broken Sun, a Lucky source, a Malleable gem, a +1 Fire Skill Level slate).
