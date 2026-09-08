import type { LiveStatus, Region, StreetFeature } from '../lib/types';
import type { CarPark } from '../lib/carparks';
import type { Report } from '../lib/reports';
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
}

export interface ParkingMapHandle {
  animateTo: (center: { latitude: number; longitude: number }, zoomedIn?: boolean) => void;
  animateToUser: () => Promise<boolean>;
  /** The driver's current position, or null if unavailable/denied. */
  getUserLocation: () => Promise<{ latitude: number; longitude: number } | null>;
}

/** Zoom thresholds (in latitudeDelta) for progressive street rendering. */
export const SHOW_CLASSIFIED_MAX_DELTA = 0.09;
// Was 0.035 — roughly street-level zoom only. Matches the web map's minzoom
// fix: the uncategorized base network (most streets outside inner Sydney)
// should read as covered from a whole-of-Sydney zoom, not just up close.
export const SHOW_UNKNOWN_MAX_DELTA = 0.5;
