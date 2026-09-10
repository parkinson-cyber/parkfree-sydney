/**
 * Off-street car parks that cost nothing — supermarkets, shopping centres,
 * clubs, beach reserves. From OpenStreetMap's `fee=no` tag.
 *
 * The council layer covers town centres; this covers the other half of the
 * question, and on a shopping strip a two-hour-free supermarket lot is often
 * the best answer available.
 *
 * Two honesties are carried through from the data and must reach the UI:
 *   * `customersOnly` — free *while you shop there*, not free to leave a car
 *     all day. 556 of them are like this.
 *   * `freeMinutes === null` means no limit is published, which is not the
 *     same as unlimited.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const raw = require('../data/free-carparks.json') as {
  generated: string; source: string; carParks: FreeCarPark[];
};

export interface FreeCarPark {
  id: string;
  name: string;
  operator: string | null;
  latitude: number;
  longitude: number;
  customersOnly: boolean;
  /** Published time limit in minutes, or null when none is published. */
  freeMinutes: number | null;
  kind: string;
  capacity: number | null;
  surface: string | null;
}

export const freeCarParks: FreeCarPark[] = raw.carParks;
export const freeCarParksSource = raw.source;

/** Short badge for a pin: "2h free", "Free", "Free for customers". */
export function freeBadge(c: FreeCarPark): string {
  if (c.freeMinutes) {
    const t = c.freeMinutes % 60 === 0 ? `${c.freeMinutes / 60}h` : `${c.freeMinutes}m`;
    return c.customersOnly ? `${t} customers` : `${t} free`;
  }
  return c.customersOnly ? 'Customers' : 'Free';
}

/** One line for the popup — says what the tag actually means. */
export function freeDetail(c: FreeCarPark): string {
  const limit = c.freeMinutes
    ? `${c.freeMinutes >= 60 ? `${c.freeMinutes / 60} hour` : `${c.freeMinutes} minute`} limit`
    : 'No time limit published';
  const who = c.customersOnly
    ? 'Free while you are a customer here — not all-day parking.'
    : 'Free parking.';
  const cap = c.capacity ? ` About ${c.capacity} spaces.` : '';
  return `${who} ${limit}.${cap} Check the sign on arrival.`;
}
