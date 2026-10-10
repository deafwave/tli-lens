/* Bing progression guide tabs (mechanics.md#bing-guide): Guide (stages), Buy list, Slot
   ladders, Prices. The guide runs in a worker; prices resolve as
   your override → chosen basis (bundled opening-week ETOR, or live ETOR via /etor-api). */
import type { GuideResult, GuideStage } from "@rehan/dmg/bingGuide";
import type { LibraryAffix } from "@rehan/dmg/bingCraft";
import type { Season } from "@rehan/dmg/seasons";
import affixes from "./data/bing-affixes.json";
import bundled from "./data/bing-prices.json";
import type { GuideRequest } from "./bing-guide.worker";

interface BundledPrice {
  id: string; name: string; current: number | null; updatedAt: string | null;
  day1?: number | null; days1to3?: number | null; week1?: number | null; firstDay?: string;
}
type Basis = "week1" | "days1to3" | "day1" | "current" | "live-now" | "live-opening";
const BASES: [Basis, string][] = [
  ["week1", "Opening week (SS13 ETOR)"], ["days1to3", "Days 1–3 (SS13 ETOR)"], ["day1", "Day 1 (SS13 ETOR)"],
  ["current", "End of SS13 (ETOR snapshot)"], ["live-now", "Live — current ETOR price"],
  ["live-opening", "Live — first 24h of the running season"],
];
const DEFAULT_STAGES: GuideStage[] = [
  { level: 60, budget: 20 }, { level: 68, budget: 60 }, { level: 72, budget: 150 }, { level: 76, budget: 400 },
  { level: 82, budget: 1000 }, { level: 86, budget: 3000 }, { level: 90, budget: 8000 },
  { level: 95, budget: 20000 }, { level: 100, budget: 60000 },
];
const ITEM_ORDER = ["mainHand", "helmet", "chest", "gloves", "boots", "belt", "necklace", "ring1", "ring2"];
const ITEM_NAME: Record<string, string> = {
  mainHand: "Weapon", helmet: "Helmet", chest: "Chest", gloves: "Gloves", boots: "Boots", belt: "Belt",
  necklace: "Necklace", ring1: "Ring 1", ring2: "Ring 2", talent: "Talent trees",
  hoa: "HoA support", aura: "Aura", tree: "Talent notable", trait: "Hero trait", pact: "Pactspirit",
  kismet: "Kismet", engine: "Charge engine", gear: "Gear", slate: "Divinity slate", memory: "Hero memory",
  prism: "Ethereal prism",
};

const PRICES: BundledPrice[] = (bundled as { prices: BundledPrice[] }).prices;
const store = <T>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; }
};
const save = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));

const state = {
  basis: store<Basis>("bing-guide-basis", "week1"),
  overrides: store<Record<string, number>>("bing-guide-overrides", {}),
  stages: store<GuideStage[]>("bing-guide-stages", DEFAULT_STAGES),
  live: {} as Record<string, number>,
  liveStatus: "",
};

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtDps = (d: number) => d >= 1e12 ? `${(d / 1e12).toFixed(2)}T` : d >= 1e9 ? `${(d / 1e9).toFixed(2)}B`
  : d >= 1e6 ? `${(d / 1e6).toFixed(2)}M` : d >= 1e3 ? `${(d / 1e3).toFixed(1)}k` : d.toFixed(0);
const fmtFe = (v: number) => v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2);

function basePrice(p: BundledPrice): number | undefined {
  const b = state.basis;
  if (b === "live-now" || b === "live-opening") return state.live[p.name] ?? p.current ?? undefined;
  return (p[b] ?? p.current) ?? undefined;
}
function resolvedPrices(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of PRICES) { const v = basePrice(p); if (v !== undefined) out[p.name] = v; }
  return { ...out, ...state.overrides };
}

/* ---------- live ETOR via the same-origin /etor-api proxy (vercel.json / vite.config.ts) ---------- */
async function etor<T>(path: string): Promise<T> {
  const r = await fetch(`/etor-api/api/${path}`, { headers: { "x-frontend-version": "1.0.6.2" } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
async function fetchLive(): Promise<void> {
  state.liveStatus = "fetching…";
  render();
  try {
    const status = await etor<{ currentSeasonId?: string }>("player/season-status");
    const season = String(status.currentSeasonId ?? "1501");
    const live: Record<string, number> = {};
    if (state.basis === "live-opening") {
      for (const p of PRICES) {
        const chart = await etor<{ trend?: { timestamp: number; price: number }[] }>(`chart/${season}/${p.id}?interval=1h`);
        const t = chart.trend ?? [];
        const first = t.filter(x => x.timestamp < (t[0]?.timestamp ?? 0) + 86_400_000).map(x => x.price);
        if (first.length) live[p.name] = first.reduce((a, b) => a + b, 0) / first.length;
      }
    } else {
      const snap = await etor<{ data: { id: string; price: number }[] }>(`prices-snapshot/${season}`);
      const byId = new Map(snap.data.map(x => [String(x.id), x.price]));
      for (const p of PRICES) { const v = byId.get(p.id); if (v !== undefined) live[p.name] = v; }
    }
    state.live = live;
    state.liveStatus = `season ${season}: ${Object.keys(live).length}/${PRICES.length} items priced live`;
  } catch (e) {
    state.liveStatus = `live fetch failed (${(e as Error).message}) — using bundled prices`;
  }
  recompute();
}

/* ---------- worker ---------- */
let worker: Worker | null = null;
let result: { guide: GuideResult; meta: Record<string, { label: string; item: string }>; unpriced: string[] } | null = null;
let busy = false;
function recompute(): void {
  worker ??= new Worker(new URL("./bing-guide.worker.ts", import.meta.url), { type: "module" });
  busy = true;
  render();
  worker.onmessage = e => { result = e.data; busy = false; render(); };
  const req: GuideRequest = { library: affixes as unknown as LibraryAffix[], prices: resolvedPrices(),
                              stages: state.stages, season: (new URLSearchParams(location.search).get("season") === "ss13" ? "ss13" : "ss14") as Season };
  worker.postMessage(req);
}

/* ---------- views ---------- */
const itemLabel = (item: string) => ITEM_NAME[item] ?? item;
function stepRow(step: GuideResult["steps"][number], meta: Record<string, { label: string; item: string }>): string {
  const labels = step.ids.map(id => esc(meta[id]?.label ?? id)).join(" + ");
  const items = [...new Set(step.ids.map(id => itemLabel(meta[id]?.item ?? "")))].join(", ");
  return `<div class="mod-row"><span class="mod-text"><b>${esc(items)}</b> · ${labels}</span>`
    + `<span class="delta-chip">${step.cost ? `${fmtFe(step.cost)} FE` : "free"}</span>`
    + `<span class="delta-chip d-hot">×${step.gain.toFixed(2)}</span>`
    + `<span class="delta-chip">${fmtDps(step.dps)}</span></div>`;
}

function gearSet(ids: string[], meta: Record<string, { label: string; item: string }>): string {
  const byItem = new Map<string, string[]>();
  for (const id of ids) {
    const m = meta[id];
    if (!m || id.startsWith("rare_")) continue;
    byItem.set(m.item, [...byItem.get(m.item) ?? [], m.label]);
  }
  const order = [...ITEM_ORDER, ...[...byItem.keys()].filter(k => !ITEM_ORDER.includes(k))];
  return `<table class="ledger-table"><tr><th>Slot</th><th>What to have</th></tr>`
    + order.filter(k => byItem.has(k)).map(k =>
      `<tr><td><b>${esc(itemLabel(k))}</b></td><td>${byItem.get(k)!.map(esc).join("<br>")}</td></tr>`).join("")
    + `</table>`;
}

function guideView(): string {
  if (!result) return `<p>Computing…</p>`;
  const { guide, meta } = result;
  return `<p>Start: level 60, entering maps — Vindicator Maul, empty rare bases, HoA L20: <b>${fmtDps(guide.zeroDps)}</b> DPS
    (lv85 dummy model). Each stage spends its budget (plus anything left over) on the upgrades with the most DPS per FE
    that its level allows; free upgrades (talents, traits, cheap gems) come first.</p>`
    + guide.stages.map((st, n) => {
      const steps = guide.steps.filter(s => s.stage === n);
      return `<div class="bundle"><div class="bundle-head"><h3>Level ${st.level}</h3>`
        + `<span class="cost-note">budget ${fmtFe(st.budget)} FE · spent ${fmtFe(st.spent)} FE · ${fmtDps(st.dps)} DPS</span></div>`
        + (steps.length ? steps.map(s => stepRow(s, meta)).join("") : `<p class="mod-vs">Nothing affordable or unlocked at this level.</p>`)
        + `<details class="fillers"><summary>Full gear set at the end of level ${st.level}</summary>${gearSet(st.sources, meta)}</details></div>`;
    }).join("");
}

function buyListView(): string {
  if (!result) return `<p>Computing…</p>`;
  const { guide, meta } = result;
  let total = 0;
  return `<table class="ledger-table"><tr><th>#</th><th>Level</th><th>Slot</th><th>Buy / do</th><th>Cost</th><th>Gain</th><th>DPS</th><th>Total FE</th></tr>`
    + guide.steps.map((s, i) => {
      total += s.cost;
      const items = [...new Set(s.ids.map(id => itemLabel(meta[id]?.item ?? "")))].join(", ");
      return `<tr><td class="num">${i + 1}</td><td class="num">${guide.stages[s.stage].level}</td><td><b>${esc(items)}</b></td>`
        + `<td>${s.ids.map(id => esc(meta[id]?.label ?? id)).join("<br>")}`
        + (s.removed.length ? `<br><span class="mod-vs">replaces ${s.removed.map(id => esc(meta[id]?.label ?? id)).join(", ")}</span>` : "")
        + `</td><td class="mult">${s.cost ? fmtFe(s.cost) : "free"}</td><td class="mult">×${s.gain.toFixed(3)}</td>`
        + `<td class="mult">${fmtDps(s.dps)}</td><td class="num">${fmtFe(total)}</td></tr>`;
    }).join("") + `</table>`;
}

function laddersView(): string {
  if (!result) return `<p>Computing…</p>`;
  const { guide, meta } = result;
  const bySlot = new Map<string, typeof guide.steps>();
  for (const s of guide.steps) for (const item of new Set(s.ids.map(id => meta[id]?.item ?? "build")))
    bySlot.set(item, [...bySlot.get(item) ?? [], s]);
  const order = [...ITEM_ORDER, ...[...bySlot.keys()].filter(k => !ITEM_ORDER.includes(k))];
  return order.filter(k => bySlot.has(k)).map(k =>
    `<div class="bundle"><div class="bundle-head"><h3>${esc(itemLabel(k))}</h3></div>`
    + bySlot.get(k)!.map(s => `<div class="mod-row"><span class="src-chip">L${guide.stages[s.stage].level}</span>`
      + `<span class="mod-text">${s.ids.filter(id => (meta[id]?.item ?? "build") === k).map(id => esc(meta[id]?.label ?? id)).join(" + ")}</span>`
      + `<span class="delta-chip">${s.cost ? `${fmtFe(s.cost)} FE` : "free"}</span>`
      + `<span class="delta-chip d-hot">×${s.gain.toFixed(2)}</span></div>`).join("")
    + `</div>`).join("");
}

function pricesView(): string {
  const bases = BASES.map(([b, l]) => `<option value="${b}"${state.basis === b ? " selected" : ""}>${l}</option>`).join("");
  const rows = PRICES.map(p => {
    const o = state.overrides[p.name];
    const cell = (v: number | null | undefined) => v == null ? "—" : fmtFe(v);
    return `<tr><td><b>${esc(p.name)}</b></td><td class="num">${cell(p.day1)}</td><td class="num">${cell(p.days1to3)}</td>`
      + `<td class="num">${cell(p.week1)}</td><td class="num">${cell(p.current)}</td><td class="num">${cell(state.live[p.name])}</td>`
      + `<td><input class="price-in" data-name="${esc(p.name)}" type="number" min="0" step="any" value="${o ?? ""}" placeholder="${cell(basePrice(p))}"></td></tr>`;
  }).join("");
  const unpricedRows = (result?.unpriced ?? []).map(label =>
    `<tr><td><b>${esc(label)}</b></td><td colspan="5" class="mod-vs">no market price — enter one to let the guide buy it</td>`
    + `<td><input class="price-in" data-name="${esc(label)}" type="number" min="0" step="any" value="${state.overrides[label] ?? ""}"></td></tr>`).join("");
  const stageRows = state.stages.map((s, i) =>
    `<tr><td><b>Level</b> <input class="stage-in" data-i="${i}" data-k="level" type="number" value="${s.level}"></td>`
    + `<td><b>Budget FE</b> <input class="stage-in" data-i="${i}" data-k="budget" type="number" value="${s.budget}"></td></tr>`).join("");
  return `<p>Prices in Flame Elementium. A fresh league pays opening-week prices, so that is the default basis.
    Your overrides win over every basis and are saved in this browser.</p>
    <p><label>Price basis <select id="basis">${bases}</select></label>
    <button type="button" id="live-btn">Fetch live ETOR prices</button> <span class="mod-vs">${esc(state.liveStatus)}</span>
    <button type="button" id="reset-btn">Clear my overrides</button></p>
    <table class="ledger-table"><tr><th>Item</th><th>Day 1</th><th>Days 1–3</th><th>Week 1</th><th>End of SS13</th><th>Live</th><th>Your price</th></tr>${rows}${unpricedRows}</table>
    <h3>Stages</h3><table class="ledger-table">${stageRows}</table>
    <button type="button" id="stages-reset">Reset stages</button>`;
}

const VIEWS: Record<string, () => string> = {
  guide: guideView, buylist: buyListView, ladders: laddersView, prices: pricesView,
};
let mountedOn: Record<string, HTMLElement> = {};

function render(): void {
  for (const [key, el] of Object.entries(mountedOn)) {
    el.innerHTML = (busy && key !== "prices" ? `<p class="mod-vs">Recomputing…</p>` : "") + VIEWS[key]();
  }
  wire();
}

function wire(): void {
  const prices = mountedOn.prices;
  if (!prices) return;
  prices.querySelector<HTMLSelectElement>("#basis")?.addEventListener("change", e => {
    state.basis = (e.target as HTMLSelectElement).value as Basis;
    save("bing-guide-basis", state.basis);
    if (state.basis.startsWith("live")) void fetchLive(); else recompute();
  });
  prices.querySelector("#live-btn")?.addEventListener("click", () => void fetchLive());
  prices.querySelector("#reset-btn")?.addEventListener("click", () => {
    state.overrides = {}; save("bing-guide-overrides", state.overrides); recompute();
  });
  prices.querySelector("#stages-reset")?.addEventListener("click", () => {
    state.stages = DEFAULT_STAGES; save("bing-guide-stages", state.stages); recompute();
  });
  for (const input of prices.querySelectorAll<HTMLInputElement>(".price-in")) input.addEventListener("change", () => {
    const name = input.dataset.name!;
    if (input.value === "") delete state.overrides[name]; else state.overrides[name] = Number(input.value);
    save("bing-guide-overrides", state.overrides);
    recompute();
  });
  for (const input of prices.querySelectorAll<HTMLInputElement>(".stage-in")) input.addEventListener("change", () => {
    const i = Number(input.dataset.i), k = input.dataset.k as keyof GuideStage;
    state.stages = state.stages.map((s, j) => j === i ? { ...s, [k]: Number(input.value) } : s);
    save("bing-guide-stages", state.stages);
    recompute();
  });
}

/** Mount the guide views into their tab sections and start computing. */
export function mountBingGuide(els: Record<keyof typeof VIEWS, HTMLElement>): void {
  mountedOn = els;
  if (state.basis.startsWith("live")) void fetchLive(); else recompute();
}
