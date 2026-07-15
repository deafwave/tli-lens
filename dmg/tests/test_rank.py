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
