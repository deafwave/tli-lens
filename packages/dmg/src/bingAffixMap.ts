/* Affix text → Bing ledger edits (mechanics.md#bing-affix-map).

   Every gear affix in the live library (data/affix_library.json, from
   Torchlight_Affix_Review.xlsx) is classified for the Hammer of Ash build as
     mapped     — edits the ledger composes (bingLedger.compose),
     irrelevant — cannot add Bing boss DPS (defense, minion, spell, other skill kinds),
     unknown    — damage-shaped but unmodeled; reported, never silently dropped.
   Input is in-game text with concrete numbers (pick the roll before calling).
   Pure: no I/O. */
import type { Edit } from "./bingLedger.js";

export type AffixMapping =
  | { kind: "mapped"; edits: Edit[] }
  | { kind: "irrelevant"; why: string }
  | { kind: "unknown" };

const N = "([+-]?\\d+(?:\\.\\d+)?)";
const r = (src: string) => new RegExp(`^${src}$`, "i");

/** HoA tags: Area, Fire, Attack, Projectile, Melee, Demolisher, Horizontal; Active, Main. */
const HOA_LEVEL = /^(Active|Attack|Melee|Fire|Main|Projectile|Area)$/i;
const FLAT_TYPES: Record<string, string> = {
  physical: "flat_added", cold: "flat_added_cold", fire: "flat_added_fire",
  lightning: "flat_added_lightning", erosion: "flat_added_erosion",
};
const WEAPON_TYPES: Record<string, string> = {
  physical: "weapon_phys", cold: "weapon_flat_cold", fire: "weapon_flat_fire",
  lightning: "weapon_flat_lightning", erosion: "weapon_flat_erosion",
};
// increased keys the model gates by HoA's tags / damage-type history (damageModel increasedApplies)
const INCREASED: Record<string, string> = {
  "": "global", attack: "attack", melee: "melee", area: "area", projectile: "projectile",
  physical: "physical", fire: "fire", elemental: "elemental", erosion: "erosion",
  "attack and spell": "attack", "fire skill": "fire",
};
const ADDITIONAL_TYPED: Record<string, string> = {
  physical: "physical", fire: "elemental", elemental: "elemental", erosion: "erosion",
};

type Rule = [RegExp, (m: RegExpMatchArray, key: string) => Edit[] | string];

/* `key` names this line's own additional/taken bucket so two sources multiply
   (mechanics.md#additional) instead of summing into one key. */
const RULES: Rule[] = [
  // ---- skill levels ----
  [r(`\\+${N} (?:to )?(\\w+) Skill Levels?`), m => HOA_LEVEL.test(m[2])
    ? [["add", "aux.skill_level", +m[1]]] : m[2].toLowerCase() === "support"
    ? [["add", "aux.support_level", +m[1]]] : `${m[2]} skill level (HoA is not ${m[2]})`],
  [r(`\\+${N} to All Skills' Levels`), m => [["add", "aux.skill_level", +m[1]]]],
  // ---- flat damage ----
  [r(`Adds ${N} - ${N} (Physical|Cold|Fire|Lightning|Erosion) Damage to the gear`), (m, k) => {
    const t = WEAPON_TYPES[m[3].toLowerCase()];
    return k.startsWith("weapon") ? [["add", `base.${t}_min`, +m[1]], ["add", `base.${t}_max`, +m[2]]]
      : "gear-local flat damage on a non-weapon";
  }],
  [r(`Adds ${N} - ${N} Physical Damage to the Main-Hand Weapon`), m =>
    [["add", "base.weapon_phys_min", +m[1]], ["add", "base.weapon_phys_max", +m[2]]]],
  [r(`Adds ${N} - ${N} (Physical|Cold|Fire|Lightning|Erosion) Damage to Attacks(?: and Spells)?`), m => {
    const t = FLAT_TYPES[m[3].toLowerCase()];
    return [["add", `base.${t}_min`, +m[1]], ["add", `base.${t}_max`, +m[2]]];
  }],
  [r(`Adds ${N} - ${N} (?:Physical|Cold|Fire|Lightning|Erosion) Damage to Spells`), () => "spell-only"],
  // ---- weapon-local ----
  [r(`\\+${N}% Gear Physical Damage`), (m, k) => k.startsWith("weapon")
    ? [["add", "base.gear_phys_pct", +m[1]]] : "gear physical on a non-weapon"],
  [r(`\\+${N}% Attack Critical Strike Rating for this gear`), (m, k) => k.startsWith("weapon")
    ? [["add", "aux.crit_local_pct", +m[1]]] : "local crit rating on a non-weapon"],
  [r(`\\+${N}% (?:gear|Gear) Attack Speed`), (m, k) => k.startsWith("weapon")
    ? [["add", "aux.as_local", +m[1]]] : "local attack speed on a non-weapon"],
  [r(`\\+${N}% Main-Hand Weapon Attack Speed`), m => [["add", "aux.as_local", +m[1]]]],
  [r(`-${N}% Gear Physical Damage`), (m, k) => k.startsWith("weapon")
    ? [["add", "base.gear_phys_pct", -m[1]]] : "gear physical on a non-weapon"],
  // ---- increased ----
  [r(`\\+${N}% (Attack|Melee|Area|Projectile|Physical|Fire|Elemental|Erosion|Attack and Spell|Fire Skill )?\\s?Damage`),
    m => [["add", `increased.${INCREASED[(m[2] ?? "").trim().toLowerCase()]}`, +m[1]]]],
  [r(`\\+${N}% (Spell|Minion|Cold|Lightning|Channeled|Sentry|Summon|Trauma|Ignite|Wilt|Ailment|Focus|Synthetic Troop)\\S* Damage`),
    m => `${m[2]} damage`],
  [r(`\\+${N}% Damage Over Time`), m => [["add", "deterioration.damage_inc_pct", +m[1]]]],
  // ---- additional ----
  [r(`\\+${N}% additional (?:Attack )?[Dd]amage`), (m, k) => [["add", `additional.${k}`, +m[1]]]],
  [r(`\\+${N}% additional Projectile Damage`), (m, k) => [["add", `additional_typed.projectile.${k}`, +m[1]]]],
  [r(`\\+${N}% additional (Melee|Attack|Area|Hit) Damage`), (m, k) => [["add", `additional.${k}`, +m[1]]]],
  [r(`\\+${N}% additional (Physical|Fire|Elemental|Erosion) Damage`), (m, k) =>
    [["add", `additional_typed.${ADDITIONAL_TYPED[m[2].toLowerCase()]}.${k}`, +m[1]]]],
  [r(`\\+${N}% additional damage for Main-Hand Weapons`), (m, k) => [["add", `additional.${k}`, +m[1]]]],
  [r(`\\+${N}% additional Base Damage for Two-Handed Weapons`), (m, k) => [["add", `additional.${k}`, +m[1]]]],
  // only empowered (charge-consuming) hits get it: the empowered hit types (counted path, #bing-hit-counts) and M
  // (manual-throw July fold, #bing-bombs)
  [r(`\\+${N}% additional (?:skill )?damage when Demolisher Charge is consumed\\.?`), (m, k) =>
    [["mul", "rotation.demolisher_empower_mult", 1 + +m[1] / 100], ["add", `rotation.empower_more_${k}`, +m[1]]]],
  // Bull's Rage's cooldown, hence its uptime (mechanics.md#bing-hit-counts)
  [r(`\\+${N}% Cooldown Recovery Speed`), m => [["add", "rotation.cdr_inc_pct", +m[1]]]],
  [r(`\\+?${N}% additional Attack Damage after standing still for ${N}s\\. -${N}% additional Attack Speed`),
    (m, k) => [["add", `additional.${k}`, +m[1]], ["add", `aux.as_more_${k}`, -m[3]]]],
  [r(`${N}% additional damage applied to Life`), (m, k) => [["add", `additional.${k}_to_life`, +m[1]]]],
  [r(`\\+${N}% additional damage taken by Nearby enemies`), (m, k) => [["add", `enemy_taken.${k}`, +m[1]]]],
  [r(`\\+${N}% additional (?:Spell|Minion|Cold|Lightning|Sentry|Trauma|Ignite|Wilt|Steep Strike|Shadow|Terra)\\S* Damage`),
    () => "conditional/other-kind additional damage"],
  // ---- crit / double ----
  [r(`\\+${N}% (?:Attack )?Critical Strike Rating`), m => [["add", "aux.crit_rating_pct", +m[1]]]],
  [r(`\\+${N} (?:Attack and Spell )?Critical Strike Rating`), m => [["add", "aux.crit_flat", +m[1]]]],
  [r(`\\+${N}% (?:Attack )?Critical Strike Damage`), m => [["add", "crit.damage_pct", +m[1]]]],
  [r(`\\+${N}% (?:Spell|Minion) Critical Strike (?:Rating|Damage)`), () => "spell/minion crit"],
  [r(`\\+${N}% chance to deal Double Damage`), m => [["add", "crit.double_damage_chance_pct", +m[1]]]],
  // ---- penetration ----
  [r(`\\+${N}% Elemental and Erosion Resistance Penetration`), m =>
    [["add", "penetration.erosion_pct", +m[1]], ["add", "penetration.cold_pct", +m[1]]]],
  [r(`\\+${N}% Erosion (?:Resistance )?Penetration`), m => [["add", "penetration.erosion_pct", +m[1]]]],
  [r(`\\+${N}% Armor DMG Mitigation Penetration`), () => "armor pen (all damage ends as erosion)"],
  // ---- deterioration ----
  [r(`\\+${N}% Deterioration Chance`), m => [["add", "deterioration.chance_pct", +m[1]]]],
  [r(`\\+${N}% Deterioration Damage`), m => [["add", "deterioration.damage_inc_pct", +m[1]]]],
  [r(`\\+${N}% additional Deterioration Duration`), m => [["add", "deterioration.duration_inc_pct", +m[1]]]],
  [r(`\\+${N}% additional Deterioration Damage`), (m, k) => [["add", `aux.det_more_${k}`, +m[1]]]],
  // ---- attributes / speed ----
  [r(`\\+${N} Strength`), m => [["add", "aux.str_flat", +m[1]]]],
  [r(`\\+${N}% Strength`), m => [["add", "aux.str_pct", +m[1]]]],
  [r(`\\+${N} (?:Dexterity|Intelligence)`), () => "off-stat (Bing scales Strength)"],
  [r(`\\+${N}% (?:Dexterity|Intelligence)`), () => "off-stat (Bing scales Strength)"],
  [r(`-${N}% additional (?:Dexterity|Intelligence)`), () => "off-stat (Bing scales Strength)"],
  [r(`\\+${N}% inflicted Paralysis Effect`), () => "paralysis (the build inflicts none)"],
  [/when holding a One-Handed Weapon$/i, () => "one-handed only (Bing holds a Two-Handed Weapon)"],
  [r(`\\+${N}% damage for Channeled Skills`), () => "channeled skills"],
  [r(`${N}% (?:Attack and Cast|Attack) Speed`), m => [["add", "aux.as_inc", +m[1]]]],
  // Tenacity Blessing: 4 base stacks (tlidb); Sacrifice turns each into ×(1+v) additional (mechanics.md#tenacity)
  [r(`Changes the base effect of Tenacity Blessing to: \\+${N}% additional damage`), m => [["add", "aux.tenacity_more", +m[1]]]],
  [r(`\\+${N} to Max Tenacity Blessing Stacks`), m => [["add", "aux.tenacity_stacks", +m[1]]]],
  [r(`\\+${N}% chance to gain ${N} stack\\(s\\) of Tenacity Blessing when hitting an enemy`),
    m => [["add", "aux.tenacity_gain", +m[1]]]],
  [r(`\\+${N}% Attack Damage while Tenacity Blessing is active`), m => [["add", "aux.tenacity_attack", +m[1]]]],
  [r(`\\+${N}% Demolisher Charge Restoration Speed`), m => [["add", "rotation.demolisher_resto_pct", +m[1]]]],
  [r(`\\+${N}% Aura Effect`), m => [["add", "aux.aura_effect", +m[1]]]],
  // distance only; a Ranger knockback→damage line converts it (compose: aux.knockback × aux.knockback_conv)
  [r(`\\+${N}% Knockback distance`), m => [["add", "aux.knockback", +m[1]]]],
  [r(`\\+${N}% (?:Projectile Speed|Skill Area)`), () => "geometry (folded into hits_per_bomb; mechanics.md#bing-skill-area)"],
];

const IRRELEVANT: [RegExp, string][] = [
  [/Life|Mana|Energy Shield|Armor|Evasion|Resistance|Block|Movement Speed|Regain|Regenerat|Restoration|Recovery|avoid|Immune|Mitigation|damage taken|Damage taken|Defense|Deflection|Blur|Fortitude/i, "defense/utility"],
  [/Minion|Spirit Magi|Synthetic|Summon|Sentry|Shadow Quantity|Terra|Tangle|Spell Burst|Spell|Cast Speed$/i, "other skill kind"],
  [/Focus|Combo|Steep Strike|Multistrike|Barrage|Jump|Reap|Trauma|Wilt|Ignite|Frostbite|Numb|Freeze|Frozen|Curse|Warcry|Fervor|Blessing|Affliction|Ailment|Mark/i, "mechanic this build does not use"],
  [/Cooldown|Duration|Skill Cost|Mana Cost|Sealed|Elemental Ailments|Aim|Brisk Wind|Agility/i, "utility"],
];

// Targets the rules recognise but bingLedger.compose does not read yet: until it does, such a
// line is "unknown" (listed for review) rather than "mapped" and silently worth ×1.
const UNMODELED = new Set(["aux.aura_effect"]);

/** Classify one affix (may be multi-line). `key` (e.g. "weapon_s3") names its own buckets. */
export function affixEdits(text: string, key: string): AffixMapping {
  // a Hammer of Ash build always holds its two-handed maul
  const lines = text.split(/\n| \/ /).map(l => l.trim().replace(/\.$/, "")
    .replace(/ when holding a Two-Handed Weapon$/i, "")).filter(Boolean);
  const edits: Edit[] = [];
  let irrelevant: string | null = null;
  for (const line of lines) {
    let hit: Edit[] | string | null = null;
    for (const [re, f] of RULES) {
      const m = line.match(re);
      if (m) { hit = f(m, key); break; }
    }
    if (hit === null) {
      const why = IRRELEVANT.find(([re]) => re.test(line));
      hit = why ? why[1] : null;
    }
    if (hit === null || (typeof hit !== "string" && hit.some(e => UNMODELED.has(e[1])))) return { kind: "unknown" };
    if (typeof hit === "string") irrelevant ??= hit;
    else edits.push(...hit);
  }
  return edits.length ? { kind: "mapped", edits } : { kind: "irrelevant", why: irrelevant ?? "no damage" };
}
