import type { ParkingCollection, StreetFeature } from './types';

/**
 * Resolved per platform: `parkingSource.web.ts` fetches the split JSON files,
 * `parkingSource.native.ts` reads the bundled dataset. TypeScript needs this
 * declaration because it does not follow Metro's platform extensions.
 */
export declare function loadClassified(): Promise<{
  features: StreetFeature[];
  metadata: ParkingCollection['metadata'];
}>;

export declare function loadUnknown(): Promise<StreetFeature[]>;
