/**
 * Target pro-build pieces as candidates (spec 3.2 "Reachability"): the ideal start strips pacts, kismets, slates and memories and nothing else
 * re-acquires them, so every piece of the 40T Hammer of Ash target (pin re/evidence/loadout_probuild-hanshansi-bing.json) not already held is offered
 * as one enabler acquisition that installs exactly that piece. Hammer of Ash only.
 * Not offered, each named in ctx.notSearched: slates (the target data carries the influence arrays but no shape or board slot, which `slate place` needs),
 * hero memories and vorax (no what-if form), prisms (the target holds none), Undetermined Fates (the target holds none).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinRoot, table } from '../pin';
import { priceOfBase, priceOfGold } from '../priceOf';
import { slotsOfBase } from './gear';
import type { Change, Generator, Move } from '../types';

type Aff = { id: number; dyn: number[] };
interface TGear { label: string; affixes: Aff[] }
interface Target { gear: TGear[]; pacts: { servantId: number; rank: number; promotionLevels: number[][]; slot: number }[];
  kismets: { modifierId: number | null; servantId: number; node: number; rolls: number[] }[]; contractKeys: number[]; heroMemories: unknown[]; vorax: unknown[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = (f: string): Record<string, any> => table<{ rows: Record<string, any> }>(f).rows;
let target: Target | undefined;
const loadTarget = (): Target => target ??= JSON.parse(readFileSync(join(pinRoot(), 're/evidence/loadout_probuild-hanshansi-bing.json'), 'utf8'));

/** affix tier id -> 'prefix' | 'suffix' from the craft library; the target file carries no list names */
let sides: Map<number, string> | undefined;
function sideOf(id: number): string | undefined {
  if (!sides) {
    sides = new Map();
    const lib = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../data/affix_library.json', import.meta.url)), 'utf8')).affixes as { side: string; tiers: { tierAffixId: string }[] }[];
    for (const a of lib) for (const t of a.tiers) sides.set(Number(t.tierAffixId), a.side.toLowerCase());
  }
  return sides.get(id);
}

/** the catalog base a target item is on: name match whose base attributes the item carries (dps-debug loadout.ts baseOfGear) */
function baseOf(it: TGear): number | null {
  const base = rows('config_item_base'), lang = rows('lang_en'), have = new Set(it.affixes.map(a => a.id));
  const ok = Object.keys(base).filter(k => lang[`item_base|name|${k}`] === it.label && (base[k].a1b8 ?? []).every((m: number) => have.has(m)));
  const best = Math.max(...ok.map(k => base[k].a1b8.length));
  const top = ok.filter(k => base[k].a1b8.length === best);
  return top.length === 1 ? Number(top[0]) : null;
}

const sig = (a: Aff[]) => JSON.stringify(a.map(x => [x.id, x.dyn]).sort());

export const targetMoves: Generator = (s, ctx) => {
  if (s.skill !== 'hoa') return [];
  const ns = ctx.notSearched, t = loadTarget(), l = s.loadout as Record<string, any>, moves: Move[] = [];   // eslint-disable-line @typescript-eslint/no-explicit-any
  ns.add("target slates: the target data holds each slate's talents and influence arrays but no shape or board slot, which `slate place` needs; none generated");
  if (t.heroMemories.length) ns.add('target hero memories: dps-debug has no what-if change for them; not offered');
  if (t.vorax.length) ns.add('target vorax limbs: dps-debug has no what-if change for them; not offered');
  const mk = (m: Omit<Move, 'acquisition' | 'enabler' | 'minLevel'> & { minLevel?: number }): Move => ({ acquisition: true, enabler: true, minLevel: 0, ...m });

  // gear: the slot the state already wears an item of that type in
  const held = new Map<string, Aff[]>((l.gear ?? []).map((g: { slot: string; affixes: Aff[] }) => [g.slot, g.affixes]));
  const gold = rows('config_item_gold'), lang = rows('lang_en'), base = rows('config_item_base');
  for (const it of t.gear) {
    const baseId = baseOf(it);
    if (baseId === null) { ns.add(`target gear "${it.label}": no single catalog base matches its name and base attributes; not offered`); continue; }
    const { slots, level } = slotsOfBase(baseId, s.skill);
    const slot = slots.find(x => held.has(x)) ?? slots[0];
    if (!slot) { ns.add(`target gear "${it.label}": base ${baseId} fits no hoa slot; not offered`); continue; }
    if (held.has(slot) && sig(held.get(slot)!) === sig(it.affixes)) continue;
    const attrs = new Set<number>(base[baseId].a1b8 ?? []), modifiers: Record<string, { id: number; dynArgs: number[] }[]> = {};
    for (const a of it.affixes) (modifiers[attrs.has(a.id) ? 'baseAttr' : sideOf(a.id) ?? 'fixed'] ??= []).push({ id: a.id, dynArgs: [...a.dyn] });
    const gid = Object.keys(gold).find(g => gold[g].i8 === baseId && lang[`item_gold|name|${g}`] === it.label);
    const price = gid ? priceOfGold(ctx.prices, Number(gid), ctx.level).fe : priceOfBase(ctx.prices, baseId, ctx.level).fe;
    moves.push(mk({ kind: 'gear', label: `Target: ${it.label} in ${slot}`, costFE: price, minLevel: level,
      changes: [{ kind: 'gear', slot, item: { baseId, baseName: it.label, itemId: `guide-target-${baseId}`, level, modifiers } }] }));
  }

  // pacts: not on the market
  const pacts = (l.pacts ?? []) as { servantId: number; slot?: number; rank: number }[];
  for (const p of t.pacts) {
    if (pacts.some(x => x.servantId === p.servantId && x.slot === p.slot && x.rank === p.rank)) continue;
    const occupant = pacts.find(x => x.slot === p.slot);
    const name = lang[`servant|name|${p.servantId}`] ?? String(p.servantId);
    moves.push(mk({ kind: 'pact', label: `Target: ${name} (rank ${p.rank}) in pact slot ${p.slot}`, costFE: null, market: 'not-on-market',
      changes: [{ kind: 'multi', changes: [...(occupant ? [{ kind: 'pact', action: 'remove', servantId: occupant.servantId } as const] : []),
        { kind: 'pact', action: 'equip', servantId: p.servantId, slot: p.slot, rank: p.rank, promotionLevels: p.promotionLevels, contractKeys: t.contractKeys.filter(k => Math.floor(k / 100) === p.slot) }] }] }));
  }

  // kismets: socketed on the point of their pact's slot, once that pact is held
  const tat = Object.entries(rows('lua_config_item_tattoo'));
  const at = new Map<number, number | null>((l.kismets ?? []).map((k: { node: number; modifierId: number | null }) => [k.node, k.modifierId]));
  for (const k of t.kismets) {
    if (k.modifierId === null) { ns.add('target Undetermined Fate: no catalog base in the target data; not offered'); continue; }
    const slot = t.pacts.find(p => p.servantId === k.servantId)?.slot;
    if (slot === undefined || !pacts.some(p => p.servantId === k.servantId && p.slot === slot)) continue;   // offered once its pact is held
    const point = slot * 100 + k.node;
    if (at.get(point) === k.modifierId) continue;
    const baseId = tat.find(([, r]) => r.Modifier?.[0] === k.modifierId)?.[0];
    const name = baseId ? lang[`item_base|name|${baseId}`] : undefined;
    const change: Change = { kind: 'kismet', action: at.has(point) ? 'replace' : 'socket', point, modifierId: k.modifierId, rolls: k.rolls };
    moves.push(mk({ kind: 'kismet', label: `Target: ${name ?? k.modifierId} on contract point ${point}`, costFE: baseId ? priceOfBase(ctx.prices, Number(baseId), ctx.level).fe : null, changes: [change] }));
  }
  return moves;
};
