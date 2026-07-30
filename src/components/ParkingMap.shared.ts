import type { LiveStatus, Region, StreetFeature } from '../lib/types';

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
}

export interface ParkingMapHandle {
  animateTo: (center: { latitude: number; longitude: number }, zoomedIn?: boolean) => void;
  animateToUser: () => Promise<boolean>;
  /** The driver's current position, or null if unavailable/denied. */
  getUserLocation: () => Promise<{ latitude: number; longitude: number } | null>;
}

/** Zoom thresholds (in latitudeDelta) for progressive street rendering. */
export const SHOW_CLASSIFIED_MAX_DELTA = 0.09;
export const SHOW_UNKNOWN_MAX_DELTA = 0.035;
