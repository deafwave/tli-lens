/**
 * Prism candidates: place an owned, unplaced prism on a free cell, only where the documented server rules fully determine
 * the result AND dps-debug's `prism add` change can express it. Rules and sources: docs/prism-rules.md.
 * Everything else goes to ctx.notSearched with its reason.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Change, Generator, Move, OwnedItem, State } from '../types';

type Rows<T> = Record<string, T>;
interface Catalog {
  modifier: Rows<{ bindings?: string[] }>;
  rolls: Rows<number[][]>;
  /** config_talent: i4 kind (1 micro, 2 core, 3 medium/legendary), i18 type (1 micro, 48 medium, 82 legendary), a40 [col,row] */
  talent: Rows<{ i4: number; i18: number; a40: [number, number] }>;
}

/** The pin root: DPS_DEBUG_PIN, else the nearest `dps-debug/.worktrees/guide-pin` beside an ancestor of this file. */
export function pinRoot(): string {
  if (process.env.DPS_DEBUG_PIN) return process.env.DPS_DEBUG_PIN;
  for (let d = dirname(fileURLToPath(import.meta.url)); dirname(d) !== d; d = dirname(d)) {
    const p = join(d, 'dps-debug', '.worktrees', 'guide-pin');
    if (existsSync(p)) return p;
  }
  throw new Error('prisms: the dps-debug pin was not found (set DPS_DEBUG_PIN)');
}

let cat: Catalog | undefined;
export function catalog(): Catalog {
  if (cat) return cat;
  const base = join(pinRoot(), 'catalog'), dir = join(base, readdirSync(base).filter(n => n.startsWith('0x'))[0]);
  const rows = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8')).rows;
  return (cat = { modifier: rows('config_modifier.json'), rolls: rows('config_modifier_rolls.json'), talent: rows('config_talent.json') });
}

/** config_prism_influence_shape (re/evidence/prisms.md (b)): cell offsets [dx (col), dy (row)] relative to the prism, own cell added. Ids 6, 7 are not documented. */
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const box = (x: [number, number], y: [number, number]) => range(...x).flatMap(dx => range(...y).map(dy => [dx, dy] as [number, number]));
const SHAPES: Record<number, [number, number][]> = {
  1: box([-1, 1], [-1, 1]), 2: box([-1, 2], [-1, 1]), 3: box([-1, 1], [-1, 2]),
  4: [[0, 0], [0, 1], [1, 1], [1, 0]], 5: [[0, 0], ...[1, 2, 3].flatMap(k => [[0, k], [0, -k]] as [number, number][])], 8: [[0, 0]],
};
const MEDIUM_TYPE = 48;   // config_talent +0x18; the server's talent-type 11 (prisms.md (a))

export interface PrismPlan { shape: number; ext: { modifierId: number; dyn: number[] }[] }
export type Plan = PrismPlan | { skip: string };

/** What a prism item's modifiers resolve to, or the first reason it does not (never a guess). */
export function planPrism(item: Pick<OwnedItem, 'modifiers'>, c: Catalog = catalog()): Plan {
  let shape: number | undefined;
  const ext: PrismPlan['ext'] = [];
  for (const m of Object.values(item.modifiers).flat()) {
    const b = c.modifier[m.id]?.bindings?.[0] ?? '';   // b[0] only: the second string of a row belongs to the next row (prisms.md (d))
    const x = /^_mt4\d_(\d+)(?:_(\d+))?(?:_(\d+))?/.exec(b);
    if (!x) return { skip: `modifier ${m.id} is not a prism server affix` };
    const [, aff, p1, p2] = x;
    if (aff === '10007') {
      if (p1 !== '11') return { skip: `server affix 10007 on talent type ${p1} (${m.id}): only type 11 (Medium Talent) is confirmed (prisms.md (a))` };
      const mod = Number(p2), r = c.rolls[mod] ?? [];
      if (!r.length || r.some(([lo, hi]) => lo !== hi)) return { skip: `modifier ${mod} granted by ${m.id} has a rolled value; the ExtAffix DynArgs are not known` };
      ext.push({ modifierId: mod, dyn: r.map(([lo]) => lo) });
    } else if (aff === '10008') {
      if (shape !== undefined) return { skip: 'two server affixes 10008 (area expansions); their combination is not documented' };
      shape = Number(p1);
      if (!SHAPES[shape]) return { skip: `area shape ${shape} (${m.id}): config_prism_influence_shape offsets are not documented` };
    } else if (aff === '10009' || aff === '10025') continue;   // server-side mechanics with no attribute task (prisms.md, "Extra grants")
    else if (aff === '10004') return { skip: `server affix 10004 (${m.id}) grants a prism-wide ExtraAffix on the tree; dps-debug's what-if has no change for prisms.provide` };
    else if (aff === '10005') return { skip: `server affix 10005 (${m.id}) adds Points to nodes in the area; its cap/stacking rule is not documented` };
    else return { skip: `server affix ${aff} (${m.id}) has no documented resolution` };
  }
  if (!ext.length) return { skip: 'no 10007 affix: nothing the what-if can express' };
  // a prism without 10008 keeps its base area; the base InfluenceId is not in OwnedItem, so that case is not generated
  if (shape === undefined) return { skip: 'no 10008 affix: the base area (item InfluenceId) is not in the export' };
  return { shape, ext };
}

/** Medium-talent nodes (ids) of `tree` inside the prism area at `cell` for `shape`. */
export function areaMediums(tree: number, cell: [number, number], shape: number, c: Catalog = catalog()): number[] {
  const cells = new Set(SHAPES[shape].map(([dx, dy]) => `${cell[0] + dx},${cell[1] + dy}`));
  return Object.entries(c.talent)
    .filter(([id, r]) => Math.floor(Number(id) / 1e6) === tree && r.i18 === MEDIUM_TYPE && cells.has(r.a40.join(',')))
    .map(([id]) => Number(id)).sort((a, b) => a - b);
}

/** The what-if changes that place the planned prism on `cell` (a node id). */
export function placeChanges(plan: PrismPlan, cell: number, c: Catalog = catalog()): Change[] {
  return areaMediums(Math.floor(cell / 1e6), c.talent[cell].a40, plan.shape, c)
    .flatMap(node => plan.ext.map(e => ({ kind: 'prism', action: 'add', node, modifierId: e.modifierId, dyn: e.dyn }) as Change));
}

type Placed = Record<string, { geniusId?: number; item?: { Id?: string } }>;
const pointOf = (l: State['loadout'], id: number): number => {
  const rt = (l.resolvedTalents as { talents: [number, number, string][] } | undefined)?.talents;
  if (rt) return rt.find(([i, , tag]) => i === id && !tag.startsWith('talent:-'))?.[1] ?? 0;
  return (l.talents as Record<string, number> | undefined)?.[id] ?? 0;
};

export const prismMoves: Generator = (s, ctx) => {
  const ns = ctx.notSearched;
  ns.add('prism: buying a prism (acquisition): the rolled values and base shape of an unowned prism are not known before purchase, so its resolution cannot be derived from the rules');
  ns.add('prism: moving a placed prism: the Point of the vacated and of the target cell on removal/placement is not documented');
  ns.add('prism: Inverse Image mirror copies (10026): dps-debug has no change that adds a "-<id>" mapping entry');
  ns.add('prism: cell legality is not documented; cells offered are the node kinds the owner has placed prisms on (micro, legendary medium; never a core) with no allocated Point');
  const prisms = s.loadout.prisms as { provide?: Record<string, unknown>; placed?: Placed } | undefined;
  if (!prisms?.provide) { ns.add('prism: the loadout has no prisms section'); return []; }
  const placed = prisms.placed ?? {}, placedIds = new Set(Object.values(placed).map(p => p.item?.Id));
  const free = Object.keys(prisms.provide).map(Number).filter(t => !placed[t] || !Object.keys(placed[t]).length);
  const c = catalog(), moves: Move[] = [];
  for (const it of s.owned) {
    if (placedIds.has(it.itemId)) continue;
    if (!Object.values(it.modifiers).flat().some(m => /^_mt4\d_100\d\d/.test(c.modifier[m.id]?.bindings?.[0] ?? ''))) continue;   // not a prism
    const plan = planPrism(it, c);
    if ('skip' in plan) { ns.add(`prism: owned ${it.baseName ?? it.baseId}: ${plan.skip}`); continue; }
    for (const tree of free) {
      const seen = new Set<string>();
      for (const [id, r] of Object.entries(c.talent)) {
        if (Math.floor(Number(id) / 1e6) !== tree || r.i4 === 2 || (r.i18 !== 1 && r.i18 !== 82) || pointOf(s.loadout, Number(id))) continue;
        const changes = placeChanges(plan, Number(id), c), key = JSON.stringify(changes);
        if (!changes.length || seen.has(key)) continue;   // same hosts = same figure
        seen.add(key);
        const hosts = [...new Set(changes.map(x => (x as { node: number }).node))];
        moves.push({ kind: 'prism', acquisition: false, costFE: 0, minLevel: 0, changes, consumes: it.itemId,
          label: `Place prism ${it.baseName ?? it.baseId} on node ${id} in tree ${tree} (medium nodes ${hosts.join(', ')})` });
      }
    }
  }
  return moves;
};
