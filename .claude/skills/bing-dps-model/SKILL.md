---
name: bing-dps-model
description: "Use when changing or extending the Bing / Hammer of Ash DPS model in packages/dmg — mapping an unknown or UNMODELED line, adding a mechanic, replacing a fitted constant, importing a new build, or when a Bing DPS number looks wrong. Triggers: bingAffixMap, bingImport, bingLedger, bingKit, cycleDps, bombRotation, pnpm bing diagnose, unknown line, irrelevant, coverage, Obliterate, Deterioration, hits_per_bomb."
---

# bing-dps-model

The Bing model turns a planner export (or a scraped build) into ledger sources, composes them into a `Snapshot`, and
prices it with `cycleDps`. Every mechanic is a `docs/mechanics.md` row; every in-game number is a test. Never quote
test counts or DPS figures from docs — run the commands below; docs go stale.

## Pipeline

| stage | where | what |
|---|---|---|
| import | `bingImport.ts` `importBing(payload, 0, nativeTalents, nativePrisms)` | → `{ sources, lines, snapshot, kit }`; each line is `mapped` / `irrelevant` / `structural` / `unknown` |
| affix text | `bingAffixMap.ts` `affixEdits(text, key)` | `RULES` (regex → edits), `IRRELEVANT` (regex → reason), `UNMODELED` (targets `compose` ignores → unknown) |
| skills, supports, traits, pacts | `bingKit.ts` | kit sources (Sentry engine, Empower block, auras, Bull's Rage) |
| ledger | `bingLedger.ts` `Source`, `effective()`, `compose(BING_ZERO, …)` | `requires`/`provides` gate sources; `compose` derives crit, Strength, attack speed, throw rate |
| season | `seasons.ts` `applySeason(snap, "ss13")` | gem levels and season numbers |
| price | `damageModel.ts` `cycleDps` → `bombRotation` | the bomb branch (`rotation.bombs_per_throw` set); the else branch is Rehan — never edit it for Bing |

Tools: `pnpm bing diagnose <build.json> --season ss13` (line counts, `UNMODELED` lines, top ablations, the
`UNVERIFIED` assumptions in `bingDiagnose.ts`); `cd packages/dmg && npx tsx ../../.claude/skills/tli-game/sources.ts
<build.json> "<path regex>"` (which sources feed a snapshot path); `bing-ab-test/predict.ts` (an A/B prediction).
Fitted constants are listed in `docs/bing-dps-validation-handoff.md` §2 — a new fitted number gets a row there.

## Which test

| change | test |
|---|---|
| an affix rule or irrelevant entry | `test/bing1/affix-map.test.ts` — a direct `affixEdits` case; the library-unknowns snapshot follows |
| importer / kit behaviour, a scraped build's unknowns | `test/bing1/import.test.ts` |
| an in-game A/B or gear swap | `import.test.ts` "model ablations match" / "gear swaps", or `calibration-<slug>.test.ts` |
| hit, crit, Deterioration or bomb math | `test/damageModel.test.ts` |
| `compose` / `effective` | `test/bing1/ledger.test.ts` |
| progression / optimizer | `test/bing1/progression.test.ts` |

`test/bing1/blast-nova.test.ts` is the July step-by-step spec: historical, keep it green.

## Mapping an unknown line

1. **Full text and origin.** `diagnose` prints `UNMODELED <source> | <text>`. A talent or slate node can be multi-line —
   read the whole node in the vendored catalog; its other half may already be classified.
2. **Evidence.** In-game text beats tlidb (tlidb-lookup). Note confidence: confirmed / inferred / reported.
3. **Classify:**
   - **mapped** — edits on paths that `compose`/`cycleDps` read (check with `sources.ts`; anything in `UNMODELED` is not
     read yet).
   - **irrelevant** — the line cannot change anything the model reads: damage, crit, speed, cadence, uptime, charges,
     stacks. The reason names why (defense only, minion only, a tag Hammer of Ash lacks — its tags are in the
     `HOA_LEVEL` comment). Cooldown and duration lines are not irrelevant by default: Bull's Rage uptime and the charge
     engines depend on them, so a line that would move a fitted constant stays **unknown** until that constant is derived.
   - **undecided** — leave it unknown and report it. Never move a line to irrelevant to make a coverage test pass; a
     coverage test that cannot honestly reach zero pins the leftover list, each entry with its reason, and stays green.
4. **Row first:** the `docs/mechanics.md` row (`#bing-affix-map` or its own anchor) with citation and confidence.
5. **Test first:** the failing case from the table above, then the rule.
6. **Check the builds:** `pnpm bing diagnose data/bing1/scraped/*.json --season ss13` before and after. Put the DPS
   change per build in the commit message; a mapped line that moves the user's build must be explained.
7. **Snapshot:** `npx vitest run test/bing1/affix-map.test.ts -u`, then `git diff` the `.snap`: it removes exactly the
   lines you classified. Anything else → `git checkout` the `.snap` and find out why.

## After any Bing model change

`pnpm test && pnpm page`, then `git diff --stat packages/page/src/data` — every changed generated file is explained by
the change (the `/bing` guide numbers come from `pnpm page`'s bing pagedata; `CLAUDE.md` invariant 3's `pnpm rank` is
the Rehan page). Never loosen a tolerance or edit a measured value to get green.

## Red flags

| thought | reality |
|---|---|
| "The doc says N tests / X B, so…" | Run `pnpm test` / `diagnose`. Docs lag the code. |
| "Irrelevant — it's utility" | Utility that sets cadence or uptime is model input. Name the reason or leave it unknown. |
| "Fit this constant to the new build" | One build is not a model. Report the divergence; the constant gets a §2 row. |
| Editing the `cycleDps` else branch | That's the Rehan path, load-bearing for its page. Bing is `bombRotation`. |
| Dividing the Obliterate share by bombs per throw | Obliterate gates the throw; all its bombs inflict. |
| Encoding a talent node at its printed value | Node lines are per point (a 3-point node is ×3); notables are single. |
| "Proximity lines are always on at the dummy" | Under Firepower Coverage the character stands at range; Solar Ring's radius decides (diagnose `proximity`). |
| A ratio measured with an aura off after a gear swap | Unequipping gear can drop energy and auras: a contaminated A/B (`bing-ab-test` void rules). |
| "Zero unknowns, so coverage is complete" | Coverage counts only lines the importer emits. A support or source it drops without emitting a line never shows up as unknown — check what was dropped, too. |
| Leaving a probe script running in the background | Run probes in the foreground with `timeout`; kill what you start. Write probes to `../scratch/<name>.ts` — on Windows a multi-line `npx tsx -e` is cut at the first newline. |
