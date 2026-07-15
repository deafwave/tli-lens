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
    # weapon 100*200% + flat 20*50% = 210 (flat scales by effectiveness, not weapon pct)
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
