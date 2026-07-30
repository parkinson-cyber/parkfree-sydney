/** Static classification of a street (from the data pipeline). */
export type ParkingKind =
  | 'free'
  | 'free_limited'
  | 'paid'
  | 'residents'
  | 'no_parking'
  | 'no_stopping'
  | 'unknown';

/** Live status after evaluating rules against the current time. */
export type LiveStatus =
  | 'free'
  | 'free_limited'
  | 'paid'
  | 'residents'
  | 'banned'
  | 'unknown';

/** Kind of kerbside zone, beyond the basic parking category. */
export type ZoneType = 'meter' | 'loading' | 'kiss_ride' | 'residential' | 'free15';

/** Rules for one side of a street, as produced by the data pipeline. */
export interface SideRule {
  kind: ParkingKind;
  /** Max stay in minutes (e.g. 120 for "2P"). */
  maxstayMin?: number;
  /** When the max-stay / restriction applies, e.g. "Mo-Fr 08:30-18:00". */
  interval?: string;
  /** Clearway / no-stopping windows, e.g. "Mo-Fr 06:00-10:00". */
  banInterval?: string;
  /** When a fee applies (outside it, parking is free). */
  feeInterval?: string;
  /** Explicit free window on an otherwise paid street, e.g. "Su". */
  freeInterval?: string;
  /** Metered tariff in dollars per hour (e.g. 7 for "$7/HR"). */
  pricePerHour?: number;
  /** Latest minute-of-day any restriction applies; free after this (e.g. 1320 = 10pm). */
  cutOffMin?: number;
  /** Resident-permit holders exempt from the limit ("Permit Holders Excepted"). */
  permitExcepted?: boolean;
  /** Resident-permit scheme area number the exemption belongs to (e.g. 12 for "Area 12"). */
  permitArea?: number;
  /** Sub-zone letter within the permit area, where the scheme has one (e.g. "B"). */
  permitZone?: string;
  /** Human permit-area label for councils with named (not numbered) zones (e.g. "Paddington 3"). */
  permitLabel?: string;
  /** Kerbside zone classification, when known. */
  zone?: ZoneType;
  /** Derived from a metered rate-zone polygon (rate known, exact hours not). */
  rateZoneFill?: boolean;
}

export interface StreetProps {
  id: number;
  cat: ParkingKind;
  area: string;
  name?: string;
  left?: SideRule;
  right?: SideRule;
  /** Dominant kerbside zone for the street, when known. */
  zone?: ZoneType;
}

export interface StreetFeature {
  type: 'Feature';
  properties: StreetProps;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}

export interface ParkingCollection {
  type: 'FeatureCollection';
  metadata: { generated: string; source: string; areas: string[] };
  features: StreetFeature[];
}

export interface SideEvaluation {
  status: LiveStatus;
  /** Human-readable explanation, e.g. "2P limit applies Mon–Fri 8:30–18:00". */
  detail: string;
  maxstayMin?: number;
  /** Metered tariff in $/hour, surfaced for the detail sheet. */
  pricePerHour?: number;
  /** Kerbside zone, surfaced for the detail sheet / map. */
  zone?: ZoneType;
}

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}
