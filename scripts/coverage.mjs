#!/usr/bin/env node
/**
 * Classification coverage audit — the whole dataset, not just meters.
 *
 * A segment is only useful to a driver if we can say something about it. The
 * headline number is the share of segments we have classified at all; every
 * `unknown` is a grey line that tells the user "check the signs", which is what
 * they were already doing before they installed the app.
 *
 *   node scripts/coverage.mjs           # table
 *   node scripts/coverage.mjs --json    # same data, machine-readable
 *
 * See scripts/meter-coverage.mjs for price/hours depth on the paid subset, and
 * `node scripts/fetch-parking-data.mjs --plan` for what is left to fetch.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'src/data/parking.json'), 'utf8'));

const CATS = ['free', 'free_limited', 'paid', 'residents', 'no_parking', 'no_stopping', 'unknown'];

/** Pipeline area keys → the place a human would call it. */
const AREA_NAMES = {
  inner: 'Inner Sydney / CBD',
  east: 'Eastern suburbs',
  east_north: 'Eastern suburbs (north)',
  innerwest: 'Inner West',
  innerwest_west: 'Inner West (west)',
  north: 'North Sydney',
  northshore: 'North Shore',
  northernbeaches_south: 'Northern Beaches (S)',
  northernbeaches_north: 'Northern Beaches (N)',
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
const areaName = (a) => AREA_NAMES[a] ?? (a.startsWith('disc_') ? `disc sweep @${a.slice(5)}` : a);

const byArea = new Map();
for (const f of data.features) {
  const { area, cat } = f.properties;
  const row = byArea.get(area) ?? { area, total: 0, ...Object.fromEntries(CATS.map((c) => [c, 0])) };
  row.total++;
  row[cat] = (row[cat] ?? 0) + 1;
  byArea.set(area, row);
}

const rows = [...byArea.values()].sort((a, b) => b.total - a.total);
const totals = { total: data.features.length, ...Object.fromEntries(CATS.map((c) => [c, 0])) };
for (const r of rows) for (const c of CATS) totals[c] += r[c];

const known = (r) => r.total - r.unknown;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generated: data.metadata.generated, totals, areas: rows }, null, 2));
  process.exit(0);
}

const pct = (n, d) => (d === 0 ? '   — ' : `${((100 * n) / d).toFixed(1).padStart(5)}%`);
const line = (label, r) =>
  label.padEnd(22) +
  String(r.total).padStart(7) +
  CATS.filter((c) => c !== 'unknown').map((c) => String(r[c]).padStart(7)).join('') +
  String(r.unknown).padStart(9) +
  pct(known(r), r.total).padStart(9);

console.log(`\nClassification coverage — data generated ${data.metadata.generated}`);
console.log(`${data.features.length.toLocaleString()} street segments across ${rows.length} pipeline areas\n`);
console.log(
  'area'.padEnd(22) + 'total'.padStart(7) +
    ['free', 'ltd', 'paid', 'resid', 'noPark', 'noStop'].map((h) => h.padStart(7)).join('') +
    'unknown'.padStart(9) + 'known'.padStart(9),
);
console.log('─'.repeat(88));
for (const r of rows) console.log(line(areaName(r.area), r));
console.log('─'.repeat(88));
console.log(line('ALL', totals));

// Where the payload actually goes. Unknown segments carry geometry and a name
// and nothing else, so they are pure bundle weight for a grey line.
const bytes = (fs) => JSON.stringify(fs).length;
const unknownFeatures = data.features.filter((f) => f.properties.cat === 'unknown');
const knownFeatures = data.features.filter((f) => f.properties.cat !== 'unknown');
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
console.log(`\nBundle weight: ${mb(bytes(unknownFeatures))} unknown + ${mb(bytes(knownFeatures))} classified`);
console.log(
  `  ${((100 * bytes(unknownFeatures)) / (bytes(unknownFeatures) + bytes(knownFeatures))).toFixed(0)}%` +
    ' of the data ships to draw streets the app cannot describe.',
);

const empty = rows.filter((r) => known(r) === 0);
if (empty.length) {
  console.log(`\nAreas with nothing classified at all (${empty.reduce((n, r) => n + r.total, 0).toLocaleString()} segments):`);
  for (const r of empty) console.log(`  ${areaName(r.area).padEnd(22)} ${String(r.total).padStart(6)} segments`);
}

const partial = rows.filter((r) => known(r) > 0 && known(r) / r.total < 0.5);
if (partial.length) {
  console.log('\nAreas under 50% classified — best return on the next fetch:');
  for (const r of partial) {
    console.log(`  ${areaName(r.area).padEnd(22)} ${pct(known(r), r.total)}  (${r.unknown.toLocaleString()} unknown)`);
  }
}
console.log('');
