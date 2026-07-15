import json
from dmg.build_parser import parse_build
from dmg.damage_model import cycle_dps

def test_real_build_end_to_end():
    snap, report = parse_build("Rehan SS13_update1.json")
    handled = len(report["matched"]) + len(report["ignored"])
    total = handled + len(report["unmatched"])
    assert handled / total >= 0.90, [l["text"] for l in report["unmatched"]]
    assert snap.get("_extras", {}) == {}, snap.get("_extras")
    r = cycle_dps(snap)
    assert r["dps"] > 0 and r["cycle_time"] > 0

def test_manual_overrides_are_loaded_and_cited():
    overrides = json.load(open("dmg/manual_overrides.json", encoding="utf-8"))
    assert "_sources" in overrides and len(overrides["_sources"]) > 0
