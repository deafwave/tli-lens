"""Enumerate every divinity-slate / hero-memory mod from the tlidb caches and
compute its DPS impact for THIS build's snapshot. Injects the result into
rehan-ss13-progression.html between the CATALOG-DATA markers."""
import copy, json, re
from pathlib import Path

from dmg.build_parser import _load, classify, NUM
from dmg.damage_model import cycle_dps

SNAPSHOT = Path("dmg/snapshot.json")
HTML = Path("rehan-ss13-progression.html")

RANGE = re.compile(r"\((\d+(?:\.\d+)?)\s*[–\-~]\s*(\d+(?:\.\d+)?)\)")
# Tags Spectral Slash (Attack/Melee/Area/Physical->Cold/Combo) can never benefit from
NOT_THIS_BUILD = re.compile(
    r"\b(Focus Skill|Spell (?:Damage|Skill)|Cast Speed(?! and)|Minion|Spirit Magus|Sentry|Totem|Summon"
    r"|Wilt|Erosion|Fire Damage|Lightning Damage|Ignite|Shock Effect|Trauma|Blur"
    r"|Projectile|Bow|Crossbow|Pistol|Cannon|Staff|Wand|Two-Handed|Dual Wield"
    r"|Channeled|Curse Skill|Mobility Skill|Persistent Damage|Damage over Time|DoT|Elixir"
    r"|Min Physical Damage|Erosion Resistance"
    r"|empty (?:Active|Passive) Skill [Ss]lot)\b", re.I)   # build has 5 actives + 4 auras: no empty slots
CONDITIONAL = re.compile(
    r"\b(when|after|if |for every|per stack|recently|while|next|on \w+ing|devoured|chance to)\b", re.I)

# Override-formula constants mirrored from manual_overrides.json (_sources)
FERVOR_RATING = 100
FERVOR_EFFECT = 2.08
AURA_EFFECT = 0.25
AURA_VALUES = (30, 22, 33)
WARCRY_PER_ENEMY = 5.95
WARCRY_ENEMIES = 8
WARCRY_EFFECT = 0.80
FROSTBITE_CAP = 157
FROSTBITE_EFFECT = 0.20
CRIT_BASE_RATING = 500
CRIT_RATING_MULT = 12.10   # 1 + 3.94 increased + 6.16 fervor + 1.00 fearless


def max_roll_text(template, raw_text):
    """Best-roll text: '#' placeholders take each range's maximum from rawText."""
    maxima = [m[1] for m in RANGE.findall(raw_text or "")]
    if "#" in template and maxima:
        it = iter(maxima)
        return re.sub(r"#", lambda m: next(it, m.group(0)), template)
    return re.sub(RANGE, lambda m: m.group(2), raw_text or template)


def _compound(bucket, key, pct):
    bucket[key] = ((1 + bucket.get(key, 0) / 100) * (1 + pct / 100) - 1) * 100


def impact_of(path, value, snapshot):
    """DPS delta % of adding (path, value) to the snapshot; None if unmodeled."""
    s = copy.deepcopy(snapshot)
    s.pop("_extras", None)
    base = cycle_dps(s)["dps"]
    root = path.split(".")[0]
    key = path.split(".")[-1]
    if root in ("additional", "enemy_taken"):
        _compound(s[root], key, value)
    elif root in ("increased", "crit", "penetration", "rotation", "base") and key in s.get(root, {}):
        s[root][key] += value
    elif path == "extras.strength":
        _compound(s["additional"], "strength", value * 0.5)
    elif path == "extras.fervor_effect_pct":
        s["crit"]["chance_pct"] = CRIT_BASE_RATING * (
            1 + 3.94 + FERVOR_RATING * 0.02 * (1 + FERVOR_EFFECT + value / 100) + 1.00) / 100
    elif path == "extras.frostbite_effect_pct":
        s["enemy_taken"]["frostbite"] = FROSTBITE_CAP * (1 + FROSTBITE_EFFECT + value / 100)
    elif path == "extras.max_frostbite_rating":
        s["enemy_taken"]["frostbite"] = (FROSTBITE_CAP + value) * (1 + FROSTBITE_EFFECT)
    elif path == "extras.aura_effect_pct":
        mult = 1.0
        for v in AURA_VALUES:
            mult *= 1 + v * (1 + AURA_EFFECT + value / 100) / 100
        s["additional"]["precise_auras"] = (mult - 1) * 100
    elif path == "extras.warcry_effect_pct":
        s["additional"]["warcry_buffs"] = WARCRY_PER_ENEMY * WARCRY_ENEMIES * (1 + WARCRY_EFFECT + value / 100)
    elif path == "extras.warcry_min_enemies":
        s["additional"]["warcry_buffs"] = WARCRY_PER_ENEMY * (WARCRY_ENEMIES + value) * (1 + WARCRY_EFFECT)
    elif path == "extras.crit_dmg_per_fervor_rating":
        s["crit"]["damage_pct"] += value * FERVOR_RATING
    elif path == "crit.rating_inc_pct":
        s["crit"]["chance_pct"] += CRIT_BASE_RATING * value / 100 / 100
    elif path == "crit.rating_flat":
        s["crit"]["chance_pct"] += value * CRIT_RATING_MULT / 100
    else:
        return None
    return (cycle_dps(s)["dps"] / base - 1) * 100


def _slate_mods():
    ds = _load("SS12.5-divinity-slate-en.json")["divinity-slate/i18n/en"]
    for guid, mod in ds["slateMods"].items():
        yield "slate mod", mod.get("name", guid), mod.get("description", "")
    for guid, sl in ds["legendaryDivinitySlates"].items():
        for m in sl.get("mods", []):
            yield "slate legendary", sl.get("name", guid), m.get("description", "")


def _memory_mods():
    hm = _load("SS12.5-hero-memory-en.json")["hero-memory/i18n/en"]
    for cat in ("baseStats", "fixedAffixes", "randomAffixes", "revivedAffixes", "specialRandomAffixes"):
        for guid, aff in hm.get(cat, {}).items():
            if isinstance(aff, dict) and "template" in aff:
                yield f"memory {cat}", aff.get("description", guid), max_roll_text(aff["template"], aff.get("rawText", ""))


def build_catalog():
    snapshot = json.load(open(SNAPSHOT, encoding="utf-8"))
    rows, seen = [], set()
    for cat, name, desc in [*_slate_mods(), *_memory_mods()]:
        desc = re.sub(r"(\d) %", r"\1%", desc or "").strip()
        # dropped, not just unmodeled: build is committed to 1h+shield
        if not desc or re.search(r"dual wield", desc, re.I):
            continue
        if re.search(r"Critical Strikes do not deal additional damage", desc, re.I):
            # the bonus costs the entire crit multiplier: crits deal base damage only
            m = re.search(rf"\+{NUM}% additional damage", desc)
            s = copy.deepcopy(snapshot)
            s.pop("_extras", None)
            base_dps = cycle_dps(s)["dps"]
            s["crit"]["damage_pct"] = 100
            if m:
                _compound(s["additional"], "misc", float(m.group(1)))
            key = (cat, desc)
            if key in seen:
                continue
            seen.add(key)
            rows.append({"cat": cat, "name": name, "text": desc,
                         "bucket": "additional.misc − crit nullified",
                         "delta": round((cycle_dps(s)["dps"] / base_dps - 1) * 100, 2),
                         "cond": False})
            continue
        best = None
        for line in re.split(r"\n", desc):
            line = line.strip()
            if not line or NOT_THIS_BUILD.search(line):
                continue
            proc = re.search(rf"{NUM}% chance [^\n]*?to deal \+{NUM}% additional", line, re.I)
            if proc:
                # per-cast proc: expected value, not the headline number (50%x16 = +8)
                chance, bonus = float(proc.group(1)), float(proc.group(2))
                path, value = "additional.misc", chance * bonus / 100
            else:
                path, value = classify(line)
            if path in (None, "ignore"):
                continue
            d = impact_of(path, value or 0, snapshot) if path != "special.cold_infiltration" else 0.0
            if d is not None and (best is None or d > best[0]):
                best = (d, path, bool(proc))
        key = (cat, desc)
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "cat": cat, "name": name, "text": desc,
            "bucket": best[1] if best else "—",
            "delta": round(best[0], 2) if best else None,
            "cond": bool(CONDITIONAL.search(desc)) and not (best and best[2]),
        })
    rows.sort(key=lambda r: (r["delta"] is None, -(r["delta"] or 0)))
    return rows


def _underroll_impact(path, deltas, snapshot):
    """ΔDPS of pushing an affix from its current roll to max roll."""
    if path in ("base.weapon_flat_cold", "base.weapon_flat_phys_added"):
        s = copy.deepcopy(snapshot)
        s.pop("_extras", None)
        base = cycle_dps(s)["dps"]
        lo, hi = (deltas + deltas)[:2]
        which = "cold" if path.endswith("cold") else "phys"
        s["base"][f"weapon_{'flat_cold' if which == 'cold' else 'phys'}_min"] += lo
        s["base"][f"weapon_{'flat_cold' if which == 'cold' else 'phys'}_max"] += hi
        return (cycle_dps(s)["dps"] / base - 1) * 100
    return impact_of(path, deltas[0], snapshot)


def free_wins():
    """Every under-rolled affix on equipped gear/memories: ΔDPS of maxing the roll."""
    from dmg.build_parser import substitute, fill_template, _pick_loadout, _load as load_cache
    snapshot = json.load(open(SNAPSHOT, encoding="utf-8"))
    build = json.load(open("Rehan SS13_update1.json", encoding="utf-8"))
    lo = _pick_loadout(build, None)
    candidates = []

    inv = {it["id"]: it for it in lo["gear"]["inventory"]}
    for slot, item_id in lo["gear"]["equipped"].items():
        it = inv.get(item_id)
        if not it:
            continue
        where = f"{slot} · {it.get('displayName', '?')}"
        for aff in (it.get("prefixes") or []) + (it.get("suffixes") or []) + (it.get("legendaryMods") or []):
            rvs = aff.get("rolledValues") or []
            if not rvs or all(rv.get("value") == rv.get("maxValue") for rv in rvs):
                continue
            tmpl = aff.get("modifierDescription") or aff.get("description", "")
            cur = [rv["value"] for rv in rvs]
            mx = [rv.get("maxValue", rv["value"]) for rv in rvs]
            now_txt = substitute(tmpl, cur) if "#" in tmpl else tmpl
            max_txt = substitute(tmpl, mx) if "#" in tmpl else tmpl
            candidates.append((where, now_txt, max_txt, [m - c for m, c in zip(mx, cur)]))

    mem_cache = load_cache("SS12.5-hero-memory-en.json")["hero-memory/i18n/en"]
    lookup = {}
    for cat in mem_cache.values():
        if isinstance(cat, dict):
            lookup.update(cat)
    minv = {m["id"]: m for m in lo["heroMemories"]["inventory"]}
    for slot, mem_id in lo["heroMemories"]["equipped"].items():
        mem = minv.get(mem_id)
        if not mem:
            continue
        where = f"{slot} · {mem.get('customName') or mem.get('memoryType', '?')} memory"
        for aff in [mem.get("baseStat")] + (mem.get("fixedAffixes") or []) + (mem.get("randomAffixes") or []):
            if not aff:
                continue
            rvs = aff.get("values") or []
            if not rvs or all(rv.get("value") == rv.get("maxValue") for rv in rvs):
                continue
            entry = lookup.get(aff["guid"], {})
            tmpl = entry.get("template", "")
            cur = [rv["value"] for rv in rvs]
            mx = [rv.get("maxValue", rv["value"]) for rv in rvs]
            now_txt = fill_template(tmpl, cur)
            max_txt = fill_template(tmpl, mx)
            candidates.append((where, now_txt, max_txt, [m - c for m, c in zip(mx, cur)]))

    rows = []
    for where, now_txt, max_txt, deltas in candidates:
        for now_line, max_line in zip(now_txt.split("\n"), max_txt.split("\n")):
            if NOT_THIS_BUILD.search(now_line):
                continue
            path, _ = classify(now_line.strip())
            if path in (None, "ignore", "special.cold_infiltration"):
                continue
            d = _underroll_impact(path, [dv for dv in deltas if dv], snapshot)
            if d and d > 0.005:
                rows.append({"where": where, "text": now_line.strip(), "now": now_line.strip(),
                             "max": max_line.strip(), "delta": round(d, 2), "bucket": path})
            break
    rows.sort(key=lambda r: -r["delta"])
    return rows


def _splice(html, marker, payload):
    pattern = rf"/\*{marker}-START\*/[\s\S]*?/\*{marker}-END\*/"
    if not re.search(pattern, html):
        raise SystemExit(f"{marker} markers not found in HTML")
    return re.sub(pattern, lambda _: f"/*{marker}-START*/{payload}/*{marker}-END*/", html, count=1)


def inject(rows, wins):
    html = HTML.read_text(encoding="utf-8")
    # ensure_ascii: raw U+2028/U+2029 in tlidb text are valid JSON but break JS literals
    html = _splice(html, "CATALOG-DATA",
                   "const CATALOG=" + json.dumps(rows, ensure_ascii=True, separators=(",", ":")) + ";")
    html = _splice(html, "FREEWINS-DATA",
                   "const FREEWINS=" + json.dumps(wins, ensure_ascii=True, separators=(",", ":")) + ";")
    HTML.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    rows = build_catalog()
    wins = free_wins()
    inject(rows, wins)
    modeled = sum(1 for r in rows if r["delta"] is not None)
    print(f"catalog: {len(rows)} unique mods injected ({modeled} modeled, {len(rows) - modeled} unmodeled)")
    print(f"free wins: {len(wins)} under-rolled affixes, best +{wins[0]['delta']}%" if wins else "free wins: all affixes max-rolled")
