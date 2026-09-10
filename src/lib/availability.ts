/**
 * How likely is a space free on this street, right now?
 *
 * Nobody measures on-street occupancy in Sydney — the City removed its
 * sensors — so this is an ESTIMATE, and the app says so. What makes it worth
 * showing is that every input is a real signal and the estimate carries the
 * evidence that produced it, so a driver can judge it themselves.
 *
 * Signals, strongest first:
 *   1. The law. If you may not park here this minute, nothing else matters.
 *   2. Crowd reports on this street, decayed by age (someone leaving is worth
 *      a lot for ten minutes and nothing an hour later).
 *   3. Measured demand nearby. The TfNSW Park&Ride feed reports real occupancy
 *      hourly; a commuter car park at 98% within walking distance is hard
 *      evidence that the whole area is under pressure. This is the only
 *      *measured* input, so it carries real weight.
 *   4. A time-of-day prior for the street's kind (metered strip, residential
 *      permit street, beach front). Hand-set from known Sydney patterns and
 *      labelled as such — it is the weakest input and is meant to be replaced
 *      by the occupancy history the hourly job is now accumulating.
 *
 * Confidence is deliberately capped below certainty: without a sensor in the
 * kerb we can never be sure, and a number that claims to be is worse than
 * useless.
 */

import type { LiveStatus, StreetProps } from './types';
import type { CarPark } from './carparks';
import { isFreeKind, type Report } from './reportKinds';
import { distanceM } from './geo';

export type Band = 'likely' | 'mixed' | 'unlikely' | 'unavailable' | 'unknown';

export interface Availability {
  /** P(a space is free), 0–1. Null when we decline to guess. */
  score: number | null;
  band: Band;
  /** 0–1. How much the score should be trusted. */
  confidence: number;
  /** Headline, e.g. "Usually some space" */
  headline: string;
  /** The reasons, most important first — shown as a checklist. */
  evidence: string[];
  /** Named so the sheet can say where the number came from. */
  basis: 'law' | 'reports' | 'measured' | 'prior' | 'none';
}

const HALF_LIFE_FREE_MIN = 10;   // "I'm leaving" ages fast — someone takes it
const HALF_LIFE_FULL_MIN = 20;   // "it's full" stays true a bit longer
const REPORT_RADIUS_M = 150;
const CARPARK_RADIUS_M = 1200;

/** log-odds helpers: evidence adds, it never multiplies past certainty. */
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Time-of-day priors. Hand-set from how Sydney parking actually behaves, and
 * flagged as a guess in the UI — these are the first thing that should be
 * replaced once enough measured history exists.
 */
export function priorFor(props: StreetProps, now: Date): { p: number; why: string } {
  const hour = now.getHours();
  const day = now.getDay();
  const weekend = day === 0 || day === 6;
  const zone = props.zone;
  const kind = props.cat;

  if (kind === 'paid' || zone === 'meter') {
    // Metered strips: paid hours keep turnover high, and empty out after.
    if (hour >= 22 || hour < 7) return { p: 0.85, why: 'Metered street, late at night' };
    if (weekend) return { p: 0.45, why: 'Metered street on a weekend' };
    return { p: 0.55, why: 'Metered street in business hours — meters keep spaces turning over' };
  }
  if (kind === 'residents' || zone === 'residential') {
    // Permit streets fill up when residents come home.
    if (hour >= 19 || hour < 7) return { p: 0.2, why: 'Residential permit street overnight — residents are home' };
    if (weekend) return { p: 0.3, why: 'Residential permit street on a weekend' };
    return { p: 0.55, why: 'Residential permit street on a weekday — residents are out' };
  }
  if (weekend && hour >= 9 && hour <= 16) {
    return { p: 0.3, why: 'Middle of a weekend day — the busiest time to find a space' };
  }
  if (hour >= 22 || hour < 7) return { p: 0.8, why: 'Late night — most kerbs are open' };
  return { p: 0.5, why: 'No strong pattern for this street at this hour' };
}

function decayWeight(iso: string, now: Date, halfLifeMin: number): number {
  const ageMin = (now.getTime() - Date.parse(iso)) / 60000;
  if (!Number.isFinite(ageMin) || ageMin < 0) return 0;
  return Math.pow(0.5, ageMin / halfLifeMin);
}

export interface AvailabilityInput {
  props: StreetProps;
  status: LiveStatus;
  center: { latitude: number; longitude: number };
  reports: Report[];
  carParks: CarPark[];
  now: Date;
}

export function estimateAvailability({
  props, status, center, reports, carParks, now,
}: AvailabilityInput): Availability {
  // 1. The law comes first and overrides everything.
  if (status === 'banned') {
    return {
      score: 0, band: 'unavailable', confidence: 0.95,
      headline: "You can't park here now",
      evidence: ['The sign bans parking at this hour — no estimate needed'],
      basis: 'law',
    };
  }
  if (status === 'unknown') {
    return {
      score: null, band: 'unknown', confidence: 0,
      headline: 'No estimate for this street',
      evidence: ["We don't know this street's rules, so we won't guess how busy it is"],
      basis: 'none',
    };
  }

  const evidence: string[] = [];
  const prior = priorFor(props, now);
  let odds = logit(prior.p);
  let confidence = 0.25;
  let basis: Availability['basis'] = 'prior';

  // 2. Crowd reports on this street.
  const near = reports.filter(
    (r) => (r.streetId === props.id) ||
      distanceM(center.latitude, center.longitude, r.latitude, r.longitude) <= REPORT_RADIUS_M,
  );
  let freeW = 0;
  let fullW = 0;
  for (const r of near) {
    const free = isFreeKind(r.kind);
    const w = decayWeight(r.reportedAt, now, free ? HALF_LIFE_FREE_MIN : HALF_LIFE_FULL_MIN);
    if (free) freeW += w; else fullW += w;
  }
  if (freeW + fullW > 0.05) {
    // Bounded so a handful of reports can't overrule the legal gate or claim
    // certainty: at most a ~3x odds shift each way.
    odds += clamp01(freeW) * 1.1 - clamp01(fullW) * 1.1;
    confidence += Math.min(0.35, 0.18 * (freeW + fullW));
    basis = 'reports';
    const freshest = near.reduce((a, b) => (Date.parse(a.reportedAt) > Date.parse(b.reportedAt) ? a : b));
    const mins = Math.max(0, Math.round((now.getTime() - Date.parse(freshest.reportedAt)) / 60000));
    if (freeW >= fullW) {
      evidence.push(`${plural(near.filter((r) => isFreeKind(r.kind)).length, 'driver')} reported a space free here, most recently ${mins === 0 ? 'just now' : `${mins} min ago`}`);
    } else {
      evidence.push(`${plural(near.filter((r) => !isFreeKind(r.kind)).length, 'driver')} reported this street full, most recently ${mins === 0 ? 'just now' : `${mins} min ago`}`);
    }
  }

  // 3. Measured demand nearby — the only hard number in here.
  const nearby = carParks
    .map((c) => ({ c, d: distanceM(center.latitude, center.longitude, c.latitude, c.longitude) }))
    .filter(({ d }) => d <= CARPARK_RADIUS_M)
    .sort((a, b) => a.d - b.d)[0];
  if (nearby && nearby.c.spots > 0) {
    const occ = clamp01(nearby.c.occupied / nearby.c.spots);
    // Centred at 70% full: busier than that pushes down, emptier pushes up.
    odds += (0.7 - occ) * 1.6;
    confidence += 0.2;
    if (basis === 'prior') basis = 'measured';
    evidence.push(
      `${nearby.c.name} car park, ${Math.round(nearby.d)} m away, is ${Math.round(occ * 100)}% full right now (measured by Transport for NSW)`,
    );
  }

  // 4. The prior always gets said out loud, so nobody mistakes it for data.
  evidence.push(`${prior.why} (typical pattern, not a measurement)`);
  if (status === 'free_limited' && props.left?.maxstayMin) {
    evidence.push('Time limit here keeps spaces turning over');
    odds += 0.25;
  }

  const score = clamp01(sigmoid(odds));
  confidence = clamp01(Math.min(confidence, 0.85));

  return {
    score,
    band: score >= 0.6 ? 'likely' : score >= 0.35 ? 'mixed' : 'unlikely',
    confidence,
    headline: score >= 0.6 ? 'Usually some space'
      : score >= 0.35 ? 'Could go either way'
      : 'Likely to be full',
    evidence,
    basis,
  };
}

function plural(n: number, word: string): string {
  return n === 1 ? `1 ${word}` : `${n} ${word}s`;
}

/** "55% confidence" — the pill in the sheet. */
export function confidenceLabel(confidence: number): string {
  return `${Math.round(confidence * 100)}% confidence`;
}

/** "About 7 in 10" reads better than a bare percentage on a map pin. */
export function scoreLabel(score: number | null): string {
  if (score === null) return '—';
  return `${Math.round(score * 100)}% free`;
}
