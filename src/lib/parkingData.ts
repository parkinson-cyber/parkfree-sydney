import type { ParkingCollection, StreetFeature } from './types';
import { loadClassified, loadUnknown } from './parkingSource';

// Dataset produced by scripts/fetch-parking-data.mjs.
// Regenerate with:  node scripts/fetch-parking-data.mjs --area all
//
// These arrays start empty and are *filled* by loadParkingData() rather than
// reassigned. That keeps every `import { allStreets }` in the app pointing at
// the same array it always did, so nothing downstream had to change when the
// web build stopped bundling the data and started fetching it. Call
// loadParkingData() before rendering anything that reads them — App.tsx does.

export const allStreets: StreetFeature[] = [];

/** Streets with explicit parking rules (drawn prominently). */
export const classifiedStreets: StreetFeature[] = [];

/** Base network streets without verified rules (drawn subtly when zoomed in). */
export const unknownStreets: StreetFeature[] = [];

/** Dataset metadata; null until the first load resolves. */
export const parkingData: { metadata: ParkingCollection['metadata'] | null } = { metadata: null };

const byId = new Map<number, StreetFeature>();
export function streetById(id: number): StreetFeature | undefined {
  return byId.get(id);
}

function ingest(features: StreetFeature[]): void {
  for (const f of features) {
    allStreets.push(f);
    (f.properties.cat === 'unknown' ? unknownStreets : classifiedStreets).push(f);
    byId.set(f.properties.id, f);
    indexSuburb(f);
  }
}

/** Notified when the grey base network arrives after the rules. */
const listeners = new Set<() => void>();
export function onParkingDataChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let loading: Promise<void> | null = null;

/**
 * Resolves as soon as the streets with rules are in — the map is useful at
 * that point. The base network keeps loading in the background and fires the
 * listeners when it lands; a failure there leaves the app working with rules
 * only, which is the right trade rather than blocking on 2.8 MB of grey.
 */
export function loadParkingData(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const { features, metadata } = await loadClassified();
      ingest(features);
      parkingData.metadata = metadata;

      loadUnknown()
        .then((rest) => {
          ingest(rest);
          for (const fn of listeners) fn();
        })
        .catch(() => {
          /* rules still work without the base network */
        });
    })();
  }
  return loading;
}


// ─── search ──────────────────────────────────────────────────────────────────
//
// Two things people type into a map app: a street, or a place. Until now only
// streets really worked — "places" were a hand-typed list of 130 names that
// went stale the moment the dataset grew past them, and a street result could
// not say which suburb it was in, so eleven Alfred Streets came back as eleven
// identical rows. Both are fixed by the same fact: every street now carries
// its gazetted suburb (scripts/fetch-suburbs.py).
//
// So the index is the 498 real suburbs, and a street is identified by its
// name *and* its suburb — which is how anyone would say it out loud.

import { featureMidpoint } from './geo';
import { ALIASES, SUBURBS, suburbByName, type Suburb } from './suburbs';

export type SearchKind = 'suburb' | 'street';

export interface SearchResult {
  kind: SearchKind;
  /** What the row says: "Chatswood" or "Alfred Street". */
  label: string;
  /** The line under it: the suburb for a street, the postcode for a suburb. */
  sub: string;
  latitude: number;
  longitude: number;
  /** Suburbs carry their extent so the map frames the whole place. */
  bbox?: [number, number, number, number];
  /** Streets carry an id so selecting one opens its rules. */
  streetId?: number;
  suburb?: string;
}

/** Streets grouped by suburb, built as the data lands. */
const bySuburb = new Map<string, StreetFeature[]>();

function indexSuburb(f: StreetFeature): void {
  const sub = f.properties.sub;
  if (!sub) return;
  const list = bySuburb.get(sub);
  if (list) list.push(f);
  else bySuburb.set(sub, [f]);
}

/** Every street in a suburb, classified and unknown alike. */
export function streetsInSuburb(name: string): StreetFeature[] {
  return bySuburb.get(name) ?? [];
}

const normalise = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * How well `hay` answers `needle`: 0 exact, 1 starts with, 2 starts a word,
 * 3 appears somewhere, −1 not at all. Lower is better, so a search for "bond"
 * puts Bondi above Carrington *Bond*s Road.
 */
function rank(hay: string, needle: string): number {
  if (hay === needle) return 0;
  if (hay.startsWith(needle)) return 1;
  if (hay.includes(` ${needle}`)) return 2;
  if (hay.includes(needle)) return 3;
  return -1;
}

function suburbLine(s: Suburb): string {
  const parts: string[] = [];
  if (s.postcode) parts.push(String(s.postcode));
  parts.push(
    s.classified > 0
      ? `${s.classified.toLocaleString()} street${s.classified === 1 ? '' : 's'} with rules`
      : 'no published rules yet',
  );
  return `Suburb · ${parts.join(' · ')}`;
}

function suburbResult(s: Suburb): SearchResult {
  return {
    kind: 'suburb',
    label: s.name,
    sub: suburbLine(s),
    latitude: s.latitude,
    longitude: s.longitude,
    bbox: s.bbox,
    suburb: s.name,
  };
}

/**
 * Split "crown street surry hills" into a street part and a suburb part.
 *
 * The longest trailing run of words that names a real suburb wins — "alfred
 * street milsons point" splits after "street", and "milsons point" on its own
 * stays a suburb search because the street half comes back empty.
 *
 * There is no special case for a comma, and there must not be one: `normalise`
 * has already turned every comma into a space by the time this runs, so a
 * comma branch here would be unreachable code describing behaviour that does
 * not exist. "Alfred Street, Milsons Point" is handled by the loop below like
 * any other phrasing.
 */
function splitQuery(q: string): { street: string; suburb: Suburb | null } {
  const words = q.split(' ');
  for (let i = 0; i < words.length; i++) {
    const tail = words.slice(i).join(' ');
    const named = suburbByName(tail) ?? suburbByName(ALIASES[tail] ?? '');
    if (named) return { street: words.slice(0, i).join(' '), suburb: named };
  }
  return { street: q, suburb: null };
}

/**
 * Local search over suburbs and street names.
 *
 * Suburbs come first when the query names one, because "Chatswood" means
 * "take me to Chatswood" far more often than it means Chatswood Avenue in
 * Pymble. Streets are keyed by name *and* suburb, so the eleven Alfred
 * Streets are eleven distinguishable rows rather than one arbitrary winner.
 */
export function search(query: string, limit = 12): SearchResult[] {
  const q = normalise(query);
  if (q.length < 2) return [];

  const { street: streetQ, suburb: scope } = splitQuery(q);

  // 1. Suburbs. A postcode typed on its own is a suburb search too.
  const subHits: { r: SearchResult; score: number }[] = [];
  const aliased = ALIASES[q];
  for (const s of SUBURBS) {
    let score = rank(s.name.toLowerCase(), q);
    if (aliased && s.name === aliased) score = 0;
    if (score < 0 && /^\d{4}$/.test(q) && String(s.postcode) === q) score = 1;
    if (score < 0) continue;
    // A suburb nobody has rules for is still worth offering — the map shows
    // the grey base network there — but it ranks below one that has them.
    subHits.push({ r: suburbResult(s), score: score * 2 + (s.classified > 0 ? 0 : 1) });
  }
  subHits.sort((a, b) => a.score - b.score || a.r.label.localeCompare(b.r.label));

  // 2. Streets. Scoped to the named suburb when the query carried one.
  const pool = scope ? streetsInSuburb(scope.name) : allStreets;
  const needle = scope ? streetQ : q;
  const seen = new Map<string, number>();
  const streetHits: { r: SearchResult; score: number }[] = [];

  if (needle.length >= 2 || (scope && needle.length === 0)) {
    for (const f of pool) {
      const name = f.properties.name;
      if (!name) continue;
      const score = needle ? rank(normalise(name), needle) : 1;
      if (score < 0) continue;
      const key = `${name}|${f.properties.sub ?? ''}`;
      if (seen.has(key)) continue;
      seen.set(key, 1);
      // The middle of the street, not its middle vertex. This was the last
      // place still doing `coords[len / 2]` after geo.ts stopped: picking a
      // search result flew the map to the end of a long street, which is the
      // very bug the midpoint helper exists to prevent.
      const mid = featureMidpoint(f);
      streetHits.push({
        r: {
          kind: 'street',
          label: name,
          sub: f.properties.sub ?? 'Sydney',
          latitude: mid.latitude,
          longitude: mid.longitude,
          streetId: f.properties.id,
          suburb: f.properties.sub,
        },
        // A street whose rules are known is the useful answer; a grey one is
        // still offered, just not ahead of it.
        score: score * 2 + (f.properties.cat === 'unknown' ? 1 : 0),
      });
      if (streetHits.length > limit * 20) break;
    }
  }
  streetHits.sort((a, b) => a.score - b.score || a.r.label.localeCompare(b.r.label));

  // A query that named a suburb and nothing else leads with the suburb; one
  // that named a street inside it leads with the streets.
  const suburbsFirst = !scope || streetQ.length === 0;
  const head = suburbsFirst ? subHits : streetHits;
  const tail = suburbsFirst ? streetHits : subHits;
  const keep = Math.min(head.length, suburbsFirst ? 4 : limit);

  return [...head.slice(0, keep), ...tail]
    .slice(0, limit)
    .map((h) => h.r);
}
