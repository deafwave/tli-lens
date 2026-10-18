/** The market search on screen ranked by the model: a gear search by each listing's DPS gain per FE in place of what you wear in its slot.
 *  --craft ranks gear instead by price + the expected crafting left to have every wanted mod at T1 (market-targets.json at the repository root, by base
 *  name; each missing T1 at craftStep's expected embers at etor prices, cached 30 minutes). No damage figures.
 *  A slate search (listings with talents) is ranked instead by the model's damage gain of the listing's talents in place of one of your slates (the best one
 *  named; the owner rebuilds the board around the slates bought, so the shape is not held to the replaced one's; --same-shape holds it)
 *  (--export <export.json>, default the newest dps-debug game/exports read). A listing only goes in place of a slate the board's caps allow (SLATE_CAP: a
 *  Pedigree only in place of your Pedigree); of those, your weakest slate (the one whose removal costs least) and any slate sharing one of its talents; each also with
 *  your slates whose talents it all carries emptied (a 2-line Corner of Divinity frees one of your 1-line ones), each place freed valued at your weakest slate of its type;
 *  --exact prices it in place of every one it can replace.
 *  A vorax limb search: each in its slot type's slot; a hero memory search: each in place of yours of its kind.
 *  --watch: keep running, read your character fresh from the game, re-read the screen 10 times a second and redraw the ranking as each figure lands (the page
 *  on screen is priced first; the workers start at once and stay warm).
 *  usage (repo root, elevated shell, game running, a market search open): pnpm guide:market [--top N] [--watch] [--workers N, default 12] [--exact] [--file <saved listings.json>] [--export <export.json>] */
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { writeAtomic } from '../src/atomic';
import { craftStep } from '../src/candidates/gear';
import { places, type Listing } from '../src/listing';
import { localItems } from '../src/modes';
import { fetchSeason, fetchSnapshot, snapshotBook, type EtorItems } from '../src/pricing';
import { pinCommit, table } from '../src/pin';
import { copiedFrom, copyPlaces, freed, influenceText, replaceable, replaceSlate, screenSlate, slateName, withSlate, type SeenSlate } from '../src/candidates/slates';
import { createEvaluator } from '../src/engine/pool';
import { canonical } from '../src/engine/memo';
import { talentName } from '../src/names';
import { rankable, rankedOn, ctxOfState } from '../src/search';
import { fromExport } from '../src/start';
import { DEFAULT_PLAN } from '../src/plan';
import type { Change, EvalCtx, Evaluator, Figure, State } from '../src/types';

/** rows: the ranked listings for --watch's lists kept across pages (id: the listing without its place on the page; gain, and per: gain per FE, a loss below every gain) */
type Row = { id: string; gain: number; per: number; text: string };
type Ranked = { lines: string[]; pending: number; kind?: string; rows?: Row[] };
const rowId = (l: Listing) => JSON.stringify({ ...l, n: 0 });
const FE = 100300;   // item_base|name|100300 Flame Elementium: a listing's PriceType
const root = fileURLToPath(new URL('../../../', import.meta.url));
const argv = process.argv, has = (f: string) => argv.includes(`--${f}`), arg = (f: string) => (has(f) ? argv[argv.indexOf(`--${f}`) + 1] : undefined);
const top = Number(arg('top')) || 8, watch = has('watch'), exact = has('exact'), same = has('same-shape');
const file = arg('file') && resolve(process.env.INIT_CWD ?? process.cwd(), arg('file')!);   // --file <listings.json>: a saved read instead of the live game
const screen = () => (file ? readFileSync(file, 'utf8') : execFileSync('python', [`${root}scripts/market_listings.py`], { encoding: 'utf8', maxBuffer: 64 << 20 }));

/** etor's live snapshot, kept on disk and fetched again once it is 30 minutes old (etor down: the old one, said so) */
const SNAPSHOT = `${root}packages/guide/.cache/etor-snapshot.json`, SNAPSHOT_MS = 30 * 60_000;
async function prices(): Promise<EtorItems> {
  if (existsSync(SNAPSHOT) && Date.now() - statSync(SNAPSHOT).mtimeMs < SNAPSHOT_MS) return JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  try { const s = await fetchSnapshot(await fetchSeason(), localItems()); writeAtomic(SNAPSHOT, JSON.stringify(s)); return s; }
  catch (e) { if (!existsSync(SNAPSHOT)) throw e; console.warn(`etor unavailable (${(e as Error).message}): prices from ${statSync(SNAPSHOT).mtime.toLocaleString()}`); return JSON.parse(readFileSync(SNAPSHOT, 'utf8')); }
}

const targets: Record<string, { want: number[] }> = JSON.parse(readFileSync(`${root}market-targets.json`, 'utf8'));
const lang = table<{ rows: Record<string, string> }>('lang_en').rows;
const group = (id: number) => Math.floor(id / 100);
async function rankGear(listings: Listing[]): Promise<Ranked> {
  const ctx = { prices: snapshotBook(await prices()), level: 100, notSearched: new Set<string>() };
  const rows = listings.map((l) => {
    const base = lang[`item_base|name|${l.baseId}`] ?? String(l.baseId), want = targets[base]?.want;
    if (!want) return { l, base, total: null as number | null, left: [] as string[], have: [] as string[] };
    const mods = l.affixes.filter((a) => a.list === 'PrefixInfoList' || a.list === 'SuffixInfoList');
    const at = (id: number) => mods.find((a) => group(a.id) === group(id));
    const left = want.filter((id) => at(id)?.tier !== 1);
    const craft = left.map((id) => craftStep(l.baseId, id, ctx)?.costFE ?? NaN).reduce((a, b) => a + b, 0);
    return { l, base, total: l.price + craft, left: left.map((id) => `${at(id) ? `T${at(id)!.tier}->T1` : 'add T1'} ${(craftStep(l.baseId, id, ctx)?.text ?? String(id)).replace(/\(.*?\)/g, '').slice(0, 34).trim()}`),
      have: want.filter((id) => at(id)?.tier === 1).map((id) => at(id)!.text.slice(0, 40)) };
  });
  const known = rows.filter((r) => r.total !== null).sort((a, b) => a.total! - b.total!);
  const lines = [...new Set(rows.filter((r) => r.total === null).map((r) => r.base))].map((b) => `no target for ${b}: add it to market-targets.json`);
  lines.push(`${listings.length} listings; ranked by price + expected crafting to all wanted mods at T1 (etor ember prices of ${ctx.prices.fetchedAt ?? 'the stored snapshot'})`);
  for (const r of known.slice(0, top))
    lines.push(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(5)} FE + craft ${String(Math.round(r.total! - r.l.price)).padStart(5)} = ${String(Math.round(r.total!)).padStart(5)} FE | T1 already: ${r.have.join(', ') || 'none'} | to craft: ${r.left.join('; ')}`);
  return { lines, pending: 0 };
}

/** your character: the newest dps-debug read (--export to choose), on the target the plan ranks on (plan.ts DEFAULT_PLAN, --target to change) */
const exports = resolve(process.env.DPS_DEBUG ?? `${root}../dps-debug`, 'game/exports');
function load(): { exp: string; state: State; ctx: EvalCtx; key: string } {
  const exp = arg('export') ? resolve(process.env.INIT_CWD ?? process.cwd(), arg('export')!)
    : readdirSync(exports).sort().reverse().map((d) => resolve(exports, d, `export-${d}.json`)).find((f) => { try { return readFileSync(f).length > 0; } catch { return false; } })!;
  const state = { ...fromExport(JSON.parse(readFileSync(exp, 'utf8')), 0), target: arg('target') ?? DEFAULT_PLAN.target };
  return { exp, state, ctx: ctxOfState(state), key: createHash('sha1').update(canonical([state.loadout, state.level, state.skill, state.target])).digest('hex').slice(0, 16) };
}
let who: ReturnType<typeof load> | undefined, note = '';
const character = () => (who ??= load());
/** --watch on the game prices against the newest read at once and reads your character again alongside (dps-debug reader/export.py, ~16 s): when it changed
 *  since, every figure is priced again against the new read. Not readable (the game at character select, a shell not elevated): the newest read, said so. */
function reread() {
  const dd = resolve(exports, '../..');
  note = ' (reading your character)';
  execFile('python', ['-I', resolve(dd, 'reader/export.py'), '--no-clipboard'], { cwd: dd, maxBuffer: 64 << 20 }, (e, _out, err) => {
    if (e) { note = ` (could not read your character: ${String(err || e.message).trim().split(/\r?\n/).at(-1)})`; return landed(); }
    const next = load(), old = character();
    note = next.key === old.key ? '' : ` (your character changed since ${basename(old.exp)}: priced again)`;
    if (next.key === old.key) { who = { ...old, exp: next.exp }; return landed(); }
    who = next; gen++; base = undefined; settled.clear(); asked.clear(); waiting.length = 0;
    void warm().then(rebase);
  });
}
/** the evaluator, started on the first figure a search needs (--watch: at once) and kept; your character's figure, again when it changed (`gen`) */
let warmRun: Promise<void> | undefined, ev: Evaluator | undefined, base: Figure | undefined, gen = 0;
// 12 workers (~1.5 GB each) by default: 96 slate figures took 3.32 figures/s on 8, 4.16 on 12, 4.05 on 16, 3.67 on 20 (2026-10-18, 16 cores, the game running): the figures are bound by memory
// bandwidth, not cores (8 single-threaded processes on one CCD price as many as 16 across both)
const warm = () => warmRun ??= createEvaluator({ memoDir: `${root}packages/guide/.cache/memo`, workers: Number(arg('workers')) || 12 }).then((e) => { ev = rankedOn(e, arg('target') ?? DEFAULT_PLAN.target); return rebase(); });
async function rebase() {
  const g = gen, { state, ctx } = character(), f = (await ev!.run(state.loadout, [], ctx)).figure;
  if (g !== gen) return;
  base = f;
  // what each of your slates is worth, which a slate search needs before any listing: priced while you open the search
  if (watch) ((state.loadout.slateItems ?? []) as unknown[]).forEach((_, i) => { slate(i, []); dropDamage(i); });
  pump(); landed();
}
/** a figure against your character's: the gain in what it ranks by (rankedOn: raw DPS; the Traveler's capped at 15T), or what a partial figure dropped / why it stopped (never ranked) */
const versus = (f: Figure): number | string => (rankable(base!, f) ? f.kill / base!.kill - 1 : f.stop ?? f.partial.filter((p) => !base!.partial.includes(p)).join('; '));
/** the same, the uncapped damage at full Life: what the slate screen multiplies. A capped figure does not multiply (owner's 2026-10-18 11:27 read: 1.90e13 against
 *  the 1.50e13 lock; a listing screened at -0.72 % was +3.17 % exact) */
const damageVs = (f: Figure): number | string => (rankable(base!, f) ? f.life100 / base!.life100 - 1 : versus(f));

/** Figures as they land. `want` gives a key's gain once settled, else queues it once and gives undefined. The evaluator is handed no more than it runs at
 *  once and the page on screen goes first, so a page flipped past never holds up the one shown; `landed` redraws. */
/** gains on disk by pin, character (load's key) and figure (a dead worker's is not kept): a listing seen by an earlier run prints without starting the evaluator */
const GAINS = `${root}packages/guide/.cache/market-gains.json`, pin = pinCommit().slice(0, 8);
const gains: Record<string, number | string> = existsSync(GAINS) ? JSON.parse(readFileSync(GAINS, 'utf8')) : {};
let unsaved = false;
/** every slate listing read from the game, the plan's slates to buy; a week old, dropped */
const SEEN = `${root}packages/guide/.cache/slate-listings.json`;
const seen: Record<string, SeenSlate> = existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, 'utf8')) : {};
function remember(slates: Listing[]) {
  const fresh = slates.filter((l) => l.priceType === FE && !(rowId(l) in seen));
  if (!fresh.length || file) return;
  for (const l of fresh) seen[rowId(l)] = { talents: l.talents ?? [], price: l.price, at: new Date().toISOString(), baseId: l.baseId, shapeId: l.shapeId!, ...(l.influenceId ? { influenceId: l.influenceId } : {}) };
  for (const [k, v] of Object.entries(seen)) if (Date.now() - Date.parse(v.at) > 7 * 864e5) delete seen[k];
  writeAtomic(SEEN, JSON.stringify(seen));
}
const settled = new Map<string, number | string>(), asked = new Set<string>(), waiting: { page: number; k: string; changes: Change[]; damage?: boolean }[] = [];
let page = 0, running = 0, landed = () => {};
function pump() {
  while (base && running < (ev!.parallelism ?? 8) && waiting.length) {
    const [w] = waiting.splice(Math.max(0, waiting.findIndex((x) => x.page === page)), 1), { state, ctx } = character(), g = gen;
    running++;
    ev!.run(state.loadout, w.changes, ctx).then((r) => g === gen && settled.set(w.k, (w.damage ? damageVs : versus)(r.figure)), (e: Error) => g === gen && settled.set(w.k, e.message))
      .finally(() => { running--; pump(); landed(); });
  }
}
/** peek: a page flipped past, its figures not yet asked queued behind the page on screen, none moved ahead of it */
let peek = false;
function want(k: string, changes: () => Change[], damage = false): number | string | undefined {
  const disk = `${pin}|${character().key}|${k}`;
  if (disk in gains) return gains[disk];
  if (settled.has(k)) { const g = settled.get(k)!; if (!/figure worker|evaluator closed/.test(String(g))) { gains[disk] = g; unsaved = true; } return g; }
  if (!asked.has(k)) { asked.add(k); waiting.push({ page: peek ? -1 : page, k, changes: changes(), damage }); void warm(); pump(); }
  else if (!peek) { const w = waiting.find((x) => x.k === k); if (w) w.page = page; }
  return undefined;
}
/** a row's gain for sorting: pending rows last, partial ones just above them */
const num = (g: number | string | undefined) => (typeof g === 'number' ? g : g === undefined ? -Infinity : -1e300);


/** A gear, vorax limb or hero memory search: each listing in place of what you wear (places), by the model's DPS gain per FE. */
function rankWorn(listings: Listing[]): Ranked {
  const { exp, state } = character(), gain = (change: Change) => want(createHash('sha1').update(JSON.stringify(change)).digest('hex').slice(0, 16), () => [change]);
  const rows = listings.map((l) => {
    const ps = l.priceType === FE ? places(l, state) : `priced in item ${l.priceType}, not Flame Elementium`;
    if (typeof ps === 'string') return { l, g: ps as number | string | undefined, slot: '' };
    const gs = ps.map(({ slot, change }) => ({ l, g: gain(change), slot }));
    return gs.some((r) => r.g === undefined) ? { l, g: undefined, slot: '' } : gs.sort((a, b) => num(b.g) - num(a.g))[0];
  });
  const pending = rows.filter((r) => r.g === undefined).length;
  // a gain per FE; a loss below every gain, by how much it loses (per FE it would rank the dearest loss first)
  const per = (r: { l: Listing; g?: number | string }) => (num(r.g) > 0 ? num(r.g) / Math.max(r.l.price, 1) : num(r.g) - 1);
  const lines = [`${listings.length} listings${pending ? ` (${pending} pricing)` : ''}; ranked by DPS gain on ${state.target} per FE, each in place of what you wear, on ${exp}`];
  const best = rows.reduce((a, b) => (num(b.g) > num(a.g) ? b : a));
  for (const r of rows.sort((a, b) => per(b) - per(a)).slice(0, top)) {
    const tiers = r.l.affixes.filter((a) => a.list === 'PrefixInfoList' || a.list === 'SuffixInfoList').map((a) => `T${a.tier}`).join(' ');
    lines.push(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(6)} FE  ${r.g === undefined ? '  pricing' : typeof r.g === 'string' ? `  partial | not ranked: ${r.g.slice(0, 160)}`
      : `${pct(r.g).padStart(8)}  ${(r.g * 1e4 / Math.max(r.l.price, 1)).toFixed(2).padStart(6)}%/100FE | ${r.slot} | ${tiers}${r === best && r.g > 0 ? ' | best outright' : ''}`}`);
  }
  if (!rows.slice(0, top).includes(best) && typeof best.g === 'number' && best.g > 0) lines.push(`best outright: #${best.l.n} ${best.l.price} FE ${pct(best.g)}`);
  const short = rows.flatMap((r) => (typeof r.g === 'number' ? [{ id: rowId(r.l), gain: r.g, per: per(r),
    text: `${pct(r.g).padStart(8)} ${(r.g * 1e4 / Math.max(r.l.price, 1)).toFixed(2).padStart(6)}%/100FE ${String(r.l.price).padStart(6)} FE  ${lang[`item_base|name|${r.l.baseId}`] ?? r.l.baseId}` }] : []));
  return { lines, pending, rows: short };
}

/** your slate i holding talents `t` (the same talents in another order: one figure) on the listing's base (its shape stays: the board is rebuilt around it),
 *  the `freed` slates emptied */
const slate = (i: number, t: number[], baseId?: number, freed: number[] = []) =>
  want(`slate|${i}|${baseId ?? ''}|${[...t].sort()}${freed.length ? `|free ${freed}` : ''}`, () => [replaceSlate(character().state, i, t, baseId === undefined ? undefined : { baseId }, freed)]);
/** your slate i emptied, as damage at full Life (the screen's unit) */
const dropDamage = (i: number) => want(`dmg|slate|${i}`, () => [replaceSlate(character().state, i, [])], true);

/** A slate search: each listing's talents (on its own base) in place of one of your slates the board's caps let it replace */
function rankSlates(slates: Listing[]): Ranked {
  const { exp, state } = character();
  const mine = (state.loadout.slateItems ?? []) as { baseId: number; shapeId?: number; talents: number[] }[];
  // what each of your slates is worth: an empty slate in its place
  const drop = mine.map((_, i) => slate(i, []));
  // ponytail: the weakest slate (+ any sharing a talent) stands in for every slate - exact when talents multiply; a listing that interacts with another
  // slate some other way is ranked low. --exact prices every slot.
  const gain = (l: Listing): { g?: number | string; gc?: number | string; slot?: number; free?: number[] } => {
    if (l.priceType !== FE) return { g: `priced in item ${l.priceType}, not Flame Elementium` };
    const fits = replaceable(mine, l.baseId).filter((i) => !same || mine[i].shapeId === l.shapeId);
    if (!fits.length) return { g: `no slate on your board it can go in place of (${same ? `shape ${l.shapeId}, ` : ''}base ${l.baseId}: SLATE_CAP)` };
    if (!exact && fits.some((i) => drop[i] === undefined)) return {};
    const weakest = fits.filter((i) => typeof drop[i] === 'number').sort((a, b) => (drop[b] as number) - (drop[a] as number))[0];
    const tries = exact || weakest === undefined ? fits
      : fits.filter((i) => i === weakest || typeof drop[i] !== 'number' || mine[i].talents.some((t) => l.talents!.includes(t)));
    // a slate whose lines the listing all carries is freed (its lines capped at one copy add nothing twice); its place is worth your weakest slate of its type
    // ponytail: a freed place valued at your weakest slate of its base (what one more such slate gives at least); slateWants would price what to put there
    const place = (j: number) => { const w = mine.flatMap((m, k) => (m.baseId === mine[j].baseId ? [drop[k]] : [])); return w.includes(undefined) ? undefined : Math.max(0, -Math.max(...w.map(num))); };
    const gs = tries.flatMap((i) => {
      const free = freed(mine, i, l.talents!, fits), one = { g: slate(i, l.talents!, l.baseId), slot: i };
      if (!free.length) return [one];
      const gc = slate(i, l.talents!, l.baseId, free), ps = free.map(place);
      return [one, { g: typeof gc === 'number' && !ps.includes(undefined) ? gc + ps.reduce((a, b) => a! + b!, 0)! : gc, gc, slot: i, free }];
    });
    return gs.some((x) => x.g === undefined) ? {} : gs.sort((a, b) => num(b.g) - num(a.g))[0];
  };
  // a Sparks of Moth Fire (no lines: it copies the last line of the slate on the side it rolled) where it sits on your board as it is (copyPlaces), screened by the lines it
  // copies there x what the slate it replaces keeps; its best 3 places priced, each figure shared by every listing of that side
  const copier = (l: Listing) => !l.talents?.length && !!l.influenceId;
  const where = (l: Listing, p: ReturnType<typeof copyPlaces>[number]) => `${slateName(l.shapeId!) ?? `slate ${l.baseId}`} (${influenceText(l.influenceId!).split('.')[0]}) at column ${p.at[0]}, row ${p.at[1]}${p.replaced === undefined ? '' : ` in place of your slate ${p.replaced + 1}`}: copies ${p.copies.map(talentName).join(' + ')}`;
  const copyScreen = (l: Listing) => copyPlaces(state, { baseId: l.baseId, shapeId: l.shapeId!, influenceId: l.influenceId }).map((p) => {
    const gs = p.copies.map((t) => line(t)), keep = p.replaced === undefined ? 0 : dropD[p.replaced];
    return { p, e: gs.includes(undefined) || keep === undefined ? undefined : gs.reduce((q: number, x) => q * (typeof x === 'number' ? 1 + x : 1), 1) * (1 + (typeof keep === 'number' ? keep : 0)) - 1 };
  });
  const copyGain = (l: Listing): { g?: number | string; slot?: number; where?: string } => {
    const ps = copyScreen(l);
    if (ps.some((x) => x.e === undefined)) return {};
    if (!ps.length) return { g: 'it copies no line in any place on your board' };
    const gs = ps.sort((a, b) => b.e! - a.e!).slice(0, 3).map(({ p }) => ({ g: want(`copy|${l.shapeId}|${l.influenceId}|${p.replaced ?? 'free'}|${p.at}`, () => [{ kind: 'patch', op: 'slate-board', items: p.items } as never]), slot: p.replaced, where: where(l, p) }));
    return gs.some((x) => x.g === undefined) ? {} : gs.sort((a, b) => num(b.g) - num(a.g))[0];
  };
  const freeing = (r: { g?: number | string; gc?: number | string; free?: number[] }) => (r.free && typeof r.g === 'number'
    ? `, freeing your slate${r.free.length > 1 ? 's' : ''} ${r.free.map((j) => j + 1).join(' + ')} (${pct(r.gc as number)} with ${r.free.length > 1 ? 'them' : 'it'} empty, + ${pct(r.g - (r.gc as number))}: each place at your weakest slate of its type)` : '');
  // every listing screened from its lines (one figure a line, shared by every listing that carries it: screenSlate) in place of each slate it fits; only the page's
  // best screens get their exact figures (owner, 2026-10-18: 8,942 slates read, 21 priced, the snipes sold first); --exact prices every listing
  const line = (t: number) => want(`dmg|line|${t}`, () => [withSlate(state, [t])!], true), dropD = mine.map((_, i) => dropDamage(i)), copied = copiedFrom(mine as never);
  // the screen is uncapped damage (it multiplies): the ranking's own unit except on the Traveler (capped), where its rows rank below the priced ones and stay off the lists
  const sameUnit = state.target !== 'traveler';
  const screen = (l: Listing): { e?: number; slot?: number; where?: string } => {
    if (copier(l)) { const ps = copyScreen(l); if (ps.some((x) => x.e === undefined)) return {}; const b = ps.sort((a, c) => c.e! - a.e!)[0]; return b ? { e: b.e, slot: b.p.replaced, where: where(l, b.p) } : { e: -1 }; }
    const fits = l.priceType === FE ? replaceable(mine, l.baseId).filter((i) => (!same || mine[i].shapeId === l.shapeId) && typeof dropD[i] === 'number') : [];
    const gs = new Map(l.talents!.map((t) => [t, line(t)]));
    if (!fits.length || [...gs.values()].includes(undefined)) return {};
    const g = (t: number) => { const x = gs.get(t); return typeof x === 'number' ? 1 + x : 1; };
    return fits.map((i) => ({ e: screenSlate(l.talents!, g, 1 + (dropD[i] as number), mine[i].talents, copied[i]) - 1, slot: i })).sort((a, b) => b.e - a.e)[0];
  };
  const est = slates.map((l) => ({ l, ...screen(l) })), ok = est.filter((x) => x.e !== undefined && x.e > 0.005);
  const pick = new Set([...[...ok].sort((a, b) => b.e! / Math.max(b.l.price, 1) - a.e! / Math.max(a.l.price, 1)).slice(0, 3), ...[...ok].sort((a, b) => b.e! - a.e!).slice(0, 2)].map((x) => x.l));
  const rows = est.map(({ l, e, slot, where }) => (exact || pick.has(l) || e === undefined ? { l, ...(copier(l) ? copyGain(l) : gain(l)) } : { l, g: e, slot, where, est: true, free: undefined })) as
    { l: Listing; g?: number | string; gc?: number | string; slot?: number; free?: number[]; where?: string; est?: boolean }[], pending = rows.filter((r) => r.g === undefined).length;
  const what = (r: (typeof rows)[number]) => r.where ?? r.l.talents!.map(talentName).join(' + ');
  const lines = [`${slates.length} slates${pending ? ` (${pending} pricing)` : ''}; ~ = screened from its lines: damage at full Life, not priced${sameUnit ? '' : ` (listed below the priced ones, which are capped at 15T)`}; ranked by DPS gain on ${state.target} in place of ${exact ? 'one of your slates' : 'your weakest slate (or one sharing a talent)'} the board's caps allow${same ? ', of the same shape' : ''} (a slate whose lines it all carries freed), on ${exp} (L${state.level} ${state.skill}); your slates: ${mine.map((m, i) => `${i + 1} shape ${m.shapeId}${typeof drop[i] === 'number' ? ` (${pct(drop[i] as number)} without it)` : ''}`).join(', ')}`];
  const rankOf = (r: { g?: number | string }) => ('est' in r && !sameUnit ? -1e9 : 0) + num(r.g);
  for (const r of rows.sort((a, b) => rankOf(b) - rankOf(a)).slice(0, top))
    lines.push(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(5)} FE  ${r.g === undefined ? '  pricing' : typeof r.g === 'string' ? '  partial' : `${('est' in r ? '~' : '') + pct(r.g).padStart(8)}  ${(r.g * 100 / Math.max(r.l.price, 1) * 100).toFixed(2).padStart(6)}%/100FE`} | ${what(r)}${r.slot !== undefined && !r.where && typeof r.g === 'number' ? ` | in place of your slate ${r.slot + 1}${freeing(r)}` : ''}${typeof r.g === 'string' ? ` | not ranked: ${r.g.slice(0, 160)}` : ''}`);
  const short = rows.flatMap((r) => (typeof r.g === 'number' && (sameUnit || !('est' in r)) ? [{ id: rowId(r.l), gain: r.g, per: r.g > 0 ? r.g / Math.max(r.l.price, 1) : r.g - 1,
    text: `${'est' in r ? '~' : ' '}${pct(r.g).padStart(8)} ${(r.g * 1e4 / Math.max(r.l.price, 1)).toFixed(2).padStart(6)}%/100FE ${String(r.l.price).padStart(6)} FE  ${r.where ?? `slate ${r.slot! + 1}${r.free ? ` (frees ${r.free.map((j) => j + 1).join('+')})` : ''}: ${what(r)}`}` }] : []));
  return { lines, pending, rows: short };
}
const pct = (g: number) => `${g >= 0 ? '+' : ''}${(g * 100).toFixed(2)}%`;

/** the listings ranked from the figures landed so far */
async function rank(listings: Listing[]): Promise<Ranked> {
  if (!listings.length) return { lines: ['no market search result on screen (open a search in the auction house first)'], pending: 0 };
  const slates = listings.filter((l) => l.type === 26 || l.talents?.length);
  remember(slates);
  const r = { kind: slates.length ? 'slates' : 'gear', ...(slates.length ? rankSlates(slates) : has('craft') ? await rankGear(listings) : rankWorn(listings)) };
  if (!r.pending && unsaved) { writeAtomic(GAINS, JSON.stringify(gains)); unsaved = false; }
  return r;
}
const parse = (text: string): Listing[] => JSON.parse(text).map((l: Listing, i: number) => ({ ...l, n: l.n ?? i + 1 }));

/** --watch reads through one python kept attached to the game (a new one costs ~0.8 s to start and attach, a read ~0.2 s) */
function reader() {
  let out: AsyncIterator<string>, py: ReturnType<typeof spawn>;
  const start = () => {
    py = spawn('python', [`${root}scripts/market_listings.py`, '--serve'], { stdio: ['pipe', 'pipe', 'inherit'] });
    py.stdin!.on('error', () => {});   // a reader that died: its exit is the error, read below
    out = createInterface({ input: py.stdout! })[Symbol.asyncIterator]();
  };
  start();
  return async () => {
    py.stdin!.write('\n');
    const { value, done } = await out.next();
    if (done) { start(); throw new Error('the market reader exited: started again'); }
    const r = JSON.parse(value);
    if (!Array.isArray(r)) throw new Error(r.error);
    return value as string;
  };
}

try {
  if (!watch) {
    const listings = parse(screen());
    let landings = 0, wake = () => {};
    landed = () => { landings++; wake(); };
    for (;;) {
      const seen = landings, r = await rank(listings);
      if (!r.pending) { console.log(r.lines.join('\n')); break; }
      if (landings === seen) await new Promise<void>((ok) => (wake = ok));
    }
  } else {
    // a terminal: the list redrawn as each figure lands; a pipe: printed once ranked. The list is the best of every page seen (by search kind) for this
    // character, one line each, cut to the terminal's width
    const tty = process.stdout.isTTY, read = file ? async () => readFileSync(file, 'utf8') : reader();
    let shown: Listing[] | undefined, at = '', printed = '', drawing = false, again = false, keptGen = gen;
    const kept = new Map<string, Map<string, Row>>(), pages = new Map<string, Listing[]>(), done = new Set<string>();
    const kindOf = (ls: Listing[]) => (ls.some((l) => l.type === 26 || l.talents?.length) ? 'slates' : 'gear');
    // the slate listings read in the last 6 hours (slate-listings.json, keyed by the listing itself) are queued again, behind the page on screen: a restart
    // keeps the queue (owner, 2026-10-18)
    const recent = Object.entries(seen).filter(([, v]) => Date.now() - Date.parse(v.at) < 6 * 36e5).map(([k]) => JSON.parse(k) as Listing);
    for (let i = 0; i < recent.length; i += 25) pages.set(`remembered|${i}`, recent.slice(i, i + 25).map((l, j) => ({ ...l, n: j + 1 })));
    let backAt = 0;
    const cut = (s: string) => { const w = (process.stdout.columns || 120) - 1; return s.length > w ? `${s.slice(0, w - 1)}…` : s; };
    const draw = async () => {
      if (drawing) return void (again = true);
      drawing = true;
      try {
        do {
          again = false;
          if (!shown) continue;
          const p = page, r = await rank(shown), p2 = `${p}|${gen}`;
          if (keptGen !== gen) { kept.clear(); done.clear(); keptGen = gen; }
          let lines = r.lines, head = `${at}${base || !warmRun ? '' : ' (the evaluator is starting)'}${note}`;
          if (r.rows) {
            const into = (kind: string, rows: Row[]) => { const m = kept.get(kind) ?? new Map<string, Row>(); kept.set(kind, m); for (const row of rows) m.set(row.id, row); };
            into(r.kind!, r.rows);
            // every page flipped past, of any search, as its figures land (every 2 s: ~10k listings take a while to rank): a search you moved on from keeps
            // pricing and keeps its list (owner, 2026-10-18: "make it so I can move on once things are in the queue"); a page all priced is merged once
            if (Date.now() - backAt > 2000) {
              backAt = Date.now(); peek = true;
              try {
                for (const [t, ls] of pages) {
                  if (done.has(t) || ls === shown) continue;
                  const b = await rank(ls);
                  into(b.kind ?? kindOf(ls), b.rows ?? []);
                  if (!b.pending) done.add(t);
                }
              } finally { peek = false; }
            }
            const list = (m: Map<string, Row>, by: 'gain' | 'per') => [...m.values()].sort((a, b) => b[by] - a[by]).slice(0, top).map((x) => x.text);
            lines = [...kept].sort(([a]) => (a === r.kind ? -1 : 1))
              .flatMap(([kind, m]) => [`${kind}: best of ${m.size}`, '  by gain:', ...list(m, 'gain'), '  by gain per FE:', ...list(m, 'per')]);
            head = `${at} ${r.kind} on screen, vs ${character().state.target}${waiting.length ? `: ${waiting.length} figures queued` : ''}${head.slice(at.length)}`;
          }
          const out = [head, ...lines].map(cut).join('\n');
          if (tty) process.stdout.write(`\x1b[H\x1b[J${out}\n`);
          else if (!r.pending && printed !== p2) { printed = p2; console.log(`\n${out}`); }
        } while (again);
      } catch (e) { console.warn(`market: ${(e as Error).message}`); } finally { drawing = false; }
    };
    landed = () => void draw();
    if (!has('craft')) { void warm(); if (!file && !arg('export')) reread(); }
    for (let last = ''; ;) {
      try {
        const text = await read();
        if (text !== last) { last = text; page++; shown = pages.get(text) ?? parse(text); pages.set(text, shown); at = new Date().toLocaleTimeString(); void draw(); }
      } catch (e) { console.warn(`market: ${(e as Error).message.split(/\r?\n/).filter(Boolean).at(-1)}`); }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
} finally { await ev?.close(); }
process.exit(0);
