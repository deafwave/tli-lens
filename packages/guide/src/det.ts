/** Deterioration's layer on a character: its duration's inc (attr 3402 under the layer's tags) and more (Profane's 7 %), the releases it makes, and the
 *  inc each next release needs, with those mores and with none. Every number is dps-debug's (attrs.ts finalRange, dot.ts layerDuration / schedule): the
 *  inc needed is found by bisecting the model's own release count, never a formula here. */
import { join } from 'node:path';
import { GROUNDS, guideDetail, openCatalog } from '@dps/guide/figure';
import { accumulate, attrScalar, finalRange } from '@dps/src/core/attrs';
import { detMods, instanceTags, layerDuration, node1011, parseDetCfg, schedule } from '@dps/src/core/dot';
import { figureDefaultFirst, withAsked } from './engine/apply';
import { DEFAULT_FIGHT } from './engine/pool';
import { pinFile } from './pin';
import type { Loadout } from './types';

/** the least x in (lo, hi] with ok(x), ok monotone (false then true), to `eps` */
export function least(ok: (x: number) => boolean, lo: number, hi: number, eps = 1e-6): number {
  while (hi - lo > eps) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
  return hi;
}

export interface DetLayer { inc: number; more: number[]; seconds: number; releases: number; next: { releases: number; inc: number; incNoMore: number }[] }

/** the layer of `loadout` (Hammer of Ash, the figure's own store) and the inc the next `count` releases need */
export function detLayer(loadout: Loadout, level: number, count = 3): DetLayer {
  const cat = openCatalog(pinFile('catalog')), T = cat.tables as Record<string, Record<string, Record<string, any>>>, F = DEFAULT_FIGHT;
  const lim = T.config_char_buff_limits['180']['0'], cfg = parseDetCfg(T.config_char_buff['180']['0'].affixList), node = node1011((T.affix_node_1011 as any)['147709584']['1'][0]);
  let c: { att: any; vic: any } | undefined;
  const fig = withAsked((extra) => figureDefaultFirst((o) => {
    const r = guideDetail(cat, loadout as never, 'hoa', { heroLevel: level, ground: { ...GROUNDS.hoa, carry: { ...GROUNDS.hoa.carry, fight: { ...F, inputs: { ...F.inputs, ...extra } } } } as never, ...o });
    c = r.detail?.c; return r.figure;
  }, 1 << 20));
  if (!c) throw new Error(`no Hammer of Ash figure: ${fig.stop}`);
  const tags = instanceTags(lim.limitTags), a = accumulate(c.att, 0xd4a, tags, []), mods = detMods(c.att, tags), desc = c.att.cfg.attrDesc[0xd4a];
  if (!mods.perTick) throw new Error('the layer has no tick mode (label 3000123): it releases once, at its end');
  const recv = attrScalar(c.vic, 0xd51, tags, []);
  const at = (inc: number, more: readonly number[]) => schedule({ total: 1, interval: cfg.interval, stacks: 1, mods }, 1 / 30,
    layerDuration(node.duration, finalRange(desc, a.base, a.spread, inc, more)[0], recv, 1.0)).length;
  const seconds = layerDuration(node.duration, finalRange(desc, a.base, a.spread, a.inc, a.more)[0], recv, 1.0), releases = at(a.inc, a.more);
  const next = Array.from({ length: count }, (_, i) => releases + 1 + i).map((k) => ({ releases: k,
    inc: least((x) => at(x, a.more) >= k, -100, 1000), incNoMore: least((x) => at(x, []) >= k, -100, 1000) }));
  return { inc: a.inc, more: [...a.more], seconds, releases, next };
}
