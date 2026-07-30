/**
 * The "Free NOW" engine.
 *
 * Evaluates OSM-style time intervals ("Mo-Fr 08:30-18:00; Sa 08:30-12:30")
 * against a given moment to answer the only question that matters:
 * can I park here right now, and for how long?
 */

import type { SideRule, SideEvaluation, LiveStatus, StreetProps } from './types';

const DAY_INDEX: Record<string, number> = {
  su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6,
};
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Window {
  days: Set<number>; // 0 = Sunday … 6 = Saturday
  startMin: number;  // minutes since midnight
  endMin: number;
}

const ALL_DAYS = new Set([0, 1, 2, 3, 4, 5, 6]);

function parseDays(token: string): Set<number> | null {
  const t = token.toLowerCase();
  const range = t.match(/^([a-z]{2})-([a-z]{2})$/);
  if (range) {
    const a = DAY_INDEX[range[1]];
    const b = DAY_INDEX[range[2]];
    if (a === undefined || b === undefined) return null;
    const days = new Set<number>();
    for (let d = a; ; d = (d + 1) % 7) {
      days.add(d);
      if (d === b) break;
    }
    return days;
  }
  const single = DAY_INDEX[t];
  return single === undefined ? null : new Set([single]);
}

function parseTimeRange(token: string): [number, number] | null {
  const m = token.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return [
    parseInt(m[1], 10) * 60 + parseInt(m[2], 10),
    parseInt(m[3], 10) * 60 + parseInt(m[4], 10),
  ];
}

/**
 * Parse an OSM-ish interval expression into windows.
 * Handles: "Mo-Fr 08:30-18:00", "Sa 08:00-12:00", "Su", "08:00-18:00",
 * multiple rules split by ";" or ",", and combined day groups "Mo-Fr,Sa".
 * Returns null if nothing could be parsed (treat as "always" is unsafe —
 * callers decide).
 */
export function parseIntervals(expr?: string): Window[] | null {
  if (!expr) return null;
  const windows: Window[] = [];
  for (const clause of expr.split(';')) {
    const c = clause.trim();
    if (!c) continue;
    // pull out the time range (if any), everything before it is days
    const timeMatch = c.match(/(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/);
    const time = timeMatch ? parseTimeRange(timeMatch[1].replace(/\s/g, '')) : null;
    const dayPart = (timeMatch ? c.slice(0, timeMatch.index) : c).trim().replace(/,$/, '');

    let days: Set<number> | null = null;
    if (dayPart) {
      days = new Set<number>();
      let ok = false;
      for (const dt of dayPart.split(',')) {
        const parsed = parseDays(dt.trim());
        if (parsed) {
          parsed.forEach((d) => days!.add(d));
          ok = true;
        }
      }
      if (!ok) days = null;
    }
    if (!days && !time) continue;
    windows.push({
      days: days ?? ALL_DAYS,
      startMin: time ? time[0] : 0,
      endMin: time ? time[1] : 24 * 60,
    });
  }
  return windows.length ? windows : null;
}

const WEEK_MIN = 7 * 24 * 60;

/** Minute-of-week (Sunday 00:00 = 0) for a moment. */
function minuteOfWeek(now: Date): number {
  return now.getDay() * 24 * 60 + now.getHours() * 60 + now.getMinutes();
}

/**
 * Flatten windows into absolute minute-of-week spans [start, length).
 * Overnight windows (22:00-06:00) roll past midnight into the next day, so a
 * span may extend beyond the end of the week — callers compare modulo a week.
 */
function toSpans(windows: Window[]): { start: number; len: number }[] {
  const spans: { start: number; len: number }[] = [];
  for (const w of windows) {
    const len = w.endMin > w.startMin ? w.endMin - w.startMin : w.endMin + 24 * 60 - w.startMin;
    if (len <= 0) continue;
    for (const d of w.days) spans.push({ start: (d * 24 * 60 + w.startMin) % WEEK_MIN, len });
  }
  return spans;
}

/** How far into `span` is minute-of-week `t`, or null if outside it. */
function offsetInto(t: number, span: { start: number; len: number }): number | null {
  const delta = (t - span.start + WEEK_MIN) % WEEK_MIN;
  return delta < span.len ? delta : null;
}

/**
 * Minutes from `now` until these windows stop covering the clock — i.e. when a
 * fee or a ban lifts. Returns 0 when they don't cover it already, or null if
 * they cover it indefinitely (a week with no gap).
 *
 * Abutting and overlapping windows are walked through as one block, so a fee
 * of "Mo-Fr 08:00-12:00; Mo-Fr 12:00-18:00" correctly frees up at 6pm, not noon.
 */
export function minutesUntilOutside(windows: Window[], now: Date): number | null {
  const spans = toSpans(windows);
  if (!spans.length) return 0;
  let elapsed = 0;
  let t = minuteOfWeek(now);
  // Each hop lands on the end of a covering span; with a finite span list the
  // walk either finds a gap or laps the week.
  for (let hops = 0; hops <= spans.length; hops++) {
    let furthest = 0;
    for (const s of spans) {
      const into = offsetInto(t, s);
      if (into !== null) furthest = Math.max(furthest, s.len - into);
    }
    if (furthest === 0) return elapsed;
    elapsed += furthest;
    if (elapsed >= WEEK_MIN) return null;
    t = (t + furthest) % WEEK_MIN;
  }
  return null;
}

export function isNowInWindows(windows: Window[], now: Date): boolean {
  const day = now.getDay();
  const min = now.getHours() * 60 + now.getMinutes();
  return windows.some((w) => {
    if (w.endMin >= w.startMin) {
      return w.days.has(day) && min >= w.startMin && min < w.endMin;
    }
    // overnight window, e.g. 22:00-06:00
    const prevDay = (day + 6) % 7;
    return (w.days.has(day) && min >= w.startMin) || (w.days.has(prevDay) && min < w.endMin);
  });
}

/** "Mo-Fr 08:30-18:00" → "Mon–Fri 8:30am–6pm" */
export function formatInterval(expr?: string): string {
  const windows = parseIntervals(expr);
  if (!windows) return expr ?? '';
  return windows
    .map((w) => {
      const days = formatDays(w.days);
      const allDay = w.startMin === 0 && w.endMin === 24 * 60;
      const time = allDay ? '' : ` ${formatTime(w.startMin)}–${formatClock(w.endMin)}`;
      return `${days}${time}`.trim();
    })
    .join(', ');
}

function formatDays(days: Set<number>): string {
  if (days.size === 7) return 'Every day';
  const sorted = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.has(d));
  // detect contiguous run in Mon-first order
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const monFirst = [1, 2, 3, 4, 5, 6, 0];
  const contiguous =
    sorted.length > 2 &&
    monFirst.slice(monFirst.indexOf(first), monFirst.indexOf(first) + sorted.length)
      .every((d, i) => sorted[i] === d);
  if (contiguous) return `${DAY_NAMES[first]}–${DAY_NAMES[last]}`;
  return sorted.map((d) => DAY_NAMES[d]).join(', ');
}

function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour12}:${String(m).padStart(2, '0')}${suffix}` : `${hour12}${suffix}`;
}

// NSW parking signs express time limits as "nP" where n is hours; sub-hour
// limits use fractions (¼P = 15 min, ½P = 30 min, ¾P = 45 min).
const P_FRACTIONS: Record<number, string> = { 15: '¼P', 30: '½P', 45: '¾P' };

/** Short sign-style label for a time limit, e.g. 120 → "2P", 30 → "½P". */
export function pShort(min?: number): string {
  if (!min) return '';
  if (P_FRACTIONS[min]) return P_FRACTIONS[min];
  if (min < 60) return `${min}min`;
  if (min % 60 === 0) return `${min / 60}P`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 30 ? `${h}½P` : `${(min / 60).toFixed(1)}h`;
}

/** Minute-of-day → clock label, e.g. 1320 → "10pm", 1440/0 → "midnight". */
export function formatClock(min: number): string {
  if (min === 0 || min === 24 * 60) return 'midnight';
  if (min === 12 * 60) return 'noon';
  return formatTime(min);
}

/** Metered tariff → "$7/hr" / "$6.40/hr". */
export function formatPrice(perHour?: number): string {
  if (!perHour) return '';
  return Number.isInteger(perHour) ? `$${perHour}/hr` : `$${perHour.toFixed(2)}/hr`;
}

/** Verbose limit for the detail sheet, e.g. "2P (2h max)". */
export function formatMaxstay(min?: number): string {
  if (!min) return '';
  const p = pShort(min);
  const dur = min < 60
    ? `${min} min`
    : min % 60 === 0
      ? `${min / 60}h`
      : `${(min / 60).toFixed(1)}h`;
  return `${p} (${dur} max)`;
}

/** Evaluate one side of a street at a given moment. */
export function evaluateSide(rule: SideRule | undefined, now: Date): SideEvaluation {
  if (!rule) {
    return { status: 'unknown', detail: 'No data for this side — check signs.' };
  }

  // Permanent bans (a banInterval means the ban is time-boxed, handled below)
  if (rule.kind === 'no_stopping' && !rule.banInterval) {
    return { status: 'banned', detail: 'No stopping at any time.', zone: rule.zone };
  }
  if (rule.kind === 'no_parking' && !rule.banInterval) {
    const detail =
      rule.zone === 'kiss_ride' ? 'Kiss & Ride — drop-off / pick-up only, no parking.'
      : rule.zone === 'loading' ? 'Loading zone — no general parking.'
      : 'No parking at any time.';
    return { status: 'banned', detail, zone: rule.zone };
  }

  // Clearway / timed ban windows
  const banWindows = parseIntervals(rule.banInterval);
  if (banWindows && isNowInWindows(banWindows, now)) {
    return { status: 'banned', detail: `No stopping ${formatInterval(rule.banInterval)} (active now).` };
  }
  const banSuffix = rule.banInterval
    ? ` Clearway ${formatInterval(rule.banInterval)}.`
    : '';

  // "Permit holders excepted" — resident-permit vehicles ignore the limit.
  // When the pipeline knows which scheme area the kerb belongs to (e.g. North
  // Sydney "Area 12"), name it so a permit holder can tell if theirs matches.
  const areaLabel = rule.permitLabel
    ? rule.permitLabel
    : rule.permitArea
      ? `Area ${rule.permitArea}${rule.permitZone && rule.permitZone !== 'A' ? rule.permitZone : ''}`
      : '';
  const permitSuffix = rule.permitExcepted
    ? areaLabel
      ? ` ${areaLabel} permit holders excepted.`
      : ' Permit holders excepted.'
    : '';
  // "Free after 10pm" style hint from the metered cut-off.
  const cutOffSuffix =
    rule.cutOffMin && rule.cutOffMin < 24 * 60 ? ` Free after ${formatClock(rule.cutOffMin)}.` : '';

  // Timed bans (no_parking/no_stopping restricted to a window): outside the
  // window the kerb is available.
  if (rule.kind === 'no_parking' || rule.kind === 'no_stopping') {
    const what = rule.zone === 'loading' ? 'Loading zone' : `No ${rule.kind === 'no_stopping' ? 'stopping' : 'parking'}`;
    return {
      status: 'free',
      detail: `Parking allowed now — ${what.toLowerCase()} ${formatInterval(rule.banInterval)}.`,
      zone: rule.zone,
    };
  }

  if (rule.kind === 'residents') {
    // A resident-permit precinct with "Permit Holders Excepted" still lets
    // non-residents park — just time-limited. We know WHERE the scheme applies
    // (authoritative precinct polygons) but not the exact hour limit for
    // un-metered kerbs (not in open data), so we say "check the sign" rather
    // than inventing a number. This is a park-able state, not "residents only".
    if (rule.zone === 'residential' && rule.permitExcepted && !rule.maxstayMin) {
      return {
        status: 'free_limited',
        detail:
          `Timed visitor parking — ${areaLabel ? `${areaLabel} ` : ''}permit holders excepted. Check the sign for the limit.` +
          banSuffix,
        zone: rule.zone,
      };
    }
    return {
      status: 'residents',
      detail: `${areaLabel ? `${areaLabel} permit` : 'Permit'} holders only.` + banSuffix,
      zone: rule.zone,
    };
  }

  if (rule.kind === 'paid') {
    const priceStr = rule.pricePerHour ? ` ${formatPrice(rule.pricePerHour)}.` : '';
    const freeWindows = parseIntervals(rule.freeInterval);
    if (freeWindows && isNowInWindows(freeWindows, now)) {
      return {
        status: 'free',
        detail: `Free ${formatInterval(rule.freeInterval)} — meter applies other times.` + banSuffix,
        zone: rule.zone,
      };
    }
    const feeWindows = parseIntervals(rule.feeInterval);
    if (feeWindows && !isNowInWindows(feeWindows, now)) {
      return {
        status: 'free',
        detail: `Meter applies ${formatInterval(rule.feeInterval)} — free right now.` + cutOffSuffix + banSuffix,
        maxstayMin: rule.maxstayMin,
        zone: rule.zone,
      };
    }
    const stay = rule.maxstayMin ? ` Max stay ${formatMaxstay(rule.maxstayMin)}.` : '';
    if (rule.rateZoneFill && !rule.feeInterval) {
      return {
        status: 'paid',
        detail: `In a metered zone —${priceStr || ' ticket parking.'} Check the sign for hours & limit.` + banSuffix,
        pricePerHour: rule.pricePerHour,
        zone: rule.zone,
      };
    }
    return {
      status: 'paid',
      detail: `Meter parking now.${priceStr}${stay}` + permitSuffix + cutOffSuffix + banSuffix,
      maxstayMin: rule.maxstayMin,
      pricePerHour: rule.pricePerHour,
      zone: rule.zone,
    };
  }

  if (rule.kind === 'free_limited') {
    const limitWindows = parseIntervals(rule.interval);
    if (limitWindows && !isNowInWindows(limitWindows, now)) {
      return {
        status: 'free',
        detail: `Unrestricted now — ${formatMaxstay(rule.maxstayMin)} applies ${formatInterval(rule.interval)}.` + banSuffix,
        zone: rule.zone,
      };
    }
    return {
      status: 'free_limited',
      detail: `${formatMaxstay(rule.maxstayMin)}${rule.interval ? ` ${formatInterval(rule.interval)}` : ''}.` + permitSuffix + banSuffix,
      maxstayMin: rule.maxstayMin,
      zone: rule.zone,
    };
  }

  if (rule.kind === 'free') {
    return { status: 'free', detail: 'Free parking.' + (banSuffix || ' No known restrictions.') };
  }

  return { status: 'unknown', detail: 'Parking mapped but rules unverified — check signs.' + banSuffix };
}

/** When a kerb that isn't free right now next frees up. */
export interface NextFree {
  /** Minutes from now until it becomes free. */
  inMin: number;
  /** Clock label of the moment it frees up, e.g. "10pm". */
  at: string;
}

/** "in 45 min" / "in 2h 10m" / "in 3 days". */
export function formatCountdown(min: number): string {
  if (min < 1) return 'now';
  if (min < 60) return `in ${min} min`;
  if (min < 24 * 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `in ${h}h ${m}m` : `in ${h}h`;
  }
  const d = Math.round(min / (24 * 60));
  return d === 1 ? 'tomorrow' : `in ${d} days`;
}

/** Minutes until one side frees up; null when it won't (or we can't tell). */
function nextFreeForSide(rule: SideRule | undefined, now: Date): number | null {
  if (!rule) return null;

  // Timed bans lift at the end of their window; permanent ones never do.
  if (rule.kind === 'no_parking' || rule.kind === 'no_stopping') {
    const windows = parseIntervals(rule.banInterval);
    return windows ? minutesUntilOutside(windows, now) : null;
  }

  if (rule.kind === 'paid') {
    const fee = parseIntervals(rule.feeInterval);
    if (fee) {
      const until = minutesUntilOutside(fee, now);
      // A ban outlasting the meter (clearway at 6pm) keeps the kerb unusable.
      const ban = parseIntervals(rule.banInterval);
      if (until !== null && ban) {
        const banGone = minutesUntilOutside(ban, new Date(now.getTime() + until * 60000));
        if (banGone === null) return null;
        return until + banGone;
      }
      return until;
    }
    // No fee hours published, but the meter's cut-off tells us when it lapses.
    if (rule.cutOffMin && rule.cutOffMin < 24 * 60) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      return nowMin < rule.cutOffMin ? rule.cutOffMin - nowMin : 0;
    }
    return null;
  }

  // Permit-only kerbs and unverified ones never resolve to a known free time.
  return null;
}

/**
 * When does this street next become free to park on?
 *
 * Returns null when it's free already, when it never frees up (permit-only,
 * permanent clearway), or when the hours aren't published — we'd rather say
 * nothing than invent a time a driver would rely on.
 */
export function nextFreeAt(props: StreetProps, now: Date): NextFree | null {
  const status = evaluateStreet(props, now).status;
  if (status === 'free' || status === 'free_limited' || status === 'unknown') return null;

  const candidates = [props.left, props.right]
    .map((r) => nextFreeForSide(r, now))
    .filter((m): m is number => m !== null && m > 0);
  if (!candidates.length) return null;

  const inMin = Math.min(...candidates);
  const at = new Date(now.getTime() + inMin * 60000);
  return { inMin, at: formatClock(at.getHours() * 60 + at.getMinutes()) };
}

const STATUS_RANK: Record<LiveStatus, number> = {
  free: 0, free_limited: 1, paid: 2, residents: 3, unknown: 4, banned: 5,
};

/** Best live status across both sides of a street. */
export function evaluateStreet(props: StreetProps, now: Date): SideEvaluation {
  const left = evaluateSide(props.left, now);
  const right = evaluateSide(props.right, now);
  if (!props.left && !props.right) {
    return props.cat === 'unknown'
      ? { status: 'unknown', detail: 'Typical residential street — usually unrestricted, check signs.' }
      : left;
  }
  return STATUS_RANK[left.status] <= STATUS_RANK[right.status] ? left : right;
}
