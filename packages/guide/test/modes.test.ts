import { describe, expect, it } from 'vitest';
import { basesFor, slotsOfBase } from '../src/candidates/gear';
import { ownedGear, runAdvise, runIdeal } from '../src/modes';
import { fromExport, idealStart, ICE_SHOT_INPUTS } from '../src/start';
import { pointsAtLevel } from '../src/talentRules';
import type { Evaluator } from '../src/types';
import { parseAdvice, renderGuide } from '../../page/src/guide-view';

/** stub: every applied change adds 10 to the kill average; `stop` makes every figure refuse */
const stubEv = (stop?: string): Evaluator => ({
  pin: 'stub', async close() {},
  async run(lo, changes) {
    const n = ((lo as { __n?: number }).__n ?? 0) + changes.length, k = 100 + 10 * n;
    return { loadout: { ...lo, __n: n }, dropped: [], inputs: { ground: 'stub-ground', elites: 0 },
      figure: stop ? { life100: 0, life0: 0, kill: 0, partial: [], stop } : { life100: k, life0: k, kill: k, partial: [] } };
  },
});
const small = { stepsPerStage: 1, endLevel: 65, topK: 2, maxRounds: 1, unpricedEval: 3 };

const helmet = basesFor('helmet', 60, 'iceShot').at(-1)!, ring = basesFor('ring1', 60, 'iceShot').at(-1)!;
const item = (itemId: string, where: string, base: { baseId: number; name: string; level: number }) =>
  ({ itemId, baseId: base.baseId, baseName: base.name, level: base.level, where, page: 1, slot: 3, count: 1, modifiers: { prefix: [] } });
const exportOf = (o: Record<string, unknown> = {}) => ({
  schema: 'tli-lens-export/1', hero: { id: 4001, level: 60 }, loadout: idealStart().loadout, fe: 1000, fe_source: 'sum', fe_bound: 0,
  items: [item('eq-1', 'equipped', helmet), item('bag-1', 'bag', helmet), item('stash-1', 'stash', ring),
    { ...item('fe', 'bag', helmet), baseId: 100300, baseName: 'Flame Elementium', count: 1000 }], ...o });

describe('idealStart', () => {
  const s = idealStart();
  it('is level 60, Ice Shot, with only a bow-family white base and no affixes', () => {
    expect(s.level).toBe(60); expect(s.skill).toBe('iceShot');
    const gear = s.loadout.gear as { slot: string; baseId: number; affixes: { list: string }[]; market: string }[];
    expect(gear.map((g) => g.slot)).toEqual(['mainHand']);
    expect(slotsOfBase(gear[0].baseId, 'iceShot').slots).toEqual(['mainHand']);
    expect(gear[0].market).toBe('drop');
    expect(gear[0].affixes.every((a) => a.list === 'BaseAttrInfoList')).toBe(true);
  });
  it('strips slates, pacts, kismets, prisms and seeds the level-60 talent budget', () => {
    const l = s.loadout as Record<string, any>;
    expect([l.slateItems, l.pacts, l.kismets, l.vorax, l.coreTalents, l.prismEntries].every((x) => x.length === 0)).toBe(true);
    expect(Object.values(l.prisms.placed).every((p) => Object.keys(p as object).length === 0)).toBe(true);
    expect(Object.values(l.talents as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(pointsAtLevel(60));
    expect(Object.keys(l.traits)).toEqual(['810001', '810011', '810021', '810032']);
  });
});

describe('fromExport', () => {
  it('equipped items stay in the loadout; others are owned; FE items are not items', () => {
    const s = fromExport(exportOf());
    expect(s.owned.map((o) => o.itemId)).toEqual(['bag-1', 'stash-1']);
    expect(s).toMatchObject({ fe: 1000, level: 60, skill: 'iceShot' });
  });
  it('a typed fe wins; a missing fe stops with the message', () => {
    expect(fromExport(exportOf(), 55).fe).toBe(55);
    expect(() => fromExport(exportOf({ fe: undefined }))).toThrow('export has no fe; pass --fe N');
    expect(fromExport(exportOf({ fe: undefined }), 7).fe).toBe(7);
  });
  it('rejects another schema', () => expect(() => fromExport(exportOf({ schema: 'x' }))).toThrow(/tli-lens export/));
});

describe('owned items as moves', () => {
  const state = fromExport(exportOf());
  const ctx = { prices: { season: 's', fetchedAt: 'x', price: () => null }, level: 60, notSearched: new Set<string>() };
  it('each owned gear item costs 0 FE and consumes itself, per slot it fits', () => {
    const ms = ownedGear(state, ctx);
    expect(ms.filter((m) => m.consumes === 'bag-1')).toHaveLength(1);
    expect(ms.filter((m) => m.consumes === 'stash-1')).toHaveLength(2);   // ring1, ring2
    expect(ms.every((m) => m.costFE === 0 && m.acquisition)).toBe(true);
  });
  it('an owned item is worn once: free first, then never offered again', async () => {
    const out = await runAdvise(stubEv(), state, { maxRounds: 1, topK: 2, maxSteps: 4 });
    const used = out.steps.map((s) => s.move).filter((m) => m.consumes);
    expect(used.length).toBeGreaterThan(0);
    expect(new Set(used.map((m) => m.consumes)).size).toBe(used.length);   // none twice
    expect(out.steps[0].move.costFE).toBe(0);
    expect(out.mode).toBe('advise'); expect(out.pin).toBe('stub');
    parseAdvice(JSON.stringify(out));
  });
});

describe('runIdeal', () => {
  it('writes an ideal GuideOut with pin, season, knobs, start notes and stated inputs', async () => {
    const out = await runIdeal(stubEv(), small);
    expect(out).toMatchObject({ mode: 'ideal', pin: 'stub', etor: { season: 'SS13' }, knobs: { stepsPerStage: 1, topK: 2, churn: 0.05, talentPoints: 108 } });
    expect(out.startNotes!.length).toBeGreaterThan(8);
    expect(out.inputs).toMatchObject({ ground: 'stub-ground', iceShot: ICE_SHOT_INPUTS });
    expect(out.steps.length).toBeGreaterThan(0);
    expect(out.steps.every((s) => s.level >= 60 && s.level <= 65 && s.notes!.includes('talent points assumed'))).toBe(true);
    expect(parseAdvice(JSON.stringify({ ...out, mode: 'advise' })).steps).toHaveLength(out.steps.length);
    expect(renderGuide(out as never)).toContain('stub');
  });
  it('a start figure that stopped says so plainly and does not crash', async () => {
    const out = await runIdeal(stubEv('not ported: Ice Shot build entry'), small);
    expect(out.steps).toEqual([]);
    expect(out.start.stop).toMatch(/not ported/);
    expect(out.notCalculable[0]).toMatch(/cannot be priced yet: not ported: Ice Shot build entry/);
    expect(out.startNotes!.at(-1)).toMatch(/cannot be priced yet/);
    expect(renderGuide(out as never)).toContain('stopped');
  });
});

describe('advise on a stopped start', () => {
  it('reports it as not calculable', async () => {
    const out = await runAdvise(stubEv('not ported: x'), fromExport(exportOf()));
    expect(out.steps).toEqual([]);
    expect(out.notCalculable[0]).toMatch(/cannot be priced yet/);
  });
});
