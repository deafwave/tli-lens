import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pinRoot } from '../src/pin';
import { candidates, DEFAULT_PLAN, runPlan } from '../src/plan';
import { applyPatch } from '../src/patches';
import { snapshotBook, withPrices } from '../src/pricing';
import { localItems } from '../src/modes';
import type { Evaluator, State } from '../src/types';

// the owner's live Hammer of Ash character (export 20261016-122806, dps-debug MANA1's fixture)
const live = JSON.parse(readFileSync(join(pinRoot(), 're/evidence/mana1_live.json'), 'utf8'));
const s: State = { loadout: live.loadout, owned: [], fe: 0, level: 90, skill: 'hoa', target: 'traveler' };
const ctx = { prices: snapshotBook(localItems()), level: 90, notSearched: new Set<string>() };
const lines = [{ id: 43040200, name: 'Ranger: chance to gain Agility Blessing on Critical Strike' }, { id: 54070400, name: "Lich: All Skills' Levels" }];

describe('a worn legendary is named by its own name, not its base (owner, 2026-10-16: wearing Boots of Devastation, not its base Old King Sabatons)', () => {
  it('uniqueName resolves the base and modifier groups to the legendary', async () => {
    const { uniqueName } = await import('../src/names');
    const boots = live.loadout.gear.find((g: { slot: string }) => g.slot === 'boots');
    expect(boots.label).toBe("Old King's Sabatons");
    expect(uniqueName(boots.baseId, boots.affixes.map((a: { id: number }) => a.id))).toBe('Boots of Devastation');
  });
});

// the owner's board of 2026-10-18 11:57 with two Sparks of Moth Fire on the Attack Skill Level slate (dps-debug game/slates-sparks-20261018-115710.json: the Lua
// slates read, the server's arrays), on the live character
const sparksLua = JSON.parse(readFileSync(join(pinRoot(), 'game/slates-sparks-20261018-115710.json'), 'utf8'));
const listOf = (x: unknown): number[] => (Array.isArray(x) ? x : []);
type Item = { itemId: string; baseId: number; shapeId: number; link: { SlotId: number }; talents: number[]; influenceId?: number; influence: { TalentIdCopy?: unknown } };
const sparksBoard: Item[] = Object.values(sparksLua.placed as Record<string, { ItemId: string; ConfigBaseId: number; LinkData: { SlotId: number }; TalentDatas: Record<string, never> }>).map((r) => ({
  itemId: r.ItemId, baseId: r.ConfigBaseId, shapeId: r.TalentDatas.ShapeId, direction: r.TalentDatas.Direction, link: r.LinkData, influenceId: r.TalentDatas.InfluenceId,
  talents: [...listOf(r.TalentDatas.BaseTalentList), ...listOf(r.TalentDatas.EnchantTalentList)], influence: sparksLua.InfluceV2Datas[r.ItemId] }));
const sp: State = { ...s, loadout: { ...live.loadout, slateItems: sparksBoard } };
const ASL = 10070100, asl = sparksBoard.findIndex((x) => x.talents.at(-1) === ASL);
const itemsOf = (c: unknown) => (c as { items: Item[] }).items;
const copiesIn = (items: Item[]) => items.filter((x) => x.baseId === 261001 && !x.itemId.startsWith('guide-')).map((x) => listOf(x.influence.TalentIdCopy));

describe('Sparks of Moth Fire copies the last line of the slate on its side: a board holding one is priced where its slates sit (owner, 2026-10-18: two on the Attack Skill Level slate, +20 %)', () => {
  it('a slate change re-resolves what each copies: your Attack Skill Level slate replaced or emptied takes its copies with it', async () => {
    const { replaceSlate, copiedFrom } = await import('../src/candidates/slates');
    expect(copiesIn(sparksBoard)).toEqual([[ASL], [ASL]]);
    expect(copiesIn(itemsOf(replaceSlate(sp, asl, [21020400, 10050400])))).toEqual([[10050400], [10050400]]);
    expect(copiesIn(itemsOf(replaceSlate(sp, asl, [])))).toEqual([[], []]);
    expect(copiedFrom(sparksBoard as never)).toEqual(sparksBoard.map((_, i) => (i === asl ? 2 : 0)));
    // a Sparks has no lines: emptied (what each slate is worth: the listings' screen) it is out, its copies with it
    const one = sparksBoard.findIndex((x) => x.baseId === 261001);
    expect(itemsOf(replaceSlate(sp, one, [])).filter((x) => x.baseId === 261001).map((x) => listOf(x.influence.TalentIdCopy))).toEqual([[ASL]]);
  });
  it('a Sparks listing goes where the slate on its side has a wanted last line (on your full board: in place of a slate), within the cap of 3 a board', () => {
    const want = [{ id: ASL, name: 'God of Might: Attack Skill Level', gain: 1.1 }], keep = sparksBoard.map(() => 0.99);
    const below = { talents: [], price: 460, at: new Date().toISOString(), baseId: 261001, shapeId: 2010, influenceId: 1003 };
    const c = candidates(sp, ctx, { ...DEFAULT_PLAN, slateListings: [below], slateKeep: keep }, want).filter((x) => x.key.startsWith('sparks|'));
    expect(c.length).toBeGreaterThan(0);
    for (const x of c) expect(itemsOf(x.changes[0]).filter((i) => i.baseId === 261001).length).toBeLessThanOrEqual(3);
    // below the cell (3, 4) of slate 24 sits the Attack Skill Level slate (cells (3, 5), (3, 6))
    const best = c.find((x) => /copies God of Might: Attack Skill Level$/.test(x.label))!;
    expect(best.costFE).toBe(460);
    expect(best.label).toMatch(/^Buy the Sparks of Moth Fire listed at 460 FE \(seen .+; Copies the last Talent on the adjacent slate below this slate\..*\) and place it at column 3, row 4, in place of your slate \d \(/);
    expect(itemsOf(best.changes[0]).find((i) => i.itemId.startsWith('guide-'))).toMatchObject({ baseId: 261001, link: { SlotId: 34 }, influenceId: 1003, influence: { TalentIdCopy: [ASL] } });
  });
  it('with no listing read, a single-sided Sparks of each side at your price for its name (owner, 2026-10-18: "Single-sided Sparks are approximately 500 FE"); a listing read for a side replaces it', () => {
    const want = [{ id: ASL, name: 'God of Might: Attack Skill Level', gain: 1.1 }], keep = sparksBoard.map(() => 0.99);
    const mine = { ...ctx, prices: withPrices(ctx.prices, { 'Sparks of Moth Fire': 500 }).book };
    const c = candidates(sp, mine, { ...DEFAULT_PLAN, slateKeep: keep }, want).filter((x) => x.key.startsWith('sparks|'));
    const below = c.find((x) => /below this slate.*column 3, row 4.*copies God of Might: Attack Skill Level$/.test(x.label))!;
    expect(below.costFE).toBe(500);
    expect(below.label).toMatch(/^Buy a Sparks of Moth Fire that rolled: Copies the last Talent on the adjacent slate below this slate\..* \(about 500 FE: your price\) and place it at column 3, row 4/);
    expect(candidates(sp, ctx, { ...DEFAULT_PLAN, slateKeep: keep }, want).filter((x) => x.key.startsWith('sparks|'))).toEqual([]);   // no price, no listing: none
    const listed = { talents: [], price: 460, at: new Date().toISOString(), baseId: 261001, shapeId: 2010, influenceId: 1003 };
    const both = candidates(sp, mine, { ...DEFAULT_PLAN, slateListings: [listed], slateKeep: keep }, want).filter((x) => x.key.startsWith('sparks|') && /below this slate/.test(x.label));
    expect(both.map((x) => x.costFE)).toEqual(both.map(() => 460));
  });
  it('a listing in place of a slate a Sparks copies screens its last line once more per copy', async () => {
    const { screenSlate } = await import('../src/candidates/slates');
    const g = (t: number) => ({ 1: 1.1, 2: 1.05 } as Record<number, number>)[t] ?? 1;
    expect(screenSlate([1, 2], g, 0.9, [7], 2)).toBeCloseTo(1.1 * 1.05 ** 3 * 0.9);
  });
  it('with a Sparks on the board no slate is added by re-laying the board out (what it copies hangs on where the slates sit): named; one of your shape in place of yours is', () => {
    const corner = { talents: [43040200], price: 20, at: new Date().toISOString(), baseId: 261003, shapeId: 2020 }, n = { ...ctx, notSearched: new Set<string>() };
    const c = candidates(sp, n, { ...DEFAULT_PLAN, slateListings: [corner], slateKeep: sparksBoard.map(() => 0.99) }, [{ id: 43040200, name: 'x', gain: 1.1 }]);
    expect(c.filter((x) => x.key.endsWith('|add'))).toEqual([]);
    expect([...n.notSearched].some((x) => /Sparks of Moth Fire/.test(x))).toBe(true);
    const own = { ...sp, owned: [{ itemId: 'o', baseId: 261003, baseName: null, level: 86, where: 'stash', page: 0, slot: 1, count: 1, modifiers: {}, talents: [21020400, 10050400], shapeId: 2020 }] };
    const put = candidates(own, ctx, DEFAULT_PLAN, lines).find((x) => x.key === `ownslate|o|${asl}`)!;
    expect(copiesIn(itemsOf(put.changes[0]))).toEqual([[10050400], [10050400]]);
  });
  it('at most 3 Sparks of Moth Fire a board (lua_config_item_talent_block_gold 1001 Limit 3)', async () => {
    const { overCap } = await import('../src/candidates/slates');
    expect(overCap([0, 1, 2].map(() => ({ baseId: 261001 })))).toBe(false);
    expect(overCap([0, 1, 2, 3].map(() => ({ baseId: 261001 })))).toBe(true);
  });
});

describe('packBoard: the board re-laid out by each slate type rule (owner, 2026-10-16)', () => {
  it('every placed slate fits again; the Pedigree only flipped across the vertical axis; a slate too many does not fit', async () => {
    const { packBoard } = await import('../src/candidates/slates');
    const lay = packBoard(live.loadout, 90, []);
    expect(lay).not.toBeNull();
    const ped = live.loadout.slateItems.findIndex((x: { shapeId: number }) => x.shapeId === 2090);
    if (ped >= 0) {   // the packed Pedigree is its cells as they are, or mirrored across the vertical axis, moved
      const { boardView } = await import('../src/candidates/slates');
      const norm = (c: [number, number][]) => { const mx = Math.min(...c.map((p) => p[0])), my = Math.min(...c.map((p) => p[1])); return JSON.stringify(c.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[0] - b[0] || a[1] - b[1])); };
      const cur = boardView(live.loadout).slates[ped].cells;
      expect([norm(cur), norm(cur.map(([x, y]) => [-x, y] as [number, number]))]).toContain(norm(lay![ped]));
    }
    const cells = (l: [number, number][][]) => l.reduce((n, c) => n + c.length, 0);
    expect(packBoard(live.loadout, 90, Array(30).fill(2020))).toBeNull();
    const { boardView } = await import('../src/candidates/slates');
    expect(cells(lay!)).toBe(boardView(live.loadout).slates.reduce((n, x) => n + x.cells.length, 0));
  });
});

describe('plan candidates keep the rules of the game (owner, 2026-10-16)', () => {
  const points = Object.values(live.loadout.talents as Record<string, number>).reduce((a, b) => a + b, 0);
  const cs = candidates(s, ctx, { ...DEFAULT_PLAN, points }, lines);
  it('a Magnificent / Noble support is never levelled; another gem below 20 is (time, 0 FE)', () => {
    expect(cs.filter((c) => /Magnificent|Noble/.test(c.label) && /^Level /.test(c.label))).toEqual([]);
    expect(cs.some((c) => c.label === 'Level Hammer of Ash 17 -> 20 (time)' && c.costFE === 0)).toBe(true);
  });
  it("no example-build skill group, no copy of a worn legendary", () => {
    expect(cs.filter((c) => /^Add the skill|Target skill/.test(c.label))).toEqual([]);
    expect(cs.filter((c) => c.kind === 'support' && /Wind Projectiles|Slow Projectile -> /.test(c.label))).toEqual([]);
    expect(cs.filter((c) => /^\+\d+ points?/.test(c.label))).toEqual([]);   // no point out of thin air (owner): only moves
    expect(cs.some((c) => /^Move a point/.test(c.label))).toBe(true);   // the owner's dummy disproved the model's figure
    expect(cs.filter((c) => /^Unique (Ruinous Star|Formation Breaker|Kaleidoscope) in /.test(c.label))).toEqual([]);
  });
  it('a legendary held at the start stays out after a step takes it off (a new one is priced mid-roll; yours is the roll there is)', () => {
    const priced = { ...ctx, prices: withPrices(ctx.prices, { 'Last Words of Chaos': 39 }).book }, lwc = (c: { label: string }) => c.label === 'Unique Last Words of Chaos in helmet';
    expect(candidates(s, priced, DEFAULT_PLAN, lines, new Set()).some(lwc)).toBe(true);
    expect(candidates(s, priced, DEFAULT_PLAN, lines, new Set(['Last Words of Chaos'])).some(lwc)).toBe(false);
  });
  it("another copy of a worn legendary at a better roll only at a price you gave that roll; the name's market price is any roll's, so it is named, not ranked (owner, 2026-10-18: a +100 Crit Rating Death's Touch is not 1300 FE)", () => {
    const priced = { ...ctx, prices: withPrices(ctx.prices, { 'Ruinous Star': 1433 }).book, notSearched: new Set<string>() };
    expect(candidates(s, priced, DEFAULT_PLAN, lines).filter((x) => /^Buy another Ruinous Star/.test(x.label))).toEqual([]);
    expect([...priced.notSearched].some((n) => /^Ruinous Star .*roll-prices\.json/.test(n))).toBe(true);
    const c = candidates(s, priced, { ...DEFAULT_PLAN, rollPrices: [{ item: 'Ruinous Star', line: 80935371, rolls: [[30, 250]] }] }, lines)
      .find((x) => /^Buy another Ruinous Star with \+30% additional Deterioration Duration \(yours: \d+\)/.test(x.label));
    expect(c?.costFE).toBe(250);
  });
  it('a hero memory levelled to its rarity cap at the scraps and threads it takes; never awakened to another rarity (a new memory is bought: owner, 2026-10-16)', () => {
    const priced = { ...ctx, prices: withPrices(ctx.prices, { 'Memory Scrap': 0.1, 'Memory Thread - Epic': 1, 'Crude Lunar Dust': 1, 'Luminous Lunar Dust': 1 }).book };
    const m = candidates(s, priced, DEFAULT_PLAN, lines).filter((c) => c.kind === 'memory');
    expect(m.length).toBeGreaterThan(0);
    for (const c of m) expect(c.label).toMatch(/^(Level|Reroll) your Memory of \w+\W.*Memory Scrap/);
  });
  it('a memory random affix rerolled to another of its pool (the slot you pick, no keep: owner, 2026-10-17); a level past 20 / 40 rolls one free, then rerolls', () => {
    const priced = { ...ctx, prices: withPrices(ctx.prices, { 'Memory Scrap': 0.1, 'Memory Thread - Rare': 2, 'Memory Thread - Epic': 1, 'Crude Lunar Dust': 1, 'Luminous Lunar Dust': 1 }).book };
    const m = candidates(s, priced, DEFAULT_PLAN, lines).filter((c) => c.kind === 'memory');
    // Origin (Rare, L30): its random affix 402165302 (T2 Fire Skill Critical Strike Damage); at item level 86+ a Rare rerolls T2 (3000) or T3 (4000), a group
    // 1.46 % a roll (the game's odds for Affliction Effect): T2 Attack Damage (group 4021665) = 1 / (0.0146 x 3/7) rerolls of 5 Memory Scrap + 1 Rare Thread
    const ad = m.find((c) => c.key === 'memroll|1|402165302|402166502');
    expect(ad?.costFE).toBeCloseTo((1 / (0.0146 * 3 / 7)) * (5 * 0.1 + 2));
    const mem = (ad!.changes[0] as unknown as { items: { slot: number; affixes: { id: number; list: string }[] }[] }).items.find((x) => x.slot === 1)!;
    expect(mem.affixes.filter((a) => a.list === 'SuffixInfoList').map((a) => a.id)).toEqual([402166502]);
    expect(m.some((c) => c.key === 'memroll|1|402165302|402165303')).toBe(false);   // the same group at a worse tier is no reroll
    // Discipline (Epic, L13): to 20 rolls its first random affix free; T1 (2000 of 9000) Attack Damage of its pool (4021691) = 1 / (0.0146 x 2/9) - 1 rerolls
    const lv = m.find((c) => c.key === 'memlevel|2|13|402169101');
    expect(lv?.costFE).toBeGreaterThan((1 / (0.0146 * 2 / 9) - 1) * (10 * 0.1 + 1));
    expect(lv?.label).toMatch(/^Level your Memory of Discipline 13 -> 20/);
  });
  it('a slate step is a listing the market read: its lines, base, shape and price, only where its type may go; none made up from lines (owner, 2026-10-18: three plan slates no market had, one priced from a Pedigree)', () => {
    const want = lines.map((x, i) => ({ ...x, gain: 1.1 + i / 100 })), at = new Date().toISOString(), keep = live.loadout.slateItems.map(() => 0.99);
    const ped = { talents: [want[1].id, 10070100], price: 350, at, baseId: 261010, shapeId: 2090 }, corner = { talents: [want[0].id], price: 20, at, baseId: 261003, shapeId: 2020 };
    const c = candidates(s, ctx, { ...DEFAULT_PLAN, slateListings: [ped, corner], slateKeep: keep }, want).filter((x) => x.key.startsWith('listing|'));
    expect(c.filter((x) => x.costFE === 350).map((x) => x.key.split('|').at(-1))).toEqual(['0']);   // a Pedigree: only in place of your Pedigree
    expect(c.filter((x) => x.costFE === 20).map((x) => x.key.split('|').at(-1))).toEqual(expect.arrayContaining(['1', '3', 'add']));   // a Corner: wherever the caps and the board allow
    const items = (c.find((x) => x.costFE === 350)!.changes[0] as unknown as { items: { baseId: number; shapeId: number; talents: number[] }[] }).items;
    expect(items[0]).toMatchObject({ baseId: 261010, shapeId: 2090, talents: ped.talents });
    expect(c[0].label).toMatch(/^Buy the (Pedigree|slate) listed at \d+ FE \(seen /);
    expect(candidates(s, ctx, { ...DEFAULT_PLAN, slateKeep: keep }, want).some((x) => /^(slate\|\d+\||add\||listing\|)/.test(x.key))).toBe(false);   // no listings read: no slate to buy
  });
  it('a slate you own (bag, booth: the read\'s page 0 is My Booth, owner 2026-10-17) is a free step in place of each board slate, its slot named', () => {
    const own = { ...s, owned: [{ itemId: 'x', baseId: 261003, baseName: null, level: 86, where: 'stash', page: 0, slot: 1, count: 1, modifiers: {}, talents: [43040200], shapeId: 2020 }] };
    const c = candidates(own, ctx, DEFAULT_PLAN, lines).filter((x) => x.key.startsWith('ownslate|'));
    expect(c.length).toBe(live.loadout.slateItems.length);
    expect(c[0].costFE).toBe(0);
    expect(c[0].label).toMatch(/^Put your slate \(level 86: Ranger: chance to gain Agility Blessing on Critical Strike\) from your stash \(Trade House > My Booth > Stash\) in place of board slate 1 /);
  });
  it("an owned slate is named so it can be found (owner, 2026-10-18: \"I don't know what booth slate slot 86 is\"): a Pedigree by its type; no stash slot (the read's page 0 is every stash tab, its slot numbers repeat)", () => {
    const own = { ...s, owned: [{ itemId: 'p', baseId: 261010, baseName: null, level: 82, where: 'stash', page: 0, slot: 86, count: 1, modifiers: {}, talents: [43040200], shapeId: 2090 }] };
    const c = candidates(own, ctx, DEFAULT_PLAN, lines).filter((x) => x.key.startsWith('ownslate|'));
    expect(c.length).toBeGreaterThan(0);
    for (const x of c) expect(x.label).toMatch(/^Put your Pedigree \(level 82: .+\) from your stash \(Trade House > My Booth > Stash\) in place of board slate \d/);
    for (const x of c) expect(x.label).not.toMatch(/slot 86/);
  });
  it('a slate you own is tried in every board slot its type may take, not only the weakest (owner, 2026-10-17: free slates in the bag and booth were never offered)', () => {
    const own = { ...s, owned: [{ itemId: 'ped', baseId: 261010, baseName: null, level: 86, where: 'stash', page: 0, slot: 1, count: 1, modifiers: {}, talents: [43040200], shapeId: 2090 }] };
    const c = candidates(own, ctx, DEFAULT_PLAN, lines).filter((x) => x.key.startsWith('ownslate|'));
    expect(c.map((x) => x.key)).toEqual(['ownslate|ped|0']);   // a Pedigree: only in place of your Pedigree (board slate 1)
  });
  it("another skill in a weak place: an active for an active place, an aura for an aura place, its supports kept (owner: Fixate for Bull's Rage)", () => {
    const fix = live.loadout.skills.find((g: { name: string }) => g.name === 'Fixate'), aura = live.loadout.skills.find((g: { place: { kind: string } }) => g.place.kind === 'passive');
    const priced = { ...ctx, prices: withPrices(ctx.prices, { "Bull's Rage": 5 }).book };
    const c = candidates(s, priced, { ...DEFAULT_PLAN, skillSlots: [fix.place, aura.place] }, lines);
    const bull = c.find((x) => x.label.startsWith("Replace Fixate with Bull's Rage"));
    expect(bull?.costFE).toBe(5);
    const items = (bull!.changes[0] as unknown as { items: { name: string; place: { kind: string } }[] }).items;
    expect(items.filter((x) => x.place.kind === 'support').length).toBe(live.loadout.skills.filter((g: { place: { ownerKind?: string; ownerSlot?: number } }) => g.place.ownerKind === 'active' && g.place.ownerSlot === fix.place.slot).length);
    expect(c.some((x) => x.label.startsWith(`Replace ${aura.name} with Bull's Rage`))).toBe(false);   // an active never in an aura place
  });
  it('at most 3 slates of a capped type (the 2- and 3-cell bases: Corners of Divinity, Fallen Starlight); a slate you own brings its own type and shape', async () => {
    const { overCap } = await import('../src/candidates/slates');
    const three = { ...s, loadout: { ...live.loadout, slateItems: [0, 1, 2].map((i) => ({ ...live.loadout.slateItems[0], itemId: `t${i}`, baseId: 261003, shapeId: 2020 })) } };
    expect(overCap(three.loadout.slateItems)).toBe(false);
    const c = candidates(three, ctx, DEFAULT_PLAN, lines);
    expect(c.filter((x) => x.label.startsWith('Add a 2-cell slate'))).toEqual([]);   // a 4th of that type
    const own = { ...three, owned: [{ itemId: 'p', baseId: 261005, baseName: null, level: 86, where: 'stash', page: 0, slot: 1, count: 1, modifiers: {}, talents: [43040200], shapeId: 2030 }] };
    const put = candidates(own, ctx, DEFAULT_PLAN, lines).find((x) => x.key.startsWith('ownslate|p|'));
    expect(put).toBeDefined();
    expect((put!.changes[0] as unknown as { items: { baseId: number; shapeId: number }[] }).items.some((x) => x.baseId === 261005 && x.shapeId === 2030)).toBe(true);
  });
  it('a vorax Ultimate line is re-grafted until a better tier lands: your FE per graft / the chance of that tier or better (owner, 2026-10-17: a graft always replaces the line; 80.01 / 14.99 / 5 %)', () => {
    const odds: [number, number][] = [[0, 5], [1, 14.99], [2, 80.01]];
    const vx = { ...s, loadout: { ...live.loadout, vorax: [{ label: 'Vorax Limb: Digits', slot: 'ring1', affixes: [{ id: 252182002, dyn: [18], list: 'SuffixInfoList' }] }] } };
    const c = candidates(vx, ctx, { ...DEFAULT_PLAN, grafts: [{ organ: 'Flawless Eyes: Sinister', group: 2521820, fe: 630, odds }] }, lines).filter((x) => x.key.startsWith('graft|'));
    expect(c.map((x) => [x.key, Math.round(x.costFE)])).toEqual([['graft|2521820|0', 630 / 0.05], ['graft|2521820|1', Math.round(630 / 0.1999)]]);
    const items = (c[1].changes[0] as unknown as { op: string; items: { affixes: { id: number; dyn: number[] }[] }[] });
    expect(items.op).toBe('vorax');
    expect(items.items[0].affixes[0]).toMatchObject({ id: 252182001, dyn: [28] });   // T1 (23-32) at its middle
    expect(c[1].label).toMatch(/Flawless Eyes: Sinister/);
  });
  it('an Inverse Image is bought as listed, its reflected Medium roll fixed (owner, 2026-10-17); no made-up prism price once there are listings', () => {
    const c = candidates(s, ctx, { ...DEFAULT_PLAN, inverseImages: [{ n: 16, medium: 39, fe: 3399 }] }, lines);
    expect(c.some((x) => x.costFE === DEFAULT_PLAN.prismFE && /prism/.test(x.label))).toBe(false);
    const ii = c.find((x) => x.key === 'inverse|16')!;
    expect(ii.costFE).toBe(3399);
    expect(ii.label).toMatch(/Inverse Image.*\+39% reflected Medium/);
    const p = ii.changes[0] as unknown as Parameters<typeof applyPatch>[1] & { op: 'inverse' };
    expect(p.op).toBe('inverse');
    // placed like the example build's on your page: each copy at your points on its source; your originals and your prisms' affixes stay (re/evidence/prisms.md (c):
    // the example build's 12040100 is at Point 0 only because its prerequisite has 1 of 3; the owner's has 3 of 3)
    expect(p.copies).toEqual([12040100, 12060200, 12060100].map((node) => ({ node, points: 3, ee: 39 })));
    const mine = { ...live.loadout, resolvedTalents: { ...live.loadout.resolvedTalents, ext: [[1204400061, [10, 10], 'prism-ext:54060400']] } };
    const out = applyPatch(mine, p) as typeof mine;
    expect(out.resolvedTalents.ext).toEqual(mine.resolvedTalents.ext);
    expect(out.resolvedTalents.talents).toContainEqual([12040100, 3, 'talent:12040100']);
  });
  it('an Inverse Image listing in place of yours keeps your copies (cells and points, as the server resolved them) and changes only the roll', () => {
    const rt = live.loadout.resolvedTalents.talents as [number, number, string][];
    const mine = { ...s, loadout: { ...live.loadout, resolvedTalents: { ...live.loadout.resolvedTalents, talents: [...rt, [12040100, 2.52, 'talent:-12040100@84%'], [12060200, 2.52, 'talent:-12060200@84%']] } } };
    const p = candidates(mine, ctx, { ...DEFAULT_PLAN, inverseImages: [{ n: 6, medium: -65, fe: 888 }] }, lines).find((x) => x.key === 'inverse|6')!.changes[0] as unknown as { copies: unknown[] };
    expect(p.copies).toEqual([{ node: 12040100, points: 3, ee: -65 }, { node: 12060200, points: 3, ee: -65 }]);
  });
  it('a slate on the board is never offered as one you own (owner, 2026-10-16: the read lists board slates among the items)', () => {
    const b = live.loadout.slateItems[0];
    const own = { ...s, owned: [{ itemId: b.itemId, baseId: b.baseId, baseName: null, level: 86, where: 'board', page: -4, slot: 1, count: 1, modifiers: {}, talents: b.talents, shapeId: b.shapeId },
      { itemId: 'stashed-copy', baseId: b.baseId, baseName: null, level: 86, where: 'stash', page: 0, slot: 1, count: 1, modifiers: {}, talents: [...b.talents].reverse(), shapeId: b.shapeId }] };
    expect(candidates(own, ctx, DEFAULT_PLAN, lines).filter((x) => x.key.startsWith('ownslate|'))).toEqual([]);
  });
  it('your roll prices: one step per roll you priced, a roll above the drop tier as the corrupted tier (x 10 + 0); also for a line already at its best drop roll', () => {
    const ring = live.loadout.gear.find((g: { slot: string }) => g.slot === 'ring2'), kal = ring.affixes.find((a: { id: number }) => Math.floor(a.id / 10) === 5151284);
    const s2 = { ...s, loadout: { ...live.loadout, gear: live.loadout.gear.map((g: { slot: string }) => (g === ring ? { ...ring, affixes: ring.affixes.map((a: { id: number }) => (a === kal ? { ...kal, dyn: [50, 8] } : a)) } : g)) } };
    const c = candidates(s2, ctx, { ...DEFAULT_PLAN, rollPrices: [{ item: 'Kaleidoscope', line: 51512841, rolls: [[56, 168], [65, 368]] }] }, lines).filter((x) => x.key.startsWith('rollp|ring2|'));
    expect(c.map((x) => x.costFE)).toEqual([168, 368]);
    expect(c[0].changes[0]).toEqual({ kind: 'patch', op: 'gear-roll', slot: 'ring2', id: kal.id, dyn: [56, 8], newId: 51512840 });
  });
  it("a blend on your belt (owner, 2026-10-18: +1 Attack Skill Level on Dawn Break): every shown recipe you unlocked that grants one affix, at its spices' price (src/data/blends.json, read from the client)", () => {
    const c = cs.filter((x) => x.key.startsWith('blend|'));
    const atk = c.find((x) => x.key === 'blend|340004')!;
    const p = (n: string) => ctx.prices.price(n, 90)!;
    expect(atk.costFE).toBeCloseTo(3 * p('Sage Lv. 1') + 1 * p('Silver Mound Lv. 2') + 3 * p('Gloomy Daffodil Lv. 5'));
    expect(atk.changes).toEqual([{ kind: 'patch', op: 'gear-blend', slot: 'belt', id: 3401003 }]);
    expect(atk.label).toMatch(/Blend .*Attack Skill Level.* on your (Radiant Lunar Girdle|[A-Z][^:]+): 3 Sage Lv\. 1, 1 Silver Mound Lv\. 2, 3 Gloomy Daffodil Lv\. 5/);
    expect(new Set(c.map((x) => x.group))).toEqual(new Set(['blend|belt']));   // a belt holds one blend
    expect(c.length).toBeGreaterThanOrEqual(36);
    // hidden in the game's window (Show 0) or a random outcome: not offered
    expect(c.some((x) => /^blend\|38/.test(x.key))).toBe(false);
  });
  it("gear-blend puts the one blend on the slot's item, in place of the one it had", () => {
    const one = applyPatch(live.loadout, { kind: 'patch', op: 'gear-blend', slot: 'belt', id: 3401003 }) as { gear: { slot: string; affixes: { id: number; list: string }[] }[] };
    const two = applyPatch(one as never, { kind: 'patch', op: 'gear-blend', slot: 'belt', id: 3401029 }) as typeof one;
    const blends = (l: typeof one) => l.gear.find((g) => g.slot === 'belt')!.affixes.filter((a) => a.list === 'EnchantAffixList').map((a) => a.id);
    expect(blends(one)).toEqual([3401003]);
    expect(blends(two)).toEqual([3401029]);
  });
});

describe('runPlan: no step raises the projectile speed (owner, 2026-10-16: Precise Projectiles, Wind Projectiles cost embers in game)', () => {
  it('a change that speeds the embers up is refused with why, however much it gains; the goal can be a kill time', async () => {
    const fig = (k: number, speedInc: number) => ({ life100: k, life0: k, kill: k, partial: [], target: 'cube3', lifeMax: 1.6e13, projectile: { speedInc, areaInc: 200 } });
    const ev: Evaluator = { pin: 'stub', parallelism: 4, close: async () => {},
      run: async (loadout, changes) => { const j = JSON.stringify(changes);
        return { loadout, dropped: [], figure: /"name":"Critical Strike Damage Increase"/.test(j) ? fig(5e10, 51) : /"name":"Multiple Projectiles"/.test(j) ? fig(1.2e10, 40) : fig(1e10, 40) }; } };
    const r = await runPlan(ev, s, ctx.prices, { target: 'cube3', goalSeconds: 10, maxSteps: 3 });
    expect(r.plan!.goal).toBe(1.6e12);
    expect(r.plan!.steps.some((x) => /Critical Strike Damage Increase/.test(x.label))).toBe(false);
    expect(r.notCalculable.some((n) => /Critical Strike Damage Increase.*raises projectile speed/.test(n))).toBe(true);
  }, 300_000);
});

describe('runPlan: a step is ranked on the damage at full Life, never a kill speed (owner, 2026-10-16: Passivation -> Wind Projectiles, +8.6 % kill speed, -25 % on the dummy; 2026-10-18)', () => {
  it('a change that would raise a kill speed but lowers full-Life damage is not taken; one that raises the damage is', async () => {
    const fig = (life100: number, kill: number) => ({ life100, life0: kill, kill, partial: [], target: 'traveler', lifeMax: 1.6e12 });
    const ev: Evaluator = { pin: 'stub', parallelism: 4, close: async () => {},
      run: async (loadout, changes) => { const j = JSON.stringify(changes);
        return { loadout, dropped: [], figure: /"name":"Critical Strike Damage Increase"/.test(j) ? fig(0.9e10, 1.2e10) : /"name":"Multiple Projectiles"/.test(j) ? fig(1.1e10, 1.1e10) : fig(1e10, 1e10) }; } };
    const r = await runPlan(ev, s, ctx.prices, { goal: 1e12, maxSteps: 3 });
    expect(r.plan!.steps.some((x) => /Critical Strike Damage Increase/.test(x.label))).toBe(false);
    expect(r.plan!.steps.some((x) => /Multiple Projectiles/.test(x.label))).toBe(true);
  }, 300_000);
});

describe('runPlan: your free Mana never shrinks (owner, 2026-10-17: Precise: Malleable sealed 485 of 485 and Sentry could not be cast, 500 B)', () => {
  it('a change that seals more Mana than is free at the read is refused, named with why; one that seals Life instead is taken', async () => {
    const mana = (reserved: number, life = 1729) => ({ reserved, capacity: 485, margin: 485 - reserved, fits: true, life: { reserved: life, capacity: 2161, margin: 2161 - life } });
    const fig = (k: number, m: ReturnType<typeof mana>) => ({ life100: k, life0: k, kill: k, partial: [], target: 'traveler', lifeMax: 1.6e12, mana: m });
    const ev: Evaluator = { pin: 'stub', parallelism: 4, close: async () => {},
      run: async (loadout, changes) => { const j = JSON.stringify(changes);
        return { loadout, dropped: [], figure: /"name":"Critical Strike Damage Increase"/.test(j) ? fig(1.2e10, mana(485)) : /"name":"Multiple Projectiles"/.test(j) ? fig(1.1e10, mana(466, 1947)) : fig(1e10, mana(466)) }; } };
    const r = await runPlan(ev, s, ctx.prices, { goal: 1e12, maxSteps: 3 });
    expect(r.plan!.steps.some((x) => /Critical Strike Damage Increase/.test(x.label))).toBe(false);
    expect(r.plan!.steps.some((x) => /Multiple Projectiles/.test(x.label))).toBe(true);
    expect(r.notCalculable.some((n) => /Critical Strike Damage Increase.*free Mana 19 -> 0/.test(n))).toBe(true);
  }, 300_000);
});

describe("runPlan: an aura that no longer fits is turned off when the build is better without it (owner, 2026-10-18: \"Aura unsealing is fine if it is a dps increase\")", () => {
  it('a change that over-seals Mana is priced with each active aura switched off; the best that fits is taken, named with the aura', async () => {
    const mana = (reserved: number) => ({ reserved, capacity: 485, margin: 485 - reserved, fits: reserved <= 485, life: { reserved: 1729, capacity: 2161, margin: 432 } });
    const fig = (k: number, m: ReturnType<typeof mana>) => ({ life100: k, life0: k, kill: k, partial: [], target: 'traveler', lifeMax: 1.6e12, mana: m });
    const off = (slot: number) => `"op":"aura-off","place":{"kind":"passive","slot":${slot}}`;
    const ev: Evaluator = { pin: 'stub', parallelism: 4, close: async () => {},
      run: async (loadout, changes) => { const j = JSON.stringify(changes);
        const csd = /"name":"Critical Strike Damage Increase"/.test(j);
        return { loadout, dropped: [], figure: csd && j.includes(off(3)) ? fig(1.3e10, mana(400)) : csd && /aura-off/.test(j) ? fig(1.02e10, mana(400)) : csd ? fig(1.4e10, mana(515))
          : /"name":"Multiple Projectiles"/.test(j) ? fig(1.1e10, mana(466)) : fig(1e10, mana(466)) }; } };
    const r = await runPlan(ev, s, ctx.prices, { goal: 1e12, maxSteps: 1 });
    const step = r.plan!.steps[0];
    expect(step.label).toMatch(/Critical Strike Damage Increase.*, with .+ turned off \(Sealed Mana 515 over 485 with it on\)/);
    expect(step.figure.kill).toBe(1.3e10);
    expect(r.notCalculable.some((n) => /Critical Strike Damage Increase.*unseals an aura/.test(n))).toBe(false);
  }, 300_000);
  it("aura-off switches the passive in that place off, as the server's switch does", () => {
    const l = applyPatch(live.loadout, { kind: 'patch', op: 'aura-off', place: { kind: 'passive', slot: 3 } }) as { skills: { place: { kind: string; slot?: number }; switch?: unknown }[] };
    expect(l.skills.find((x) => x.place.kind === 'passive' && x.place.slot === 3)!.switch).toEqual({ pendingDeactivate: true, activated: false });
  });
});

describe('runPlan on the training dummy (owner, 2026-10-18: "I\'m really trying to get to 40 trillion dummy")', () => {
  it('--target dummy prices on the dummy (target null) and ranks by the damage it shows (full Life): the goal is that number', async () => {
    const asked: unknown[] = [];
    const fig = (life100: number) => ({ life100, life0: 0, kill: 0, partial: [] });
    const ev: Evaluator = { pin: 'stub', parallelism: 4, close: async () => {},
      run: async (loadout, changes, c) => { asked.push(c.target); const j = JSON.stringify(changes);
        return { loadout, dropped: [], figure: /"name":"Multiple Projectiles"/.test(j) ? fig(5e13) : fig(1e13) }; } };
    const r = await runPlan(ev, s, ctx.prices, { target: 'dummy', goal: 4e13, maxSteps: 5 });
    expect(asked.every((t) => t === null)).toBe(true);
    expect(r.plan!.steps).toHaveLength(1);
    expect(r.plan!.steps[0].label).toMatch(/Multiple Projectiles/);
    expect(r.plan!.steps[0].figure.kill).toBe(5e13);
  }, 300_000);
});

describe('runPlan: the start names your training dummy figure beside the boss one (owner, 2026-10-17: "the website still says 551b dps")', () => {
  it('the dummy (target null) is priced once and written with the start', async () => {
    const fig = (k: number) => ({ life100: k, life0: k, kill: k, partial: [], target: 'cube3', lifeMax: 1.6e12 });
    const ev: Evaluator = { pin: 'stub', parallelism: 4, close: async () => {}, run: async (loadout, _c, ctx) => ({ loadout, dropped: [], figure: ctx.target === null ? fig(5.6e12) : fig(5.6e11) }) };
    const r = await runPlan(ev, s, ctx.prices, { target: 'cube3', goal: 1e12, maxSteps: 1 });
    expect(r.plan!.start.dummy).toBe(5.6e12);
    expect(r.plan!.start.figure.life100).toBe(5.6e11);
  }, 300_000);
});

describe('runPlan: within your FE (owner, 2026-10-17: "within the 641 FE budget I have right now")', () => {
  it('an option dearer than the FE left is never priced, and the plan stops when none fits', async () => {
    const fig = (k: number) => ({ life100: k, life0: k, kill: k, partial: [], target: 'traveler', lifeMax: 1.6e12 });
    const priced: string[] = [];
    const ev: Evaluator = { pin: 'stub', parallelism: 4, close: async () => {},
      run: async (loadout, changes) => { priced.push(JSON.stringify(changes)); return { loadout, dropped: [], figure: fig(1e10 * (1 + priced.length * 1e-3)) }; } };
    const all = candidates(s, ctx, { ...DEFAULT_PLAN }, lines);
    const r = await runPlan(ev, s, ctx.prices, { goal: 1e12, maxSteps: 60, budget: 50 });
    expect(all.some((c) => c.costFE > 50)).toBe(true);
    for (const c of all.filter((x) => x.costFE > 50)) expect(priced).not.toContain(JSON.stringify(c.changes));
    expect(r.plan!.steps.at(-1)?.totalFE ?? 0).toBeLessThanOrEqual(50);
  }, 300_000);
});

describe('runPlan: every write carries the slate board (owner, 2026-10-17: a stopped plan left the page with no slate viewer)', () => {
  it('each partial output has the board now and after, as the final one does', async () => {
    const fig = (k: number) => ({ life100: k, life0: k, kill: k, partial: [], target: 'traveler', lifeMax: 1.6e12 });
    const ev: Evaluator = { pin: 'stub', parallelism: 4, close: async () => {},
      run: async (loadout, changes) => ({ loadout, dropped: [], figure: /"name":"Multiple Projectiles"/.test(JSON.stringify(changes)) ? fig(1.1e10) : fig(1e10) }) };
    const writes: { board?: unknown }[] = [];
    await runPlan(ev, s, ctx.prices, { goal: 1e12, maxSteps: 1 }, (o) => writes.push(o));
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w.board).toMatchObject({ now: { slates: expect.any(Array) }, after: { slates: expect.any(Array) } });
  }, 300_000);
});

describe('runPlan: an option at another place starts from its own score as its bound (a kismet on the next free point, a memory slot rerolled again)', () => {
  type Lo = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
  /** a stub that applies the moves (kismets socketed, patches) and prices the loadout by what it holds, `gain(lo)` x 1e10; `priced[i]`: the figures after step i */
  const run = async (gain: (lo: Lo) => number, steps: number, prices = ctx.prices, st: State = s) => {
    let after = 0;
    const priced: string[][] = [[]];
    const ev: Evaluator = { pin: 'stub', parallelism: 4, close: async () => {},
      run: async (loadout, changes) => {
        let lo = loadout as Lo;
        for (const c of changes as Lo[]) {
          if (c.kind === 'patch') lo = applyPatch(lo, c as never);
          else if (c.kind === 'kismet') lo = { ...lo, kismets: [...(lo.kismets as { node: number }[]).filter((k) => k.node !== c.point), ...(c.action === 'remove' ? [] : [{ node: c.point, modifierId: c.modifierId, servantId: null, rolls: c.rolls }])] };
        }
        (priced[after] ??= []).push(JSON.stringify(changes));
        const k = 1e10 * gain(lo);
        return { loadout: lo, dropped: [], figure: { life100: k, life0: k, kill: k, partial: [], target: 'traveler', lifeMax: 1.6e12 } };
      } };
    const r = await runPlan(ev, st, prices, { goal: 1e14, maxSteps: steps }, () => { after++; });
    return { r, priced };
  };
  // your Micro Fate: Fire Resistance on Kitty Express 1-1; Cold Resistance the one kismet worth having
  const socketed = (() => {
    const c = candidates(s, ctx, DEFAULT_PLAN, lines).find((x) => /^Socket Micro Fate: Fire Resistance on /.test(x.label))!, ch = c.changes[0] as unknown as { point: number; modifierId: number; rolls: number[] };
    return { st: { ...s, loadout: { ...live.loadout, kismets: [...live.loadout.kismets, { node: ch.point, modifierId: ch.modifierId, servantId: null, rolls: ch.rolls }] } }, fire: ch.modifierId, point: c.label.replace(/.* on /, '') };
  })();
  const cold = (candidates(s, ctx, DEFAULT_PLAN, lines).find((x) => /^Socket Micro Fate: Cold Resistance on /.test(x.label))!.changes[0] as unknown as { modifierId: number }).modifierId;
  const kismetGain = (g: Record<number, number>) => (lo: Lo) => [...new Set((lo.kismets as { modifierId: number }[]).map((k) => k.modifierId))].reduce((t, m) => t * (g[m] ?? 1), 1);
  const replaced = (p: string[]) => new Set(p.filter((j) => /"kind":"kismet","action":"replace"/.test(j))).size;
  it('a kismet in place of yours is priced in the first round only when its bound, the same kismet on a free point, could win', async () => {
    const all = candidates(socketed.st, ctx, DEFAULT_PLAN, lines).filter((c) => c.label.startsWith(`Replace the kismet on ${socketed.point} with `));
    expect(all.length).toBeGreaterThan(20);
    const { r, priced } = await run(kismetGain({ [socketed.fire]: 1.1, [cold]: 1.2 }), 1, ctx.prices, socketed.st);
    expect(r.plan!.steps[0].label).toMatch(/^Socket Micro Fate: Cold Resistance on /);
    expect(replaced(priced[0])).toBeLessThan(5);
  }, 300_000);
  it('yours worse than none (taking it out raises the kill): every kismet in its place is priced', async () => {
    const all = candidates(socketed.st, ctx, DEFAULT_PLAN, lines).filter((c) => c.label.startsWith(`Replace the kismet on ${socketed.point} with `));
    const { priced } = await run(kismetGain({ [socketed.fire]: 0.99, [cold]: 1.2 }), 1, ctx.prices, socketed.st);
    expect(replaced(priced[0])).toBe(all.length);
  }, 300_000);
  it('a kismet socketed on a free point: the others of its size move to the next free point and are priced only when their score could win', async () => {
    const all = candidates(s, ctx, DEFAULT_PLAN, lines).filter((c) => /^Socket Micro Fate: (Fire|Cold) Resistance on /.test(c.label));
    const mod = (c: (typeof all)[number]) => (c.changes[0] as unknown as { modifierId: number }).modifierId;
    const fire = all.find((c) => /Fire/.test(c.label))!, cold = all.find((c) => /Cold/.test(c.label))!;
    const g: Record<number, number> = { [mod(fire)]: 1.5, [mod(cold)]: 1.2 };
    const { r, priced } = await run((lo) => [...new Set((lo.kismets as { modifierId: number }[]).map((k) => k.modifierId))].reduce((t, m) => t * (g[m] ?? 1), 1), 2);
    expect(r.plan!.steps.map((x) => x.label.replace(/ on .*/, ''))).toEqual(['Socket Micro Fate: Fire Resistance', 'Socket Micro Fate: Cold Resistance']);
    expect(r.plan!.steps[1].label).not.toBe(cold.label);   // on the next free point
    expect(priced[1].length).toBeLessThan(40);   // not every kismet of its size again
  }, 300_000);
  it('a memory affix rerolled: the rerolls of that slot to every other affix are priced only when their score could win', async () => {
    const prices = withPrices(ctx.prices, { 'Memory Scrap': 0.1, 'Memory Thread - Rare': 2, 'Memory Thread - Epic': 1, 'Crude Lunar Dust': 1, 'Luminous Lunar Dust': 1 }).book;
    const rr = candidates(s, { ...ctx, prices }, DEFAULT_PLAN, lines).filter((c) => c.key.startsWith('memroll|1|402165302|')).map((c) => Number(c.key.split('|')[3]));
    const x = rr.find((id) => id % 100 === 3)!, y = rr.find((id) => id % 100 === 2 && Math.floor(id / 100) !== Math.floor(x / 100))!;
    const g: Record<number, number> = { [x]: 1.5, [y]: 1.6 };   // y: the better line, at a dearer tier
    const ids = (lo: Lo) => new Set((lo.heroMemories as { affixes: { id: number }[] }[]).flatMap((m) => m.affixes.map((a) => a.id)));
    const { r, priced } = await run((lo) => [...ids(lo)].reduce((t, id) => t * (g[id] ?? 1), 1), 2, prices);
    expect(r.plan!.steps.map((z) => [z.label.replace(/ to .*/, ''), z.figure.kill])).toEqual([[expect.stringMatching(/^Reroll your Memory of Origin's \+\d+% Fire Skill Critical Strike Damage$/), 1.5e10], [expect.stringMatching(/^Reroll your Memory of Origin's /), 1.6e10]]);
    expect(priced[1].length).toBeLessThan(40);   // not every reroll of that slot again
  }, 300_000);
});
