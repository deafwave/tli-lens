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

/** Talent points at a hero level. UNSOURCED beyond the owner's 108 points at player level 93 (LADDER.md L13e);
 *  below 93 the tli-lens Bing guide's prior 107*(L-1)/99 (assumed). See docs/talent-rules.md. */
export function pointsAtLevel(level: number): number {
  return level >= 93 ? 108 : Math.round(107 * (level - 1) / 99);
}

/** Trees allowed per slot. 4 slots (every loadout in game/ holds 4 trees); no per-slot restriction is in the catalog,
 *  so every hero tree is allowed in every slot (inferred; restriction rule not found: reported in notSearched). */
export function treeSlotsAllowed(_heroId: number): number[][] {
  return [0, 1, 2, 3].map(() => [...load().trees]);
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
