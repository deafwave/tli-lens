"""Planner-JSON -> affix lines -> stats snapshot, with a mandatory coverage report."""
import json, re
from pathlib import Path

CACHE = Path(".claude/skills/tli-build/cache")


def substitute(desc, values):
    out = []
    vals = list(values)
    for ch in desc:
        if ch == "#" and vals:
            v = vals.pop(0)
            out.append(f"{v:g}" if isinstance(v, float) else str(v))
        else:
            out.append(ch)
    return "".join(out)


def _load(name):
    with open(CACHE / name, encoding="utf-8") as f:
        return json.load(f)


def _gear_lines(lo):
    inv = {it["id"]: it for it in lo["gear"]["inventory"]}
    for slot, item_id in lo["gear"]["equipped"].items():
        it = inv.get(item_id)
        if it is None:
            continue
        src = f"gear:{slot}:{it.get('displayName', '?')}"
        for m in it.get("legendaryMods") or []:
            yield {"source": src, "slot": slot, "text": m["description"]}
        base = it.get("baseItem") or {}
        for imp in base.get("implicits") or []:
            yield {"source": src, "slot": slot, "text": imp["description"]}
        for aff in (it.get("prefixes") or []) + (it.get("suffixes") or []):
            vals = [rv["value"] for rv in aff.get("rolledValues", [])]
            yield {"source": src, "slot": slot, "text": substitute(aff["modifierDescription"], vals)}


def _tree_lines(lo):
    cache = _load("SS12.5-talent-tree-en.json")
    for slot in lo["skillTree"]["slots"]:
        tree = cache.get(f"talent-tree/{slot['treeId']}/i18n/en", {}).get("tree", {})
        nodes = tree.get("nodes", {})
        for guid, points in slot.get("nodePoints", {}).items():
            node = nodes.get(guid)
            if node is None:
                yield {"source": f"tree:{slot['treeId']}:{guid}", "slot": "tree",
                       "text": f"UNRESOLVED NODE {guid} ({points} pts)"}
                continue
            for line in node["description"].split("<br>"):
                if line.strip():
                    yield {"source": f"tree:{slot['treeId']}:{node['name']}",
                           "slot": "tree", "text": line.strip(), "points": points}


def _trait_lines(lo):
    cache = _load("SS12.5-hero-trait-en.json")["hero-trait/i18n/en"]["heroes"]
    hero = cache.get(lo["hero"]["heroGuid"], {})
    traits = hero.get("traits", {})
    for tier, guid in lo["hero"]["traits"].items():
        t = traits.get(guid)
        if isinstance(t, dict):
            name = t.get("name", guid)
            desc = t.get("description", "")
        else:
            name, desc = guid, str(t or "")
        for line in re.split(r"<br\s*/?>|\n", desc):
            if line.strip():
                yield {"source": f"trait:{tier}:{name}", "slot": "trait", "text": line.strip()}


def _pick_loadout(build, loadout_index):
    loadouts = build["loadouts"]["loadouts"]
    if loadout_index is not None:
        return loadouts[loadout_index]
    current = build["loadouts"].get("currentLoadoutId")
    for lo in loadouts:
        if lo["id"] == current:
            return lo
    return loadouts[0]


def extract_lines(build_path, loadout_index=None):
    with open(build_path, encoding="utf-8") as f:
        build = json.load(f)
    lo = _pick_loadout(build, loadout_index)
    return [*_gear_lines(lo), *_tree_lines(lo), *_trait_lines(lo)]


import copy
from dmg.damage_model import DEFAULT_SNAPSHOT

NUM = r"([+-]?\d+(?:\.\d+)?)"

# Bucket assignments come from dmg/mechanics.md — reconcile after research.
# Order matters: first regex that searches successfully wins.
PATTERNS = [
    (rf"\+{NUM}% Gear Physical Damage", "base.gear_phys_pct"),
    (rf"Adds {NUM} - {NUM} Cold Damage to the gear", "base.weapon_flat_cold"),
    (rf"Adds {NUM} - {NUM} Physical Damage to the gear", "base.weapon_flat_phys_added"),
    (rf"^{NUM} - {NUM} Physical Damage$", "base.weapon_phys"),
    (rf"^{NUM} Critical Strike Rating$", "crit.rating_flat"),
    (rf"^{NUM} Attack Speed$", "base.weapon_attack_speed_set"),
    (rf"\+{NUM}% gear Attack Speed", "base.gear_attack_speed_pct"),
    (rf"\+{NUM}% Combo Damage Enhancement", "additional.combo_enhancement"),
    (rf"\+{NUM}% Combo Finisher Amplification", "additional.combo_finisher_amp"),
    (rf"\+{NUM}% Warcry Effect", "extras.warcry_effect_pct"),
    (rf"\+{NUM}% Fervor effect", "extras.fervor_effect_pct"),
    (rf"\+{NUM} to Max Frostbite Rating", "extras.max_frostbite_rating"),
    (rf"\+{NUM}% Aura Effect", "extras.aura_effect_pct"),
    (rf"\+{NUM}% Mark effect", "extras.mark_effect_pct"),
    (rf"\+{NUM} Support Skill Level", "extras.support_skill_level"),
    (rf"\+{NUM} to the minimum number of enemies affected by Warcry", "extras.warcry_min_enemies"),
    (rf"{NUM}% Critical Strike Damage per Fervor Rating", "extras.crit_dmg_per_fervor_rating"),
    (rf"\+{NUM}% additional .*[Dd]amage", "additional.misc"),
    (rf"\+{NUM}% (?:increased )?Physical Damage", "increased.physical"),
    (rf"\+{NUM}% (?:increased )?Attack Damage", "increased.attack"),
    (rf"\+{NUM}% (?:increased )?Melee Damage", "increased.melee"),
    (rf"\+{NUM}% (?:increased )?Area Damage", "increased.area"),
    (rf"\+{NUM}% (?:increased )?Cold Damage", "increased.cold"),
    (rf"\+{NUM}% damage", "increased.global"),
    (rf"{NUM}% Critical Strike Damage", "crit.damage_pct"),
    (rf"\+{NUM}% Attack Critical Strike Rating", "crit.rating_inc_pct"),
    (rf"\+{NUM}% Critical Strike Rating", "crit.rating_inc_pct"),
    (rf"\+{NUM}% Attack Speed", "rotation.attack_speed_inc_pct"),
    (rf"\+{NUM}% Attack and Cast Speed", "rotation.attack_speed_inc_pct"),
    (rf"\+{NUM}% Frostbite Effect", "enemy_taken.frostbite"),
    (rf"\+{NUM}% Elemental Penetration", "penetration.cold_pct"),
    (rf"\+{NUM}% Cold Penetration", "penetration.cold_pct"),
    (rf"\+{NUM} Strength", "extras.strength"),
    (rf"\+{NUM} to Attack Skill Level", "extras.attack_skill_level"),
    (rf"\+{NUM} Active Skill Level", "extras.active_skill_level"),
    (r"(Max Life|Max Mana|Max Energy Shield|gear Energy Shield|Armor|Evasion"
     r"|Resistance|Movement Speed|Skill Cost|Life Regain|Mana Regain|on defeat"
     r"|Sealed Mana Compensation|Warcry Cooldown|additional damage taken|Skill Area"
     r"|Energy Shield Regain|Barrier|Consumes|Loses Fervor|chance to gain|chance to Mark"
     r"|Charging Energy Shield|回复)", "ignore"),
]
_COMPILED = [(re.compile(p, re.IGNORECASE), path) for p, path in PATTERNS]


def classify(text):
    for rx, path in _COMPILED:
        m = rx.search(text)
        if m:
            if path == "ignore":
                return ("ignore", None)
            groups = [g for g in m.groups() if g is not None]
            return (path, float(groups[0]) if groups else 0.0)
    return (None, None)


def _apply(snap, extras, path, value, line):
    """Route a classified value into the snapshot. Special paths handled here."""
    mult = line.get("points", 1) if line["slot"] == "tree" else 1
    if path == "base.weapon_phys":
        if line["slot"] == "mainHand":
            m = re.findall(r"\d+(?:\.\d+)?", line["text"])
            snap["base"]["weapon_phys_min"], snap["base"]["weapon_phys_max"] = float(m[0]), float(m[1])
        return
    if path in ("base.weapon_flat_cold", "base.weapon_flat_phys_added"):
        if line["slot"] != "mainHand":
            extras["offhand_flat_ignored"] = extras.get("offhand_flat_ignored", 0) + 1
            return
        m = re.findall(r"\d+(?:\.\d+)?", line["text"])
        lo, hi = float(m[0]), float(m[1])
        if path == "base.weapon_flat_cold":
            snap["base"]["weapon_flat_cold_min"] += lo
            snap["base"]["weapon_flat_cold_max"] += hi
        else:
            snap["base"]["weapon_phys_min"] += lo
            snap["base"]["weapon_phys_max"] += hi
        return
    if path == "base.weapon_attack_speed_set":
        if line["slot"] == "mainHand":
            snap["base"]["weapon_attack_speed"] = value
        return
    if path == "base.gear_attack_speed_pct":
        if line["slot"] == "mainHand":
            extras["gear_attack_speed_pct"] = extras.get("gear_attack_speed_pct", 0) + value
        return
    if path.startswith(("crit.rating", "extras.")):
        key = path.split(".", 1)[1]
        extras[key] = extras.get(key, 0.0) + value * mult
        return
    d = snap
    keys = path.split(".")
    for k in keys[:-1]:
        d = d[k]
    d[keys[-1]] = d.get(keys[-1], 0) + value * mult


def parse_build(build_path, loadout_index=None):
    snap = copy.deepcopy(DEFAULT_SNAPSHOT)
    for bucket in ("increased", "additional", "enemy_taken"):
        snap[bucket] = {k: 0 for k in snap[bucket]}
    snap["additional"]["combo_finisher_amp"] = 30   # skill-inherent, per tlidb Spectral_Slash
    snap["base"].update(weapon_phys_min=0, weapon_phys_max=0,
                        weapon_flat_cold_min=0, weapon_flat_cold_max=0,
                        gear_phys_pct=0)
    report = {"matched": [], "ignored": [], "unmatched": [], "manual": []}
    extras = {}
    for line in extract_lines(build_path, loadout_index):
        path, value = classify(line["text"])
        if path is None:
            report["unmatched"].append(line)
        elif path == "ignore":
            report["ignored"].append(line)
        else:
            _apply(snap, extras, path, value, line)
            report["matched"].append({**line, "path": path, "value": value})
    snap["_extras"] = extras
    apply_overrides(snap, report)
    resolve_extras(snap, report)
    return snap, report


def print_report(report):
    m, i, u = (len(report[k]) for k in ("matched", "ignored", "unmatched"))
    total = m + i + u
    pct = 100 * (m + i) / total if total else 0
    print(f"coverage: {m} matched, {i} ignored, {u} UNMATCHED of {total} lines ({pct:.0f}% handled)")
    for line in report["unmatched"]:
        print(f"  UNMATCHED [{line['source']}] {line['text']}")
    for entry in report["manual"]:
        print(f"  manual({entry['mode']}) {entry['path']} = {entry['value']}  [{entry['source']}]")


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(prog="build_parser")
    ap.add_argument("build")
    ap.add_argument("-o", "--out", default="dmg/snapshot.json")
    ap.add_argument("-l", "--loadout", type=int, default=None)
    args = ap.parse_args(argv)
    snap, report = parse_build(args.build, args.loadout)
    print_report(report)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(snap, f, indent=1)
    print(f"snapshot -> {args.out}")


if __name__ == "__main__":
    main()


OVERRIDES_PATH = Path("dmg/manual_overrides.json")


def _set_path(d, path, value, add=False):
    keys = path.split(".")
    for k in keys[:-1]:
        d = d[k]
    d[keys[-1]] = d.get(keys[-1], 0) + value if add else value


def apply_overrides(snap, report, overrides_path=OVERRIDES_PATH):
    """Merge hand-researched values (mechanics.md) over the parsed snapshot.

    Overrides file contract:
      "add": {snapshot.path: delta}     added onto parsed values
      "set": {snapshot.path: value}     absolute (e.g. crit.chance_pct from rating curve)
      "_consumes": [extras keys]        extras the add/set values already account for
      "_sources": {path: citation}      required; keeps every number traceable
    """
    if not Path(overrides_path).exists():
        return snap
    with open(overrides_path, encoding="utf-8") as f:
        ov = json.load(f)
    for path, v in ov.get("add", {}).items():
        _set_path(snap, path, v, add=True)
        report["manual"].append({"path": path, "value": v, "mode": "add",
                                 "source": ov.get("_sources", {}).get(path, "UNCITED")})
    for path, v in ov.get("set", {}).items():
        _set_path(snap, path, v)
        report["manual"].append({"path": path, "value": v, "mode": "set",
                                 "source": ov.get("_sources", {}).get(path, "UNCITED")})
    extras = snap.get("_extras", {})
    for key in ov.get("_consumes", []):
        if key in extras:
            report["manual"].append({"path": f"_extras.{key}", "value": extras.pop(key),
                                     "mode": "consumed", "source": "manual_overrides.json"})
    return snap


def resolve_extras(snap, report):
    """Mechanical extras conversions that need no researched constants."""
    extras = snap.get("_extras", {})
    gas = extras.pop("gear_attack_speed_pct", 0)
    if gas:
        snap["base"]["weapon_attack_speed"] *= 1 + gas / 100
        report["manual"].append({"path": "base.weapon_attack_speed", "mode": "derived",
                                 "value": f"x{1 + gas / 100:g} from +{gas:g}% gear Attack Speed",
                                 "source": "build_parser.resolve_extras"})
    extras.pop("offhand_flat_ignored", None)
    if not extras:
        snap.pop("_extras", None)
    return snap
