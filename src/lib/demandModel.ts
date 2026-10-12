/**
 * Loads the shipped Opal demand model into demand.ts.
 *
 * It lives in its own file for one practical reason: `demand.ts` is compiled
 * by `npm test` with a bare tsc invocation that has no `--resolveJsonModule`,
 * and keeping the import here means the maths stays testable with a synthetic
 * model injected instead of the real 150 KB one.
 *
 * Bundled rather than fetched, on both platforms. It is 150 KB — two orders of
 * magnitude smaller than the street data — and the availability estimate it
 * feeds is wanted the first time a street sheet opens, which can be seconds
 * after launch.
 */

import model from '../data/demand-model.json';
import { setDemandModel, type DemandModel } from './demand';

let installed = false;

export function installDemandModel(): void {
  if (installed) return;
  installed = true;
  setDemandModel(model as unknown as DemandModel);
}
