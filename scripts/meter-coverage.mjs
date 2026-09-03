#!/usr/bin/env node
/**
 * Meter-data coverage audit.
 *
 * Answers the only question that matters for the paid-parking half of the app:
 * for every metered kerb we ship, do we know the *price* and the *hours*?
 * Without hours we cannot say when a meter stops charging, which is exactly the
 * moment the street should turn green.
 *
 *   node scripts/meter-coverage.mjs            # human-readable table
 *   node scripts/meter-coverage.mjs --json     # machine-readable, for CI
 *
 * Run it after every data refresh and paste the summary into
 * docs/METER-DATA-COVERAGE.md so the gaps stay visible.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'src/data/parking.json'), 'utf8'));

/** Pipeline area keys → the human place name we talk about them by. */
const AREA_NAMES = {
  inner: 'Inner Sydney / CBD',
  east: 'Eastern suburbs',
  east_north: 'Eastern suburbs (north)',
  innerwest: 'Inner West',
  innerwest_west: 'Inner West (west)',
  north: 'North Sydney',
  northshore: 'North Shore',
  northernbeaches_south: 'Northern Beaches (south)',
  northernbeaches_north: 'Northern Beaches (north)',
  south: 'South',
  southeast: 'South East',
  west: 'West',
  farwest: 'Far West',
  farnorth: 'Far North',
  farnorth2: 'Far North (2)',
  hills: 'The Hills',
  bankstown: 'Canterbury-Bankstown',
  sutherland: 'Sutherland',
};

const sidesOf = (p) => [p.left, p.right].filter((s) => s && typeof s === 'object');
const areaName = (a) => AREA_NAMES[a] ?? a;

const paid = data.features.filter((f) => f.properties.cat === 'paid');

const byArea = new Map();
for (const f of paid) {
  const p = f.properties;
  const row = byArea.get(p.area) ?? { area: p.area, total: 0, price: 0, hours: 0, both: 0, rateZoneOnly: 0 };
  const sides = sidesOf(p);
  const hasPrice = sides.some((s) => typeof s.pricePerHour === 'number');
  // feeInterval is what lets the rules engine say "free after 6pm". cutOffMin
  // alone is a weaker signal we accept, but flag separately.
  const hasHours = sides.some((s) => s.feeInterval || typeof s.cutOffMin === 'number');
  row.total++;
  if (hasPrice) row.price++;
  if (hasHours) row.hours++;
  if (hasPrice && hasHours) row.both++;
  // Rate known only because the segment fell inside a tariff polygon — the
  // price is right, the hours are a guess. These need real sign data.
  if (sides.some((s) => s.rateZoneFill)) row.rateZoneOnly++;
  byArea.set(p.area, row);
}

const rows = [...byArea.values()].sort((a, b) => b.total - a.total);
const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
const totals = {
  total: sum('total'), price: sum('price'), hours: sum('hours'),
  both: sum('both'), rateZoneOnly: sum('rateZoneOnly'),
};

const rates = new Map();
for (const f of paid) {
  for (const s of sidesOf(f.properties)) {
    if (typeof s.pricePerHour === 'number') {
      rates.set(s.pricePerHour, (rates.get(s.pricePerHour) ?? 0) + 1);
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generated: data.metadata.generated, totals, areas: rows, rates: [...rates] }, null, 2));
  process.exit(0);
}

const pct = (n, d) => (d === 0 ? '  —  ' : `${((100 * n) / d).toFixed(1).padStart(5)}%`);

console.log(`\nMeter coverage — data generated ${data.metadata.generated}`);
console.log(`${data.features.length.toLocaleString()} segments, ${paid.length.toLocaleString()} of them paid\n`);
console.log('area                        paid   price    hours   price+hours  rate-zone guess');
console.log('─'.repeat(82));
for (const r of rows) {
  console.log(
    areaName(r.area).padEnd(26) +
      String(r.total).padStart(6) +
      pct(r.price, r.total).padStart(8) +
      pct(r.hours, r.total).padStart(9) +
      pct(r.both, r.total).padStart(13) +
      String(r.rateZoneOnly).padStart(17),
  );
}
console.log('─'.repeat(82));
console.log(
  'ALL'.padEnd(26) +
    String(totals.total).padStart(6) +
    pct(totals.price, totals.total).padStart(8) +
    pct(totals.hours, totals.total).padStart(9) +
    pct(totals.both, totals.total).padStart(13) +
    String(totals.rateZoneOnly).padStart(17),
);

console.log('\nTariffs in the dataset ($/hr → kerb count):');
console.log(
  [...rates.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([r, n]) => `  $${r.toFixed(2)} × ${n}`)
    .join('\n'),
);

const missing = rows.filter((r) => r.both < r.total);
if (missing.length) {
  console.log('\nGaps to close (segments missing price and/or hours):');
  for (const r of missing) {
    console.log(`  ${areaName(r.area).padEnd(26)} ${r.total - r.both} of ${r.total}`);
  }
}
console.log('');
