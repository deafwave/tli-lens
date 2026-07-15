"""Pure damage model for Spectral Slash (boss single-target).

Bucket semantics are fixed here; WHICH modifier goes in WHICH bucket is
decided by dmg/mechanics.md and encoded in the parser. Pure: no I/O.
"""

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


def crit_multiplier(s):
    chance = min(s["crit"]["chance_pct"], 100) / 100
    return 1 + chance * (s["crit"]["damage_pct"] / 100 - 1)


def mitigation_multiplier(s):
    # ponytail: clamp effective res at 0; if mechanics.md finds res can go negative, relax here
    eff_res = max(0, s["enemy"]["cold_res_pct"] - s["penetration"]["cold_pct"])
    return 1 - eff_res / 100


def expected_hit(s, skill_pct=None):
    return average_hit(s, skill_pct) * crit_multiplier(s) * mitigation_multiplier(s)


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
