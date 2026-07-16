from dmg.build_parser import extract_lines, substitute

BUILD = "Rehan SS13_update1.json"

def test_substitute_hash_placeholders():
    assert substitute("+#% Gear Physical Damage", [74]) == "+74% Gear Physical Damage"
    assert substitute("Adds # - # Cold Damage to the gear", [126, 166]) == "Adds 126 - 166 Cold Damage to the gear"

def test_extract_lines_uses_current_loadout():
    lines = extract_lines(BUILD)
    texts = [l["text"] for l in lines]
    # current loadout ("more_1", sword+shield) weapon rolls
    assert "+161% Gear Physical Damage" in texts
    assert any("Critical Strike Rating" in t for t in texts)

def test_extract_lines_explicit_index_overrides_current():
    texts = [l["text"] for l in extract_lines(BUILD, loadout_index=0)]
    assert "+74% Gear Physical Damage" in texts

def test_every_line_has_source_and_slot():
    for l in extract_lines(BUILD):
        assert l["source"] and l["text"]

from dmg.build_parser import classify, parse_build

def test_classify_core_patterns():
    assert classify("+161% Gear Physical Damage") == ("base.gear_phys_pct", 161.0)
    assert classify("+12% Physical Damage") == ("increased.physical", 12.0)
    assert classify("+9% damage") == ("increased.global", 9.0)
    assert classify("+8% additional Attack Damage") == ("additional.misc", 8.0)
    assert classify("+45% Critical Strike Damage") == ("crit.damage_pct", 45.0)
    assert classify("+10% Attack Speed") == ("rotation.attack_speed_inc_pct", 10.0)
    assert classify("+11% Cold Resistance") == ("ignore", None)
    assert classify("utterly unknown modifier text") == (None, None)

def test_parse_build_produces_valid_snapshot_and_report():
    snap, report = parse_build("Rehan SS13_update1.json")
    from dmg.damage_model import cycle_dps
    assert cycle_dps(snap)["dps"] > 0
    for k in ("matched", "ignored", "unmatched", "manual"):
        assert isinstance(report[k], list)
    assert report["matched"], "nothing matched at all"

from dmg.build_parser import fill_template, classify as _cl

def test_fill_template_hash_and_baked_numbers():
    # '#' templates take rolled values; baked-number templates get numbers replaced in order
    assert fill_template("+#% Critical Strike Damage", [42]) == "+42% Critical Strike Damage"
    assert fill_template("+36% Attack Speed", [44]) == "+44% Attack Speed"
    assert fill_template("+16% Attack Speed", []) == "+16% Attack Speed"

def test_memory_and_divinity_lines_extracted():
    lines = extract_lines(BUILD)
    slots = {l["slot"] for l in lines}
    assert "memory" in slots and "slate" in slots
    slate_texts = [l["text"] for l in lines if l["slot"] == "slate"]
    # divinity descriptions are normalized: '30 %' -> '30%', one line per '\n'
    assert all(" %" not in t for t in slate_texts)

def test_classify_slate_and_memory_cases():
    assert _cl("+30% additional Attack Damage") == ("additional.misc", 30.0)
    assert _cl("+30% additional Ailment Damage dealt by attacks") == ("ignore", None)
    assert _cl("-10% Attack Speed") == ("rotation.attack_speed_inc_pct", -10.0)
    assert _cl("+7% additional Attack and Cast Speed for Combo Starters") == ("rotation.attack_speed_inc_pct", 7.0)
