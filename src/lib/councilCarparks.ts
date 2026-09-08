/**
 * Council-run off-street car parks and, crucially, how long you get free.
 *
 * "3 hours free at Parraween St, 2 hours in Crows Nest" is the kind of thing
 * a driver actually decides on, and it isn't in any open-data feed — it's
 * prose on council pages, scraped by scripts/fetch-council-carparks.mjs.
 *
 * Everything here is quoted from the council, and a free period that is only
 * for registered residents is NOT counted as free (see `residentsOnlyNote`).
 */

import { parseIntervals, isNowInWindows, formatMaxstay, formatInterval } from './rules';

export interface CouncilCarPark {
  id: string;
  name: string;
  council: string;
  address: string | null;
  latitude: number;
  longitude: number;
  openingHours: string | null;
  /** Free minutes anyone can use, or null when the car park is paid-only. */
  freeMinutes: number | null;
  /** When the free period applies, as OSM-ish intervals. */
  freeWindows: string[];
  /** Days that are free all day, e.g. ["Sa","Su"]. */
  freeAllDay: string[];
  unrestrictedOutside: boolean;
  feesText: string | null;
  restrictionsText: string | null;
  residentsOnlyNote?: string | null;
  operator?: string | null;
  phone?: string | null;
  accessibleSpaces: string | null;
  evCharging: string | null;
  clearanceHeight: string | null;
  url: string;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const raw = require('../data/council-carparks.json') as {
  generated: string; source: string; carParks: CouncilCarPark[];
};

export const councilCarParks: CouncilCarPark[] = raw.carParks;
export const councilCarParksSource = raw.source;

const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export interface CarParkNow {
  /** Free to park in this minute (the free period, or a free-all-day day). */
  freeNow: boolean;
  /** Short badge for the map pin: "3h free", "2h free", "Free today", "Paid". */
  badge: string;
  /** One line for the sheet. */
  detail: string;
}

export function evaluateCarPark(c: CouncilCarPark, now: Date): CarParkNow {
  const today = DAY_ABBR[now.getDay()];
  const freeAllDayToday = c.freeAllDay.includes(today);

  if (freeAllDayToday) {
    return { freeNow: true, badge: 'Free today', detail: `Free all day ${dayName(today)}.` };
  }

  if (c.freeMinutes) {
    const label = formatMaxstay(c.freeMinutes);
    if (!c.freeWindows.length) {
      // Free period published without hours — say so rather than implying now.
      return {
        freeNow: true,
        badge: `${short(c.freeMinutes)} free`,
        detail: `${label} free${c.openingHours ? ` · ${c.openingHours}` : ''}. Check the sign on arrival.`,
      };
    }
    const windows = c.freeWindows.flatMap((w) => parseIntervals(w) ?? []);
    const inWindow = windows.length > 0 && isNowInWindows(windows, now);
    if (inWindow) {
      return {
        freeNow: true,
        badge: `${short(c.freeMinutes)} free`,
        detail: `${label} free right now — ${c.freeWindows.map(formatInterval).join('; ')}.`,
      };
    }
    return {
      freeNow: c.unrestrictedOutside,
      badge: c.unrestrictedOutside ? 'Unrestricted' : `${short(c.freeMinutes)} free`,
      detail: c.unrestrictedOutside
        ? `Unrestricted now — ${label} free applies ${c.freeWindows.map(formatInterval).join('; ')}.`
        : `${label} free ${c.freeWindows.map(formatInterval).join('; ')}.`,
    };
  }

  if (c.feesText) {
    const first = c.feesText.split('\n').find((l) => /\$/.test(l));
    return { freeNow: false, badge: 'Paid', detail: first ? first.replace(/^•\s*/, '') : 'Paid parking.' };
  }
  return {
    freeNow: false,
    badge: 'Car park',
    detail: c.operator ? `Operated by ${c.operator}. Rates not published.` : 'Rates not published.',
  };
}

function short(min: number): string {
  return min % 60 === 0 ? `${min / 60}h` : `${min}m`;
}

function dayName(abbr: string): string {
  return { Su: 'Sunday', Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday' }[abbr] ?? abbr;
}
