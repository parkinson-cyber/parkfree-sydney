/**
 * Transit demand → how contested a kerb probably is, hour by hour.
 *
 * This is the runtime half of scripts/fetch-opal-demand.py. That script turns
 * Transport for NSW's 2020 Opal tap-on/tap-off release into two normalised
 * shapes per location:
 *
 *   parked[h]    the cumulative net of taps-on minus taps-off at a station
 *                people *leave* from — proportional to the number of cars
 *                sitting on the kerb around it at hour h. Shipped only for
 *                stations where ≥62% of 6–10am taps are tap-ONs, because at a
 *                destination station the same arithmetic measures the evening
 *                exodus and says nothing about parking.
 *
 *   activity[h]  total taps in a postcode — how busy the area is, which is
 *                what consumes a shopping-strip or beachfront kerb.
 *
 * What this file does with them is the modelling, and it is deliberately
 * explicit rather than a black box, because every coefficient here is a claim
 * about Sydney that someone should be able to argue with:
 *
 *  1. A commuter will walk a few hundred metres from a free kerb to a station,
 *     not a few kilometres. So a station's pull decays with distance, and it
 *     scales with how many people actually use it today.
 *
 *  2. **The law decides whether that pull can land.** An all-day commuter
 *     cannot leave a car on a 2P permit street or feed a meter for nine
 *     hours, so the park-and-ride term is damped hard on restricted kerbs and
 *     applies in full only where parking is genuinely unrestricted. This is
 *     the single most important coefficient in the file: without it, the model
 *     would say every permit street near Gordon is full all day, which is the
 *     opposite of the truth and exactly the kind of wrong answer that costs
 *     the owner a drive across town.
 *
 *  3. **A residential street empties when its area is busiest.** Residents are
 *     out at 10am and home at 8pm, so on a residential kerb the activity
 *     curve enters with the opposite sign to a commercial one.
 *
 * Nothing here is presented as measured occupancy. The shapes are measured;
 * the mapping from shape to "probability a space is free" is a model, and
 * `calibration.state` in the shipped file says whether it has ever been fitted
 * against real occupancy (scripts/train-occupancy-model.py) or is still
 * running on the reasoned defaults below. availability.ts reflects that in the
 * confidence it reports.
 */

import { distanceM } from './geo';
import type { StreetProps } from './types';

/* ── the shipped model ──────────────────────────────────────────────────── */

export interface HourCurve {
  /** 24 values, 0–100, index 0 = midnight local time. */
  wd: number[];
  sa: number[];
  su: number[];
}

export interface DemandStation {
  name: string;
  mode: string;
  lat: number;
  lon: number;
  /** Average weekday taps in 2020. */
  taps: number;
  /** Today's level against that, from the 2024-25 monthly feed; null if absent. */
  now: number | null;
  /** Share of 6–10am taps that are tap-ONs. */
  origin: number;
  /** Cars-on-kerb shape. Null at a destination station — see the header. */
  parked: HourCurve | null;
  /** Tap-offs: people arriving. Not shipped for every station. */
  arrivals?: HourCurve;
}

export interface DemandPostcode {
  pc: number;
  lat: number;
  lon: number;
  taps: number;
  /** Share of 6–10am taps that are tap-ONs: >0.5 means people leave here. */
  origin: number;
  /** Cumulative-departure shape; null unless the area is an origin. */
  parked: HourCurve | null;
  /**
   * Tap-OFFs, normalised: people arriving. Deliberately not total taps — in a
   * commuter suburb the total peaks at 7.30am, which is everyone leaving, and
   * reading that as arrivals puts a shopping strip's busiest hour at dawn.
   */
  arrivals: HourCurve;
}

export interface DemandModel {
  generated: string;
  week: string;
  weekNote?: string;
  sources: string[];
  reproducibility?: { meanCorrelationOfParkedCurve: number | null; stationsCompared: number };
  calibration: {
    state: 'uncalibrated' | 'fitted';
    samples: number;
    weights: Partial<Weights> | null;
    fittedAt: string | null;
  };
  stations: DemandStation[];
  postcodes: DemandPostcode[];
}

/** Everything the trainer is allowed to move. Defaults are reasoned, not fitted. */
export interface Weights {
  /** How far a commuter will walk from kerb to platform, as an e-fold in metres. */
  walkDecayM: number;
  /** Beyond this there is no park-and-ride effect at all. */
  walkMaxM: number;
  /** Daily taps at which a station exerts its full pull. */
  refTaps: number;
  /** Log-odds swing of the park-and-ride term across its full range. */
  parkRideGain: number;
  /** Log-odds swing of the visitor-arrivals term. */
  activityGain: number;
  /** Arrival rate treated as neutral (neither busy nor quiet). */
  activityMid: number;
  /** Share of commuter pressure a kerb is exposed to, by what the sign allows. */
  exposure: { free: number; limited: number; paid: number; residents: number };
  /**
   * Share of the cars on this kerb that belong to people who live on it. The
   * same departure curve that *fills* an unrestricted kerb *empties* this one.
   */
  resident: { free: number; limited: number; paid: number; residents: number };
}

export const DEFAULT_WEIGHTS: Weights = {
  // ~450 m e-fold, 1 km hard stop: the distances park-and-ride surveys
  // consistently find people will walk, and past 1 km a free kerb competes
  // with the station car park rather than with other kerbs.
  walkDecayM: 450,
  walkMaxM: 1000,
  // Gordon (16k taps) and Revesby (10k) are the archetypal Sydney
  // park-and-ride stations, so full pull sits a little above them.
  refTaps: 20000,
  // ±1.1 in log-odds ≈ a 3× swing in the odds a space is free between an
  // empty kerb and a full one. Enough to change an answer, not enough to
  // overrule the law or a driver who just looked at the street.
  parkRideGain: 2.2,
  activityGain: 1.3,
  activityMid: 0.45,
  exposure: {
    // Unrestricted kerb near a station: this is where commuters go, and it
    // takes the full force of the morning.
    free: 1.0,
    // "2P 8am-6pm" stops a nine-hour commuter outright; what's left is the
    // short-stay overflow and the people who risk it.
    limited: 0.3,
    // A meter is a price, not a prohibition — some commuters pay it.
    paid: 0.5,
    // A permit street is the point of a permit street.
    residents: 0.2,
  },
  resident: {
    // Even an unrestricted suburban street holds some residents' cars, and
    // they leave in the morning like everyone else.
    free: 0.35,
    limited: 0.35,
    // A metered strip is not where anyone lives.
    paid: 0.1,
    // A permit street is almost entirely residents' cars, so the morning
    // departure that fills the station kerb *empties* this one. Getting this
    // sign wrong would report Gordon's permit streets as full at 10am, when
    // they are among the emptiest kerbs in Sydney.
    residents: 1.0,
  },
};

let MODEL: DemandModel | null = null;
let WEIGHTS: Weights = DEFAULT_WEIGHTS;

/** Called once at boot by demandModel.ts; left unset in the test harness. */
export function setDemandModel(m: DemandModel | null): void {
  MODEL = m;
  WEIGHTS = m?.calibration?.weights
    ? { ...DEFAULT_WEIGHTS, ...m.calibration.weights,
        exposure: { ...DEFAULT_WEIGHTS.exposure, ...(m.calibration.weights.exposure ?? {}) },
        resident: { ...DEFAULT_WEIGHTS.resident, ...(m.calibration.weights.resident ?? {}) } }
    : DEFAULT_WEIGHTS;
}

export function demandModel(): DemandModel | null {
  return MODEL;
}

/* ── reading a curve ───────────────────────────────────────────────────────── */

function dayKey(now: Date): keyof HourCurve {
  const d = now.getDay();
  return d === 0 ? 'su' : d === 6 ? 'sa' : 'wd';
}

/** A curve at `now`, interpolated between hours so it moves continuously. */
function at(curve: HourCurve, now: Date): number {
  const row = curve[dayKey(now)];
  if (!row || row.length !== 24) return 0;
  const h = now.getHours();
  const frac = now.getMinutes() / 60;
  const a = row[h];
  const b = row[(h + 1) % 24];
  return (a + (b - a) * frac) / 100;
}

/* ── the signal ────────────────────────────────────────────────────────────── */

export interface DemandSignal {
  /**
   * How far through the daily cycle of departures this place is, 0–1: 0 means
   * everyone who drives is still at home, 1 is the daily peak. It fills an
   * unrestricted kerb (commuters arriving) and empties a residential one
   * (residents leaving) — the same number, read from both ends.
   */
  parkRide: number | null;
  /** 0–1: how big and how close the stations behind that number are. */
  parkRideWeight: number;
  /** People arriving in the area right now, 0–1 of its own daily peak. */
  arrivals: number | null;
  /** Share of the area's morning taps that are departures, 0–1. */
  areaOrigin: number;
  /** The strongest contributing station, for the evidence line. */
  station: { name: string; meters: number; taps: number } | null;
  postcode: number | null;
}

const EMPTY: DemandSignal = {
  parkRide: null, parkRideWeight: 0, arrivals: null, areaOrigin: 0.5,
  station: null, postcode: null,
};

/**
 * What the tap data says about this point, right now.
 *
 * `postcode` is passed in rather than looked up spatially when the street
 * knows its own suburb: that is an exact join through the gazetted boundary,
 * where nearest-centroid would guess. Falls back to the nearest postcode
 * centroid within 3 km when the street has no suburb.
 */
export function demandSignal(
  center: { latitude: number; longitude: number },
  now: Date,
  postcode?: number | null,
): DemandSignal {
  const m = MODEL;
  if (!m) return EMPTY;
  const w = WEIGHTS;

  // 1. Park-and-ride pressure: every origin station within walking distance,
  //    weighted by distance and by how many people use it today.
  let num = 0;
  let den = 0;
  let strength = 0;
  let best: DemandSignal['station'] = null;
  let bestW = 0;

  for (const s of m.stations) {
    if (!s.parked) continue;
    const d = distanceM(center.latitude, center.longitude, s.lat, s.lon);
    if (d > w.walkMaxM) continue;
    // `now` is a level, not a shape: a station at 60% of its 2020 patronage
    // puts 60% as many cars on the kerb.
    const level = s.taps * (s.now ?? 1);
    const pull = Math.exp(-d / w.walkDecayM) * Math.min(1, level / w.refTaps);
    if (pull <= 0.01) continue;
    num += at(s.parked, now) * pull;
    den += pull;
    strength += pull;
    if (pull > bestW) {
      bestW = pull;
      best = { name: s.name, meters: Math.round(d), taps: Math.round(level) };
    }
  }

  // 2. The area, by the street's own postcode when it has one.
  let area: DemandPostcode | null = null;
  if (postcode != null) area = m.postcodes.find((p) => p.pc === postcode) ?? null;
  if (!area) {
    let nd = Infinity;
    for (const p of m.postcodes) {
      const d = distanceM(center.latitude, center.longitude, p.lat, p.lon);
      if (d < nd) { nd = d; area = p; }
    }
    if (nd > 3000) area = null;
  }

  // 3. No station in range, but a bus-commuter postcode has the same shape in
  //    its own tap flow — coarser, so it enters at half weight.
  if (den === 0 && area?.parked) {
    num = at(area.parked, now);
    den = 1;
    strength = 0.5;
  }

  return {
    parkRide: den > 0 ? num / den : null,
    parkRideWeight: Math.min(1, strength),
    arrivals: area ? at(area.arrivals, now) : null,
    areaOrigin: area?.origin ?? 0.5,
    station: best,
    postcode: area?.pc ?? null,
  };
}

/* ── turning the signal into a prior ──────────────────────────────────────── */

type KerbClass = 'free' | 'limited' | 'paid' | 'residents';

function kerbClass(props: StreetProps): KerbClass {
  const side = props.left ?? props.right;
  if (props.cat === 'residents' || side?.permitExcepted || props.zone === 'residential') {
    return 'residents';
  }
  if (props.cat === 'paid' || props.zone === 'meter') return 'paid';
  if (props.cat === 'free_limited' || side?.maxstayMin) return 'limited';
  return 'free';
}

/** How much all-day commuter pressure this kerb's rules actually let through. */
export function exposure(props: StreetProps): number {
  return WEIGHTS.exposure[kerbClass(props)];
}

/** How much of this kerb is residents' cars, which leave as the kerb fills. */
export function residentShare(props: StreetProps): number {
  return WEIGHTS.resident[kerbClass(props)];
}

/** A street where the cars belong to the people who live there. */
function isResidential(props: StreetProps): boolean {
  return props.cat === 'residents' || props.zone === 'residential'
    || !!(props.left ?? props.right)?.permitExcepted;
}

export interface DemandPrior {
  /** P(a space is free) before crowd reports and measured car parks. */
  p: number;
  /** Extra confidence this evidence earns, 0–1. */
  confidence: number;
  /** Lines for the evidence list, strongest first. */
  evidence: string[];
  /** True when the number came from tap data rather than the fallback. */
  measured: boolean;
}

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * The Opal-derived prior for one street at one moment.
 *
 * Returns null when the tap data has nothing to say here — which is most of
 * Sydney away from a station or a bus-heavy postcode — and availability.ts
 * then falls back to the hand-set time-of-day prior it always had.
 */
export function demandPrior(
  props: StreetProps,
  center: { latitude: number; longitude: number },
  now: Date,
  postcode?: number | null,
): DemandPrior | null {
  const s = demandSignal(center, now, postcode);
  if (s.parkRide === null && s.arrivals === null) return null;

  const w = WEIGHTS;
  const evidence: string[] = [];
  // Start from an even chance and let measured flow move it.
  let odds = 0;
  let confidence = 0;

  if (s.parkRide !== null) {
    // One curve, read from both ends. Commuters arriving fill a kerb they are
    // allowed to use; residents leaving empty the one their own cars were on.
    const base = (s.parkRide - 0.5) * w.parkRideGain * s.parkRideWeight;
    const exp = exposure(props);
    const mine = residentShare(props);
    odds -= base * exp;
    odds += base * mine;
    confidence += 0.2 * s.parkRideWeight;

    const pct = Math.round(s.parkRide * 100);
    const where = s.station
      ? `${s.station.name}, ${s.station.meters} m away`
      : `postcode ${s.postcode}`;
    const phase = pct >= 70 ? 'everyone who drives to the train has already gone'
      : pct >= 40 ? 'the morning rush is part-way through'
      : 'almost nobody has left yet';
    evidence.push(
      `At this hour ${phase} around ${where} — ${pct}% of the daily peak, `
      + 'from Transport for NSW Opal tap data',
    );
    if (mine > exp) {
      evidence.push(
        'Those are mostly residents\u2019 cars, and the rules here keep commuters '
        + 'from taking the space they leave behind',
      );
    } else if (exp < 0.5) {
      evidence.push(
        'The restriction here keeps most all-day commuters off this kerb',
      );
    }
  }

  if (s.arrivals !== null) {
    // People arriving consume a kerb that visitors may use. Two things scale
    // it: a residential street's cars belong to the people who live there, not
    // to arrivals, and in a suburb people mostly *leave* from, much of the
    // inbound flow is residents coming home — already counted above, through
    // the departure curve running backwards.
    const visitors = isResidential(props) ? 0 : (1 - s.areaOrigin);
    if (visitors > 0.05) {
      const delta = (s.arrivals - w.activityMid) * w.activityGain * visitors;
      odds -= delta;
      confidence += 0.1 * visitors;
      const pct = Math.round(s.arrivals * 100);
      evidence.push(
        `People are arriving in ${s.postcode ?? 'this area'} at ${pct}% of the daily `
        + 'peak rate (Opal tap data)',
      );
    }
  }

  // Nothing actually contributed — e.g. the only signal was area activity on a
  // residential street, where it is not evidence. Returning a bare 0.5 here
  // would quietly replace the hand-set prior with a shrug.
  if (evidence.length === 0) return null;

  const m = MODEL;
  if (m?.calibration?.state !== 'fitted') {
    // Say it out loud rather than let a measured-looking number imply more
    // than it is. The shapes are measured; this mapping is not fitted yet.
    confidence = Math.min(confidence, 0.22);
  }

  return {
    p: clamp01(sigmoid(logit(0.5) + odds)),
    confidence: clamp01(confidence),
    evidence,
    measured: true,
  };
}

/** For the explain sheet: what the model is, in one line. */
export function demandBasisLine(): string | null {
  const m = MODEL;
  if (!m) return null;
  const repro = m.reproducibility?.meanCorrelationOfParkedCurve;
  const fitted = m.calibration.state === 'fitted';
  return (
    `Pattern from Transport for NSW Opal tap-on/tap-off data, week of ${m.week}`
    + (repro ? ` (shape reproduces at r=${repro.toFixed(2)} against a second week)` : '')
    + (fitted
      ? `, calibrated against ${m.calibration.samples.toLocaleString()} measured car-park readings`
      : ', not yet calibrated against measured occupancy')
  );
}
