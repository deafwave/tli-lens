import re
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

def test_dual_wield_mods_dropped_entirely():
    rows = build_catalog()
    assert not [r for r in rows if "dual wield" in r["text"].lower()]

def test_chance_procs_use_expected_value():
    rows = build_catalog()
    procs = [r for r in rows if "chance for that cast to deal" in r["text"]]
    assert procs, "proc mod missing from catalog"
    for r in procs:
        assert r["delta"] is not None and r["delta"] < 10, (r["delta"], r["text"][:60])

def test_crit_nullify_mods_score_negative():
    rows = build_catalog()
    nullify = [r for r in rows if "do not deal additional damage" in r["text"]]
    assert nullify, "crit-nullify mod missing"
    for r in nullify:
        assert r["delta"] is not None and r["delta"] < 0, (r["delta"], r["text"][:60])

def test_memory_base_stats_excluded():
    rows = build_catalog()
    assert not [r for r in rows if r["cat"] == "memory baseStats"]

def test_projectile_plural_excluded():
    rows = build_catalog()
    proj = [r for r in rows if re.search(r"\bProjectiles?\b", r["text"])]
    import re as _re
    assert all(r["delta"] is None for r in rows if _re.search(r"Projectiles?", r["text"]))

def test_tradeoff_mods_score_net_not_best_line():
    rows = build_catalog()
    trade = [r for r in rows if "-20% additional damage for Weapons" in r["text"]]
    assert trade, "tradeoff mod missing"
    # net of x0.80 and x1.40 is ~x1.12, far below the +40 headline
    for r in trade:
        assert r["delta"] is not None and r["delta"] < 15, (r["delta"], r["text"][:60])

def test_es_zeroing_and_lowlife_mods_not_applicable():
    rows = build_catalog()
    es0 = [r for r in rows if "Energy Shield is fixed at 0" in r["text"]]
    assert es0 and all(r["delta"] is None for r in es0)
    lowlife = [r for r in rows if re.search(r"(?<!not )at Low Life", r["text"]) and r["delta"] is not None]
    # gains gated on BEING at low life don't work with ES as the defensive layer
    assert not [r for r in lowlife if "additional" in r["bucket"] and "not at Low Life" not in r["text"]], lowlife[:3]

def test_not_at_low_life_still_modeled():
    rows = build_catalog()
    ok = [r for r in rows if "when not at Low Life" in r["text"]]
    assert ok and any(r["delta"] is not None for r in ok)

def test_rows_carry_tier_and_spawn_info():
    rows = build_catalog()
    assert all(set(r) >= {"tier", "on"} for r in rows)
    dd = [r for r in rows if r["name"] == "Dying Dragon"]
    assert dd and dd[0]["tier"] == "Core Talent" and "New God" in dd[0]["on"]
    conv = [r for r in rows if "Physical Damage to Cold Damage" in r["text"]]
    assert conv and conv[0]["tier"] == "Legendary Medium Talent" and "Prophet" in conv[0]["on"]
    mem = [r for r in rows if r["cat"] == "memory"]
    assert mem and any(r["on"] for r in mem)

def test_duplicate_descs_merge_spawn_slates():
    rows = build_catalog()
    for r in rows:
        if r["cat"] == "slate" and "," in r["on"]:
            break
    else:
        raise AssertionError("no merged multi-slate mod found")
