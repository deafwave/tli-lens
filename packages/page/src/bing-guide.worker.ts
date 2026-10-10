/* Runs the Bing guide off the main thread: prices and budgets in, guide + source labels out. */
import { buildGuide, guidePool, type GuideStage } from "@rehan/dmg/bingGuide";
import type { LibraryAffix } from "@rehan/dmg/bingCraft";
import type { Season } from "@rehan/dmg/seasons";

export interface GuideRequest {
  library: LibraryAffix[];
  prices: Record<string, number>;
  stages: GuideStage[];
  season: Season;
}

self.onmessage = (e: MessageEvent<GuideRequest>) => {
  const { library, prices, stages, season } = e.data;
  const price = (name: string) => prices[name];
  const guide = buildGuide({ library, price, stages, season });
  const { start, pool, unpriced } = guidePool({ library, price });
  const meta: Record<string, { label: string; item: string }> = {};
  for (const s of [...start, ...pool, ...unpriced])
    meta[s.id] = { label: s.label, item: s.slot?.split(".")[0] ?? (s.replaces?.find(r => r.startsWith("rare_"))?.slice(5) ?? s.group) };
  postMessage({ guide, meta, unpriced: unpriced.map(s => s.label) });
};
