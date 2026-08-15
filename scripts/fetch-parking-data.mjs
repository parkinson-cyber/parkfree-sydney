#!/usr/bin/env node
/**
 * ParkFree Sydney — street parking data pipeline.
 *
 * Pulls street-parking data for Sydney from OpenStreetMap (Overpass API),
 * classifies every street segment into parking categories, and writes a
 * compact GeoJSON bundle consumed by the app.
 *
 * Data is © OpenStreetMap contributors, ODbL — attribution is shown in-app.
 *
 * Usage:
 *   node scripts/fetch-parking-data.mjs             # inner Sydney (default)
 *   node scripts/fetch-parking-data.mjs --area all  # every configured area
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'src', 'data', 'parking.json');

// ---------------------------------------------------------------------------
// Coverage areas: [south, west, north, east]
// ---------------------------------------------------------------------------
const AREAS = {
  inner: {
    label: 'Inner Sydney (CBD, Surry Hills, Newtown, Glebe, Paddington…)',
    bbox: [-33.925, 151.15, -33.845, 151.245],
    // Tiled: the CBD core is OSM's densest area and a single query truncates,
    // which previously dropped whole streets (College St, Macquarie St…).
    tiles: [3, 3],
  },
  east: {
    label: 'Eastern suburbs (Bondi, Randwick, Coogee)',
    // Was un-tiled — a single query over this dense a bbox is exactly the
    // truncation failure mode `inner` already hit (see above), just never
    // diagnosed here. Tiled now.
    bbox: [-33.945, 151.22, -33.87, 151.29],
    tiles: [2, 2],
  },
  innerwest: {
    label: 'Inner West (Marrickville, Ashfield, Leichhardt)',
    bbox: [-33.925, 151.09, -33.855, 151.17],
  },
  north: {
    label: 'North Sydney LGA + Lower North Shore (Kirribilli, Milsons Point, '
      + 'McMahons Point, Waverton, Crows Nest, Cammeray, Neutral Bay, Cremorne, '
      + 'Mosman, Chatswood)',
    // Extends south to the harbour (-33.86) to include Kirribilli/Milsons Point,
    // west to Waverton, and up to Chatswood. Tiled so every street is captured.
    bbox: [-33.86, 151.15, -33.78, 151.26],
    tiles: [3, 4],
  },
  northshore: {
    label: 'North Shore west/north (Hunters Hill, Lane Cove, Ryde, Gladesville, '
      + 'Artarmon, Willoughby, Northbridge, Roseville, Lindfield, Killara)',
    // West of the `north` area: Ryde/Hunters Hill peninsula across to lower
    // Ku-ring-gai. Large, so tiled densely to avoid Overpass truncation.
    bbox: [-33.83, 151.07, -33.76, 151.20],
    tiles: [3, 4],
  },
  innerwest_west: {
    label: 'Inner West + Canada Bay/Burwood/Strathfield (Ashfield, Croydon, '
      + 'Haberfield, Summer Hill, Leichhardt, Five Dock, Drummoyne, Concord, '
      + 'Burwood, Strathfield)',
    // West of the `innerwest` area out to Strathfield; north to the Parramatta
    // River (Drummoyne/Concord). Overlaps innerwest's east edge (deduped by id).
    bbox: [-33.90, 151.06, -33.845, 151.145],
    tiles: [2, 3],
  },
  east_north: {
    label: 'Eastern harbourside (Woollahra, Double Bay, Bellevue Hill, Rose Bay, '
      + 'Vaucluse, Watsons Bay, Point Piper, Darling Point)',
    // North of the `east` area up to South Head: Woollahra Council harbourside.
    bbox: [-33.875, 151.235, -33.83, 151.29],
    tiles: [2, 2],
  },
  south: {
    label: 'Southern suburbs (Sydenham, Tempe, Mascot, Botany, Rockdale, '
      + 'Kogarah, Hurstville, Brighton-le-Sands)',
    // Closes the 25km-radius gap south of `inner`/`innerwest`/`east` down to
    // Hurstville/Rockdale (~14-16km from the CBD centre).
    bbox: [-33.98, 151.06, -33.895, 151.22],
    tiles: [3, 3],
  },
  west: {
    label: 'Western suburbs (Auburn, Bankstown, Parramatta, Homebush, Lidcombe)',
    // Closes the gap west of `innerwest_west` out towards Parramatta
    // (~23.5km from the CBD centre, still inside the 25km disc).
    bbox: [-33.90, 150.97, -33.79, 151.08],
    tiles: [3, 3],
  },
  farnorth: {
    label: 'Upper North Shore (St Ives, Turramurra, Pymble, Gordon, Wahroonga, Hornsby)',
    // Closes the gap north of `north`/`northshore` up towards Hornsby
    // (~24km from the CBD centre, at the edge of the 25km disc).
    bbox: [-33.78, 151.05, -33.68, 151.20],
    tiles: [3, 3],
  },
  southeast: {
    label: 'Southern eastern suburbs (Maroubra, Malabar, Chifley, Matraville, La Perouse)',
    // Closes the gap south of `east`/`east_north` (which stop at -33.945) down
    // to La Perouse (~11km from the CBD centre, well inside the 25km disc).
    // Was un-tiled — same truncation risk as `east`, fixed the same way.
    bbox: [-33.995, 151.22, -33.94, 151.27],
    tiles: [2, 2],
  },

  // -------------------------------------------------------------------------
  // 25km -> 30km ring. The areas above form a disc out to ~25km; these five
  // close the remaining gap to a genuine 30km-from-CBD radius.
  //
  // skipTagged: true, and smaller grids than the inner areas — `farwest`
  // (fetched with full tagged+base tiling) came back with 9 tagged ways out
  // of 6,942 total: OSM's detailed parking:lane tagging is overwhelmingly an
  // inner-Sydney phenomenon, so paying for that query out here bought almost
  // nothing while doubling the request count against a rate-limited API.
  // -------------------------------------------------------------------------
  farwest: {
    label: 'Parramatta CBD, Merrylands, Guildford, Blacktown edge (Harris Park, '
      + 'Granville, Westmead, Toongabbie)',
    // West of `west` (which stops at 150.97) out towards Blacktown, ~24-29km.
    bbox: [-33.86, 150.86, -33.75, 150.99],
    tiles: [3, 3],
  },
  hills: {
    label: 'The Hills District (Castle Hill, Baulkham Hills, Kellyville, '
      + 'Bella Vista, Rouse Hill)',
    // North of `farwest`, not covered by any existing area — ~20-28km.
    bbox: [-33.80, 150.90, -33.68, 151.02],
    tiles: [2, 2],
    skipTagged: true,
  },
  bankstown: {
    label: 'Bankstown, Padstow, Revesby, Panania, Picnic Point',
    // South of `west` (which stops at -33.90) — Bankstown itself sits just
    // outside that bound. ~17-23km.
    bbox: [-33.98, 150.95, -33.89, 151.08],
    tiles: [2, 2],
    skipTagged: true,
  },
  sutherland: {
    label: 'Sutherland Shire (Sutherland, Miranda, Caringbah, Cronulla, Menai, '
      + 'Engadine, Sylvania)',
    // South of `south`/`southeast` (which stop at -33.98/-33.995) — the single
    // biggest remaining gap, out to Cronulla at ~27km.
    bbox: [-34.10, 150.95, -33.97, 151.20],
    tiles: [2, 2],
    skipTagged: true,
  },
  farnorth2: {
    label: 'Hornsby to Berowra (Asquith, Mount Colah, Mount Kuring-gai, Berowra, '
      + 'Hornsby Heights)',
    // North of `farnorth` (which stops at -33.68) out to the edge of the
    // 30km disc at Berowra, ~28-30km.
    bbox: [-33.68, 151.02, -33.58, 151.16],
    tiles: [2, 2],
    skipTagged: true,
  },

  // -------------------------------------------------------------------------
  // Northern Beaches — a whole LGA with no coverage at all until now, not
  // even partially: it sits across the harbour from `north`/`northshore` and
  // was never in range of any existing bbox. Split in two along its length
  // (it's a long, thin peninsula — one bbox would be mostly ocean).
  // -------------------------------------------------------------------------
  northernbeaches_south: {
    label: 'Northern Beaches south (Manly, Fairlight, Balgowlah, Seaforth, '
      + 'Freshwater, Curl Curl, Brookvale, Dee Why, Collaroy, Narrabeen, '
      + 'Forestville, Belrose)',
    bbox: [-33.83, 151.18, -33.71, 151.31],
    tiles: [3, 3],
    skipTagged: true,
  },
  northernbeaches_north: {
    label: 'Northern Beaches north (Mona Vale, Newport, Avalon, Palm Beach, '
      + 'Church Point, Terrey Hills, Duffys Forest)',
    bbox: [-33.71, 151.18, -33.57, 151.33],
    tiles: [3, 3],
    skipTagged: true,
  },
};

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const USER_AGENT = 'ParkFreeSydney/1.0 (open data pipeline)';

// Base street network considered candidate parking streets. Motorway/trunk
// expressways never allow street parking so they are excluded, but many Sydney
// CBD arterials tagged `primary` (William St, College St, Oxford St, Cleveland
// St…) do have kerbside/metered parking, so primary and the *_link ramps that
// carry parking are included alongside secondary.
const BASE_HIGHWAYS =
  'residential|living_street|unclassified|tertiary|secondary|secondary_link|primary|primary_link';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Overpass fetch with retry + mirror fallback
// ---------------------------------------------------------------------------
async function overpass(query, attempt = 0) {
  const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'data=' + encodeURIComponent(query),
    });
    const text = await res.text();
    if (!res.ok || text.trimStart().startsWith('<')) {
      throw new Error(`HTTP ${res.status} from ${endpoint}: ${text.slice(0, 120)}`);
    }
    return JSON.parse(text);
  } catch (err) {
    // Overpass mirrors periodically all 504/429 together during global load
    // spikes; be patient rather than losing a whole area's fetched tiles. Up to
    // 14 attempts, backoff capped at 45s with jitter, rotating mirrors.
    //
    // 429 specifically means "you are over quota right now" — retrying it on
    // the generic 8s/16s/24s schedule just re-triggers the same limit and can
    // retry-storm for hours without making progress (measured: 8h stuck on
    // tile 7/9 of one area). A 429 gets a real penalty — 90s flat — instead.
    if (attempt >= 14) throw err;
    const isRateLimited = /HTTP 429/.test(err.message);
    const wait = isRateLimited
      ? 90000 + Math.floor(Math.random() * 15000)
      : Math.min(8000 * (attempt + 1), 45000) + Math.floor(Math.random() * 3000);
    console.log(`  retry ${attempt + 1} (${err.message.slice(0, 80)}) — waiting ${Math.round(wait / 1000)}s`);
    await new Promise((r) => setTimeout(r, wait));
    return overpass(query, attempt + 1);
  }
}

function bboxStr([s, w, n, e]) {
  return `${s},${w},${n},${e}`;
}

/** Split a bbox into a rows×cols grid of smaller bboxes. */
function tileBbox([s, w, n, e], [rows, cols]) {
  const dLat = (n - s) / rows;
  const dLon = (e - w) / cols;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push([s + r * dLat, w + c * dLon, s + (r + 1) * dLat, w + (c + 1) * dLon]);
    }
  }
  return out;
}

// Gap between any two Overpass requests. Public mirrors are free, shared
// infrastructure; 1.5s turned out to be optimistic enough to trigger 429s
// under normal daytime load. 5s is comfortably inside fair-use.
const REQUEST_GAP_MS = 5000;

async function fetchTile(bb, { skipTagged = false } = {}) {
  let tagged = { elements: [] };
  if (!skipTagged) {
    tagged = await overpass(`[out:json][timeout:90];
      (
        way["highway"]["parking:lane:left"](${bb});
        way["highway"]["parking:lane:right"](${bb});
        way["highway"]["parking:lane:both"](${bb});
        way["highway"]["parking:left"](${bb});
        way["highway"]["parking:right"](${bb});
        way["highway"]["parking:both"](${bb});
        way["highway"]["parking:condition:left"](${bb});
        way["highway"]["parking:condition:right"](${bb});
        way["highway"]["parking:condition:both"](${bb});
      );
      out geom;`);
    await sleep(REQUEST_GAP_MS);
  }
  const base = await overpass(`[out:json][timeout:90];
    way["highway"~"^(${BASE_HIGHWAYS})$"]["area"!="yes"](${bb});
    out geom;`);
  return { tagged: tagged.elements, base: base.elements };
}

async function fetchArea(name, { label, bbox, tiles, skipTagged }) {
  console.log(`\n▸ ${name}: ${label}${skipTagged ? ' (base network only — sparse OSM parking tagging out here)' : ''}`);
  const grid = tiles ? tileBbox(bbox, tiles) : [bbox];
  const tagged = [];
  const base = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid.length > 1) console.log(`  tile ${i + 1}/${grid.length}…`);
    const res = await fetchTile(bboxStr(grid[i]), { skipTagged });
    tagged.push(...res.tagged);
    base.push(...res.base);
    if (i < grid.length - 1) await sleep(REQUEST_GAP_MS);
  }
  console.log(`    ${tagged.length} tagged ways, ${base.length} base ways`);
  return { tagged, base, area: name };
}

// ---------------------------------------------------------------------------
// Classification
//
// OSM uses two tagging schemes for street parking; both appear in Sydney:
//   legacy:  parking:lane:<side>=parallel|no_parking|…
//            parking:condition:<side>=free|ticket|residents|…
//            parking:condition:<side>:maxstay / :time_interval
//   current: parking:<side>=lane|street_side|no|separate|…
//            parking:<side>:restriction=no_parking|no_stopping (+ :conditional)
//            parking:<side>:fee=yes|no (+ :conditional)
//            parking:<side>:maxstay (+ :conditional)
// ---------------------------------------------------------------------------

const POSITION_ALLOWS = new Set([
  'parallel', 'diagonal', 'perpendicular', 'marked', 'lane', 'street_side',
  'on_kerb', 'half_on_kerb', 'painted_area_only', 'yes',
]);
const POSITION_FORBIDS = new Set(['no_parking', 'no_stopping', 'no', 'none']);

function parseMaxstay(v) {
  if (!v) return undefined;
  const s = String(v).toLowerCase().trim();
  let mins;
  let m;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)$/))) mins = Math.round(parseFloat(m[1]) * 60);
  else if ((m = s.match(/^(\d+)\s*(?:minutes?|mins?|min)$/))) mins = parseInt(m[1], 10);
  else if ((m = s.match(/^(\d+)$/))) mins = parseInt(m[1], 10) * 60; // bare number = hours
  else if ((m = s.match(/^pt(\d+)h$/))) mins = parseInt(m[1], 10) * 60;
  else if ((m = s.match(/^pt(\d+)m$/))) mins = parseInt(m[1], 10);
  else return undefined;
  // No real NSW parking sign is under 5 minutes; such a value is almost always
  // an hours-written-as-minutes tagging mistake (e.g. maxstay=PT2M for "2P").
  if (mins > 0 && mins < 5) mins *= 60;
  return mins;
}

/** Extract "value @ (condition)" pairs from an OSM conditional tag. */
function parseConditional(v) {
  if (!v) return [];
  return String(v)
    .split(';')
    .map((part) => {
      const m = part.trim().match(/^([^@]+?)\s*@\s*\(?([^)]*)\)?$/);
      return m ? { value: m[1].trim(), condition: m[2].trim() } : null;
    })
    .filter(Boolean);
}

/**
 * Classify one side of a street.
 * Returns null when nothing is known about this side.
 */
function classifySide(tags, side) {
  const t = (suffix) =>
    tags[`parking:${side}${suffix}`] ?? tags[`parking:both${suffix}`];
  const legacyLane = tags[`parking:lane:${side}`] ?? tags['parking:lane:both'];
  const legacyCond = tags[`parking:condition:${side}`] ?? tags['parking:condition:both'];
  const legacyMaxstay =
    tags[`parking:condition:${side}:maxstay`] ?? tags['parking:condition:both:maxstay'];
  const legacyInterval =
    tags[`parking:condition:${side}:time_interval`] ??
    tags['parking:condition:both:time_interval'];

  const position = t('') ?? legacyLane;
  const restriction = t(':restriction');
  const restrictionCond = t(':restriction:conditional');
  const fee = t(':fee');
  const feeCond = t(':fee:conditional');
  const maxstayRaw = t(':maxstay') ?? legacyMaxstay;
  const maxstayCond = t(':maxstay:conditional');
  const access = t(':access');

  const hasAny =
    position || restriction || restrictionCond || fee || feeCond ||
    maxstayRaw || maxstayCond || legacyCond || access;
  if (!hasAny) return null;

  const out = {};

  // --- hard bans -----------------------------------------------------------
  if (position && POSITION_FORBIDS.has(position)) {
    out.kind = position === 'no_stopping' ? 'no_stopping' : 'no_parking';
    return out;
  }
  if (restriction === 'no_stopping') return { kind: 'no_stopping' };
  if (restriction === 'no_parking') return { kind: 'no_parking' };
  if (position === 'separate') return null; // mapped as its own geometry elsewhere

  // --- legacy condition shortcuts -----------------------------------------
  if (legacyCond === 'no_parking') return { kind: 'no_parking' };
  if (legacyCond === 'no_stopping') return { kind: 'no_stopping' };

  const maxstayMin = parseMaxstay(maxstayRaw);
  if (maxstayMin) out.maxstayMin = maxstayMin;
  if (legacyInterval) out.interval = legacyInterval;

  // conditional maxstay, e.g. "2 hours @ (Mo-Fr 08:30-18:00)"
  for (const c of parseConditional(maxstayCond)) {
    const mins = parseMaxstay(c.value);
    if (mins) {
      out.maxstayMin = mins;
      out.interval = out.interval || c.condition;
    }
  }
  // conditional bans, e.g. clearway "no_stopping @ (Mo-Fr 06:00-10:00)"
  const bans = parseConditional(restrictionCond).filter((c) =>
    ['no_parking', 'no_stopping', 'no'].includes(c.value),
  );
  if (bans.length) {
    out.banInterval = bans.map((b) => b.condition).join('; ');
  }
  // conditional fee, e.g. "no @ (Su)" or "yes @ (Mo-Sa 08:00-20:00)"
  let paid = fee === 'yes' || legacyCond === 'ticket' || legacyCond === 'disc';
  for (const c of parseConditional(feeCond)) {
    if (c.value === 'yes') {
      paid = true;
      out.feeInterval = c.condition;
    }
    if (c.value === 'no' && fee === 'yes') out.freeInterval = c.condition;
  }

  if (legacyCond === 'residents' || access === 'residents' || access === 'permit_holders' || access === 'private') {
    out.kind = 'residents';
  } else if (paid) {
    out.kind = 'paid';
  } else if (out.maxstayMin) {
    out.kind = 'free_limited';
  } else if (position && POSITION_ALLOWS.has(position)) {
    out.kind = 'free';
  } else if (legacyCond === 'free') {
    out.kind = 'free';
  } else {
    out.kind = 'unknown';
  }
  return out;
}

const KIND_RANK = { free: 0, free_limited: 1, paid: 2, residents: 3, unknown: 4, no_parking: 5, no_stopping: 6 };

function overallCategory(left, right) {
  const kinds = [left?.kind, right?.kind].filter(Boolean);
  if (!kinds.length) return 'unknown';
  kinds.sort((a, b) => KIND_RANK[a] - KIND_RANK[b]);
  return kinds[0];
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
const round = (x) => Math.round(x * 1e5) / 1e5; // ~1 m precision

function wayCoords(el) {
  const pts = (el.geometry ?? []).map((p) => [round(p.lon), round(p.lat)]);
  // drop consecutive duplicates created by rounding
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const areaArg = process.argv.includes('--area')
  ? process.argv[process.argv.indexOf('--area') + 1]
  : 'inner';
const areaNames = areaArg === 'all' ? Object.keys(AREAS) : [areaArg];

const features = [];
const seen = new Set();
const stats = {};

for (const name of areaNames) {
  if (!AREAS[name]) {
    console.error(`Unknown area "${name}". Available: ${Object.keys(AREAS).join(', ')}, all`);
    process.exit(1);
  }
  const { tagged, base } = await fetchArea(name, AREAS[name]);
  const taggedIds = new Set(tagged.map((el) => el.id));
  const areaStats = { free: 0, free_limited: 0, paid: 0, residents: 0, no_parking: 0, no_stopping: 0, unknown: 0 };

  const push = (el, isTagged) => {
    if (seen.has(el.id)) return;
    seen.add(el.id);
    const coords = wayCoords(el);
    if (coords.length < 2) return;
    const tags = el.tags ?? {};
    const left = isTagged ? classifySide(tags, 'left') : null;
    const right = isTagged ? classifySide(tags, 'right') : null;
    const cat = isTagged ? overallCategory(left, right) : 'unknown';
    areaStats[cat] = (areaStats[cat] ?? 0) + 1;
    const props = { id: el.id, cat, area: name };
    if (tags.name) props.name = tags.name;
    if (left) props.left = left;
    if (right) props.right = right;
    features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
  };

  for (const el of tagged) push(el, true);
  for (const el of base) if (!taggedIds.has(el.id)) push(el, false);
  stats[name] = areaStats;
}

// Merge with existing data: keep features from areas we did NOT fetch, replace
// the ones we did. This lets you refresh a single area without losing the rest.
const fetchedAreas = new Set(areaNames);
let kept = [];
let priorAreas = [];
try {
  const prior = JSON.parse(readFileSync(OUT_FILE, 'utf8'));
  priorAreas = prior.metadata?.areas ?? [];
  kept = prior.features.filter((f) => !fetchedAreas.has(f.properties.area));
} catch {
  // no existing file — first run
}

// Dedup by OSM id across the merged set (thin overlap bands between areas).
const byId = new Map();
for (const f of [...kept, ...features]) {
  if (!byId.has(f.properties.id)) byId.set(f.properties.id, f);
}
const merged = [...byId.values()];

const collection = {
  type: 'FeatureCollection',
  metadata: {
    generated: new Date().toISOString(),
    source: 'OpenStreetMap contributors (ODbL) via Overpass API',
    areas: [...new Set([...priorAreas, ...areaNames])],
  },
  features: merged,
};

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(collection));

console.log('\n── Summary (this run) ───────────────────');
for (const [name, s] of Object.entries(stats)) {
  console.log(`${name}: ${Object.entries(s).map(([k, v]) => `${k}=${v}`).join('  ')}`);
}
console.log(`Fetched features: ${features.length}, kept from other areas: ${kept.length}`);
console.log(`Total in file: ${merged.length}`);
console.log(`Wrote ${OUT_FILE} (${(JSON.stringify(collection).length / 1e6).toFixed(2)} MB)`);
