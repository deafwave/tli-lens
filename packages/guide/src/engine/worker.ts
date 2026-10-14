/** Worker thread: loads the pinned dps-debug figure module and the catalog once, then prices jobs. The pin module is imported by file URL
 *  from workerData.pinRoot, so no `@dps` alias is needed here. tsx is registered in-thread: Node 24 strips this file's types natively
 *  and `--import tsx` does not reach it, so every .ts import after `register()` is dynamic. */
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { register } from 'tsx/esm/api';
import type { Job, JobResult } from './pool';

register();
const { applyPatch, isPatch } = await import('../patches');
const root = (workerData as { pinRoot: string }).pinRoot;
const fig: typeof import('@dps/guide/figure') = await import(pathToFileURL(join(root, 'model', 'guide', 'figure.ts')).href);
const cat = fig.openCatalog(join(root, 'catalog'));

/** changes in order: runs of Changes through applyChanges, each LoadoutPatch through applyPatch; then the figure */
function price({ loadout, changes, ctx }: Job): JobResult {
  let lo = loadout as any;
  const dropped: string[] = [];
  for (let i = 0; i < changes.length;) {
    if (isPatch(changes[i])) { lo = applyPatch(lo, changes[i] as any); i++; continue; }
    let j = i;
    while (j < changes.length && !isPatch(changes[j])) j++;
    const r = fig.applyChanges(cat, lo, changes.slice(i, j) as any, ctx.skill, { heroLevel: ctx.level });
    lo = r.loadout; dropped.push(...r.dropped); i = j;
  }
  const g = fig.guideFigure(cat, lo, ctx.skill, { heroLevel: ctx.level });
  return { loadout: lo, dropped, fig: { life100: g.life100, life0: g.life0, left: g.left.map(x => x.name), needs: g.needs, stop: g.stop } };
}

parentPort!.on('message', (m: { id: number; job: Job }) => {
  try { parentPort!.postMessage({ id: m.id, result: price(m.job) }); }
  catch (e) { parentPort!.postMessage({ id: m.id, error: (e as Error).message ?? String(e) }); }
});
parentPort!.postMessage({ ready: true });
