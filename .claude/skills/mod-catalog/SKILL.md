---
name: mod-catalog
description: "Guides maintenance of the Spectral Slash mod-catalog DPS data (dmg/catalog.py) — how every divinity-slate and hero-memory mod gets its ΔDPS score and how to change scoring rules safely. Use when a catalog score looks wrong, when adding applicability/tier/spawn rules, when regenerating rehan-ss13-progression.html data, or when the user reports a mod that 'doesn't work for this build'. Triggers include: mod catalog, catalog.py, ΔDPS wrong, slate mod score, memory affix score, tier system, rolls on, regenerate catalog."
---

# Mod Catalog DPS Maintenance

## What this system is

`dmg/catalog.py` enumerates every slate mod and memory affix from the tlicompendium
caches (`.claude/skills/tli-build/cache/SS12.5-*.json`), scores each one's **net DPS
impact against this specific build's snapshot** (`dmg/snapshot.json`), and injects the
result into `rehan-ss13-progression.html` between `/*CATALOG-DATA-START*/` and
`/*FREEWINS-DATA-*/` markers. The damage math itself lives in `dmg/damage_model.py`
(pure function); classification regexes live in `dmg/build_parser.py` (`PATTERNS`,
`classify`); researched mechanics and citations live in `dmg/mechanics.md`.

A score is: deep-copy the parsed snapshot → apply **all** of the mod's classifiable
lines via `_apply_stat` → `cycle_dps` ratio vs baseline. Bucket semantics:
`additional.*` and `enemy_taken.*` lines each compound (own multiplier);
`increased.*` sums; `extras.*` paths use closed-form conversions whose constants
**mirror `dmg/manual_overrides.json`** — if overrides change, update the constants
block at the top of catalog.py (FERVOR_EFFECT, CRIT_RATING_MULT, etc.) in the same commit.

## The Iron Law here

**No scoring-rule change without a failing test in `dmg/tests/test_catalog.py` first.**
Every rule in this file exists because the naive version shipped a wrong number that a
human caught. Write the test that reproduces the report, watch it fail, make the
smallest rule change, regenerate, verify, commit with the math in the message.

## Scoring rules and the failure each one prevents

| Rule | Failure it fixed (git evidence) |
|---|---|
| Score the **net effect of all lines**, never the best line | "−20% additional for Weapons / +40% Attack" scored +40; true net is 0.8×1.4 = +12 (`ffb031a`) |
| Chance procs = **expected value** (chance × bonus) | "10% chance to deal +80% additional" scored 80; EV is +8 (`5f9ecf7`) |
| Multiple proc lines in one mod are **roll-tier variants** — apply `max(EV)`, never compound | three 8-EV tiers compounded to +26 (`ffb031a`) |
| "−A% Min / +B% Max Physical" pairs shift the **average roll**: apply (B−A)/2; compounding gives ×0.1×1.8 nonsense | (`ffb031a`) |
| "Critical Strikes do not deal additional damage" **nullifies the whole crit multiplier** (set crit.damage_pct=100) before adding the bonus — scores ≈ −60 for this crit build | +60% mod ranked top instead of bottom (`5f9ecf7`) |
| Whole-mod disqualifiers (`MOD_DISQUALIFIERS`): "Energy Shield is fixed at 0" kills the ES defense — the entire mod is `—`, even though its damage line classifies | ES-zeroing mod ranked #2 (`c1ef56b`) |
| Per-line `NOT_THIS_BUILD` filter: wrong tags (Focus/Spell/Minion/Wilt/Elixir/Projectiles…), impossible states ("at Low Life" for an ES build — but "not at Low Life" stays valid), "empty Skill slot" conditions | Focus-skill and Elixir mods topped the list (`4f86e01`, `c1ef56b`) |
| No trailing `\b` on the tag regex — plurals ("Projectiles", "Minions") must match | plural leak (`ffb031a`) |
| Dual-wield mods and memory `baseStats` are **dropped entirely**, not marked `—` (build committed to 1h+shield; base stats aren't a choice) | catalog noise (`5f9ecf7`, `ffb031a`) |
| Tier + spawn come from the **master bundles** joined by id; named core nodeTypes (nodeType == mod name) normalize to "Core Talent"; identical descs merge with their spawn lists | tier dropdown flooded with 36 core names (`9d5b723`) |

## Conditional (◑) semantics

`CONDITIONAL` marks per-stack / after-X / while-Y wording: the score is a **full-uptime
ceiling**, shown with ◑ in the UI. EV-scored procs and crit-nullify rows clear the flag —
an expected value or a net penalty is not a ceiling.

## Regenerate-and-verify loop (run all of it, every time)

```bash
python -X utf8 -m pytest dmg/tests -q          # all green before regen
python -X utf8 -m dmg.build_parser "Rehan SS13_update1.json" -o dmg/snapshot.json  # only if build changed
python -X utf8 -m dmg.catalog                  # injects CATALOG + FREEWINS into the HTML
node -e "const m=require('fs').readFileSync('rehan-ss13-progression.html','utf8').match(/<script>([\s\S]*)<\/script>/); new Function(m[1]); console.log('parses OK')"
```

Then eyeball the **top and bottom** of the sorted rows — every past bug was visible
there. Gotchas already learned: JSON payloads must use `ensure_ascii=True` (raw
U+2028 in tlidb text breaks JS literals); the `re.sub` replacement must be a lambda
(`\uXXXX` in payloads trips template parsing); run Python as `python -X utf8` on
Windows. Master bundles are gitignored — refetch with
`curl -O https://tlicompendium.com/data-bundles/SS12.5-{divinity-slate,hero-memory}-master.json`
into the tli-build cache.

## Red flags — stop if you think any of these

| Thought | Reality |
|---|---|
| "The headline number is the score" | Compute EV for procs, net for multi-line mods, average for min/max pairs. |
| "This mod is obviously strong" | Check it against THIS build: ES defense, sword+shield, crit-based, no low-life, 5 actives + 4 auras. A mod can be great in general and `—` here. |
| "It's a one-line regex fix, skip the test" | Every one-line regex here shipped a wrong number once. Failing test first. |
| "I'll fix the score in the HTML" | The HTML is generated. Fix catalog.py, regenerate, never hand-edit between markers. |
| "The override constants look unrelated" | They mirror manual_overrides.json. Changing one without the other silently skews every extras-path score. |

## When the user reports a wrong score

1. Find the mod's exact text in the cache (`python -X utf8` + json, search by name/text).
2. Decide which rule class it is: EV, net-lines, applicability, tier/spawn, or a genuinely
   new mechanic (new mechanics also get a row in `dmg/mechanics.md` with a citation).
3. Failing test → smallest rule change → full loop above → commit with the arithmetic
   in the message (e.g. "50%x16 = +8").
