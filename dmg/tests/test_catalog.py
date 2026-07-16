import json
from dmg.catalog import max_roll_text, impact_of, build_catalog

def load_snap():
    return json.load(open("dmg/snapshot.json", encoding="utf-8"))

def test_max_roll_text_uses_range_maxima():
    assert max_roll_text("+#% Critical Strike Damage", "+(38–42)% Critical Strike Damage") == "+42% Critical Strike Damage"
    assert max_roll_text("+#% Skill Area", "+(39–45)% Skill Area") == "+45% Skill Area"
    assert max_roll_text("+16% Attack Speed", "+16% Attack Speed") == "+16% Attack Speed"

def test_impact_of_direct_bucket():
    s = load_snap()
    d = impact_of("penetration.cold_pct", 10, s)
    assert 13.0 < d < 16.0        # matches the sensitivity table row

def test_impact_of_extras_conversion():
    s = load_snap()
    d = impact_of("extras.fervor_effect_pct", 50, s)
    assert d is not None and d > 0
    assert impact_of("extras.support_skill_level", 10, s) is None   # unmodeled

def test_build_catalog_rows_sorted_and_tagged():
    rows = build_catalog()
    assert len(rows) > 100
    deltas = [r["delta"] for r in rows if r["delta"] is not None]
    assert deltas == sorted(deltas, reverse=True)
    assert any(r["cat"].startswith("memory") for r in rows)
    assert any(r["cat"].startswith("slate") for r in rows)
    assert all(set(r) >= {"cat", "name", "text", "bucket", "delta", "cond"} for r in rows)

def test_not_this_build_tags_are_unmodeled():
    rows = build_catalog()
    focus = [r for r in rows if "Focus Skill Damage" in r["text"]]
    assert focus and all(r["delta"] is None for r in focus)

def test_free_wins_lists_underrolled_affixes():
    from dmg.catalog import free_wins
    rows = free_wins()
    assert isinstance(rows, list)
    for r in rows:
        assert set(r) >= {"where", "text", "now", "max", "delta"}
        assert r["delta"] > 0
    deltas = [r["delta"] for r in rows]
    assert deltas == sorted(deltas, reverse=True)
