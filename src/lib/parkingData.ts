import type { ParkingCollection, StreetFeature } from './types';

// Bundled dataset produced by scripts/fetch-parking-data.mjs.
// Regenerate with:  node scripts/fetch-parking-data.mjs --area all
// eslint-disable-next-line @typescript-eslint/no-var-requires
const raw = require('../data/parking.json') as ParkingCollection;

export const parkingData: ParkingCollection = raw;
export const allStreets: StreetFeature[] = raw.features;

/** Streets with explicit parking rules (drawn prominently). */
export const classifiedStreets = allStreets.filter((f) => f.properties.cat !== 'unknown');

/** Base network streets without verified rules (drawn subtly when zoomed in). */
export const unknownStreets = allStreets.filter((f) => f.properties.cat === 'unknown');

const byId = new Map<number, StreetFeature>(allStreets.map((f) => [f.properties.id, f]));
export function streetById(id: number): StreetFeature | undefined {
  return byId.get(id);
}

/** Well-known Sydney locations for search / quick jumps. */
export const PLACES: { name: string; latitude: number; longitude: number }[] = [
  { name: 'Sydney CBD', latitude: -33.8688, longitude: 151.2093 },
  { name: 'Surry Hills', latitude: -33.8845, longitude: 151.212 },
  { name: 'Darlinghurst', latitude: -33.8785, longitude: 151.2199 },
  { name: 'Newtown', latitude: -33.8971, longitude: 151.1793 },
  { name: 'Glebe', latitude: -33.8797, longitude: 151.1862 },
  { name: 'Paddington', latitude: -33.8845, longitude: 151.2269 },
  { name: 'Pyrmont', latitude: -33.8697, longitude: 151.1937 },
  { name: 'Redfern', latitude: -33.8927, longitude: 151.2041 },
  { name: 'Chippendale', latitude: -33.8865, longitude: 151.1985 },
  { name: 'Ultimo', latitude: -33.8785, longitude: 151.1972 },
  { name: 'Potts Point', latitude: -33.8687, longitude: 151.2255 },
  { name: 'Woolloomooloo', latitude: -33.8696, longitude: 151.2195 },
  { name: 'Alexandria', latitude: -33.9036, longitude: 151.1949 },
  { name: 'Erskineville', latitude: -33.9008, longitude: 151.1856 },
  { name: 'Annandale', latitude: -33.8809, longitude: 151.1703 },
  { name: 'Balmain', latitude: -33.8582, longitude: 151.1793 },
  { name: 'Bondi Beach', latitude: -33.8908, longitude: 151.2743 },
  { name: 'Randwick', latitude: -33.9146, longitude: 151.2415 },
  { name: 'North Sydney', latitude: -33.8399, longitude: 151.2073 },
  { name: 'Cremorne', latitude: -33.8285, longitude: 151.2265 },
  { name: 'Neutral Bay', latitude: -33.8317, longitude: 151.2178 },
  { name: 'Kirribilli', latitude: -33.8478, longitude: 151.2166 },
  { name: 'Crows Nest', latitude: -33.8258, longitude: 151.2016 },
  { name: 'Cammeray', latitude: -33.8199, longitude: 151.2138 },
  { name: 'Chatswood', latitude: -33.7969, longitude: 151.1835 },
  { name: 'Bronte', latitude: -33.9036, longitude: 151.2685 },
  { name: 'Bondi Junction', latitude: -33.8916, longitude: 151.2477 },
  { name: 'Mosman', latitude: -33.8279, longitude: 151.2437 },
  { name: 'Coogee', latitude: -33.9199, longitude: 151.2589 },
  { name: 'Kingsford', latitude: -33.9187, longitude: 151.2287 },
  { name: 'Kensington', latitude: -33.9127, longitude: 151.2246 },
  { name: 'Maroubra', latitude: -33.9500, longitude: 151.2380 },
  { name: 'Marrickville', latitude: -33.9108, longitude: 151.1550 },
  { name: 'Dulwich Hill', latitude: -33.9047, longitude: 151.1385 },
  // Woollahra permit zones
  { name: 'Double Bay', latitude: -33.8776, longitude: 151.2430 },
  { name: 'Rose Bay', latitude: -33.8716, longitude: 151.2630 },
  { name: 'Edgecliff', latitude: -33.8766, longitude: 151.2342 },
  { name: 'Darling Point', latitude: -33.8701, longitude: 151.2313 },
  { name: 'Woollahra', latitude: -33.8887, longitude: 151.2362 },
  // Rest of the eastern suburbs — had data via the `east`/`east_north`/
  // `southeast` fetch areas already, but weren't individually searchable
  { name: 'Bondi', latitude: -33.8930, longitude: 151.2650 },
  { name: 'North Bondi', latitude: -33.8884, longitude: 151.2810 },
  { name: 'Tamarama', latitude: -33.9012, longitude: 151.2716 },
  { name: 'Clovelly', latitude: -33.9106, longitude: 151.2624 },
  { name: 'Waverley', latitude: -33.9010, longitude: 151.2560 },
  { name: 'Queens Park', latitude: -33.8949, longitude: 151.2422 },
  { name: 'Centennial Park', latitude: -33.8981, longitude: 151.2342 },
  { name: 'South Coogee', latitude: -33.9280, longitude: 151.2580 },
  { name: 'Malabar', latitude: -33.9670, longitude: 151.2447 },
  { name: 'Matraville', latitude: -33.9601, longitude: 151.2331 },
  { name: 'Chifley', latitude: -33.9645, longitude: 151.2277 },
  { name: 'La Perouse', latitude: -33.9909, longitude: 151.2337 },
  { name: 'Vaucluse', latitude: -33.8577, longitude: 151.2762 },
  { name: 'Watsons Bay', latitude: -33.8407, longitude: 151.2822 },
  { name: 'Point Piper', latitude: -33.8664, longitude: 151.2416 },
  { name: 'Bellevue Hill', latitude: -33.8825, longitude: 151.2521 },
  // Northern Beaches — previously no coverage at all
  { name: 'Manly', latitude: -33.7969, longitude: 151.2884 },
  { name: 'Fairlight', latitude: -33.7969, longitude: 151.2661 },
  { name: 'Balgowlah', latitude: -33.7936, longitude: 151.2593 },
  { name: 'Seaforth', latitude: -33.7994, longitude: 151.2467 },
  { name: 'Freshwater', latitude: -33.7842, longitude: 151.2874 },
  { name: 'Curl Curl', latitude: -33.7712, longitude: 151.2905 },
  { name: 'Brookvale', latitude: -33.7654, longitude: 151.2726 },
  { name: 'Dee Why', latitude: -33.7517, longitude: 151.2861 },
  { name: 'Collaroy', latitude: -33.7328, longitude: 151.3009 },
  { name: 'Narrabeen', latitude: -33.7168, longitude: 151.3016 },
  { name: 'Forestville', latitude: -33.7622, longitude: 151.2158 },
  { name: 'Belrose', latitude: -33.7397, longitude: 151.2185 },
  { name: 'Mona Vale', latitude: -33.6784, longitude: 151.3057 },
  { name: 'Newport', latitude: -33.6558, longitude: 151.3161 },
  { name: 'Avalon Beach', latitude: -33.6355, longitude: 151.3287 },
  { name: 'Palm Beach', latitude: -33.5993, longitude: 151.3243 },
  { name: 'Church Point', latitude: -33.6423, longitude: 151.2839 },
  { name: 'Terrey Hills', latitude: -33.6924, longitude: 151.2313 },
  // Inner West Leichhardt/Balmain permit zones
  { name: 'Leichhardt', latitude: -33.8836, longitude: 151.1567 },
  { name: 'Birchgrove', latitude: -33.8506, longitude: 151.1803 },
  { name: 'Rozelle', latitude: -33.8624, longitude: 151.1695 },
  { name: 'Lilyfield', latitude: -33.8741, longitude: 151.1604 },
  { name: 'Haberfield', latitude: -33.8820, longitude: 151.1387 },
  { name: 'Summer Hill', latitude: -33.8942, longitude: 151.1348 },
  // Ryde
  { name: 'Meadowbank', latitude: -33.8264, longitude: 151.0938 },
  { name: 'West Ryde', latitude: -33.8074, longitude: 151.0810 },
  { name: 'North Ryde', latitude: -33.7949, longitude: 151.1278 },
  { name: 'Gladesville', latitude: -33.8366, longitude: 151.1220 },
  // Lane Cove zones
  { name: 'Lane Cove', latitude: -33.8137, longitude: 151.1668 },
  { name: 'Greenwich', latitude: -33.8360, longitude: 151.1913 },
  // Canada Bay / Five Dock
  { name: 'Five Dock', latitude: -33.8601, longitude: 151.1286 },
  { name: 'Drummoyne', latitude: -33.8535, longitude: 151.1521 },
  // Burwood permit zones
  { name: 'Burwood', latitude: -33.8774, longitude: 151.1030 },
  { name: 'Croydon Park', latitude: -33.8933, longitude: 151.1069 },
  { name: 'Enfield', latitude: -33.8898, longitude: 151.0930 },
  // Hunters Hill
  { name: 'Woolwich', latitude: -33.8393, longitude: 151.1738 },
  { name: 'Hunters Hill', latitude: -33.8318, longitude: 151.1508 },
  // Strathfield permit schemes
  { name: 'Strathfield', latitude: -33.8736, longitude: 151.0917 },
  { name: 'Homebush', latitude: -33.8646, longitude: 151.0865 },
  { name: 'Homebush West', latitude: -33.8686, longitude: 151.0669 },
  // 25km -> 30km ring
  // Parramatta / farwest
  { name: 'Parramatta', latitude: -33.8148, longitude: 151.0011 },
  { name: 'Harris Park', latitude: -33.8225, longitude: 151.0059 },
  { name: 'Granville', latitude: -33.8324, longitude: 151.0093 },
  { name: 'Merrylands', latitude: -33.8347, longitude: 150.9836 },
  { name: 'Guildford', latitude: -33.8578, longitude: 150.9906 },
  { name: 'Westmead', latitude: -33.8064, longitude: 150.9885 },
  { name: 'Toongabbie', latitude: -33.7838, longitude: 150.9648 },
  // The Hills District
  { name: 'Castle Hill', latitude: -33.7315, longitude: 150.9998 },
  { name: 'Baulkham Hills', latitude: -33.7666, longitude: 150.9931 },
  { name: 'Kellyville', latitude: -33.7075, longitude: 150.9502 },
  { name: 'Bella Vista', latitude: -33.7423, longitude: 150.9583 },
  { name: 'Rouse Hill', latitude: -33.6822, longitude: 150.9192 },
  // Bankstown / Padstow
  { name: 'Bankstown', latitude: -33.9174, longitude: 151.0343 },
  { name: 'Padstow', latitude: -33.9502, longitude: 151.0357 },
  { name: 'Revesby', latitude: -33.9524, longitude: 151.0173 },
  { name: 'Panania', latitude: -33.9600, longitude: 150.9987 },
  // Sutherland Shire
  { name: 'Sutherland', latitude: -34.0311, longitude: 151.0578 },
  { name: 'Miranda', latitude: -34.0342, longitude: 151.1027 },
  { name: 'Caringbah', latitude: -34.0453, longitude: 151.1201 },
  { name: 'Cronulla', latitude: -34.0575, longitude: 151.1522 },
  { name: 'Menai', latitude: -34.0167, longitude: 151.0167 },
  { name: 'Engadine', latitude: -34.0656, longitude: 151.0148 },
  { name: 'Sylvania', latitude: -34.0231, longitude: 151.0929 },
  // Hornsby -> Berowra
  { name: 'Hornsby', latitude: -33.7044, longitude: 151.0999 },
  { name: 'Asquith', latitude: -33.6842, longitude: 151.1058 },
  { name: 'Mount Colah', latitude: -33.6716, longitude: 151.1174 },
  { name: 'Berowra', latitude: -33.6247, longitude: 151.1466 },
];

export interface SearchResult {
  label: string;
  sub: string;
  latitude: number;
  longitude: number;
  streetId?: number;
}

/** Simple local search over places and street names. */
export function search(query: string, limit = 8): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const results: SearchResult[] = [];

  for (const p of PLACES) {
    if (p.name.toLowerCase().includes(q)) {
      results.push({ label: p.name, sub: 'Suburb', ...p });
    }
  }

  const seenNames = new Set<string>();
  for (const f of allStreets) {
    const name = f.properties.name;
    if (!name || seenNames.has(name)) continue;
    if (name.toLowerCase().includes(q)) {
      seenNames.add(name);
      const mid = f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)];
      results.push({
        label: name,
        sub: 'Street',
        latitude: mid[1],
        longitude: mid[0],
        streetId: f.properties.id,
      });
      if (results.length >= limit * 2) break;
    }
  }

  // places first, then streets, alphabetical inside groups
  return results
    .sort((a, b) => (a.sub === b.sub ? a.label.localeCompare(b.label) : a.sub === 'Suburb' ? -1 : 1))
    .slice(0, limit);
}
