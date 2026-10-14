/** Talent, core-talent and inverse-image candidates. All reconfigurations (acquisition false, 0 FE). Rules: docs/talent-rules.md. */
import type { Change, Generator, Move } from '../types';
import { allTrees, coreSet, isGodTree, legalAllocation, nodeRow, pointsAtLevel, pointsOutsideObserved, treeCores, treeNodes, treeOf } from '../talentRules';

type Pts = Record<number, number>;

const byTree = (t: Pts) => {
  const out = new Map<number, Pts>();
  for (const [k, p] of Object.entries(t)) if (p > 0) { const tr = treeOf(+k); out.set(tr, { ...out.get(tr), [+k]: p }); }
  return out;
};
const sum = (t: Pts) => Object.values(t).reduce((a, b) => a + b, 0);
/** every tree legal and every held core unlocked by the points in its tree */
function legalAll(t: Pts, cores: number[]): boolean {
  const trees = byTree(t);
  for (const [tr, p] of trees) if (!legalAllocation(tr, p)) return false;
  return cores.every(c => sum(trees.get(treeOf(c)) ?? {}) >= nodeRow(c)!.need);
}
/** fill `tree` with `total` points in node order (rows ascend with id), legal at every step */
function fill(tree: number, total: number): Pts {
  const pts: Pts = {};
  for (let left = total, moved = true; left > 0 && moved;) {
    moved = false;
    for (const n of treeNodes(tree)) {
      const give = Math.min(n.max - (pts[n.id] ?? 0), left);
      if (give > 0 && legalAllocation(tree, { ...pts, [n.id]: (pts[n.id] ?? 0) + give })) { pts[n.id] = (pts[n.id] ?? 0) + give; left -= give; moved = true; }
    }
  }
  return pts;
}
const setPts = (node: number, points: number): Change => ({ kind: 'talent', node, points });

export const talentMoves: Generator = (s, ctx) => {
  const l = s.loadout as { talents?: Pts; coreTalents?: number[] };
  const talents: Pts = Object.fromEntries(Object.entries(l.talents ?? {}).map(([k, v]) => [+k, v]));
  const cores = l.coreTalents ?? [];
  const budget = pointsAtLevel(ctx.level), spent = sum(talents);
  const out: Move[] = [];
  const push = (label: string, changes: Change[], next: Pts, nextCores: number[], enabler = false) => {
    if (legalAll(next, nextCores)) out.push({ kind: changes.some(c => c.kind === 'core') && !changes.some(c => c.kind === 'talent') ? 'core' : 'talent', label, acquisition: false, costFE: 0, minLevel: 1, changes, ...(enabler ? { enabler } : {}) });
  };
  const used = [...byTree(talents).keys()];

  // points: add one, remove one, shift one (budget full)
  const nodes = used.flatMap(treeNodes);
  const adds = nodes.filter(n => (talents[n.id] ?? 0) < n.max);
  const has = nodes.filter(n => (talents[n.id] ?? 0) > 0);
  const inc = (id: number, d: number) => ({ ...talents, [id]: (talents[id] ?? 0) + d });
  if (spent < budget) for (const n of adds) push(`Talent ${n.id} +1 point`, [setPts(n.id, (talents[n.id] ?? 0) + 1)], inc(n.id, 1), cores);
  for (const a of has) {
    push(`Talent ${a.id} -1 point`, [setPts(a.id, talents[a.id] - 1)], inc(a.id, -1), cores);
    if (spent >= budget) for (const b of adds) if (b.id !== a.id)
      push(`Move a point from talent ${a.id} to ${b.id}`, [setPts(a.id, talents[a.id] - 1), setPts(b.id, (talents[b.id] ?? 0) + 1)], { ...inc(a.id, -1), [b.id]: (talents[b.id] ?? 0) + 1 }, cores);
  }

  // core talents: add into a free (tree, set), or swap the held one of that set
  for (const t of used) for (const c of treeCores(t)) {
    if (cores.includes(c.id)) continue;
    const held = cores.find(h => treeOf(h) === t && coreSet(h) === coreSet(c.id));
    push(held ? `Swap core talent ${held} for ${c.id}` : `Add core talent ${c.id}`,
      [...(held ? [{ kind: 'core', node: held, action: 'remove' } as Change] : []), { kind: 'core', node: c.id, action: 'add' }],
      talents, [...cores.filter(h => h !== held), c.id], true);
  }

  // tree swap: drop tree T (points and its cores), fill tree U in node order with T's points (the search re-solves points)
  for (const t of used) {
    const tp = byTree(talents).get(t)!, total = sum(tp), gone = cores.filter(c => treeOf(c) === t);
    const rest = Object.fromEntries(Object.entries(talents).filter(([k]) => treeOf(+k) !== t)) as Pts;
    for (const u of allTrees()) {
      if (used.includes(u) || isGodTree(u) !== isGodTree(t)) continue;
      const filled = fill(u, total);
      push(`Swap talent tree ${t} for tree ${u}`,
        [...Object.keys(tp).map(k => setPts(+k, 0)), ...gone.map(c => ({ kind: 'core', node: c, action: 'remove' }) as Change), ...Object.entries(filled).map(([k, p]) => setPts(+k, p))],
        { ...rest, ...filled }, cores.filter(c => !gone.includes(c)), true);
    }
  }

  // inverse images: dps-debug's what-if has no change that places or removes one
  ctx.notSearched.add('inverse images: no dps-debug what-if change kind places an Inverse Image (the talent change keeps an existing one; the item is server-resolved, prisms.md (c)); none generated');
  if (pointsOutsideObserved(ctx.level)) ctx.notSearched.add(`talent points at level ${ctx.level}: no level -> points table exists; the nearest observed value (${budget}) is used, observed only at levels 93-96 (docs/talent-rules.md)`);
  ctx.notSearched.add('tree slot rule is inferred (one god tree k=0 + up to 3 distinct professions, from 9 observed tree sets); a build outside it is not offered');
  ctx.notSearched.add('core talent limits (count per build): not found; one per (tree, set) assumed');
  return out;
};

