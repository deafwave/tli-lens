/** Talent rules from the pinned dps-debug catalog (config_talent.r2). Sources and confidence: docs/talent-rules.md. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface TalentRow { id: number; kind: number; max: number; need: number; prereq: number[]; row: number }

const pin = process.env.DPS_DEBUG_PIN ?? fileURLToPath(new URL('../../../../dps-debug/.worktrees/guide-pin', import.meta.url));
let cache: { nodes: Map<number, TalentRow>; trees: number[] } | undefined;

function load() {
  if (cache) return cache;
  const raw = JSON.parse(readFileSync(`${pin}/catalog/0x6aa39847/config_talent.r2.json`, 'utf8')).rows as Record<string, any>;
  const nodes = new Map<number, TalentRow>(), trees = new Set<number>();
  for (const r of Object.values(raw)) {
    const tree = Math.floor(r.i0 / 1e6);
    // 8-digit ids of the 30 hero trees (10..64); 6-digit rows are legacy, 80/90/92 are not hero trees
    if (String(r.i0).length !== 8 || tree < 10 || tree > 64) continue;
    nodes.set(r.i0, { id: r.i0, kind: r.i4, max: r.ic, need: r.i10, prereq: (r.a30 as number[]).filter(x => x), row: r.a40[1] });
    trees.add(tree);
  }
  return (cache = { nodes, trees: [...trees].sort((a, b) => a - b) });
}

export const treeOf = (node: number) => Math.floor(node / 1e6);
export const treeNodes = (tree: number) => [...load().nodes.values()].filter(n => treeOf(n.id) === tree && n.kind !== 2).sort((a, b) => a.id - b.id);
/** Core talents of a tree: id `{tree}00{set}{n}00`; `need` = points in the tree. */
export const treeCores = (tree: number) => [...load().nodes.values()].filter(n => treeOf(n.id) === tree && n.kind === 2).sort((a, b) => a.id - b.id);
export const coreSet = (core: number) => Math.floor(core / 1e4) % 10;
export const nodeRow = (id: number) => load().nodes.get(id);

/** Observed (player level, talent points spent) pairs: captures/<id>/pre/player.json cfg.level + pre/talents.json (sum of Point, copies excluded).
 *  Spent points are a lower bound on the budget. No level -> points table exists in the catalog or the Lua walks (re/lua strings hold type names only). */
export const POINT_OBSERVATIONS = [
  { level: 93, points: 108, capture: 'L100.state-20261013-165251' },
  { level: 96, points: 108, capture: 'OTHERCHAR-L105.state-20261013-210519' },
] as const;

/** Exact at an observed level; between observed levels the lower bounding value; outside the range the nearest observed value (an assumption). */
export function pointsAtLevel(level: number): number {
  const o = POINT_OBSERVATIONS;
  const exact = o.find(x => x.level === level);
  if (exact) return exact.points;
  const lo = o.filter(x => x.level < level).at(-1), hi = o.find(x => x.level > level);
  if (lo && hi) return Math.min(lo.points, hi.points);
  return (lo ?? hi)!.points;
}
export const pointsOutsideObserved = (level: number) => level < POINT_OBSERVATIONS[0].level || level > POINT_OBSERVATIONS.at(-1)!.level;

/** Tree id = family*10 + k; k = 0 is a God/Goddess tree, k != 0 a profession. Inferred from 9 distinct tree sets over 181 loadouts/captures
 *  (no counter-example, docs/talent-rules.md): at most one god tree plus up to three distinct professions of any family. */
export const isGodTree = (tree: number) => tree % 10 === 0;
/** Slots 0..3 = [god, profession, profession, profession]. Slots 2 (tree 51) and 3 (tree 12) are professions (prisms.md:69); whether the god
 *  tree sits in slot 0 or 1 is not recorded, the order here is a label only. */
export function treeSlotsAllowed(_heroId: number): number[][] {
  const t = load().trees;
  return [t.filter(isGodTree), t.filter(x => !isGodTree(x)), t.filter(x => !isGodTree(x)), t.filter(x => !isGodTree(x))];
}

export const allTrees = () => [...load().trees];

/** Points of one tree: node -> points. Legal = within max, prerequisites at max, and the node's row threshold met by the points in earlier rows. */
export function legalAllocation(tree: number, points: Record<number, number>): boolean {
  const { nodes } = load();
  const rowPts = (row: number) => Object.entries(points).reduce((s, [id, p]) => s + (nodes.get(+id)!.row < row ? p : 0), 0);
  for (const [k, p] of Object.entries(points)) {
    const n = nodes.get(+k);
    if (!n || n.kind === 2 || treeOf(n.id) !== tree || p < 0 || p > n.max) return false;
    if (p > 0 && (n.prereq.some(q => (points[q] ?? 0) < nodes.get(q)!.max) || rowPts(n.row) < n.need)) return false;
  }
  return true;
}
