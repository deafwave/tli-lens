/**
 * The Ice Shot -> Hammer of Ash switch: one acquisition move that equips the best maul base at the hero level, replaces the main skill with Hammer of Ash and
 * rebuilds its support group from the target build (the Pro Build loadout in the pin). The reverse is never offered.
 * dps-debug's `multi` cannot hold a gear swap (applyLoadoutChange turns a `gear` entry into a removal), so the move is [gear swap, multi(skill + supports)].
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pinRoot, table } from '../pin';
import { basesFor } from './gear';
import { supportsFor } from './gems';
import type { Change, Generator } from '../types';

type Gem = { sid: number; name: string; level: number; mods?: [number, number[]][]; place: { kind: string; slot: number; ownerKind?: string; ownerSlot?: number } };
const TARGET = 're/evidence/loadout_probuild-hanshansi-bing.json';
const HOA_SID = 1110;
let target: Gem[] | undefined;
const targetSkills = (): Gem[] => target ??= JSON.parse(readFileSync(join(pinRoot(), TARGET), 'utf8')).skills;

export const switchMoves: Generator = (s, ctx) => {
  if (s.skill !== 'iceShot') return [];
  const ns = ctx.notSearched;
  ns.add('switch: the new maul is a bare rare base; the bow\'s affixes are lost and the maul is crafted by later gear moves');
  const skills = targetSkills(), hoa = skills.find(g => g.place.kind === 'active' && g.place.slot === 0 && g.sid === HOA_SID);
  if (!hoa) { ns.add(`switch: the target build has no Hammer of Ash in active slot 0 (${TARGET})`); return []; }
  const allowed = new Set(supportsFor('hoa').map(x => x.sid));
  const wanted = skills.filter(g => g.place.kind === 'support' && g.place.ownerKind === 'active' && g.place.ownerSlot === 0).sort((a, b) => a.place.slot - b.place.slot);
  const gems = wanted.filter(g => allowed.has(g.sid));
  for (const g of wanted) if (!allowed.has(g.sid)) ns.add(`switch: target support ${g.name} does not compile on Hammer of Ash (SUP1); left out`);
  const maul = basesFor('mainHand', ctx.level, 'hoa').at(-1);
  if (!maul) { ns.add(`switch: no maul base at hero level ${ctx.level}`); return []; }

  const base = table<{ rows: Record<string, { a1b8?: number[] }> }>('config_item_base').rows[maul.baseId], rolls = table<{ rows: Record<string, number[][]> }>('config_modifier_rolls').rows;
  const baseAttr = (base.a1b8 ?? []).filter(id => rolls[id]).map(id => ({ id, dynArgs: rolls[id].map(r => (r[0] + r[1]) / 2) }));
  const weapon: Change = { kind: 'gear', slot: 'mainHand', item: { baseId: maul.baseId, baseName: maul.name, itemId: `guide-switch-${maul.baseId}`, level: ctx.level, modifiers: { baseAttr } } };

  const owner = { kind: 'active' as const, slot: 0 };
  const have = new Set(((s.loadout.skills ?? []) as Gem[]).filter(g => g.place.kind === 'support' && g.place.ownerKind === 'active' && g.place.ownerSlot === 0).map(g => g.place.slot));
  const sockets: Change[] = [];
  for (let i = 0; i < Math.max(gems.length, ...have); i++) {
    const socket = i + 1, g = gems[i];
    if (g) sockets.push({ kind: 'support', action: have.has(socket) ? 'replace' : 'install', owner, socket, gem: { sid: g.sid, level: g.level, name: g.name, mods: g.mods } });
    else if (have.has(socket)) sockets.push({ kind: 'support', action: 'remove', owner, socket });
  }
  const names = ['Hammer of Ash', ...gems.map(g => g.name)], prices = names.map(n => ctx.prices.price(n, ctx.level));
  return [{
    kind: 'switch', skill: 'hoa', acquisition: true, minLevel: maul.level, enabler: true,
    label: `Switch to Hammer of Ash with ${maul.name} (level ${maul.level}) and ${gems.map(g => g.name).join(', ')}`,
    costFE: prices.some(p => p === null) ? null : prices.reduce<number>((a, p) => a + (p as number), 0),
    changes: [weapon, { kind: 'multi', changes: [{ kind: 'skill', action: 'replace', owner, gem: { sid: HOA_SID, level: hoa.level, name: hoa.name } }, ...sockets] as never }],
  }];
};
