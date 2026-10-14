# Client-data DPS calculator — handoff (2026-10-11)

> **Read `client-dps-exact-handoff.md` first**: memory reads showed the enemy side has three cancelling errors
> (no armor layer, Formation Breaker off, Solar Ring 40) and lay out how to make the model exact from game state.

A second Bing / Hammer of Ash DPS calculator built **only from the game client's own data and code** (no tlidb, no
planner text, no logic from `bing*.ts` / `damageModel.ts`). The legacy model stays untouched; this one lives beside it.

## Current numbers

| build | calculator | evidence |
|---|---|---|
| local DeafwaveB (capture 2026-10-10) | **457.8B** | dummy 449.0B over 2360 s, 467.3B on 10-10; top empowered pummel non-crit 1.961B vs 1.964B measured, explosion 0.777B vs 0.780B; crit 57.05% / 324%, Strength 339 exact |
| 40T pro build 寒山寺40万亿 | **6.012e14** | no measured total exists. Reproduces exactly every value the game shows for it: crit 89.378919% / 802.2%, Damage Bonus 278.3, Erosion 408, Erosion pen 26, Curse Effect 6, Affliction 20.4, Strength 928, all pact-overview and Destiny lines, trait levels, tooltip 269,180,549.66 |

Regenerate with `cd packages/dmg && npx vitest run test/bingClient.test.ts` (prints both). Do not trust these figures
from the doc — rerun.

## Layout

| piece | where |
|---|---|
| native formulas (crit, resistance, armor, stat) | `packages/dmg/src/clientDps.ts`, `test/clientDps.test.ts` |
| modifier pools over compiled records | `packages/dmg/src/clientModel.ts` |
| Bing bomb model | `packages/dmg/src/bingClient.ts` (`bingDps(model, assumptions)`) |
| compiled build data | `packages/dmg/data/client/builds/{local,40t}.json` |
| client tables dumped earlier | `packages/dmg/data/client/{lang_en,lang_zh,skill_damage,constants}.json` |
| tests (sheet values, measured per-hit, counts, tooltip chain) | `packages/dmg/test/bingClient.test.ts` |
| RE tools, evidence, write-up | `../dps-debug/` (`tools/`, `evidence/`, `FINDINGS.md`) — not a git repo |
| plan + ledger with every ruling | `docs/superpowers/plans/2026-10-11-client-dps-model.md`, `.superpowers/sdd/2026-10-11-client-dps-model/progress.md` |

## Pipeline (game running, read-only memory)

```bash
cd ../dps-debug
python tools/loadout.py                                   # live capture (portable + snapshot) -> evidence/loadout_40t.json
python tools/compendium_loadout.py <scraped.json> <slug>  # GUID capture -> evidence/loadout_<slug>.json
python tools/prisms.py [Module.Talent.Mgr.TalentJewelryMgr]   # server-resolved talents -> save as evidence/talents_<slug>.json
python tools/build_model.py <slug>                        # all grants -> evidence/grants_<slug>.json
python tools/run_model.py <slug>                          # interpret behaviour trees -> evidence/model_<slug>.json
python tools/export_model.py <slug>                       # -> rehan_guide/packages/dmg/data/client/builds/<slug>.json
```

`evidence/pagestats_<slug>.json` (optional) carries values read off the pro-build Stats page.
Client build pinned: PE timestamp `0x6aa39847`; config table addresses break on a patch (`tools/allmaps.py` re-finds them).

## What is decoded (all in `../dps-debug/evidence/*.md`)

- Affix path: modifier/talent/servant/stone/buff tables → affix class → `config_affix_effect` behaviour tree → nodes,
  conditions, filters (schemas extracted from the parse functions).
- Expressions: getters, level maps (interpolated), `GetExponential` skill-level bonus (`skill_level_getter.md`).
- Hit composition: weapon local range × skill %, unscaled global adds, per-chunk inc/more masks (`hit_composition.md`).
- Skill level: base + round-half-away(Σ bonuses) (`skill_level_rounding.md`).
- Prisms / Inverse Image from Lua `TalentDataList`; ExtAffix scales with points (`prisms.md`).
- Judgment divinity slate (+70% to slates on its lines) (`damage_bonus_gap.md`); geometry in `tools/loadout.py`.
- Paralysis 4 s refreshing (`paralysis_duration.md`); Flame Core hit clock (`flame_core_cadence.md`).

## Open items

0. **Gem-swap A/Bs on DeafwaveB (2026-10-11):** crit-only support (×1.38), Paralysis (+15% × 1.8, Grudge 55% per
   Flame Core hit) and Corruption (+36% erosion taken) all confirmed per hit — `dps-debug/FINDINGS.md` "Gem-swap A/Bs",
   tests in `bingClient.test.ts`. HoA level on 40T is 33 (Judgment rounds each +1 slate line to +2). Untested on a
   live build: Deterioration beyond 4 ticks (40T: 6 at +45%/tick), HoA above L21. Next queued: HoA gem L20 → L3
   (predicted ×0.379 per hit, `hoa3-swap`).
1. **40T has no measured total.** The account does not own its gear / pacts / prisms; only an owner's dummy run can
   confirm it. The title's "40万亿" is the author's claim (both models land far above it).
2. **Paralysis uptime** (Grudge 55% roll every ~5 s: 3–53% per 34 s window; mean confirmed 22/39 procs) comes from the Flame Core trigger clock fitted on the local hit-watch (158.6
   frames at Sentry frequency ×1.2). Settle by reading Flame Core skill data 695010 / 900433 from `USkillDataMgr`
   while Flame Core is used outside the hideout, or the A/Bs listed in `flame_core_cadence.md`.
3. Legacy-model comparison: on shared effects the gap is itemized to 0.6% (Kaleidoscope turn weighting); the earlier
   model's crit uses 90.64% / 812.2% where the game sheet shows 89.38% / 802.2%.
4. Local loadout: Formation Breaker Sentry speed is +7%, not −7% (`tools/compendium_loadout.py` sign bug; affects only
   Flame Core, not HoA DPS). Pact promotion levels default to `[[1],[1,1],[1,2],[2,2],[2,2]]` for GUID captures.
5. Nothing is committed. `dps-debug` is not a repository.
