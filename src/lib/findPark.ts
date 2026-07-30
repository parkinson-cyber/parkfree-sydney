/**
 * "Find me a park" — the app's headline promise.
 *
 * Given where the driver is right now, pick the closest kerb they can actually
 * park on this minute, and say how far they'll walk from it.
 */

import type { LiveStatus, StreetFeature } from './types';
import { distanceToFeatureM, featureCenter } from './geo';
import { nextFreeAt } from './rules';

export interface ParkSuggestion {
  street: StreetFeature;
  /** Walking distance to the kerb, in metres. */
  meters: number;
  /** Rough walk time from the parked car. */
  walkMin: number;
  /** True when the spot carries a time limit rather than being unrestricted. */
  limited: boolean;
  center: { latitude: number; longitude: number };
}

/** A spot that isn't free yet but will be soon — the graceful empty-state answer. */
export interface SoonSuggestion {
  street: StreetFeature;
  meters: number;
  walkMin: number;
  /** Minutes until it frees up. */
  inMin: number;
  /** Clock label of the moment it frees, e.g. "9pm". */
  at: string;
  center: { latitude: number; longitude: number };
}

/** Average walking pace, metres per minute (~4.8 km/h). */
const WALK_M_PER_MIN = 80;

/**
 * How much further we'll happily walk to reach an unrestricted spot instead of
 * a time-limited one. A 2P bay 50 m away still beats a free bay 400 m away, but
 * within this margin the spot you won't have to move from wins.
 */
const LIMITED_PENALTY_M = 150;

/** Don't suggest a spot the driver would never walk back from. */
export const DEFAULT_MAX_METERS = 1500;

export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / WALK_M_PER_MIN));
}

/** "120 m" / "1.2 km" */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Closest parkable street to `from`, or null if nothing qualifies within
 * `maxMeters`. Only 'free' and 'free_limited' streets are considered — paid,
 * permit-only, banned and unverified kerbs are never suggested.
 */
export function findNearestPark(
  streets: StreetFeature[],
  statusById: Map<number, LiveStatus>,
  from: { latitude: number; longitude: number },
  maxMeters: number = DEFAULT_MAX_METERS,
): ParkSuggestion | null {
  let best: StreetFeature | null = null;
  let bestScore = Infinity;
  let bestMeters = 0;
  let bestLimited = false;

  // Cheap bounding-box reject before the per-segment maths — at ~5k candidate
  // streets this keeps the button feeling instant.
  const latPad = maxMeters / 111320;
  const lonPad = latPad / Math.max(0.2, Math.cos((from.latitude * Math.PI) / 180));

  for (const f of streets) {
    const status = statusById.get(f.properties.id);
    if (status !== 'free' && status !== 'free_limited') continue;

    const coords = f.geometry.coordinates;
    let near = false;
    for (const [lon, lat] of coords) {
      if (
        Math.abs(lat - from.latitude) <= latPad &&
        Math.abs(lon - from.longitude) <= lonPad
      ) {
        near = true;
        break;
      }
    }
    if (!near) continue;

    const meters = distanceToFeatureM(f, from.latitude, from.longitude);
    if (meters > maxMeters) continue;

    const limited = status === 'free_limited';
    const score = meters + (limited ? LIMITED_PENALTY_M : 0);
    if (score < bestScore) {
      bestScore = score;
      best = f;
      bestMeters = meters;
      bestLimited = limited;
    }
  }

  if (!best) return null;
  return {
    street: best,
    meters: bestMeters,
    walkMin: walkMinutes(bestMeters),
    limited: bestLimited,
    center: featureCenter(best),
  };
}

/**
 * The graceful empty-state answer: when nothing is free right now, the nearest
 * kerb that will free up soonest. Ranked by total time-to-parked — the minutes
 * you'd wait plus the minutes you'd walk — so a spot freeing in 5 min two
 * blocks away beats one freeing in 20 min at your feet.
 *
 * Only considers streets with a *known* free time (nextFreeAt is deliberately
 * silent when hours aren't published), and caps the wait so we never suggest
 * something hours away.
 */
export function findSoonestPark(
  streets: StreetFeature[],
  now: Date,
  from: { latitude: number; longitude: number },
  maxMeters: number = DEFAULT_MAX_METERS,
  maxWaitMin: number = 60,
): SoonSuggestion | null {
  let best: StreetFeature | null = null;
  let bestScore = Infinity;
  let bestMeters = 0;
  let bestInMin = 0;
  let bestAt = '';

  const latPad = maxMeters / 111320;
  const lonPad = latPad / Math.max(0.2, Math.cos((from.latitude * Math.PI) / 180));

  for (const f of streets) {
    const coords = f.geometry.coordinates;
    let near = false;
    for (const [lon, lat] of coords) {
      if (
        Math.abs(lat - from.latitude) <= latPad &&
        Math.abs(lon - from.longitude) <= lonPad
      ) {
        near = true;
        break;
      }
    }
    if (!near) continue;

    const soon = nextFreeAt(f.properties, now);
    if (!soon || soon.inMin > maxWaitMin) continue;

    const meters = distanceToFeatureM(f, from.latitude, from.longitude);
    if (meters > maxMeters) continue;

    // total time until you're parked and walking away
    const score = soon.inMin + walkMinutes(meters);
    if (score < bestScore) {
      bestScore = score;
      best = f;
      bestMeters = meters;
      bestInMin = soon.inMin;
      bestAt = soon.at;
    }
  }

  if (!best) return null;
  return {
    street: best,
    meters: bestMeters,
    walkMin: walkMinutes(bestMeters),
    inMin: bestInMin,
    at: bestAt,
    center: featureCenter(best),
  };
}
