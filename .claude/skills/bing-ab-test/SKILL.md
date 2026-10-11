---
name: bing-ab-test
description: "Use when measuring anything on the Torchlight: Infinite training dummy to confirm or change the Bing / Hammer of Ash DPS model — an A/B with a support, aura, skill or gear piece off or swapped, a baseline for a new calibration build, a throw-rate or Deterioration-stack read — or when reviewing such a measurement. Triggers: in-game A/B, dummy DPS, combat.mjs, ops.mjs unequip/equip, predicted vs measured, calibrate against the game."
---

# bing-ab-test

One A/B tests one model claim against the dummy. The prediction is logged **before** the game is touched, and the
result lands in a vitest case. Game control details live in the `tli-game` skill; this is the protocol.

Needs: elevated shell, the running client with the character at the lv85 dummy, `../poorchlight/target/release/tli_dump.exe`.
Run from the repo root; `O="node .claude/skills/tli-game/ops.mjs"; C="node .claude/skills/tli-game/combat.mjs"`.

## Protocol

1. **Hold the game.** You are its only driver: no other agent, no leftover shell loop running `ops`/`combat`/`tli_dump`.
   The user may be using the PC — never set `TLI_FORCE_FLICK`; `ops` waits for Torchlight to come to front.
2. **Preflight from memory, not questions:**
   - `$O state > ../scratch/state-before.txt` — skills, auras, equipped gear with item ids; the Skill panel must be closed.
   - `cat ../scratch/gear-swaps.json` is `[]` (no swap left from an earlier run).
   - every bag item the A/B needs is on the gear page: `tli_dump --ui-json` → `gear.bag` (`page` 100).
   - `$C 5 --label preflight` prints a non-null `dps` (the dummy is counting) and the game `speed` v.
   Something missing that memory cannot fix (an item to buy, a relog, a trait change, a restarted dummy count) is a
   user ask: put it in your report and do the parts that don't need it. Don't wait mid-task.
3. **Predict, logged, before the first window** (after the preflight reads is fine). From `packages/dmg`:
   `npx tsx ../../.claude/skills/bing-ab-test/predict.ts <build.json> --label <label> --drop "<source regex>"`
   (or `--vs <variant.json>` for gear swaps, `--set/--mul <path>=<n>` for tweaks, `--both` for a state shared by A and B;
   source labels: `tli-game/sources.ts`). It appends `{label, at, ratio}` to `../scratch/predictions.jsonl`. Use the
   **same label** for the B state in step 4 — that pair is how a reviewer checks the prediction came first. A
   prediction that is not a DPS ratio (a throw rate, a stack count) gets its own JSON row appended to the same file.
   A candidate rule the code doesn't implement yet: emulate it with `--set` on its parameter, or a local uncommitted
   switch, and log each candidate's number the same way.
4. **Measure A-B-A, standing still** (never move between windows; Blink only aimed at 800,800 into the trees).
   `combat.mjs`'s argument is **wall** seconds; size windows to 30 game-seconds: `W=$(( (30 * 100 + v100 - 1) / v100 ))`
   with v100 = 100 × the preflight `speed` (0.78 → 39).
   - A: `$C $W --label <label>-a1 --buffs`, twice
   - change: `$O unequip …` / `$O aura … off` / `$O equip …`, then `sleep 10` (buffs and stacks settle)
   - B: `$C $W --label <label> --buffs`, twice
   - restore: `$O restore` / `$O aura … on` / `$O gear-restore`, then `sleep 10`
   - A: `$C $W --label <label>-a2 --buffs`, twice

   Windows are **30 game-seconds** (the user's choice; about ±5% per window from Kaleidoscope's 8s rotation). Use
   `dps` — game time — never `wallDps`. Ratio = mean of the four A windows ÷ mean of the two B windows.
5. **Void a state and re-run it** when: `gameS` < 28; an always-on buff (the four Precise auras, Feline Stimulant,
   Attack Aggression, `target:Timid`) is below 100% in `uptime`; the A₁ and A₂ means differ by more than 3% (moved,
   drift, or the game's snapshot bug — absurd numbers after many swaps mean the user logs out and back in);
   logged positions differ, once `combat.mjs` logs them.
6. **Decide:** for DPS ratios, |measured ÷ predicted − 1| ≤ 5% confirms; > 10% refutes; in between, two more windows
   per state, then 7% decides. A task card's own tolerance for another quantity (stacks, throw rate) wins for that quantity. Changing a constant after you've seen the result is a **fit**: call it one, and every other measured case
   must still pass at its existing tolerance.
7. **Leave the game as found:** `$O close`; `$O state` matches `state-before.txt`, item ids included; `gear-swaps.json` is `[]`.
8. **Record:** add the case to a test with the measured value and the comment
   `// measured ÷1.414 (2026-10-10, label timid-off); predicted ÷1.390 first`. Add the label and confidence to the
   `docs/mechanics.md` row. Measurements live outside git (`../scratch/*.jsonl`), so paste the rows you used into
   your report.

## Quick reference

| need | command |
|---|---|
| model sources behind a stat | `cd packages/dmg && npx tsx ../../.claude/skills/tli-game/sources.ts <build.json> "<path regex>"` |
| prediction | `predict.ts <build.json> --label x --drop "re"` (from `packages/dmg`) |
| one window | `$C 30 --label x --buffs` → `../scratch/measurements.jsonl` (`dps`, `gameS`, `speed`, `uptime`, `stacks`) |
| burst / throw frequency | `combat.mjs` keeps each run's capture as `../scratch/watch/<label>.csv` (`<label>-2.csv`, …); `node .claude/skills/bing-ab-test/throw-period.mjs <csv>…` (compare states by ratio: 2 bombs per throw) |
| loadout / swaps | `$O state`, `$O unequip/restore/aura/equip/gear-restore/close` (tli-game) |
| a one-off model script | write it to `../scratch/<name>.ts` and run `npx tsx` on it — on Windows a multi-line `npx tsx -e` is cut at the first newline |

## Red flags — stop and fix before going on

- Measuring a label that has no `predictions.jsonl` row yet.
- Re-predicting with a new constant after seeing the result, and reporting it as a confirmation.
- Editing a tolerance or a measured value in `import.test.ts`.
- Moving or Blinking between windows; pressing ESC (it closes the dummy panel); leaving the Skill panel open (it
  pauses the dummy's clock); an aura left off (Seal Conversion auras unseal Life).
- Asking the user something `ops state`, `--ui-json` or `combat.mjs 5` can answer.
