/**
 * CBD parking enrichment pipeline (authoritative open data).
 *
 * The OSM base network (from fetch-parking-data.mjs) is geometrically complete
 * but sparse on rules. This script overlays City of Sydney + Transport for NSW
 * open data — which carries the real signs — onto that network:
 *
 *   1. Parking meters (City of Sydney)   → per-meter sign string ("1P 8AM-6PM
 *      MON-FRI, $7 /HR;…") giving time limit, operating hours, cut-off & price.
 *   2. Resident parking permit precincts → "Permit Holders Excepted" areas.
 *   3. Free 15-minute parking zones      → ¼P free bays.
 *   4. TfNSW Sydney CBD kerbside loading zones.
 *
 * Meters / loading zones are snapped to the nearest street segment; permit
 * precincts are applied by point-in-polygon on the street midpoint. The result
 * is merged back into src/data/parking.json (base geometry preserved).
 *
 * Run:  node scripts/fetch-cbd-parking.mjs
 * All sources are open (CC-BY). No commercial/undocumented endpoints.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'src', 'data', 'parking.json');

const COS = 'https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services';
const METERS =
  'https://utility.arcgis.com/usrsvcs/servers/71bb12507a3240c4b12e7fbba5be58e1' +
  '/rest/services/ParkingMeters/ParkingMeters/MapServer/78';
const LOADING_ZONES =
  'https://opendata.transport.nsw.gov.au/data/dataset/919abc67-5636-46c2-9cd3-746edd4ad1ff' +
  '/resource/0a075809-c2b4-4ac0-8423-a80ca1ac86b7/download/loadingzonedata_2.json';

// Snap distance from a meter/zone point to a street polyline (metres).
const SNAP_M = 30;

// ─── fetch helpers ───────────────────────────────────────────────────────────

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ParkFreeSydney/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

/** Page through an ArcGIS layer, returning all features (attributes + geometry). */
async function fetchArcgisAll(layerUrl, { where = '1=1', geojson = false } = {}) {
  const out = [];
  let offset = 0;
  const page = 1000;
  for (;;) {
    const fmt = geojson ? 'geojson' : 'json';
    const url =
      `${layerUrl}/query?where=${encodeURIComponent(where)}&outFields=*` +
      `&outSR=4326&resultOffset=${offset}&resultRecordCount=${page}&f=${fmt}`;
    const d = await getJson(url);
    const feats = geojson ? d.features : d.features;
    if (!feats || !feats.length) break;
    out.push(...feats);
    if (feats.length < page || d.exceededTransferLimit === false) break;
    offset += page;
  }
  return out;
}

// ─── geometry ────────────────────────────────────────────────────────────────

const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;

function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Approx metres/deg at a latitude, for cheap planar distance in a small area. */
function planarScale(lat) {
  return { x: 111320 * Math.cos(toRad(lat)), y: 110540 };
}

/** Min distance (m) from point to a polyline, using local planar projection. */
function distToLine(lat, lon, coords) {
  const s = planarScale(lat);
  const px = lon * s.x;
  const py = lat * s.y;
  let min = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const ax = coords[i - 1][0] * s.x;
    const ay = coords[i - 1][1] * s.y;
    const bx = coords[i][0] * s.x;
    const by = coords[i][1] * s.y;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < min) min = d;
  }
  return min;
}

/** Ray-cast point-in-polygon (rings of [lon,lat]). */
function pointInRings(lon, lat, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function midpoint(coords) {
  return coords[Math.floor(coords.length / 2)];
}

// ─── meter sign parsing ──────────────────────────────────────────────────────

const DAY_MAP = [
  [/MON\s*-\s*FRI/i, 'Mo-Fr'],
  [/MON\s*-\s*SAT/i, 'Mo-Sa'],
  [/MON\s*-\s*SUN/i, 'Mo-Su'],
  [/SAT\s*-\s*SUN/i, 'Sa-Su'],
  [/PUBLIC HOLIDAYS/i, ''], // handled alongside a day token
  [/SATURDAY|SAT\b/i, 'Sa'],
  [/SUNDAY|SUN\b/i, 'Su'],
  [/\bFRI\b/i, 'Fr'],
];

function limitToMin(tok) {
  // "1", "4", "1/2", "1/4", "3/4"
  if (tok.includes('/')) {
    const [n, d] = tok.split('/').map(Number);
    if (d) return Math.round((n / d) * 60);
  }
  const n = Number(tok);
  return Number.isFinite(n) ? n * 60 : undefined;
}

function to24h(h, m, ap) {
  let hh = h % 12;
  if (/PM/i.test(ap)) hh += 12;
  return hh * 60 + (m || 0);
}
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function daysToken(segUpper) {
  for (const [re, tok] of DAY_MAP) {
    if (tok && re.test(segUpper)) return tok;
  }
  return 'Mo-Su'; // sign with a time but no day → treat as daily
}

/**
 * Parse a meter "Popup" string into a paid SideRule.
 *  e.g. "1P 8AM-6PM MON-FRI, $7 /HR;4P 8AM-6PM SAT-SUN & PUBLIC HOLIDAYS, $7 /HR"
 */
function parsePopup(popup) {
  if (!popup) return null;
  const feeClauses = [];
  let weekdayLimit;
  let anyLimit;
  let maxPrice = 0;
  let cutOff = 0;

  for (const seg of popup.split(';')) {
    const s = seg.trim();
    if (!s) continue;
    const limM = s.match(/^([\d]+(?:\/[\d]+)?)\s*P\b/i);
    const limit = limM ? limitToMin(limM[1]) : undefined;
    const tM = s.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    const pM = s.match(/\$\s*([\d.]+)\s*\/\s*HR/i);
    if (pM) maxPrice = Math.max(maxPrice, parseFloat(pM[1]));

    if (tM) {
      const start = to24h(+tM[1], tM[2] ? +tM[2] : 0, tM[3]);
      let end = to24h(+tM[4], tM[5] ? +tM[5] : 0, tM[6]);
      if (end === 0) end = 24 * 60; // midnight = end of day
      cutOff = Math.max(cutOff, end);
      const dTok = daysToken(s.toUpperCase());
      feeClauses.push(`${dTok} ${hhmm(start)}-${hhmm(end)}`);
      if (/MON\s*-\s*FRI/i.test(s) && weekdayLimit == null) weekdayLimit = limit;
    }
    if (anyLimit == null && limit != null) anyLimit = limit;
  }

  if (!feeClauses.length) return null;
  const rule = {
    kind: 'paid',
    zone: 'meter',
    maxstayMin: weekdayLimit ?? anyLimit,
    feeInterval: feeClauses.join('; '),
  };
  if (maxPrice > 0) rule.pricePerHour = maxPrice;
  if (cutOff > 0 && cutOff < 24 * 60) rule.cutOffMin = cutOff;
  return rule;
}

// ─── loading-zone hours parsing (into a ban-style interval) ──────────────────

function parseLoadingHours(wd, we) {
  // "0600-1800 Mon-Fri", "0600-1000 Sat"
  const parts = [];
  for (const raw of [wd, we]) {
    if (!raw) continue;
    const m = raw.match(/(\d{2})(\d{2})\s*-\s*(\d{2})(\d{2})\s*(Mon-Fri|Sat|Sun|Mon-Sat)?/i);
    if (!m) continue;
    const day = /Sat/i.test(m[5] || '') ? 'Sa' : /Sun/i.test(m[5] || '') ? 'Su' : 'Mo-Fr';
    parts.push(`${day} ${m[1]}:${m[2]}-${m[3]}:${m[4]}`);
  }
  return parts.join('; ') || undefined;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('▸ Loading base network…');
  const collection = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  const streets = collection.features;

  // Spatial index the streets by a coarse grid for fast nearest lookup.
  const CELL = 0.004; // ~400m
  const grid = new Map();
  const key = (lat, lon) => `${Math.round(lat / CELL)}:${Math.round(lon / CELL)}`;
  for (const f of streets) {
    if (f.geometry?.type !== 'LineString') continue;
    const [lon, lat] = midpoint(f.geometry.coordinates);
    const gk = key(lat, lon);
    if (!grid.has(gk)) grid.set(gk, []);
    grid.get(gk).push(f);
  }
  function nearestStreet(lat, lon, maxM) {
    let best = null;
    let bestD = maxM;
    const cLat = Math.round(lat / CELL);
    const cLon = Math.round(lon / CELL);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cell = grid.get(`${cLat + dy}:${cLon + dx}`);
        if (!cell) continue;
        for (const f of cell) {
          const d = distToLine(lat, lon, f.geometry.coordinates);
          if (d < bestD) {
            bestD = d;
            best = f;
          }
        }
      }
    }
    return best;
  }

  // 1 ── Parking meters ───────────────────────────────────────────────────────
  console.log('▸ Fetching parking meters…');
  const meters = await fetchArcgisAll(METERS);
  let meterHits = 0;
  let meterMiss = 0;
  for (const m of meters) {
    const a = m.attributes;
    const g = m.geometry;
    if (!g || g.x == null) continue;
    const rule = parsePopup(a.Popup);
    if (!rule) continue;
    const st = nearestStreet(g.y, g.x, SNAP_M);
    if (!st) {
      meterMiss++;
      continue;
    }
    // A street can carry several meters; keep the shortest (most restrictive)
    // time limit but the widest fee window & highest price.
    const prev = st.properties.left;
    if (prev?.zone === 'meter') {
      if ((rule.maxstayMin ?? 999) < (prev.maxstayMin ?? 999)) prev.maxstayMin = rule.maxstayMin;
      if ((rule.pricePerHour ?? 0) > (prev.pricePerHour ?? 0)) prev.pricePerHour = rule.pricePerHour;
      if ((rule.cutOffMin ?? 0) > (prev.cutOffMin ?? 0)) prev.cutOffMin = rule.cutOffMin;
    } else {
      st.properties.left = rule;
      st.properties.cat = 'paid';
      st.properties.zone = 'meter';
      meterHits++;
    }
  }
  console.log(`  meters: ${meters.length} fetched, ${meterHits} streets tagged, ${meterMiss} unsnapped`);

  // 2 ── Loading zones ─────────────────────────────────────────────────────────
  console.log('▸ Fetching loading zones…');
  let lzHits = 0;
  try {
    const lz = await getJson(LOADING_ZONES);
    for (const f of lz.features || []) {
      const g = f.geometry;
      let pt = null;
      if (g?.x != null) pt = [g.y, g.x];
      else if (g?.rings?.[0]?.length) {
        // centroid of the outer ring
        const ring = g.rings[0];
        let sx = 0;
        let sy = 0;
        for (const [lon, lat] of ring) {
          sx += lon;
          sy += lat;
        }
        pt = [sy / ring.length, sx / ring.length];
      }
      if (!pt) continue;
      const st = nearestStreet(pt[0], pt[1], SNAP_M);
      if (!st) continue;
      const a = f.attributes;
      const ban = parseLoadingHours(a.HRS_OPERATION_WEEKDAY, a.HRS_OPERATION_WEEKEND);
      // Loading zone = no general parking during its hours; free outside.
      const rule = { kind: 'no_parking', zone: 'loading', banInterval: ban };
      if (st.properties.left?.zone === 'meter') {
        st.properties.right = rule;
      } else {
        st.properties.left = rule;
        st.properties.cat = st.properties.cat === 'unknown' ? 'no_parking' : st.properties.cat;
      }
      if (!st.properties.zone) st.properties.zone = 'loading';
      lzHits++;
    }
  } catch (e) {
    console.log(`  ⚠ loading zones skipped: ${e.message}`);
  }
  console.log(`  loading zones: ${lzHits} streets tagged`);

  // 3 ── Free 15-minute parking ────────────────────────────────────────────────
  console.log('▸ Fetching free 15-min zones…');
  let free15 = 0;
  try {
    const zones = await fetchArcgisAll(`${COS}/Free_15_minute_parking/FeatureServer/0`, { geojson: true });
    for (const z of zones) {
      const rings = z.geometry?.type === 'MultiPolygon'
        ? z.geometry.coordinates.flat()
        : z.geometry?.coordinates;
      if (!rings) continue;
      for (const f of streets) {
        if (f.geometry?.type !== 'LineString') continue;
        const [lon, lat] = midpoint(f.geometry.coordinates);
        if (pointInRings(lon, lat, rings)) {
          if (!f.properties.left || f.properties.left.kind === 'free') {
            f.properties.left = { kind: 'free_limited', maxstayMin: 15, zone: 'free15' };
            f.properties.cat = 'free_limited';
            f.properties.zone = 'free15';
            free15++;
          }
        }
      }
    }
  } catch (e) {
    console.log(`  ⚠ free-15 skipped: ${e.message}`);
  }
  console.log(`  free 15-min: ${free15} streets tagged`);

  // 4 ── Resident permit precincts ─────────────────────────────────────────────
  console.log('▸ Fetching resident permit precincts…');
  let permit = 0;
  try {
    const areas = await fetchArcgisAll(`${COS}/ParkingPermits/FeatureServer/0`, { geojson: true });
    const resAreas = areas
      .filter((a) => /yes/i.test(a.properties?.ResidentialEligible || ''))
      .map((a) => ({
        label: a.properties.Label,
        rings: a.geometry?.type === 'MultiPolygon' ? a.geometry.coordinates.flat() : a.geometry?.coordinates,
      }))
      .filter((a) => a.rings);
    for (const f of streets) {
      if (f.geometry?.type !== 'LineString') continue;
      const [lon, lat] = midpoint(f.geometry.coordinates);
      const area = resAreas.find((a) => pointInRings(lon, lat, a.rings));
      if (!area) continue;
      // Mark the permit exception on whatever rule the kerb already has, and
      // flag otherwise-unknown residential streets as a permit precinct
      // (authoritative for WHERE permits apply — the specific hour limit still
      // needs the sign, so we don't invent one).
      for (const side of ['left', 'right']) {
        const r = f.properties[side];
        if (r && (r.kind === 'free_limited' || r.kind === 'paid')) r.permitExcepted = true;
      }
      if (f.properties.cat === 'unknown') {
        f.properties.left = { kind: 'residents', permitExcepted: true, zone: 'residential' };
        f.properties.cat = 'residents';
        if (!f.properties.zone) f.properties.zone = 'residential';
      }
      permit++;
    }
  } catch (e) {
    console.log(`  ⚠ permit precincts skipped: ${e.message}`);
  }
  console.log(`  resident permit: ${permit} streets tagged`);

  // 5 ── Metered rate zones (fill remaining unknowns) ──────────────────────────
  // Ticket-parking-rate polygons define WHERE metering applies and at what $/hr.
  // Any street still unclassified inside a priced zone is, where parking is
  // allowed, metered at that rate — so we fill it as a meter (without inventing
  // specific operating hours, which vary per sign).
  console.log('▸ Fetching metered rate zones…');
  let rateFill = 0;
  try {
    const zones = await fetchArcgisAll(`${COS}/Ticket_parking_rates/FeatureServer/0`, { geojson: true });
    const priced = zones
      .map((z) => {
        const m = /\$\s*([\d.]+)/.exec(z.properties?.Tariff1 || '');
        const rings = z.geometry?.type === 'MultiPolygon'
          ? z.geometry.coordinates.flat()
          : z.geometry?.coordinates;
        return m && rings ? { price: parseFloat(m[1]), rings } : null;
      })
      .filter(Boolean);
    for (const f of streets) {
      if (f.properties.cat !== 'unknown' || f.geometry?.type !== 'LineString') continue;
      const [lon, lat] = midpoint(f.geometry.coordinates);
      const zone = priced.find((z) => pointInRings(lon, lat, z.rings));
      if (!zone) continue;
      f.properties.left = { kind: 'paid', zone: 'meter', pricePerHour: zone.price, rateZoneFill: true };
      f.properties.cat = 'paid';
      f.properties.zone = 'meter';
      rateFill++;
    }
  } catch (e) {
    console.log(`  ⚠ rate zones skipped: ${e.message}`);
  }
  console.log(`  metered rate-zone fill: ${rateFill} streets tagged`);

  // ── write ───────────────────────────────────────────────────────────────────
  collection.metadata = collection.metadata || {};
  collection.metadata.generated = new Date().toISOString();
  collection.metadata.enriched = 'City of Sydney + TfNSW open data (meters, loading, free15, permits)';
  writeFileSync(DATA_PATH, JSON.stringify(collection));
  const classified = streets.filter((f) => f.properties.cat !== 'unknown').length;
  console.log(`\n✓ Wrote ${DATA_PATH}`);
  console.log(`  ${classified} classified / ${streets.length} total streets`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
