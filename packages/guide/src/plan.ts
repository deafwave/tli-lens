/** `guide plan`: your character to a damage goal on a boss at the least FE, one step at a time, from the live read (user, 2026-10-16: "200 billion in the
 *  cheapest manner possible"). Each round every candidate is priced on the build as it stands after the steps before it; the step taken is the one with the
 *  most damage per FE (a free one first). A candidate is refused when the model cannot price it whole (a new omission), when no aura switched off makes it fit (MANA2:
 *  the auras' Sealed Mana no longer fits), or when it breaks a rule of the game the generators do not know (listed in GuideOut.startNotes). */
import { dreamMoves, gearMoves, whiteBaseMoves, type Dream } from './candidates/gear';
import { gemLevelAt, gemMoves, gemsHeld } from './candidates/gems';
import { costOf } from './priceOf';
import { kismetMoves, pointProbes } from './candidates/kismets';
import { pactMoves } from './candidates/pacts';
import { prismMoves } from './candidates/prisms';
import { addSlate, boardView, copiedFrom, copyPlaces, fitsInPlace, influenceText, overCap, packBoard, positional, pricedCopiers, replaceable, replaceSlate, screenSlate, slateMoves, slateName, slateWants, type SeenSlate } from './candidates/slates';
import { applyPatch } from './patches';
import { talentMovesWith } from './candidates/talents';
import { inverseImage, targetMoves } from './candidates/target';
import { bossName, ownedGear, ownedUniques } from './modes';
import { ctxOfState, pieceKey, rankable, rankedOn } from './search';
import { talentName } from './names';
import { buildSheet } from './sheet';
import { pinFile, table } from './pin';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import blends from './data/blends.json';
import type { Evaluator, Figure, GenCtx, GuideOut, Move, PriceBook, State } from './types';

export interface PlanOpts { target: string; goal: number; /** your FE: an option dearer than the FE left is not priced; the plan stops when none fits */ budget?: number; /** the goal as a time to kill the target (s): goal = its max Life / goalSeconds */ goalSeconds?: number; maxSteps: number;
  /** the slate listings the market has read in the last week (.cache/slate-listings.json) */ slateListings?: SeenSlate[];
  /** FE of the talent prism like the example build's (the owner's price) */ prismFE: number;
  /** talent nodes whose points never move (set by runPlan) */ locked?: Set<number>;
  /** the character's talent points: the points it has spent at the start (set by runPlan) */ points?: number;
  /** by board slate: your kill speed with it emptied over yours (set by runPlan; absent = no listing is tried in place of it) */ slateKeep?: number[];
  /** your prices for a legendary at a roll of one line (roll-prices.json: { item, line: its modifier id, rolls: [[value, FE]] }); the item's other lines as yours */
  rollPrices?: { item: string; line: number; rolls: [number, number][] }[];
  /** vorax Ultimate re-grafts (vorax-grafts.json, the owner's: the organ, the line's modifier group, FE per graft, [tier, %] odds): a graft always replaces the line */
  grafts?: { organ: string; group: number; fe: number; odds: [number, number][] }[];
  /** Inverse Image listings (inverse-images.json, read from the market: listing number, reflected Medium Talent effect %, FE): bought as listed, the roll fixed */
  inverseImages?: { n: number; medium: number; fe: number }[];
  /** rares you mean to make (dream-gear.json): each priced whole, base and crafts, in place of what you wear in its slot */ dreams?: Dream[];
  /** the skill places another skill is tried in: the weakest active and aura places (set by runPlan; absent = none) */ skillSlots?: { kind: string; slot: number }[];
  /** a warm start: the last plan's scores by option key (null: no gain or refused) and when it ran */ prior?: { at: string; scores: Record<string, number | null> };
  /** called with every option's score after the first round and after each step (the next plan's warm start) */ saveScores?: (scores: Record<string, number | null>) => void }
export const DEFAULT_PLAN: PlanOpts = { target: 'dummy', goal: 2e11, maxSteps: 60, prismFE: 4000 };   // the target's prism is an Inverse Image (market 2026-10-17: Medium +39 % for 3,399 FE, +89 % for 7,900 FE)

/** the owner's rules the candidates must keep (2026-10-16) */
const RULES = [
  'Physical -> Cold / Lightning / Fire conversion lines are left out (owner: they do nothing for an Erosion build).',
  'A Magnificent or Noble support is never levelled (max level 5, levelled by consuming copies).',
  'A legendary you wear or own is never bought.',
  'A change that seals more Mana than you have (MANA2) is priced with each active aura switched off; the best that fits is offered, naming the aura (owner, 2026-10-18).',
  'Projectile speed is never raised (any aura, support, slate line or item that adds it is refused); Wind Projectiles is not offered and Slow Projectile is never taken out. The model overrates faster projectiles (your dummy, 2026-10-16: Passivation -> Wind Projectiles measured 22.5 B -> 16.9 B where the model said -8 %).',
  "Damage is the raw DPS at full Life on the training dummy (the number it shows) or on Cube 3, never a kill speed; on the Traveler it is the dummy's capped at 15 trillion (owner, 2026-10-18).",
  'Talent points are only moved (a respec is free at level 90 and below), never added: the plan does not assume a point you do not have.',
  'A slate line already on your board is not offered on another slate.',
  'An item holds at most 2 lines of each grade: Basic, Advanced and Ultimate (owner, 2026-10-18: a rule of the game on all gear).',
  'Hero memories: each is levelled to its rarity cap (Rare 30, Epic 40), its random affixes rerolled one slot at a time until each lands (no keep: a reroll replaces the affix in the slot) at the game odds of Affliction Effect for every affix (1.46 % an Epic roll); a higher rarity is a new memory bought, priced from market listings only.',
  'No step seals Mana you have free now: the model does not price what a cast costs, and with none free Sentry is not cast (Precise: Malleable sealed 485 of 485: 500 B in game, 2026-10-17).',
  'Your Paralysis and Sealed Mana Compensation talent points stay, and so do points on a node the model prices at exactly 0 (it cannot judge them).',
];
/** where an item you own is: the read's 'stash' is item page 0: My Booth, what you list on the trade house (owner, 2026-10-17: your stash is empty; page 0 holds your 28 listed slates) */
// the read's page 0 is the stash the Trade House's My Booth opens (owner, 2026-10-17 / 18): every stash tab, so its slot numbers repeat and are not named
const placeOf = (where?: string) => (where === 'stash' ? 'stash (Trade House > My Booth > Stash)' : where ?? 'bag');
/** a slate base the player can tell apart by name (slates.ts SLATE_CAP: 261010 is the Pedigree, 7 cells) */
const SLATE_KIND: Record<number, string> = { 261010: 'Pedigree' };
const KEPT = /Paralysis|Sealed Mana Compensation/;
const CONVERSION = /Converts? .*Physical Damage to (Cold|Lightning|Fire)|Physical .*->.*(Cold|Lightning|Fire)/i;

/** the legendaries you wear or own: never bought, also after a step takes one off (a new one is priced at the middle of its rolls; yours is the roll there is) */
const heldUniques = (s: State) => new Set([...ownedUniques(s, true).values(), ...ownedUniques(s).values()]);
type Enh = Record<string, { Rarity: number[]; CurrentEnhanceLevel: number; TargetEnhanceLevel: number; BaseAttrTier: number; RandomAffixMod: number; ItemConsume: Record<string, number> }>;
type Reroll = Record<string, { Rarity: number[]; ItemLevel: [number, number]; ItemConsume: Record<string, number>; AffixTier: { Key: number; Value: number }[] }>;
let enh: Enh | undefined, reroll: Reroll | undefined;
const ENH = (): Enh => (enh ??= JSON.parse(readFileSync(pinFile('catalog/0x6ac8071f/lua_config_hero_item_enhance.json'), 'utf8')).rows as Enh);
const REROLL = (): Reroll => (reroll ??= JSON.parse(readFileSync(pinFile('catalog/0x6ac8071f/lua_config_hero_item_reroll.json'), 'utf8')).rows as Reroll);
const MEM_ITEM: Record<string, string> = { 5140: 'Memory Scrap', 5141: 'Memory Thread - Normal', 5142: 'Memory Thread - Magic', 5143: 'Memory Thread - Rare', 5144: 'Memory Thread - Epic', 391000: 'Crude Lunar Dust', 391001: 'Luminous Lunar Dust', 391002: 'Flawless Lunar Dust' };
/** a memory's random affix groups (its base: Origin 71001, Discipline 71002, Progress 71003): one block of 19 from 4021569 and one of 26 from 4021650, in that
 *  order (the reads: Origin rolls 4021653 and 4021666, Progress 4021717; Affliction Effect, which the game lists, is only in the first block) */
const memPool = (baseId: number) => { const i = baseId - 71001; return i < 0 || i > 2 ? [] : [...Array.from({ length: 19 }, (_, k) => 4021569 + 19 * i + k), ...Array.from({ length: 26 }, (_, k) => 4021650 + 26 * i + k)]; };
/** the chance one roll lands a given affix group: the game's odds for Affliction Effect on an Epic (0.32 % T1 + 0.49 % T2 + 0.65 % T3, owner 2026-10-17), taken
 *  for every group (the catalog has no affix weights); the tier split is the reroll table's */
const MEM_GROUP_P = 0.0146;
/** One random affix slot you pick, rerolled until the affix lands (a reroll puts a random affix in it, there is no keep: owner 2026-10-17; expected rerolls 1 / p): a reroll costs the reroll table's items for the rarity and item level (the read
 *  has no memory item level: the hero's). A level step that reaches a RandomAffixMod level (Epic: 20, 40) rolls a new affix free, then rerolls. */
function memoryCands(s: State, ctx: GenCtx): Cand[] {
  const rolls = table<{ rows: Record<string, [number, number][]> }>('config_modifier_rolls').rows, out: Cand[] = [];
  const fe = (n: Record<string, number>) => Object.entries(n).reduce((t, [k, v]) => t + v * (ctx.prices.price(MEM_ITEM[k] ?? k, s.level) ?? NaN), 0);
  const said = (n: Record<string, number>) => Object.entries(n).map(([k, v]) => `${v} ${MEM_ITEM[k] ?? k}`).join(' + ');
  const cap = (r: number) => Math.max(0, ...Object.values(ENH()).filter((x) => x.Rarity.includes(r)).map((x) => x.TargetEnhanceLevel));
  const need = (r: number, from: number, to: number) => { const n: Record<string, number> = {}; for (const x of Object.values(ENH())) if (x.Rarity.includes(r) && x.CurrentEnhanceLevel >= from && x.TargetEnhanceLevel <= to) for (const [k, v] of Object.entries(x.ItemConsume)) n[k] = (n[k] ?? 0) + v; return n; };
  const mid = (id: number) => rolls[id].map(([lo, hi]) => (lo + hi) / 2);
  type Aff = { id: number; dyn: number[]; list: string };
  const mems = (s.loadout.heroMemories ?? []) as { label: string; slot: number; baseId: number; reminiscenceLevel: number; affixes: Aff[] }[];
  for (const m of mems) {
    const b = m.affixes.find((a) => a.list === 'BaseAttrInfoList'); if (!b) continue;
    const group = Math.floor(b.id / 100), r = group % 10, L = m.reminiscenceLevel, top = cap(r);
    const at = (lv: number) => { const id = group * 100 + (51 - lv); return rolls[id] ? { ...b, id, dyn: rolls[id].map(([lo]) => lo) } : undefined; };
    const write = (affixes: Aff[], lv = L) => [{ kind: 'patch', op: 'memories', items: mems.map((x) => (x !== m ? x : { ...x, reminiscenceLevel: lv, affixes })) } as never];
    // the random affix outcomes: every pool group not on the memory's other random affixes, at each tier the reroll table rolls, and its chance (tier and better)
    const rr = Object.values(REROLL()).find((x) => x.Rarity.includes(r) && x.ItemLevel[0] <= s.level && s.level <= x.ItemLevel[1]);
    const rerollFE = rr ? fe(rr.ItemConsume) : NaN, W = rr ? rr.AffixTier.reduce((t, x) => t + x.Value, 0) : 0;
    const outcomes = (taken: Aff[]) => (rr ? memPool(m.baseId) : []).filter((g) => !taken.some((a) => Math.floor(a.id / 100) === g)).flatMap((g) => rr!.AffixTier
      .filter((t) => rolls[g * 100 + t.Key]).map((t) => ({ id: g * 100 + t.Key, p: MEM_GROUP_P * rr!.AffixTier.filter((x) => x.Key <= t.Key).reduce((u, x) => u + x.Value, 0) / W })));
    const random = m.affixes.filter((a) => a.list === 'SuffixInfoList');
    // a random affix you have, rerolled to another (or the same group at a better tier)
    if (Number.isFinite(rerollFE)) for (const a of random) for (const o of outcomes(random.filter((x) => x !== a)))
      if (Math.floor(o.id / 100) !== Math.floor(a.id / 100) || o.id % 100 < a.id % 100)
        out.push({ key: `memroll|${m.slot}|${a.id}|${o.id}`, like: [`memroll|${m.slot}|${random.indexOf(a)}|${o.id}`], kind: 'memory', costFE: rerollFE / o.p, note: `${(o.p * 100).toFixed(2)} % a reroll (that tier or better)`,
          label: `Reroll your ${m.label}'s ${lineText(a.id, a.dyn)} to ${lineText(o.id, mid(o.id))}: about ${Math.round(1 / o.p)} rerolls of ${said(rr!.ItemConsume)}`,
          changes: write(m.affixes.map((x) => (x === a ? { ...x, id: o.id, dyn: mid(o.id) } : x))) });
    // levelled to its cap: the base stat only (a random affix it rolls on the way is not priced: at least this)
    const capped = at(top);
    if (top > L && capped) {
      const n = need(r, L, top);
      if (Number.isFinite(fe(n))) out.push({ key: `memlevel|${m.slot}|${L}|${top}`, group: `memlevel|${m.slot}|${L}`, kind: 'memory', costFE: fe(n), note: 'a random affix it rolls on the way is not priced: at least this',
        label: `Level your ${m.label} ${L} -> ${top}: ${lineText(capped.id, capped.dyn)} (yours ${lineText(b.id, b.dyn)}); ${said(n)}`, changes: write(m.affixes.map((x) => (x === b ? capped : x)), top) });
    }
    // levelled to the next level that rolls a random affix, that affix rerolled until it lands (its first roll is free)
    const next = Math.min(...Object.values(ENH()).filter((x) => x.Rarity.includes(r) && x.RandomAffixMod && x.TargetEnhanceLevel > L && x.TargetEnhanceLevel <= top).map((x) => x.TargetEnhanceLevel));
    const base = Number.isFinite(next) ? at(next) : undefined;
    if (base && Number.isFinite(rerollFE)) {
      const n = need(r, L, next), lv = fe(n);
      if (Number.isFinite(lv)) for (const o of outcomes(random)) {
        const rerolls = Math.max(0, 1 / o.p - 1);
        out.push({ key: `memlevel|${m.slot}|${L}|${o.id}`, group: `memlevel|${m.slot}|${L}`, kind: 'memory', costFE: lv + rerolls * rerollFE, note: `${(o.p * 100).toFixed(2)} % a roll (that tier or better)`,
          label: `Level your ${m.label} ${L} -> ${next} (${said(n)}), its new random affix rerolled to ${lineText(o.id, mid(o.id))}: about ${Math.round(rerolls)} rerolls of ${said(rr!.ItemConsume)}`,
          changes: write([...m.affixes.map((x) => (x === b ? base : x)), { id: o.id, dyn: mid(o.id), list: 'SuffixInfoList' }], next) });
      }
    }
  }
  return out;
}
/** A blend on the belt you wear (src/data/blends.json, read from the client by scripts/blend_recipes.py): every recipe the game's window shows (Show) and you
 *  unlocked that grants one affix, in place of the belt's blend, at its spices' price. A recipe with a random outcome or without a row in the read is named. */
function blendCands(s: State, ctx: GenCtx): Cand[] {
  const belt = ((s.loadout.gear ?? []) as { slot: string; label: string }[]).find((g) => g.slot === 'belt');
  if (!belt) return [];
  const unlocked = new Set(blends.unlocked), name = (id: string) => table<{ rows: Record<string, string> }>('lang_en').rows[`item_base|name|${id}`] ?? id;
  const shown = blends.recipes.filter((r) => r.show && unlocked.has(r.id) && r.type4.some((t) => BELT_TYPE4.has(t)));
  const random = shown.filter((r) => Object.keys(r.mods).length !== 1);
  if (random.length) ctx.notSearched.add(`blend: ${random.length} recipe(s) with a random outcome not offered (${random.map((r) => r.id).join(', ')})`);
  if (blends.unlockedNotRead.length) ctx.notSearched.add(`blend: ${blends.unlockedNotRead.length} unlocked recipe(s) had no row in the client's read (scripts/blend_recipes.py after opening each tab of the blend window)`);
  return shown.filter((r) => !random.includes(r)).flatMap((r) => {
    const id = Number(Object.keys(r.mods)[0]), use = Object.entries(r.consume).map(([k, n]) => [name(k), n] as const);
    const fe = use.reduce((t, [n, q]) => t + q * (ctx.prices.price(n, s.level) ?? NaN), 0);
    if (!Number.isFinite(fe)) { ctx.notSearched.add(`blend ${r.id}: a spice has no price (${use.map(([n]) => n).join(', ')})`); return []; }
    return [{ key: `blend|${r.id}`, group: 'blend|belt', kind: 'craft', costFE: fe, label: `Blend ${blendText(id)} on your ${ownedUniques(s, true).get('belt') ?? belt.label}: ${use.map(([n, q]) => `${q} ${n}`).join(', ')}`,
      changes: [{ kind: 'patch', op: 'gear-blend', slot: 'belt', id } as never] }];
  });
}
// config_item_base Type4 of the belts (the recipes' default Type4 [23, 170, 171], the read's defaults row)
const BELT_TYPE4 = new Set([23, 170, 171]);
/** a blend modifier's game text: its bindings carry the values (`<affix class>_<value>..._mt34`), each class's description filled with its own */
function blendText(id: number): string {
  const b = (table<{ rows: Record<string, { bindings?: string[] }> }>('config_modifier').rows[id]?.bindings ?? [])[0]?.split('_').slice(0, -1) ?? [];
  const parts: string[] = [];
  for (let i = 0; i < b.length; ) {
    const cls = b[i++], vals: string[] = [];
    while (i < b.length && b[i].length < 6) vals.push(b[i++]);
    const t = table<{ rows: Record<string, string> }>('lang_en').rows[`affix_class|description|${cls}`];
    if (t) parts.push(t.replace(/<[^>]+>/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim().replace(/\$([+-]?)P(\d)\$/g, (_, sg: string, k: string) => `${sg}${vals[+k - 1] ?? '?'}`));
  }
  return parts.length ? parts.join(' / ') : `modifier ${id}`;
}
/** a modifier's game text at a roll ($+P1$ -> +18), else its id */
export function lineText(id: number, dyn: number[]): string {
  const b = (table<{ rows: Record<string, { bindings?: string[] }> }>('config_modifier').rows[id]?.bindings ?? [])[0], t = b && table<{ rows: Record<string, string> }>('lang_en').rows[`affix_class|description|${b.split('_')[0]}`];
  return t ? t.replace(/<[^>]+>/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim().replace(/\$([+-]?)P(\d)\$/g, (_, sg: string, i: string) => `${sg}${dyn[+i - 1] ?? '?'}`) : `modifier ${id} at ${dyn.join(' / ')}`;
}
/** packBoard, remembered per board and shape list (a search that fails can take seconds) */
const packed = new Map<string, boolean>();
/** the board `l` (its slates, the added ones as `extra` shapes) packs, and no capped type (SLATE_CAP: at most 3) is over; a positional board (a Sparks of Moth Fire on
 *  it) as its slates sit, never re-laid out */
function fitsLayout(l: Record<string, unknown>, level: number, extra: number[]): boolean {
  const items = (l.slateItems ?? []) as { itemId: string; baseId: number; shapeId?: number; link?: unknown; direction?: number; influenceId?: number }[];
  const k = JSON.stringify([items.filter((x) => !x.itemId.startsWith('guide-add-')).map((x) => [x.baseId, x.shapeId, x.link, x.direction, x.itemId.startsWith('guide-'), x.influenceId]), extra, level]);
  if (!packed.has(k)) packed.set(k, !overCap(items) && (positional(items) ? fitsInPlace(l, level) : packBoard(l, level, extra) !== null));
  return packed.get(k)!;
}
/** the skill gems one can hold (config_item_base p5c -> config_skill_stone) of a kind (config_skill_stone i4: 1 active, 3 aura), named */
let pools: Map<number, { sid: number; name: string }[]> | undefined;
function skillPool(kind: number): { sid: number; name: string }[] {
  if (!pools) {
    pools = new Map();
    const base = table<{ rows: Record<string, { p5c?: number[] }> }>('config_item_base').rows, st = table<{ rows: Record<string, { i4?: number }> }>('config_skill_stone').rows, lang = table<{ rows: Record<string, string> }>('lang_en').rows;
    for (const [b, r] of Object.entries(base)) { const sid = r.p5c?.[0], name = lang[`item_base|name|${b}`]; if (typeof sid !== 'number' || !st[sid] || !name) continue;
      const k = st[sid].i4 ?? 0; if (!pools.get(k)) pools.set(k, []); if (!pools.get(k)!.some((x) => x.sid === sid)) pools.get(k)!.push({ sid, name }); }
  }
  return pools.get(kind) ?? [];
}
type Cand = { key: string; /** taken once per group */ group?: string; /** the board slate a slate step fills (the slate viewer) */ boardAt?: number;
  /** the option as the one before a step (a kismet on the next free point of its size, or in place of the one a step socketed; a memory slot or an item's mod
   *  rerolled / crafted to the same line): a new candidate takes the lowest last score of the ones it shares a name with as its bound, as a stale score is (a gain
   *  shrinks as the build grows), and is priced only when it could win */ like?: string[];
  /** options this one gives at most, by name (a kismet in place of yours at most what it gives on a free point, while yours is not worse than none: `unless` the
   *  key of the move that takes yours out, priced and not raising the kill), a bound as `like` is, also in the first round */ under?: { by: string; unless: string }[]; label: string; costFE: number; kind: string; note?: string; changes: Move['changes'] };
const fits = (f: Figure) => !f.mana || 'stop' in f.mana || f.mana.fits;
/** the passive places whose aura is on (the server's switch) */
const auraPlaces = (s: State) => ((s.loadout.skills ?? []) as { place: { kind: string; slot?: number }; switch?: { pendingDeactivate?: boolean; activated?: boolean } }[])
  .filter((x) => x.place.kind === 'passive' && x.switch?.pendingDeactivate !== true && x.switch?.activated !== false).map((x) => x.place.slot!);

export function candidates(s: State, ctx: GenCtx, o: PlanOpts, lines: { id: number; name: string; gain?: number }[], held = heldUniques(s)): Cand[] {
  const L = s.loadout as { skills: { name: string; level: number; sid: number; place: { kind: string; slot?: number; ownerKind?: string; ownerSlot?: number } }[]; slateItems?: Record<string, unknown>[] };
  const out: Cand[] = [], fates = new Set<string>();
  const add = (m: Move, label = m.label) => {
    const t = m.then, cost = t ? t.costFE : m.costFE;
    if (cost === null || m.minLevel > s.level || (m.kind === 'support' && MEASURED_WRONG.test(m.label))) return;
    const u = /^Unique (.+) in \w+$/.exec(m.label)?.[1];
    if (u && held.has(u)) return;
    // a fate prices the same on any free point of its kind (the steps show only the next copy's smaller gain): offered on the first one only
    const fate = m.kind === 'kismet' && /^Socket (.+) on .+ \d-\d$/.exec(label)?.[1];
    if (fate) { if (fates.has(fate)) return; fates.add(fate); }
    // a kismet socketed on a point is what replacing the kismet a step put there with it is
    const at = m.kind === 'kismet' ? (/^Socket (.+) on (.+ \d-\d)$/.exec(label)?.slice(1) ?? /^Replace the kismet on (.+ \d-\d) with (.+)$/.exec(label)?.slice(1).reverse()) : undefined;
    const like = fate ? [`kismet|${fate}`, `kismet|${at![1]}|${fate}`] : at ? [`kismet|${at[1]}|${at[0]}`] : m.like;
    // the same kismet in place of yours: what it adds less what yours gave (at the same price)
    const under = at && !fate ? [{ by: `kismet|${at[0]}`, unless: `kismet|Remove the kismet on ${at[1]}` }] : undefined;
    out.push({ key: `${m.kind}|${label}`, label: t ? `${label} (${t.note})` : label, costFE: cost, kind: m.kind, changes: t ? t.changes : m.changes, ...(like ? { like } : {}), ...(under ? { under } : {}), ...(m.group ? { group: m.group } : {}) });
  };
  // Wind Projectiles: the model's figure is off against the owner's dummy (RULES)
  const MEASURED_WRONG = /Wind Projectiles|Slow Projectile -> /;
  for (const g of [ownedGear, gearMoves, gemMoves, kismetMoves, pactMoves, prismMoves, slateMoves, talentMovesWith({ maxShifts: 60, locked: o.locked, budget: o.points }), whiteBaseMoves]) for (const m of g(s, ctx)) add(m);
  for (const m of dreamMoves(ctx, o.dreams ?? [])) add(m);
  for (const m of targetMoves(s, ctx)) {
    // the example build's skill groups are not offered: they replace a whole group at a cost they do not carry (a socket's gem is gemMoves', priced)
    if (!/talent prism/.test(m.label)) continue;
    const pr = m.changes[0] as unknown as { op: string };
    // an Inverse Image's rolls cannot be changed once bought (owner, 2026-10-17): each listing as listed, reflecting the example build's Medium talents
    if (o.inverseImages?.length && pr.op === 'inverse') for (const x of o.inverseImages) out.push({ key: `inverse|${x.n}`, group: 'inverse', kind: 'prism', costFE: x.fe,
      note: "placed like the example build's; the roll is fixed once bought", changes: [inverseImage(s.loadout as never, x.medium) as never],
      label: `Buy the Inverse Image listed #${x.n} (${x.medium >= 0 ? '+' : ''}${x.medium}% reflected Medium Talent effects) for ${x.fe} FE: it reflects the Onslaughter crit and two-handed Medium talents, as the example build's` });
    else add({ ...m, costFE: o.prismFE }, "An Inverse Image talent prism like the example build (it reflects the Onslaughter crit and two-handed Medium talents; with the example build's +17.5 Strength on three Medium talents) at your price");
  }
  // another copy of a legendary you wear with one line at a better roll, at the price you gave that roll (roll-prices.json); the name's market price is any
  // roll's (owner, 2026-10-18: a +100 Crit Rating Death's Touch is not its 1300 FE), so a line you gave no price is named, not ranked
  const rolls = table<{ rows: Record<string, [number, number][]> }>('config_modifier_rolls').rows;
  for (const [slot, name] of ownedUniques(s, true)) {
    const g = ((s.loadout.gear ?? []) as { slot: string; affixes?: { id: number; dyn: number[]; list: string }[] }[]).find((x) => x.slot === slot);
    if (!g) continue;
    for (const a of (g.affixes ?? []).filter((x) => x.list !== 'BaseAttrInfoList')) {
      const r = rolls[a.id], best = r?.map(([lo, hi], i) => (lo < 0 ? Math.min(lo, a.dyn[i]) : Math.max(hi, a.dyn[i])));
      if (!r) continue;
      // your prices for this line: one step per roll you gave (a roll above the drop tier is the corrupted tier: id x 10 + 0 when its range holds it)
      const mine = o.rollPrices?.find((p) => p.item === name && Math.floor(p.line / 10) === Math.floor(a.id / 10));
      if (mine) {
        for (const [v, cost] of mine.rolls) {
          if (v <= a.dyn[0]) continue;
          const t0 = Math.floor(a.id / 10) * 10, id = !r || r[0][1] >= v ? a.id : rolls[t0] && rolls[t0][0][0] <= v && v <= rolls[t0][0][1] ? t0 : a.id, dyn = [v, ...a.dyn.slice(1)];
          out.push({ key: `rollp|${slot}|${a.id}|${v}`, group: `roll|${slot}`, kind: 'unique', costFE: cost, note: id === t0 && t0 !== a.id ? 'a corrupted copy, at your price' : 'at your price',
            label: `Buy another ${name} with ${lineText(id, dyn)} (yours: ${a.dyn[0]}); replace yours`, changes: [{ kind: 'patch', op: 'gear-roll', slot, id: a.id, dyn, newId: id } as never] });
        }
        continue;
      }
      if (best && best.some((v, i) => v !== a.dyn[i]))
        ctx.notSearched.add(`${name} with ${lineText(a.id, best)} (yours: ${a.dyn.join(' / ')}): no price for the roll (the market prices the name at any roll); give it one in roll-prices.json, or check /market`);
    }
  }
  // a vorax Ultimate line re-grafted until tier T or better lands (owner, 2026-10-17: a graft always replaces the line, its tier drawn at the odds): FE per graft / P(T or better),
  // at T's middle roll
  const vorax = (s.loadout.vorax ?? []) as { label: string; affixes: { id: number; dyn: number[] }[] }[];
  for (const v of vorax) for (const a of v.affixes) for (const gr of (o.grafts ?? []).filter((x) => x.group === Math.floor(a.id / 100))) for (const [tier] of gr.odds.filter(([x]) => x < a.id % 100)) {
    const p = gr.odds.filter(([x]) => x <= tier).reduce((q, [, w]) => q + w, 0) / 100, id = gr.group * 100 + tier, dyn = (rolls[id] ?? []).map(([lo, hi]) => Math.round((lo + hi) / 2));
    out.push({ key: `graft|${gr.group}|${tier}`, group: `graft|${gr.group}`, kind: 'craft', costFE: gr.fe / p, note: `about ${(1 / p).toFixed(1)} grafts of ${gr.fe} FE`,
      label: `Re-graft ${gr.organ} on your ${v.label} until T${tier} or better lands: ${lineText(id, dyn)} (yours: ${lineText(a.id, a.dyn)})`,
      changes: [{ kind: 'patch', op: 'vorax', items: vorax.map((x) => (x !== v ? x : { ...x, affixes: x.affixes.map((y) => (y === a ? { ...y, id, dyn } : y)) })) } as never] });
  }
  // a worn hero memory levelled (MEM1: base attr = group x 100 + BaseAttrTier) and its random affixes rerolled. A higher rarity is a new memory bought
  // (owner, 2026-10-16): its base from the market, not here
  for (const c of memoryCands(s, ctx)) out.push(c);
  for (const c of blendCands(s, ctx)) out.push(c);
  // a gem to level 20 (time, no FE); a Magnificent / Noble support is levelled by consuming copies (max 5): never a time step
  for (const g of L.skills.filter((x) => x.level < 20 && !/\((Magnificent|Noble)\)/.test(x.name))) {
    const at = (x: typeof g) => JSON.stringify(x.place) === JSON.stringify(g.place) && x.sid === g.sid;
    const p = g.place.kind === 'support' || g.place.ownerKind ? { kind: g.place.ownerKind!, slot: g.place.ownerSlot! } : { kind: g.place.kind, slot: g.place.slot! };
    const group = L.skills.filter((x) => (x.place.kind === p.kind && x.place.slot === p.slot) || (x.place.ownerKind === p.kind && x.place.ownerSlot === p.slot));
    out.push({ key: `level|${g.name}|${JSON.stringify(g.place)}`, label: `Level ${g.name} ${g.level} -> 20 (time)`, costFE: 0, kind: 'level',
      changes: [{ kind: 'patch', op: 'skill-group', place: p, items: group.map((x) => (at(x) ? { ...x, level: 20 } : x)) } as never] });
  }
  // another skill in one of the weakest active / aura places (owner, 2026-10-16: Fixate for Bull's Rage, another curse...): an active skill for an active place,
  // an aura for an aura place, the place's supports kept; at the gem's market price (free when you hold one); the mana check guards an aura
  for (const p of o.skillSlots ?? []) for (const k of skillPool(p.kind === 'passive' ? 3 : 1)) {
    const groupOf = (x: { place: { kind: string; slot?: number; ownerKind?: string; ownerSlot?: number } }) => (x.place.kind === p.kind && x.place.slot === p.slot) || (x.place.ownerKind === p.kind && x.place.ownerSlot === p.slot);
    const group = L.skills.filter(groupOf), head = group.find((x) => x.place.kind === p.kind);
    if (!head || head.sid === k.sid || L.skills.some((x) => x.sid === k.sid)) continue;
    const level = gemLevelAt(k.sid, s.level, 20), held = gemsHeld(s).has(k.name), cost = held ? { costFE: 0 } : costOf(ctx.prices, k.name, s.level, 'gem');
    if (!level || cost.costFE === null) continue;
    out.push({ key: `skill|${p.kind}|${p.slot}|${k.sid}`, group: `skill|${p.kind}|${p.slot}`, kind: 'skill', costFE: cost.costFE ?? 0, ...(held ? { note: 'you hold one' } : {}),
      label: `Replace ${head.name} with ${k.name} (${p.kind === 'passive' ? 'aura' : 'active'} slot ${p.slot}; its supports kept)`,
      changes: [{ kind: 'patch', op: 'skill-group', place: p, items: group.map((x) => (x === head ? { ...x, sid: k.sid, name: k.name, level, itemId: `guide-skill-${k.sid}`, mods: [] } : x)) } as never] });
  }
  const added = ((s.loadout.slateItems ?? []) as { itemId: string; shapeId?: number }[]).filter((x) => x.itemId.startsWith('guide-add-')).map((x) => x.shapeId!);
  // a slate you own (bag, booth) in place of one on the board: free
  // not one already on the board: the read lists board slates among the items (where 'board'), and a board slate's own lines may be read in part
  const onBoard = new Set(((s.loadout.slateItems ?? []) as { itemId: string; talents: number[] }[]).flatMap((x) => [x.itemId, JSON.stringify([...x.talents].sort())]));
  // free, so tried in every board slot its type may take (SLATE_CAP), not only the weakest (owner, 2026-10-17: a Pedigree you own fits only in place of yours)
  const board = (s.loadout.slateItems ?? []) as { talents: number[]; baseId: number }[];
  for (const own of s.owned.filter((x) => x.talents?.length && x.where !== 'board' && !onBoard.has(x.itemId) && !onBoard.has(JSON.stringify([...x.talents!].sort())))) {
    const where = placeOf(own.where), may = replaceable(board, own.baseId);
    board.forEach((it, i) => !may.includes(i)
      || !fitsLayout(applyPatch(s.loadout, replaceSlate(s, i, own.talents!, { baseId: own.baseId, shapeId: own.shapeId }) as never), s.level, added) || out.push({ key: `ownslate|${own.itemId}|${i}`, group: `ownslate|${own.itemId}`, kind: 'slate', costFE: 0,
      label: `Put your ${SLATE_KIND[own.baseId] ?? 'slate'} (level ${own.level}: ${own.talents!.map(talentName).join(', ')}) from your ${where}${own.where === 'stash' ? '' : `, slot ${own.slot}`} in place of board slate ${i + 1} (${it.talents.map(talentName).join(', ')})`, changes: [replaceSlate(s, i, own.talents!, { baseId: own.baseId, shapeId: own.shapeId })] }));
  }
  // a slate listing the market read: its lines, base, shape and price, in place of one of your slates its type may take, or added where the board, re-laid out
  // (moving and rotating a slate costs next to nothing: owner, 2026-10-16), has room; never a slate made up from lines (owner, 2026-10-18: three plan slates no
  // market had, one priced from a Pedigree). Screened by its lines' gains (one more slate line each) x what emptying your slate keeps (1 when it carries all of
  // that slate's lines: screenSlate); the best few per place priced.
  const gainOf = new Map(lines.map((x) => [x.id, x.gain ?? 1])), seen = o.slateListings ?? [], g = (t: number) => gainOf.get(t) ?? 1;
  const screen = (l: SeenSlate) => screenSlate(l.talents, g, 1, []);
  const best = (xs: { l: SeenSlate; e: number }[]) => { const TOP = 6, ok = xs.filter((x) => x.e > 1.005);
    return [...new Set([...[...ok].sort((a, b) => (b.e - 1) / Math.max(b.l.price, 1) - (a.e - 1) / Math.max(a.l.price, 1)).slice(0, TOP), ...[...ok].sort((a, b) => b.e - a.e).slice(0, TOP / 2)])]; };
  const listed = (l: SeenSlate) => `the ${SLATE_KIND[l.baseId] ?? 'slate'} listed at ${l.price} FE (seen ${new Date(l.at).toLocaleTimeString()}: ${l.talents.map(talentName).join(', ')})`;
  const listing = (l: SeenSlate) => `listing|${l.baseId}|${l.shapeId}|${l.price}|${l.talents.join('-')}`;
  const slates = (L.slateItems ?? []) as unknown as { talents: number[]; baseId: number }[], copied = copiedFrom(slates as never), lined = seen.filter((x) => x.talents.length);
  slates.forEach((it, i) => {
    const keep = o.slateKeep?.[i];
    if (keep === undefined) return;
    for (const { l } of best(lined.filter((x) => replaceable(slates, x.baseId).includes(i)).map((x) => ({ l: x, e: screenSlate(x.talents, g, keep, it.talents, copied[i]) })))) {
      const change = replaceSlate(s, i, l.talents, { baseId: l.baseId, shapeId: l.shapeId });
      if (fitsLayout(applyPatch(s.loadout, change as never), s.level, added))
        out.push({ key: `${listing(l)}|${i}`, group: listing(l), boardAt: i, kind: 'slate', costFE: l.price, note: 'a listing the market read: check it is still there',
          label: `Buy ${listed(l)} in place of your slate ${i + 1} (${it.talents.map(talentName).join(', ')})`, changes: [change] });
    }
  });
  // a Sparks of Moth Fire listing (no lines: it copies the last line of the slate on the side it rolled) where it sits on your board as it is, on a free cell or in place
  // of a slate, screened by the lines it copies there x what the slate it replaces keeps; per side the 3 cheapest (SLATE_CAP: 3 a board)
  const bare = seen.filter((x) => !x.talents.length && x.influenceId).sort((a, b) => a.price - b.price);
  // a side no listing was read for: a single-sided slate (one side of its pool) at your price for its name (prices.json; owner, 2026-10-18: "Single-sided Sparks are
  // approximately 500 FE"), its base as a slate of that shape on your board or listed has it
  const shaped = [...(L.slateItems ?? []) as { shapeId?: number; baseId: number }[], ...seen];
  const priced = pricedCopiers((n) => ctx.prices.price(n, s.level)).flatMap((c) => {
    const baseId = shaped.find((x) => x.shapeId === c.shapeId)?.baseId;
    return baseId === undefined || bare.some((l) => l.shapeId === c.shapeId && l.influenceId === c.influenceId) ? [] : [{ ...c, baseId, talents: [] as number[] }];
  });
  const onBoardN = (x: { shapeId: number; influenceId?: number }) => ((L.slateItems ?? []) as { shapeId?: number; influenceId?: number }[]).filter((y) => y.shapeId === x.shapeId && y.influenceId === x.influenceId).length;
  const copiers = [...bare.filter((x, i) => bare.slice(0, i).filter((y) => y.shapeId === x.shapeId && y.influenceId === x.influenceId).length < 3), ...priced].flatMap((l) => copyPlaces(s, l)
    .filter((p) => p.replaced === undefined || o.slateKeep?.[p.replaced] !== undefined).map((p) => ({ l, p, e: p.copies.reduce((q, t) => q * g(t), p.replaced === undefined ? 1 : o.slateKeep![p.replaced]) })));
  for (const { l, p } of best(copiers as never) as unknown as typeof copiers) {
    const name = slateName(l.shapeId) ?? `slate ${l.baseId}`, mine = p.replaced === undefined ? undefined : slates[p.replaced], at = 'at' in l ? l.at : undefined;
    const where = `place it at column ${p.at[0]}, row ${p.at[1]}${mine ? `, in place of your slate ${p.replaced! + 1} (${mine.talents.length ? mine.talents.map(talentName).join(', ') : name})` : ''}: it copies ${p.copies.map(talentName).join(', ')}`;
    out.push(at ? { key: `sparks|${listing(l as SeenSlate)}|${l.influenceId}|${p.replaced ?? 'free'}|${p.at}`, group: `${listing(l as SeenSlate)}|${l.influenceId}|${at}`, boardAt: p.replaced ?? slates.length, kind: 'slate', costFE: l.price,
      note: 'a listing the market read: check it is still there; what it copies is the last line of the slate on its side, so it goes where the step says',
      label: `Buy the ${name} listed at ${l.price} FE (seen ${new Date(at).toLocaleTimeString()}; ${influenceText(l.influenceId!)}) and ${where}`, changes: [{ kind: 'patch', op: 'slate-board', items: p.items } as never] }
      : { key: `sparks|priced|${l.shapeId}|${l.influenceId}|${p.replaced ?? 'free'}|${p.at}`, group: `sparks|priced|${l.shapeId}|${l.influenceId}|${onBoardN(l)}`, boardAt: p.replaced ?? slates.length, kind: 'slate', costFE: l.price,
        note: 'at your price (prices.json): no listing of this side read; what it copies is the last line of the slate on its side, so it goes where the step says',
        label: `Buy a ${name} that rolled: ${influenceText(l.influenceId!)} (about ${l.price} FE: your price) and ${where}`, changes: [{ kind: 'patch', op: 'slate-board', items: p.items } as never] });
  }
  if (positional(slates as never)) { ctx.notSearched.add('slate: a listing added to your board: a Sparks of Moth Fire on it copies by where the slates sit, so the board is not re-laid out to make room (a slate goes in place of one, or on a free cell)'); return out; }
  for (const shape of [...new Set(lined.map((x) => x.shapeId))]) {
    const one = lined.find((x) => x.shapeId === shape)!;
    if (!fitsLayout(applyPatch(s.loadout, addSlate(s, shape, [], one.baseId) as never), s.level, [...added, shape])) continue;
    for (const { l } of best(lined.filter((x) => x.shapeId === shape).map((x) => ({ l: x, e: screen(x) }))))
      out.push({ key: `${listing(l)}|add`, group: listing(l), boardAt: slates.length, kind: 'slate', costFE: l.price, note: 'a listing the market read: check it is still there; the board re-laid out to fit it (the slate board shows where each goes)',
        label: `Buy ${listed(l)} and add it to your board`, changes: [addSlate(s, shape, l.talents, l.baseId)] });
  }
  return out;
}

/** your character to `o.goal` damage per second on `o.target`: the steps, cheapest damage per FE first */
export async function runPlan(ev0: Evaluator, s0: State, books: PriceBook, k: Partial<PlanOpts> = {}, onStep?: (o: GuideOut) => void): Promise<GuideOut> {
  const o = { ...DEFAULT_PLAN, ...k };
  const ev = rankedOn(ev0, o.target);
  let s: State = { ...s0, skill: 'hoa', target: o.target };
  const ctx: GenCtx = { prices: books, level: s.level, notSearched: new Set() };
  const C = ctxOfState(s), first = (await ev.run(s.loadout, [], C)).figure;
  // the training dummy the owner checks a step on, beside the boss the plan is priced on (owner, 2026-10-17: a Cube 3 figure read as the dummy's)
  const dummy = (await ev.run(s.loadout, [], { ...C, target: null })).figure.life100;
  if (first.stop) throw new Error(`your character cannot be priced on ${bossName(o.target)}: ${first.stop}`);
  // what occupying each free contract point costs (the point's own pactspirit bonus): kismets go on the cheapest ones
  if (first.kill > 0) ctx.pointCost = new Map((await Promise.all(pointProbes(s).map(async (p) => [p.point, (await ev.run(s.loadout, p.changes, C)).figure] as const)))
    .filter(([, g]) => !g.stop).map(([n, g]) => [n, g.kill / first.kill]));
  if (o.goalSeconds) { if (!first.lifeMax) throw new Error(`${o.target}: no max Life to set a kill time against`); o.goal = first.lifeMax / o.goalSeconds; }
  const lines = (await slateWants(ev, s, first, 0, 25, false)).filter((x) => !CONVERSION.test(x.name));
  // talent points that stay where they are: the owner's (Paralysis is applied in game, Sealed Mana Compensation keeps the auras on) and a node the model prices
  // at exactly 0 (a state it does not evaluate, so it cannot judge the node)
  const held = Object.entries((s.loadout.talents ?? {}) as Record<string, number>).filter(([, p]) => p > 0).map(([n]) => +n);
  const zero = await Promise.all(held.map(async (n) => ((g) => !g.stop && g.kill === first.kill)((await ev.run(s.loadout, [{ kind: 'talent', node: n, points: 0 } as never], C)).figure)));
  o.points = Object.values((s.loadout.talents ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
  o.locked = new Set(held.filter((n, i) => zero[i] || KEPT.test(talentName(n))));
  const notes = [...RULES, ...(first.mana && !('stop' in first.mana) ? [`Sealed Mana now: ${first.mana.reserved} of ${first.mana.capacity} (${first.mana.margin} free); Life sealed ${first.mana.life.reserved} of ${first.mana.life.capacity}.`] : [`Sealed Mana: not calculated (${first.mana && 'stop' in first.mana ? first.mana.stop : 'no figure'}); changes are not checked against it.`])];
  const steps: NonNullable<GuideOut['plan']>['steps'] = [], refused = new Map<string, string>(), score = new Map<string, number>(), taken = new Set<string>();
  /** the kill after / before of each priced candidate, when it was priced */
  const ratio = new Map<string, number>();
  let f = first, spent = 0;
  const slateFrom: Record<number, string> = {};
  // the model does not price a skill's cast cost: the Mana free at the read is what is known to cast Sentry (owner, 2026-10-17: Precise: Malleable sealed 485 of 485, 500 B)
  const freeMana = first.mana && 'margin' in first.mana ? first.mana.margin : -Infinity;
  let figures = 0, t0 = Date.now();
  const lap = (what: string) => { console.log(`[time] ${what}: ${figures} figures, ${((Date.now() - t0) / 1000).toFixed(0)} s`); figures = 0; t0 = Date.now(); };
  const rate = async (c: Cand) => {
    figures++;
    let e = await ev.run(s.loadout, c.changes, C), g = e.figure;
    // an aura that no longer fits (owner, 2026-10-18: "Aura unsealing is fine if it is a dps increase"): the change with each active aura switched off, the best that fits
    if (!g.stop && !fits(g)) {
      const over = g.mana as { reserved: number; capacity: number };
      const tries = await Promise.all(auraPlaces(s).map(async (slot) => ({ slot, e: await ev.run(s.loadout, [...c.changes, { kind: 'patch', op: 'aura-off', place: { kind: 'passive', slot } } as never], C) })));
      figures += tries.length;
      const best = tries.filter((t) => !t.e.figure.stop && fits(t.e.figure)).sort((a, b) => b.e.figure.kill - a.e.figure.kill)[0];
      if (best) {
        const name = ((best.e.loadout.skills ?? []) as { name: string; place: { kind: string; slot?: number } }[]).find((x) => x.place.kind === 'passive' && x.place.slot === best.slot)?.name ?? `aura ${best.slot}`;
        c = { ...c, changes: [...c.changes, { kind: 'patch', op: 'aura-off', place: { kind: 'passive', slot: best.slot } } as never],
          label: `${c.label}, with ${name} turned off (Sealed Mana ${over.reserved} over ${over.capacity} with it on)` };
        e = best.e; g = e.figure;
      }
    }
    // both ways: a change that takes out a piece the model does not price (an omission gone) would read as a gain it cannot judge
    const now = new Set(g.partial.map(pieceKey)), lost = f.partial.filter((p) => !now.has(pieceKey(p)));
    const why = g.stop ? undefined : !rankable(f, g) ? `not priced whole: ${g.partial.filter((p) => !f.partial.includes(p))[0]?.slice(0, 160)}`
      : lost.length ? `takes out a piece the model does not price: ${lost[0].slice(0, 160)}`
      // the kill speed averages the damage from the boss's full Life down to 0; the training dummy (what the owner checks a step on) stays at full Life. A step
      // must raise both: Passivation -> Wind Projectiles was +8.6 % on the kill speed, -8 % at full Life in the model and -25 % on the owner's dummy (2026-10-16)
      // faster embers: the owner's dummy lost more than the model said (Wind Projectiles 22.5 B -> 16.9 B, Precise Projectiles 56.7 B where the model said x1.16,
      // 2026-10-16), measured before the model flew the embers in a ring (dps-debug c50a2384): no step raises the projectile speed until a dummy A/B checks the ring
      : g.projectile && f.projectile && g.projectile.speedInc > f.projectile.speedInc + 0.5 ? `raises projectile speed (+${f.projectile.speedInc.toFixed(0)}% -> +${g.projectile.speedInc.toFixed(0)}%), which costs embers in your game`
      : g.life100 < f.life100 * 0.995 ? `lowers your damage at full Life (what the training dummy shows) by ${((1 - g.life100 / f.life100) * 100).toFixed(1)} %` : !fits(g) ? `unseals an aura (Sealed Mana ${(g.mana as { reserved: number }).reserved} over ${(g.mana as { capacity: number }).capacity})`
      : g.mana && 'margin' in g.mana && g.mana.margin < freeMana ? `seals Mana you cast with (free Mana ${freeMana} -> ${g.mana.margin})` : undefined;
    if (why && g.kill > f.kill * 1.01) refused.set(c.label, `${why} (+${((g.kill / f.kill - 1) * 100).toFixed(0)} % if it were)`);
    const v = g.stop || why || !(g.kill > f.kill * 1.005) ? -Infinity : Math.log(g.kill / f.kill) / Math.max(c.costFE, 1);
    score.set(c.key, v); ratio.set(c.key, g.stop ? 0 : g.kill / f.kill);
    return { c, e, v };
  };
  // the board after the steps so far, in every write (a stopped plan keeps its slate viewer): as packBoard lays it out when slates were added (each placed
  // slate moved or rotated where it shows), else as it is
  const board = (): GuideOut['board'] => {
    const items = (s.loadout.slateItems ?? []) as { itemId: string; shapeId?: number; influenceId?: number }[], extra = items.filter((x) => x.itemId.startsWith('guide-add-'));
    const reshaped = items.some((x) => x.itemId.startsWith('guide-slate-')), lay = !positional(items) && (extra.length || reshaped) ? packBoard(s.loadout, s.level, extra.map((x) => x.shapeId!)) : null, nowCells = boardView(s.loadout).slates.map((x) => JSON.stringify(x.cells));
    return { now: boardView(s0.loadout), after: boardView(s.loadout, (i) => (slateFrom[i] ? { source: slateFrom[i], changed: true }
      : lay && JSON.stringify(lay[i]) !== nowCells[i] ? { source: 'on your board: move or rotate it to where it shows', changed: true } : { source: 'on your board', changed: false }), lay ?? undefined) };
  };
  const out = (partialRun: boolean): GuideOut => ({ mode: 'advise', board: board(), pin: ev.pin, etor: { season: books.season, fetchedAt: books.fetchedAt },
    knobs: { plan: { ...o, slateListings: o.slateListings?.length ?? 0 }, fight: ev.fight, rollBudget: ev.rollBudget, target: o.target, partialRun },
    character: { level: s0.level, skill: 'hoa', fe: s0.fe, owned: s0.owned.length, gear: ((s0.loadout.gear ?? []) as { slot?: string; label: string; name?: string }[]).map((g) => ({ slot: g.slot ?? '', label: g.name ?? g.label })) },
    start: first, startNotes: notes, steps: [], notSearched: [...ctx.notSearched], unpriced: [], notCalculable: [...refused].map(([l, w]) => `${l}: ${w}`),
    slates: lines.slice(0, 25), plan: { target: o.target, goal: o.goal, ...(o.goalSeconds ? { goalSeconds: o.goalSeconds } : {}), at: new Date().toISOString(), start: { label: 'your character as read from the game', figure: first, dummy }, steps,
      build: buildSheet(s.loadout) } });
  const keep = heldUniques(s0);
  // what each board slate is worth (its emptied figure over yours): the listings' screen (one figure a slate, again after a slate step)
  const weakest = async () => { const n = ((s.loadout.slateItems ?? []) as unknown[]).length, now = (await ev.run(s.loadout, [], C)).figure.kill;
    o.slateKeep = await Promise.all(Array.from({ length: n }, async (_, i) => (await ev.run(s.loadout, [replaceSlate(s, i, [])], C)).figure.kill / now)); };
  await weakest();
  // the weakest skill places (the least lost when the place is emptied): 2 active (never the main skill or Blink: movement, which the figure does not price), 2 aura
  const weakSkills = async () => { const sk = ((s.loadout.skills ?? []) as { name?: string; place: { kind: string; slot?: number; ownerKind?: string; ownerSlot?: number } }[]);
    const places = sk.filter((g) => (g.place.kind === 'active' && g.place.slot !== 0 && !/^Blink$/.test(g.name ?? '')) || g.place.kind === 'passive').map((g) => ({ kind: g.place.kind, slot: g.place.slot! }));
    const loss = await Promise.all(places.map(async (p) => ({ p, k: (await ev.run({ ...s.loadout, skills: sk.filter((g) => !((g.place.kind === p.kind && g.place.slot === p.slot) || (g.place.ownerKind === p.kind && g.place.ownerSlot === p.slot))) }, [], C)).figure.kill })));
    const by = (k: string) => loss.filter((x) => x.p.kind === k).sort((a, b) => b.k - a.k).slice(0, 2).map((x) => x.p);
    o.skillSlots = [...by('active'), ...by('passive')]; };
  await weakSkills();
  const fitsFE = (c: Cand) => o.budget === undefined || c.costFE <= o.budget - spent;
  let cands = candidates(s, ctx, o, lines, keep).filter(fitsFE);
  console.log(`start: ${first.kill.toExponential(3)}/s on ${o.target}; ${cands.length} candidates; ${lines.length} slate lines`);
  lap('slate lines and talent checks');
  // Cand.like / under: the lowest last score of the options `c` repeats or gives at most, from the scored candidates `from`; undefined = none (c is priced)
  const boundOf = (c: Cand, from: Cand[]) => {
    const names = new Set([...(c.like ?? []), ...(c.under ?? []).filter((u) => (ratio.get(u.unless) ?? Infinity) <= 1).map((u) => u.by)]);
    const b = from.filter((x) => x !== c && score.has(x.key) && (x.like ?? []).some((n) => names.has(n))).map((x) => score.get(x.key)!);
    return b.length ? Math.min(...b) : undefined;
  };
  // a warm start (owner, 2026-10-18: "recalc this partly after making some changes ... a fraction of the time"): an option the last plan priced takes its last score as
  // its bound, as a stale score within a run does (a gain shrinks as the build grows), and is priced only when it could win; one it found no gain in stays out
  const seeded = new Set(o.prior ? cands.filter((c) => c.key in o.prior!.scores).map((c) => c.key) : []);
  for (const k of seeded) score.set(k, o.prior!.scores[k] ?? -Infinity);
  if (o.prior) notes.push(`Warm start: ${seeded.size} options took their score from the plan of ${o.prior.at} as a bound (priced again only when one could win); ${cands.length - seeded.size} were priced fresh. An option that plan found no gain in is not priced again: --fresh prices every option.`);
  const save = () => o.saveScores?.(Object.fromEntries([...score].map(([k, v]) => [k, Number.isFinite(v) ? v : null])));
  // what is not bounded by an option first; the rest take their bound from those
  const later = cands.filter((c) => c.under?.length && !seeded.has(c.key));
  await Promise.all(cands.filter((c) => !later.includes(c) && !seeded.has(c.key)).map(rate));
  await Promise.all(later.filter((c) => { const b = boundOf(c, cands); if (b !== undefined) score.set(c.key, b); return b === undefined; }).map(rate));
  lap(`first round (${cands.length} options, ${seeded.size} from the last plan)`);
  save();
  while (steps.length < o.maxSteps && f.kill < o.goal) {
    const open = cands.filter((c) => fitsFE(c) && !taken.has(c.key) && !(c.group && taken.has(c.group)) && (score.get(c.key) ?? 0) > -Infinity).sort((a, b) => score.get(b.key)! - score.get(a.key)!);
    if (!open.length) break;
    // lazy greedy: a stale score bounds the fresh one from above (a gain shrinks as the build grows); the stale best are re-priced a batch at a time until the
    // best fresh one beats every stale score left, so no option that could win goes unpriced and none that cannot is priced
    const P = Math.max(16, ev.parallelism ?? 16);
    let w: Awaited<ReturnType<typeof rate>> | undefined;
    for (let at = 0; at < open.length; at += P) {
      const got = (await Promise.all(open.slice(at, at + P).map(rate))).filter((x) => x.v > -Infinity).sort((a, b) => b.v - a.v)[0];
      if (got && (!w || got.v > w.v)) w = got;
      const next = open[at + P];
      if (w && (!next || w.v >= score.get(next.key)!)) break;
    }
    if (!w) continue;
    // the board slot a slate step fills, and where that slate comes from (the slate viewer)
    const own = /^ownslate\|(.+)\|(\d+)$/.exec(w.c.key);
    if (own) { const o = s0.owned.find((x) => x.itemId === own[1]); slateFrom[+own[2]] = `from your ${placeOf(o?.where)}${o && o.where !== 'stash' ? `, slot ${o.slot}` : ''} (free, step ${steps.length + 1})`; }
    else if (w.c.boardAt !== undefined) slateFrom[w.c.boardAt] = `buy: a listing the market read at ${Math.round(w.c.costFE)} FE (step ${steps.length + 1})`;
    s = { ...s, loadout: w.e.loadout }; spent += w.c.costFE; taken.add(w.c.key); if (w.c.group) taken.add(w.c.group);
    steps.push({ label: w.c.label, costFE: w.c.costFE, totalFE: spent, figure: w.e.figure, ...(w.c.note ? { note: w.c.note } : {}) });
    f = w.e.figure;
    lap(`step ${steps.length + 1} chosen`);
    console.log(`step ${steps.length}: ${w.c.label.slice(0, 120)} | ${w.c.costFE} FE (total ${spent}) -> ${f.kill.toExponential(3)}/s`);
    onStep?.(out(true));
    save();
    // the build changed: new moves (a socket's new neighbours, a slot's new item) are priced, the rest keep their stale score
    if (w.c.kind === 'slate') await weakest();
    if (w.c.key.startsWith('skill|')) await weakSkills();
    const seen = new Set(cands.map((c) => c.key)), next = candidates(s, ctx, o, lines, keep).filter(fitsFE);
    for (const c of next) { const b = seen.has(c.key) ? undefined : boundOf(c, cands); if (b !== undefined) { score.set(c.key, b); seen.add(c.key); } }
    await Promise.all(next.filter((c) => !seen.has(c.key)).map(rate));
    cands = next;
  }
  const r = out(false);
  if (f.kill < o.goal) r.startNotes!.push(`The goal is not reached: the plan ends at ${f.kill.toExponential(2)} per second; nothing left that the model can price raises it.`);
  return r;
}
