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
