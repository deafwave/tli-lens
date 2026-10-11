/* What a Bing export carries outside affix text (mechanics.md#bing-import): HoA supports,
   auras and their supports, curses / warcries / activation mediums, the charge engine, hero
   traits (levels from memories), pactspirits and kismets. Values: tlidb level tables
   (scratch levels research, linear between Lv1/21/41 breakpoints) and the calibrated
   reference ledger (#real-build). Anything without a table is reported, not guessed. */
import { EXPLOSION_SHARE, FC_AUTO_HITS, type Edit, type Source } from "./bingLedger.js";
import type { ImportedLine } from "./bingImport.js";
import { affixEdits } from "./bingAffixMap.js";

const lin = (l1: number, l21: number, l41: number) => (lv: number) =>
  lv <= 21 ? l1 + (l21 - l1) * (lv - 1) / 20 : l21 + (l41 - l21) * (lv - 21) / 20;
/** Auras: Lv1 → Lv20 linear (tlidb shows only those two); +1/level past 20 assumed. */
const aura = (l1: number, l20: number) => (lv: number) => l1 + (l20 - l1) * (Math.min(lv, 20) - 1) / 19 + Math.max(0, lv - 20) * (l20 - l1) / 19;
/** tlidb Sentry-tagged skills seen on Bing builds (Ice Bond: "place 1 Ice Sentry") */
const SENTRIES = new Set(["Flame Core", "Ice Bond"]);

type Effect = (lv: number, x: { roll?: number[]; tier?: number }) => Edit[];
/** Supports on Hammer of Ash. Seasoned gems go through `_gem_levels` (applySeason fills the value). */
const HOA_SUPPORTS: Record<string, Effect> = {
  "Elemental Fusion": lv => [["set", "_gem_levels.fusion", lv], ["add", "additional_typed.elemental.fusion", 0]],
  "Passivation": lv => [["set", "_gem_levels.passivation", lv], ["add", "additional_typed.erosion.passivation", 0]],
  "Steamroll": lv => [["set", "_gem_levels.steamroll", lv], ["add", "additional.steamroll", 0], ["add", "aux.as_inc", -15]],
  "Slow Projectile": lv => [["set", "_gem_levels.slow_projectile", lv], ["add", "additional.slow_projectile", 0]],
  "Melee Knockback": lv => [["add", "additional.melee_knockback", lin(15.5, 25.5, 35.5)(lv)],
                            ["add", "aux.knockback", lin(40, 60, 80)(lv)]],
  // Rehan #supports: 26 at Lv1 + 0.5/level, multiplies crit hits only
  "Critical Strike Damage Increase": lv => [["add", "crit.additional_on_crit_pct", 26 + 0.5 * (lv - 1)]],
  "Rising Evil": lv => [["add", "aux.det_more_rising_evil", lin(7, 17, 21)(lv)]],
  "Honed Edge": lv => [["add", "additional.honed_edge", lin(10.5, 20.5, 23.5)(lv)]],
  "Weakness Infiltration": lv => [["add", "additional.weakness_infiltration", lin(12.5, 22.5, 26.5)(lv)]],
  // bing1 QR ladder: L16 +23%, L20 +25% additional; its restoration is in rotation
  "Quick Return": lv => [["add", "additional.quick_return", lin(15.5, 25.5, 35.5)(lv)]],
  // magnificent: +20% fixed; the explosion line scales only the explosion share (mechanics.md#bing-hit-channels)
  "Hammer of Ash: Upheaval (Magnificent)": (_lv, x) => [["add", "additional.upheaval", 20],
    ["add", "additional.upheaval_explosion", (x.roll?.[0] ?? 32) * EXPLOSION_SHARE]],
};

const SEASONED = new Set(["Elemental Fusion", "Passivation", "Steamroll", "Slow Projectile"]);

/** Aura passives: [path, value(level)] at the aura's own level. */
const AURAS: Record<string, [string, (lv: number) => number]> = {
  "Precise: Precise Projectiles": ["additional_typed.projectile.precise_projectiles", aura(21, 40)],
  "Precise Projectiles": ["additional_typed.projectile.precise_projectiles", aura(16, 35)],
  "Precise: Cruelty": ["additional.cruelty", aura(12.5, 22)],
  "Cruelty": ["additional.cruelty", aura(9.5, 19)],
  "Precise: Weapon Amplification": ["additional_typed.physical.weapon_amp", aura(21, 40)],
  "Weapon Amplification": ["additional_typed.physical.weapon_amp", aura(16, 35)],
  "Precise: Erosion Amplification": ["additional_typed.erosion.erosion_amp", aura(21, 40)],
  "Erosion Amplification": ["additional_typed.erosion.erosion_amp", aura(16, 35)],
  // Rehan #precise: Domain Expansion 33 at L20 (generic additional)
  // tlidb: +33% additional Area Damage at L20 (HoA is Area-tagged)
  "Precise: Domain Expansion": ["additional.domain_expansion", aura(14, 33)],
};

/** Hero trait values by level (bing memory-ladder row; FH +35..55%, BB 20%+5%/level chance of +2 bombs). */
const TRAITS: Record<string, (lv: number) => Edit[]> = {
  "Blast Barrage": lv => [["set", "rotation.bombs_per_throw", 2 + 2 * (0.15 + 0.05 * lv)]],
  "Frenzy Hound": lv => [["add", "additional.frenzy_hound", 30 + 5 * lv]],
};

/** Pactspirits at a level: the notable / level effects beyond the board nodes (#real-build, bing1
    pactspirits). Board nodes come from the catalog via pactNodeEdits — a full board reproduces the
    calibrated encodings (Saintess +112 Erosion / +10 pen / +6 damage, Kitty +48 Attack / +88 crit / +16 AS). */
const PACTS: Record<string, (lv: number) => Edit[] | null> = {
  "Iron Lion": () => [["add", "rotation.proj_added", 1]],
  // Repentance (+4% additional Erosion per stack, 6 at L4) is its own source: stacks come from gaining a Blessing
  "Portrait of a Fallen Saintess": lv => lv >= 4 ? [] : null,
  // tlidb: L5 +16% additional damage vs Cursed, +4% additional damage
  "Poisoned Omen": lv => lv >= 5 ? [["add", "additional.poisoned_omen", 4]] : null,
  "Kitty Express": lv => lv >= 6 ? [] : null,
};
const NOTABLE_NODE = "10";   // its effects are the level-dependent PACTS entry

/** Board-node edits: every allocated node except the notable and the nodes a kismet occupies. */
function pactNodeEdits(nodes: Record<string, string> | undefined, allocated: string[], occupied: Set<string>): Edit[] {
  const out: Edit[] = [];
  for (const n of allocated) {
    if (n === NOTABLE_NODE || occupied.has(n)) continue;
    for (const line of String(nodes?.[n] ?? "").split("\n").map(l => l.trim()).filter(Boolean)) {
      const fate = /^\+(\d+) \* 1% damage$/.exec(line);   // Undetermined Fate Slots
      if (fate) { out.push(["add", "increased.global", +fate[1]]); continue; }
      const m = affixEdits(line, "pact");
      if (m.kind === "mapped") out.push(...m.edits);
    }
  }
  return out;
}

export interface Kit {
  sources: Source[];
  traitLevels: Record<string, number>;
  /** affix-shaped lines (Micro Fate kismets) for the importer's line mapping */
  extraLines: { source: string; slot: string; text: string }[];
}

export function kitSources(lo: any, raw: any, lines: ImportedLine[], supportBonus = 0,
                           pactNodes: (name: string) => Record<string, string> | undefined = () => undefined): Kit {
  const sources: Source[] = [];
  const extraLines: Kit["extraLines"] = [];
  let n = 0;
  const note = (source: string, text: string, kind: ImportedLine["kind"], why?: string) =>
    lines.push({ source, text, kind, why });
  const add = (source: string, text: string, edits: Edit[], extra: Partial<Source> = {}) => {
    sources.push({ id: `kit_${n++}`, label: `${source}: ${text}`, group: "upgrade", edits, cite: `import ${source}`, ...extra });
    note(source, text, "mapped");
  };

  // ---- skills ----
  const skills = [...lo.skills?.activeSkills ?? [], ...lo.skills?.passiveSkills ?? []].filter((s: any) => s?.skillGuid);
  const names = new Set(skills.map((s: any) => s.skillGuid as string));
  for (const sk of skills) {
    const name: string = sk.skillGuid;
    const sups = (sk.supports ?? []).filter(Boolean);
    const supNames = sups.map((x: any) => x.supportGuid as string);
    if (name === "Hammer of Ash") {
      for (const sp of sups) {
        const f = HOA_SUPPORTS[sp.supportGuid];
        // seasoned gems take the bonus through _gem_levels in compose; table-priced ones here
        const lv = (sp.level ?? 20) + (SEASONED.has(sp.supportGuid) ? 0 : supportBonus);
        if (f) add("skill:Hammer of Ash", `${sp.supportGuid} L${lv}`, f(lv, { roll: sp.rollValues, tier: sp.tier }));
        else note("skill:Hammer of Ash", `${sp.supportGuid} L${sp.level ?? "-"}`, "unknown");
      }
    } else if (AURAS[name]) {
      // Aura Amplification: +aura effect for the supported aura (5.25 at Lv1, +0.25/level)
      const amp = sups.filter((x: any) => x.supportGuid === "Aura Amplification")
        .reduce((e: number, x: any) => e + lin(5.25, 10.25, 15.25)((x.level ?? 20) + supportBonus), 0);
      // Precise: Malleable: +30% aura effect at L20 (+0.5/level) with an Elite within 10m — Solar Ring assumed to satisfy it
      const mall = sups.filter((x: any) => x.supportGuid === "Precise: Malleable")
        .reduce((e: number, x: any) => e + 30 + 0.5 * ((x.level ?? 20) + supportBonus - 20), 0);
      const [path, f] = AURAS[name];
      const v = f(sk.level ?? 20);
      const req = name.includes("Erosion") ? { requires: ["ruinous_star"] } : {};
      add(`skill:${name}`, `L${sk.level}${amp ? ` × ${(1 + amp / 100).toFixed(4)} (Aura Amplification)` : ""}`,
          [["add", path, v * (1 + amp / 100)]], req);
      if (mall) add(`skill:${name}`, `Precise: Malleable +${mall}% aura effect (Elite within 10m assumed)`, [["add", path, v * mall / 100]], req);
      for (const s of supNames.filter((x: string) => x !== "Aura Amplification" && x !== "Precise: Malleable"))
        note(`skill:${name}`, s, /Restrain|Seal Conversion|Increased Area/.test(s) ? "irrelevant" : "unknown",
             /Restrain|Seal Conversion|Increased Area/.test(s) ? "aura upkeep / area" : undefined);
    } else if (name === "Timid") {
      add("skill:Timid", `L${sk.level}`, [["add", "enemy_taken.timid", aura(20, 39)(sk.level ?? 20)]], { provides: ["curse"] });
    } else if (name === "Fixate") {
      // tlidb Fixate L20: +3% additional damage per enemy affected (one boss), Mark +10% crit damage taken × 1.08 Mark Effect
      add("skill:Fixate", `L${sk.level}`, [["add", "additional.fixate", 3], ["add", "crit.crit_dmg_taken_pct", 10.8]]);
    } else if (name === "Entangled Pain") {
      // tlidb L20: Cursed enemies take +39% additional Damage Over Time (L1 20) — det ticks only; 5s / 8s CD, uptime assumed full
      add("skill:Entangled Pain", `L${sk.level}`, [["add", "aux.det_more_entangled_pain", aura(20, 39)(sk.level ?? 20)]],
          { provides: ["curse"] });
    } else if (name === "Bull's Rage") {
      // tlidb L20: Euphoria +27% additional Melee Skill Damage (L1 17.5) for 6s / 10s CD — uptime assumed full
      // ×0.75 uptime: buff present 75–77% of 450+ memory samples at the dummy (DeafwaveB 2026-10-10, mechanics.md#bing-dummy-loop)
      add("skill:Bull's Rage", `L${sk.level} Euphoria (75% uptime)`, [["add", "additional.bulls_rage", 0.75 * aura(17.5, 27)(sk.level ?? 20)]]);
    } else if (SENTRIES.has(name) && supNames.includes("Activation Medium: Motionless")) {
      add(`skill:${name}`, "Sentry + Activation Medium: Motionless → charge per Sentry use (#real-build)",
          [["del", "rotation.demolisher_resto_pct"], ["set", "rotation.demolisher_every_n", 1]],
          { requires: ["fb_charge"], provides: ["sentry"] });
    } else if (name === "Blink") {
      note("skill:Blink", "mobility (feeds Saintess blessings, Blade-dancer)", "irrelevant", "mobility");
    } else {
      note(`skill:${name}`, `L${sk.level} ${supNames.join(", ")}`, "unknown");
    }
  }

  // ---- hero traits (level from the slot's memory: base tier → 1–3, + its "+N Hero Trait Level") ----
  const traitLevels: Record<string, number> = {};
  const slotOf: Record<string, string> = { level45: "slot45", level60: "slot60", level75: "slot75" };
  const memInv = new Map<string, any>((raw.heroMemories?.inventory ?? []).map((m: any) => [m.id, m]));
  const memByLabel = new Map<string, any>(((lo.heroMemories?.inventory ?? []) as any[]).map(m => [m.id, m]));
  for (const [tier, trait] of Object.entries<string>(lo.hero?.traits ?? {})) {
    if (!trait) continue;
    const memId = raw.heroMemories?.equipped?.[slotOf[tier] ?? ""];
    const mem = memInv.get(memId);
    const enh = 41 - (mem?.baseStat?.tier ?? 40);
    let lv = mem ? (enh >= 50 ? 3 : enh >= 30 ? 2 : 1) : 1;
    const plus = (memByLabel.get(memId)?.fixedAffixes ?? []).filter((a: any) => /Hero Trait Level/i.test(String(a.guid)));
    for (const a of plus) lv += Number(a.value ?? 0);
    traitLevels[trait] = lv;
    if (trait === "Firepower Coverage") {
      // the reference rig's geometry fold-in (FC +50% projectile size, its skill area, #real-build)
      // FC's auto-thrower throws at the weapon's attack speed (frame count, mechanics.md#bing-dummy-loop)
      add("trait", `Firepower Coverage L${lv}`, [["mul", "rotation.hits_per_bomb", 1.6528676812873455 / 0.8353 / 1.3286 * FC_AUTO_HITS],
                                                 ["set", "aux.throw_at_weapon_aps", 1]],
          { provides: ["firepower_coverage"] });
    } else if (TRAITS[trait]) add("trait", `${trait} L${lv}`, TRAITS[trait](lv));
    else if (trait === "Blast Nova") { if (lv > 1) add("trait", `Blast Nova L${lv}`, [["add", "additional.blast_nova", 5 * (lv - 1)]]); }
    else note("trait", `${trait} L${lv}`, "unknown");
  }

  // ---- pactspirits and kismets ----
  const pacts: any[] = lo.pactspirits ?? [];
  const kismets: any[] = lo.kismets ?? [];
  pacts.forEach((p, i) => {
    const edits = PACTS[p.guid]?.(p.level);
    if (!edits) { note("pactspirit", `${p.guid} L${p.level}`, "unknown"); return; }
    const occupied = new Set(kismets.filter(k => k.pactspritIndex === i).map(k => String(k.nodeId).split("_").at(-1)!));
    const nodes = pactNodeEdits(pactNodes(p.guid), (p.allocatedNodes ?? []).map(String), occupied);
    add("pactspirit", `${p.guid} L${p.level}`, [...edits, ...nodes]);
    if (p.guid === "Portrait of a Fallen Saintess" && p.level >= 4)
      add("pactspirit", "Saintess Repentance ×6 (gains a stack per Blessing gained)",
          [["add", "additional_typed.erosion.repentance", (1.04 ** 6 - 1) * 100]], { requires: ["blessing"] });
    if (p.guid === "Poisoned Omen" && p.level >= 5)
      add("pactspirit", "Poisoned Omen: +16% additional damage vs Cursed", [["add", "additional.omen_cursed", 16]], { requires: ["curse"] });
    if (p.guid === "Kitty Express" && names.size && traitLevels["Firepower Coverage"])
      add("pactspirit", "Feline Stimulant + Aggression (Firepower Coverage auto-throw triggers it)",
          [["add", "additional.kitty_stimulant", 44.73], ["add", "aux.as_more_aggression", 5]],
          { requires: ["firepower_coverage"] });
  });
  // Spindle pair: Lv25 Corruption on damage — enemies take +44% additional Erosion Damage (L20 39, +1/level); it is a curse
  if (kismets.filter(k => k.kismetGuid === "Dual Kismet: Spindle").length >= 2)
    add("kismet", "Dual Kismet: Spindle pair (Lv25 Corruption)", [["add", "enemy_taken.corruption", 44]], { provides: ["curse"] });
  const arrows = kismets.filter(k => k.kismetGuid === "Dual Kismet: Mighty Arrow");
  if (arrows.length >= 2)
    add("kismet", "Dual Kismet: Mighty Arrow pair", [["add", "enemy_taken.mighty_arrow", 25], ["mul", "rotation.hits_per_bomb", 1.3286]]);
  for (const k of kismets) {
    const m = /^Micro Fate: (.+)$/.exec(k.kismetGuid ?? "");
    if (m && k.rollValues?.length) {
      const text = /Duration|Chance|Damage/.test(m[1]) ? `+${k.rollValues[0]}% ${m[1].replace("Deterioration Duration", "additional Deterioration Duration")}` : `+${k.rollValues[0]} ${m[1]}`;
      extraLines.push({ source: "kismet", slot: "kismet", text });
    } else if (!/^Dual Kismet: (Mighty Arrow|Spindle)$/.test(k.kismetGuid)) note("kismet", k.kismetGuid, "unknown");
  }
  return { sources, traitLevels, extraLines };
}
