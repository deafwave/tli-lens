/**
 * Support candidates for the main skill (active slot 0): install into an empty socket, replace, remove. Which supports are offered is the SUP1 census
 * (src/data/sup1.json: status COMPILES for the skill); a support the G2 tag gate refuses for the skill (Steamroll on Ice Shot) or that does not compile is never emitted.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sup1 from '../data/sup1.json';
import { pinRoot, table } from '../pin';
import type { Generator, Move, Skill } from '../types';

/** the main skill's sid, read from the active slot 0 gem of the pin's loadouts: Ice Shot = game/loadout_l94-*.json (the owner's Ice Shot build), Hammer of Ash = re/evidence/loadout_probuild-hanshansi-bing.json (the target build) */
const MAIN_SOURCE: Record<Skill, () => string> = {
  iceShot: () => join(pinRoot(), 'game', readdirSync(join(pinRoot(), 'game')).filter(f => /^loadout_l94-.*\.json$/.test(f)).sort()[0]),
  hoa: () => join(pinRoot(), 're', 'evidence', 'loadout_probuild-hanshansi-bing.json'),
};
const mainSids = new Map<Skill, number>();
export function mainSid(skill: Skill): number {
  if (!mainSids.has(skill)) {
    const g = (JSON.parse(readFileSync(MAIN_SOURCE[skill](), 'utf8')).skills as Gem[]).find(x => x.place.kind === 'active' && x.place.slot === 0);
    if (!g) throw new Error(`no active slot 0 skill in ${MAIN_SOURCE[skill]()}`);
    mainSids.set(skill, g.sid);
  }
  return mainSids.get(skill)!;
}

/** hero level a gem needs: config_item_base i3c (the item level column gear.ts reads) of the gem item whose p5c[0] is the stone sid; every skill and support gem base has 0 */
let gemLevels: Map<number, number> | undefined;
export function gemLevel(sid: number): number {
  gemLevels ??= new Map(Object.values(table<{ rows: Record<string, { i3c: number; p5c?: number[] }> }>('config_item_base').rows).filter(r => r.p5c?.[0]).map(r => [r.p5c![0], r.i3c]));
  return gemLevels.get(sid) ?? 0;
}
export interface Support { sid: number; item: number; name: string }
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
  if (main?.sid !== mainSid(s.skill)) { ns.add(`support: the main skill of the loadout (sid ${main?.sid}) is not ${s.skill}`); return []; }
  const owner = { kind: 'active' as const, slot: 0 };
  const sockets = skills.filter(g => g.place.kind === 'support' && g.place.ownerKind === 'active' && g.place.ownerSlot === 0);
  const have = new Set(sockets.map(g => g.sid));
  const moves: Move[] = [];
  for (const socket of SOCKETS) {
    const cur = sockets.find(g => g.place.slot === socket);
    for (const c of supportsFor(s.skill)) {
      if (have.has(c.sid) || gemLevel(c.sid) > ctx.level) continue;
      const gem = { sid: c.sid, level: cur?.level ?? GEM_LEVEL, name: c.name };
      moves.push({
        kind: 'support', label: `${cur ? 'Replace socket ' + socket : 'Install in socket ' + socket} with ${c.name}`, acquisition: true, costFE: ctx.prices.price(c.name, ctx.level), minLevel: gemLevel(c.sid),
        changes: [{ kind: 'support', action: cur ? 'replace' : 'install', owner, socket, gem }],
      });
    }
    if (cur) moves.push({ kind: 'support', label: `Remove the support in socket ${socket}`, acquisition: false, costFE: 0, minLevel: 0, changes: [{ kind: 'support', action: 'remove', owner, socket }] });
  }
  return moves;
};
