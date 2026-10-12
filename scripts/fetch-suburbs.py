#!/usr/bin/env python3
"""
Suburb boundaries → a searchable suburb index, and a suburb name on every street.

WHY THIS EXISTS
The search bar could only find suburbs from a hand-typed list of ~130 names in
`parkingData.ts`, and a street result could not say which suburb it was in —
so "Alfred Street" offered eleven identical rows across Sydney and no way to
tell them apart. Both problems are the same missing fact: which suburb a
street is in.

SOURCE
NSW Spatial Services, *NSW Administrative Boundaries Theme* → layer 2
`Suburb` — the state's own gazetted suburb/locality polygons, carrying
`suburbname` and `postcode`. Licensed CC BY 4.0. This is the authoritative
answer to "what suburb is this", not a guess from the nearest place name, and
the postcode it carries is what lets the Opal bus tap data (reported by
postcode) join onto the street network — see scripts/fetch-opal-demand.py.

A street is assigned to the suburb whose polygon contains its midpoint. A
street that straddles a boundary gets the suburb of its middle, which is what
a person would say if you asked them. No nearest-centroid fallback: a street
outside every polygon is left without a suburb rather than given a wrong one.

The downloaded polygons are simplified and committed to
`scripts/data/suburbs-nsw.json` so the assignment is re-derivable with no
network, like every other overlay in this pipeline.

Run:  python3 scripts/fetch-suburbs.py            # offline, from the committed file
      python3 scripts/fetch-suburbs.py --refresh  # re-download from NSW Spatial
"""

import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "src", "data", "parking.json")
BOUNDARIES = os.path.join(HERE, "data", "suburbs-nsw.json")
INDEX_OUT = os.path.join(HERE, "..", "src", "data", "suburbs.json")

SERVICE = (
    "https://portal.spatial.nsw.gov.au/server/rest/services/"
    "NSW_Administrative_Boundaries_Theme/MapServer/2/query"
)
# The 30 km disc the parking dataset covers, as an envelope with a little slack
# so a suburb that only clips the edge still comes back whole.
BBOX = "150.86,-34.17,151.57,-33.57"
PAGE = 200

# ~0.00025° ≈ 25 m. A suburb boundary is being used to answer "which suburb is
# this street in", so 25 m of slop costs nothing and takes the committed file
# from 18 MB to something a repo should carry.
SIMPLIFY_DEG = 0.00025
PRECISION = 5  # ~1.1 m


# ─── geometry ────────────────────────────────────────────────────────────────

def rdp(points, eps):
    """Ramer–Douglas–Peucker, iterative so a 20k-vertex coastline can't blow
    the recursion limit."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi <= lo + 1:
            continue
        ax, ay = points[lo]
        bx, by = points[hi]
        dx, dy = bx - ax, by - ay
        norm2 = dx * dx + dy * dy
        worst, worst_i = -1.0, -1
        for i in range(lo + 1, hi):
            px, py = points[i]
            if norm2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / norm2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > worst:
                worst, worst_i = d, i
        if worst > eps:
            keep[worst_i] = True
            stack.append((lo, worst_i))
            stack.append((worst_i, hi))
    return [p for p, k in zip(points, keep) if k]


def rings_of(geom):
    """Every outer-or-inner ring of a (Multi)Polygon, as coordinate lists.

    Holes are kept: an even-odd point-in-polygon test over all rings gives the
    right answer for a suburb with an enclave inside it.
    """
    if not geom:
        return []
    t = geom.get("type")
    if t == "Polygon":
        return list(geom["coordinates"])
    if t == "MultiPolygon":
        return [ring for poly in geom["coordinates"] for ring in poly]
    return []


def point_in_rings(lon, lat, rings):
    """Even-odd ray cast across every ring of one suburb."""
    inside = False
    for ring in rings:
        n = len(ring)
        j = n - 1
        for i in range(n):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > lat) != (yj > lat):
                x = xi + (lat - yi) * (xj - xi) / (yj - yi)
                if x > lon:
                    inside = not inside
            j = i
    return inside


def title_case(name):
    """NSW Spatial ships suburb names in caps ("NORTH BONDI")."""
    small = {"of", "the", "and"}
    out = []
    for i, word in enumerate(name.strip().split()):
        low = word.lower()
        out.append(low if (i and low in small) else low.capitalize())
    return " ".join(out)


# ─── download ────────────────────────────────────────────────────────────────

def download():
    feats, offset = [], 0
    while True:
        q = urllib.parse.urlencode({
            "geometry": BBOX,
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "suburbname,postcode",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": PAGE,
        })
        with urllib.request.urlopen(f"{SERVICE}?{q}", timeout=180) as r:
            page = json.load(r)
        got = page.get("features", [])
        feats += got
        print(f"  … {len(feats)} suburbs")
        if len(got) < PAGE:
            break
        offset += PAGE
        time.sleep(0.4)

    out = []
    for f in feats:
        props = f.get("properties") or {}
        name = (props.get("suburbname") or "").strip()
        if not name:
            continue
        rings = []
        for ring in rings_of(f.get("geometry")):
            thin = rdp([(float(x), float(y)) for x, y in ring], SIMPLIFY_DEG)
            if len(thin) < 4:
                continue
            rings.append([[round(x, PRECISION), round(y, PRECISION)] for x, y in thin])
        if not rings:
            continue
        out.append({
            "name": title_case(name),
            "postcode": props.get("postcode"),
            "rings": rings,
        })

    out.sort(key=lambda s: s["name"])
    with open(BOUNDARIES, "w") as fh:
        json.dump({
            "_source": "NSW Spatial Services — NSW Administrative Boundaries "
                       "Theme, layer 2 (Suburb). CC BY 4.0.",
            "_url": SERVICE,
            "_fetched": time.strftime("%Y-%m-%d"),
            "_simplified_deg": SIMPLIFY_DEG,
            "suburbs": out,
        }, fh)
    mb = os.path.getsize(BOUNDARIES) / 1048576
    print(f"✓ {len(out)} suburb polygons → scripts/data/suburbs-nsw.json ({mb:.1f} MB)")


# ─── apply ───────────────────────────────────────────────────────────────────

def apply():
    bounds = json.load(open(BOUNDARIES))["suburbs"]

    # Pre-compute each suburb's bbox so a street midpoint only gets the full
    # ray cast against the handful of suburbs that could possibly contain it.
    boxes = []
    for s in bounds:
        xs = [p[0] for ring in s["rings"] for p in ring]
        ys = [p[1] for ring in s["rings"] for p in ring]
        boxes.append((min(xs), min(ys), max(xs), max(ys)))

    # Coarse grid index over the disc: 0.02° ≈ 2 km cells.
    CELL = 0.02
    grid = {}
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        for gx in range(int(x0 / CELL), int(x1 / CELL) + 1):
            for gy in range(int(y0 / CELL), int(y1 / CELL) + 1):
                grid.setdefault((gx, gy), []).append(i)

    coll = json.load(open(DATA_PATH))
    feats = coll["features"]

    stats = {}        # suburb index → counts
    assigned = 0
    for f in feats:
        coords = f["geometry"]["coordinates"]
        lon, lat = coords[len(coords) // 2]
        hit = None
        for i in grid.get((int(lon / CELL), int(lat / CELL)), ()):
            x0, y0, x1, y1 = boxes[i]
            if not (x0 <= lon <= x1 and y0 <= lat <= y1):
                continue
            if point_in_rings(lon, lat, bounds[i]["rings"]):
                hit = i
                break
        props = f["properties"]
        if hit is None:
            props.pop("sub", None)
            continue
        props["sub"] = bounds[hit]["name"]
        assigned += 1
        st = stats.setdefault(hit, {"streets": 0, "classified": 0,
                                    "lon": 0.0, "lat": 0.0,
                                    "x0": 999.0, "y0": 999.0,
                                    "x1": -999.0, "y1": -999.0})
        st["streets"] += 1
        if props.get("cat") != "unknown":
            st["classified"] += 1
        st["lon"] += lon
        st["lat"] += lat
        for clon, clat in coords:
            st["x0"] = min(st["x0"], clon)
            st["x1"] = max(st["x1"], clon)
            st["y0"] = min(st["y0"], clat)
            st["y1"] = max(st["y1"], clat)

    # The index the app ships: no polygons, just what a search result needs.
    # The centre is the mean of the suburb's own street midpoints rather than
    # the polygon centroid — for a suburb shaped like Palm Beach the centroid
    # can land in the water, and we want to fly the map to where the roads are.
    index = []
    for i, st in sorted(stats.items(), key=lambda kv: bounds[kv[0]]["name"]):
        if st["streets"] < 2:
            continue
        index.append({
            "name": bounds[i]["name"],
            "postcode": bounds[i]["postcode"],
            "lat": round(st["lat"] / st["streets"], 5),
            "lon": round(st["lon"] / st["streets"], 5),
            "bbox": [round(st["x0"], 5), round(st["y0"], 5),
                     round(st["x1"], 5), round(st["y1"], 5)],
            "streets": st["streets"],
            "classified": st["classified"],
        })

    with open(INDEX_OUT, "w") as fh:
        json.dump({
            "source": "NSW Spatial Services — NSW Administrative Boundaries "
                      "Theme, layer 2 (Suburb). CC BY 4.0.",
            "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "suburbs": index,
        }, fh)

    with open(DATA_PATH, "w") as fh:
        json.dump(coll, fh)

    missing = len(feats) - assigned
    print(f"✓ {assigned:,} of {len(feats):,} streets given a suburb "
          f"({missing:,} outside every polygon — left blank, never guessed)")
    print(f"✓ {len(index)} suburbs → src/data/suburbs.json")


if __name__ == "__main__":
    if "--refresh" in sys.argv or not os.path.exists(BOUNDARIES):
        print("── downloading NSW Spatial suburb boundaries ──")
        download()
    apply()
