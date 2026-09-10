#!/usr/bin/env node
/**
 * Council-run off-street car parks, with the details that decide where you park:
 * how long you get free, when, what it costs after that, and the daily cap.
 *
 * This is the answer to "3 hours free at Cremorne, 2 hours in Crows Nest" —
 * information that exists only as prose on council web pages, not in any open
 * data feed. Each council here is scraped from its own published pages and
 * normalised into src/data/council-carparks.json, which the app bundles.
 *
 *   North Sydney  the Council car parks directory (11 records). Locations come
 *                 from the council's own Google My Map; hours, free periods,
 *                 fees, accessible bays, EV chargers and clearance come from
 *                 each directory record's definition list.
 *   City of Sydney  the ArcGIS "Council car parks" layer — names, operators and
 *                 phone numbers only; CoS publishes no rates, so `free` is left
 *                 null rather than guessed.
 *
 * The free window is parsed into the same OSM-ish interval strings the rules
 * engine already understands ("Mo-Fr 08:00-18:00"), so the app can say
 * "3 hours free right now" rather than only quoting the sign text.
 *
 * Run:  node scripts/fetch-council-carparks.mjs         (refetch + write)
 *       node scripts/fetch-council-carparks.mjs --check (no write; print diff)
 */

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'data', 'council-carparks.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';

const get = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
};

// ---------------------------------------------------------------- text utils

const unent = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;| /g, ' ');

function clean(html) {
  let s = unent(unent(html));
  s = s.replace(/<li>/g, '\n• ').replace(/<\/p>|<br\s*\/?>/g, '\n');
  s = s.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ');
  return s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n').trim();
}

const DAY_WORDS = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0,
};
const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** "8.30am"/"12 noon"/"6pm" -> "08:30" */
function toHHMM(text) {
  const t = text.toLowerCase().replace(/\s+/g, '');
  if (/^12noon|^noon/.test(t)) return '12:00';
  if (/^midnight/.test(t)) return '24:00';
  const m = t.match(/^(\d{1,2})[.:]?(\d{2})?(am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (m[3] === 'pm' && h !== 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Contiguous day list -> "Mo-Fr"; scattered -> "Mo,Tu,We,Fr". */
function daySpec(days) {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (!set.length) return 'Mo-Su';
  const contiguous = set.every((d, i) => i === 0 || d === set[i - 1] + 1);
  if (set.length > 2 && contiguous) return `${DAY_ABBR[set[0]]}-${DAY_ABBR[set[set.length - 1]]}`;
  return set.map((d) => DAY_ABBR[d]).join(',');
}

/**
 * Parse a council's free-parking prose into intervals.
 * "Monday to Friday - 8am to 6pm" / "Saturdays - 8.30am to 12.30pm" /
 * "Monday, Tuesday, Wednesday, and Friday - from 8am to 6pm"
 */
function parseWindows(text) {
  const windows = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^•\s*/, '').trim();
    const time = line.match(/(\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm)?|12\s*noon)\s*(?:-|–|to|and)\s*(\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm)|12\s*noon|midnight)/i);
    if (!time) continue;
    const start = toHHMM(time[1]);
    const end = toHHMM(time[2]);
    if (!start || !end) continue;
    const before = line.slice(0, time.index).toLowerCase();
    const days = [];
    const range = before.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?:to|-|–)\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (range) {
      for (let d = DAY_WORDS[range[1]]; ; d = (d + 1) % 7) {
        days.push(d);
        if (d === DAY_WORDS[range[2]]) break;
      }
    } else {
      for (const [word, n] of Object.entries(DAY_WORDS)) {
        if (new RegExp(`${word}s?\\b`).test(before)) days.push(n);
      }
    }
    windows.push(`${daySpec(days)} ${start}-${end}`);
  }
  return windows;
}

/**
 * "Three-hours of free parking" / "Free two-hours" / "Free 90-minute" -> minutes.
 *
 * Only counts free parking anyone can use. Ridge Street's "free 90 minutes"
 * is for registered residents and the car park is paid for everyone else —
 * showing that as free would send drivers to a $10 first hour.
 */
function parseFreeMinutes(text) {
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const t = text
    .toLowerCase()
    .split('\n')
    .filter((line) => !/resident|permit holder/.test(line))
    .join('\n');
  const mins = t.match(/free\s+(\d{1,3})[- ]minutes?|(\d{1,3})[- ]minutes? of free/);
  if (mins) return parseInt(mins[1] ?? mins[2], 10);
  const wordHr = t.match(/(one|two|three|four|five|six)[- ]hours?[^.]{0,20}free|free\s+(one|two|three|four|five|six)[- ]hours?/);
  if (wordHr) return words[wordHr[1] ?? wordHr[2]] * 60;
  const numHr = t.match(/free\s+(?:parking\s+for\s+)?(\d{1,2})\s*hours?|(\d{1,2})\s*hours?\s+free/);
  if (numHr) return parseInt(numHr[1] ?? numHr[2], 10) * 60;
  if (/free parking for one hour|one hour(?:'s)? free/.test(t)) return 60;
  return null;
}

// ---------------------------------------------------------------- councils

async function northSydney() {
  // Locations from the council's own map, details from each directory record.
  const kml = await get('https://www.google.com/maps/d/kml?mid=1fZHsL9to1W7fRF2pGL4Ese_nn2LIx-Q&forcekml=1');
  const places = [...kml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)].map((m) => {
    const b = m[1];
    const name = unent((b.match(/<name>([\s\S]*?)<\/name>/) || [])[1] || '').trim();
    const coords = (b.match(/<coordinates>([\s\S]*?)<\/coordinates>/) || [])[1] || '';
    const rec = (b.match(/directory-record\/(\d+)\//) || [])[1];
    const [lon, lat] = coords.trim().split(',').map(Number);
    return { name, lat, lon, rec };
  }).filter((p) => p.rec);

  const out = [];
  for (const place of places) {
    const html = await get(`https://www.northsydney.nsw.gov.au/directory-record/${place.rec}/x`);
    const fields = {};
    for (const m of html.matchAll(/<dt class="definition__heading">\s*([\s\S]*?)\s*<\/dt>[\s\S]*?<dd class="definition__content[^"]*">([\s\S]*?)<\/dd>/g)) {
      const k = clean(m[1]);
      const v = clean(m[2]);
      if (k && v && k !== 'Location') fields[k] = v;
    }
    const dropResident = (text) => text
      .split('\n')
      .filter((line) => !/resident|permit holder/i.test(line))
      .join('\n');
    const restrictions = dropResident(fields['Parking restrictions'] || '');
    const fees = fields['Fees and charges'] || '';
    const freeText = restrictions || fees;
    const freeMinutes = parseFreeMinutes(freeText);
    const windows = restrictions ? parseWindows(restrictions) : [];
    // "Parking is free all day Sunday" / "free all day Saturday and Sunday"
    const allDay = [];
    const allDayMatch = fees.match(/free all day ([^.\n]+)/i) || restrictions.match(/free all day ([^.\n]+)/i);
    if (allDayMatch) {
      for (const [word, n] of Object.entries(DAY_WORDS)) {
        if (new RegExp(`${word}`, 'i').test(allDayMatch[1])) allDay.push(DAY_ABBR[n]);
      }
    }
    out.push({
      id: `nsc-${place.rec}`,
      name: place.name.replace(/\s*-\s*Council car parks.*$/, ''),
      council: 'North Sydney',
      address: fields.Address || null,
      latitude: place.lat,
      longitude: place.lon,
      openingHours: fields['Opening hours'] || null,
      freeMinutes,
      freeWindows: windows,
      // stated verbatim so the app can show who a residents-only free period
      // is actually for, rather than silently dropping it
      residentsOnlyNote: /resident/i.test(fields['Fees and charges'] || fields['Parking restrictions'] || '')
        ? (fields['Fees and charges'] || fields['Parking restrictions'] || '')
            .split('\n').filter((l) => /resident/i.test(l)).join(' ').slice(0, 200)
        : null,
      freeAllDay: allDay,
      unrestrictedOutside: /all other hours are unrestricted/i.test(restrictions),
      feesText: fees || null,
      restrictionsText: restrictions || null,
      accessibleSpaces: fields['Accessible spaces'] || null,
      evCharging: fields['Electric charging bays'] || null,
      clearanceHeight: fields['Clearance height'] || null,
      url: `https://www.northsydney.nsw.gov.au/directory-record/${place.rec}/x`,
    });
  }
  return out;
}

async function kuringGai() {
  // Ku-ring-gai runs no resident parking scheme and publishes no sign register,
  // so its streets stay unknown - but its council car parks are mapped, with
  // space counts and what each one serves. For Roseville, Lindfield, Gordon and
  // St Ives that is the only council parking data that exists.
  const url = 'https://services7.arcgis.com/iKtcKBgui9r9RlAJ/arcgis/rest/services'
    + '/Council_Assets/FeatureServer/2/query?where=1%3D1&outFields=*&outSR=4326&f=geojson';
  const gj = JSON.parse(await get(url));
  return gj.features.filter((f) => f.geometry).map((f) => {
    const p = f.properties;
    // polygons: use the centroid of the outer ring
    const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0]
      : f.geometry.coordinates[0][0];
    const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    const spaces = (p.Spaces || '').trim();
    return {
      id: `krg-${p.OBJECTID}`,
      name: (p.Name || p.LMU_Location || 'Council car park').replace(/\s*-\s*CP\d+$/, '').trim(),
      council: 'Ku-ring-gai',
      address: (p.LMU_Location || '').trim() || null,
      latitude: lat,
      longitude: lon,
      openingHours: null,
      // Ku-ring-gai publishes no rates or time limits for these - the limit is
      // on the sign at the entrance. Saying nothing beats inventing a number.
      freeMinutes: null,
      freeWindows: [],
      freeAllDay: [],
      unrestrictedOutside: false,
      feesText: null,
      restrictionsText: [spaces, (p.Description || '').trim()].filter(Boolean).join(' · ') || null,
      accessibleSpaces: /disabled/i.test(spaces) ? spaces : null,
      evCharging: null,
      clearanceHeight: null,
      url: 'https://www.krg.nsw.gov.au/Community/Streets-and-transport/Parking/Car-parks',
    };
  });
}

async function cityOfSydney() {
  // CoS publishes locations and operators but NOT rates — so no free/fee data
  // is invented here; the app shows the operator and says to check on site.
  const url = 'https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Council_car_parks/FeatureServer/0/query'
    + '?where=1%3D1&outFields=*&outSR=4326&f=geojson';
  const gj = JSON.parse(await get(url));
  return gj.features.filter((f) => f.geometry).map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    return {
      id: `cos-${p.OBJECTID}`,
      name: p.CarParkName,
      council: 'City of Sydney',
      address: [p.Street, p.Suburb].filter(Boolean).join(', ') || null,
      latitude: lat,
      longitude: lon,
      openingHours: null,
      freeMinutes: null,
      freeWindows: [],
      freeAllDay: [],
      unrestrictedOutside: false,
      feesText: null,
      restrictionsText: null,
      operator: p.Operator || null,
      phone: p.ContactPhoneNumber || null,
      accessibleSpaces: null,
      evCharging: null,
      clearanceHeight: null,
      url: 'https://www.cityofsydney.nsw.gov.au/parking/parking-stations',
    };
  });
}

// ---------------------------------------------------------------- main

const carParks = [...(await northSydney()), ...(await kuringGai()), ...(await cityOfSydney())]
  .sort((a, b) => a.council.localeCompare(b.council) || a.name.localeCompare(b.name));

const feed = {
  generated: new Date().toISOString(),
  source: 'North Sydney Council car parks directory + Ku-ring-gai Council_Assets carparks layer '
    + '+ City of Sydney ArcGIS "Council car parks". Free periods, fees and hours are quoted from '
    + "each council's own page; Ku-ring-gai and City of Sydney publish no rates, so theirs are left blank.",
  carParks,
};

const withFree = carParks.filter((c) => c.freeMinutes);
if (process.argv.includes('--check')) {
  const prev = JSON.parse(await readFile(OUT, 'utf8')).carParks;
  const changed = JSON.stringify(prev.map(({ ...c }) => c)) !== JSON.stringify(carParks);
  console.log(`${carParks.length} car parks, ${withFree.length} with a free period; changed: ${changed}`);
} else {
  await writeFile(OUT, JSON.stringify(feed, null, 1));
  console.log(`✓ ${carParks.length} council car parks -> src/data/council-carparks.json`);
  for (const c of withFree) {
    console.log(`   ${c.freeMinutes >= 60 ? `${c.freeMinutes / 60}h` : `${c.freeMinutes}m`} free · ${c.name} · ${c.freeWindows.join('; ') || c.freeAllDay.join(',') || 'hours per council page'}`);
  }
}
