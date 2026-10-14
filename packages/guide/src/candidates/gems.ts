/**
 * Support candidates for the main skill (active slot 0): install into an empty socket, replace, remove. Which supports are offered is the SUP1 census
 * (src/data/sup1.json: status COMPILES for the skill); a support the G2 tag gate refuses for the skill (Steamroll on Ice Shot) or that does not compile is never emitted.
 */
import sup1 from '../data/sup1.json';
import type { Generator, Move, Skill } from '../types';

export const MAIN_SID: Record<Skill, number> = { iceShot: 1030, hoa: 1110 };
export interface Support { sid: number; name: string }
export const supportsFor = (skill: Skill): Support[] => (sup1 as unknown as Record<Skill, Support[]>)[skill];
const SOCKETS = [1, 2, 3, 4, 5];   // a six-stone group = the skill + five supports (loadout sockets 1..5)
const GEM_LEVEL = 20;
type Gem = { sid: number; level: number; place: { kind: string; slot: number; ownerKind?: string; ownerSlot?: number } };

export const gemMoves: Generator = (s, ctx) => {
  const ns = ctx.notSearched;
  ns.add('support: a bought support is priced by its English name at gem level 20; its own rolled modifiers (Magnificent / Noble gems) are not modelled');
  ns.add('support: supports on the non-damage skills (Blink, Timid, warcries, auras) and replacing a skill gem are not searched');
  const skills = (s.loadout.skills ?? []) as Gem[];
  const main = skills.find(g => g.place.kind === 'active' && g.place.slot === 0);
  if (main?.sid !== MAIN_SID[s.skill]) { ns.add(`support: the main skill of the loadout (sid ${main?.sid}) is not ${s.skill}`); return []; }
  const owner = { kind: 'active' as const, slot: 0 };
  const sockets = skills.filter(g => g.place.kind === 'support' && g.place.ownerKind === 'active' && g.place.ownerSlot === 0);
  const have = new Set(sockets.map(g => g.sid));
  const moves: Move[] = [];
  for (const socket of SOCKETS) {
    const cur = sockets.find(g => g.place.slot === socket);
    for (const c of supportsFor(s.skill)) {
      if (have.has(c.sid)) continue;
      const gem = { sid: c.sid, level: cur?.level ?? GEM_LEVEL, name: c.name };
      moves.push({
        kind: 'support', label: `${cur ? 'Replace socket ' + socket : 'Install in socket ' + socket} with ${c.name}`, acquisition: true, costFE: ctx.prices.price(c.name, ctx.level), minLevel: 0,
        changes: [{ kind: 'support', action: cur ? 'replace' : 'install', owner, socket, gem }],
      });
    }
    if (cur) moves.push({ kind: 'support', label: `Remove the support in socket ${socket}`, acquisition: false, costFE: 0, minLevel: 0, changes: [{ kind: 'support', action: 'remove', owner, socket }] });
  }
  return moves;
};
