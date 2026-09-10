#!/usr/bin/env python3
"""
City of Parramatta — resident-parking areas, meters and no-stopping lines.

The west was the biggest hole in the map after the main roads went in: 4,371
unknown streets at 9%. Parramatta turns out to publish three parking layers on
its ArcGIS org (services6.arcgis.com/NrOjMi9LSYL3MUze), which nothing had
touched because we had been probing a guessed hostname that does not exist.

  PARKING_RESIDENT_PARKING_SCHEME_MAY2015  20 permit-area polygons (AREA 1A …)
  ParkingMeters_view                       226 meters, with street and suburb
  parking_restrictions                     57 signed no-stopping lines

What each can and cannot say:
  * The permit polygons say WHERE a scheme applies, not the time limit on the
    sign — the same situation as City of Sydney and Randwick's area layer — so
    those streets read "timed visitor parking, permit holders excepted, check
    the sign", never an invented limit.
  * The meter layer has no tariff or hours published, so a metered street says
    "meter parking" without a price rather than guessing one.
  * The restriction lines carry a plain restriction string ("No Stopping").

Only 'unknown' segments are touched. The 2015 vintage of the permit layer is
worth remembering: it is the council's current publication, but a scheme may
have changed since, and a photographed sign outranks it.

Run:  python3 scripts/fetch-parramatta-parking.py            (offline)
      python3 scripts/fetch-parramatta-parking.py --fetch    (refresh)
"""

import json
import math
import os
import sys
import urllib.parse
import urllib.request

from lib_enrich import norm, load, save, mark_enriched, in_bbox

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "parramatta-parking.json")
ORG = "https://services6.arcgis.com/NrOjMi9LSYL3MUze/arcgis/rest/services"
LAYERS = {
    "areas": f"{ORG}/PARKING_RESIDENT_PARKING_SCHEME_MAY2015/FeatureServer/0",
    "meters": f"{ORG}/ParkingMeters_view/FeatureServer/0",
    "restrictions": f"{ORG}/parking_restrictions/FeatureServer/0",
}
PHRASE = "City of Parramatta parking (resident-scheme areas, meters, no-stopping lines)"
LABEL = "Parramatta"
SNAP_M = 30.0

# City of Parramatta LGA, generously bounded.
BBOX = (-33.88, -33.74, 150.92, 151.09)


def fetch():
    out = {}
    for key, base in LAYERS.items():
        url = base + "/query?" + urllib.parse.urlencode({
            "where": "1=1", "outFields": "*", "outSR": "4326",
            "returnGeometry": "true", "resultRecordCount": 3000, "f": "geojson",
        })
        gj = json.load(urllib.request.urlopen(url, timeout=120))
        out[key] = gj.get("features", [])
        print(f"  {key}: {len(out[key])} features")
    json.dump({"source": ORG, **out}, open(DATA, "w"))
    print(f"✓ Parramatta layers -> {os.path.basename(DATA)}")


# --------------------------------------------------------------- geometry

def _scale(lat):
    return 111320 * math.cos(math.radians(lat)), 110540


def _dist_to_line(lat, lon, coords):
    sx, sy = _scale(lat)
    px, py = lon * sx, lat * sy
    best = float("inf")
    for (x1, y1), (x2, y2) in zip(coords, coords[1:]):
        ax, ay, bx, by = x1 * sx, y1 * sy, x2 * sx, y2 * sy
        dx, dy = bx - ax, by - ay
        ll = dx * dx + dy * dy
        t = 0 if ll == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ll))
        best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return best


def _rings(geom):
    if not geom:
        return []
    return [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]


def _in_ring(x, y, ring):
    c = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][:2]
        x2, y2 = ring[(i + 1) % n][:2]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            c = not c
    return c


def _in_poly(x, y, poly):
    if not _in_ring(x, y, poly[0]):
        return False
    return not any(_in_ring(x, y, h) for h in poly[1:])


def apply():
    data = json.load(open(DATA))
    coll = load()
    feats = coll["features"]
    before = sum(1 for f in feats if f["properties"]["cat"] != "unknown")

    # Idempotent.
    for f in feats:
        if (f["properties"].get("left") or {}).get("permitLabel", "").startswith(LABEL):
            f["properties"]["cat"] = "unknown"
            f["properties"]["left"] = {"kind": "unknown"}
            f["properties"].pop("right", None)
            f["properties"].pop("zone", None)

    local = [f for f in feats if in_bbox(f["geometry"]["coordinates"], BBOX)]
    print(f"  {len(local)} streets inside the Parramatta bbox")

    def mid(f):
        c = f["geometry"]["coordinates"]
        m = c[len(c) // 2]
        return m[0], m[1]

    # -- 1. no-stopping lines (most specific, applied first) ------------------
    CELL = 0.004
    grid = {}
    for f in local:
        for lon, lat in f["geometry"]["coordinates"][::2]:
            grid.setdefault((round(lat / CELL), round(lon / CELL)), []).append(f)

    def nearest(lat, lon, name):
        cl, co = round(lat / CELL), round(lon / CELL)
        best, bd, seen = None, SNAP_M, set()
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for f in grid.get((cl + a, co + b), []):
                    if id(f) in seen:
                        continue
                    seen.add(id(f))
                    if name and norm(f["properties"].get("name") or "") != name:
                        continue
                    d = _dist_to_line(lat, lon, f["geometry"]["coordinates"])
                    if d < bd:
                        best, bd = f, d
        return best

    banned = 0
    for r in data.get("restrictions", []):
        g = r.get("geometry")
        p = r["properties"]
        if not g:
            continue
        lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        name = norm(p.get("Street_Name") or "")
        text = (p.get("Restriction") or "").strip().lower()
        kind = "no_stopping" if "stopping" in text else "no_parking"
        for line in lines:
            for lon, lat in line[::2]:
                seg = nearest(lat, lon, name)
                if seg is None or seg["properties"]["cat"] != "unknown":
                    continue
                rule = {"kind": kind, "permitLabel": f"{LABEL} — {p.get('Restriction')}"}
                seg["properties"]["left"] = dict(rule)
                seg["properties"]["right"] = dict(rule)
                seg["properties"]["cat"] = kind
                banned += 1

    # -- 2. meters ------------------------------------------------------------
    metered = 0
    for m in data.get("meters", []):
        g = m.get("geometry")
        p = m["properties"]
        if not g or g["type"] != "Point":
            continue
        lon, lat = g["coordinates"][:2]
        name = norm(p.get("Street") or "")
        seg = nearest(lat, lon, name) or nearest(lat, lon, None)
        if seg is None or seg["properties"]["cat"] != "unknown":
            continue
        # No tariff or hours are published with these meters, so the rule says
        # "metered" and sends the driver to the machine rather than inventing
        # a price or a cut-off time.
        rule = {"kind": "paid", "zone": "meter", "rateZoneFill": True,
                "permitLabel": f"{LABEL} meter"}
        seg["properties"]["left"] = dict(rule)
        seg["properties"]["right"] = dict(rule)
        seg["properties"]["cat"] = "paid"
        seg["properties"]["zone"] = "meter"
        metered += 1

    # -- 3. resident-scheme areas (broadest, applied last) --------------------
    polys = []
    for a in data.get("areas", []):
        area = (a["properties"].get("AREA") or "").strip()
        for poly in _rings(a.get("geometry")):
            outer = poly[0]
            xs = [c[0] for c in outer]
            ys = [c[1] for c in outer]
            polys.append((area, min(xs), max(xs), min(ys), max(ys), poly))

    residents = 0
    for f in local:
        if f["properties"]["cat"] != "unknown":
            continue
        x, y = mid(f)
        for area, minx, maxx, miny, maxy, poly in polys:
            if not (minx <= x <= maxx and miny <= y <= maxy):
                continue
            if not _in_poly(x, y, poly):
                continue
            rule = {"kind": "residents", "zone": "residential", "permitExcepted": True,
                    "permitLabel": f"{LABEL} {area.title()}"}
            f["properties"]["left"] = dict(rule)
            f["properties"]["right"] = dict(rule)
            f["properties"]["cat"] = "residents"
            f["properties"]["zone"] = "residential"
            residents += 1
            break

    mark_enriched(coll, PHRASE)
    save(coll)
    after = sum(1 for f in feats if f["properties"]["cat"] != "unknown")
    print(f"✓ Parramatta: {residents} permit-area streets, {metered} metered, "
          f"{banned} no-stopping (classified {before} -> {after})")


if __name__ == "__main__":
    if "--fetch" in sys.argv:
        fetch()
    apply()
