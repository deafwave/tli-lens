/** The market search on screen ranked by the model: a gear search by each listing's kill-speed gain per FE in place of what you wear in its slot.
 *  --craft ranks gear instead by price + the expected crafting left to have every wanted mod at T1 (market-targets.json at the repository root, by base
 *  name; each missing T1 at craftStep's expected embers at etor prices, cached 30 minutes). No damage figures.
 *  A slate search (listings with talents) is ranked instead by the model's damage gain of the listing's talents in place of one of your slates (the best one
 *  named; the owner rebuilds the board around the slates bought, so the shape is not held to the replaced one's; --same-shape holds it)
 *  (--export <export.json>, default the newest dps-debug game/exports read). A listing only goes in place of a slate the board's caps allow (SLATE_CAP: a
 *  Pedigree only in place of your Pedigree); of those, your weakest slate (the one whose removal costs least) and any slate sharing one of its talents;
 *  --exact prices it in place of every one it can replace.
 *  A vorax limb search: each in its slot type's slot; a hero memory search: each in place of yours of its kind.
 *  --watch: keep running, read your character fresh from the game, re-read the screen 10 times a second and redraw the ranking as each figure lands (the page
 *  on screen is priced first; the workers start at once and stay warm).
 *  usage (repo root, elevated shell, game running, a market search open): pnpm guide:market [--top N] [--watch] [--workers N, default 8] [--exact] [--file <saved listings.json>] [--export <export.json>] */
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
import { replaceable, replaceSlate } from '../src/candidates/slates';
import { createEvaluator } from '../src/engine/pool';
import { canonical } from '../src/engine/memo';
import { talentName } from '../src/names';
import { rankable, ctxOfState } from '../src/search';
import { fromExport } from '../src/start';
import { DEFAULT_PLAN } from '../src/plan';
import type { Change, EvalCtx, Evaluator, Figure, State } from '../src/types';

/** rows: the ranked listings for --watch's list kept across pages (id: the listing without its place on the page; key: its rank, higher first) */
type Row = { id: string; key: number; text: string };
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
// 8 workers (~1.4 GB each) by default: the 16 a plan takes held 21 GB for a page of slates, and 12 or 16 price no more figures a second than 8 (2026-10-17)
const warm = () => warmRun ??= createEvaluator({ memoDir: `${root}packages/guide/.cache/memo`, workers: Number(arg('workers')) || 8 }).then((e) => { ev = e; return rebase(); });
async function rebase() {
  const g = gen, { state, ctx } = character(), f = (await ev!.run(state.loadout, [], ctx)).figure;
  if (g !== gen) return;
  base = f;
  // what each of your slates is worth, which a slate search needs before any listing: priced while you open the search
  if (watch) ((state.loadout.slateItems ?? []) as unknown[]).forEach((_, i) => slate(i, []));
  pump(); landed();
}
/** a figure against your character's: the kill-speed gain, or what a partial figure dropped / why it stopped (never ranked) */
const versus = (f: Figure): number | string => (rankable(base!, f) ? f.kill / base!.kill - 1 : f.stop ?? f.partial.filter((p) => !base!.partial.includes(p)).join('; '));

/** Figures as they land. `want` gives a key's gain once settled, else queues it once and gives undefined. The evaluator is handed no more than it runs at
 *  once and the page on screen goes first, so a page flipped past never holds up the one shown; `landed` redraws. */
/** gains on disk by pin, character (load's key) and figure (a dead worker's is not kept): a listing seen by an earlier run prints without starting the evaluator */
const GAINS = `${root}packages/guide/.cache/market-gains.json`, pin = pinCommit().slice(0, 8);
const gains: Record<string, number | string> = existsSync(GAINS) ? JSON.parse(readFileSync(GAINS, 'utf8')) : {};
let unsaved = false;
const settled = new Map<string, number | string>(), asked = new Set<string>(), waiting: { page: number; k: string; changes: Change[] }[] = [];
let page = 0, running = 0, landed = () => {};
function pump() {
  while (base && running < (ev!.parallelism ?? 8) && waiting.length) {
    const [w] = waiting.splice(Math.max(0, waiting.findIndex((x) => x.page === page)), 1), { state, ctx } = character(), g = gen;
    running++;
    ev!.run(state.loadout, w.changes, ctx).then((r) => g === gen && settled.set(w.k, versus(r.figure)), (e: Error) => g === gen && settled.set(w.k, e.message))
      .finally(() => { running--; pump(); landed(); });
  }
}
function want(k: string, changes: () => Change[]): number | string | undefined {
  const disk = `${pin}|${character().key}|${k}`;
  if (disk in gains) return gains[disk];
  if (settled.has(k)) { const g = settled.get(k)!; if (!/figure worker|evaluator closed/.test(String(g))) { gains[disk] = g; unsaved = true; } return g; }
  if (!asked.has(k)) { asked.add(k); waiting.push({ page, k, changes: changes() }); void warm(); pump(); }
  else { const w = waiting.find((x) => x.k === k); if (w) w.page = page; }
  return undefined;
}
/** a row's gain for sorting: pending rows last, partial ones just above them */
const num = (g: number | string | undefined) => (typeof g === 'number' ? g : g === undefined ? -Infinity : -1e300);


/** A gear, vorax limb or hero memory search: each listing in place of what you wear (places), by the model's kill-speed gain per FE. */
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
  const lines = [`${listings.length} listings${pending ? ` (${pending} pricing)` : ''}; ranked by kill-speed gain vs ${state.target} per FE, each in place of what you wear, on ${exp}`];
  const best = rows.reduce((a, b) => (num(b.g) > num(a.g) ? b : a));
  for (const r of rows.sort((a, b) => per(b) - per(a)).slice(0, top)) {
    const tiers = r.l.affixes.filter((a) => a.list === 'PrefixInfoList' || a.list === 'SuffixInfoList').map((a) => `T${a.tier}`).join(' ');
    lines.push(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(6)} FE  ${r.g === undefined ? '  pricing' : typeof r.g === 'string' ? `  partial | not ranked: ${r.g.slice(0, 160)}`
      : `${pct(r.g).padStart(8)}  ${(r.g * 1e4 / Math.max(r.l.price, 1)).toFixed(2).padStart(6)}%/100FE | ${r.slot} | ${tiers}${r === best && r.g > 0 ? ' | best outright' : ''}`}`);
  }
  if (!rows.slice(0, top).includes(best) && typeof best.g === 'number' && best.g > 0) lines.push(`best outright: #${best.l.n} ${best.l.price} FE ${pct(best.g)}`);
  const short = rows.flatMap((r) => (typeof r.g === 'number' ? [{ id: rowId(r.l), key: per(r),
    text: `${pct(r.g).padStart(8)} ${(r.g * 1e4 / Math.max(r.l.price, 1)).toFixed(2).padStart(6)}%/100FE ${String(r.l.price).padStart(6)} FE  ${lang[`item_base|name|${r.l.baseId}`] ?? r.l.baseId}` }] : []));
  return { lines, pending, rows: short };
}

/** your slate i holding talents `t` (the same talents in another order: one figure) on the listing's base (its shape stays: the board is rebuilt around it) */
const slate = (i: number, t: number[], baseId?: number) =>
  want(`slate|${i}|${baseId ?? ''}|${[...t].sort()}`, () => [replaceSlate(character().state, i, t, baseId === undefined ? undefined : { baseId })]);

/** A slate search: each listing's talents (on its own base) in place of one of your slates the board's caps let it replace */
function rankSlates(slates: Listing[]): Ranked {
  const { exp, state } = character();
  const mine = (state.loadout.slateItems ?? []) as { baseId: number; shapeId?: number; talents: number[] }[];
  // what each of your slates is worth: an empty slate in its place
  const drop = mine.map((_, i) => slate(i, []));
  // ponytail: the weakest slate (+ any sharing a talent) stands in for every slate - exact when talents multiply; a listing that interacts with another
  // slate some other way is ranked low. --exact prices every slot.
  const gain = (l: Listing): { g?: number | string; slot?: number } => {
    if (l.priceType !== FE) return { g: `priced in item ${l.priceType}, not Flame Elementium` };
    const fits = replaceable(mine, l.baseId).filter((i) => !same || mine[i].shapeId === l.shapeId);
    if (!fits.length) return { g: `no slate on your board it can go in place of (${same ? `shape ${l.shapeId}, ` : ''}base ${l.baseId}: SLATE_CAP)` };
    if (!exact && fits.some((i) => drop[i] === undefined)) return {};
    const weakest = fits.filter((i) => typeof drop[i] === 'number').sort((a, b) => (drop[b] as number) - (drop[a] as number))[0];
    const tries = exact || weakest === undefined ? fits
      : fits.filter((i) => i === weakest || typeof drop[i] !== 'number' || mine[i].talents.some((t) => l.talents!.includes(t)));
    const gs = tries.map((i) => ({ g: slate(i, l.talents!, l.baseId), slot: i }));
    return gs.some((x) => x.g === undefined) ? {} : gs.sort((a, b) => num(b.g) - num(a.g))[0];
  };
  const rows = slates.map((l) => ({ l, ...gain(l) })), pending = rows.filter((r) => r.g === undefined).length;
  const lines = [`${slates.length} slates${pending ? ` (${pending} pricing)` : ''}; ranked by damage gain (kill speed vs ${state.target}) in place of ${exact ? 'one of your slates' : 'your weakest slate (or one sharing a talent)'} the board's caps allow${same ? ', of the same shape' : ''}, on ${exp} (L${state.level} ${state.skill}); your slates: ${mine.map((m, i) => `${i + 1} shape ${m.shapeId}${typeof drop[i] === 'number' ? ` (${pct(drop[i] as number)} without it)` : ''}`).join(', ')}`];
  for (const r of rows.sort((a, b) => num(b.g) - num(a.g)).slice(0, top))
    lines.push(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(5)} FE  ${r.g === undefined ? '  pricing' : typeof r.g === 'string' ? '  partial' : `${pct(r.g).padStart(8)}  ${(r.g * 100 / Math.max(r.l.price, 1) * 100).toFixed(2).padStart(6)}%/100FE`} | ${r.l.talents!.map(talentName).join(' + ')}${r.slot !== undefined && typeof r.g === 'number' ? ` | in place of your slate ${r.slot + 1}` : ''}${typeof r.g === 'string' ? ` | not ranked: ${r.g.slice(0, 160)}` : ''}`);
  const short = rows.flatMap((r) => (typeof r.g === 'number' ? [{ id: rowId(r.l), key: r.g,
    text: `${pct(r.g).padStart(8)} ${(r.g * 1e4 / Math.max(r.l.price, 1)).toFixed(2).padStart(6)}%/100FE ${String(r.l.price).padStart(6)} FE  slate ${r.slot! + 1}: ${r.l.talents!.map(talentName).join(' + ')}` }] : []));
  return { lines, pending, rows: short };
}
const pct = (g: number) => `${g >= 0 ? '+' : ''}${(g * 100).toFixed(2)}%`;

/** the listings ranked from the figures landed so far */
async function rank(listings: Listing[]): Promise<Ranked> {
  if (!listings.length) return { lines: ['no market search result on screen (open a search in the auction house first)'], pending: 0 };
  const slates = listings.filter((l) => l.talents?.length);
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
    const kept = new Map<string, Map<string, Row>>();
    const cut = (s: string) => { const w = (process.stdout.columns || 120) - 1; return s.length > w ? `${s.slice(0, w - 1)}…` : s; };
    const draw = async () => {
      if (drawing) return void (again = true);
      drawing = true;
      try {
        do {
          again = false;
          if (!shown) continue;
          const p = page, r = await rank(shown), p2 = `${p}|${gen}`;
          if (keptGen !== gen) { kept.clear(); keptGen = gen; }
          let lines = r.lines, head = `${at}${base || !warmRun ? '' : ' (the evaluator is starting)'}${note}`;
          if (r.rows) {
            const m = kept.get(r.kind!) ?? new Map<string, Row>();
            kept.set(r.kind!, m);
            for (const row of r.rows) m.set(row.id, row);
            lines = [...m.values()].sort((a, b) => b.key - a.key).slice(0, top).map((x) => x.text);
            head = `${at} ${r.kind} vs ${character().state.target}: best of ${m.size}${r.pending ? `, ${r.pending} pricing` : ''}${head.slice(at.length)}`;
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
        if (text !== last) { last = text; page++; shown = parse(text); at = new Date().toLocaleTimeString(); void draw(); }
      } catch (e) { console.warn(`market: ${(e as Error).message.split(/\r?\n/).filter(Boolean).at(-1)}`); }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
} finally { await ev?.close(); }
process.exit(0);
