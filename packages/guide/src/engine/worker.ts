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
const { applyInOrder } = await import('./apply');
const root = (workerData as { pinRoot: string }).pinRoot;
const fig: typeof import('@dps/guide/figure') = await import(pathToFileURL(join(root, 'model', 'guide', 'figure.ts')).href);
const cat = fig.openCatalog(join(root, 'catalog'));

function price({ loadout, changes, ctx }: Job): JobResult {
  const { loadout: lo, dropped } = applyInOrder(loadout, changes, { isPatch, applyPatch,
    applyChanges: (l, cs) => fig.applyChanges(cat, l, cs, ctx.skill, { heroLevel: ctx.level }) });
  const g = fig.guideFigure(cat, lo, ctx.skill, { heroLevel: ctx.level });
  return { loadout: lo, dropped, fig: { life100: g.life100, life0: g.life0, left: g.left.map(x => x.name), needs: g.needs, stop: g.stop, inputs: g.inputs as never } };
}

parentPort!.on('message', (m: { id: number; job: Job }) => {
  try { parentPort!.postMessage({ id: m.id, result: price(m.job) }); }
  catch (e) { parentPort!.postMessage({ id: m.id, error: (e as Error).message ?? String(e) }); }
});
parentPort!.postMessage({ ready: true });
