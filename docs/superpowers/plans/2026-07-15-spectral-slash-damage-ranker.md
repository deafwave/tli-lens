# Spectral Slash Damage Model & Upgrade Ranker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank damage upgrades for the Rehan Spectral Slash (SS13) build via a researched mechanics table, a pure damage model, and a parser for the planner JSON export.

**Architecture:** Three layers per the spec (`docs/superpowers/specs/2026-07-15-spectral-slash-damage-model-design.md`): `mechanics.md` (researched classification of every modifier), `damage_model.py` (pure stats-dict → DPS), `build_parser.py` (planner JSON + tlidb caches → stats snapshot with loud coverage report), fronted by `rank.py` CLI (sensitivity / compare / apply).

**Tech Stack:** Python 3.13 stdlib only (`json`, `re`, `argparse`, `copy`). Tests: `pytest`. No new dependencies.

## Global Constraints

- Project root: `C:\Users\deafwave\Downloads\rehan_guide` (git repo, branch `main`). All paths below relative to it.
- Build export: `Rehan SS13_update1.json` — use loadout `loadouts.loadouts[0]` ("Full precise auras").
- tlidb caches: `.claude/skills/tli-build/cache/SS12.5-*.json` and `guid-index-SS12.5-en.json`.
- Boss single-target scenario only. No mapping/clear modeling.
- Parser must NEVER silently drop a line: every affix line ends up in exactly one of {matched, ignored-by-rule, unmatched} and the coverage report prints counts + full unmatched list.
- End-to-end target: ≥90% of damage-relevant affix lines parsed.
- Windows + Git Bash: always run python as `python -X utf8` (cp1252 console chokes on game text).
- Model is pure: `damage_model.py` does no file I/O.
- Iron Law: every code task writes its failing test first.

## Snapshot schema (contract between all components)

A single JSON dict. All percentages stored as plain numbers (74 means 74%). Buckets:

```json
{
  "base": {
    "weapon_phys_min": 178, "weapon_phys_max": 178,
    "weapon_flat_cold_min": 126, "weapon_flat_cold_max": 166,
    "gear_phys_pct": 74,
    "weapon_attack_speed": 1.5,
    "skill_weapon_pct": 127,
    "flat_added_min": 0, "flat_added_max": 0,
    "added_damage_effectiveness_pct": 100
  },
  "increased": {"physical": 0, "attack": 0, "melee": 0, "area": 0, "cold": 0, "global": 0, "strength_derived": 0},
  "additional": {"fervor": 0, "combo_finisher_amp": 30, "warcry_buffs": 0, "sealed_life_mana": 0, "blessings": 0, "precise_auras": 0, "misc": 0},
  "enemy_taken": {"frostbite": 0, "numb": 0, "ice_bond": 0, "paralysis": 0, "cold_infiltration": 0, "timid_curse": 0},
  "crit": {"chance_pct": 5, "damage_pct": 150},
  "penetration": {"cold_pct": 0},
  "enemy": {"cold_res_pct": 40},
  "rotation": {
    "starters_per_cycle": 3, "starter_weapon_pct": 100,
    "attack_speed_inc_pct": 0, "finisher_additional_as_pct": -40,
    "clones": 4, "clone_falloff": 0.7
  }
}
```

Semantics (model behavior, fixed):
- `increased.*` values are **summed** into one `(1 + sum/100)` factor.
- `additional.*` and `enemy_taken.*` values are **each** `(1 + v/100)` and multiplied.
- Which real-game modifier lands in which bucket is decided by `mechanics.md` (Task 1) and encoded in the parser's pattern table (Task 7) — the model never changes for a reclassification.

---

### Task 1: Mechanics research → `dmg/mechanics.md`

**Files:**
- Create: `dmg/mechanics.md`

**Interfaces:**
- Produces: one table row per modifier with columns `Modifier | Bucket | Stacks with | Value source | Citation | Confidence`. Bucket values must be snapshot paths (e.g. `additional.fervor`, `enemy_taken.numb`, `no-op`). Tasks 7–8 copy bucket assignments from this file verbatim.

- [ ] **Step 1: Create the skeleton with every modifier as a row, Confidence=unknown**

Full modifier list (from the user, deduplicated): Frostbite (rating/effect/max rating), Paralysis, Warcries + warcry effect + minimum-enemies-affected, Ice Bond, Numb, Combo / Combo Finisher / Combo Damage Enhancement, Fervor, Heart of Animitta "Combo Finish Amplification", crit rating, crit damage, physical crit damage, attack crit rating/damage, "+% attack crit rating for this gear", additional damage lines, %damage, strength, skill area, attack speed (gear + skill), aura effect, support/attack/physical/all-skill levels, Timid curse ring, elemental penetration under 100% phys→cold conversion, armor damage-mitigation penetration, gear phys damage, flat phys damage, sword mainhand + shield offhand implicits, Tenacity/Agility/Focus blessings, additional damage with sealed life+mana, Cold Infiltration, Rehan trait line (Seething Silhouette, Fury's Onslaught, Growing Anger, Rage Infusion, Rage/Berserk), Precise: Fearless / Cruelty / Domain Expansion / Frigid Domain.

- [ ] **Step 2: Research cluster A — core formula & conversion.** WebSearch/WebFetch: `torchlight infinite damage formula increased vs additional`, `torchlight infinite physical to cold conversion double dipping`, `torchlight infinite 序列 伤害计算 转换` (bilibili), tlidb `Damage_Calculation`. Answer: do phys-tagged modifiers apply to converted cold damage? Does armor mitigation apply to fully-converted hits (is armor pen a no-op)? Fill rows, cite URLs.

- [ ] **Step 3: Research cluster B — crit.** Queries: `torchlight infinite critical strike rating chance formula enemy level`, `torchlight infinite crit damage physical attack crit stacking`. Answer: rating→chance curve; are crit damage / phys crit damage / attack crit damage one additive pool? Fill rows.

- [ ] **Step 4: Research cluster C — ailments & enemy-taken.** Queries per mechanic: Frostbite (does effect scale a damage-taken debuff? role of max frostbite rating), Numb, Ice Bond, Paralysis, Cold Infiltration, Timid curse. Determine bucket (`enemy_taken.*` vs `additional.*`) and stacking. Fill rows.

- [ ] **Step 5: Research cluster D — Rehan kit & buffs.** Fervor stacking, Combo Finisher Amplification (does Heart of Animitta add to the skill's inherent +30% or multiply?), warcry buff values × warcry effect, Rehan trait line, Precise auras (+ aura effect scaling), blessings (Tenacity/Agility/Focus), sealed life+mana additional damage. Fill rows.

- [ ] **Step 6: Mark no-ops.** Any modifier research proves irrelevant for this build (candidate: armor mitigation penetration under full conversion) gets Bucket=`no-op` with the citation explaining why. Do not delete rows.

- [ ] **Step 7: Commit**

```bash
git add dmg/mechanics.md && git commit -m "docs: researched mechanics classification table for Spectral Slash build"
```

---

### Task 2: Damage model — single-hit pipeline

**Files:**
- Create: `dmg/damage_model.py`
- Test: `dmg/tests/test_damage_model.py`
- Create: `dmg/tests/__init__.py` (empty), `dmg/__init__.py` (empty)

**Interfaces:**
- Produces: `average_hit(s: dict) -> float` (pre-crit, pre-mitigation finisher hit), `DEFAULT_SNAPSHOT: dict` (the schema above, exactly).

- [ ] **Step 1: Write failing tests**

```python
# dmg/tests/test_damage_model.py
import copy
from dmg.damage_model import average_hit, DEFAULT_SNAPSHOT

def snap(**over):
    s = copy.deepcopy(DEFAULT_SNAPSHOT)
    for path, v in over.items():
        d = s
        keys = path.split(".")
        for k in keys[:-1]:
            d = d[k]
        d[keys[-1]] = v
    return s

def base_only():
    # zero out everything except a 100-100 weapon, 100% skill pct
    s = snap()
    s["base"].update(weapon_phys_min=100, weapon_phys_max=100,
                     weapon_flat_cold_min=0, weapon_flat_cold_max=0,
                     gear_phys_pct=0, skill_weapon_pct=100,
                     flat_added_min=0, flat_added_max=0)
    for bucket in ("increased", "additional", "enemy_taken"):
        s[bucket] = {k: 0 for k in s[bucket]}
    return s

def test_base_hit_is_weapon_times_skill_pct():
    assert average_hit(base_only()) == 100.0

def test_gear_phys_pct_scales_weapon_phys_only():
    s = base_only(); s["base"]["gear_phys_pct"] = 50
    assert average_hit(s) == 150.0

def test_weapon_flat_cold_added_after_gear_phys_pct():
    s = base_only(); s["base"]["gear_phys_pct"] = 50
    s["base"]["weapon_flat_cold_min"] = 10; s["base"]["weapon_flat_cold_max"] = 30
    # (100*1.5 + avg(10,30)) * 100% = 170
    assert average_hit(s) == 170.0

def test_flat_added_scaled_by_effectiveness_and_skill_pct():
    s = base_only()
    s["base"].update(flat_added_min=20, flat_added_max=20, added_damage_effectiveness_pct=50, skill_weapon_pct=200)
    # weapon 100*200% + flat 20*50% = 210
    assert average_hit(s) == 210.0

def test_increased_bucket_is_one_additive_sum():
    s = base_only()
    s["increased"]["physical"] = 50; s["increased"]["attack"] = 50
    assert average_hit(s) == 200.0   # x2.0, NOT 1.5*1.5=225

def test_additional_layers_multiply():
    s = base_only()
    s["additional"]["fervor"] = 20; s["additional"]["misc"] = 20
    assert round(average_hit(s), 2) == 144.0   # 1.2*1.2, NOT 1.4

def test_enemy_taken_layers_multiply_too():
    s = base_only()
    s["enemy_taken"]["frostbite"] = 10; s["enemy_taken"]["numb"] = 10
    assert round(average_hit(s), 2) == 121.0
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "C:/Users/deafwave/Downloads/rehan_guide" && python -X utf8 -m pytest dmg/tests/test_damage_model.py -v`
Expected: FAIL / errors with `ModuleNotFoundError: No module named 'dmg'` or `ImportError: cannot import name 'average_hit'`.

- [ ] **Step 3: Implement**

```python
# dmg/damage_model.py
"""Pure damage model for Spectral Slash (boss single-target).

Bucket semantics are fixed here; WHICH modifier goes in WHICH bucket is
decided by dmg/mechanics.md and encoded in the parser. Pure: no I/O.
"""
import copy

DEFAULT_SNAPSHOT = {
    "base": {
        "weapon_phys_min": 178, "weapon_phys_max": 178,
        "weapon_flat_cold_min": 126, "weapon_flat_cold_max": 166,
        "gear_phys_pct": 74,
        "weapon_attack_speed": 1.5,
        "skill_weapon_pct": 127,
        "flat_added_min": 0, "flat_added_max": 0,
        "added_damage_effectiveness_pct": 100,
    },
    "increased": {"physical": 0, "attack": 0, "melee": 0, "area": 0,
                  "cold": 0, "global": 0, "strength_derived": 0},
    "additional": {"fervor": 0, "combo_finisher_amp": 30, "warcry_buffs": 0,
                   "sealed_life_mana": 0, "blessings": 0, "precise_auras": 0, "misc": 0},
    "enemy_taken": {"frostbite": 0, "numb": 0, "ice_bond": 0, "paralysis": 0,
                    "cold_infiltration": 0, "timid_curse": 0},
    "crit": {"chance_pct": 5, "damage_pct": 150},
    "penetration": {"cold_pct": 0},
    "enemy": {"cold_res_pct": 40},
    "rotation": {"starters_per_cycle": 3, "starter_weapon_pct": 100,
                 "attack_speed_inc_pct": 0, "finisher_additional_as_pct": -40,
                 "clones": 4, "clone_falloff": 0.7},
}


def _weapon_avg(b):
    phys = (b["weapon_phys_min"] + b["weapon_phys_max"]) / 2
    phys *= 1 + b["gear_phys_pct"] / 100
    cold = (b["weapon_flat_cold_min"] + b["weapon_flat_cold_max"]) / 2
    return phys + cold


def average_hit(s, skill_pct=None):
    """Average pre-crit, pre-mitigation hit. skill_pct overrides base.skill_weapon_pct
    (used for starter vs finisher)."""
    b = s["base"]
    pct = (skill_pct if skill_pct is not None else b["skill_weapon_pct"]) / 100
    flat = (b["flat_added_min"] + b["flat_added_max"]) / 2 * b["added_damage_effectiveness_pct"] / 100
    hit = _weapon_avg(b) * pct + flat
    hit *= 1 + sum(s["increased"].values()) / 100
    for v in s["additional"].values():
        hit *= 1 + v / 100
    for v in s["enemy_taken"].values():
        hit *= 1 + v / 100
    return hit
```

(Flat added damage scales by added-damage effectiveness only, not by the skill's weapon % again; if Task 1 research contradicts this, adjust the `hit = _weapon_avg(b) * pct + flat` line and update the corresponding test values in the same commit.)

- [ ] **Step 4: Run tests**

Run: `python -X utf8 -m pytest dmg/tests/test_damage_model.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add dmg/ && git commit -m "feat: damage model single-hit pipeline (buckets: increased sum, additional/enemy-taken multiply)"
```

---

### Task 3: Damage model — crit and mitigation

**Files:**
- Modify: `dmg/damage_model.py`
- Test: `dmg/tests/test_damage_model.py` (append)

**Interfaces:**
- Produces: `crit_multiplier(s) -> float`, `mitigation_multiplier(s) -> float`, `expected_hit(s, skill_pct=None) -> float` (= average_hit × crit × mitigation).

- [ ] **Step 1: Write failing tests (append to test file)**

```python
from dmg.damage_model import crit_multiplier, mitigation_multiplier, expected_hit

def test_crit_multiplier():
    s = snap(); s["crit"] = {"chance_pct": 50, "damage_pct": 200}
    assert crit_multiplier(s) == 1.5          # 1 + 0.5*(2.0-1)

def test_crit_chance_caps_at_100():
    s = snap(); s["crit"] = {"chance_pct": 250, "damage_pct": 300}
    assert crit_multiplier(s) == 3.0

def test_mitigation_res_minus_pen():
    s = snap(); s["enemy"]["cold_res_pct"] = 40; s["penetration"]["cold_pct"] = 15
    assert mitigation_multiplier(s) == 0.75

def test_penetration_cannot_push_res_below_zero():
    s = snap(); s["enemy"]["cold_res_pct"] = 10; s["penetration"]["cold_pct"] = 50
    assert mitigation_multiplier(s) == 1.0    # clamp: mechanics.md row 'penetration'

def test_expected_hit_composes():
    s = base_only()
    s["crit"] = {"chance_pct": 50, "damage_pct": 200}
    s["enemy"]["cold_res_pct"] = 50; s["penetration"]["cold_pct"] = 0
    assert expected_hit(s) == 75.0            # 100 * 1.5 * 0.5
```

- [ ] **Step 2: Run to verify failure**

Run: `python -X utf8 -m pytest dmg/tests/test_damage_model.py -v`
Expected: new tests FAIL with ImportError.

- [ ] **Step 3: Implement (append to damage_model.py)**

```python
def crit_multiplier(s):
    chance = min(s["crit"]["chance_pct"], 100) / 100
    return 1 + chance * (s["crit"]["damage_pct"] / 100 - 1)


def mitigation_multiplier(s):
    # ponytail: clamp effective res at 0; if Task 1 finds res can go negative, relax here
    eff_res = max(0, s["enemy"]["cold_res_pct"] - s["penetration"]["cold_pct"])
    return 1 - eff_res / 100


def expected_hit(s, skill_pct=None):
    return average_hit(s, skill_pct) * crit_multiplier(s) * mitigation_multiplier(s)
```

- [ ] **Step 4: Run tests** — `python -X utf8 -m pytest dmg/tests/test_damage_model.py -v` — Expected: all pass.

- [ ] **Step 5: Commit** — `git add dmg/ && git commit -m "feat: crit and mitigation stages"`

---

### Task 4: Damage model — combo rotation DPS

**Files:**
- Modify: `dmg/damage_model.py`
- Test: `dmg/tests/test_damage_model.py` (append)

**Interfaces:**
- Produces: `cycle_dps(s) -> dict` with keys `dps`, `finisher_damage`, `starter_damage`, `cycle_time`.

- [ ] **Step 1: Write failing tests (append)**

```python
from dmg.damage_model import cycle_dps

def rotation_snap():
    s = base_only()                      # expected_hit == 100 at skill_pct=100
    s["rotation"] = {"starters_per_cycle": 2, "starter_weapon_pct": 100,
                     "attack_speed_inc_pct": 0, "finisher_additional_as_pct": -50,
                     "clones": 4, "clone_falloff": 0.7}
    s["base"]["weapon_attack_speed"] = 1.0
    s["base"]["skill_weapon_pct"] = 100
    s["enemy"]["cold_res_pct"] = 0
    s["crit"] = {"chance_pct": 0, "damage_pct": 150}   # expected_hit == average_hit
    return s

def test_cycle_dps_math():
    r = cycle_dps(rotation_snap())
    # starters: 2 hits * 100 = 200
    assert r["starter_damage"] == 200.0
    # finisher: 100 * (1 + 4 clones * 0.7) = 380
    assert r["finisher_damage"] == 380.0
    # cycle: 2 starters at 1.0 aps (2s) + 1 finisher at 1.0*(1-0.5)=0.5 aps (2s) = 4s
    assert r["cycle_time"] == 4.0
    assert r["dps"] == (200.0 + 380.0) / 4.0

def test_attack_speed_inc_shortens_cycle():
    s = rotation_snap(); s["rotation"]["attack_speed_inc_pct"] = 100
    assert cycle_dps(s)["cycle_time"] == 2.0
```

- [ ] **Step 2: Run to verify failure** — Expected: ImportError on `cycle_dps`.

- [ ] **Step 3: Implement (append)**

```python
def cycle_dps(s):
    """Boss rotation: N starters build points, one finisher spends them.
    Assumes 100% buff uptime (warcry loop); uptime factors live in bucket values."""
    r = s["rotation"]
    aps = s["base"]["weapon_attack_speed"] * (1 + r["attack_speed_inc_pct"] / 100)
    finisher_aps = aps * (1 + r["finisher_additional_as_pct"] / 100)
    starter = expected_hit(s, skill_pct=r["starter_weapon_pct"]) * r["starters_per_cycle"]
    finisher = expected_hit(s) * (1 + r["clones"] * r["clone_falloff"])
    cycle_time = r["starters_per_cycle"] / aps + 1 / finisher_aps
    return {"dps": (starter + finisher) / cycle_time,
            "finisher_damage": finisher, "starter_damage": starter,
            "cycle_time": cycle_time}
```

- [ ] **Step 4: Run tests** — all pass. **Step 5: Commit** — `git commit -am "feat: combo rotation cycle DPS"`

---

### Task 5: Sensitivity engine + `rank.py sensitivity`

**Files:**
- Create: `dmg/rank.py`
- Test: `dmg/tests/test_rank.py`

**Interfaces:**
- Consumes: `cycle_dps`, `DEFAULT_SNAPSHOT` from Task 2/4.
- Produces: `sensitivity(s, perturbations) -> list[dict]` sorted by `delta_pct` desc, each `{"label", "delta_pct"}`; CLI `python -X utf8 -m dmg.rank sensitivity <snapshot.json>`.

- [ ] **Step 1: Write failing tests**

```python
# dmg/tests/test_rank.py
from dmg.rank import sensitivity, STANDARD_PERTURBATIONS
from dmg.tests.test_damage_model import base_only

def test_sensitivity_reports_delta_pct_sorted():
    s = base_only()
    perts = [("+50% increased physical", "increased.physical", 50),
             ("+10% additional misc", "additional.misc", 10)]
    out = sensitivity(s, perts)
    assert out[0]["label"] == "+50% increased physical"
    assert round(out[0]["delta_pct"], 1) == 50.0
    assert round(out[1]["delta_pct"], 1) == 10.0

def test_additional_beats_equal_increased_when_pile_is_fat():
    s = base_only(); s["increased"]["physical"] = 200
    perts = [("+20% increased", "increased.physical", 20),
             ("+20% additional", "additional.misc", 20)]
    out = sensitivity(s, perts)
    assert out[0]["label"] == "+20% additional"

def test_standard_perturbations_cover_every_bucket():
    paths = {p for _, p, _ in STANDARD_PERTURBATIONS}
    for bucket in ("increased.", "additional.", "enemy_taken.", "crit.", "penetration.", "rotation."):
        assert any(p.startswith(bucket) for p in paths), bucket

def test_validate_snapshot_rejects_missing_high_impact_stats():
    import pytest
    from dmg.rank import validate_snapshot
    s = base_only()
    s["base"]["weapon_phys_min"] = s["base"]["weapon_phys_max"] = 0
    s["base"]["weapon_flat_cold_min"] = s["base"]["weapon_flat_cold_max"] = 0
    with pytest.raises(SystemExit):
        validate_snapshot(s)
```

- [ ] **Step 2: Run to verify failure** — ImportError.

- [ ] **Step 3: Implement**

```python
# dmg/rank.py
"""CLI: sensitivity ranking and candidate comparison for the build snapshot."""
import argparse, copy, json, sys
from dmg.damage_model import cycle_dps

STANDARD_PERTURBATIONS = [
    ("+10% increased physical damage", "increased.physical", 10),
    ("+10% increased attack damage", "increased.attack", 10),
    ("+10% increased melee damage", "increased.melee", 10),
    ("+10% increased area damage", "increased.area", 10),
    ("+10% increased cold damage", "increased.cold", 10),
    ("+10% additional damage (new line)", "additional.misc", 10),
    ("+10% Fervor contribution", "additional.fervor", 10),
    ("+10% Combo Finisher Amplification", "additional.combo_finisher_amp", 10),
    ("+10% warcry buff contribution", "additional.warcry_buffs", 10),
    ("+10% Frostbite taken", "enemy_taken.frostbite", 10),
    ("+10% Numb/other taken", "enemy_taken.numb", 10),
    ("+5% crit chance", "crit.chance_pct", 5),
    ("+30% crit damage", "crit.damage_pct", 30),
    ("+10% cold penetration", "penetration.cold_pct", 10),
    ("+10% attack speed", "rotation.attack_speed_inc_pct", 10),
    ("+10% gear physical damage (weapon)", "base.gear_phys_pct", 10),
]


def validate_snapshot(s):
    """Spec guard: refuse to rank when a high-impact stat is missing/zero."""
    problems = []
    b = s["base"]
    if b["weapon_phys_max"] <= 0 and b["weapon_flat_cold_max"] <= 0:
        problems.append("weapon damage is zero")
    if b["weapon_attack_speed"] <= 0:
        problems.append("weapon attack speed is zero")
    if s["crit"]["damage_pct"] <= 0:
        problems.append("crit damage is zero")
    if problems:
        raise SystemExit("snapshot not rankable: " + "; ".join(problems))


def _bump(s, path, delta):
    s = copy.deepcopy(s)
    d = s
    keys = path.split(".")
    for k in keys[:-1]:
        d = d[k]
    d[keys[-1]] += delta
    return s


def sensitivity(s, perturbations):
    baseline = cycle_dps(s)["dps"]
    rows = []
    for label, path, delta in perturbations:
        dps = cycle_dps(_bump(s, path, delta))["dps"]
        rows.append({"label": label, "delta_pct": (dps / baseline - 1) * 100})
    return sorted(rows, key=lambda r: -r["delta_pct"])


def main(argv=None):
    ap = argparse.ArgumentParser(prog="rank")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("sensitivity")
    p.add_argument("snapshot")
    args = ap.parse_args(argv)
    with open(args.snapshot, encoding="utf-8") as f:
        s = json.load(f)
    validate_snapshot(s)
    base = cycle_dps(s)
    print(f"baseline DPS: {base['dps']:,.0f}  (cycle {base['cycle_time']:.2f}s)")
    for r in sensitivity(s, STANDARD_PERTURBATIONS):
        print(f"{r['delta_pct']:+7.2f}%  {r['label']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests** — `python -X utf8 -m pytest dmg/tests/test_rank.py -v` — pass.

- [ ] **Step 5: Smoke the CLI with the default snapshot**

```bash
python -X utf8 -c "import json; from dmg.damage_model import DEFAULT_SNAPSHOT; json.dump(DEFAULT_SNAPSHOT, open('dmg/snapshot.json','w'), indent=1)"
python -X utf8 -m dmg.rank sensitivity dmg/snapshot.json
```
Expected: baseline DPS line + 16 sorted rows, no traceback.

- [ ] **Step 6: Commit** — `git add dmg/ && git commit -m "feat: sensitivity ranking CLI"`

---

### Task 6: Candidate comparison — `rank.py compare` / `rank.py apply`

**Files:**
- Modify: `dmg/rank.py`
- Test: `dmg/tests/test_rank.py` (append)

**Interfaces:**
- Produces: CLI `compare <snapA.json> <snapB.json>` (prints DPS of each + delta%) and `apply <snapshot.json> <path> <delta>` (e.g. `apply dmg/snapshot.json additional.misc 25`), plus `compare_snapshots(a, b) -> float` (delta %).

- [ ] **Step 1: Failing tests (append)**

```python
from dmg.rank import compare_snapshots, _bump

def test_compare_snapshots_delta_pct():
    a = base_only()
    b = _bump(a, "additional.misc", 100)
    assert round(compare_snapshots(a, b), 1) == 100.0

def test_bump_does_not_mutate_original():
    a = base_only()
    _bump(a, "increased.physical", 50)
    assert a["increased"]["physical"] == 0
```

- [ ] **Step 2: Verify failure** — ImportError on `compare_snapshots`.

- [ ] **Step 3: Implement.** Add to `rank.py`:

```python
def compare_snapshots(a, b):
    return (cycle_dps(b)["dps"] / cycle_dps(a)["dps"] - 1) * 100
```

And in `main()`, add subparsers:

```python
    p = sub.add_parser("compare"); p.add_argument("a"); p.add_argument("b")
    p = sub.add_parser("apply"); p.add_argument("snapshot"); p.add_argument("path"); p.add_argument("delta", type=float)
```

and handling:

```python
    if args.cmd == "compare":
        a = json.load(open(args.a, encoding="utf-8")); b = json.load(open(args.b, encoding="utf-8"))
        print(f"A: {cycle_dps(a)['dps']:,.0f}  B: {cycle_dps(b)['dps']:,.0f}  delta {compare_snapshots(a,b):+.2f}%")
        return 0
    if args.cmd == "apply":
        s = json.load(open(args.snapshot, encoding="utf-8"))
        print(f"{compare_snapshots(s, _bump(s, args.path, args.delta)):+.2f}%  ({args.path} {args.delta:+g})")
        return 0
```

(Restructure `main` so snapshot loading for `sensitivity` stays inside its branch.)

- [ ] **Step 4: Run tests + smoke** — `python -X utf8 -m pytest dmg/tests -v` then `python -X utf8 -m dmg.rank apply dmg/snapshot.json additional.misc 25`. Expected: `+25.00%  (additional.misc +25)` — additional lines pass through 1:1.

- [ ] **Step 5: Commit** — `git commit -am "feat: candidate compare/apply commands"`

---

### Task 7: Parser — extract every affix line from the build export

**Files:**
- Create: `dmg/build_parser.py`
- Test: `dmg/tests/test_build_parser.py`

**Interfaces:**
- Produces: `extract_lines(build_path, loadout_index=0) -> list[dict]`, each `{"source": "gear:one_handed:Shadowless Swordsman's Blade", "text": "+74% Gear Physical Damage", "slot": "one_handed"}`. Text is the description with `#` placeholders substituted by rolled values.

Data shapes (verified against the real file):
- `loadouts.loadouts[i].gear.equipped` = `{slot: itemId}`; `gear.inventory` = list of items.
- Legendary item: `legendaryMods[].description` (already substituted) + `rolledValues`.
- Rare item: `prefixes[]/suffixes[].modifierDescription` with `#` placeholders + `rolledValues[].value`; `baseItem.implicits[].description` (already substituted).
- Skill tree: `skillTree.slots[] = {treeId, nodePoints: {guid: points}}` → resolve via cache `SS12.5-talent-tree-en.json` key `talent-tree/<treeId>/i18n/en` → `tree.nodes[guid].description`, `<br>`-separated lines, each line's values multiplied by allocated points ratio — nodes list per-point text at max points; emit the node description once per node with `points` recorded.
- Hero traits: `hero.traits` = `{level1: guid, ...}` → cache `SS12.5-hero-trait-en.json` key `hero-trait/i18n/en` → `heroes[heroGuid].traits[traitGuid]`.

- [ ] **Step 1: Failing tests**

```python
# dmg/tests/test_build_parser.py
from dmg.build_parser import extract_lines, substitute

BUILD = "Rehan SS13_update1.json"

def test_substitute_hash_placeholders():
    assert substitute("+#% Gear Physical Damage", [74]) == "+74% Gear Physical Damage"
    assert substitute("Adds # - # Cold Damage to the gear", [126, 166]) == "Adds 126 - 166 Cold Damage to the gear"

def test_extract_lines_finds_known_weapon_affix():
    lines = extract_lines(BUILD)
    texts = [l["text"] for l in lines]
    assert "+74% Gear Physical Damage" in texts
    assert any("Critical Strike Rating" in t for t in texts)

def test_every_line_has_source_and_slot():
    for l in extract_lines(BUILD):
        assert l["source"] and l["text"]
```

- [ ] **Step 2: Verify failure** — ImportError.

- [ ] **Step 3: Implement**

```python
# dmg/build_parser.py
"""Planner-JSON -> affix lines -> stats snapshot, with a mandatory coverage report."""
import json, re
from pathlib import Path

CACHE = Path(".claude/skills/tli-build/cache")


def substitute(desc, values):
    out, i = [], 0
    vals = list(values)
    for ch in desc:
        if ch == "#" and vals:
            v = vals.pop(0)
            out.append(f"{v:g}" if isinstance(v, float) else str(v))
        else:
            out.append(ch)
    return "".join(out)


def _load(name):
    with open(CACHE / name, encoding="utf-8") as f:
        return json.load(f)


def _gear_lines(lo):
    inv = {it["id"]: it for it in lo["gear"]["inventory"]}
    for slot, item_id in lo["gear"]["equipped"].items():
        it = inv.get(item_id)
        if it is None:
            continue
        src = f"gear:{slot}:{it.get('displayName', '?')}"
        for m in it.get("legendaryMods") or []:
            yield {"source": src, "slot": slot, "text": m["description"]}
        base = it.get("baseItem") or {}
        for imp in base.get("implicits") or []:
            yield {"source": src, "slot": slot, "text": imp["description"]}
        for aff in (it.get("prefixes") or []) + (it.get("suffixes") or []):
            vals = [rv["value"] for rv in aff.get("rolledValues", [])]
            yield {"source": src, "slot": slot, "text": substitute(aff["modifierDescription"], vals)}


def _tree_lines(lo):
    cache = _load("SS12.5-talent-tree-en.json")
    for slot in lo["skillTree"]["slots"]:
        tree = cache.get(f"talent-tree/{slot['treeId']}/i18n/en", {}).get("tree", {})
        nodes = tree.get("nodes", {})
        for guid, points in slot.get("nodePoints", {}).items():
            node = nodes.get(guid)
            if node is None:
                yield {"source": f"tree:{slot['treeId']}:{guid}", "slot": "tree",
                       "text": f"UNRESOLVED NODE {guid} ({points} pts)"}
                continue
            for line in node["description"].split("<br>"):
                if line.strip():
                    yield {"source": f"tree:{slot['treeId']}:{node['name']}",
                           "slot": "tree", "text": line.strip(), "points": points}


def _trait_lines(lo):
    cache = _load("SS12.5-hero-trait-en.json")["hero-trait/i18n/en"]["heroes"]
    hero = cache.get(lo["hero"]["heroGuid"], {})
    traits = hero.get("traits", {})
    for tier, guid in lo["hero"]["traits"].items():
        t = traits.get(guid)
        if isinstance(t, dict):
            name = t.get("name", guid)
            desc = t.get("description", "")
        else:
            name, desc = guid, str(t or "")
        for line in re.split(r"<br\s*/?>|\n", desc):
            if line.strip():
                yield {"source": f"trait:{tier}:{name}", "slot": "trait", "text": line.strip()}


def extract_lines(build_path, loadout_index=0):
    with open(build_path, encoding="utf-8") as f:
        build = json.load(f)
    lo = build["loadouts"]["loadouts"][loadout_index]
    return [*_gear_lines(lo), *_tree_lines(lo), *_trait_lines(lo)]
```

Note: `_trait_lines` guesses the trait-value shape (`dict` with name/description vs raw string); the first test run against the real cache tells you which — adjust to match the actual shape and keep the fallback branch.

- [ ] **Step 4: Run tests** — `python -X utf8 -m pytest dmg/tests/test_build_parser.py -v`. If trait/tree cache shapes differ from the guess, print one real entry (`python -X utf8 -c "..."`), fix the accessor, re-run. Expected: 3 passed.

- [ ] **Step 5: Commit** — `git add dmg/ && git commit -m "feat: extract affix lines from planner export (gear, tree, traits)"`

---

### Task 8: Parser — pattern table → snapshot buckets + coverage report

**Files:**
- Modify: `dmg/build_parser.py`
- Test: `dmg/tests/test_build_parser.py` (append)

**Interfaces:**
- Consumes: bucket assignments from `dmg/mechanics.md` (Task 1). The PATTERNS below encode the provisional mapping — **after Task 1, reconcile each pattern's bucket against mechanics.md and update in this task's commit.**
- Produces: `parse_build(build_path) -> (snapshot, report)`; `report = {"matched": [...], "ignored": [...], "unmatched": [...], "manual": [...]}`; `classify(text) -> (path, value) | ("ignore", None) | (None, None)`; CLI `python -X utf8 -m dmg.build_parser "Rehan SS13_update1.json" -o dmg/snapshot.json`.

- [ ] **Step 1: Failing tests (append)**

```python
from dmg.build_parser import classify, parse_build

def test_classify_core_patterns():
    assert classify("+74% Gear Physical Damage") == ("base.gear_phys_pct", 74.0)
    assert classify("+12% increased Physical Damage") == ("increased.physical", 12.0)
    assert classify("+8% additional Attack Damage") == ("additional.misc", 8.0)
    assert classify("+45% Critical Strike Damage") == ("crit.damage_pct", 45.0)
    assert classify("+10% Attack Speed") == ("rotation.attack_speed_inc_pct", 10.0)
    assert classify("+11% Cold Resistance") == ("ignore", None)   # defense: irrelevant to DPS
    assert classify("utterly unknown modifier text") == (None, None)

def test_parse_build_produces_valid_snapshot_and_report():
    snap, report = parse_build("Rehan SS13_update1.json")
    from dmg.damage_model import cycle_dps
    assert cycle_dps(snap)["dps"] > 0
    total = sum(len(report[k]) for k in ("matched", "ignored", "unmatched"))
    assert total == len(report["matched"]) + len(report["ignored"]) + len(report["unmatched"])
    assert isinstance(report["unmatched"], list)   # may be non-empty; must exist
```

- [ ] **Step 2: Verify failure** — ImportError on `classify`.

- [ ] **Step 3: Implement (append to build_parser.py)**

```python
import copy
from dmg.damage_model import DEFAULT_SNAPSHOT

NUM = r"([+-]?\d+(?:\.\d+)?)"

# (regex, snapshot-path or "ignore"). Buckets come from dmg/mechanics.md —
# reconcile after Task 1 research and extend as unmatched lines surface.
PATTERNS = [
    (rf"\+{NUM}% Gear Physical Damage", "base.gear_phys_pct"),
    (rf"Adds {NUM} - {NUM} Cold Damage to the gear", "base.weapon_flat_cold"),   # special: two values
    (rf"{NUM} - {NUM} Physical Damage", "base.weapon_phys"),                     # weapon implicit
    (rf"{NUM} Critical Strike Rating", "crit.rating_flat"),
    (rf"{NUM}(?:\.\d+)? Attack Speed", "base.weapon_attack_speed_set"),
    (rf"\+{NUM}% (?:increased )?Physical Damage", "increased.physical"),
    (rf"\+{NUM}% (?:increased )?Attack Damage", "increased.attack"),
    (rf"\+{NUM}% (?:increased )?Melee Damage", "increased.melee"),
    (rf"\+{NUM}% (?:increased )?Area Damage", "increased.area"),
    (rf"\+{NUM}% (?:increased )?Cold Damage", "increased.cold"),
    (rf"\+{NUM}% damage", "increased.global"),
    (rf"\+{NUM}% additional .*[Dd]amage", "additional.misc"),
    (rf"\+{NUM}% Critical Strike Damage", "crit.damage_pct"),
    (rf"\+{NUM}% Attack Critical Strike Rating", "crit.rating_inc_pct"),
    (rf"\+{NUM}% Critical Strike Rating", "crit.rating_inc_pct"),
    (rf"\+{NUM}% Attack Speed", "rotation.attack_speed_inc_pct"),
    (rf"\+{NUM}% Frostbite Effect", "enemy_taken.frostbite"),
    (rf"\+{NUM}% Elemental Penetration", "penetration.cold_pct"),
    (rf"\+{NUM}% Cold Penetration", "penetration.cold_pct"),
    (rf"\+{NUM} Strength", "attributes.strength"),
    # defense/utility lines that never touch DPS:
    (r"(Life|Mana|Energy Shield|Armor|Evasion|.*Resistance|Movement Speed)", "ignore"),
]
_COMPILED = [(re.compile(p, re.IGNORECASE), path) for p, path in PATTERNS]


def classify(text):
    for rx, path in _COMPILED:
        m = rx.search(text)
        if m:
            if path == "ignore":
                return ("ignore", None)
            groups = [g for g in m.groups() if g is not None]
            return (path, float(groups[0]) if groups else 0.0)
    return (None, None)


def _apply(snap, extras, path, value, line):
    """Route a classified value into the snapshot. Special paths handled here."""
    if path == "base.weapon_phys":
        if line["slot"] == "one_handed":
            m = re.findall(r"\d+(?:\.\d+)?", line["text"])
            snap["base"]["weapon_phys_min"], snap["base"]["weapon_phys_max"] = float(m[0]), float(m[1])
        return
    if path == "base.weapon_flat_cold":
        m = re.findall(r"\d+(?:\.\d+)?", line["text"])
        snap["base"]["weapon_flat_cold_min"] = float(m[0]); snap["base"]["weapon_flat_cold_max"] = float(m[1])
        return
    if path == "base.weapon_attack_speed_set":
        if line["slot"] == "one_handed":
            snap["base"]["weapon_attack_speed"] = value
        return
    if path.startswith(("crit.rating", "attributes.")):
        extras.setdefault(path, 0.0)
        extras[path] += value * line.get("points", 1) if line["slot"] == "tree" else value
        return
    d = snap
    keys = path.split(".")
    for k in keys[:-1]:
        d = d[k]
    d[keys[-1]] += value * (line.get("points", 1) if line["slot"] == "tree" else 1)


def parse_build(build_path, loadout_index=0):
    snap = copy.deepcopy(DEFAULT_SNAPSHOT)
    # start numeric buckets from zero; DEFAULT keeps only structural/skill constants
    for bucket in ("increased", "additional", "enemy_taken"):
        snap[bucket] = {k: 0 for k in snap[bucket]}
    snap["additional"]["combo_finisher_amp"] = 30   # skill-inherent, per tlidb Spectral_Slash
    report = {"matched": [], "ignored": [], "unmatched": [], "manual": []}
    extras = {}
    for line in extract_lines(build_path, loadout_index):
        path, value = classify(line["text"])
        if path is None:
            report["unmatched"].append(line)
        elif path == "ignore":
            report["ignored"].append(line)
        else:
            _apply(snap, extras, path, value, line)
            report["matched"].append({**line, "path": path, "value": value})
    snap["_extras"] = extras          # crit rating, strength: converted in Task 9
    return snap, report


def print_report(report):
    m, i, u = (len(report[k]) for k in ("matched", "ignored", "unmatched"))
    total = m + i + u
    pct = 100 * (m + i) / total if total else 0
    print(f"coverage: {m} matched, {i} ignored, {u} UNMATCHED of {total} lines ({pct:.0f}% handled)")
    for line in report["unmatched"]:
        print(f"  UNMATCHED [{line['source']}] {line['text']}")


def main(argv=None):
    import argparse, sys
    ap = argparse.ArgumentParser(prog="build_parser")
    ap.add_argument("build"); ap.add_argument("-o", "--out", default="dmg/snapshot.json")
    args = ap.parse_args(argv)
    snap, report = parse_build(args.build)
    print_report(report)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(snap, f, indent=1)
    print(f"snapshot -> {args.out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests, then run the CLI on the real build and read the unmatched list.** Extend PATTERNS for high-frequency unmatched lines that mechanics.md classifies (do not chase one-off utility text). Re-run until handled ≥90% or every remaining unmatched line is a mechanic that belongs in Task 9's manual overrides.

Run: `python -X utf8 -m dmg.build_parser "Rehan SS13_update1.json" -o dmg/snapshot.json`

- [ ] **Step 5: Commit** — `git add dmg/ && git commit -m "feat: classify affix lines into snapshot buckets with coverage report"`

---

### Task 9: Manual overrides + derived stats + end-to-end

**Files:**
- Create: `dmg/manual_overrides.json`
- Modify: `dmg/build_parser.py`
- Test: `dmg/tests/test_e2e.py`

**Interfaces:**
- Consumes: `mechanics.md` rows whose values can't come from affix text (skill/support gem multipliers, Fervor stack count × per-stack value, warcry buff totals, blessings, precise auras, Frostbite/Numb/Ice Bond/Paralysis magnitudes, crit rating→chance conversion, strength→damage conversion).
- Produces: `dmg/manual_overrides.json` — same shape as snapshot buckets, deep-merged (added) over the parsed snapshot; every entry carries a `_source` sibling comment key. Final `parse_build` output is model-ready with `_extras` resolved.

- [ ] **Step 1: Failing e2e test**

```python
# dmg/tests/test_e2e.py
from dmg.build_parser import parse_build
from dmg.damage_model import cycle_dps

def test_real_build_end_to_end():
    snap, report = parse_build("Rehan SS13_update1.json")
    handled = len(report["matched"]) + len(report["ignored"])
    total = handled + len(report["unmatched"])
    assert handled / total >= 0.90, [l["text"] for l in report["unmatched"]]
    assert "_extras" not in snap or snap["_extras"] == {}   # everything converted
    r = cycle_dps(snap)
    assert r["dps"] > 0 and r["cycle_time"] > 0

def test_manual_overrides_are_loaded_and_cited():
    import json
    overrides = json.load(open("dmg/manual_overrides.json", encoding="utf-8"))
    assert "_sources" in overrides and len(overrides["_sources"]) > 0
```

- [ ] **Step 2: Verify failure.**

- [ ] **Step 3: Implement.** In `parse_build`, after the line loop:
  1. Load `dmg/manual_overrides.json` if present; for each bucket key, **add** its value into the snapshot (same `_bump` semantics); store its `_sources` list nowhere in the snapshot (report-only: append to `report["manual"]`).
  2. Convert `_extras`: `crit.rating_flat`/`crit.rating_inc_pct` → `crit.chance_pct` using the curve mechanics.md documents (if research found none, overrides must supply `crit.chance_pct` directly and the conversion asserts it did); `attributes.strength` → `increased.strength_derived` per mechanics.md conversion rate. Delete `_extras` when empty.
  3. Populate `dmg/manual_overrides.json` with the real researched values for: Fervor total, warcry buffs × warcry effect, Combo Finisher Amplification beyond the inherent 30 (Heart of Animitta), sealed life+mana additional, blessings, precise auras, Frostbite/Numb/Ice Bond/Paralysis/Cold Infiltration/Timid magnitudes, skill/support multipliers folded into `base.skill_weapon_pct` or `additional.misc` per mechanics.md. Each with a `_sources` entry (`"additional.fervor": "mechanics.md#fervor"`).

- [ ] **Step 4: Run full suite** — `python -X utf8 -m pytest dmg/tests -v` — all pass, coverage ≥90%.

- [ ] **Step 5: Commit** — `git add dmg/ && git commit -m "feat: manual overrides, derived stats, end-to-end pipeline"`

---

### Task 10: Produce the review bundle

**Files:**
- Create: `dmg/RANKINGS.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Generate final snapshot + rankings**

```bash
python -X utf8 -m dmg.build_parser "Rehan SS13_update1.json" -o dmg/snapshot.json
python -X utf8 -m dmg.rank sensitivity dmg/snapshot.json
```

- [ ] **Step 2: Write `dmg/RANKINGS.md`** containing: (a) the coverage report verbatim, (b) baseline DPS + full sensitivity table, (c) top-5 upgrade recommendations in prose (each: what to buy/roll, why it ranks where it does, which mechanics.md rows drive it), (d) list of no-op stats to stop paying for, (e) caveats (unknown-confidence mechanics rows and how wrong they could make the ranking).

- [ ] **Step 3: Full test suite + commit**

```bash
python -X utf8 -m pytest dmg/tests -v
git add dmg/ && git commit -m "docs: first upgrade ranking bundle for review"
```

---

## Deliverables for user review (the "bundles")

1. `dmg/mechanics.md` — the damage formula, cited, per modifier.
2. `dmg/RANKINGS.md` — coverage report, sensitivity table, recommendations.
3. `dmg/snapshot.json` — the parsed build (inspectable/hand-editable).
4. Working CLI: `rank sensitivity | compare | apply`, `build_parser`.
