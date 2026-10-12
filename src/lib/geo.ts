import type { Region, StreetFeature } from './types';

/** Haversine distance in metres. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Does a feature intersect the given region (with padding)? */
export function featureInRegion(f: StreetFeature, region: Region, pad = 1.2): boolean {
  const latHalf = (region.latitudeDelta / 2) * pad;
  const lonHalf = (region.longitudeDelta / 2) * pad;
  const minLat = region.latitude - latHalf;
  const maxLat = region.latitude + latHalf;
  const minLon = region.longitude - lonHalf;
  const maxLon = region.longitude + lonHalf;
  return f.geometry.coordinates.some(
    ([lon, lat]) => lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon,
  );
}

/** Squared distance (in degree-ish space, lon corrected) from point to segment. */
function pointSegDist2(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

/**
 * Distance in metres from a point to the nearest point on a street's geometry.
 * Measures against the kerb itself rather than the midpoint, so a long street
 * you're standing on reads as ~0 m away, not half its length.
 */
export function distanceToFeatureM(f: StreetFeature, lat: number, lon: number): number {
  const lonScale = Math.cos((lat * Math.PI) / 180);
  const px = lon * lonScale;
  const coords = f.geometry.coordinates;
  if (coords.length === 1) return distanceM(lat, lon, coords[0][1], coords[0][0]);
  let bestD2 = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d2 = pointSegDist2(
      px, lat,
      coords[i][0] * lonScale, coords[i][1],
      coords[i + 1][0] * lonScale, coords[i + 1][1],
    );
    if (d2 < bestD2) bestD2 = d2;
  }
  return Math.sqrt(bestD2) * 111320;
}

/**
 * Find the street nearest to a tapped coordinate.
 * `maxMeters` keeps taps on empty map from selecting far-away streets.
 */
export function nearestStreet(
  features: StreetFeature[],
  lat: number,
  lon: number,
  maxMeters = 40,
): StreetFeature | null {
  const lonScale = Math.cos((lat * Math.PI) / 180);
  const px = lon * lonScale;
  const py = lat;
  let best: StreetFeature | null = null;
  let bestD2 = Infinity;
  for (const f of features) {
    const coords = f.geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const d2 = pointSegDist2(
        px, py,
        coords[i][0] * lonScale, coords[i][1],
        coords[i + 1][0] * lonScale, coords[i + 1][1],
      );
      if (d2 < bestD2) {
        bestD2 = d2;
        best = f;
      }
    }
  }
  // one degree of latitude ≈ 111,320 m
  const meters = Math.sqrt(bestD2) * 111320;
  return meters <= maxMeters ? best : null;
}

/**
 * The point half-way **along** a street, and which way the street runs there.
 *
 * This used to take the middle *vertex* — `coords[length / 2]` — which is a
 * different thing entirely. OSM puts a vertex wherever the road bends, so a
 * street that is straight for 400 m and then curves has most of its vertices
 * in the curve, and the middle vertex sits inside it: at one end. Measured
 * across the dataset, 1,663 classified streets over 150 m long had their
 * "centre" more than 50 m from the real one, the worst by 354 m — Taren Point
 * Road's landed 48% of its length away from the middle, which is to say at
 * the edge.
 *
 * Everything that points at a street used that: the map fly-to, directions,
 * "Park here", and the Street View link, which is where it showed — you asked
 * to see the sign and Google dropped you at the far corner of a long street.
 *
 * So walk the geometry and stop at half its length. The bearing of the
 * segment we stop on comes back too, because the thing that makes a Street
 * View link useful is facing *across* the kerb rather than along it.
 */
export function featureMidpoint(f: StreetFeature): {
  latitude: number;
  longitude: number;
  /** Degrees clockwise from north, along the street at that point. */
  bearing: number;
  /** Total length of the street in metres. */
  lengthM: number;
} {
  const coords = f.geometry.coordinates;
  if (coords.length === 1) {
    return { latitude: coords[0][1], longitude: coords[0][0], bearing: 0, lengthM: 0 };
  }

  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = distanceM(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
    segLen.push(d);
    total += d;
  }

  const half = total / 2;
  let run = 0;
  let i = 0;
  while (i < segLen.length - 1 && run + segLen[i] < half) {
    run += segLen[i];
    i++;
  }
  // How far into this segment the half-way mark falls.
  const t = segLen[i] > 0 ? (half - run) / segLen[i] : 0;
  const [lon1, lat1] = coords[i];
  const [lon2, lat2] = coords[i + 1];

  return {
    latitude: lat1 + (lat2 - lat1) * t,
    longitude: lon1 + (lon2 - lon1) * t,
    bearing: bearingDeg(lat1, lon1, lat2, lon2),
    lengthM: total,
  };
}

/** Degrees clockwise from north, from one point to another. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat2 - lat1;
  const dLon = (lon2 - lon1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return (((Math.atan2(dLon, dLat) * 180) / Math.PI) + 360) % 360;
}

/** Midpoint of a street's geometry — used to focus the map on a result. */
export function featureCenter(f: StreetFeature): { latitude: number; longitude: number } {
  const { latitude, longitude } = featureMidpoint(f);
  return { latitude, longitude };
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

function compassName(bearing: number): string {
  return COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

/**
 * Human-readable labels for a street's OSM "left"/"right" sides.
 * OSM sides are relative to the way's (invisible) drawing direction, so we
 * translate them into compass directions from the street's overall bearing:
 * for a street running east, "left" is the north side.
 */
export function sideLabels(f: StreetFeature): { left: string; right: string } {
  const coords = f.geometry.coordinates;
  const [lon1, lat1] = coords[0];
  const [lon2, lat2] = coords[coords.length - 1];
  const bearing = bearingDeg(lat1, lon1, lat2, lon2); // 0 = north
  return {
    left: `${capitalize(compassName(bearing - 90))} side`,
    right: `${capitalize(compassName(bearing + 90))} side`,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
