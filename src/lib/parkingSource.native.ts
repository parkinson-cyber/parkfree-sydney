/**
 * Native: keep the dataset bundled in the app.
 *
 * The web split exists because a browser re-downloads the bundle; an installed
 * app does not, and bundling keeps the map working with no network at all —
 * which is the case that matters when you are driving around looking for a
 * space. So native keeps the single `require` and simply partitions it to
 * present the same interface as the web loader.
 */
import type { ParkingCollection, StreetFeature } from './types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const raw = require('../data/parking.json') as ParkingCollection;

type Meta = ParkingCollection['metadata'];

export async function loadClassified(): Promise<{ features: StreetFeature[]; metadata: Meta }> {
  return {
    features: raw.features.filter((f) => f.properties.cat !== 'unknown'),
    metadata: raw.metadata,
  };
}

export async function loadUnknown(): Promise<StreetFeature[]> {
  return raw.features.filter((f) => f.properties.cat === 'unknown');
}
