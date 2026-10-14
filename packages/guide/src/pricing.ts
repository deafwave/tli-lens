import type { PriceBook } from './types';

/** Shapes of data/etor/items_<season>.json and history_<season>.json. The files carry ids/seasonId as strings and
 *  `price: null` for unpriced rows, so both are accepted. */
export interface EtorItems {
  seasonId: number | string; season: string; currency: 'FE'; fetchedAt: string;
  items: { id: number | string; name: string; category: string; price: number | null; updatedAt: string }[];
}
type Window = 'day1' | 'days1to3' | 'week1' | 'week2';
export interface EtorHistory {
  items: Record<string, { name: string; category: string; firstDay: number | string | null } & Record<Window | 'last', number | null>>;
}

export const WINDOWS: { maxLevel: number; window: Window }[] =
  [{ maxLevel: 69, window: 'day1' }, { maxLevel: 79, window: 'days1to3' }, { maxLevel: 89, window: 'week1' }, { maxLevel: 100, window: 'week2' }];
const ORDER: Window[] = ['day1', 'days1to3', 'week1', 'week2'];
const PLACEHOLDER = 1; // etor's price for an item nobody has traded

function book(snapshot: EtorItems, priceOf: (id: string, level: number, row: EtorItems['items'][number]) => number | null): PriceBook {
  const byId = new Map(snapshot.items.map((i) => [String(i.id), i]));
  const byName = new Map<string, (typeof snapshot.items)[number]>();
  for (const i of snapshot.items) if (!byName.has(i.name)) byName.set(i.name, i);
  return {
    season: snapshot.season, fetchedAt: snapshot.fetchedAt,
    price(key, level) {
      const row = typeof key === 'number' ? byId.get(String(key)) : byName.get(key);
      return row ? priceOf(String(row.id), level, row) : null;
    },
  };
}

/** Ideal mode: the history window for the hero level, else the next later window, else `last`. An item with no history
 *  takes its snapshot price unless that is null or the 1-FE placeholder (then unpriced). */
export function historyBook(items: EtorItems, history: EtorHistory, windows = WINDOWS): PriceBook {
  return book(items, (id, level, row) => {
    const h = history.items[id];
    if (!h) return row.price == null || row.price === PLACEHOLDER ? null : row.price;
    const w = (windows.find((x) => level <= x.maxLevel) ?? windows[windows.length - 1]).window;
    for (const k of [...ORDER.slice(ORDER.indexOf(w)), 'last' as const]) if (h[k] != null) return h[k];
    return null;
  });
}

/** Live mode: the current snapshot price (level ignored); null and the 1-FE placeholder are unpriced. */
export function snapshotBook(snapshot: EtorItems): PriceBook {
  return book(snapshot, (_id, _level, row) => (row.price == null || row.price === PLACEHOLDER ? null : row.price));
}

export async function fetchSnapshot(season: number, fetchImpl: typeof fetch = fetch): Promise<EtorItems> {
  const res = await fetchImpl(`https://etor-beta.710421059.xyz/etor-api/api/prices-snapshot/${season}`,
    { headers: { 'x-frontend-version': '1.0.6.2' } });
  if (!res.ok) throw new Error(`etor snapshot ${season}: HTTP ${res.status}`);
  return (await res.json()) as EtorItems;
}
