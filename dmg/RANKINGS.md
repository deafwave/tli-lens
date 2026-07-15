# Spectral Slash Upgrade Rankings — loadout "more_1" (boss single-target)

Generated from `Rehan SS13_update1.json` via `python -X utf8 -m dmg.build_parser` + `python -X utf8 -m dmg.rank sensitivity dmg/snapshot.json`.

## Coverage

```
coverage: 57 matched, 59 ignored, 8 UNMATCHED of 124 lines (94% handled)
```

The 8 unmatched lines are the Rehan trait texts (Fury's Onslaught / Growing Anger / Rage Infusion — folded in via `manual_overrides.json` at tier-5 values) and Heart of Animitta's two rotation effects (folded into `rotation.combo_points`). Nothing is silently dropped.

**Not parsed at all in v1 (out of pipeline, see caveats):** divinity slates, pactspirits, hero memories, ethereal prisms, support-gem numeric effects.

## Sensitivity table

Baseline: **33.8M DPS**, 0.95s combo cycle (3 starters + finisher).

```
+16.67%  +10% cold penetration
+10.55%  +1 Combo Point consumed
+10.00%  +10% Paralysis/other enemy-taken (any NEW additional line = ~+10%)
 +6.51%  +10% warcry buff contribution
 +6.49%  +30% crit damage
 +5.78%  +5% crit chance
 +4.55%  +10% attack speed
 +4.08%  +10% Frostbite taken
 +3.83%  +10% gear physical damage (weapon)
 +3.54%  +10% Combo Finisher Amplification
 +3.52%  +10 pts onto existing additional-damage pile
 +1.69%  +10% increased damage (ANY flavor: phys/attack/melee/area/cold)
```

## Top 5 recommendations

1. **Cold/elemental penetration — the runaway winner.** The model assumes a 40%-res boss and the build has 0 penetration, so every 10% pen is +16.7% DPS, and pen keeps working past zero (dev-confirmed resistance can go negative). Slate/gear/talent sources of "Elemental/Cold Penetration" are worth roughly 10× an equal roll of "% increased damage". Your "convert 100% to cold" choice makes this stat live and makes armor penetration dead.
2. **Combo Points consumed.** Finisher damage is `1 + points × amp` with amp already at 238.5%; going 8 → 9 points is +10.6% DPS. Anything granting +max Combo Points or more points consumed per finisher beats almost any damage roll.
3. **New "additional damage" lines from new *sources*.** Each brand-new additional multiplier (a debuff on the enemy, a new buff) is worth its face value (~+10% for a 10% line) — Paralysis (+15% taken, you have no source), Cold Infiltration (+13% taken, −10% res), or a Timid curse setup are all unclaimed multipliers this build scales. Adding points to *existing* piles (Rage Infusion, strength, warcry) is worth about a third of face value.
4. **Crit damage and crit chance.** At 44% chance / 335% crit damage, +30% crit damage ≈ +6.5% and +5% chance ≈ +5.8%. Crit rolls on gear beat any "% increased damage" roll ~4:1.
5. **Attack speed** (+4.6% per 10%) still beats every "% increased damage" roll (+1.7% per 10%). The increased pile is at 400%+ — stop paying for %damage, %phys, %attack, %melee, %area, %cold rolls; they are the worst stats on this sheet.

## Stop paying for (no-ops / near no-ops)

- **Armor damage-mitigation penetration** — no-op: fully converted cold hits check cold resistance only (mechanics.md, dev FAQ).
- **Numb** — no-op: it amplifies *Lightning* damage taken only.
- **Any % increased damage flavor** — not a no-op, but 1.7%/10% is the floor of the table.
- **Tenacity Blessing** — defensive only.
- Tree still holds Bladerunner "while Dual Wielding" nodes — **dead with a shield equipped** (parser now ignores them); respec candidates.

## Candidate comparison

```
python -X utf8 -m dmg.rank apply dmg/snapshot.json <path> <delta>   # e.g. penetration.cold_pct 40  ->  +66.67%
python -X utf8 -m dmg.rank compare dmg/snapshot.json other.json
```

## Caveats (what could move these rankings)

- **Boss cold res assumed 40%** with 0 pen. If your endgame target sits at higher/lower effective res, penetration's lead grows/shrinks. `enemy.cold_res_pct` is editable in `dmg/snapshot.json`.
- **Fervor rating sustained at 100** and **full Rage Infusion stacks / Berserk uptime** are inferred (mechanics.md); if uptime is worse, crit numbers drop and additional-pile points get slightly better.
- **Skill levels beyond 20 are unmodeled** (+9 net skill levels from gear; per-level scaling table not found — mechanics.md Confidence=unknown). All "+skill level" gear is therefore *undervalued* by the model.
- **Support gem numerics unmodeled** (Critical Strike Damage Increase L20 value, prism variants Detonation/Legion, Thunder Spike's supports) — supports appear in `build-inputs.md` but not the math.
- **Divinity slates / pactspirits / memories / prisms unparsed** — if your pen or "additional" lines live there (likely for elemental penetration!), baseline is understated but *rankings direction is unchanged*: pen would rank even higher only if boss res stays positive after existing pen.
- Crit-damage pool additivity and Combo-amp source-summing are inferred, not dev-confirmed (mechanics.md).
