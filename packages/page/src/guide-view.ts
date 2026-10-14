/** Structural copy of Figure / Move / Step / GuideOut in packages/guide/src/types.ts (that file imports @dps/*, which only resolves via the guide tsconfig paths). Keep in sync. */
export interface Figure { life100: number; life0: number; kill: number; partial: string[]; stop?: string }
export interface Move { kind: string; label: string; acquisition: boolean; costFE: number | null; minLevel: number; changes: unknown[]; [k: string]: unknown }
export interface Step { level: number; move: Move; triggered: Move[]; before: Figure; after: Figure; cumFE: number; notes?: string[] }
export interface GuideOut {
  mode: 'ideal' | 'advise'; pin: string; etor: { season: string; fetchedAt: string }; knobs: Record<string, unknown>;
  start: Figure; inputs?: Record<string, unknown>; startNotes?: string[]; steps: Step[]; notSearched: string[]; unpriced: string[]; notCalculable: string[];
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

/** DPS: 3 significant digits in exponent form from 1e6, plain integer below. */
export function fmtDps(n: number): string {
  if (Math.abs(Math.round(n)) < 1e6) return String(Math.round(n));
  const [m, e] = n.toExponential(2).split('e');
  return `${m}e${e.replace('+', '')}`;
}
const fmtFE = (n: number) => Math.round(n).toLocaleString('en-US');
// a partial or stopped figure is flagged, never shown as a plain number
const fig = (f: Figure, k: 'life100' | 'life0' | 'kill') =>
  f.stop ? `<span class="warn" title="${esc(f.stop)}">stopped</span>`
    : fmtDps(f[k]) + (f.partial.length ? `<span class="warn" title="partial: ${esc(f.partial.join(', '))}">*</span>` : '');
const list = (title: string, xs: string[]) =>
  xs.length ? `<section class="gl-${title}"><h3>${title}</h3><ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '';

export function renderGuide(g: GuideOut): string {
  const rows = g.steps.map((s) => `<tr class="step"><td>${esc(s.level)}</td><td>${esc(s.move.label)}${s.notes?.length ? ` <small>(${esc(s.notes.join('; '))})</small>` : ''}</td>`
    + `<td>${s.move.costFE == null ? 'unpriced' : s.move.market === 'drop' ? '0 FE (drops)' : fmtFE(s.move.costFE)}</td><td>${fmtFE(s.cumFE)}</td>`
    + `<td>${fig(s.after, 'life100')}</td><td>${fig(s.after, 'life0')}</td><td>${fig(s.after, 'kill')}</td></tr>`
    + s.triggered.map((t) => `<tr class="respec"><td></td><td colspan="6">respec: ${esc(t.label)}</td></tr>`).join('')).join('');
  const stated = (g.inputs ? `<p class="gl-inputs">stated inputs: <code>${esc(JSON.stringify(g.inputs))}</code></p>` : '') + list('startNotes', g.startNotes ?? []);
  return `<header class="gl-head"><p>${esc(g.mode)} guide, dps-debug pin <code>${esc(g.pin)}</code>, etor season <code>${esc(g.etor.season)}</code> (fetched ${esc(g.etor.fetchedAt)})</p>${stated}</header>`
    + `<table class="gl-table"><thead><tr><th>Level</th><th>Step</th><th>Cost FE</th><th>Cumulative FE</th><th>DPS Life 100%</th><th>DPS Life 0%</th><th>DPS kill</th></tr></thead>`
    + `<tbody><tr class="start"><td></td><td>start</td><td></td><td>0</td><td>${fig(g.start, 'life100')}</td><td>${fig(g.start, 'life0')}</td><td>${fig(g.start, 'kill')}</td></tr>${rows}</tbody></table>`
    + list('notSearched', g.notSearched) + list('unpriced', g.unpriced) + list('notCalculable', g.notCalculable);
}

const bad = (path: string, v: unknown) => new Error(`Advice is ${v === undefined ? 'missing' : 'invalid'}: ${path}`);
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isStrs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
function checkFigure(f: any, path: string): void {
  if (!f || typeof f !== 'object') throw bad(path, f);
  for (const k of ['life100', 'life0', 'kill']) if (!isNum(f[k])) throw bad(`${path}.${k}`, f[k]);
  if (!isStrs(f.partial)) throw bad(`${path}.partial`, f.partial);
  if (f.stop !== undefined && typeof f.stop !== 'string') throw bad(`${path}.stop`, f.stop);
}
function checkMove(m: any, path: string): void {
  if (!m || typeof m !== 'object') throw bad(path, m);
  if (typeof m.label !== 'string') throw bad(`${path}.label`, m.label);
  if (m.costFE !== null && !isNum(m.costFE)) throw bad(`${path}.costFE`, m.costFE);
}

export function parseAdvice(text: string): GuideOut {
  let j: any;
  try { j = JSON.parse(text); } catch (e) { throw new Error(`Advice is not valid JSON: ${(e as Error).message}`); }
  if (!j || typeof j !== 'object') throw new Error('Advice must be a JSON object');
  if (j.mode !== 'advise') throw new Error(`Advice must have mode "advise", got ${JSON.stringify(j.mode)}`);
  if (typeof j.pin !== 'string') throw bad('pin', j.pin);
  if (!j.etor || typeof j.etor !== 'object') throw bad('etor', j.etor);
  for (const k of ['season', 'fetchedAt']) if (typeof j.etor[k] !== 'string') throw bad(`etor.${k}`, j.etor[k]);
  checkFigure(j.start, 'start');
  if (!Array.isArray(j.steps)) throw bad('steps', j.steps);
  j.steps.forEach((s: any, i: number) => {
    const p = `steps[${i}]`;
    if (!s || typeof s !== 'object') throw bad(p, s);
    if (!isNum(s.level)) throw bad(`${p}.level`, s.level);
    if (!isNum(s.cumFE)) throw bad(`${p}.cumFE`, s.cumFE);
    checkMove(s.move, `${p}.move`);
    if (!Array.isArray(s.triggered)) throw bad(`${p}.triggered`, s.triggered);
    s.triggered.forEach((t: any, k: number) => checkMove(t, `${p}.triggered[${k}]`));
    checkFigure(s.before, `${p}.before`);
    checkFigure(s.after, `${p}.after`);
  });
  for (const k of ['notSearched', 'unpriced', 'notCalculable']) if (!isStrs(j[k])) throw bad(k, j[k]);
  return j as GuideOut;
}
