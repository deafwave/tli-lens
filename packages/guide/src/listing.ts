/** An auction house listing (scripts/market_listings.py) put on your character: the change that wears it in place of what you wear. */
import { createHash } from 'node:crypto';
import { LIST_KEY, slotsOfBase, TYPE_SLOTS } from './candidates/gear';
import { inverseImage } from './candidates/target';
import { table } from './pin';
import type { Change, State } from './types';

/** an item as dps-debug's reader/loadout.py reads one: `list` = the AffixList list the affix is in */
export type Aff = { id: number; tier: number; text: string; dyn: number[]; list: string };
/** `type` = the item's Type1 (1 gear, 26 slate, 34 hero memory, 39 talent prism, 41 vorax limb); `awaken` = a hero memory's AwakenData */
export type Listing = { n: number; price: number; priceType: number; baseId: number; level: number; type: number; affixes: Aff[]; awaken?: { boost: number; affixes: Aff[] };
  talents?: number[]; shapeId?: number };

const rows = <T>(f: string) => table<{ rows: Record<string, T> }>(f).rows;
// the what-if takes no Enchant key: a gear affix compiles alike in any list (only a hero memory's list is read, dps-debug loadout.ts memoryEntry), and chip's
// place, last, keeps the reader's order
const GEAR_KEY: Record<string, string> = { ...LIST_KEY, EnchantAffixList: 'chip' };
// an Inverse Image's "all reflected Medium / Micro Talent Effects" lines: a rolled id and a -100 one each
const MEDIUM = [1224626011, 1224626041], MICRO = [1224626001, 1224626031];

/** Where a listing can go on your character and the change that puts it there: gear in place of what you wear in its slot (a ring: either ring), a vorax limb
 *  in its slot type's slot (any gear or limb there out), a hero memory in place of yours of its kind, its awaken affixes with it, an Inverse Image placed like the
 *  example build's at its Medium roll (inverseImage). Else why it goes nowhere. */
export function places(l: Listing, state: State): { slot: string; change: Change }[] | string {
  const lo = state.loadout as unknown as { heroMemories: { slot: number; baseId?: number; label: string }[]; vorax: { slot: string }[] };
  const label = rows<string>('lang_en')[`item_base|name|${l.baseId}`] ?? String(l.baseId), affixes = l.affixes.map((a) => ({ id: a.id, dyn: a.dyn, list: a.list, text: '' }));
  const itemId = `market-${createHash('sha1').update(JSON.stringify([l.baseId, l.level, l.affixes.map((a) => [a.id, a.dyn, a.list]), l.awaken])).digest('hex').slice(0, 16)}`;
  if (l.type === 34) {
    const slot = lo.heroMemories.find((m) => m.baseId === l.baseId)?.slot;
    if (slot === undefined) return `you hold no ${label} to replace`;
    const items = lo.heroMemories.flatMap((m) => (m.slot !== slot ? [m] : m.label === 'awaken' ? [] : [
      { label, slot, baseId: l.baseId, itemId, awakenBaseAttrBoost: l.awaken!.boost, defaultSlotAffixBoost: null, affixes },
      ...l.awaken!.affixes.map((a) => ({ label: 'awaken', slot, affixes: [{ id: a.id, dyn: a.dyn, text: 'awaken' }] }))]));
    return [{ slot: `memory ${slot}`, change: { kind: 'patch', op: 'memories', items } as never }];
  }
  if (l.type === 39) {
    const roll = (ids: number[]) => l.affixes.find((a) => ids.includes(a.id))?.dyn[0], medium = roll(MEDIUM), micro = roll(MICRO);
    const unpriced = micro !== undefined && micro > -100 ? `its Micro ${micro >= 0 ? '+' : ''}${micro}% on the area's micro talent not priced` : '';
    if (medium === undefined) return `no reflected Medium Talent line read (${label})`;
    // a copy at -100 % weighs 0, which dps-debug refuses
    if (medium <= -100) return `Medium -100%: none of the example build's Medium talents reflected${unpriced && `; ${unpriced}`} (${label})`;
    const change = inverseImage(state.loadout as never, medium);
    if (!change.copies.length) return `none of the example build's reflected Medium talents on your page (${label})`;
    return [{ slot: `talent prism, placed like the example build's${unpriced && `; ${unpriced}: at least this`}`, change: change as never }];
  }
  // one Vorax Gear at a time (tlidb, every limb base: "You can only equip 1 Vorax Gear"): yours comes out; one worn in another slot leaves that slot empty
  if (l.type === 41) return (TYPE_SLOTS[rows<{ i20: number }>('config_item_base')[l.baseId]?.i20] ?? []).map((slot) => ({
    slot: [slot, ...lo.vorax.filter((v) => v.slot !== slot).map((v) => `${v.slot} left empty`)].join(', '),
    change: { kind: 'patch', op: 'vorax', items: [{ label, slot, baseId: l.baseId, itemId, level: l.level, affixes }] } as never }));
  const slots = slotsOfBase(l.baseId, state.skill).slots, modifiers: Record<string, { id: number; dynArgs: number[] }[]> = {};
  if (!slots.length) return `not worn by ${state.skill} (${label})`;
  for (const a of l.affixes) (modifiers[GEAR_KEY[a.list] ?? a.list] ??= []).push({ id: a.id, dynArgs: a.dyn });
  return slots.map((slot) => ({ slot, change: { kind: 'gear', slot, item: { baseId: l.baseId, itemId, level: l.level, modifiers } } as Change }));
}
