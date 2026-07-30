#!/usr/bin/env python3
"""
North Sydney Council resident-permit enrichment — northern coverage.

North Sydney Council publishes NO vector open data (TfNSW Open Data has nothing
for the LGA; their live map is a Cadcorp SIS WebMap viewer whose vector
identify/export API requires admin auth — the rendered layer confirms "Area 23
= No Resident Permits", so that gap is a real absence, not a missing file;
Data.NSW carries only flood studies). The one authoritative, freely
downloadable government source is the council's **Resident Parking Scheme**
documents: 32 per-area PDF maps (areas 1-33, area 23 excluded — it has no
scheme), each carrying a text schedule of the streets in that permit area
under the heading
"The Resident Parking Zones within your area may be in the streets mentioned
below." Every area's boilerplate states the permit "exempts your vehicle from
the time limits and/or meter parking fees" — i.e. permit-holders-excepted,
timed visitor parking for everyone else. That is exactly how the City of Sydney
resident precincts are treated, so we classify matched streets identically:
  {kind: 'residents', zone: 'residential', permitExcepted: true}
which rules.ts evaluates live as free_limited "Timed visitor parking — permit
holders excepted. Check the sign for the limit."

The street→area schedule is extracted once from the PDFs (via `--extract`,
needs pdfplumber) and committed to scripts/data/northsydney-permit-areas.json.
The default run is stdlib-only: it name-joins that schedule onto the OSM street
network within the North Sydney LGA bbox. Only 'unknown' streets are touched, so
CBD-metered spillover and any richer data already present is preserved.

The extractor is column-aware (see extract() below) and cross-validates every
candidate street name against the real OSM network before committing it — an
earlier version used same-line word-clustering that silently fused adjacent
columns' street names together (e.g. "Morton St Gillies St"); that undercounted
matches by ~150 streets across the 32 areas until it was rewritten.

Since 2026-07 this pipeline also carries **metered parking**. The council's
"interactive map of parking meter and Touch n Go locations" page embeds a
public Google My Maps document ("NSC Parking Meters",
mid 16KThCLnxfa0NgZr_qWFb9yd4mm1mI5w) whose KML export lists all 374 machines
(206 Touch N Go + 168 meters) with street name, machine id and exact lat/lon.
Each machine's parking-demand tier (High/Medium/Low → the published hourly
rate) was derived by georeferencing the 383 colour-coded kerb strips in the
council's "map of parking meter rates and demand areas" PDF (download file
3974) onto the machine coordinates — an affine fit refined by iterated
nearest-neighbour least squares converged to a 25 m median residual — then
taking each machine's nearest strip colour (red=High, orange=Medium,
green=Low, per the map legend). One authoritative override: the rates page
states Alfred Street South from Fitzroy Street to the Harbour Bridge is High
(the map confirms — red south of Fitzroy St), so machines there south of
lat -33.8470 are forced High. The distilled result is committed to
scripts/data/northsydney-meters.json; apply() snaps machines onto the street
network and tags those segments paid/meter with pricePerHour + fee hours,
keeping permitExcepted (+ the RPS area number) where the street is also in a
resident-permit schedule.

Run:  python3 scripts/fetch-northsydney-parking.py            # apply (default)
      python3 scripts/fetch-northsydney-parking.py --extract  # re-scrape PDFs
"""

import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "src", "data", "parking.json")
PERMIT_PATH = os.path.join(HERE, "data", "northsydney-permit-areas.json")
METERS_PATH = os.path.join(HERE, "data", "northsydney-meters.json")

# North Sydney LGA bounding box (covers North Sydney, Cammeray, Cremorne,
# Neutral Bay, Kirribilli, Milsons Point, Waverton, Wollstonecraft, Crows Nest,
# St Leonards, Kurraba/Kirribilli points).
NS_BBOX = (-33.860, -33.815, 151.185, 151.230)  # minLat, maxLat, minLon, maxLon

# North Sydney download-file id → resident-parking area number.
ID2AREA = {237: 1, 238: 6, 239: 3, 240: 5, 241: 2, 242: 7, 243: 4, 244: 11,
           245: 9, 246: 13, 247: 17, 248: 8, 249: 10, 250: 15, 251: 22, 252: 16,
           253: 19, 254: 18, 255: 12, 256: 21, 257: 26, 258: 20, 259: 24,
           260: 25, 261: 27, 262: 29, 263: 28, 264: 31, 265: 32, 266: 33,
           267: 30, 268: 14}
FILE_URL = "https://www.northsydney.nsw.gov.au/downloads/file/{id}/x"

_ABBR = {"st": "street", "rd": "road", "ave": "avenue", "av": "avenue",
         "la": "lane", "ln": "lane", "cr": "crescent", "cres": "crescent",
         "cl": "close", "pl": "place", "pde": "parade", "tce": "terrace",
         "gr": "grove", "hwy": "highway", "blvd": "boulevarde", "cct": "circuit",
         "nth": "north", "sth": "south", "esp": "esplanade", "espl": "esplanade",
         "dr": "drive", "gdns": "gardens", "sq": "square", "pwy": "parkway"}


def norm(s):
    """Canonicalise a street name for matching: drop qualifiers, expand types."""
    s = re.sub(r"\(.*?\)", "", s).lower().strip()
    s = re.sub(r"[^a-z0-9 ]", "", s)
    return " ".join(_ABBR.get(t, t) for t in s.split())


def in_ns(coords):
    a, b, c, d = NS_BBOX
    return any(a <= lat <= b and c <= lon <= d for lon, lat in coords)


# ── extraction (--extract): re-scrape the council PDFs ────────────────────────
#
# Each area PDF lays its street schedule out in 2-4 side-by-side text columns
# below an "AREA <n>, ZONE <letter>" header. pdfplumber's extract_words() gives
# word-level boxes but no column/row structure, and a naive same-line
# word-clustering (the original approach here) merges across columns whenever
# two different columns' rows land within a few points of each other vertically
# -- producing garbage like "Morton St Gillies St" (one street's name fused with
# the next column's). The fix: assign every word to a column purely by its x0
# (column gaps run 90-150pt; that's a much wider signal than any cross-row
# jitter), sort each column's own words top-to-bottom, then split that column's
# word stream into street names wherever a street-type suffix (St/Rd/Ave/...)
# is hit -- consuming a trailing direction word ("...St North") or parenthetical
# qualifier ("...Rd (east of Clark Rd)") into the same entry. This also
# transparently repairs names that wrap across two visual lines within a
# column (e.g. "Bay" / "Rd" -> "Bay Rd"), since the column's word stream is
# processed as one continuous sequence regardless of line breaks.
#
# Every extracted candidate is then cross-checked against the real OSM street
# names already in the North Sydney bbox (src/data/parking.json) as a
# correctness signal: exact normalized matches are trusted outright; near-misses
# (a suffix glued onto the previous word with no space, e.g. "ElamangAve", or a
# stray leading/trailing token) are repaired by splitting the glued suffix or
# trimming until a match is found. Candidates that still don't match anything
# are kept (they may be real laneways OSM simply doesn't carry) unless they're
# bare leftover fragments (a lone "St"/"Rd"/single letter) with no street text
# at all, which are dropped as extraction noise.

def extract():
    import subprocess
    import tempfile
    try:
        import pdfplumber
    except ImportError:
        sys.exit("--extract needs pdfplumber:  python3 -m pip install pdfplumber")

    TYPE = (r"(?:St|Rd|Ave|Av|La|Ln|Cr|Cres|Cl|Pl|Pde|Way|Tce|Gr|Walk|Espl|Hwy|"
            r"Blvd|Cct|Row|Mews|Wharf|Steps|Dr|Pwy|Gdns|Sq)")
    DIR = r"(?:Nth|Sth|North|South|East|West)"

    def split_stream(words):
        """Split one column's top-sorted word stream into street-name cells."""
        out, cur = [], []
        i, n = 0, len(words)
        while i < n:
            w = words[i]
            cur.append(w)
            if re.fullmatch(TYPE, w, re.I):
                if i + 1 < n and re.fullmatch(DIR, words[i + 1], re.I):
                    cur.append(words[i + 1]); i += 1
                    out.append(" ".join(cur)); cur = []
                elif i + 1 < n and words[i + 1].startswith("("):
                    i += 1
                    while i < n:
                        cur.append(words[i])
                        done = words[i].endswith(")")
                        i += 1
                        if done: break
                    out.append(" ".join(cur)); cur = []
                    continue
                else:
                    out.append(" ".join(cur)); cur = []
            i += 1
        if cur:
            out.append(" ".join(cur))
        return out

    def extract_area(path):
        page = pdfplumber.open(path).pages[0]
        words = page.extract_words()
        area_hdr = next((w for w in words if w["text"] == "AREA"), None)
        zone_m = None
        if area_hdr:
            zone_m = next((w["text"] for w in words if w["text"] in ("A", "B", "C")
                           and abs(w["top"] - area_hdr["top"]) < 2
                           and w["x0"] > area_hdr["x0"]), None)
            anchor_top = area_hdr["top"]
        else:
            # some areas (e.g. area 5) print the street schedule straight
            # after the boilerplate with no "AREA n, ZONE x" header line --
            # fall back to the phone-number line that ends every area's
            # boilerplate paragraph, and take everything below it.
            phone = next((w for w in words if re.fullmatch(r"\d{4}", w["text"])), None)
            if not phone:
                return None, []
            anchor_top = phone["top"]
        tw = [w for w in words if w["top"] > anchor_top + 5]

        xs = sorted(set(w["x0"] for w in tw))
        bands = []
        for x in xs:
            if not bands or x - bands[-1][-1] > 40:
                bands.append([x])
            else:
                bands[-1].append(x)

        def col_id(x0):
            best_i, best_d = -1, 1e9
            for i, band in enumerate(bands):
                lo, hi = band[0], band[-1]
                d = 0 if lo <= x0 <= hi else min(abs(x0 - lo), abs(x0 - hi))
                if d < best_d:
                    best_d, best_i = d, i
            return best_i

        columns = {}
        for w in tw:
            columns.setdefault(col_id(w["x0"]), []).append(w)

        streets = []
        for cid in sorted(columns):
            col_words = sorted(columns[cid], key=lambda w: w["top"])
            streets.extend(split_stream([w["text"] for w in col_words]))
        return zone_m, streets

    def glue_split(word):
        m = re.search(rf"^(.+?)({TYPE})$", word)
        if m and len(m.group(1)) >= 3 and m.group(1)[0].isupper() and not m.group(1).isupper():
            return [m.group(1), m.group(2)]
        return [word]

    def is_garbage(s):
        toks = s.split()
        return len(toks) == 1 and (bool(re.fullmatch(TYPE, s, re.I)) or len(s) <= 2)

    # real OSM street names already in the NS bbox -- the validation signal
    osm_names = set()
    coll = json.load(open(DATA_PATH))
    for f in coll["features"]:
        name = f["properties"].get("name")
        if name and in_ns(f["geometry"]["coordinates"]):
            osm_names.add(norm(name))

    def reconcile(candidates):
        out = []
        for s in candidates:
            toks = []
            for t in s.split():
                toks.extend(glue_split(t))
            s = " ".join(toks)
            if norm(s) in osm_names:
                out.append(s); continue
            found, n = None, len(toks)
            for trim in range(1, n):
                for k in range(0, trim + 1):
                    lead, trail = k, trim - k
                    cand_toks = toks[lead: n - trail] if trail else toks[lead:]
                    if cand_toks and norm(" ".join(cand_toks)) in osm_names:
                        found = " ".join(cand_toks); break
                if found:
                    break
            if found:
                out.append(found)
            elif not is_garbage(s):
                out.append(s)
        return sorted(set(out))

    result = {}
    with tempfile.TemporaryDirectory() as tmp:
        for fid, area in sorted(ID2AREA.items(), key=lambda kv: kv[1]):
            path = os.path.join(tmp, f"{fid}.pdf")
            subprocess.run(["curl", "-sSL", "--max-time", "60", "-o", path,
                            FILE_URL.format(id=fid)], check=True)
            zone, raw_streets = extract_area(path)
            streets = reconcile(raw_streets)
            result[str(area)] = {"zone": zone, "streets": streets,
                                  "anchor": True, "source": "pdf-extract"}
            print(f"  area {area:2}: {len(streets)} streets")

    os.makedirs(os.path.dirname(PERMIT_PATH), exist_ok=True)
    json.dump(result, open(PERMIT_PATH, "w"), indent=1)
    print(f"\n✓ wrote {PERMIT_PATH}: {len(result)} areas, "
          f"{sum(len(r['streets']) for r in result.values())} street entries")


# ── apply (default): join the schedule onto the network ───────────────────────

# 2026-27 meter rates (incl. GST) from the council rates page; hours are
# Mo-Su 8:30am-6pm daytime and 6pm-midnight evening. pricePerHour carries the
# daytime rate; the fee window runs to midnight either way.
METER_RATES = {"high": 8.95, "medium": 7.40, "low": 4.63}
METER_FEE_INTERVAL = "Mo-Su 08:30-18:00; Mo-Su 18:00-24:00"

_KX = 111320 * math.cos(math.radians(-33.84))  # metres per degree lon at NS
_KY = 110574                                   # metres per degree lat


def _seg_dist_m(lat, lon, coords):
    """Min distance (m) from a point to a lon/lat polyline, equirectangular."""
    px, py = lon * _KX, lat * _KY
    best = float("inf")
    for (lon1, lat1), (lon2, lat2) in zip(coords, coords[1:]):
        ax, ay = lon1 * _KX, lat1 * _KY
        bx, by = lon2 * _KX, lat2 * _KY
        dx, dy = bx - ax, by - ay
        ll = dx * dx + dy * dy
        t = 0.0 if ll == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ll))
        best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return best


def _resident_rule(area, zone):
    return {"kind": "residents", "zone": "residential", "permitExcepted": True,
            "permitArea": area, "permitZone": zone}


def apply():
    permit = json.load(open(PERMIT_PATH))
    pmap = {}
    for area, r in permit.items():
        for s in r["streets"]:
            n = norm(s)
            if n and n not in pmap:
                pmap[n] = (int(area), r["zone"])

    coll = json.load(open(DATA_PATH))
    streets = coll["features"]
    before = sum(1 for f in streets if f["properties"]["cat"] != "unknown")

    # -- meters: snap each machine's kerb onto the street network -------------
    # A segment is metered if a machine sits within 60 m and shares its street
    # name, or within 25 m regardless of name (corner machines otherwise bleed
    # onto the cross street). Metered kerbs are the on-street truth, so they
    # may claim segments this script previously tagged 'residents' (every
    # residents tag inside NS_BBOX is ours) — the RPS boilerplate says permits
    # exempt holders from meter fees, so those keep permitExcepted + area.
    machines = json.load(open(METERS_PATH))["machines"]
    metered = 0
    for f in streets:
        p = f["properties"]
        if p["cat"] not in ("unknown", "residents", "paid"):
            continue
        coords = f["geometry"]["coordinates"]
        if not in_ns(coords):
            continue
        fname = norm(p.get("name") or "")
        hit = None
        hd = float("inf")
        for m in machines:
            d = _seg_dist_m(m["lat"], m["lon"], coords)
            if d < hd and (d <= 25 or (d <= 60 and fname and fname == norm(m["street"]))):
                hd, hit = d, m
        if not hit:
            continue
        rule = {"kind": "paid", "zone": "meter", "feeInterval": METER_FEE_INTERVAL,
                "cutOffMin": 1440, "pricePerHour": METER_RATES[hit["tier"]]}
        if fname in pmap:
            area, zone = pmap[fname]
            rule.update({"permitExcepted": True, "permitArea": area, "permitZone": zone})
        p["left"] = dict(rule)
        p["right"] = dict(rule)
        p["cat"] = "paid"
        p["zone"] = "meter"
        metered += 1

    applied = 0
    for f in streets:
        p = f["properties"]
        if p["cat"] != "unknown" or not p.get("name"):
            continue
        if not in_ns(f["geometry"]["coordinates"]):
            continue
        n = norm(p["name"])
        if n in pmap:
            area, zone = pmap[n]
            rule = _resident_rule(area, zone)
            p["left"] = dict(rule)
            p["right"] = dict(rule)
            p["cat"] = "residents"
            p["zone"] = "residential"
            applied += 1

    # refresh area/zone on residents segments tagged by an earlier run (which
    # discarded the pair) without re-touching anything that isn't ours
    refreshed = 0
    for f in streets:
        p = f["properties"]
        if p["cat"] != "residents" or not p.get("name"):
            continue
        if not in_ns(f["geometry"]["coordinates"]):
            continue
        n = norm(p["name"])
        if n in pmap and not (p.get("left") or {}).get("permitArea"):
            area, zone = pmap[n]
            for side in ("left", "right"):
                if p.get(side, {}).get("kind") == "residents":
                    p[side].update({"permitArea": area, "permitZone": zone})
            refreshed += 1

    coll.setdefault("metadata", {})
    prev = coll["metadata"].get("enriched", "")
    for phrase in ("North Sydney resident-permit areas",
                   "North Sydney meters (rates & demand areas)"):
        if phrase not in prev:
            prev = (prev + " + " + phrase).strip(" +")
    coll["metadata"]["enriched"] = prev
    coll["metadata"]["generated"] = __import__("datetime").datetime.now().isoformat()
    json.dump(coll, open(DATA_PATH, "w"))

    after = sum(1 for f in streets if f["properties"]["cat"] != "unknown")
    ns = [f for f in streets if in_ns(f["geometry"]["coordinates"])]
    nscls = sum(1 for f in ns if f["properties"]["cat"] != "unknown")
    print(f"✓ North Sydney enrichment complete: {metered} metered + {applied} resident segments tagged")
    print(f"  ({refreshed} existing resident segments back-filled with permit area numbers)")
    print(f"  classified {before} -> {after} (+{after - before}) overall")
    print(f"  North Sydney LGA: {nscls}/{len(ns)} = {100 * nscls / len(ns):.1f}% classified")


if __name__ == "__main__":
    if "--extract" in sys.argv:
        extract()
    else:
        apply()
