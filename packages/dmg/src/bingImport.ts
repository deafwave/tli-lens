/* Bing build importer (mechanics.md#bing-import): a planner export (tlicompendium / tli_dump
   "Copy TLI Compendium JSON") → ledger sources → snapshot, with every line it cannot model
   reported. Lines come from buildParser.extractLines after resolving catalog GUIDs; each
   line maps through bingAffixMap, except the structural ones handled here (Obliterate,
   Solar Ring, Kaleidoscope, the charge engine, Death's Touch's fixed rating). Skills,
   traits and pactspirits come from tables in bingKit.ts. */
import fs from "node:fs";
import { fromRoot } from "./py.js";
import { extractLines, _load, type Line } from "./buildParser.js";
import { affixEdits } from "./bingAffixMap.js";
import { BING_ZERO, compose, effective, type Edit, type Source } from "./bingLedger.js";
import { kitSources, type Kit } from "./bingKit.js";
import type { Snapshot } from "./damageModel.js";

const CATALOG = "packages/dmg/test/fixtures/poorchlight/compendium-catalog-ss13.json";
let entries: any[] | null = null;
let catalog: Map<string, any> | null = null;
function catalogEntries(): any[] {
  return entries ??= Object.values<any>(JSON.parse(fs.readFileSync(fromRoot(CATALOG), "utf-8")).entries);
}
// one GUID can carry two game ids (prism series 1214… / 1224…, same label): look game ids up in catalogEntries
function catalogById(): Map<string, any> {
  return catalog ??= new Map(catalogEntries().map(e => [e.id, e]));
}

/** Copy of `payload` with catalog GUID values replaced by labels — talent trees keep their
    GUIDs (buildParser.treeLines resolves nodes and notables by GUID). */
export function resolveGuids(payload: any): any {
  const byId = catalogById();
  const walk = (v: any, key = ""): any => key === "skillTree" ? v
    : Array.isArray(v) ? v.map(x => walk(x))
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]))
    : typeof v === "string" ? byId.get(v)?.label ?? v : v;
  return walk(payload);
}

export interface ImportedLine { source: string; text: string; kind: "mapped" | "irrelevant" | "unknown" | "structural"; why?: string }
export interface ImportResult { sources: Source[]; lines: ImportedLine[]; snapshot: Snapshot; kit: Kit }

const isWeaponSlot = (slot: string) => slot === "mainHand" || slot === "offHand";
const scale = (edits: Edit[], k: number): Edit[] =>
  k === 1 ? edits : edits.map(e => (e[0] === "add" ? ["add", e[1], e[2] * k] : e) as Edit);
const num = (s: string) => (s.match(/[+-]?\d+(?:\.\d+)?/g) ?? []).map(Number);

/** Structural lines: what they do is not an affix bucket. Returns edits/provides, or null. */
function structural(text: string, slot: string): { edits: Edit[]; provides?: string[]; requires?: string[]; why: string } | null {
  let m: RegExpMatchArray | null;
  if (slot === "mainHand" && (m = text.match(/^(\d+) - (\d+) Physical Damage$/)))
    return { why: "weapon base damage (zero rig is the 175 Destroyer Mallet)",
             edits: [["add", "base.weapon_phys_min", +m[1] - 175], ["add", "base.weapon_phys_max", +m[2] - 175]] };
  if (slot === "mainHand" && (m = text.match(/^([\d.]+) Attack Speed$/)))
    return { why: "weapon base attack speed", edits: [["set", "base.weapon_attack_speed", +m[1]]] };
  if (slot === "mainHand" && /^\d+ Critical Strike Rating$/.test(text)) return { why: "weapon base crit rating (500, the model's base)", edits: [] };
  if ((m = text.match(/^\+?(\d+)% additional Attack Damage after standing still/i)))
    return { why: "stationary attack (-20% additional AS)", edits: [["add", `additional.standing_${m[1]}`, +m[1]], ["add", "aux.as_more_standing", -20]] };
  if ((m = text.match(/^\+(\d+)% additional damage for \d+ s after using Mobility Skills$/i)))
    return { why: "after Mobility — live only while a Mobility Skill is cast (mechanics.md#bing-dummy-loop)", requires: ["mobility_cast"],
             edits: [["add", `additional.after_mobility_${m[1]}`, +m[1]]] };
  // mechanics.md#bing-mark — on-hit Mark: "additionally increasing its Critical Strike Damage taken" (+10%, as
  // Fixate's base Mark); the dummy stayed Marked 97% of samples at 16% chance on hit
  if (/^\+\d+% chance to Mark the target on hit$/i.test(text))
    return { why: "Mark on hit (+10% crit damage taken)", edits: [["add", "aux.mark_pct", 10]] };
  // the auto-casts that fire Empower skills (Activation Medium) stop: importBing drops those kit sources
  if (/^Unable to trigger Empower Skills$/i.test(text)) return { why: "Empower skills are not auto-triggered", edits: [] };
  if ((m = text.match(/^\+(\d+)% chance to gain \d+ stack\(s\) of Tenacity Blessing when hitting an enemy$/i)))
    return { why: "Tenacity Blessing on hit (a Blessing: feeds Repentance)", provides: ["blessing"], edits: [["add", "aux.tenacity_gain", +m[1]]] };
  if ((m = text.match(/^Deals up to \+(\d+)% additional Attack Damage to enemies in proximity/i)))
    return { why: "Well Matched — Solar Ring places the boss in proximity", requires: ["solar_ring"],
             edits: [["add", `additional.well_matched_${m[1]}`, +m[1]]] };
  if ((m = text.match(/^\+(\d+)% additional damage taken by enemies in Proximity$/i)))
    return { why: "proximity taken — Solar Ring", requires: ["solar_ring"],
             edits: [["add", `enemy_taken.proximity_${m[1]}`, +m[1]]] };
  if ((m = text.match(/^\+(\d+)% (\w+) Damage against enemies in proximity$/i)))
    return { why: "proximity — Solar Ring under Firepower Coverage", requires: ["solar_ring"],
             edits: [["add", `increased.${m[2].toLowerCase()}`, +m[1]]] };
  if ((m = text.match(/^\+(\d+)% (?:Fire Skill|attack|Attack|Melee|Projectile) Critical Strike Damage$/)))
    return { why: "typed crit damage HoA carries (Fire/Attack/Melee/Projectile)", edits: [["add", "crit.damage_pct", +m[1]]] };
  if (/your next non-Channeled Main Skill is enhanced by Obliterate/i.test(text))
    return { why: "Obliterate", provides: ["ruinous_star"], edits: [
      ["conv", "physical", "erosion", 100, "obliterate"], ["conv", "fire", "erosion", 100, "obliterate"],
      ["conv", "cold", "erosion", 100, "obliterate"], ["conv", "lightning", "erosion", 100, "obliterate"],
      ["add", "deterioration.hit_damage_pct", 60], ["set", "deterioration.duration_s", 1],
      ["set", "deterioration.tick_interval_s", 0.325], ["set", "deterioration.obliterate_interval_s", num(text)[0] ?? 0.5],
      ["set", "deterioration.max_stacks", 99]] };
  if ((m = text.match(/once every ([\d.]+)s while it lasts\. The damage gains a (\d+)% additional damage increment each time, up to (\d+)/i)))
    return { why: "Obliterate tick ramp", edits: [["set", "deterioration.ramp_pct", +m[2]], ["set", "deterioration.ramp_max_ticks", +m[3]]] };
  // Solar Ring +40% / corroded Corona +60% additional damage taken; both place enemies "within 3m" (tlidb Broken Sun Ring)
  if (/^(Solar Ring|Corona)$/i.test(text))
    return { why: "Solar Ring / Corona proximity", provides: ["solar_ring"],
             edits: [["add", "enemy_taken.solar_ring", /Corona/i.test(text) ? 60 : 40]] };
  // Broken Sun's area line delivers 28 of a 41 roll on the reference rig (#real-build) and only on empowered throws
  if ((m = text.match(/^\+(\d+)% additional Area Damage for this skill when Demolisher Charge is consumed/i)))
    return { why: "Broken Sun area-on-empower (calibrated 28/41 delivery in M; full roll per hit, #bing-per-hit)",
             edits: [["mul", "rotation.demolisher_empower_mult", 1 + (+m[1] * 28 / 41) / 100],
                     ["add", "rotation.empower_area_pct", +m[1]]] };
  if ((m = text.match(/^Has (\d+) point\(s\) of fixed Fervor Rating/i)))
    return { why: "Fervor: +2% crit rating per Fervor Rating (tlidb Fervor)", edits: [["set", "aux.fervor", +m[1]], ["add", "aux.crit_rating_pct", 2 * +m[1]]] };
  if ((m = text.match(/^\+(\d+)% additional damage per (\d+) Fervor Rating/i)))
    return { why: "Dawn Break per-Fervor additional", edits: [["set", "aux.fervor_add_pct", +m[1]], ["set", "aux.fervor_step", +m[2]]] };
  if (/^Have Fervor$/i.test(text)) return { why: "Fervor enabler", edits: [] };
  if ((m = text.match(/there is a (\d+)% chance for that cast to deal \+(\d+)% additional damage/i)))
    return { why: "Transition roll (expected value)", edits: [["add", `additional.transition_${m[2]}`, +m[1] * +m[2] / 100]] };
  if ((m = text.match(/^\+(\d+)% additional Wilt and Deterioration Duration\. \+(\d+)% additional Erosion Damage/i)))
    return { why: "Profane (always on: Deterioration inflicts it)", requires: ["ruinous_star"],
             edits: [["add", "deterioration.duration_inc_pct", +m[1]], ["add", "additional_typed.erosion.profane", +m[2]]] };
  if (/^Gains Profane when inflicting Wilt or Deterioration$/i.test(text))
    return { why: "Profane: +7% additional Deterioration Duration, +7% additional Erosion (tlidb Profane)", requires: ["ruinous_star"],
             edits: [["add", "deterioration.duration_inc_pct", 7], ["add", "additional_typed.erosion.profane", 7]] };
  if ((m = text.match(/^\+(\d+)% additional damage against Cursed enemies$/i)))
    return { why: "vs Cursed (Timid / Spindle Corruption curse)", requires: ["curse"],
             edits: [["add", `additional.cursed_${m[1]}`, +m[1]]] };
  if ((m = text.match(/^\+(\d+)% additional Attack Damage at Low Life$/i)))
    return { why: "No Loose Ends — assumed run at Low Life (the build took it)", edits: [["add", `additional.low_life_${m[1]}`, +m[1]]] };
  if ((m = text.match(/^\+?(\d+)% of the bonus to Erosion Damage also applied to Deterioration Damage, up to \+(\d+)%/i)))
    return { why: "lunar memory: erosion increases also raise Deterioration", edits: [["set", "aux.lunar_pct", +m[1]], ["set", "aux.lunar_cap", +m[2]]] };
  if (/Skill Area/i.test(text) && /^\+\d+% /.test(text))
    return { why: "geometry — folded into hits_per_bomb (#bing-skill-area), not re-priced", edits: [] };
  if (/Critical Strike Rating is fixed at (\d+) for the Weapon/i.test(text))
    return { why: "weapon crit rating fixed", edits: [["set", "aux.crit_fixed", 1]] };
  if (/Gains Demolisher Charge when using Sentry Skills/i.test(text))
    return { why: "Formation Breaker charge line", provides: ["fb_charge"], edits: [] };
  if ((m = text.match(/Gains the following buffs by turns.*?\+(\d+)% additional Erosion Damage/is)))
    return { why: "Kaleidoscope rings: Erosion / Elemental / Physical turns in lockstep (#bing-per-hit)",
             edits: [["add", `kaleidoscope.kaleido_${m[1]}`, +m[1]]] };
  if (/^Lucky Critical Strike$/i.test(text)) return { why: "Lucky Critical Strike", edits: [["set", "aux.crit_lucky", 1]] };
  if ((m = text.match(/^([+-]?\d+)% Critical Strike Rating$/))) return { why: "crit rating", edits: [["add", "aux.crit_rating_pct", +m[1]]] };
  if (/Hero Trait Level/i.test(text)) return { why: "hero trait level (bingKit traits)", edits: [] };
  if ((m = text.match(/^(\d+)% of the increase\/decrease on Knockback distance is also applied to damage bonus/i)))
    return { why: "Ranger knockback → damage", edits: [["add", "aux.knockback_conv", +m[1]]] };
  if ((m = text.match(/^\+(\d+)% additional damage taken by enemies in proximity to Sentries$/i)))
    // mechanics.md#bing-per-hit — Flame Core off left every hit type unchanged (explosions ÷1.002): the dummy is not
    // in the Sentry's proximity at the measuring spot. Measured on one build, one dummy spot, player at range under
    // Firepower Coverage — zeroed for every build; a build whose Sentry sits at the boss may differ
    return { why: "Formation Breaker taken near Sentries: not at the dummy (measured ×1.00 per hit, one build / spot)", edits: [],
             requires: ["sentry"] };
  return null;
}

/** Import a planner export (raw GUIDs or already resolved). */
/** Native talent records (tli_dump `skillTree.records[].data`: GeniusList node → points,
    BonusTalents notables) → planner nodePoints / selectedNotable GUIDs, via the catalog's
    geniusNodeId / tlidbId bridges. Used when the export left the allocations empty. */
export function fillTreesFromNative(payload: any, native: any[], loadoutIndex = 0): any {
  const byGame = new Map<string, any>();
  for (const e of catalogEntries()) if (e.domain === "talent-tree") byGame.set(String(e.gameId), e);
  const out = structuredClone(payload);
  const slots: any[] = out.loadouts.loadouts[loadoutIndex].skillTree.slots;
  for (const rec of native) {
    for (const [key, points] of Object.entries<number>(rec.GeniusList ?? {})) {
      const e = byGame.get(key.replace(/\D/g, ""));
      const slot = e && slots.find(s => s.treeId === e.metadata?.treeId);
      if (slot && points > 0) (slot.nodePoints ??= {})[e.id] = points;
    }
    for (const id of rec.BonusTalents ?? []) {
      const e = byGame.get(String(id));
      const slot = e && slots.find(s => s.treeId === e.metadata?.treeId);
      if (slot) slot[`selectedNotable${e.metadata.talentThreshold}`] = e.id;
    }
  }
  return out;
}

/** Native talent node id <tree><column:2><row:2>00 → grid position. Columns are the point
    thresholds 0/3/…/18 (1–7), rows 1–5 (user screenshot of an Onslaughter panel, 2026-10-09). */
const nodePos = (id: string) => ({ tree: Math.floor(+id / 1e6), col: Math.floor(+id / 1e4) % 100, row: Math.floor(+id / 100) % 100 });
const inRect = (id: string, center: string, w: number, h: number) => {
  const p = nodePos(id), c = nodePos(center);
  return p.tree === c.tree && Math.abs(p.col - c.col) <= (w - 1) / 2 && Math.abs(p.row - c.row) <= (h - 1) / 2;
};

export interface NativePrisms {
  items: { configBaseId: string; itemId: string; affixes: Record<string, { id: string; args: number[] }[]> }[];
  placements: { itemId: string; tree: number; center: string }[];
}

/** Inverse Image fixed affixes: "±X% all reflected <type> Talent Effects" (in-game tooltip order Micro, Medium, Legendary). */
const INVERSE_TYPE: Record<string, string> = { "1224626031": "micro", "1224626011": "medium", "1224626051": "legendary" };
const INVERSE_IMAGE = "360701";
/** Empower-tagged skills the kit models as auto-cast (tlidb tags). */
const EMPOWER_SKILLS = ["Bull's Rage", "Ice Bond"];

/** Ethereal prism effects as importable lines (#bing-import):
    - area affixes "All <type> Talent within the area also gain: X" → a talent line on each allocated node of
      that type in the prism's rectangle, × the node's points like any talent line (tlicompendium planner);
      extra points a prism grants are already in GeniusList; the node the prism sits on is overridden;
    - the Inverse Image reflects every talent in its 3×3 area through the tree's center
      ((col,row) → (8 − col, 6 − row)); each reflected copy keeps its source's points and deals the
      source's effect × (1 + its type's reflected-effect roll). The copies replace the nodes they land on. */
export function nativePrismLines(native: any[], prisms: NativePrisms): { source: string; slot: string; text: string; points?: number }[] {
  const byGame = new Map<string, any>();
  for (const e of catalogEntries()) if (e.gameId) byGame.set(`${e.domain}:${e.gameId}`, e);
  const allocated = new Map<string, number>();
  for (const rec of native) for (const [k, pts] of Object.entries<number>(rec.GeniusList ?? {})) if (pts > 0) allocated.set(k.replace(/\D/g, ""), pts);
  const treeText = _load("SS12.5-talent-tree-en.json");
  const nodeLines = (id: string): string[] => {
    const e = byGame.get(`talent-tree:${id}`);
    const node = treeText[`talent-tree/${e?.metadata?.treeId}/i18n/en`]?.tree?.nodes?.[e?.id];
    return String(node?.description ?? "").split("<br>").map(l => l.trim()).filter(Boolean);
  };
  const typeOf = (id: string) => String(byGame.get(`talent-tree:${id}`)?.metadata?.talentNodeType ?? "");
  const out: { source: string; slot: string; text: string; points?: number }[] = [];
  for (const pl of prisms.placements) {
    const item = prisms.items.find(i => i.itemId === pl.itemId);
    if (item?.configBaseId === INVERSE_IMAGE) {
      const fixed = item.affixes.FixedBaseAffix ?? [];
      const mods: Record<string, number> = {};
      fixed.forEach((a, i) => { mods[INVERSE_TYPE[a.id] ?? ["micro", "medium", "legendary"][i]] = a.args[0] ?? 0; });
      for (const [id, pts] of allocated) {
        if (!inRect(id, pl.center, 3, 3)) continue;
        const type = ["micro", "medium", "legendary"].find(t => typeOf(id).startsWith(t));
        const k = 1 + (mods[type ?? ""] ?? -100) / 100;
        if (k <= 0) continue;
        for (const line of nodeLines(id)) out.push({ source: `inverse:${pl.tree}:${id}`, slot: "tree", text: line, points: pts * k });
      }
      continue;
    }
    const texts = Object.values(item?.affixes ?? {}).flat()
      .map(a => byGame.get(`ethereal-prism:${a.id}`)?.label as string | undefined).filter((t): t is string => !!t);
    // the prism's own base affix (Haze "+12% additional Base Damage for Two-Handed Weapons"); the
    // catalog joins its 1H/2H halves with no separator
    for (const a of item?.affixes.BAffixInfoList ?? []) {
      const label = byGame.get(`ethereal-prism:${a.id}`)?.label as string | undefined;
      for (const line of label?.split(/(?<=[a-z])(?=[+-]\d)|\n/) ?? [])
        out.push({ source: `prism:${pl.tree}:base`, slot: "prism", text: line.trim() });
    }
    const size = texts.map(t => t.match(/expands to (\d+)x(\d+)/)).find(Boolean);
    const [w, h] = size ? [+size[1], +size[2]] : [1, 1];
    for (const t of texts) {
      const m = t.match(/^All (Micro|Medium|Legendary Medium) Talent within the area also gain: (.+)$/s);
      if (!m) continue;
      const type = m[1].toLowerCase().replace("legendary medium", "legendary");
      for (const id of allocated.keys()) {
        if (!inRect(id, pl.center, w, h) || !typeOf(id).startsWith(type)) continue;
        for (const line of m[2].split(/\n/)) out.push({ source: `prism:${pl.tree}:${id}`, slot: "tree", points: allocated.get(id),
                                                            text: line.trim().replace(/^(\d)/, "+$1") });
      }
    }
  }
  return out;
}

export function importBing(payload: any, loadoutIndex = 0, nativeTalents?: any[], nativePrisms?: NativePrisms): ImportResult {
  if (nativeTalents?.length) payload = fillTreesFromNative(payload, nativeTalents, loadoutIndex);
  const resolved = resolveGuids(payload);
  const lo = resolved.loadouts.loadouts[loadoutIndex];
  const raw = payload.loadouts.loadouts[loadoutIndex];
  const lines: ImportedLine[] = [];
  const sources: Source[] = [];
  let n = 0;
  const add = (source: string, text: string, edits: Edit[], provides?: string[], requires?: string[]) =>
    sources.push({ id: `imp_${n++}`, label: `${source}: ${text}`, group: "upgrade", edits, provides, requires,
                   cite: `import ${source}` });

  const extracted: Line[] = [...extractLines(resolved, loadoutIndex)]
    .filter(l => !/^(memory|pactspirit|trait):/.test(l.source));
  const memoryLines = memoryAffixes(raw).map(text => ({ source: "memory", slot: "memory", text }));
  // legendary random affix slots (Death's Touch's "Adds … to the Main-Hand Weapon") — extractLines skips them
  const inv = new Map<string, any>((lo.gear?.inventory ?? []).map((it: any) => [it.id, it]));
  for (const [slot, id] of Object.entries<string>(lo.gear?.equipped ?? {}))
    for (const a of inv.get(id)?.randomAffixSlots ?? [])
      if (a?.description) memoryLines.push({ source: `gear:${slot}:random`, slot, text: a.description });
  const prismLines = nativeTalents && nativePrisms ? nativePrismLines(nativeTalents, nativePrisms) : [];
  // "+N Support Skill Level" also raises the table-priced supports the kit levels (seasoned gems get it in compose)
  const supportBonus = ([...extracted, ...memoryLines, ...prismLines] as Line[]).reduce((sum, l) => {
    const m = affixEdits(l.text, "support_probe");
    const n = m.kind === "mapped" ? m.edits.reduce((x, e) => x + (e[0] === "add" && e[1] === "aux.support_level" ? e[2] : 0), 0) : 0;
    return sum + n * (l.slot === "tree" ? l.points ?? 1 : 1);
  }, 0);
  const pactBoards = new Map(Object.values<any>(_load("SS12.5-pactspirit-en.json")["pactspirit/i18n/en"].pactspirits)
    .map(p => [p.name as string, Object.fromEntries(Object.entries<any>(p.nodes ?? {})
      .map(([n, node]) => [n, String(node.description)]))]));
  // "+N to All Skills' Levels" also raises the auras, curses and Bull's Rage the kit prices (#bing-per-hit: auras read L21)
  const skillBonus = ([...extracted, ...memoryLines, ...prismLines] as Line[]).reduce((sum, l) => {
    const m = l.text.match(/^\+(\d+) to All Skills' Levels$/i);
    return sum + (m ? +m[1] * (l.slot === "tree" ? l.points ?? 1 : 1) : 0);
  }, 0);
  const kit = kitSources(lo, raw, lines, supportBonus, name => pactBoards.get(name), skillBonus);
  // mechanics.md#bing-mark — "Unable to trigger Empower Skills" (Tyrant's Smoldering Hold): Bull's Rage vanished at
  // the dummy (0% uptime) while the curse Timid kept firing
  const noEmpower = extracted.some(l => /^Unable to trigger Empower Skills$/i.test(l.text));
  sources.push(...kit.sources.filter(s => !(noEmpower && EMPOWER_SKILLS.some(n => s.label.startsWith(`skill:${n}:`)))));
  for (const l of [...extracted, ...memoryLines, ...kit.extraLines, ...prismLines] as Line[]) {
    const s = structural(l.text, l.slot);
    if (s) { add(l.source, l.text, scale(s.edits, l.slot === "tree" ? l.points ?? 1 : 1), s.provides, s.requires); lines.push({ source: l.source, text: l.text, kind: "structural", why: s.why }); continue; }
    const key = `${l.source.replace(/[^a-z0-9]+/gi, "_")}_${n}`;
    const m = affixEdits(l.text, isWeaponSlot(l.slot) ? `weapon_${key}` : `gear_${key}`);
    if (m.kind === "mapped") add(l.source, l.text, scale(m.edits, l.slot === "tree" ? l.points ?? 1 : 1));
    lines.push({ source: l.source, text: l.text, kind: m.kind, why: m.kind === "irrelevant" ? m.why : undefined });
  }

  const snapshot = compose(BING_ZERO, effective(sources));
  return { sources, lines, snapshot, kit };
}

/** Hero-memory affix texts (catalog template filled with the rolled value). */
function memoryAffixes(raw: any): string[] {
  const byId = catalogById();
  const inv = new Map<string, any>((raw.heroMemories?.inventory ?? []).map((m: any) => [m.id, m]));
  const out: string[] = [];
  for (const id of Object.values<string>(raw.heroMemories?.equipped ?? {})) {
    const m = inv.get(id);
    if (!m) continue;
    for (const a of [m.baseStat, ...m.fixedAffixes ?? [], ...m.randomAffixes ?? [], m.lunarPhaseAffix].filter(Boolean)) {
      const meta = byId.get(a.guid)?.metadata;
      const template: string | undefined = meta?.memoryTemplate ?? (typeof a.guid === "string" && a.guid.includes("#") ? a.guid : undefined);
      if (template) out.push(template.includes("#") ? template.replace("#", String(a.value)) : template);
      else if (typeof a.guid === "string" && !/^[0-9a-f-]{36}$/.test(a.guid)) out.push(a.guid);
    }
  }
  return out;
}
