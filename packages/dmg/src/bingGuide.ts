/* Bing progression guide from a level-60 map-entry character (mechanics.md#bing-guide).

   Stages walk character levels with an FE budget each: every stage takes the moves with the
   most log-DPS per FE that its level allows (free ones first) — crafted rare lines from the
   live affix library, weapon-base swaps, gems, legendaries (which replace the rare in their
   slot), talent trees within the level's point budget, traits as they unlock. Items with no
   price are reported, not bought. Pure: no I/O; prices and the library come in. */
import { cycleDps, type Snapshot } from "./damageModel.js";
import { applySeason, type Season } from "./seasons.js";
import { BING_ZERO, REAL_BUILD_SOURCES, compose, effective, type Source } from "./bingLedger.js";
import { craftOptions, craftSource, EMBER_FOR_GRADE, type LibraryAffix } from "./bingCraft.js";
import { walk, type PathStep } from "./bingProgression.js";

/** Guide items: id → gear type in the affix library (STR armor bases: Bing scales Strength). */
export const GUIDE_ITEMS: Record<string, string> = {
  mainHand: "Two-Handed Hammer", helmet: "STR Helmet", chest: "STR Chest Armor", gloves: "STR Gloves",
  boots: "STR Boots", belt: "Belt", necklace: "Necklace", ring1: "Ring", ring2: "Ring",
};

/** 2H-hammer bases from item level 54 (poorchlight SS13 catalog gear implicits; all 1.5 APS, 500 crit rating). */
const HAMMER_BASES: [string, number, number][] = [
  ["Vindicator Maul", 54, 70], ["Vanquisher Mallet", 59, 90], ["Platinum Mallet", 64, 110],
  ["Lava Maul", 68, 135], ["Crumbling Maul", 72, 160], ["Destroyer Mallet", 82, 175],
  ["Forger's Maul", 84, 190], ["Sierra Reverberation Maul", 86, 220],
];

/** Level 60, entering maps: a Vindicator Maul, HoA L20, traits up to Blast Barrage (L60). */
export const GUIDE_ZERO: Snapshot = (() => {
  const s = structuredClone(BING_ZERO);
  s.base.weapon_phys_min = s.base.weapon_phys_max = HAMMER_BASES[0][2];
  return s;
})();

/** Ledger source → [ETOR item name, guide item it replaces]. */
const LEGENDARIES: Record<string, [string, string]> = {
  fools_crown: ["Fool's Crown", "helmet"], ruinous_star: ["Ruinous Star", "chest"],
  deaths_touch: ["Death's Touch", "gloves"], blade_dancer: ["Blade-dancer's Steps", "boots"],
  formation_breaker: ["Formation Breaker", "belt"], broken_sun: ["Broken Sun Ring", "necklace"],
  kaleido_48: ["Kaleidoscope", "ring1"], kaleido_60: ["Kaleidoscope", "ring2"],
};
/** Ledger gem sources → ETOR item name (unlisted gems drop freely: cost 0). */
const GEM_PRICES: Record<string, string> = {
  upheaval: "Hammer of Ash: Upheaval (Magnificent)", precise_projectiles: "Precise: Precise Projectiles",
  cruelty: "Precise: Cruelty", weapon_amp: "Precise: Weapon Amplification",
  erosion_amp: "Precise: Erosion Amplification", timid: "Activation Medium: Demolisher",
};
/** Plain auras (L20 at the build's 1.0525 aura effect) that their Precise versions replace. */
const PLAIN_AURAS: [string, string, string, number, string][] = [
  ["plain_precise_projectiles", "Precise Projectiles", "additional_typed.projectile.precise_projectiles", 35, "precise_projectiles"],
  ["plain_cruelty", "Cruelty", "additional.cruelty", 19 * 1.0525, "cruelty"],
  ["plain_weapon_amp", "Weapon Amplification", "additional_typed.physical.weapon_amp", 35 * 1.0525, "weapon_amp"],
  ["plain_erosion_amp", "Erosion Amplification", "additional_typed.erosion.erosion_amp", 35 * 1.0525, "erosion_amp"],
];
const TREE_POINTS: Record<string, number> = {
  tree_deception: 25, tree_shadowmaster: 24, tree_onslaughter: 32, tree_lich: 26,
};
const NOTABLE_TREE: Record<string, string> = {
  forbidden_power: "tree_deception", dirt: "tree_shadowmaster", well_matched: "tree_onslaughter",
};
const UNPRICED = new Set(["slate", "memory", "prism", "residual"]);

/** Talent points at a character level (107 at 100, the reference build; linear assumption). */
export const talentPoints = (level: number) => Math.round(107 * (level - 1) / 99);

export interface GuideStage { level: number; budget: number }
export const DEFAULT_STAGES: GuideStage[] = [
  { level: 60, budget: 20 }, { level: 68, budget: 60 }, { level: 72, budget: 150 }, { level: 76, budget: 400 },
  { level: 82, budget: 1000 }, { level: 86, budget: 3000 }, { level: 90, budget: 8000 },
  { level: 95, budget: 20000 }, { level: 100, budget: 60000 },
];

export interface GuideInputs {
  library: LibraryAffix[];
  /** FE price by ETOR item name; missing = unpriced */
  price: (name: string) => number | undefined;
  stages?: GuideStage[];
  season?: Season;
}

export interface GuideStep extends PathStep { stage: number; items: string[] }
export interface GuideResult {
  zeroDps: number;
  steps: GuideStep[];
  stages: { level: number; budget: number; spent: number; dps: number; sources: string[] }[];
  /** sources the guide could not buy because nobody priced them */
  unpriced: { id: string; label: string }[];
}

const itemOf = (s: Source): string | undefined => s.slot?.split(".")[0];

/** Every source the guide may take, with costs and levels. */
export function guidePool(inputs: GuideInputs, itemLevel = 100): { start: Source[]; pool: Source[]; unpriced: Source[] } {
  const { library, price } = inputs;
  const rare: Source[] = Object.keys(GUIDE_ITEMS).map(item => ({
    id: `rare_${item}`, label: `Rare ${item}`, group: "gear", edits: [], cite: "guide start: an empty rare base",
  }));
  const start: Source[] = [...rare,
    ...REAL_BUILD_SOURCES.filter(s => s.id === "firepower_coverage" || s.id === "blast_barrage")];

  const pool: Source[] = [];
  const unpriced: Source[] = [];
  const ember = (grade: keyof typeof EMBER_FOR_GRADE) => price(EMBER_FOR_GRADE[grade]);

  // crafted rare lines on every guide item, every reachable tier
  for (const [item, gearType] of Object.entries(GUIDE_ITEMS)) {
    for (const o of craftOptions(library, gearType, itemLevel)) {   // item level = character level
      const unit = ember(o.grade);
      const src = craftSource(o, item, unit === undefined ? null : unit * o.expectedEmbers);
      if (!src) continue;
      src.requires = [`rare_${item}`, ...src.requires ?? []];
      (src.cost === undefined ? unpriced : pool).push(src);
    }
  }
  // weapon bases (a white base costs ~nothing)
  for (const [name, level, phys] of HAMMER_BASES.slice(1)) {
    const d = phys - HAMMER_BASES[0][2];
    pool.push({ id: `base_${name}`, label: `Weapon base: ${name} (${phys} phys)`, group: "gear", family: "mainHand_base",
                edits: [["add", "base.weapon_phys_min", d], ["add", "base.weapon_phys_max", d]],
                cite: "poorchlight SS13 catalog 2H-hammer implicits", cost: 0, level, requires: ["rare_mainHand"] });
  }
  // plain auras, replaced by their Precise versions
  for (const [id, name, path, value, precise] of PLAIN_AURAS) {
    const aura: Source = { id, label: name, group: "aura", family: `aura_${precise}`, edits: [["add", path, value]],
                cite: "tlidb plain aura L20 (scratch levels table)", cost: price(name),
                requires: precise === "erosion_amp" ? ["ruinous_star"] : undefined };
    (aura.cost === undefined ? unpriced : pool).push(aura);   // missing price = unpriced, not free
  }

  for (const s0 of REAL_BUILD_SOURCES) {
    if (start.includes(s0) || s0.id.startsWith("sierra") || s0.group === "residual") continue;
    if (UNPRICED.has(s0.group)) {
      // no market source: bought only once the user prices it (by its label)
      const cost = price(s0.label);
      (cost === undefined ? unpriced : pool).push({ ...s0, cost });
      continue;
    }
    const s: Source = { ...s0 };
    if (s.id in LEGENDARIES) {
      const [name, item] = LEGENDARIES[s.id];
      s.replaces = [...s.replaces ?? [], `rare_${item}`];
      s.cost = price(name);
    } else if (s.id in TREE_POINTS) {
      Object.assign(s, { slot: "talent", size: TREE_POINTS[s.id], cost: 0 });
    } else if (s.id in NOTABLE_TREE) {
      Object.assign(s, { requires: [...s.requires ?? [], NOTABLE_TREE[s.id]], cost: 0 });
    } else if (s.id === "frenzy_hound") {
      Object.assign(s, { level: 75, cost: 0 });
    } else if (s.id in GEM_PRICES) {
      s.cost = price(GEM_PRICES[s.id]);   // missing price = unpriced, not free
      const plain = PLAIN_AURAS.find(a => a[4] === s.id);
      if (plain) s.family = `aura_${s.id}`;
    } else {
      s.cost = 0;   // supports, engine, traits, pactspirits and kismets (user: pactspirit levels unimportant)
    }
    (s.cost === undefined ? unpriced : pool).push(s);
  }
  return { start, pool, unpriced };
}

export function buildGuide(inputs: GuideInputs): GuideResult {
  const season = inputs.season ?? "ss14";
  const stages = inputs.stages ?? DEFAULT_STAGES;
  const { start, unpriced } = guidePool(inputs);
  const dpsOf = (set: Source[]) => cycleDps(applySeason(compose(GUIDE_ZERO, effective(set)), season)).dps;
  // every guide item is a rare with 3 prefix / 3 suffix pools and at most 2 Ultimate lines
  const itemCapacity = Object.fromEntries(Object.keys(GUIDE_ITEMS).flatMap(item =>
    [[`${item}.prefix`, 3], [`${item}.suffix`, 3], [`${item}.ultimate`, 2]]));

  let have = [...start];
  let budgetLeft = 0;
  const steps: GuideStep[] = [];
  const out: GuideResult["stages"] = [];
  for (const [n, st] of stages.entries()) {
    budgetLeft += st.budget;
    // crafts are priced at this stage's item level (= character level)
    const { pool } = guidePool(inputs, st.level);
    const byId = new Map([...have, ...pool].map(s => [s.id, s]));
    const owned = new Set(have.map(s => s.id));
    const stagePath = walk(GUIDE_ZERO, have, pool.filter(s => !owned.has(s.id)), season, {
      byCost: true, untilNoGain: true, maxLevel: st.level, budget: budgetLeft,
      capacity: { talent: talentPoints(st.level), ...itemCapacity },
    });
    let spent = 0;
    for (const step of stagePath) {
      have = [...have.filter(s => !step.removed.includes(s.id)), ...step.ids.map(id => byId.get(id)!)];
      spent += step.cost;
      steps.push({ ...step, stage: n, items: [...new Set(step.ids.map(id => itemOf(byId.get(id)!) ?? "build"))] });
    }
    budgetLeft -= spent;
    out.push({ level: st.level, budget: st.budget, spent, dps: dpsOf(have), sources: have.map(s => s.id) });
  }
  return { zeroDps: dpsOf(start), steps, stages: out, unpriced: unpriced.map(s => ({ id: s.id, label: s.label })) };
}
