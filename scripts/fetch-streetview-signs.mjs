#!/usr/bin/env node
/**
 * Street View sign sweep — a *review queue builder*, not a data source.
 *
 * For each street in a target area that the map still can't classify, this
 * works out where a sign would be and which way a camera must face to read it,
 * asks Google whether Street View imagery exists there (the metadata endpoint,
 * which is free and unlimited), and — only for the spots that pass — downloads
 * the images so they can be read.
 *
 * What it deliberately does NOT do:
 *   - It never writes to src/data/parking.json. Reading a sign is a judgement
 *     call; the output of this script is a queue, and a rule only enters the
 *     map through scripts/data/field-signs.json with `"method": "streetview"`,
 *     where it is the weakest tier and a photo always beats it.
 *   - It never saves images inside the repo. Google imagery is Google's; the
 *     files land in a scratch directory outside the project and are not
 *     committed. Only what a sign *says* is kept, the way a person reading a
 *     sign keeps the rule and not the photograph.
 *
 * Imagery age is the reason for the date gate: a 2014 photo of a pole says
 * nothing about today's kerb. Anything older than --since is skipped rather
 * than guessed at.
 *
 * Usage:
 *   node scripts/fetch-streetview-signs.mjs cbd --dry-run --include-unsure
 *   node scripts/fetch-streetview-signs.mjs cbd --dry-run     # free: counts + imagery ages
 *   GOOGLE_MAPS_KEY=... node scripts/fetch-streetview-signs.mjs cbd --max-images 200
 *
 * Areas: cbd, northsydney, eastern-beaches, northern-beaches
 *
 * MEASURED YIELD (2026-09-21, 38 images over 5 CBD streets) — read this before
 * planning a big run. Wide shots across the kerb (fov 45-90, both sides, at the
 * segment midpoint) produced **0 readable parking rules in 12 views**: they
 * frame facades, hedges and garden beds, because a pano sits on the road
 * centreline and a midpoint is rarely where a sign is. A narrow second shot
 * (fov 28, the most angular resolution 640px allows on the free tier) aimed
 * where a pole appeared DID find the signpost on a known-metered street — but
 * only the sign *types* were legible (yellow clearway plate, red NO STOPPING,
 * BUS LANE, a small P), not the times. That is the same limit as the Northern
 * Beaches sign register: type known, hours not. So this script can tell you a
 * kerb is No Stopping; it cannot tell you a kerb is 2P 8:30am-6pm, and it must
 * never be used to guess one.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AREAS = {
  // south, north, west, east
  'cbd': { label: 'Sydney CBD', bbox: [-33.885, -33.855, 151.195, 151.220] },
  'northsydney': { label: 'North Sydney, Cammeray, Crows Nest', bbox: [-33.850, -33.815, 151.185, 151.225] },
  'eastern-beaches': { label: 'Bondi to Coogee', bbox: [-33.930, -33.870, 151.245, 151.290] },
  'northern-beaches': { label: 'Manly to Narrabeen', bbox: [-33.800, -33.700, 151.270, 151.310] },
};

const args = process.argv.slice(2);
const area = args.find((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const DRY = args.includes('--dry-run');
const INCLUDE_UNSURE = args.includes('--include-unsure');
const MAX_IMAGES = Number(flag('max-images', 200));
const SINCE = flag('since', '2021-01');          // imagery older than this is not worth reading
const OUT_DIR = flag('out', join(process.env.TMPDIR || '/tmp', 'parkfree-streetview'));

if (!area || !AREAS[area]) {
  console.error(`usage: node scripts/fetch-streetview-signs.mjs <${Object.keys(AREAS).join('|')}> [--dry-run] [--max-images N] [--since YYYY-MM]`);
  process.exit(1);
}
const KEY = process.env.GOOGLE_MAPS_KEY;
if (!KEY && !DRY) {
  console.error('GOOGLE_MAPS_KEY is not set (source ../.secrets/google.env). Use --dry-run to plan without it.');
  process.exit(1);
}

/** Great-circle bearing, degrees clockwise from north. */
function bearing([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) -
    Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

/** The point halfway along a polyline, and the street's direction there. */
function midpoint(coords) {
  const mid = Math.max(1, Math.floor(coords.length / 2));
  return { at: coords[mid], heading: bearing(coords[mid - 1], coords[mid]) };
}

const inBox = ([lon, lat], [s, n, w, e]) => lat >= s && lat <= n && lon >= w && lon <= e;

/**
 * "Unsure" — classified, but by something that does not actually pin the kerb:
 *   rateZoneFill      a metered rate polygon (we know the price, not the hours)
 *   otherTimesUnknown a clearway (we know when you may not stop, nothing else)
 *   permit, no limit  a scheme area map (we know the scheme, not the sign's P)
 * These read as "check the sign" in the app, which is exactly what a sign in
 * Street View can answer.
 */
function unsure(p) {
  const sides = [p.left, p.right].filter(Boolean);
  if (!sides.length) return false;
  return sides.some((r) =>
    r.rateZoneFill || r.otherTimesUnknown ||
    (r.kind === 'residents' && !r.maxstayMin));
}

const data = JSON.parse(readFileSync(new URL('../src/data/parking.json', import.meta.url), 'utf8'));
const { label, bbox } = AREAS[area];
const targets = data.features.filter((f) => {
  const p = f.properties;
  if (!p.name || !inBox(f.geometry.coordinates[0], bbox)) return false;
  return p.cat === 'unknown' || (INCLUDE_UNSURE && unsure(p));
});
const missing = targets.filter((f) => f.properties.cat === 'unknown').length;

console.log(`${label}: ${targets.length} streets to check` +
  (INCLUDE_UNSURE ? ` (${missing} with no rule at all, ${targets.length - missing} classified but vague)` : ''));

/** Free, unmetered: does imagery exist here, and how old is it? */
async function metadata(lat, lon) {
  const u = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lon}&radius=40&source=outdoor&key=${KEY}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`metadata ${r.status}`);
  return r.json();
}

async function image(lat, lon, heading, file) {
  // fov 45 is tight enough to read a time plate; 640x640 is the free-tier size.
  const u = `https://maps.googleapis.com/maps/api/streetview?size=640x640&location=${lat},${lon}` +
    `&heading=${Math.round(heading)}&pitch=8&fov=45&radius=40&source=outdoor&return_error_code=true&key=${KEY}`;
  const r = await fetch(u);
  if (!r.ok) return false;
  await writeFile(file, Buffer.from(await r.arrayBuffer()));
  return true;
}

const shots = [];
let noImagery = 0, tooOld = 0, images = 0;
await mkdir(OUT_DIR, { recursive: true });

for (const f of targets) {
  if (images >= MAX_IMAGES) break;
  const { at: [lon, lat], heading } = midpoint(f.geometry.coordinates);
  const p = f.properties;

  let meta = { status: 'DRY', date: null };
  if (KEY) {
    try { meta = await metadata(lat, lon); } catch (e) { console.error(`  ${p.name}: ${e.message}`); continue; }
    if (meta.status !== 'OK') { noImagery++; continue; }
    if (meta.date && meta.date < SINCE) { tooOld++; continue; }
  }

  // A sign sits on the kerb, so the camera looks across the footpath: 90° off
  // the street line on each side. Two shots per street, one per kerb.
  for (const side of [{ name: 'left', h: heading - 90 }, { name: 'right', h: heading + 90 }]) {
    if (images >= MAX_IMAGES) break;
    const file = join(OUT_DIR, `${p.id}-${side.name}.jpg`);
    if (!DRY && !(await image(lat, lon, (side.h + 360) % 360, file))) continue;
    shots.push({ id: p.id, street: p.name, suburb: p.area, side: side.name,
                 lat: +lat.toFixed(6), lon: +lon.toFixed(6), heading: Math.round((side.h + 360) % 360),
                 imageryDate: meta.date ?? null, file: DRY ? null : file,
                 why: p.cat === 'unknown' ? 'no rule' : 'vague rule', currentCat: p.cat });
    images++;
  }
}

const manifest = { area, label, generated: new Date().toISOString(), since: SINCE,
                   streets: targets.length, noImagery, tooOld, shots };
const manifestPath = join(OUT_DIR, `${area}-manifest.json`);
if (!DRY) await writeFile(manifestPath, JSON.stringify(manifest, null, 1));

console.log(`  no imagery: ${noImagery} · imagery older than ${SINCE}: ${tooOld}`);
console.log(DRY
  ? `  dry run — would queue ${targets.length * 2} shots (2 per street), capped at ${MAX_IMAGES}`
  : `  ${images} images in ${OUT_DIR}\n  manifest: ${manifestPath}`);
