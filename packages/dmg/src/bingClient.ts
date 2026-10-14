/* Bing bomb build (Hammer of Ash thrown as bombs) from game-compiled records (clientModel.ts) plus the native
   formulas (clientDps.ts). Values come from the records; what the records cannot say (geometry, uptimes, enemy)
   is in BingAssumptions with its source. Nothing here reads the legacy bing*.ts model. */
import { armorFactor, armorRatio, critChance, critMultiplier, resistanceFactor } from "./clientDps.js";
import { A, type BuildModel, Pool, type Rec, select, T } from "./clientModel.js";

export interface BingAssumptions {
  standingStill: boolean;
  lowLife: boolean;
  twoHanded: boolean;
  elitePresent: boolean;            // Malleable: +P2% aura effect when an Elite is near, else its -15% additional
  agilityStacks: number;            // hyperlink 716: +4% attack/cast speed per stack, initial max 4
  enemyLifePct: number;             // Passivation: up to +P1% additional erosion vs full-life enemies
  explosionScale: number;           // Shotgun falloff on Ember explosions (measured, docs/bing-dps-validation-handoff.md R1)
  inDistanceFilters: boolean;       // filter-107 records (proximity / near a bomb) are in range
  ringTakenPct: number;             // Broken Sun Ring (Solar Ring or Corona): debuff 35110 at ring level 4, map {1: 40, 2+: 60} -> 60 (dps-debug/evidence/ring_effects.md)
  sentryProximity: boolean;         // Formation Breaker 35086 "+30% taken near Sentries": on the live dummy's attr 5720 (ring_effects.md)
  buffStacks: number;
  prismExtPerPoint: boolean;        // prism ExtAffix scales with node points (fits the local sheet's crit damage 324)               // stacking buff effects ("+X% Effect every time it is cast, up to N") at max
  enemyErosionRes: number;          // live dummy (Invincible No.2): attr 5401 = 30, cap 5409 = 60 (dps-debug/evidence/dummy_mitigation.md)
  enemyArmor: number;               // live dummy: attr 4001 = 27270 (dummy_mitigation.md)
  armorPen: number;                 // attacker char field 0x1e9ce7 (Vorax 17); no record yet, build_model drops the Vorax line
  logicFps: number;                 // throw period quantised to logic frames (docs #bing-bombs)
  sentryHitIntervalS: number;       // Flame Core hit clock at Sentry frequency x1.2: 158.6 frames mean (local hit-watch, evidence/flame_core_cadence.md)
  buffUptime: Record<string, number>;   // skill buffs that are not permanent (e.g. Bull's Rage)
}

export const DEFAULT_ASSUMPTIONS: BingAssumptions = {
  standingStill: true, lowLife: true, twoHanded: true, elitePresent: true, agilityStacks: 4, enemyLifePct: 100,
  explosionScale: 0.3, inDistanceFilters: true, ringTakenPct: 60, sentryProximity: true, buffStacks: 1, prismExtPerPoint: true, enemyErosionRes: 30, enemyArmor: 27270, armorPen: 0, logicFps: 30, sentryHitIntervalS: 158.6 / 30, buffUptime: {},
};

const HOA = "Hammer of Ash";
const prod = (xs: number[]) => xs.reduce((a, x) => a * x, 1);
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const avg = (r: Rec) => (r.lo + (r.hi || r.lo)) / 2;

export function bingDps(model: BuildModel, a: BingAssumptions = DEFAULT_ASSUMPTIONS) {
  const recs = model.records;
  const has = (cls: number) => recs.some((r) => r.cls === cls);
  const byCls = (cls: number) => recs.filter((r) => r.cls === cls);
  const fields = (id: number, tags: Set<number>) =>
    sum(select(recs, [108, 639], { skill: HOA, tags }).filter((r) => r.field === id).map((r) => r.lo));
  const states = new Set<number>();
  if (a.standingStill) states.add(T.standingStill);
  if (a.lowLife) states.add(T.lowLife);
  if (a.twoHanded) { states.add(T.holdingTwoHanded); states.add(T.twoHanded); }
  // Stacking buffs (hyperlink params: Feline Stimulant +5%/stack max 3, Repentance +4%/stack max 4) plus
  // "+N Max ... Stacks" lines (attr 3442 tagged with the buff). Feline stacks on Main Skill triggers (Firepower
  // Coverage auto-throws); Repentance needs Blessings (Agility/Focus Blessing sources present).
  const maxStacks = (base: number, tag: number) => base + sum(recs.filter((r) => r.attr === 3442 && r.tags?.includes(tag)).map((r) => r.lo));
  const blessings = recs.some((r) => r.scope === "buff:320" || r.scope === "buff:380");
  const stackN: Record<string, number> = { "buff:11360": maxStacks(3, 5200081), "buff:11210": blessings ? maxStacks(4, 5200058) : 0 };
  const stacks = (r: Rec) => stackN[r.scope] ?? 1;
  if (stackN["buff:11360"] > 0) states.add(4015366);   // state "has Feline Stimulant"
  const tags = new Set([...model.skills[HOA].tags, T.thisSkill, ...states]);

  // Aura effect (E_buffxiaoguo + aura tag inside the aura's own group), curse effect, buff uptimes.
  const auraScale = (name: string) => {
    const p = new Pool(recs, { skill: name, tags: new Set([T.thisSkill, T.aura]) });
    const elite = recs.filter((r) => r.scope === `buff:${name}` && r.cls === 50355540 && r.node === 101);   // Cruelty stacks
    return (1 + p.inc(A.auraEffect) / 100) * (a.elitePresent ? prod(elite.map((r) => 1 + r.lo / 100)) : p.more(A.auraEffect));
  };
  // "+X% Effect every time it is cast, stacking up to N" (Well-Fought Battle: P = [X, N]) on a buff skill.
  const castStacks = (name: string) => prod(recs.filter((r) => r.scope === `skill:${name}` && r.node === 101 && r.attr === A.auraEffect)
    .map((r) => 1 + r.lo * (r.P?.[1] ?? a.buffStacks) / 100));
  const curse = new Pool(recs, { tags: new Set([T.curse]) }).inc(A.auraEffect);
  const scales: Record<string, number> = {};
  for (const [name, s] of Object.entries(model.skills)) {
    if (!s.buff) continue;
    const up = a.buffUptime[name] ?? 1;
    if (s.kind === "passive") scales[`buff:${name}`] = auraScale(name) * up;
    else if (s.tags.includes(T.curseSkill)) scales[`buff:${name}`] = (1 + curse / 100) * up;
    else scales[`buff:${name}`] = castStacks(name) * up;
  }
  // Inflicted debuffs scale with their "inflicted ... Effect" lines (attr 3401 + the debuff's tag):
  // Paralysis (buff 230, Grudge) <- tag 5100111.
  // Paralysis lasts 4 s, one instance that refreshes (evidence/paralysis_duration.md); Grudge applies it at P1% per
  // Flame Core hit on a Cursed target. Uptime = chance x min(1, 4 s / Flame Core hit interval), the interval scaled
  // from the measured local cadence by this build's Sentry cast frequency.
  const sentryFreq = (() => { const p = new Pool(recs, { skill: "Flame Core", tags: new Set([5000002]) }); return (1 + p.inc(6321) / 100) * p.more(6321); })();
  const grudge = recs.find((r) => r.cls === 369609664 && r.node === 301)?.P?.[0] ?? 0;
  const paralysisUptime = Math.min(1, grudge / 100 * Math.min(1, 4 / (a.sentryHitIntervalS * 1.2 / sentryFreq)));
  scales["buff:230"] = (1 + new Pool(recs, { tags: new Set([5100111]) }).inc(A.auraEffect) / 100) * paralysisUptime;
  const scale = (r: Rec) => (scales[r.scope] ?? (r.scope.startsWith("buff:curse:") ? 1 + curse / 100 : 1)) * (r.extPoints && !a.prismExtPerPoint ? 1 / r.extPoints : 1);
  const kaleidoCls = 980071;
  // Domain Expansion's "+P3% ... when there are at least P2 enemies within P1 m" lines (condition 4, count >= 5):
  // false against a single dummy.
  const crowd = new Set([495834240, 263618880, 687124224]);
  const pool = (extra: number[] = []) =>
    new Pool(recs, { skill: HOA, tags: new Set([...tags, ...extra]), scale, stacks, exclude: (r) => r.cls === kaleidoCls || crowd.has(r.cls) });
  const c = pool([T.demolisherConsumed]);   // empowered bomb: a Demolisher Charge is consumed

  // Throw rate (Blast Nova text): 1/s x (1 + Σ inc AS) x Π more AS; weapon-local and skill-scoped AS excluded.
  const player = new Pool(recs, { tags: states, scale, stacks });
  const agility = recs.some((r) => r.scope === "buff:320") ? 4 * (a.agilityStacks - 1) : 0;   // record = 1 stack
  const incAs = player.inc(A.attackSpeed) + agility;
  const rate = (1 + incAs / 100) * player.more(A.attackSpeed);
  const throwRate = a.logicFps / Math.round(a.logicFps / rate);
  const extra = byCls(4332661).find((r) => r.node === 624);   // "P1% chance to +P2 Bomb Quantity"
  const bombsPerThrow = 2 + (extra ? (extra.P?.[0] ?? 0) / 100 * extra.lo : 0);   // 245094144: throw 2 bombs
  // Empowered share: a Sentry + "Demolisher Charge when using Sentry Skills (0.25s)" empowers every bomb (docs R2);
  // otherwise HoA gains a charge every 3s -> one empowered throw in ceil(3 x rate).
  const empoweredShare = has(168890) && model.skills["Flame Core"] ? 1 : 1 / Math.ceil(3 * throwRate);

  // Weapon (FUN_141dafa00): the weapon item's local range (gear-local + filter-103 lines) x skill weapon %.
  const weaponItem = recs.find((r) => r.node === 364 && r.attr === A.attackSpeed)?.src.split(":")[0];
  const onWeapon = (r: Rec) => r.src.startsWith(`${weaponItem}:`) && [363, 364, 321].includes(r.node);
  const to103 = (r: Rec) => r.filter?.[0] === 103;
  const wFlat = sum(recs.filter((r) => (onWeapon(r) || to103(r)) && r.attr === A.phys && r.bucket === 2).map(avg));
  const wInc = sum(recs.filter((r) => onWeapon(r) && r.attr === A.phys && r.bucket === 3).map((r) => r.lo));
  const wMore = prod(recs.filter((r) => to103(r) && r.attr === A.all && r.bucket === 4).map((r) => 1 + r.lo / 100));
  const weapon = wFlat * (1 + wInc / 100) * wMore;
  const skillPct = model.skillDamagePct[HOA] / 100;   // config_skill_damage 11/12 kind 2, frozen above L20
  const globalAdds = new Pool(recs, { skill: HOA, tags, nodes: [101] });
  const flats = sum([A.phys, A.fire, A.lightning, A.cold, A.erosion].map((t) => {
    const [lo, hi] = globalAdds.flat(t); return (lo + hi) / 2;
  }));
  const base = weapon * skillPct + flats;   // global adds are not scaled by the skill % (ctx k = 1)
  const derivedStrength = Math.round(player.base(A.strength) * (1 + player.inc(A.strength) / 100));
  const strength = model.pageStats?.strength ?? derivedStrength;   // the game's own value when the page was read
  const mainStat = 1 + 0.005 * strength;    // attributes|show|1: +0.5% additional skill damage per point

  // FUN_141e14330: one inc pool over the chunk mask, one more per bucket. HoA phys->fire 100% + Obliterate
  // phys->erosion 100% (200% -> halved), then fire->erosion: every chunk ends erosion with phys history,
  // half of it also with fire/elemental history.
  const proximityInc = a.inDistanceFilters ? sum(recs.filter((r) => r.filter?.[0] === 107 && r.node === 101 && r.attr === A.all && r.bucket === 3).map((r) => r.lo)) : 0;
  // Ranger slate: P1% of the Knockback distance increase also applies to damage bonuses, up to P2%.
  const kb = recs.find((r) => r.cls === 758842)?.P ?? [0, 0];
  const knockback = Math.min(kb[1], kb[0] / 100 * player.inc(3430));
  const incA = c.inc(A.all, A.phys, A.erosion) + proximityInc + knockback;
  const incB = incA + c.inc(A.fire, A.elemental);
  const inc = (incA + incB) / 2;
  const halfA = 0.5 * (1 + incA / 100) * c.more(A.phys) * c.more(A.erosion);
  const halfB = 0.5 * (1 + incB / 100) * c.more(A.phys) * c.more(A.fire) * c.more(A.elemental) * c.more(A.erosion);
  const typeMore = halfA + halfB;
  const more = c.more(A.all);
  const trig = select(recs, 624, { skill: HOA, tags: new Set([...tags, T.demolisherConsumed]) })
    .filter((r) => r.attr === A.all && r.cls !== 943144);
  const moreTrig = prod(trig.map((r) => 1 + r.lo / 100));
  const chanceMore = prod(byCls(943144).map((r) => 1 + (r.P?.[0] ?? 0) / 100 * r.lo / 100));   // EV of chance lines
  // Kaleidoscope rings turn in lockstep: phys and erosion turns reach every chunk, the elemental turn the fire half.
  const ring = prod(byCls(kaleidoCls).filter((r) => r.attr === A.erosion).map((r) => 1 + r.lo / 100));
  const w = halfB / typeMore;   // damage share of the fire-history chunk
  const kaleidoscope = (ring + (1 + w * (ring - 1)) + ring) / 3;
  const passivation = 1 + sum(recs.filter((r) => r.node === 632 && r.scope === `skill:${HOA}`).map((r) => r.lo)) * a.enemyLifePct / 100;
  const fervorPts = fields(1, new Set(tags));       // node 639: fixed Fervor Rating
  const fervor = recs.filter((r) => r.node === 119 && r.source === 45);
  const fervorMore = prod(fervor.filter((r) => r.attr === A.all).map((r) => 1 + r.lo / 100 * Math.floor(fervorPts / (r.per || 1))));
  const fervorCrit = sum(fervor.filter((r) => r.attr === A.critRating).map((r) => r.lo * fervorPts / (r.per || 1)));
  const near = a.inDistanceFilters ? prod(recs.filter((r) => r.filter?.[0] === 107 && r.attr === A.all && r.bucket === 4 && r.lo > 0)
    .map((r) => 1 + r.lo / 100)) : 1;            // Frenzy Hound near a bomb, core proximity lines
  const hit = base * more * typeMore * kaleidoscope * passivation * fervorMore * mainStat * near * chanceMore;

  // Crit: rolled once per bomb (docs R1). Weapon rating (fixed if "fixed at N for the Weapon").
  const wRating = fields(2006770, tags) || sum(recs.filter((r) => onWeapon(r) && r.attr === A.critRating && r.bucket === 1).map((r) => r.lo));
  const critInc = c.inc(A.critRating) + fervorCrit;
  const lucky = recs.some((r) => r.node === 107 && r.label === 3000101);
  const p = critChance(wRating * (1 + critInc / 100), lucky);
  const critDmg = 150 + c.base(A.critDamage);
  const critMore = pool([T.demolisherConsumed, T.onCrit]).more(A.all) / more;
  const critFactor = 1 + p * (critMultiplier(critDmg) * critMore - 1);

  // Enemy: resistance after penetration (FUN_141dd6ee0), damage-taken modifiers, Corona, damage vs Life.
  const pen = c.base(A.erosionPen);
  const enemyTargeted = new Pool(recs, { tags: new Set(), targets: 8 });
  const ringTaken = recs.some((r) => r.scope === "buff:35108" || r.scope === "buff:35107") ? 1 + a.ringTakenPct / 100 : 1;
  const sentry = (r: Rec) => r.scope === "buff:35086" && !a.sentryProximity;
  const enemyPool = new Pool(recs, { tags: new Set(), scale, exclude: sentry });
  // Dual Kismet "Mighty Arrow" (+25% taken by Attack Horizontal Projectiles) does not apply: the bombs are detonated
  // by Demolisher Charges, never travel into the target (user ruling 2026-10-11; no such modifier on the live dummy).
  const taken = enemyPool.more(A.damageTaken) * enemyPool.more(A.erosionTaken) * (1 + enemyPool.inc(A.damageTaken) / 100) * enemyTargeted.more(A.damageTaken) * ringTaken;
  const lifeMore = 1 + fields(2010024, tags) / 100;
  // FUN_141e12200 erosion branch: monster armor ratio x victim erosion armor efficiency (field 0x1e9ce6 = 60, cap 0x1e9ce1 = 80).
  const armor = armorFactor(armorRatio(a.enemyArmor), 60, 80, a.armorPen);
  const enemy = armor * resistanceFactor(a.enemyErosionRes, 60, pen) * taken * lifeMore;

  // Per bomb: pummel + Q explosions (Q = projectile quantity), Upheaval explosion bonus (field 2600031).
  const q = 1 + fields(2006108, tags);
  const upheaval = 1 + fields(2600031, tags) / 100;
  const empMore = moreTrig;                          // Demolisher-consumed lines apply to empowered bombs only
  const perBomb = hit * critFactor * enemy
    * (empoweredShare * empMore * (1 + q * a.explosionScale * upheaval) + (1 - empoweredShare));

  // Deterioration (Obliterated hits): 60% of hit erosion damage (char_buff 180 {"rate":60,"interval":0.33}).
  // With the periodic label (3000123) it ticks every 0.33s, +P1% per tick up to P2 times; otherwise once on expiry.
  const det = pool([T.demolisherConsumed, T.deterioration]);
  const duration = (1 + det.inc(A.buffDuration) / 100) * det.more(A.buffDuration);
  const periodic = recs.some((r) => r.node === 107 && r.label === 3000123);
  const step = fields(2006887, tags) / 100, cap = fields(2006888, tags);
  const ticks = periodic ? Math.floor(duration / 0.33 + 1e-9) : 1;
  // Deterioration chance (field 2006884) incl. Obliterate's on-trigger +10000 and Ruinous Star's -10000.
  const chanceRecs = select(recs, [108, 624], { skill: HOA, tags }).filter((r) => r.field === 2006884 || (r.node === 624 && r.attr === 2006884));
  const detChance = Math.min(1, Math.max(0, sum(chanceRecs.map((r) => r.lo)) / 100));
  let tickSum = 0;
  for (let i = 0; i < ticks; i++) tickSum += periodic ? 1 + step * Math.min(i, cap) : 1;
  // Memory: P1% of the Erosion Damage bonus also applies to Deterioration Damage, up to P2%.
  const dm = recs.find((r) => r.cls === 16346693)?.P ?? [0, 0];
  const detInc = c.inc(A.deterioration) + Math.min(dm[1], dm[0] / 100 * c.inc(A.erosion));
  const detFactor = detChance * 0.6 * (1 + detInc / 100) * c.more(A.deterioration) * tickSum;

  const dps = throwRate * bombsPerThrow * perBomb * (1 + detFactor);
  // Top-level non-crit hits (the hit-watch instrument): Kaleidoscope on a phys/erosion turn, every buff up.
  const topScale = ring / kaleidoscope;
  const topPummel = hit * empMore * enemy * topScale;
  return {
    dps, pool: c, derivedStrength, topPummel, topExplosion: topPummel * a.explosionScale * upheaval, throwRate, bombsPerThrow, empoweredShare, incAs, strength, mainStat, weapon, base, inc, more, typeMore,
    moreTrig, kaleidoscope, fervorPts, hit, critChance: p, critDmg, critMore, critFactor, pen, taken, enemy, q,
    upheaval, duration, ticks, detFactor, detChance, w, paralysisUptime, sentryFreq, scales, stackN, lifeMore, near, proximityInc, knockback, ringTaken, armor, detInc, passivation, fervorMore, chanceMore,
  };
}
