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

/** Midpoint of a street's geometry — used to focus the map on a result. */
export function featureCenter(f: StreetFeature): { latitude: number; longitude: number } {
  const coords = f.geometry.coordinates;
  const mid = coords[Math.floor(coords.length / 2)];
  return { latitude: mid[1], longitude: mid[0] };
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
  const dLat = lat2 - lat1;
  const dLon = (lon2 - lon1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  const bearing = (Math.atan2(dLon, dLat) * 180) / Math.PI; // 0 = north
  return {
    left: `${capitalize(compassName(bearing - 90))} side`,
    right: `${capitalize(compassName(bearing + 90))} side`,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
