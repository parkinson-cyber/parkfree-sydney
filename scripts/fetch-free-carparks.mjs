#!/usr/bin/env node
/**
 * Off-street car parks that are free — supermarkets, shopping centres, clubs,
 * reserves — from OpenStreetMap.
 *
 * The council car parks answered "where can I park cheaply in a town centre";
 * this answers the other half of the same question. A Woolworths car park with
 * two hours free is often the best option on a shopping strip, and none of it
 * was on the map.
 *
 * Source: OSM `amenity=parking` + `fee=no` across greater Sydney (1,757 areas).
 * Unlike `parking:lane` on a street — which is physical, not regulatory, and
 * this project has always refused to treat as a rule — `fee=no` IS a statement
 * about the rule, and `maxstay` is the sign. Those are the only two tags used.
 *
 * Honest limits, carried into the data:
 *   * `access=customers` (556 of them) means free *while you shop there*. That
 *     is recorded as `customersOnly` so the app can say so rather than implying
 *     anyone may park all day.
 *   * Only 159 carry a maxstay. The rest are free with no published limit —
 *     which is stated as "no limit published", not as "unlimited".
 *   * OSM is crowd-mapped. It is good enough to point you at a car park; the
 *     sign at the entrance is still the authority.
 *
 * Run:  node scripts/fetch-free-carparks.mjs
 */

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'data', 'free-carparks.json');
const BBOX = '-34.1,150.7,-33.6,151.35';
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const QUERY = `[out:json][timeout:180];
(
  nwr["amenity"="parking"]["fee"="no"](${BBOX});
);
out center tags;`;

// Overpass mirrors are free and shared. They 406 an anonymous POST and 429 a
// hammering one, so identify the client and back off between attempts.
const UA = 'ParkFreeSydney/1.0 (+https://github.com/parkinson-cyber/parkfree-sydney)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass() {
  const cache = process.env.OVERPASS_CACHE;
  if (cache) {
    const { readFile } = await import('node:fs/promises');
    console.log(`  using cached Overpass response: ${cache}`);
    return JSON.parse(await readFile(cache, 'utf8'));
  }
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': UA, Accept: 'application/json',
                     'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: QUERY }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        lastErr = err;
        console.log(`  ${url} failed (${err.message})`);
        await sleep(5000 * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

/** "2 hours" / "45 minutes" / "1.5 hours" -> minutes. "unlimited"/"no" -> null. */
function parseMaxstay(v) {
  if (!v) return null;
  const t = String(v).toLowerCase().trim();
  if (t === 'unlimited' || t === 'no' || t === 'none') return null;
  const m = t.match(/^([\d.]+)\s*(minutes?|mins?|hours?|hrs?|h|min)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2] ?? 'hours';
  return /min/.test(unit) ? Math.round(n) : Math.round(n * 60);
}

const data = await overpass();

const carParks = [];
for (const el of data.elements) {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  const access = t.access ?? 'yes';
  // Private and no-access car parks are not somewhere a driver can park.
  if (access === 'private' || access === 'no' || access === 'permit') continue;

  const maxstay = parseMaxstay(t.maxstay);
  const operator = t.operator ?? t.brand ?? null;
  const name = t.name
    ?? (operator ? `${operator} car park` : null)
    ?? (t['parking'] === 'multi-storey' ? 'Free multi-storey parking' : 'Free parking');

  carParks.push({
    id: `osm-${el.type}-${el.id}`,
    name,
    operator,
    latitude: lat,
    longitude: lon,
    /** Free while you're a customer of the business, not free to all day. */
    customersOnly: access === 'customers',
    freeMinutes: maxstay,
    kind: t.parking ?? 'surface',
    capacity: t.capacity ? Number(t.capacity) || null : null,
    surface: t.surface ?? null,
  });
}

carParks.sort((a, b) => a.name.localeCompare(b.name));

const withLimit = carParks.filter((c) => c.freeMinutes);
const customers = carParks.filter((c) => c.customersOnly);

await writeFile(OUT, JSON.stringify({
  generated: new Date().toISOString(),
  source: 'OpenStreetMap contributors (ODbL) — amenity=parking with fee=no, via Overpass. '
    + 'fee/maxstay/access are regulatory tags; nothing is inferred from parking:lane. '
    + 'Private and permit-only car parks are excluded.',
  carParks,
}, null, 1));

console.log(`✓ ${carParks.length} free car parks -> src/data/free-carparks.json`);
console.log(`   ${customers.length} are customer-only (shop there and it's free)`);
console.log(`   ${withLimit.length} publish a time limit; the rest have none published`);
