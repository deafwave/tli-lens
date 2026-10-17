import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEvaluator } from '../src/engine/pool';
import { places, type Listing } from '../src/listing';
import { pinRoot } from '../src/pin';
import { ctxOfState } from '../src/search';
import { fromExport } from '../src/start';
import type { State } from '../src/types';
import { realSkip } from './real';

const aff = (id: number, list: string, dyn = [1]) => ({ id, tier: 1, text: '', dyn, list });
const listing = (o: Partial<Listing>): Listing => ({ n: 1, price: 10, priceType: 100300, baseId: 4639, level: 86, type: 1, affixes: [], ...o });
const memory = (slot: number, baseId: number, id: number) => ({ label: 'm', slot, baseId, itemId: `m${slot}`, awakenBaseAttrBoost: 0, defaultSlotAffixBoost: null, affixes: [{ id, dyn: [1], list: 'SuffixInfoList' }] });
const state = { skill: 'hoa', level: 90, fe: 0, owned: [], loadout: {
  gear: [], vorax: [{ label: 'Vorax Limb: Digits', slot: 'ring1', baseId: 380009, affixes: [] }],
  heroMemories: [memory(1, 71001, 11), { label: 'awaken', slot: 1, affixes: [{ id: 5, dyn: [2], text: 'awaken' }] }, memory(3, 71003, 33), { label: 'awaken', slot: 3, affixes: [{ id: 6, dyn: [3], text: 'awaken' }] }] } } as unknown as State;

describe('a listing on your character (places)', () => {
  it("gear: every list the reader reads goes in, under the what-if's keys (a ring's implicit is FixedBaseAffix: it was left out), Enchant last as chip", () => {
    const ps = places(listing({ affixes: [aff(1, 'FixedBaseAffix'), aff(2, 'PrefixInfoList'), aff(3, 'ChipAffixList'), aff(4, 'EnchantAffixList')] }), state);
    expect(Array.isArray(ps) && ps.map((p) => p.slot)).toEqual(['ring1', 'ring2']);
    const mods = (ps as { change: { item: { modifiers: Record<string, { id: number }[]> } } }[])[0].change.item.modifiers;
    expect(Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, v.map((a) => a.id)]))).toEqual({ fixed: [1], prefix: [2], chip: [3, 4] });
  });
  it('a hero memory goes in place of yours of its kind with its awaken affixes; the others stay, in order', () => {
    const ps = places(listing({ baseId: 71003, type: 34, affixes: [aff(99, 'SuffixInfoList')], awaken: { boost: 30, affixes: [aff(7, 'AwakenAffix', [4])] } }), state);
    const items = (ps as unknown as { slot: string; change: { op: string; items: { label: string; slot: number; affixes: { id: number }[]; awakenBaseAttrBoost?: number }[] } }[])[0];
    expect(items.slot).toBe('memory 3');
    expect(items.change.op).toBe('memories');
    expect(items.change.items.map((m) => [m.label === 'awaken' ? 'awaken' : 'memory', m.slot, m.affixes.map((a) => a.id)])).toEqual([
      ['memory', 1, [11]], ['awaken', 1, [5]], ['memory', 3, [99]], ['awaken', 3, [7]]]);
    expect(items.change.items[2].awakenBaseAttrBoost).toBe(30);
    expect(places(listing({ baseId: 71002, type: 34, awaken: { boost: 0, affixes: [] } }), state)).toMatch(/no Memory of Discipline/);
  });
  it("a vorax limb goes in its slot type's slots, in place of the limb or gear there", () => {
    const ps = places(listing({ baseId: 380009, type: 41, affixes: [aff(8, 'PrefixInfoList')] }), state) as unknown as { slot: string; change: { op: string; items: { slot: string; affixes: { id: number }[] }[] } }[];
    expect(ps.map((p) => p.slot)).toEqual(['ring1', 'ring2']);
    expect(ps[0].change.items.map((v) => [v.slot, v.affixes.map((a) => a.id)])).toEqual([['ring1', [8]]]);
    expect(ps[1].change.items.map((v) => v.slot)).toEqual(['ring1', 'ring2']);
  });
});

// the owner's newest read (dps-debug game/exports): every piece you wear, as the market reader reads a listing, prices at exactly your figure
const exports = resolve(pinRoot(), '../../game/exports'), newest = existsSync(exports) ? readdirSync(exports).sort().reverse().map((d) => resolve(exports, d, `export-${d}.json`)).find(existsSync) : undefined;
const skip = realSkip() ?? (newest ? undefined : `no read in ${exports}`);
describe('your worn pieces as listings (real workers)', () => {
  it.skipIf(!!skip)('price at +0 exactly in their own slot: gear, vorax limb, hero memories', async () => {
    const s = { ...fromExport(JSON.parse(readFileSync(newest!, 'utf8')), 0), target: 'traveler' }, ctx = ctxOfState(s);
    type It = { label: string; slot: string | number; baseId: number; level?: number; affixes: { id: number; dyn: number[]; list: string }[]; awakenBaseAttrBoost?: number };
    const lo = s.loadout as unknown as { gear: It[]; vorax: It[]; heroMemories: It[] };
    const of = (it: It, type: number): Listing => listing({ baseId: it.baseId, level: it.level ?? 1, type, affixes: it.affixes.map((a) => aff(a.id, a.list, a.dyn)),
      ...(type === 34 ? { awaken: { boost: it.awakenBaseAttrBoost!, affixes: lo.heroMemories.filter((m) => m.label === 'awaken' && m.slot === it.slot).flatMap((m) => m.affixes.map((a) => aff(a.id, 'AwakenAffix', a.dyn))) } } : {}) });
    const worn = [...lo.gear.map((g) => [g, of(g, 1)] as const), ...lo.vorax.map((g) => [g, of(g, 41)] as const),
      ...lo.heroMemories.filter((m) => m.label !== 'awaken').map((m) => [m, of(m, 34)] as const)];
    const ev = await createEvaluator({ workers: 6 });
    try {
      const base = (await ev.run(s.loadout, [], ctx)).figure;
      const got = await Promise.all(worn.map(async ([it, l]) => {
        const p = (places(l, s) as { slot: string; change: never }[]).find((x) => x.slot === String(it.slot) || x.slot === `memory ${it.slot}`)!;
        const f = (await ev.run(s.loadout, [p.change], ctx)).figure;
        return `${it.label} ${p.slot}: ${f.stop ?? `${f.life100 === base.life100 && f.life0 === base.life0 ? 'equal' : `${f.life100} vs ${base.life100}`}`}`;
      }));
      expect(got).toEqual(worn.map(([it]) => `${it.label} ${typeof it.slot === 'number' ? `memory ${it.slot}` : it.slot}: equal`));
    } finally { await ev.close(); }
  }, 600_000);
});
