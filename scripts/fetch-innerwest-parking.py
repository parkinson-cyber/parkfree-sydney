#!/usr/bin/env python3
"""
Inner West Council resident-permit enrichment — Marrickville-area coverage.

Inner West Council's live permit-eligibility lookup tool blocks automated
access (bot-detection / ToS), so it must not be scraped. Instead, this
pipeline sources data from 14 legacy "M-series" parking-area PDF maps
(M1 Permit Parking Area, M2 Permit Parking Area, ... M17) that Inner West
Council/Marrickville Council previously published and which are still
retrievable via the Wayback Machine. Like the Mosman map, these render as
raster street maps with a coloured "Properties Eligible for Parking Permit"
overlay and an orange/black "Permit Holder Excepted" restriction-zone line —
there is no extractable text layer of streets, just labelled roads on the
map image itself.

Because there's no schedule to parse, this pipeline's street lists were
built by rendering each PDF to a high-res PNG (pypdfium2, scale=2.5) and
visually reading which named streets fall inside the shaded eligible-area
polygons / along the restriction lines. That list is committed directly to
scripts/data/innerwest-permit-areas.json — there is no --extract mode here
since there's no machine-readable source to re-scrape; if Inner West Council
ever publishes a real schedule, replace this file's contents and the
apply() step below still works unchanged.

Coverage is intentionally partial: M4, M12, M15 and M18 do not exist in the
source set (skipped), and some individual streets with illegible or
ambiguous labels in the source maps were omitted rather than guessed.

Run:  python3 scripts/fetch-innerwest-parking.py
"""

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "src", "data", "parking.json")
PERMIT_PATH = os.path.join(HERE, "data", "innerwest-permit-areas.json")

# Inner West (Marrickville) LGA bounding box — Marrickville, Dulwich Hill,
# Petersham, Lewisham, Stanmore, Enmore, Newtown-fringe, Camperdown-fringe.
INNERWEST_BBOX = (-33.9300, -33.8930, 151.1300, 151.1850)  # minLat, maxLat, minLon, maxLon

_ABBR = {"st": "street", "rd": "road", "ave": "avenue", "av": "avenue",
         "la": "lane", "ln": "lane", "cr": "crescent", "cres": "crescent",
         "cl": "close", "pl": "place", "pde": "parade", "tce": "terrace",
         "gr": "grove", "hwy": "highway", "blvd": "boulevarde", "cct": "circuit",
         "nth": "north", "sth": "south", "esp": "esplanade", "espl": "esplanade"}


def norm(s):
    s = re.sub(r"\(.*?\)", "", s).lower().strip()
    s = re.sub(r"[^a-z0-9 ]", "", s)
    return " ".join(_ABBR.get(t, t) for t in s.split())


def in_bbox(coords):
    a, b, c, d = INNERWEST_BBOX
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
        if not in_bbox(f["geometry"]["coordinates"]):
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
    _p = "Inner West (Marrickville) resident-permit areas (partial, vision-derived)"
    coll["metadata"]["enriched"] = prev if _p in prev else (prev + " + " + _p).strip(" +")
    coll["metadata"]["generated"] = __import__("datetime").datetime.now().isoformat()
    json.dump(coll, open(DATA_PATH, "w"))

    after = sum(1 for f in streets if f["properties"]["cat"] != "unknown")
    iw = [f for f in streets if in_bbox(f["geometry"]["coordinates"])]
    iwcls = sum(1 for f in iw if f["properties"]["cat"] != "unknown")
    print(f"✓ Inner West enrichment complete: {applied} street segments tagged")
    print(f"  classified {before} -> {after} (+{after - before}) overall")
    if iw:
        print(f"  Inner West LGA: {iwcls}/{len(iw)} = {100 * iwcls / len(iw):.1f}% classified")


if __name__ == "__main__":
    apply()
