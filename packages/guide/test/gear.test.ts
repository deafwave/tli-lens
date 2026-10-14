import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { basesFor, gearMoves } from '../src/candidates/gear';
import { craftOptions, type LibraryAffix } from '../src/craft';
import type { GenCtx, Move, PriceBook, Skill, State } from '../src/types';

const PIN = process.env.DPS_DEBUG_PIN ?? 'C:/Users/deafwave/Documents/no_access/tli/dps-debug/.worktrees/guide-pin';
const rows = (f: string) => JSON.parse(readFileSync(`${PIN}/catalog/0x6aa39847/${f}.json`, 'utf8')).rows;
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const library: LibraryAffix[] = JSON.parse(readFileSync(here('../../../data/affix_library.json'), 'utf8')).affixes;
// weapon base name -> compendium category: an independent check of the catalog columns the code filters on
const family: Record<string, string> = {};
for (const [k, v] of Object.entries<any>(JSON.parse(readFileSync(here('../../../data/gear-en.json'), 'utf8'))))
  for (const b of Object.values<any>(v.baseItems)) family[b.name] = k.split('/')[2];

const fake = (prices: Record<string, number>): PriceBook => ({ season: 't', fetchedAt: 't', price: k => prices[String(k)] ?? null });
const ctx = (level: number, prices: Record<string, number> = { 'Precious Ember': 0.06, 'Matchless Ember': 0.27 }): GenCtx =>
  ({ prices: fake(prices), level, notSearched: new Set() });
const item = (slot: string, baseId: number, label: string) => ({ slot, baseId, label, level: 60, affixes: [] as object[] });
const state = (skill: Skill, level: number, gear: object[]): State => ({ loadout: { gear }, owned: [], fe: 0, level, skill });
const MAUL = item('mainHand', 1012, 'Vindicator Maul');   // 2H maul, item level 54
const HELM = item('helmet', 3600, "Brute's Helm");        // STR helmet, item level 1
const CHEST = item('chest', 3000, "Brute's Chestguard");
const hoa60 = () => state('hoa', 60, [MAUL, HELM]);
const swapped = (m: { changes: any[] }) => m.changes[0].item;

describe('gearMoves', () => {
  it('offers no tier above the hero level, and gates every move at or below it', () => {
    const moves = gearMoves(hoa60(), ctx(60));
    expect(moves.some(m => m.kind === 'craft')).toBe(true);
    expect(moves.every(m => m.minLevel <= 60)).toBe(true);
    const tooHigh = new Set(library.flatMap(a => a.tiers.filter(t => t.requiredLevel > 60).map(t => Number(t.tierAffixId))));
    for (const m of moves.filter(m => m.kind === 'craft')) {
      const mods = [...(swapped(m).modifiers.prefix ?? []), ...(swapped(m).modifiers.suffix ?? [])];
      expect(mods.some((x: { id: number }) => tooHigh.has(x.id))).toBe(false);
    }
  });

  it('craft cost = expected embers x ember price at the level, null when the ember is unpriced', () => {
    const moves = gearMoves(hoa60(), ctx(60, { 'Precious Ember': 0.06 })).filter(m => m.kind === 'craft' && m.changes[0].slot === 'mainHand');
    const opts = new Map(craftOptions(library, 'Two-Handed Hammer', 60).map(o => [Number(o.tierAffixId), o]));
    let priced = 0, unpriced = 0;
    for (const m of moves) {
      const it = swapped(m), added = [...(it.modifiers.prefix ?? []), ...(it.modifiers.suffix ?? [])].at(-1);
      const o = opts.get(added.id)!;
      if (o.ember === 'Precious Ember') { expect(m.costFE).toBeCloseTo(o.expectedEmbers * 0.06); priced++; }
      else { expect(m.costFE).toBeNull(); unpriced++; }
      expect(m.minLevel).toBe(o.requiredLevel);
    }
    expect(priced).toBeGreaterThan(0);
    expect(unpriced).toBeGreaterThan(0);
  });

  it('marks enabler moves by affix text', () => {
    const moves = gearMoves(state('hoa', 100, [MAUL, HELM]), ctx(100)).filter(m => m.kind === 'craft');
    const re = /Reservation|Support Skill.*Level|\+\d+ to .*Skill Level|Core Talent|talent/i;
    for (const m of moves) expect(!!m.enabler).toBe(re.test(m.label));
    expect(moves.some(m => m.enabler)).toBe(true);
  });

  it('emits the rare base upgrade of each slot as a gear move at the base level', () => {
    const moves = gearMoves(hoa60(), ctx(60)).filter(m => m.kind === 'gear');
    const mh = moves.find(m => m.changes[0].slot === 'mainHand')!, hel = moves.find(m => m.changes[0].slot === 'helmet')!;
    expect(swapped(mh).baseId).toBe(1013);                  // Vanquisher Mallet L59 (Platinum Mallet is L64)
    expect(mh.minLevel).toBe(59);
    expect(mh.costFE).toBe(0);
    expect(swapped(mh).modifiers.baseAttr.length).toBeGreaterThan(0);
    expect(hel.minLevel).toBeGreaterThan(1);
    expect(hel.minLevel).toBeLessThanOrEqual(60);
    expect(gearMoves(state('hoa', 50, [MAUL]), ctx(50)).some(m => m.kind === 'gear')).toBe(false);
  });

  it('uniques come from config_item_gold joined to etor by English name, gated at the base level', () => {
    const gold = rows('config_item_gold'), lang = rows('lang_en'), base = rows('config_item_base');
    const [gid, g] = Object.entries<any>(gold).find(([k, r]) => lang[`item_gold|name|${k}`] && base[r.i8]?.i20 === 14 && base[r.i8].i3c > 1 && base[r.i8].i3c <= 60)!;
    const name = lang[`item_gold|name|${gid}`], level = base[g.i8].i3c;
    const mine = (ms: Move[]) => ms.filter(m => m.kind === 'unique' && m.label.includes(`Unique ${name} `));
    const priced = mine(gearMoves(state('hoa', 60, [CHEST]), ctx(60, { [name]: 7 })));
    expect(priced.length).toBeGreaterThan(0);
    expect(priced[0]).toMatchObject({ costFE: 7, minLevel: level });
    expect(swapped(priced[0]).baseId).toBe(g.i8);
    expect(mine(gearMoves(state('hoa', 60, [CHEST]), ctx(60, {})))[0].costFE).toBeNull();
    expect(mine(gearMoves(state('hoa', level - 1, [CHEST]), ctx(level - 1, { [name]: 7 })))).toEqual([]);
  });

  it('Bing1 weapon rule: iceShot offers bow-family weapons only, hoa two-handed hammers/mauls only', () => {
    // the compendium lacks only the starter 'Aspiration' weapons
    const compendium = (bs: { name: string }[]) => new Set(bs.filter(b => !b.name.startsWith('Aspiration')).map(b => family[b.name]));
    const ice = basesFor('mainHand', 100, 'iceShot'), hoa = basesFor('mainHand', 100, 'hoa');
    expect(compendium(ice)).toEqual(new Set(['bow', 'crossbow', 'pistol', 'musket', 'fire_cannon']));
    expect(compendium(hoa)).toEqual(new Set(['two-handed_hammer']));
    expect(basesFor('mainHand', 60, 'hoa').every(b => b.level <= 60)).toBe(true);
    const bow = ice[0], c = ctx(60);
    const g = gearMoves(state('hoa', 60, [item('mainHand', bow.baseId, bow.name)]), c);
    expect(g.filter(m => m.changes[0].slot === 'mainHand')).toEqual([]);   // a bow is not a hoa weapon
    expect([...c.notSearched].some(x => /weapon rule/.test(x))).toBe(true);
  });

  it('armor bases keep to the slot and line', () => {
    const str = basesFor('helmet', 100, 'hoa', 70);
    expect(str.length).toBeGreaterThan(5);
    expect(basesFor('helmet', 100, 'hoa').length).toBeGreaterThan(str.length);
  });
});
