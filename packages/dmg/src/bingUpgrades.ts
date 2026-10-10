/* Bing upgrades above the real build (mechanics.md#bing-upgrades): each a cited Source the
   climb can add on top of REAL_BUILD_SOURCES. Rolls are the TOP of each SS13 range (the
   chase target); SS14 craft pools are not public yet. Pure: no I/O. */
import type { Source } from "./bingLedger.js";

const CAT = "poorchlight tli_dump/data/compendium-catalog-ss13.json";
const HAMMER = `${CAT} gearAffixPools two_handed/two-handed_hammer`;
const LEG = (name: string) => `${CAT} legendaries "${name}" corrodedValues`;

const w = (id: string, label: string, slot: string, edits: Source["edits"], extra: Partial<Source> = {}): Source =>
  ({ id, label, group: "upgrade", slot: `mainHand.${slot}`, edits, cite: `${HAMMER} ${slot} T0+`,
     requires: ["sierra"], ...extra });

export const UPGRADES: Source[] = [
  // ---- main-hand craft (3 prefixes, 3 suffixes, corrosion implicit, base affix) ----
  w("w_attack_levels", "Weapon prefix: +8 to Attack Skill Level", "prefix", [["add", "aux.skill_level", 8]],
    { note: "skill-level bands confirmed on Spectral Slash; inferred for HoA (Attack-tagged)" }),
  w("w_melee", "Weapon prefix: +365% Melee Damage", "prefix", [["add", "increased.melee", 365]],
    { replaces: ["sierra_melee"] }),
  w("w_adds", "Weapon prefix: adds 123–151 Physical", "prefix",
    [["add", "base.weapon_phys_min", 123], ["add", "base.weapon_phys_max", 151]], { replaces: ["sierra_adds"] }),
  w("w_gear_phys", "Weapon prefix: +136% Gear Physical Damage", "prefix", [["add", "base.gear_phys_pct", 136]],
    { replaces: ["sierra_gear_phys"] }),
  w("w_hybrid", "Weapon prefix: +190% Gear Physical, adds 92–113 Physical", "prefix",
    [["add", "base.gear_phys_pct", 190], ["add", "base.weapon_phys_min", 92], ["add", "base.weapon_phys_max", 113]]),
  w("w_erosion_adds", "Weapon prefix: adds 281–329 Erosion", "prefix",
    [["add", "base.weapon_flat_erosion_min", 281], ["add", "base.weapon_flat_erosion_max", 329]]),
  w("w_stationary", "Weapon suffix: +153% additional Attack Damage after standing still", "suffix",
    [["add", "additional.standing_still", 153], ["add", "aux.as_more_sierra", -20]],
    { replaces: ["sierra_stationary"] }),
  w("w_physical", "Weapon suffix: +365% Physical Damage", "suffix", [["add", "increased.physical", 365]],
    { replaces: ["sierra_physical"] }),
  w("w_erosion", "Weapon suffix: +365% Erosion Damage", "suffix", [["add", "increased.erosion", 365]],
    { requires: ["sierra", "ruinous_star"] }),
  w("w_crit_rating", "Weapon suffix: +608% Critical Strike Rating", "suffix", [["add", "aux.crit_rating_pct", 608]],
    { replaces: ["sierra_crit_rating"] }),
  w("w_crit_damage", "Weapon suffix: +304% Critical Strike Damage", "suffix", [["add", "crit.damage_pct", 304]]),
  w("w_additional_melee", "Weapon suffix: +101% additional Melee Damage", "suffix",
    [["add", "additional.weapon_melee", 101]]),
  w("w_main_levels", "Weapon corrosion implicit: +2 Main Skill Level", "corrosion", [["add", "aux.skill_level", 2]],
    { cite: `${HAMMER} corrosionImplicits T0 (+1–2 Main Skill Level)` }),
  w("w_demolisher_base", "Weapon base affix: +32% additional skill damage when Demolisher Charge is consumed", "base",
    [["add", "additional.weapon_demolisher", 32]],
    { cite: `${HAMMER} baseAffixes T1 (28–32%)`, requires: ["sierra", "charge_engine"],
      note: "n=1: every throw consumes a charge" }),

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
  { id: "c_formation_breaker", label: "Corroded Formation Breaker (taken 30→45%, +1 Melee Skill Level)", group: "upgrade",
    edits: [["add", "enemy_taken.fb_sentry", 15], ["add", "aux.skill_level", 1]],
    cite: LEG("Formation Breaker"), requires: ["charge_engine"] },
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
    slot: "hoa.support", edits: [["add", "deterioration.additional_damage_pct", 16.5]],
    cite: "SS14 patch notes (torchlight.xd.com/ss14pn): 被辅助技能额外 +16.5% 恶化伤害",
    requires: ["ruinous_star"], note: "its 10% extra-stack chance with Evil is unmodeled" },
  { id: "s_honed_edge", label: "Honed Edge (SS14): +20% additional, +36% crit rating (2H)", group: "upgrade",
    slot: "hoa.support", edits: [["add", "additional.honed_edge", 20], ["add", "aux.crit_rating_pct", 36]],
    cite: "SS14 patch notes: +20% additional; 2H +9% crit rating per 45 base weapon damage (220 ⇒ 4 steps)" },
];

/** Priced but kept out of the default climb until an in-game read settles them. */
export const RISKY_UPGRADES: Source[] = [
  w("w_to_life", "Weapon suffix: 101% additional damage applied to Life", "suffix",
    [["add", "additional.weapon_to_life", 101]],
    { note: "SS14: 'most True Damage is no longer affected by damage-to-Life bonuses' — if that covers "
      + "Deterioration (88% of DPS) this line is ~×1.1, not ×2.0 (handoff §5.2)" }),
];

/* ---- Vorax gear (mechanics.md#bing-vorax) ----
   A Vorax piece replaces the item in its slot: a package base (the limb) plus up to 6 lines
   (3 prefixes, 3 suffixes, of which up to 2 may be grafted legendary mods), each the top of
   its SS13 T0+ range. Chest is not offered: Ruinous Star's Obliterate cannot be grafted. */
const VX = `${CAT} vorax craftAffix T0+`;
type Line = [id: string, label: string, kind: "prefix" | "suffix", edits: Source["edits"], extra?: Partial<Source>];
const L = {
  active: ["active_levels", "+4 Active Skill Level", "prefix", [["add", "aux.skill_level", 4]]],
  fire: ["fire_levels", "+3 Fire Skill Level", "prefix", [["add", "aux.skill_level", 3]]],
  damage: ["damage", "+122% damage", "prefix", [["add", "increased.global", 122]]],
  detDamage: ["det_damage", "+85% Deterioration Damage", "prefix", [["add", "deterioration.damage_inc_pct", 85]],
    { requires: ["ruinous_star"] }],
  pen: ["pen", "+34% Elemental and Erosion Resistance Penetration", "prefix",
    [["add", "penetration.erosion_pct", 34], ["add", "penetration.cold_pct", 34]]],
  str: ["str", "+101 Strength", "prefix", [["add", "aux.str_flat", 101]]],
  support: ["support_levels", "+13 Support Skill Level", "suffix", [["add", "aux.support_level", 13]]],
  nearby: ["nearby_taken", "+41% additional damage taken by Nearby enemies", "suffix",
    [["add", "enemy_taken.vorax_nearby", 41]], { requires: ["solar_ring"] }],
  detDuration: ["det_duration", "+54% additional Deterioration Duration", "suffix",
    [["add", "deterioration.duration_inc_pct", 54]], { requires: ["ruinous_star"] }],
  double: ["double", "+44% chance to deal Double Damage", "suffix", [["add", "crit.double_damage_chance_pct", 44]]],
  mainHand: ["main_hand", "+39% additional damage for Main-Hand Weapons", "suffix", [["add", "additional.vorax_main_hand", 39]]],
  critDamage: ["crit_damage", "+101% Critical Strike Damage", "suffix", [["add", "crit.damage_pct", 101]]],
  critRating: ["crit_rating", "+203% Critical Strike Rating", "suffix", [["add", "aux.crit_rating_pct", 203]]],
} satisfies Record<string, Line>;

const GRAFT = (name: string) => `${CAT} vorax legendaryMod "${name}" (normal top roll)`;
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

function vorax(limb: string, label: string, replaces: string[], lines: Line[], grafts: string[] = []): Source[] {
  const id = `vx_${limb}`;
  return [
    { id, label: `Vorax ${label}`, group: "upgrade", package: true, replaces, edits: [],
      cite: `${CAT} vorax limb; replaces ${replaces.join(", ")}` },
    ...lines.map(([lid, llabel, kind, edits, extra]): Source => ({
      id: `${id}_${lid}`, label: `Vorax ${label} ${kind}: ${llabel}`, group: "upgrade", slot: `vorax.${limb}.${kind}`,
      edits, cite: VX, ...extra, requires: [id, ...extra?.requires ?? []] })),
    ...grafts.map(g => {
      const [gid, glabel, edits, extra] = G[g];
      return { id: `${id}_${gid}`, label: `Vorax ${label} ${glabel}`, group: "upgrade" as const,
               slot: `vorax.${limb}.graft`, edits, cite: "", ...extra, requires: [id, ...extra.requires ?? []] };
    }),
  ];
}

export const VORAX: Source[] = [
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
