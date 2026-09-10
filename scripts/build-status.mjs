#!/usr/bin/env node
/**
 * Builds status.json - the numbers behind the live status page.
 *
 * Everything here is computed from what is actually in the repo and the live
 * feed, never hand-written, so the dashboard cannot drift from reality. It
 * runs in CI each hour, so it keeps working whether or not anyone's laptop
 * is on.
 *
 * Usage: node scripts/build-status.mjs [out.json]
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const OUT = process.argv[2] ?? join(REPO, 'status.json');
const RAW = 'https://raw.githubusercontent.com/parkinson-cyber/parkfree-sydney/data-live';

const json = async (p) => JSON.parse(await readFile(p, 'utf8'));

// --- coverage, straight from the shipped dataset -----------------------------

const parking = await json(join(REPO, 'src/data/parking.json'));
const byCat = {};
for (const f of parking.features) {
  byCat[f.properties.cat] = (byCat[f.properties.cat] ?? 0) + 1;
}
const total = parking.features.length;
const classified = total - (byCat.unknown ?? 0);

/** Places people actually ask about, checked by bounding box. */
const PLACES = {
  'Sydney CBD': [-33.885, -33.855, 151.198, 151.218],
  'Bondi Beach': [-33.897, -33.885, 151.265, 151.285],
  'Coogee': [-33.928, -33.912, 151.248, 151.262],
  'Manly': [-33.81, -33.78, 151.27, 151.30],
  'North Sydney': [-33.855, -33.80, 151.18, 151.235],
  'Chatswood': [-33.805, -33.79, 151.175, 151.19],
  'Lane Cove': [-33.84, -33.79, 151.14, 151.215],
  'Randwick': [-33.935, -33.90, 151.22, 151.27],
  'Dee Why': [-33.79, -33.74, 151.27, 151.30],
  'Parramatta': [-33.83, -33.80, 150.98, 151.02],
};
const mid = (f) => {
  const c = f.geometry.coordinates;
  const m = c[Math.floor(c.length / 2)];
  return [m[1], m[0]];
};
const places = [];
for (const [name, [s, n, w, e]] of Object.entries(PLACES)) {
  let tot = 0;
  let known = 0;
  for (const f of parking.features) {
    const [lat, lon] = mid(f);
    if (lat >= s && lat <= n && lon >= w && lon <= e) {
      tot++;
      if (f.properties.cat !== 'unknown') known++;
    }
  }
  if (tot) places.push({ name, total: tot, classified: known, pct: Math.round((known / tot) * 100) });
}
places.sort((a, b) => b.pct - a.pct);

// --- council car parks -------------------------------------------------------

const carparks = await json(join(REPO, 'src/data/council-carparks.json'));
const withFree = carparks.carParks.filter((c) => c.freeMinutes);

// --- live feed + calibration history -----------------------------------------

const fetchText = async (url) => {
  try {
    const res = await fetch(url);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
};

const feedText = await fetchText(`${RAW}/carparks.json`);
const feed = feedText ? JSON.parse(feedText) : null;
const feedAgeH = feed ? (Date.now() - Date.parse(feed.updated)) / 3600000 : null;
const histText = await fetchText(`${RAW}/history.jsonl`);
const historyRows = histText && histText.trim() ? histText.trim().split('\n').length : 0;

let reportsLive = null;
try {
  const res = await fetch('https://parkfree-sydney.vercel.app/api/reports?lat=-33.87&lon=151.21');
  if (res.ok) reportsLive = (await res.json()).live === true;
} catch { /* offline is not a failure of this script */ }

// --- provenance --------------------------------------------------------------

const git = (cmd) => {
  try { return execSync(cmd, { cwd: REPO }).toString().trim(); } catch { return null; }
};
const SEP = '|||';
const recent = (git(`git log -14 --date=short --format='%ad${SEP}%s'`) ?? '')
  .split('\n').filter(Boolean)
  .map((line) => {
    const [date, ...rest] = line.split(SEP);
    return { date, subject: rest.join(SEP) };
  })
  .filter((c) => c.subject && !/^Merge |^Docs: /.test(c.subject))
  .slice(0, 8);

const status = {
  generated: new Date().toISOString(),
  commit: git('git rev-parse --short HEAD'),
  coverage: {
    total,
    classified,
    pct: Math.round((classified / total) * 1000) / 10,
    byCat,
    sources: (parking.metadata.enriched ?? '').split(' + ').filter(Boolean).length,
  },
  places,
  councilCarParks: {
    total: carparks.carParks.length,
    withFreePeriod: withFree.length,
    freeExamples: withFree
      .sort((a, b) => (b.freeMinutes ?? 0) - (a.freeMinutes ?? 0))
      .slice(0, 5)
      .map((c) => ({
        name: c.name,
        free: c.freeMinutes >= 60 ? `${c.freeMinutes / 60}h` : `${c.freeMinutes}m`,
      })),
  },
  liveFeed: feed
    ? {
        updated: feed.updated,
        ageHours: Math.round(feedAgeH * 10) / 10,
        facilities: feed.facilities.length,
        healthy: feedAgeH < 3,
        fullest: feed.facilities
          .filter((f) => f.spots > 0)
          .sort((a, b) => b.occupied / b.spots - a.occupied / a.spots)
          .slice(0, 3)
          .map((f) => ({ name: f.name, pct: Math.round((f.occupied / f.spots) * 100) })),
      }
    : { healthy: false, error: 'feed unreachable' },
  calibration: { historyRows },
  crowdReports: { sharedStorage: reportsLive },
  recentWork: recent,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(status, null, 1));
console.log(`✓ status.json: ${classified}/${total} classified (${status.coverage.pct}%), `
  + `feed ${status.liveFeed.healthy ? 'healthy' : 'STALE'}, ${historyRows} history rows`);
