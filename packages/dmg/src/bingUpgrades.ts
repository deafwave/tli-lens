/* Bing upgrades above the real build (mechanics.md#bing-upgrades): each a cited Source the
   climb can add on top of REAL_BUILD_SOURCES. Rolls are the TOP of the priced tier (catalog
   values; T1 matches the live affix library Torchlight_Affix_Review.xlsx line for line, T0
   matches an in-game Sierra tooltip): "t0" is the clean ceiling, "t1" the cheaper tier, "t0+"
   a corrupted T0 line (user 2026-10-09). SS14 craft pools are not public yet. Pure: no I/O. */
import type { Source } from "./bingLedger.js";

export type Tier = "t1" | "t0" | "t0+";

const CAT = "poorchlight tli_dump/data/compendium-catalog-ss13.json";
const HAMMER = `${CAT} gearAffixPools two_handed/two-handed_hammer`;
const ULT = ["mainHand.ultimate"];
const LEG = (name: string) => `${CAT} legendaries "${name}" corrodedValues`;
const GRAFT = (name: string) => `${CAT} vorax legendaryMod "${name}" (normal top roll)`;

const w = (id: string, label: string, slot: string, edits: Source["edits"], extra: Partial<Source> = {}): Source =>
  ({ id, label, group: "upgrade", slot: `mainHand.${slot}`, edits, cite: `${HAMMER} ${slot}`,
     requires: ["sierra"], ...extra });

type Line = [id: string, label: string, kind: "prefix" | "suffix", edits: Source["edits"],
             extra?: Partial<Source> & { ultimate?: boolean; advanced?: boolean }];

export function upgrades(tier: Tier = "t0") {
  const v = (t1: number, t0: number, t0p: number) => (tier === "t1" ? t1 : tier === "t0" ? t0 : t0p);

  const UPGRADES: Source[] = [
    // ---- main-hand craft (3 prefixes, 3 suffixes, corrosion implicit, base affix; ≤2 Ultimate) ----
    w("w_attack_levels", `Weapon prefix: +${v(6, 7, 8)} to Attack Skill Level`, "prefix",
      [["add", "aux.skill_level", v(6, 7, 8)]],
      { caps: ULT, note: "skill-level bands (×1.10 to L30, ×1.08 beyond) confirmed for HoA by the user 2026-10-09" }),
    w("w_pen", `Weapon prefix: +${v(60, 78, 101)}% Elemental and Erosion Resistance Penetration`, "prefix",
      [["add", "penetration.erosion_pct", v(60, 78, 101)], ["add", "penetration.cold_pct", v(60, 78, 101)]], { caps: ULT }),
    w("w_melee", `Weapon prefix: +${v(216, 281, 365)}% Melee Damage`, "prefix",
      [["add", "increased.melee", v(216, 281, 365)]], { replaces: ["sierra_melee"] }),
    w("w_adds", `Weapon prefix: adds ${v(73, 95, 123)}–${v(89, 115, 151)} Physical`, "prefix",
      [["add", "base.weapon_phys_min", v(73, 95, 123)], ["add", "base.weapon_phys_max", v(89, 115, 151)]],
      { replaces: ["sierra_adds"] }),
    w("w_gear_phys", `Weapon prefix: +${v(80, 104, 136)}% Gear Physical Damage`, "prefix",
      [["add", "base.gear_phys_pct", v(80, 104, 136)]], { replaces: ["sierra_gear_phys"] }),
    w("w_hybrid", `Weapon prefix: +${v(110, 145, 190)}% Gear Physical, adds ${v(55, 71, 92)}–${v(67, 87, 113)} Physical`, "prefix",
      [["add", "base.gear_phys_pct", v(110, 145, 190)], ["add", "base.weapon_phys_min", v(55, 71, 92)],
       ["add", "base.weapon_phys_max", v(67, 87, 113)]], { caps: ULT }),
    w("w_erosion_adds", `Weapon prefix: adds ${v(167, 216, 281)}–${v(195, 254, 329)} Erosion`, "prefix",
      [["add", "base.weapon_flat_erosion_min", v(167, 216, 281)], ["add", "base.weapon_flat_erosion_max", v(195, 254, 329)]]),
    w("w_stationary", `Weapon suffix: +${v(100, 124, 153)}% additional Attack Damage after standing still`, "suffix",
      [["add", "additional.standing_still", v(100, 124, 153)], ["add", "aux.as_more_sierra", -20]],
      { replaces: ["sierra_stationary"] }),
    w("w_physical", `Weapon suffix: +${v(216, 281, 365)}% Physical Damage`, "suffix",
      [["add", "increased.physical", v(216, 281, 365)]], { replaces: ["sierra_physical"] }),
    w("w_erosion", `Weapon suffix: +${v(216, 281, 365)}% Erosion Damage`, "suffix",
      [["add", "increased.erosion", v(216, 281, 365)]], { requires: ["sierra", "ruinous_star"] }),
    w("w_crit_rating", `Weapon suffix: +${v(360, 468, 608)}% Critical Strike Rating`, "suffix",
      [["add", "aux.crit_rating_pct", v(360, 468, 608)]], { replaces: ["sierra_crit_rating"] }),
    w("w_crit_damage", `Weapon suffix: +${v(180, 234, 304)}% Critical Strike Damage`, "suffix",
      [["add", "crit.damage_pct", v(180, 234, 304)]]),
    w("w_additional_melee", `Weapon suffix: +${v(60, 78, 101)}% additional Melee Damage`, "suffix",
      [["add", "additional.weapon_melee", v(60, 78, 101)]], { caps: ULT }),
    w("w_attack_speed", `Weapon suffix: +${v(72, 94, 122)}% Attack and Cast Speed`, "suffix",
      [["add", "aux.as_inc", v(72, 94, 122)]]),
    w("w_main_levels", "Weapon corrosion implicit: +2 Main Skill Level", "corrosion", [["add", "aux.skill_level", 2]],
      { cite: `${HAMMER} corrosionImplicits T0 (+1–2 Main Skill Level)` }),
    w("w_demolisher_base", "Weapon base affix: +32% additional skill damage when Demolisher Charge is consumed", "base",
      [["mul", "rotation.demolisher_empower_mult", 1.32], ["add", "rotation.empower_more_w_demolisher_base", 32]],
      { cite: `${HAMMER} baseAffixes T1 (28–32%)`, note: "scales empowered throws (every throw at n=1)" }),

    // ---- corroded legendaries (delta over the equipped roll) ----
    { id: "c_deaths_touch", label: "Corroded Death's Touch (2H base 85→120, MH AS 14→23)", group: "upgrade",
      edits: [["add", "additional.base_2h_gloves", 35], ["add", "aux.as_local", 9]], cite: LEG("Death's Touch"),
      requires: ["deaths_touch"], note: "assumes the weapon crit-rating fix (normal mod) is kept" },
    { id: "c_fools_crown", label: "Corroded Fool's Crown (adds 95–125→161–208, Str 148→150)", group: "upgrade",
      edits: [["add", "base.weapon_phys_min", 66], ["add", "base.weapon_phys_max", 83], ["add", "aux.str_flat", 2]],
      cite: LEG("Fool's Crown"), requires: ["fools_crown"] },
    { id: "c_ruinous_star", label: "Corroded Ruinous Star (duration +30→+45%, ramp 40→45%)", group: "upgrade",
      edits: [["add", "deterioration.duration_inc_pct", 15], ["set", "deterioration.ramp_pct", 45],
              ["set", "deterioration.ramp_max_ticks", 5]],
      cite: LEG("Ruinous Star"), requires: ["ruinous_star"] },
    { id: "c_blade_dancer", label: "Corroded Blade-dancer's Steps (+45→+55% additional)", group: "upgrade",
      edits: [["add", "additional.blade_dancer", 10]], cite: LEG("Blade-dancer's Steps"), requires: ["blade_dancer"] },
    { id: "c_formation_breaker", label: "Corroded Formation Breaker (taken 30→45%, +1 Melee Skill Level)",
      group: "upgrade", edits: [["add", "enemy_taken.fb_sentry", 15], ["add", "aux.skill_level", 1]],
      cite: LEG("Formation Breaker"), requires: ["formation_breaker"] },
    { id: "c_kaleido_48", label: "Corroded Kaleidoscope for the 48 ring (→65, AS 7→22)", group: "upgrade",
      edits: [["add", "additional.kaleido_1", 17], ["add", "aux.as_inc", 15]], cite: LEG("Kaleidoscope"),
      requires: ["kaleido_48"] },
    { id: "c_kaleido_60", label: "Corroded Kaleidoscope 60 ring at max roll (→65, AS 7→22)", group: "upgrade",
      edits: [["add", "additional.kaleido_2", 5], ["add", "aux.as_inc", 15]], cite: LEG("Kaleidoscope"),
      requires: ["kaleido_60"], note: "the equipped 60 is already corroded (normal tops at 50); AS read as normal 7" },

    // ---- hero traits L3 (memory "+Hero Trait Level") ----
    { id: "t_blast_barrage_l3", label: "Blast Barrage L3 (2.5→2.6 bombs/throw)", group: "upgrade",
      edits: [["set", "rotation.bombs_per_throw", 2.6]],
      cite: "mechanics.md memory-ladder row: 30% chance at L3 ⇒ 2.6", requires: ["blast_barrage"] },
    { id: "t_frenzy_hound_l3", label: "Frenzy Hound L3 (+40→+45%)", group: "upgrade",
      edits: [["add", "additional.frenzy_hound", 5]], cite: "mechanics.md memory-ladder row: 35/40/45% at L1/2/3",
      requires: ["frenzy_hound"] },

    // ---- SS14 supports (take a HoA support socket) ----
    { id: "s_rising_evil", label: "Rising Evil (SS14): +16.5% additional Deterioration", group: "upgrade",
      slot: "hoa.support", edits: [["add", "aux.det_more_rising_evil", 16.5]],
      cite: "SS14 patch notes (torchlight.xd.com/ss14pn): 被辅助技能额外 +16.5% 恶化伤害",
      requires: ["ruinous_star"], note: "its 10% extra-stack chance with Evil is unmodeled" },
    { id: "s_honed_edge", label: "Honed Edge (SS14): +20% additional, +36% crit rating (2H)", group: "upgrade",
      slot: "hoa.support", edits: [["add", "additional.honed_edge", 20], ["add", "aux.crit_rating_pct", 36]],
      cite: "SS14 patch notes: +20% additional; 2H +9% crit rating per 45 base weapon damage (220 ⇒ 4 steps)" },
  ];

  /** Priced but kept out of the default climb until an in-game read settles them. */
  const RISKY_UPGRADES: Source[] = [
    w("w_to_life", `Weapon suffix: ${v(60, 78, 101)}% additional damage applied to Life`, "suffix",
      [["add", "additional.weapon_to_life", v(60, 78, 101)]],
      { caps: ULT, note: "SS14: 'most True Damage is no longer affected by damage-to-Life bonuses' — if that covers "
        + "Deterioration (~90% of DPS) this line barely moves DPS (handoff §5.2)" }),
  ];

  /* ---- Vorax gear (mechanics.md#bing-vorax) ----
     A Vorax piece replaces the item in its slot: a package base (the limb) plus up to 6 lines
     (≤2 grafted legendary mods, ≤2 Ultimate, ≤2 Advanced, the rest Basic; user 2026-10-09). Chest is not offered:
     Ruinous Star's Obliterate cannot be grafted. */
  const VX = `${CAT} vorax craftAffix ${tier.toUpperCase()}`;
  const L = {
    active: ["active_levels", `+${v(2, 3, 4)} Active Skill Level`, "prefix", [["add", "aux.skill_level", v(2, 3, 4)]],
      { ultimate: true }],
    fire: ["fire_levels", `+${v(1, 2, 3)} Fire Skill Level`, "prefix", [["add", "aux.skill_level", v(1, 2, 3)]], { advanced: true }],
    damage: ["damage", `+${v(72, 94, 122)}% damage`, "prefix", [["add", "increased.global", v(72, 94, 122)]]],
    detDamage: ["det_damage", `+${v(50, 65, 85)}% Deterioration Damage`, "prefix",
      [["add", "deterioration.damage_inc_pct", v(50, 65, 85)]], { ultimate: true, requires: ["ruinous_star"] }],
    pen: ["pen", `+${v(20, 26, 34)}% Elemental and Erosion Resistance Penetration`, "prefix",
      [["add", "penetration.erosion_pct", v(20, 26, 34)], ["add", "penetration.cold_pct", v(20, 26, 34)]], { ultimate: true }],
    str: ["str", `+${v(60, 78, 101)} Strength`, "prefix", [["add", "aux.str_flat", v(60, 78, 101)]], { advanced: true }],
    support: ["support_levels", `+${v(9, 11, 13)} Support Skill Level`, "suffix",
      [["add", "aux.support_level", v(9, 11, 13)]], { ultimate: true }],
    nearby: ["nearby_taken", `+${v(24, 31, 41)}% additional damage taken by Nearby enemies`, "suffix",
      [["add", "enemy_taken.vorax_nearby", v(24, 31, 41)]], { ultimate: true, requires: ["solar_ring"] }],
    detDuration: ["det_duration", `+${v(32, 42, 54)}% additional Deterioration Duration`, "suffix",
      [["add", "deterioration.duration_inc_pct", v(32, 42, 54)]], { ultimate: true, requires: ["ruinous_star"] }],
    double: ["double", `+${v(26, 34, 44)}% chance to deal Double Damage`, "suffix",
      [["add", "crit.double_damage_chance_pct", v(26, 34, 44)]], { ultimate: true }],
    mainHand: ["main_hand", `+${v(23, 30, 39)}% additional damage for Main-Hand Weapons`, "suffix",
      [["add", "additional.vorax_main_hand", v(23, 30, 39)]], { ultimate: true }],
    critDamage: ["crit_damage", `+${v(60, 78, 101)}% Critical Strike Damage`, "suffix",
      [["add", "crit.damage_pct", v(60, 78, 101)]], { advanced: true }],
    critRating: ["crit_rating", `+${v(120, 156, 203)}% Critical Strike Rating`, "suffix",
      [["add", "aux.crit_rating_pct", v(120, 156, 203)]]],
  } satisfies Record<string, Line>;

  const G: Record<string, [string, string, Source["edits"], Partial<Source>]> = {
    solar: ["graft_solar", "graft: Broken Sun's Solar Ring", [["add", "enemy_taken.solar_ring", 40],
      ["add", "additional.sun_area_empower", 28]], { provides: ["solar_ring"], replaces: ["broken_sun"],
      cite: GRAFT("Broken Sun Ring"), note: "moves Solar Ring off the necklace, freeing it" }],
    foolsAdds: ["graft_fools_adds", "graft: Fool's Crown adds 108–138 Physical to the Main-Hand Weapon",
      [["add", "base.weapon_phys_min", 108], ["add", "base.weapon_phys_max", 138]], { cite: GRAFT("Fool's Crown") }],
    bladeDancer: ["graft_blade_dancer", "graft: Blade-dancer's +45% additional after Mobility",
      [["add", "additional.blade_dancer", 45]], { cite: GRAFT("Blade-dancer's Steps") }],
    kaleido: ["graft_kaleido", "graft: Kaleidoscope buffs +50% (moves the 48 ring's buff)",
      [["add", "additional.kaleido_graft", 50]], { replaces: ["kaleido_48"], cite: GRAFT("Kaleidoscope") }],
    fbCharge: ["graft_fb_charge", "graft: Formation Breaker's Demolisher Charge on Sentry use",
      [], { provides: ["fb_charge"], replaces: ["formation_breaker"], cite: GRAFT("Formation Breaker"),
            note: "moves the charge engine's belt line, freeing the belt" }],
    fbTaken: ["graft_fb_taken", "graft: Formation Breaker's +30% taken near Sentries",
      [["add", "enemy_taken.fb_sentry", 30]], { requires: ["charge_engine"], cite: GRAFT("Formation Breaker") }],
  };

  const vorax = (limb: string, label: string, replaces: string[], lines: Line[], grafts: string[] = []): Source[] => {
    const id = `vx_${limb}`;
    // Each limb's line is its own source: additional / taken lines get a per-limb key so
    // compose multiplies them (mechanics.md#additional) instead of summing one shared key.
    const own = (edits: Source["edits"]): Source["edits"] => edits.map(e =>
      e[0] === "add" && /^(additional|enemy_taken)\./.test(e[1]) ? ["add", `${e[1]}_${limb}`, e[2]] : e);
    return [
      { id, label: `Vorax ${label}`, group: "upgrade", package: true, replaces, edits: [],
        cite: `${CAT} vorax limb; replaces ${replaces.join(", ")}` },
      ...lines.map(([lid, llabel, kind, edits, { ultimate, advanced, ...extra } = {}]): Source => ({
        id: `${id}_${lid}`, label: `Vorax ${label} ${kind}: ${llabel}`, group: "upgrade",
        slot: `vorax.${limb}.${kind}`,
        caps: ultimate ? [`vorax.${limb}.ultimate`] : advanced ? [`vorax.${limb}.advanced`] : undefined,
        edits: own(edits), cite: VX, ...extra, requires: [id, ...extra.requires ?? []] })),
      ...grafts.map((g): Source => {
        const [gid, glabel, edits, extra] = G[g];
        return { id: `${id}_${gid}`, label: `Vorax ${label} ${glabel}`, group: "upgrade",
                 slot: `vorax.${limb}.graft`, edits: own(edits), cite: "", ...extra,
                 requires: [id, ...extra.requires ?? []] };
      }),
    ];
  };

  const VORAX: Source[] = [
    ...vorax("head", "Head", ["fools_crown"],
      [L.active, L.damage, L.detDamage, L.str, L.support, L.nearby, L.detDuration, L.critDamage, L.critRating],
      ["solar", "foolsAdds"]),
    ...vorax("neck", "Neck", ["broken_sun"],
      [L.active, L.damage, L.detDamage, L.str, L.support, L.nearby, L.detDuration, L.critDamage]),
    ...vorax("hands", "Hands", ["deaths_touch"], [L.active, L.damage, L.critDamage, L.critRating]),
    ...vorax("legs", "Legs", ["blade_dancer"],
      [L.fire, L.damage, L.detDamage, L.pen, L.detDuration, L.double, L.mainHand, L.critDamage, L.critRating],
      ["bladeDancer", "kaleido", "fbCharge", "fbTaken"]),
    ...vorax("waist", "Waist", ["formation_breaker"],
      [L.damage, L.detDamage, L.pen, L.str, L.detDuration, L.double, L.mainHand]),
    ...vorax("digits1", "Digits (48 ring)", ["kaleido_48"],
      [L.damage, L.detDamage, L.pen, L.str, L.detDuration, L.double, L.mainHand, L.critDamage, L.critRating]),
    ...vorax("digits2", "Digits (60 ring)", ["kaleido_60"],
      [L.damage, L.detDamage, L.pen, L.str, L.detDuration, L.double, L.mainHand, L.critDamage, L.critRating]),
  ];

  return { UPGRADES, RISKY_UPGRADES, VORAX };
}

export const { UPGRADES, RISKY_UPGRADES, VORAX } = upgrades("t1");
