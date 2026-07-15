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
