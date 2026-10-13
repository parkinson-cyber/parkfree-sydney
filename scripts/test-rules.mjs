// Test harness for the ParkFree rules engine (compiled from TS).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseIntervals, isNowInWindows, evaluateSide, evaluateStreet, formatInterval, formatMaxstay, pShort, formatClock, formatPrice,
        minutesUntilOutside, nextFreeAt, formatCountdown } =
  require('../.cache/test/rules.js');
const { estimateAvailability, priorFor, confidenceLabel } = require('../.cache/test/availability.js');

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; }
  else { fail++; console.log(`FAIL: ${label}\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(actual)}`); }
}
// Dates: 2026-07-15 is a Wednesday.
const wed10am = new Date(2026, 6, 15, 10, 0);   // Wed 10:00
const wed8pm  = new Date(2026, 6, 15, 20, 0);   // Wed 20:00
const sun10am = new Date(2026, 6, 19, 10, 0);   // Sun 10:00
const sat7am  = new Date(2026, 6, 18, 7, 0);    // Sat 07:00
const mon3am  = new Date(2026, 6, 20, 3, 0);    // Mon 03:00

// --- interval parsing ---
eq(isNowInWindows(parseIntervals('Mo-Fr 08:30-18:00'), wed10am), true, 'weekday window hit');
eq(isNowInWindows(parseIntervals('Mo-Fr 08:30-18:00'), wed8pm), false, 'weekday window miss (evening)');
eq(isNowInWindows(parseIntervals('Mo-Fr 08:30-18:00'), sun10am), false, 'weekday window miss (sunday)');
eq(isNowInWindows(parseIntervals('Mo-Fr 08:30-18:00; Sa 08:30-12:30'), sat7am), false, 'sat before window');
eq(isNowInWindows(parseIntervals('Mo-Fr 08:30-18:00; Sa 08:30-12:30'), new Date(2026,6,18,9,0)), true, 'sat in window');
eq(isNowInWindows(parseIntervals('Su'), sun10am), true, 'day-only clause');
eq(isNowInWindows(parseIntervals('08:00-18:00'), wed10am), true, 'time-only clause (daily)');
eq(isNowInWindows(parseIntervals('22:00-06:00'), mon3am), true, 'overnight window (early morning)');
eq(isNowInWindows(parseIntervals('22:00-06:00'), wed10am), false, 'overnight window miss');
eq(isNowInWindows(parseIntervals('Sa-Su'), sun10am), true, 'weekend range wrap');
eq(isNowInWindows(parseIntervals('Fr-Mo'), sun10am), true, 'Fr-Mo wrap includes Sunday');
eq(isNowInWindows(parseIntervals('Fr-Mo'), new Date(2026,6,15,10,0)), false, 'Fr-Mo wrap excludes Wednesday');
eq(parseIntervals('garbage!!'), null, 'unparseable returns null');
eq(isNowInWindows(parseIntervals('Mo-Fr,Sa 08:00-18:00'), new Date(2026,6,18,9,0)), true, 'comma day groups');

// --- side evaluation ---
// 2P weekday limit, free outside
const twoP = { kind: 'free_limited', maxstayMin: 120, interval: 'Mo-Fr 08:30-18:00' };
eq(evaluateSide(twoP, wed10am).status, 'free_limited', '2P active during window');
eq(evaluateSide(twoP, wed8pm).status, 'free', '2P unrestricted in evening');
eq(evaluateSide(twoP, sun10am).status, 'free', '2P unrestricted on Sunday');

// paid with fee window
const meter = { kind: 'paid', feeInterval: 'Mo-Sa 08:00-20:00' };
eq(evaluateSide(meter, wed10am).status, 'paid', 'meter during fee hours');
eq(evaluateSide(meter, sun10am).status, 'free', 'meter free on Sunday');
eq(evaluateSide(meter, wed8pm).status, 'free', 'meter free after 8pm');

// paid with explicit free window
const meterSunFree = { kind: 'paid', freeInterval: 'Su' };
eq(evaluateSide(meterSunFree, sun10am).status, 'free', 'explicit sunday-free meter');

// Angelo Street, Cammeray — photographed 2026-09-11. The council fee feed had
// this kerb as paid Mo-Su 08:30-24:00; the sign on the pole reads Mon-Fri
// 8:30-6 and Sat 8:30-12:30 only. These pin the hours the photo bought back.
const angelo = { kind: 'paid', zone: 'meter', maxstayMin: 120,
                 feeInterval: 'Mo-Fr 08:30-18:00; Sa 08:30-12:30', pricePerHour: 7.4 };
eq(evaluateSide(angelo, sun10am).status, 'free', 'Angelo St free on Sunday');
eq(evaluateSide(angelo, wed8pm).status, 'free', 'Angelo St free after 6pm weekday');
eq(evaluateSide(angelo, new Date(2026, 6, 18, 14, 0)).status, 'free', 'Angelo St free Sat afternoon');
eq(evaluateSide(angelo, new Date(2026, 6, 18, 10, 0)).status, 'paid', 'Angelo St metered Sat morning');
eq(evaluateSide(angelo, wed10am).status, 'paid', 'Angelo St metered midweek');
eq(evaluateSide(meterSunFree, wed10am).status, 'paid', 'meter otherwise paid');

// clearway ban windows
const clearway = { kind: 'free', banInterval: 'Mo-Fr 06:00-10:00' };
eq(evaluateSide(clearway, wed10am).status, 'free', 'clearway ended at 10:00 → free');
eq(evaluateSide(clearway, new Date(2026,6,15,7,0)).status, 'banned', 'clearway active at 7am');

// permanent bans
eq(evaluateSide({ kind: 'no_stopping' }, wed10am).status, 'banned', 'no stopping always');
eq(evaluateSide({ kind: 'no_parking' }, wed10am).status, 'banned', 'no parking always');

// timed no-parking (outside window should be allowed)
const timedBan = { kind: 'no_parking', banInterval: 'Mo-Fr 06:00-10:00' };
eq(evaluateSide(timedBan, wed8pm).status, 'free', 'timed no-parking outside window → free');
eq(evaluateSide(timedBan, new Date(2026,6,15,7,0)).status, 'banned', 'timed no-parking inside window');

// residents + unknown + missing
eq(evaluateSide({ kind: 'residents' }, wed10am).status, 'residents', 'residents');
eq(evaluateSide(undefined, wed10am).status, 'unknown', 'missing side');

// --- street-level (best of both sides) ---
eq(evaluateStreet({ id: 1, cat: 'paid', area: 'inner', left: meter, right: { kind: 'no_stopping' } }, sun10am).status,
  'free', 'street best-side free on sunday');
eq(evaluateStreet({ id: 2, cat: 'unknown', area: 'inner' }, wed10am).status, 'unknown', 'base street unknown');

// --- formatting ---
eq(formatInterval('Mo-Fr 08:30-18:00'), 'Mon–Fri 8:30am–6pm', 'interval formatting');
eq(formatInterval('Su'), 'Sun', 'day-only formatting');
eq(formatMaxstay(120), '2P (2h max)', 'maxstay formatting');
eq(formatMaxstay(30), '½P (30 min max)', 'maxstay half-hour');
eq(pShort(15), '¼P', 'pShort quarter');
eq(pShort(30), '½P', 'pShort half');
eq(pShort(45), '¾P', 'pShort three-quarter');
eq(pShort(60), '1P', 'pShort 1 hour');
eq(pShort(120), '2P', 'pShort 2 hour');
eq(pShort(240), '4P', 'pShort 4 hour');
eq(pShort(90), '1½P', 'pShort 90 min');
eq(pShort(undefined), '', 'pShort empty');

// --- new metadata: price, cut-off, permit-excepted, zones ---
eq(formatClock(1320), '10pm', 'clock 10pm');
eq(formatClock(1440), 'midnight', 'clock midnight (end of day)');
eq(formatClock(0), 'midnight', 'clock midnight (start)');
eq(formatClock(720), 'noon', 'clock noon');
eq(formatPrice(9), '$9/hr', 'price integer');
eq(formatPrice(6.4), '$6.40/hr', 'price cents');
eq(formatPrice(undefined), '', 'price empty');

// metered street with price + permit-excepted + cut-off, evaluated during fee hours
const cbdMeter = {
  kind: 'paid', zone: 'meter', maxstayMin: 60, pricePerHour: 9,
  feeInterval: 'Mo-Su 08:00-22:00', cutOffMin: 1320, permitExcepted: true,
};
const meterEval = evaluateSide(cbdMeter, wed10am);
eq(meterEval.status, 'paid', 'cbd meter paid during hours');
eq(meterEval.pricePerHour, 9, 'cbd meter surfaces price');
eq(meterEval.zone, 'meter', 'cbd meter surfaces zone');
eq(/\$9\/hr/.test(meterEval.detail), true, 'cbd meter detail shows price');
eq(/Permit holders excepted/.test(meterEval.detail), true, 'cbd meter detail shows permit exception');
eq(/Free after 10pm/.test(meterEval.detail), true, 'cbd meter detail shows cut-off');
// after cut-off (10pm window closed) → free
eq(evaluateSide(cbdMeter, new Date(2026,6,15,23,0)).status, 'free', 'cbd meter free after 10pm');

// loading zone: banned during hours, free outside
const loading = { kind: 'no_parking', zone: 'loading', banInterval: 'Mo-Fr 06:00-18:00' };
eq(evaluateSide(loading, new Date(2026,6,15,7,0)).status, 'banned', 'loading zone banned in hours');
const loadingOff = evaluateSide(loading, wed8pm);
eq(loadingOff.status, 'free', 'loading zone free after hours');
eq(loadingOff.zone, 'loading', 'loading zone surfaces zone');
eq(/loading zone/i.test(loadingOff.detail), true, 'loading zone named in detail');

// resident-permit precinct (no known limit) → park-able timed visitor state
const resPrecinct = { kind: 'residents', zone: 'residential', permitExcepted: true };
eq(evaluateSide(resPrecinct, wed10am).status, 'free_limited', 'resident precinct is park-able (timed visitor)');
eq(/check the sign/i.test(evaluateSide(resPrecinct, wed10am).detail), true, 'resident precinct hints at sign');
eq(/permit holders excepted/i.test(evaluateSide(resPrecinct, wed10am).detail), true, 'resident precinct notes permit exception');
// a genuine permit-only kerb (no exception) stays residents-only
eq(evaluateSide({ kind: 'residents' }, wed10am).status, 'residents', 'true permit-only stays residents');

// permit area numbers (North Sydney RPS) surface in the detail text
const resArea = { ...resPrecinct, permitArea: 12, permitZone: 'A' };
eq(/Area 12 permit holders excepted/.test(evaluateSide(resArea, wed10am).detail), true, 'resident precinct names its permit area');
const resAreaB = { ...resPrecinct, permitArea: 19, permitZone: 'B' };
eq(/Area 19B permit holders excepted/.test(evaluateSide(resAreaB, wed10am).detail), true, 'non-A sub-zone letter shown');
// metered kerb inside an RPS area: paid for visitors, area permit excepted
const nsMeter = {
  kind: 'paid', zone: 'meter', pricePerHour: 8.95, cutOffMin: 1440,
  feeInterval: 'Mo-Su 08:30-18:00; Mo-Su 18:00-24:00', permitExcepted: true, permitArea: 6, permitZone: 'A',
};
eq(evaluateSide(nsMeter, wed10am).status, 'paid', 'NS meter is paid in fee hours');
eq(/Area 6 permit holders excepted/.test(evaluateSide(nsMeter, wed10am).detail), true, 'NS meter names permit area');
eq(evaluateSide(nsMeter, wed10am).pricePerHour, 8.95, 'NS meter surfaces demand-area rate');

// named (not numbered) permit zones — Woollahra "Paddington 3", Ryde "Ryde Zone 4"
const namedZone = { ...resPrecinct, permitLabel: 'Paddington 3' };
eq(/Paddington 3 permit holders excepted/.test(evaluateSide(namedZone, wed10am).detail), true, 'named permit zone label shown verbatim');
const rydeZone = { ...resPrecinct, permitLabel: 'Ryde Zone 4' };
eq(/Ryde Zone 4 permit holders excepted/.test(evaluateSide(rydeZone, wed10am).detail), true, 'ryde zone label shown');
// permitLabel takes precedence over a numeric area when both somehow present
const bothLabel = { ...resPrecinct, permitLabel: 'Balmain East (BE)', permitArea: 3 };
eq(/Balmain East \(BE\) permit holders excepted/.test(evaluateSide(bothLabel, wed10am).detail), true, 'label wins over numeric area');

// zone-named permanent bans (Waverley PUDO / loading)
const kissRide = { kind: 'no_parking', zone: 'kiss_ride' };
eq(evaluateSide(kissRide, wed10am).status, 'banned', 'kiss & ride banned');
eq(/kiss & ride/i.test(evaluateSide(kissRide, wed10am).detail), true, 'kiss & ride named');
eq(evaluateSide(kissRide, wed10am).zone, 'kiss_ride', 'kiss & ride zone surfaced');
const loadingPerm = { kind: 'no_parking', zone: 'loading' };
eq(/loading zone/i.test(evaluateSide(loadingPerm, wed10am).detail), true, 'permanent loading named');

// --- "free in X" countdown ---
const mUntil = (expr, now) => minutesUntilOutside(parseIntervals(expr), now);
eq(mUntil('Mo-Fr 08:30-18:00', wed10am), 480, 'fee lifts at 6pm (8h away)');
eq(mUntil('Mo-Fr 08:30-18:00', wed8pm), 0, 'outside fee hours → free already');
eq(mUntil('Mo-Fr 08:00-12:00; Mo-Fr 12:00-18:00', wed10am), 480, 'abutting windows walk through to 6pm');
eq(mUntil('Mo-Fr 08:00-18:00; Mo-Fr 09:00-20:00', wed10am), 600, 'overlapping windows use the later end');
eq(mUntil('22:00-06:00', mon3am), 180, 'overnight ban lifts at 6am');
eq(mUntil('Mo-Su 00:00-24:00', wed10am), null, 'round-the-clock never frees up');
// Fri 6pm meter end rolls into Sat: Sat is not a fee day, so it frees at 6pm Fri.
eq(mUntil('Mo-Fr 08:30-18:00', new Date(2026, 6, 17, 17, 30)), 30, 'Friday evening frees at 6pm');

eq(formatCountdown(0), 'now', 'countdown now');
eq(formatCountdown(45), 'in 45 min', 'countdown minutes');
eq(formatCountdown(130), 'in 2h 10m', 'countdown hours+min');
eq(formatCountdown(120), 'in 2h', 'countdown whole hours');

const meteredSt = { id: 1, cat: 'paid', area: 'inner', left: { kind: 'paid', pricePerHour: 7, feeInterval: 'Mo-Fr 08:30-18:00' } };
eq(nextFreeAt(meteredSt, wed10am), { inMin: 480, at: '6pm' }, 'metered street frees at 6pm');
eq(nextFreeAt(meteredSt, wed8pm), null, 'already free → no countdown');
// cut-off only (meter with no published fee hours)
const cutOffSt = { id: 2, cat: 'paid', area: 'inner', left: { kind: 'paid', rateZoneFill: true, cutOffMin: 22 * 60 } };
eq(nextFreeAt(cutOffSt, wed8pm), { inMin: 120, at: '10pm' }, 'cut-off drives the countdown');
// unknowable / never-free kerbs stay silent
eq(nextFreeAt({ id: 3, cat: 'paid', area: 'inner', left: { kind: 'paid', rateZoneFill: true } }, wed10am), null, 'no hours → no countdown');
eq(nextFreeAt({ id: 4, cat: 'residents', area: 'inner', left: { kind: 'residents' } }, wed10am), null, 'permit-only never frees');
eq(nextFreeAt({ id: 5, cat: 'no_stopping', area: 'inner', left: { kind: 'no_stopping' } }, wed10am), null, 'permanent ban never frees');
// a clearway outlasting the meter pushes the free time out to the clearway end
const meterThenClearway = { id: 6, cat: 'paid', area: 'inner',
  left: { kind: 'paid', feeInterval: 'Mo-Fr 08:30-18:00', banInterval: 'Mo-Fr 15:00-19:00' } };
eq(nextFreeAt(meterThenClearway, wed10am), { inMin: 540, at: '7pm' }, 'clearway past the meter delays free time');
// the better of the two sides wins
const twoSided = { id: 7, cat: 'paid', area: 'inner',
  left: { kind: 'paid', feeInterval: 'Mo-Fr 08:30-18:00' },
  right: { kind: 'paid', feeInterval: 'Mo-Fr 08:30-12:00' } };
eq(nextFreeAt(twoSided, wed10am).inMin, 120, 'soonest side wins');
// timed ban lifting (both kerbs — a one-sided clearway leaves the street's
// overall status "unknown", and we don't count down against an unknown street)
const cwSide = { kind: 'no_stopping', banInterval: 'Mo-Fr 06:00-10:30' };
eq(nextFreeAt({ id: 8, cat: 'no_stopping', area: 'inner', left: cwSide, right: cwSide }, wed10am),
   { inMin: 30, at: '10:30am' }, 'clearway lifts in 30 min');
eq(nextFreeAt({ id: 9, cat: 'no_stopping', area: 'inner', left: cwSide }, wed10am), null,
   'unknown other side → no countdown');

// --- find me a park ---
const { findNearestPark, findSoonestPark, formatDistance, walkMinutes } = require('../.cache/test/findPark.js');
const { distanceToFeatureM, featureMidpoint, bearingDeg } = require('../.cache/test/geo.js');

// A street laid out due east at a fixed latitude; 0.001° lon ≈ 92 m here.
const streetAt = (id, lat, lon, name) => ({
  type: 'Feature',
  properties: { id, cat: 'free', area: 'test', name },
  geometry: { type: 'LineString', coordinates: [[lon, lat], [lon + 0.002, lat]] },
});
const HERE = { latitude: -33.87, longitude: 151.21 };

// standing on the line itself → ~0 m, not half its length
eq(Math.round(distanceToFeatureM(streetAt(1, -33.87, 151.21), -33.87, 151.211)), 0,
   'distance measures to the kerb, not the midpoint');

const status = (m) => new Map(m);
const near = streetAt(1, -33.8705, 151.21, 'Near St');   // ~55 m south
const far = streetAt(2, -33.875, 151.21, 'Far St');      // ~550 m south
eq(findNearestPark([near, far], status([[1, 'free'], [2, 'free']]), HERE).street.properties.name,
   'Near St', 'picks the closest free street');
// only free kerbs are ever suggested
eq(findNearestPark([near, far], status([[1, 'paid'], [2, 'free']]), HERE).street.properties.name,
   'Far St', 'skips paid kerbs');
eq(findNearestPark([near], status([[1, 'residents']]), HERE), null, 'permit-only never suggested');
eq(findNearestPark([near], status([[1, 'banned']]), HERE), null, 'banned never suggested');
eq(findNearestPark([near], status([[1, 'unknown']]), HERE), null, 'unverified never suggested');
eq(findNearestPark([], new Map(), HERE), null, 'nothing to suggest');
// beyond the radius we say nothing rather than send someone 2 km away
eq(findNearestPark([far], status([[2, 'free']]), HERE, 200), null, 'respects the max radius');
// an unrestricted spot wins over a marginally closer time-limited one…
const limitedCloser = streetAt(3, -33.8703, 151.21, 'Limited St'); // ~33 m
eq(findNearestPark([limitedCloser, near], status([[3, 'free_limited'], [1, 'free']]), HERE).street.properties.name,
   'Near St', 'unrestricted beats a marginally closer limited spot');
// …but not when the free one is a long walk away
eq(findNearestPark([limitedCloser, far], status([[3, 'free_limited'], [2, 'free']]), HERE).street.properties.name,
   'Limited St', 'a close limited spot beats a distant free one');
eq(findNearestPark([limitedCloser], status([[3, 'free_limited']]), HERE).limited, true, 'flags the time limit');

// --- soonest-to-free fallback (empty-state answer) ---
// A metered street laid due east; feeEnd is when the meter lapses (frees up).
const paidAt = (id, lat, lon, feeEnd, name) => ({
  type: 'Feature',
  properties: { id, cat: 'paid', area: 'test', name,
    left: { kind: 'paid', pricePerHour: 7, feeInterval: `Mo-Fr 08:30-${feeEnd}` } },
  geometry: { type: 'LineString', coordinates: [[lon, lat], [lon + 0.002, lat]] },
});
// wed10am is Wed 10:00 (=600 min-of-day)
const freesSoon = paidAt(10, -33.8705, 151.21, '10:30', 'Soon St');   // ~55 m, frees in 30 min
const freesLater = paidAt(11, -33.87, 151.21, '11:00', 'Later St');   // ~0 m, frees in 60 min
eq(findSoonestPark([freesSoon, freesLater], wed10am, HERE).street.properties.name, 'Soon St',
   'picks the spot that frees soonest+closest');
eq(findSoonestPark([freesSoon, freesLater], wed10am, HERE).inMin, 30, 'reports the wait');
eq(findSoonestPark([freesSoon, freesLater], wed10am, HERE).at, '10:30am', 'reports the clock time');
// total-time metric: 5 min a block away beats 20 min at your feet
const near5 = paidAt(12, -33.8702, 151.21, '10:05', 'Near5 St');     // ~33 m, frees in 5 min
const feet20 = paidAt(13, -33.87, 151.21, '10:20', 'Feet20 St');     // ~0 m, frees in 20 min
eq(findSoonestPark([near5, feet20], wed10am, HERE).street.properties.name, 'Near5 St',
   'ranks by wait + walk, not wait alone');
// caps the wait — nothing hours away
eq(findSoonestPark([paidAt(14, -33.8705, 151.21, '18:00', 'FarFuture St')], wed10am, HERE), null,
   'ignores spots that free up beyond the wait cap');
// respects distance radius
eq(findSoonestPark([paidAt(15, -33.877, 151.21, '10:30', 'TooFar St')], wed10am, HERE, 200), null,
   'ignores spots beyond the distance radius');
// streets with no known free time (permit-only) never surface here
eq(findSoonestPark([{ type: 'Feature', properties: { id: 16, cat: 'residents', area: 'test',
   left: { kind: 'residents' } }, geometry: { type: 'LineString', coordinates: [[151.21, -33.8705], [151.212, -33.8705]] } }],
   wed10am, HERE), null, 'no countdown → not suggested as soon');
eq(findSoonestPark([], wed10am, HERE), null, 'nothing to suggest');

eq(formatDistance(120), '120 m', 'metres');
eq(formatDistance(1240), '1.2 km', 'kilometres');
eq(walkMinutes(10), 1, 'walk time never rounds to zero');
eq(walkMinutes(400), 5, 'walk time at 80 m/min');

// --- clearways: a known ban window, unknown the rest of the day ---
const tfnswClearway = { kind: 'no_stopping', banInterval: 'Mo-Fr 06:00-10:00; Mo-Fr 15:00-19:00',
                        otherTimesUnknown: true };
eq(evaluateSide(tfnswClearway, new Date(2026, 6, 15, 7, 0)).status, 'banned',
   'inside clearway hours it is banned');
eq(evaluateSide(tfnswClearway, new Date(2026, 6, 15, 12, 0)).status, 'unknown',
   'outside clearway hours it refuses to claim the kerb is free');
eq(evaluateSide(tfnswClearway, new Date(2026, 6, 15, 12, 0)).detail.includes('check the sign'), true,
   'and says why');
// without the flag, a timed ban still frees up outside its window
eq(evaluateSide({ kind: 'no_stopping', banInterval: 'Mo-Fr 06:00-10:00' },
   new Date(2026, 6, 15, 12, 0)).status, 'free',
   'an ordinary timed ban is still free outside its window');

// --- availability estimate ---
// The estimate must never contradict the law, never claim certainty, and must
// always be able to explain itself.
const HERE_AV = { latitude: -33.87, longitude: 151.21 };
const street = (over = {}) => ({ id: 900, cat: 'free_limited', area: 'test',
  left: { kind: 'free_limited', maxstayMin: 120 }, ...over });
const report = (kind, minsAgo, over = {}) => ({
  id: `r${minsAgo}${kind}`, latitude: HERE_AV.latitude, longitude: HERE_AV.longitude,
  kind, streetId: 900, streetName: 'Test St', source: 'user',
  reportedAt: new Date(wed10am.getTime() - minsAgo * 60000).toISOString(),
  expiresAt: new Date(wed10am.getTime() + 900000).toISOString(), reportedBy: 'd',
});
const est = (over = {}) => estimateAvailability({
  props: street(), status: 'free_limited', center: HERE_AV,
  reports: [], carParks: [], now: wed10am, ...over,
});

eq(est({ status: 'banned' }).score, 0, 'a legal ban is certainty, not an estimate');
eq(est({ status: 'banned' }).band, 'unavailable', 'banned street is unavailable');
eq(est({ status: 'unknown' }).score, null, 'no rules known → refuses to guess');
eq(est({ status: 'unknown' }).confidence, 0, 'refusing to guess means zero confidence');
eq(est().score !== null, true, 'a known street always gets a score');
eq(est().evidence.length > 0, true, 'an estimate always carries its evidence');
eq(est().confidence <= 0.85, true, 'confidence never claims certainty');

// crowd reports move the estimate the right way, and fade with age
const fresh = est({ reports: [report('left', 1)] }).score;
const stale = est({ reports: [report('left', 90)] }).score;
const baseline = est().score;
eq(fresh > baseline, true, 'a fresh "space free" raises the estimate');
eq(Math.abs(stale - baseline) < 0.02, true, 'a 90-minute-old report has faded away');
eq(est({ reports: [report('looks_full', 1)] }).score < baseline, true, '"full" lowers the estimate');
eq(est({ reports: [report('left', 1)] }).confidence > est().confidence, true,
   'reports raise confidence');
// no pile-on: many reports still cannot claim certainty
const many = est({ reports: [report('left', 1), report('left', 2), report('looks_empty', 1),
                             report('looks_empty', 2), report('left', 3)] });
eq(many.score < 0.97, true, 'a pile of reports still cannot reach certainty');
eq(many.confidence <= 0.85, true, 'confidence stays capped however many reports arrive');

// measured car-park occupancy is real evidence and is cited as such
const full = est({ carParks: [{ id: '1', name: 'Test P&R', latitude: -33.871, longitude: 151.211,
  spots: 100, occupied: 98, free: 2, at: wed10am.toISOString() }] });
const empty = est({ carParks: [{ id: '1', name: 'Test P&R', latitude: -33.871, longitude: 151.211,
  spots: 100, occupied: 10, free: 90, at: wed10am.toISOString() }] });
eq(full.score < empty.score, true, 'a full car park nearby means tighter street parking');
eq(full.evidence.some((e) => e.includes('98% full')), true, 'cites the measured occupancy');
eq(full.confidence > est().confidence, true, 'a real measurement raises confidence');
// a far-away car park is not evidence about this street
const farAway = est({ carParks: [{ id: "2", name: "Far P&R", latitude: -33.95, longitude: 151.21,
  spots: 100, occupied: 99, free: 1, at: wed10am.toISOString() }] });
eq(farAway.score, baseline, 'a car park 9 km away changes nothing');

// the prior is always disclosed as a pattern, never as a measurement
eq(est().evidence.some((e) => e.includes('not a measurement')), true,
   'the time-of-day guess is labelled as a guess');
eq(priorFor({ id: 1, cat: 'residents', area: 't', zone: 'residential' }, wed8pm).p < 0.35, true,
   'permit streets are tight in the evening');
eq(priorFor({ id: 1, cat: 'paid', area: 't', zone: 'meter' }, mon3am).p > 0.7, true,
   'metered streets are open at 3am');
eq(confidenceLabel(0.55), '55% confidence', 'confidence reads as a percentage');


// ─── the Opal transit-demand model (src/lib/demand.ts) ───────────────────────
// The real 150 KB model is not loaded here; a synthetic one is injected, so
// these assert the *modelling* rather than the contents of a data file.

const { setDemandModel, demandPrior, exposure, DEFAULT_WEIGHTS } =
  require('../.cache/test/demand.js');

// A kerb 200 m from a busy origin station, whose cars-on-kerb curve is empty
// overnight and at its peak through the middle of the weekday.
const flat = (v) => Array(24).fill(v);
const parkedCurve = flat(0).map((_, h) => (h >= 7 && h <= 15 ? 100 : h >= 4 && h < 7 ? 20 : 0));
const STATION = {
  name: 'Testville Station', mode: 'train',
  latitude: undefined,
  lat: HERE_AV.latitude + 0.0018, lon: HERE_AV.longitude,   // ~200 m north
  taps: 20000, now: 1, origin: 0.9,
  parked: { wd: parkedCurve, sa: flat(0), su: flat(0) },
  arrivals: { wd: flat(50), sa: flat(50), su: flat(50) },
};
const PC = {
  pc: 2000, lat: HERE_AV.latitude, lon: HERE_AV.longitude,
  taps: 50000, origin: 0.5, parked: null,
  arrivals: { wd: flat(90), sa: flat(20), su: flat(20) },
};

// With no model installed the estimate must fall back, not crash or invent.
setDemandModel(null);
eq(demandPrior(street(), HERE_AV, wed10am, 2000), null,
   'no demand model → no transit prior, and the hand-set one is used');
eq(est().evidence.some((e) => e.includes('not a measurement')), true,
   'without the model the prior is still labelled a guess');

setDemandModel({
  generated: '2026-10-12', week: '2020-02-24', sources: [],
  calibration: { state: 'uncalibrated', samples: 0, weights: null, fittedAt: null },
  stations: [STATION], postcodes: [PC],
});

const freeStreet = { id: 9, cat: 'free', area: 't' };
const permitStreet = { id: 9, cat: 'residents', area: 't', zone: 'residential' };
const meteredStreet = { id: 9, cat: 'paid', area: 't', zone: 'meter' };

const peak = demandPrior(freeStreet, HERE_AV, wed10am, 2000);
const night = demandPrior(freeStreet, HERE_AV, mon3am, 2000);
eq(peak !== null, true, 'a station within walking distance produces a transit prior');
eq(peak.p < night.p, true,
   'commuter kerb is tighter at 10am than at 3am, from the tap curve alone');
eq(peak.evidence.some((e) => e.includes('Opal tap data')), true,
   'the transit prior cites Opal as its source');
eq(peak.measured, true, 'the transit prior reports itself as derived from data');

// The law decides whether commuter pressure can land on this kerb at all.
eq(demandPrior(permitStreet, HERE_AV, wed10am, 2000).p
     > demandPrior(freeStreet, HERE_AV, wed10am, 2000).p, true,
   'a permit street keeps commuter pressure off: better odds than a free kerb');
eq(exposure(permitStreet) < exposure(meteredStreet), true,
   'permit rules shut out more commuters than a meter does');
eq(exposure(meteredStreet) < exposure(freeStreet), true,
   'a meter shuts out some commuters; an unrestricted kerb shuts out none');
eq(exposure({ id: 9, cat: 'free_limited', area: 't', left: { kind: 'free_limited', maxstayMin: 120 } })
     < exposure(freeStreet), true,
   'a 2P limit shuts out the all-day commuter');

// One departure curve, read from both ends: the morning that *fills* an
// unrestricted kerb beside a station *empties* the permit street behind it,
// because the cars on a permit street belong to the people who just left.
eq(demandPrior(permitStreet, HERE_AV, wed10am, 2000).p
     > demandPrior(permitStreet, HERE_AV, mon3am, 2000).p, true,
   'a permit street is freer once its residents have driven to work');
eq(demandPrior(freeStreet, HERE_AV, wed10am, 2000).p
     < demandPrior(freeStreet, HERE_AV, mon3am, 2000).p, true,
   'the unrestricted kerb beside it moves the other way at the same hour');
eq(demandPrior(permitStreet, HERE_AV, wed10am, 2000)
     .evidence.some((e) => e.includes('residents')), true,
   'and it says whose cars those are, rather than showing a bare number');

// Area activity is visitors arriving. It must not be read as kerb pressure in
// a suburb people *leave* in the morning, or as anything at all on a street
// whose cars belong to residents.
const area = (origin, level, props) => {
  setDemandModel({
    generated: 'x', week: '2020-02-24', sources: [],
    calibration: { state: 'uncalibrated', samples: 0, weights: null, fittedAt: null },
    stations: [],
    postcodes: [{ ...PC, origin, parked: null,
      arrivals: { wd: flat(level), sa: flat(level), su: flat(level) } }],
  });
  return demandPrior(props, HERE_AV, wed10am, 2000);
};
// A destination area — people arrive here — so a busy hour means a busy kerb.
eq(area(0.15, 95, meteredStreet).p < area(0.15, 5, meteredStreet).p, true,
   'in an area people arrive at, a busy hour means a tighter metered strip');
eq(area(0.15, 95, meteredStreet).evidence.some((e) => e.includes('arriving')), true,
   'and it says the pressure is people arriving');
// The same busyness in a dormitory suburb is residents leaving, not visitors.
const dormitory = Math.abs(area(0.9, 95, meteredStreet).p - area(0.9, 5, meteredStreet).p);
const destination = Math.abs(area(0.15, 95, meteredStreet).p - area(0.15, 5, meteredStreet).p);
eq(dormitory < destination, true,
   'the same number in a suburb people leave from counts for much less');
eq(area(0.15, 95, permitStreet), null,
   'and on a residential street it is not evidence at all');

// An uncalibrated model must not claim much confidence for itself.
eq(area(0.15, 95, meteredStreet).confidence <= 0.22, true,
   'an uncalibrated model is capped low, however much flow it sees');

// Distance matters: the same station 5 km away is not evidence about this kerb.
setDemandModel({
  generated: 'x', week: '2020-02-24', sources: [],
  calibration: { state: 'uncalibrated', samples: 0, weights: null, fittedAt: null },
  stations: [{ ...STATION, lat: HERE_AV.latitude + 0.05 }], postcodes: [],
});
eq(demandPrior(freeStreet, HERE_AV, wed10am, null), null,
   'a station 5 km away says nothing about this street');
eq(DEFAULT_WEIGHTS.walkMaxM <= 1200, true,
   'the walk radius stays within what a commuter actually walks');

// A station the modern feed cannot measure must be treated as a typical one,
// not as untouched since 2020 and not as dead. Both of those were real: `?? 1`
// overstated it by ~45% against a median of 0.69, and a level that rounded to
// zero dropped the station out of the model entirely — which is how nine
// Bankstown-line stations silently disappeared.
const withLevels = (nowValues) => {
  setDemandModel({
    generated: 'x', week: '2020-02-24', sources: [],
    calibration: { state: 'uncalibrated', samples: 0, weights: null, fittedAt: null },
    stations: nowValues.map((n, i) => ({
      ...STATION, name: `S${i}`, now: n,
      lat: HERE_AV.latitude + 0.0018 + i * 0.4, lon: HERE_AV.longitude,
    })),
    postcodes: [],
  });
};
// One station on top of us with an unknown level, plus far-away ones that only
// exist to establish what "typical" is.
withLevels([null, 0.7, 0.7, 0.7]);
const unknownLevel = demandPrior(freeStreet, HERE_AV, wed10am, null);
withLevels([0.7, 0.7, 0.7, 0.7]);
const typicalLevel = demandPrior(freeStreet, HERE_AV, wed10am, null);
eq(unknownLevel !== null, true,
   'a station with no modern level still contributes — it is unknown, not absent');
eq(Math.abs(unknownLevel.p - typicalLevel.p) < 0.001, true,
   'and it is weighted as a typical station rather than a 2020-level one');

// The dormant case: a measured near-zero level means no commuters, and it must
// not drag down the stand-in used for the unknown ones.
withLevels([null, 0.0001, 0.0001, 0.7]);
const besideDormant = demandPrior(freeStreet, HERE_AV, wed10am, null);
eq(Math.abs(besideDormant.p - typicalLevel.p) < 0.001, true,
   'dormant stations are kept out of the median that stands in for unknowns');

// Leave the harness as it found it, so later cases are unaffected.
setDemandModel(null);

// ─── where the middle of a street actually is (src/lib/geo.ts) ───────────────
// This used to be the middle *vertex*, which OSM puts wherever the road bends.
// On a long street that lands at an end, and everything that points at a
// street — the fly-to, directions, "Park here", the Street View link — went
// there with it.

const line = (coords) => ({
  type: 'Feature', properties: { id: 1, cat: 'free', area: 't' },
  geometry: { type: 'LineString', coordinates: coords },
});

// Due north, 0.01° ≈ 1.11 km, evenly spaced: the middle is the middle either way.
const even = line([[151.2, -33.9], [151.2, -33.895], [151.2, -33.89]]);
const evenMid = featureMidpoint(even);
eq(Math.abs(evenMid.latitude - -33.895) < 1e-6, true,
   'an evenly spaced street has its midpoint in the middle');

// The regression: one long straight leg, then four vertices crammed into a
// bend at the far end. The middle *vertex* is inside the bend; the middle of
// the street is half-way down the straight.
const lopsided = line([
  [151.2, -33.9],
  [151.2, -33.89],      // 1.11 km of straight
  [151.2001, -33.8899], // then a cluster of tiny bend segments
  [151.2002, -33.8898],
  [151.2003, -33.8897],
]);
const lopMid = featureMidpoint(lopsided);
eq(lopMid.latitude < -33.894, true,
   'a street with its vertices bunched at one end still gets a midpoint in the middle');
eq(distanceToFeatureM(lopsided, lopMid.latitude, lopMid.longitude) < 1, true,
   'and that midpoint is on the street, not beside it');
// The old behaviour, for contrast: coords[length/2] is the third of five points.
const oldWay = lopsided.geometry.coordinates[2];
eq(Math.abs(oldWay[1] - -33.8899) < 1e-6 && lopMid.latitude < -33.894, true,
   'the middle vertex really was at the far end — that is the bug being fixed');

// Bearings, which is what points the Street View camera across the kerb.
eq(Math.round(bearingDeg(-33.9, 151.2, -33.89, 151.2)), 0, 'due north is 0°');
eq(Math.round(bearingDeg(-33.9, 151.2, -33.9, 151.21)), 90, 'due east is 90°');
eq(Math.round(bearingDeg(-33.9, 151.2, -33.91, 151.2)), 180, 'due south is 180°');
// A street running north: its OSM "left" kerb is west, so the camera turns to 270°.
eq((Math.round(featureMidpoint(even).bearing) - 90 + 360) % 360, 270,
   'looking at the left kerb of a north-running street means facing west');
eq(Math.round(featureMidpoint(even).lengthM) > 1000, true,
   'and the street knows how long it is');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
