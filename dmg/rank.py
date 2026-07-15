"""CLI: sensitivity ranking and candidate comparison for the build snapshot."""
import argparse, copy, json, sys
from dmg.damage_model import cycle_dps

STANDARD_PERTURBATIONS = [
    ("+10% increased physical damage", "increased.physical", 10),
    ("+10% increased attack damage", "increased.attack", 10),
    ("+10% increased melee damage", "increased.melee", 10),
    ("+10% increased area damage", "increased.area", 10),
    ("+10% increased cold damage", "increased.cold", 10),
    ("+10% additional damage (new line)", "additional.misc", 10),
    ("+10% Fervor contribution", "additional.fervor", 10),
    ("+10% Combo Finisher Amplification", "additional.combo_finisher_amp", 10),
    ("+10% warcry buff contribution", "additional.warcry_buffs", 10),
    ("+10% Frostbite taken", "enemy_taken.frostbite", 10),
    ("+10% Numb/other taken", "enemy_taken.numb", 10),
    ("+5% crit chance", "crit.chance_pct", 5),
    ("+30% crit damage", "crit.damage_pct", 30),
    ("+10% cold penetration", "penetration.cold_pct", 10),
    ("+10% attack speed", "rotation.attack_speed_inc_pct", 10),
    ("+10% gear physical damage (weapon)", "base.gear_phys_pct", 10),
]


def validate_snapshot(s):
    """Spec guard: refuse to rank when a high-impact stat is missing/zero."""
    problems = []
    b = s["base"]
    if b["weapon_phys_max"] <= 0 and b["weapon_flat_cold_max"] <= 0:
        problems.append("weapon damage is zero")
    if b["weapon_attack_speed"] <= 0:
        problems.append("weapon attack speed is zero")
    if s["crit"]["damage_pct"] <= 0:
        problems.append("crit damage is zero")
    if problems:
        raise SystemExit("snapshot not rankable: " + "; ".join(problems))


def _bump(s, path, delta):
    s = copy.deepcopy(s)
    d = s
    keys = path.split(".")
    for k in keys[:-1]:
        d = d[k]
    d[keys[-1]] += delta
    return s


def compare_snapshots(a, b):
    return (cycle_dps(b)["dps"] / cycle_dps(a)["dps"] - 1) * 100


def sensitivity(s, perturbations):
    baseline = cycle_dps(s)["dps"]
    rows = []
    for label, path, delta in perturbations:
        dps = cycle_dps(_bump(s, path, delta))["dps"]
        rows.append({"label": label, "delta_pct": (dps / baseline - 1) * 100})
    return sorted(rows, key=lambda r: -r["delta_pct"])


def main(argv=None):
    ap = argparse.ArgumentParser(prog="rank")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("sensitivity")
    p.add_argument("snapshot")
    p = sub.add_parser("compare"); p.add_argument("a"); p.add_argument("b")
    p = sub.add_parser("apply"); p.add_argument("snapshot"); p.add_argument("path"); p.add_argument("delta", type=float)
    args = ap.parse_args(argv)

    def load(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    if args.cmd == "sensitivity":
        s = load(args.snapshot)
        validate_snapshot(s)
        base = cycle_dps(s)
        print(f"baseline DPS: {base['dps']:,.0f}  (cycle {base['cycle_time']:.2f}s)")
        for r in sensitivity(s, STANDARD_PERTURBATIONS):
            print(f"{r['delta_pct']:+7.2f}%  {r['label']}")
    elif args.cmd == "compare":
        a, b = load(args.a), load(args.b)
        print(f"A: {cycle_dps(a)['dps']:,.0f}  B: {cycle_dps(b)['dps']:,.0f}  delta {compare_snapshots(a, b):+.2f}%")
    elif args.cmd == "apply":
        s = load(args.snapshot)
        print(f"{compare_snapshots(s, _bump(s, args.path, args.delta)):+.2f}%  ({args.path} {args.delta:+g})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
