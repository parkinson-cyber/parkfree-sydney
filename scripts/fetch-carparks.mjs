#!/usr/bin/env node
/**
 * Live commuter car-park occupancy from the TfNSW Car Park API.
 *
 * Writes one small JSON the app fetches at runtime (see src/lib/carparks.ts):
 *   { updated, source, facilities: [{ id, name, latitude, longitude, spots, occupied, free, at }] }
 *
 * Per the API doc (v2.3): availability = spots - occupancy.total; facilities
 * named "(Historical Only)" are frozen 2023 snapshots and are skipped; the
 * counts are estimates and may be reset by the operator. The free tier
 * rate-limits aggressively (429 after ~15 quick calls), so requests are
 * spaced out and retried with backoff — one run takes ~1 minute.
 *
 * Usage:  TFNSW_API_KEY=... node scripts/fetch-carparks.mjs [out.json]
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const KEY = process.env.TFNSW_API_KEY;
if (!KEY) {
  console.error('TFNSW_API_KEY is not set');
  process.exit(1);
}
const BASE = 'https://api.transport.nsw.gov.au/v1/carpark';
const OUT = process.argv[2] ?? 'carparks.json';
const SPACING_MS = 1200;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // a feed older than a day is not "live"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, attempt = 0) {
  const res = await fetch(url, { headers: { Authorization: `apikey ${KEY}` } });
  if (res.status === 429 && attempt < 5) {
    await sleep(3000 * (attempt + 1));
    return get(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const index = await get(BASE);
const facilities = [];
const skipped = [];

for (const [id, name] of Object.entries(index)) {
  if (/historical only/i.test(name)) {
    skipped.push(`${id} ${name} (historical)`);
    continue;
  }
  await sleep(SPACING_MS);
  let d;
  try {
    d = await get(`${BASE}?facility=${encodeURIComponent(id)}`);
  } catch (err) {
    skipped.push(`${id} ${name} (${err.message})`);
    continue;
  }
  const lat = Number(d?.location?.latitude);
  const lon = Number(d?.location?.longitude);
  const spots = Number(d?.spots);
  const occupied = Number(d?.occupancy?.total);
  const at = d?.MessageDate ? `${d.MessageDate}+10:00` : null; // API times are Sydney local, no offset
  if (![lat, lon, spots, occupied].every(Number.isFinite) || !at) {
    skipped.push(`${id} ${name} (incomplete record)`);
    continue;
  }
  if (Date.now() - Date.parse(at) > MAX_AGE_MS) {
    skipped.push(`${id} ${name} (stale: ${d.MessageDate})`);
    continue;
  }
  facilities.push({
    id: String(id),
    name: String(d.facility_name ?? name).replace(/^Park&Ride\s*-\s*/, ''),
    latitude: lat,
    longitude: lon,
    spots,
    occupied: Math.min(Math.max(occupied, 0), spots),
    free: Math.max(spots - occupied, 0),
    at,
  });
}

facilities.sort((a, b) => a.name.localeCompare(b.name));
const feed = {
  updated: new Date().toISOString(),
  source: 'Transport for NSW Car Park API (Park&Ride occupancy, estimated)',
  facilities,
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(feed));
console.log(`✓ ${facilities.length} car parks written to ${OUT}` + (skipped.length ? `; skipped ${skipped.length}:` : ''));
for (const s of skipped) console.log('  -', s);
