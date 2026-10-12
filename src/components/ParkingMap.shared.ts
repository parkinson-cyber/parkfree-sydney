import type { LiveStatus, Region, StreetFeature } from '../lib/types';
import type { CarPark } from '../lib/carparks';
import type { Report } from '../lib/reports';
import type { CouncilCarPark } from '../lib/councilCarparks';
import type { FreeCarPark } from '../lib/freeCarparks';
import type { SavedSpot } from '../state/store';

export interface ParkingMapProps {
  /** Live status per street id, re-evaluated on the minute tick. */
  statusById: Map<number, LiveStatus>;
  /** Street ids that pass the active filter (null = no filtering). */
  visibleIds: Set<number> | null;
  showUnknown: boolean;
  selectedId: number | null;
  onSelect: (f: StreetFeature | null) => void;
  onRegionChange: (r: Region) => void;
  initialRegion: Region;
  /** Live Park&Ride occupancy pins (empty when the feed is missing or stale). */
  carparks: CarPark[];
  /** Live crowd reports — drawn as their own mark, never as street rules. */
  reports: Report[];
  /** Where the user parked, if saved. */
  mySpot: SavedSpot | null;
  /** Council off-street car parks, with their free periods. */
  councilCarParks: CouncilCarPark[];
  /** Off-street car parks that cost nothing (OSM fee=no). */
  freeCarParks: FreeCarPark[];
  /**
   * P(a space is free) per street id, for the streets currently worth
   * labelling. Empty when the setting is off or the map is zoomed out; the
   * caller decides what is worth computing, so the map just draws what it is
   * given.
   */
  availById: Map<number, number>;
}

export interface ParkingMapHandle {
  animateTo: (center: { latitude: number; longitude: number }, zoomedIn?: boolean) => void;
  /**
   * Frame a whole area: [west, south, east, north]. A suburb search should
   * show the suburb, not drop you at a point inside it at street zoom.
   */
  fitBounds: (bbox: [number, number, number, number]) => void;
  animateToUser: () => Promise<boolean>;
  /** The driver's current position, or null if unavailable/denied. */
  getUserLocation: () => Promise<{ latitude: number; longitude: number } | null>;
}

/**
 * Bands for the availability estimate, shared by both maps and the legend so
 * a colour means the same thing everywhere. The cut points match
 * availability.ts; the labels are deliberately coarse — the model's RMSE is
 * 19 percentage points, so a number to the nearest 1% would be claiming
 * precision it has not got.
 */
export const AVAIL_BANDS = [
  { min: 0.6, color: '#4F7A3F', label: 'good chance of a space' },
  { min: 0.35, color: '#B5813A', label: 'could go either way' },
  { min: 0, color: '#A8574A', label: 'likely to be full' },
];

export function availColor(score: number): string {
  return (AVAIL_BANDS.find((b) => score >= b.min) ?? AVAIL_BANDS[2]).color;
}

/** "~60%" — rounded to the nearest ten, and marked as approximate. */
export function availLabel(score: number): string {
  return `~${Math.round(score * 10) * 10}%`;
}

/** Zoom thresholds (in latitudeDelta) for progressive street rendering. */
export const SHOW_CLASSIFIED_MAX_DELTA = 0.09;
// Was 0.035 — roughly street-level zoom only. Matches the web map's minzoom
// fix: the uncategorized base network (most streets outside inner Sydney)
// should read as covered from a whole-of-Sydney zoom, not just up close.
export const SHOW_UNKNOWN_MAX_DELTA = 0.5;
