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
