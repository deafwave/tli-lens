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

from dmg.damage_model import cycle_dps

def rotation_snap():
    s = base_only()
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
