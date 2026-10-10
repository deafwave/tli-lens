/* Bing real-build source ledger (mechanics.md#bing-ledger).

   real_buld_3_snapshot.json is a hand-encoded aggregate (increased.global 244 is a sum of
   eleven sources). This ledger attributes every line to the item / tree / slate / support /
   pactspirit that grants it, so the progression can price sources one at a time from the
   bare rig. compose(BING_ZERO, REAL_BUILD_SOURCES) reproduces the snapshot line for line
   (test/bing1/ledger.test.ts). Values are SS13 face values; season with applySeason.

   Derived stats are composed, not summed, the way the sheet derives them:
     crit chance  = 5% × (1 + Σ crit rating %)        (500 base rating; mechanics.md#real-build)
     strength     = 0.5% additional × flat × (1 + Σ %Str)
     attack speed = (1 + Σ inc) × Π(1 + more) × (1 + local MH %) − 1
     skill levels = HoA levels above the real build's 21 (gem 20 + Lich +1), each its own
                    ×1.10 (to L30) / ×1.08 multiplier (mechanics.md#skill-levels)
   Pure: no I/O. */
import type { DamageType, Snapshot } from "./damageModel.js";
import { skillLevelAdditionalPct } from "./rank.js";

export type Edit =
  | ["add" | "set" | "mul", string, number]
  | ["del", string]
  | ["conv", DamageType, DamageType, number];

export type SourceGroup =
  | "gear" | "support" | "aura" | "trait" | "tree" | "slate" | "memory" | "pact" | "kismet"
  | "prism" | "engine" | "residual" | "upgrade";

/** Affix lines per craft pool (SS13 gear: 3 prefixes + 3 suffixes; one corrosion implicit; one base). */
export const SLOT_CAPACITY: Record<string, number> = {
  "mainHand.prefix": 3, "mainHand.suffix": 3, "mainHand.corrosion": 1, "mainHand.base": 1,
  // at most 2 Ultimate-grade craft lines per item (user 2026-10-09; grades: data/craft_pools.json)
  "mainHand.ultimate": 2,
  "hoa.support": 5,
  // Vorax gear: 6 lines — ≤2 grafted legendaries, ≤2 Ultimate, ≤2 Advanced, the rest Basic (user 2026-10-09)
  ...Object.fromEntries(["head", "neck", "hands", "legs", "waist", "digits1", "digits2"].flatMap(l => [
    [`vorax.${l}.*`, 6], [`vorax.${l}.graft`, 2], [`vorax.${l}.ultimate`, 2], [`vorax.${l}.advanced`, 2]])),
};

/** HoA levels the real build already has above 20 (Lich legendary medium +1 to All Skills). */
export const HOA_LEVELS_ABOVE_20 = 1;

export interface Source {
  id: string;
  label: string;
  group: SourceGroup;
  edits: Edit[];
  cite: string;
  /** source ids (or `provides` capabilities) that must be present for this one to deal damage */
  requires?: string[];
  /** capabilities this source satisfies besides its own id (a graft carrying Solar Ring) */
  provides?: string[];
  /** craft pool this line occupies (capacity in SLOT_CAPACITY) */
  slot?: string;
  /** further capacity keys it counts against (an item's Ultimate-grade lines) */
  caps?: string[];
  /** source ids this one removes when taken (a corroded roll replacing the normal item) */
  replaces?: string[];
  /** a base taken together with its best lines (sources that require it), e.g. a Vorax piece */
  package?: boolean;
  note?: string;
}

/** bing1 step 0: L20 HoA (369% WAD, phys→fire), base Destroyer Mallet 175, L1 Blast Nova. */
export const BING_ZERO: Snapshot = {
  base: { weapon_phys_min: 175, weapon_phys_max: 175, gear_phys_pct: 0,
          weapon_flat_cold_min: 0, weapon_flat_cold_max: 0, weapon_attack_speed: 1.5,
          skill_weapon_pct: 369, flat_added_min: 0, flat_added_max: 0,
          flat_added_cold_min: 0, flat_added_cold_max: 0, added_damage_effectiveness_pct: 369 },
  increased: {},
  additional: {},
  conversion: [{ from: "physical", to: "fire", pct: 100 }],
  enemy_taken: {},
  crit: { chance_pct: 5, damage_pct: 150 },
  penetration: { cold_pct: 0, armor_pct: 0, erosion_pct: 0 },
  enemy: { cold_res_pct: 30, armor_reduction_pct: 0, erosion_res_pct: 30 },
  rotation: { bombs_per_throw: 2, throw_rate_base: 1, attack_speed_inc_pct: 0,
              hits_per_bomb: 0.8353, proj_base: 5, proj_added: 0,
              demolisher_empower_mult: 3.65, demolisher_resto_pct: 0 },
  tags: ["melee", "attack", "area", "projectile", "ranged",
         "horizontal_projectile", "parabolic_projectile"],
};

const H_BARE = 0.8353;
const H_REAL = 1.6528676812873455;   // RS-off-anchored fold-in (mechanics.md#real-build)
const H_ARROWS = 1.3286;             // Mighty Arrow pair, bare-rig back-solve (bing1 pactspirits)

const det = (k: string, v: number): Edit => ["add", `deterioration.${k}`, v];
const shadowLegendary = (n: number): Edit[] => [det("additional_damage_pct", 8 * n), det("duration_inc_pct", 5 * n)];

const RB = "data/bing1/real_buld_3_resolved.json";

export const REAL_BUILD_SOURCES: Source[] = [
  // ---- gear ----
  { id: "sierra", label: "Sierra Reverberation Maul (base + tower sequence)", group: "gear",
    // replaces the bare rig's 175 Destroyer Mallet; `add` so main-hand adds compose in any order
    edits: [["add", "base.weapon_phys_min", 220 - 175], ["add", "base.weapon_phys_max", 220 - 175],
            ["add", "additional.seq_mh", 16]],
    cite: `${RB} mainHand: 220 base physical; tower sequence +16% additional damage for Main-Hand Weapons` },
  { id: "sierra_adds", label: "Sierra prefix: adds 71–87 Physical", group: "gear", slot: "mainHand.prefix",
    edits: [["add", "base.weapon_phys_min", 71], ["add", "base.weapon_phys_max", 87]],
    cite: `${RB} mainHand prefix`, requires: ["sierra"] },
  { id: "sierra_gear_phys", label: "Sierra prefix: +62% Gear Physical Damage", group: "gear", slot: "mainHand.prefix",
    edits: [["add", "base.gear_phys_pct", 62]], cite: `${RB} mainHand prefix`, requires: ["sierra"] },
  { id: "sierra_melee", label: "Sierra prefix: +174% Melee Damage", group: "gear", slot: "mainHand.prefix",
    edits: [["add", "increased.melee", 174]], cite: `${RB} mainHand prefix`, requires: ["sierra"] },
  { id: "sierra_stationary", label: "Sierra suffix: +99% additional Attack Damage after standing still", group: "gear",
    slot: "mainHand.suffix",
    edits: [["add", "additional.standing_still", 99], ["add", "aux.as_more_sierra", -20]],
    cite: `${RB} mainHand suffix; −20% additional AS (SS13 gear pool eb8e123a)`, requires: ["sierra"],
    note: "+99% sits below T0 (101–124); T0+ is 143–153" },
  { id: "sierra_crit_rating", label: "Sierra suffix: +273% Critical Strike Rating", group: "gear", slot: "mainHand.suffix",
    edits: [["add", "aux.crit_rating_pct", 273]], cite: `${RB} mainHand suffix`, requires: ["sierra"] },
  { id: "sierra_physical", label: "Sierra suffix: +176% Physical Damage", group: "gear", slot: "mainHand.suffix",
    edits: [["add", "increased.physical", 176]], cite: `${RB} mainHand suffix`, requires: ["sierra"] },
  { id: "fools_crown", label: "Fool's Crown", group: "gear",
    edits: [["add", "base.weapon_phys_min", 95], ["add", "base.weapon_phys_max", 125],
            ["add", "aux.str_flat", 148]],
    cite: `${RB} helmet: Adds 95–125 Physical to the Main-Hand Weapon, +148 Strength` },
  { id: "deaths_touch", label: "Death's Touch", group: "gear",
    edits: [["add", "base.weapon_phys_min", 58], ["add", "base.weapon_phys_max", 71],
            ["add", "additional.base_2h_gloves", 85], ["add", "aux.as_local", 14]],
    cite: `${RB} gloves: +85% additional 2H base, +14% MH AS, adds 58–71; weapon crit rating fixed 500` },
  { id: "ruinous_star", label: "Ruinous Star (Obliterate)", group: "gear",
    edits: [["conv", "physical", "erosion", 100], ["conv", "fire", "erosion", 100],
            ["conv", "cold", "erosion", 100],
            det("hit_damage_pct", 60), ["set", "deterioration.duration_s", 1], det("duration_inc_pct", 30),
            ["set", "deterioration.tick_interval_s", 0.325], ["set", "deterioration.ramp_pct", 40],
            ["set", "deterioration.ramp_max_ticks", 6], ["set", "deterioration.obliterate_interval_s", 0.5],
            ["set", "deterioration.max_stacks", 99]],
    cite: "mechanics.md Obliterate + #deterioration (strict 0.325s grid, 40%/6 ramp roll, 99-stack cap), #real-build" },
  { id: "blade_dancer", label: "Blade-dancer's Steps", group: "gear",
    edits: [["add", "additional.blade_dancer", 45]],
    cite: `${RB} boots: +45% additional damage 5s after a Mobility Skill (Blink)` },
  { id: "kaleido_48", label: "Kaleidoscope (48 ring)", group: "gear",
    edits: [["add", "additional.kaleido_1", 48], ["add", "aux.as_inc", 7]],
    cite: "mechanics.md#real-build: rings deliver full value continuously (48-ring A/B ÷1.478)" },
  { id: "kaleido_60", label: "Kaleidoscope (60 ring)", group: "gear",
    edits: [["add", "additional.kaleido_2", 60], ["add", "aux.as_inc", 7]],
    cite: "mechanics.md#real-build: 60-ring A/B ÷1.735 vs ÷1.60 encoded (+8% hot, flagged)" },
  { id: "broken_sun", label: "Broken Sun Ring (Solar Ring)", group: "gear", provides: ["solar_ring"],
    edits: [["add", "enemy_taken.solar_ring", 40], ["add", "additional.sun_area_empower", 28]],
    cite: "mechanics.md#real-build: Solar Ring gates proximity lines at range; Broken-Sun A/B ÷2.88",
    note: "Well Matched, Marksman and the Ranger proximity slate need it under Firepower Coverage" },
  { id: "formation_breaker", label: "Formation Breaker", group: "gear", provides: ["fb_charge"],
    edits: [["add", "enemy_taken.fb_sentry", 30]], requires: ["charge_engine"],
    cite: `${RB} belt: Demolisher Charge per Sentry use (0.25s); +30% additional damage taken near Sentries` },
  { id: "charge_engine", label: "Charge engine: Flame Core (Sentry) + AM: Motionless", group: "engine",
    edits: [["del", "rotation.demolisher_resto_pct"], ["set", "rotation.demolisher_every_n", 1]],
    requires: ["fb_charge"],
    cite: "mechanics.md#real-build: charge per Sentry use (0.25s) outpaces throws ⇒ n=1" },

  // ---- HoA supports (values re-seasoned from _gem_levels) ----
  { id: "fusion", slot: "hoa.support", label: "Elemental Fusion", group: "support",
    edits: [["set", "_gem_levels.fusion", 22], ["add", "additional_typed.elemental.fusion", 36]],
    cite: "seasons.ts fusion anchors; mechanics.md#support-additional-sum (elemental-typed, 50/50 split)" },
  { id: "passivation", slot: "hoa.support", label: "Passivation", group: "support",
    edits: [["set", "_gem_levels.passivation", 24], ["add", "additional_typed.erosion.passivation", 64]],
    cite: "seasons.ts passivation anchors; bing1 Passivation ×1.5998", requires: ["ruinous_star"] },
  { id: "upheaval", slot: "hoa.support", label: "Upheaval (Magnificent)", group: "support",
    edits: [["add", "additional.upheaval", 20], ["add", "additional.upheaval_explosion", 17.8]],
    cite: "mechanics.md#real-build: main +20% face; explosion line measured ×1.178 (÷1.414 A/B)" },
  { id: "steamroll", slot: "hoa.support", label: "Steamroll", group: "support",
    edits: [["set", "_gem_levels.steamroll", 25], ["add", "additional.steamroll", 43],
            ["add", "aux.as_inc", -15]],
    cite: "seasons.ts steamroll anchors (SS13 −15% AS)" },
  { id: "slow_projectile", slot: "hoa.support", label: "Slow Projectile", group: "support",
    edits: [["set", "_gem_levels.slow_projectile", 25], ["add", "additional.slow_projectile", 31.5]],
    cite: "seasons.ts slow_projectile anchors; geometry saturated here (SP⇄MK ÷1.005)",
    note: "export socket is Melee Knockback; the snapshot models SP (A/B ÷1.005)" },

  // ---- auras / curse ----
  { id: "precise_projectiles", label: "Precise: Precise Projectiles", group: "aura",
    edits: [["add", "additional.precise_projectiles", 40]], cite: "mechanics.md#real-build (4 auras)" },
  { id: "cruelty", label: "Precise: Cruelty", group: "aura",
    edits: [["add", "additional.cruelty", 23.2]], cite: "mechanics.md#real-build (4 auras)" },
  { id: "weapon_amp", label: "Precise: Weapon Amplification", group: "aura",
    edits: [["add", "additional_typed.physical.weapon_amp", 36.8]], cite: "mechanics.md#real-build (physical-typed)" },
  { id: "erosion_amp", label: "Precise: Erosion Amplification", group: "aura",
    edits: [["add", "additional_typed.erosion.erosion_amp", 42.1]],
    cite: "mechanics.md#real-build (erosion-typed; F≈1.35 suspect, handoff §5.1)", requires: ["ruinous_star"] },
  { id: "timid", label: "Timid (AM: Demolisher)", group: "aura",
    edits: [["add", "enemy_taken.timid", 39]],
    cite: "mechanics.md#real-build: Timid A/B ÷1.390 (meas ÷1.365)", requires: ["charge_engine"] },

  // ---- hero traits ----
  { id: "firepower_coverage", label: "Firepower Coverage (L2)", group: "trait",
    edits: [["mul", "rotation.hits_per_bomb", H_REAL / H_BARE / H_ARROWS]],
    cite: "mechanics.md#real-build H fold-in (FC +50% proj size, 263% skill area) less the arrow pair",
    note: "carries the area/size geometry of the whole rig; FC cadence ×0.89 open (handoff §5.4)" },
  { id: "blast_barrage", label: "Blast Barrage (L2)", group: "trait",
    edits: [["set", "rotation.bombs_per_throw", 2.5]],
    cite: "mechanics.md memory-ladder row: 2 + 25%×2 = 2.5 bombs, measured ×1.269" },
  { id: "frenzy_hound", label: "Frenzy Hound (L2)", group: "trait",
    edits: [["add", "additional.frenzy_hound", 40]], cite: "mechanics.md memory-ladder row: ×1.40 at L2 (card text)" },

  // ---- talent trees (per-point; mechanics.md#real-build) ----
  { id: "tree_deception", label: "Goddess of Deception tree", group: "tree",
    edits: [["add", "increased.global", 81], det("chance_pct", 12), ["add", "increased.erosion", 27],
            ["add", "aux.crit_rating_pct", 105], ["add", "crit.damage_pct", 30],
            ["add", "additional.deception_to_life", 8]],
    cite: `${RB} skillTree goddess_of_deception (×3 per-point nodes; 8% additional applied to Life)` },
  { id: "forbidden_power", label: "Forbidden Power (Deception notable)", group: "tree",
    edits: [["add", "additional_typed.erosion.forbidden_power", 35]],
    cite: "mechanics.md#real-build (F≈1.35 suspect, handoff §5.1)", requires: ["ruinous_star"] },
  { id: "tree_shadowmaster", label: "Shadowmaster tree", group: "tree",
    edits: [["add", "increased.erosion", 108], ["add", "aux.crit_rating_pct", 105], ["add", "crit.damage_pct", 30],
            det("chance_pct", 36), ...shadowLegendary(1), det("damage_inc_pct", 16)],
    cite: `${RB} skillTree shadowmaster (×3/×2 per-point nodes + legendary medium)` },
  { id: "dirt", label: "Dirt (Shadowmaster notable)", group: "tree",
    edits: [["add", "additional_typed.erosion.dirt", 15], ["add", "additional.dirt_to_life", 10]],
    cite: "mechanics.md#real-build", requires: ["ruinous_star"] },
  { id: "tree_onslaughter", label: "Onslaughter tree", group: "tree",
    edits: [["add", "increased.attack", 117], ["add", "additional.base_2h_tree_a", 12],
            ["add", "additional.base_2h_tree_b", 10], ["add", "aux.crit_rating_pct", 205],
            ["add", "aux.str_pct", 24], ["add", "crit.damage_pct", 10],
            ["set", "paralysis.chance_pct", 0], ["add", "paralysis.effect_inc_pct", 80]],
    cite: `${RB} skillTree onslaughter (27+54+36 attack; 4%×3 + 10% 2H base; Str% 4×3+12; Paralysis effect dead at chance 0)` },
  { id: "well_matched", label: "Well Matched (Onslaughter notable)", group: "tree",
    edits: [["add", "additional.well_matched", 40]],
    cite: "mechanics.md#real-build: proximity line carried by Solar Ring", requires: ["solar_ring"] },
  { id: "tree_lich", label: "Lich tree", group: "tree",
    edits: [["add", "increased.global", 108], ["add", "aux.crit_rating_pct", 105],
            ["add", "crit.damage_pct", 15], ["add", "aux.as_inc", 18]],
    cite: `${RB} skillTree lich (+1 All Skills' Levels unmodeled: HoA stays L20)` },
  { id: "haze_prism", label: "Ethereal Prism: Haze", group: "prism",
    edits: [["add", "additional.base_2h_prism", 12]],
    cite: `${RB} etherealPrisms: +12% additional Base Damage for Two-Handed Weapons` },

  // ---- divinity slates ----
  { id: "slate_pedigree", label: "Pedigree of Gods (Mixture)", group: "slate",
    edits: [det("chance_pct", 50), ...shadowLegendary(1)],
    cite: `${RB} divinity: Mixture +50% Deterioration Chance; Shadowmaster legendary 8/5` },
  { id: "slate_starlight_str", label: "Fallen Starlight (+8 Str)", group: "slate",
    edits: [["add", "aux.str_flat", 8], ...shadowLegendary(1)], cite: `${RB} divinity` },
  { id: "slate_starlight_dmg", label: "Fallen Starlight (+9% damage)", group: "slate",
    edits: [["add", "increased.global", 9], ...shadowLegendary(1)], cite: `${RB} divinity` },
  { id: "slate_starlight_as", label: "Fallen Starlight (+3% AS)", group: "slate",
    edits: [["add", "increased.attack", 10], ["add", "aux.as_inc", 3], ...shadowLegendary(1)],
    cite: `${RB} divinity (+10% Attack Damage while Tenacity Blessing)` },
  { id: "slate_corner_machinist", label: "A Corner of Divinity (Machinist + Shadowmaster)", group: "slate",
    edits: shadowLegendary(1), cite: `${RB} divinity` },
  { id: "slate_corner_taken", label: "A Corner of Divinity (Marksman + Ranger taken)", group: "slate",
    edits: [["add", "increased.projectile", 60], ["add", "enemy_taken.ranger", 15]],
    cite: `${RB} divinity; proximity lines carried by Solar Ring (mechanics.md#real-build)`,
    requires: ["solar_ring"] },
  { id: "slate_corner_knockback", label: "A Corner of Divinity (Marksman + Ranger knockback)", group: "slate",
    edits: [["add", "increased.projectile", 60], ["add", "increased.ranger_knockback", 57.6]],
    cite: "mechanics.md#real-build: Ranger slate knockback→damage +57.6 (increased-type)",
    requires: ["solar_ring"] },

  // ---- hero memories ----
  { id: "memory_origin", label: "Memory of Origin", group: "memory",
    edits: [["add", "aux.str_flat", 90], ["add", "increased.global", 28], ["add", "aux.crit_rating_pct", 80],
            ["add", "increased.attack", 47], ["add", "crit.damage_pct", 53]],
    cite: `${RB} heroMemories slot45` },
  { id: "memory_discipline", label: "Memory of Discipline", group: "memory",
    edits: [["add", "crit.damage_pct", 38], ["add", "aux.crit_rating_pct", 160], ["add", "increased.attack", 51]],
    cite: `${RB} heroMemories slot60` },
  { id: "memory_progress", label: "Memory of Progress", group: "memory",
    edits: [["add", "increased.fire", 52], ["add", "aux.crit_rating_pct", 80]],
    cite: `${RB} heroMemories slot75`,
    note: "lunar affix (40% of Erosion bonus → Deterioration, up to +80%) unencoded (handoff §3)" },

  // ---- pactspirits + kismets ----
  { id: "iron_lion", label: "Iron Lion (L1)", group: "pact",
    edits: [["add", "increased.projectile", 40], ["add", "rotation.proj_added", 1]],
    cite: "mechanics.md parser row: Iron Lion +10/+10/+20% Projectile Damage; sheet proj 6 (encoded 6/5, open)" },
  { id: "saintess", label: "Portrait of a Fallen Saintess (L4)", group: "pact",
    edits: [["add", "increased.erosion", 112], ["add", "increased.global", 6],
            ["add", "penetration.erosion_pct", 10],
            ["add", "additional_typed.erosion.repentance", (1.04 ** 6 - 1) * 100]],
    cite: "bing1 real-build Saintess lever ÷1.5765 (meas ÷1.574): env + pen 10 + Repentance 1.04⁶",
    requires: ["ruinous_star"] },
  { id: "kitty", label: "Kitty Express (L6, kismet-reduced)", group: "pact",
    edits: [["add", "increased.attack", 24], ["add", "increased.global", 6],
            ["add", "aux.crit_rating_pct", 88], ["add", "aux.as_inc", 12]],
    cite: "bing1 pactspirits: Kitty nodes at face (×1.611 vs meas ×1.6296), Mighty Arrow kismet replaces Attack Dmg II" },
  { id: "kitty_stimulant", label: "Feline Stimulant + Aggression (FC-triggered)", group: "pact",
    edits: [["add", "additional.kitty_stimulant", 44.73], ["add", "aux.as_more_aggression", 5]],
    cite: "mechanics.md#pactspirits: trigger semantics — live only under Firepower Coverage auto-throw",
    requires: ["kitty", "firepower_coverage"] },
  { id: "mighty_arrow", label: "Dual Kismet: Mighty Arrow pair", group: "kismet",
    edits: [["add", "enemy_taken.mighty_arrow", 25], ["mul", "rotation.hits_per_bomb", H_ARROWS]],
    cite: "bing1 pactspirits: pair across pages, +25% taken at face, −25% proj speed geometry ×1.3286" },
  { id: "fate_strength", label: "2× Micro Fate: Strength", group: "kismet",
    edits: [["add", "aux.str_flat", 27]], cite: `${RB} kismets (13 + 14)` },
  { id: "fate_det_duration", label: "Micro Fate: Deterioration Duration", group: "kismet",
    edits: [det("duration_inc_pct", 3)], cite: `${RB} kismets (+3)` },

  // ---- residuals: what the hand-encoded snapshot carries beyond the attributed lines ----
  { id: "resid_flat_adds", label: "Unattributed flat adds (30 phys, 22.1 erosion)", group: "residual",
    edits: [["set", "base.flat_added_min", 30], ["set", "base.flat_added_max", 30],
            ["set", "base.flat_added_erosion_min", 22.1], ["set", "base.flat_added_erosion_max", 22.1]],
    cite: "real_buld_3_snapshot.json; no export line found" },
  { id: "resid_increased", label: "Increased-pool residual (+6 global, −9 attack)", group: "residual",
    edits: [["add", "increased.global", 6], ["add", "increased.attack", -9]],
    cite: "snapshot sums vs export line sums (global 244 vs 238, attack 240 vs 249)" },
  { id: "resid_crit_damage", label: "Crit damage residual (+36)", group: "residual",
    edits: [["add", "crit.damage_pct", 36]],
    cite: "sheet 362% vs 326% from lines; likely Haze prism +6% on in-area mediums" },
  { id: "resid_attack_speed", label: "Attack-speed sheet residual", group: "residual",
    edits: [["add", "aux.as_more_sheet", (1.379 / (1.32 * 0.8 * 1.05 * 1.14) - 1) * 100]],
    cite: "sheet 1.97/1.5 × Aggression 1.05 = 37.9% vs lines; Steamroll share in the sheet unverified (handoff §6.2)" },
];

function setPath(o: any, path: string, f: (v: number | undefined) => number | undefined): void {
  const keys = path.split(".");
  let d = o;
  for (const k of keys.slice(0, -1)) d = d[k] ??= {};
  const last = keys[keys.length - 1];
  const v = f(d[last]);
  if (v === undefined) delete d[last];
  else d[last] = v;
}

/** Apply `sources` to a copy of `zero` and derive crit chance, Strength and attack speed. */
/** The sources that still deal damage: drops, to a fixpoint, any whose `requires` are unmet. */
export function effective(sources: Source[]): Source[] {
  let set = sources;
  for (;;) {
    const have = new Set(set.flatMap(s => [s.id, ...s.provides ?? []]));
    const next = set.filter(s => (s.requires ?? []).every(r => have.has(r)));
    if (next.length === set.length) return set;
    set = next;
  }
}

export function compose(zero: Snapshot, sources: Source[]): Snapshot {
  const s: any = structuredClone(zero);
  for (const src of sources) for (const e of src.edits) {
    if (e[0] === "conv") s.conversion = [...(s.conversion ?? []), { from: e[1], to: e[2], pct: e[3] }];
    else if (e[0] === "del") setPath(s, e[1], () => undefined);
    else if (e[0] === "set") setPath(s, e[1], () => e[2]);
    else if (e[0] === "add") setPath(s, e[1], v => (v ?? 0) + e[2]);
    else setPath(s, e[1], v => (v ?? 0) * e[2]);
  }
  const aux: Record<string, number> = s.aux ?? {};
  delete s.aux;
  const pct = (k: string) => (aux[k] ?? 0) / 100;
  if (aux.crit_rating_pct) s.crit.chance_pct = Math.min(100, 5 * (1 + pct("crit_rating_pct")));
  const str = Math.round((aux.str_flat ?? 0) * (1 + pct("str_pct")));   // sheet shows integer Str (339)
  if (str) s.additional.strength = str / 2;
  let as = (1 + pct("as_inc")) * (1 + pct("as_local"));
  for (const k of Object.keys(aux)) if (k.startsWith("as_more")) as *= 1 + pct(k);
  // "+X% additional Deterioration Damage" sources are each their own ×(1+v) (mechanics.md:275)
  for (const k of Object.keys(aux)) if (k.startsWith("det_more") && s.deterioration) {
    s.deterioration.additional_damage_pct =
      ((1 + (s.deterioration.additional_damage_pct ?? 0) / 100) * (1 + pct(k)) - 1) * 100;
  }
  s.rotation.attack_speed_inc_pct = (as - 1) * 100;
  // "+N Support Skill Level" raises every socketed seasoned gem (applySeason reads the level)
  if (aux.support_level) for (const gem of Object.keys(s._gem_levels ?? {})) s._gem_levels[gem] += aux.support_level;
  if (aux.skill_level) {
    const band = (l: number) => 1 + skillLevelAdditionalPct(l) / 100;
    s.additional.skill_levels = (band(HOA_LEVELS_ABOVE_20 + aux.skill_level) / band(HOA_LEVELS_ABOVE_20) - 1) * 100;
  }
  return s as Snapshot;
}
