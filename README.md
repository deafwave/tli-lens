# Rehan SS13 — Spectral Slash Damage Model & Upgrade Ranker

Ranks damage upgrades for the Torchlight: Infinite Rehan (Seething Silhouette) Spectral Slash build by parsing the planner export against a researched damage formula.

## The bundle

| File | What it is |
|---|---|
| `dmg/RANKINGS.md` | **Start here** — sensitivity table, top-5 recommendations, no-op stats, caveats |
| `dmg/mechanics.md` | The damage formula: every modifier classified (bucket, stacking, citation, confidence) |
| `dmg/snapshot.json` | Your parsed build as model input (hand-editable) |
| `dmg/manual_overrides.json` | Researched values the parser can't read from affix text, each cited |
| `dmg/build-inputs.md` | Skills/supports/auras extracted from the current loadout |
| `docs/superpowers/` | Design spec and implementation plan |

## Usage

```bash
make snapshot   # parse the build export -> dmg/snapshot.json + coverage report
make rank       # sensitivity table: "+X stat -> +Y% boss DPS"
make test       # 29 tests incl. end-to-end (>=90% affix coverage enforced)

# candidates:
python -X utf8 -m dmg.rank apply dmg/snapshot.json penetration.cold_pct 40
python -X utf8 -m dmg.rank compare dmg/snapshot.json other-snapshot.json
```

Scenario: boss single-target, full combo rotation. The parser targets the planner's current loadout (`-l N` to override). Unparsed affix lines are always printed — never silently dropped.
