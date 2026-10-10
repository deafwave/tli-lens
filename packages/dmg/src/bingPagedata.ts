/* Page data for the Bing guide (mechanics.md#bing-guide): the affix library trimmed to the
   guide's gear types, and prices for every item the guide asks about (ETOR current +
   opening-week from data/etor/history_<season>.json when it exists). */
import fs from "node:fs";
import { fromRoot } from "./py.js";
import { GUIDE_ITEMS, guidePool } from "./bingGuide.js";
import type { LibraryAffix } from "./bingCraft.js";

export interface PagePrice {
  id: string; name: string; current: number | null; updatedAt: string | null;
  day1?: number | null; days1to3?: number | null; week1?: number | null; firstDay?: string;
}

export function writeBingPagedata(season = "1501"): void {
  const library: LibraryAffix[] = JSON.parse(fs.readFileSync(fromRoot("data/affix_library.json"), "utf-8")).affixes;
  const types = new Set(Object.values(GUIDE_ITEMS));
  const affixes = library.filter(a => types.has(a.slot));

  // every name the guide prices, recorded by running its pool once
  const asked = new Set<string>();
  guidePool({ library: affixes, price: name => { asked.add(name); return undefined; } });

  const index: any[] = JSON.parse(fs.readFileSync(fromRoot(`data/etor/items_${season}.json`), "utf-8")).items;
  const histPath = fromRoot(`data/etor/history_${season}.json`);
  const history: Record<string, any> = fs.existsSync(histPath)
    ? JSON.parse(fs.readFileSync(histPath, "utf-8")).items : {};
  const prices: PagePrice[] = [];
  for (const name of [...asked].sort()) {
    const item = index.find(i => i.name === name);
    if (!item) continue;
    const h = history[item.id] ?? {};
    prices.push({ id: item.id, name, current: item.price, updatedAt: item.updatedAt,
                  day1: h.day1 ?? null, days1to3: h.days1to3 ?? null, week1: h.week1 ?? null, firstDay: h.firstDay });
  }

  const out = (f: string, data: unknown) => {
    fs.writeFileSync(fromRoot(`packages/page/src/data/${f}`), JSON.stringify(data) + "\n", "utf-8");
    console.log(`${f}: ${Array.isArray(data) ? data.length : Object.keys(data as object).length} entries`);
  };
  out("bing-affixes.json", affixes);
  out("bing-prices.json", { season, prices, unknown: [...asked].filter(n => !prices.some(p => p.name === n)) });
}
