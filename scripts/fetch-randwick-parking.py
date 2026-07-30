#!/usr/bin/env python3
"""
Randwick City Council resident-permit enrichment — eastern suburbs coverage.

Randwick publishes 27+ Resident Parking Scheme area maps (RA*, CO*, KF*
prefixes for Randwick/Coogee/Kingsford) as PDFs, downloaded via the browser
(the site sits behind Cloudflare bot-protection that blocks plain curl/requests
— a real browser session is required to fetch them).

Unlike North Sydney's maps, Randwick's PDFs have no clean text schedule: street
labels are real text characters, but each one is individually rotated to run
along its street on the map (GIS/ArcMap export), so simple word-extraction
interleaves and garbles adjacent labels. Angle-bucketed reconstruction
(grouping characters by rotation angle, then re-sorting along the rotated
text-flow axis) recovers some labels cleanly but not reliably across all 9
sampled maps — recall was too low to trust unsupervised.

Given that, the street list here was built by rendering each area PDF to a
high-res PNG (pypdfium2, scale=2.5) and visually reading the named streets
inside each shaded "Resident parking area" polygon (the maps distinguish this
from "Resident parking zone" — the blue-line-marked, currently-signposted
streets — but the area boundary is what a permit is valid across, so that's
what's captured). That list is committed directly to
scripts/data/randwick-permit-areas.json; there is no --extract mode since
there's no machine-readable source to re-scrape reliably. Coverage is 9 of the
~27+ published areas (RA1, RA5, RA7, RA10, CO1, CO2, CO3, CO5, KF2) — the ones
fetched and read in this pass; more can be added the same way.

Run:  python3 scripts/fetch-randwick-parking.py
"""

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "src", "data", "parking.json")
PERMIT_PATH = os.path.join(HERE, "data", "randwick-permit-areas.json")

# Randwick LGA bounding box (covers Bondi, Coogee, Kingsford, Maroubra, Randwick, Centennial Park)
RANDWICK_BBOX = (-33.9307, -33.8900, 151.2470, 151.2776)  # minLat, maxLat, minLon, maxLon

_ABBR = {"st": "street", "rd": "road", "ave": "avenue", "av": "avenue",
         "la": "lane", "ln": "lane", "cr": "crescent", "cres": "crescent",
         "cl": "close", "pl": "place", "pde": "parade", "tce": "terrace",
         "gr": "grove", "hwy": "highway", "blvd": "boulevarde", "cct": "circuit",
         "nth": "north", "sth": "south", "esp": "esplanade", "espl": "esplanade"}


def norm(s):
    """Canonicalise a street name for matching."""
    s = re.sub(r"\(.*?\)", "", s).lower().strip()
    s = re.sub(r"[^a-z0-9 ]", "", s)
    return " ".join(_ABBR.get(t, t) for t in s.split())


def in_randwick(coords):
    a, b, c, d = RANDWICK_BBOX
    return any(a <= lat <= b and c <= lon <= d for lon, lat in coords)


def apply():
    permit = json.load(open(PERMIT_PATH))
    pmap = {}
    for area, r in permit.items():
        for s in r["streets"]:
            n = norm(s)
            if n and n not in pmap:
                pmap[n] = (area, r["zone"])

    coll = json.load(open(DATA_PATH))
    streets = coll["features"]
    before = sum(1 for f in streets if f["properties"]["cat"] != "unknown")

    applied = 0
    for f in streets:
        p = f["properties"]
        if p["cat"] != "unknown" or not p.get("name"):
            continue
        if not in_randwick(f["geometry"]["coordinates"]):
            continue
        if norm(p["name"]) in pmap:
            rule = {"kind": "residents", "zone": "residential", "permitExcepted": True}
            p["left"] = dict(rule)
            p["right"] = dict(rule)
            p["cat"] = "residents"
            p["zone"] = "residential"
            applied += 1

    coll.setdefault("metadata", {})
    prev = coll["metadata"].get("enriched", "")
    _p = "Randwick resident-permit areas (partial, vision-derived)"
    coll["metadata"]["enriched"] = prev if _p in prev else (prev + " + " + _p).strip(" +")
    coll["metadata"]["generated"] = __import__("datetime").datetime.now().isoformat()
    json.dump(coll, open(DATA_PATH, "w"))

    after = sum(1 for f in streets if f["properties"]["cat"] != "unknown")
    rw = [f for f in streets if in_randwick(f["geometry"]["coordinates"])]
    rwcls = sum(1 for f in rw if f["properties"]["cat"] != "unknown")
    print(f"✓ Randwick enrichment complete: {applied} street segments tagged")
    print(f"  classified {before} -> {after} (+{after - before}) overall")
    print(f"  Randwick LGA: {rwcls}/{len(rw)} = {100 * rwcls / len(rw):.1f}% classified")


if __name__ == "__main__":
    apply()
