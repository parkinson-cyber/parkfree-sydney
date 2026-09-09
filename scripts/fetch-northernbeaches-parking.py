#!/usr/bin/env python3
"""
Northern Beaches Council — parking signs from the council's asset register.

The LGA had no coverage at all: Manly, Freshwater, Dee Why, Narrabeen and the
whole northern run were blank, which is exactly where an app like this earns
its keep on a summer weekend.

Source: maps.northernbeaches.nsw.gov.au ArcGIS, Assets/MapServer layer 4
("Road Signs") — 29,691 sign points, of which ~9,800 are parking regulatory
signs. The useful field is NARR1, the RTA sign-type description
("Parking (2 hours) (Examples only)", "NO STOPPING", "BUS ZONE").

What this source does and does not give you, stated plainly:
  * It gives the sign TYPE, so the time limit is real: a "Parking (2 hours)"
    sign means 2P on that kerb.
  * It does NOT give the HOURS. The council stores time plates as their own
    sign records ("Times Of Operation (Single Period)") without the times
    printed on them. So a 2P here is recorded with a maxstay and NO interval,
    and the app says "2P" rather than inventing "2P 8am-6pm".
    That under-promises — a street that is actually unrestricted at 9pm will
    still read "2P" — which is the safe direction for a free-parking finder,
    and a photographed sign (scripts/data/field-signs.json) overrides it.

Snapping: each sign is matched to the nearest OSM segment within SNAP_M. A
segment that carries any parkable sign takes that (the most restrictive limit,
under-promising again); a segment with only ban signs takes the ban. Only
'unknown' segments are touched, so councils' own richer feeds and photographed
signs are never overwritten.

Coverage rule — the important one. A sign governs the stretch of kerb until
the next sign, not the whole road, so a segment is tagged only when the signs
on it could plausibly cover its length (SPAN_M each). Without this, one
No Parking sign at a corner blacked out the entire 3.8 km of Cottage Point
Road, and a single 2P sign claimed a 3 km street. Segments that fail the test
stay 'unknown': we know something is signed there, but not enough to describe
the whole segment.

Run:  python3 scripts/fetch-northernbeaches-parking.py            (offline)
      python3 scripts/fetch-northernbeaches-parking.py --fetch    (refresh)
"""

import json
import math
import os
import sys
import urllib.parse
import urllib.request

from lib_enrich import norm, load, save, mark_enriched, in_bbox

HERE = os.path.dirname(os.path.abspath(__file__))
SIGNS_PATH = os.path.join(HERE, "data", "northernbeaches-parking-signs.json")
LAYER = ("https://maps.northernbeaches.nsw.gov.au/arcgis/rest/services"
         "/Assets/MapServer/4")
PHRASE = "Northern Beaches parking signs (council asset register, sign types only)"
LABEL = "Northern Beaches signs"
SNAP_M = 22.0
PAGE = 2000
# How much kerb one sign is taken to govern. A ban is signed more densely than
# a time limit (every corner, every driveway), so it claims less each.
SPAN_BAN_M = 120.0
SPAN_LIMIT_M = 200.0

# Northern Beaches LGA, Manly up to Palm Beach.
BBOX = (-33.80, -33.57, 151.20, 151.35)

SIGN_PREFIXES = [
    "Parking (", "Parking Series", "NO PARKING", "No parking", "NO STOPPING",
    "Clearway", "CLEARWAY", "LOADING ZONE", "BUS ZONE", "Area Parking",
    "Park In Bays", "Angle Parking", "ANGLE PARKING", "Area Park End",
]

# NARR1 sign type -> rule. Hours are deliberately absent (see docstring).
DURATION_MIN = {
    "Parking Series - 5 Minutes": 5,
    "Parking Series - 10 Minute Parking": 10,
    "Parking (1/4 hour) (Examples Only)": 15,
    "Parking Series. (1/2 Hour)": 30,
    "Parking (1 Hour) (Examples Only)": 60,
    "Parking (2 hours) (Examples only)": 120,
    "Parking (4 Hours)": 240,
    "Parking (5 Hours)": 300,
    "Parking (7 Hours)": 420,
}
BANS = {
    "NO STOPPING": ("no_stopping", None),
    "NO STOPPING (Top plate)": ("no_stopping", None),
    "NO PARKING AT ANY TIME": ("no_parking", None),
    "No parking (symbolic)": ("no_parking", None),
    "No parking with arrow": ("no_parking", None),
    "No Parking with arrow": ("no_parking", None),
    "No parking (symbolic) (Specified times)": ("no_parking", None),
    "BUS ZONE (Examples Only)": ("no_stopping", None),
    "LOADING ZONE (Examples Only)": ("no_parking", "loading"),
    "Clearway - At All Times (L,R L&R Arrows)": ("no_stopping", None),
    "CLEARWAY (AM & PM) repeater": ("no_stopping", None),
}
# Signs that say a bay exists but not what the rule is — no classification.
IGNORE = {
    "Parking Series - No duration stated.", "Park In Bays Only", "Area Park End",
    "Area Parking—Minor Entry (Tickets)", "Times Of Operation (Single Period)",
    "Times Of Operation (Two Periods)", "Time plates - For use with R5-601 (Examp",
    "ANGLE PARKING PLATE (Variable) ANGLE; FR",
    "Angle Parking (Rear To Curb) (L, Lr & R",
}


def fetch():
    where = " OR ".join(f"NARR1 LIKE '{p}%'" for p in SIGN_PREFIXES)
    out, offset = [], 0
    while True:
        params = {
            "where": where, "outFields": "OBJECTID,NARR1", "outSR": "4326",
            "returnGeometry": "true", "resultOffset": offset,
            "resultRecordCount": PAGE, "f": "geojson",
        }
        url = LAYER + "/query?" + urllib.parse.urlencode(params)
        page = json.load(urllib.request.urlopen(url, timeout=120))
        feats = page.get("features", [])
        out.extend(feats)
        print(f"  fetched {len(out)} signs…")
        if len(feats) < PAGE:
            break
        offset += PAGE
    json.dump({
        "source": f"{LAYER} (NARR1 sign type; hours are not published in this layer)",
        "features": out,
    }, open(SIGNS_PATH, "w"))
    print(f"✓ {len(out)} parking signs -> {os.path.basename(SIGNS_PATH)}")


# ------------------------------------------------------------------ snapping

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


def _length_m(coords):
    total = 0.0
    for (x1, y1), (x2, y2) in zip(coords, coords[1:]):
        sx, sy = _scale(y1)
        total += math.hypot((x2 - x1) * sx, (y2 - y1) * sy)
    return total


def apply():
    data = json.load(open(SIGNS_PATH))
    coll = load()
    feats = coll["features"]
    before = sum(1 for f in feats if f["properties"]["cat"] != "unknown")

    # Idempotent: drop this pipeline's own tags before re-deriving them.
    for f in feats:
        if (f["properties"].get("left") or {}).get("permitLabel") == LABEL:
            f["properties"]["cat"] = "unknown"
            f["properties"]["left"] = {"kind": "unknown"}
            f["properties"].pop("right", None)
            f["properties"].pop("zone", None)

    CELL = 0.004
    grid = {}
    for f in feats:
        c = f["geometry"]["coordinates"]
        if not in_bbox(c, BBOX):
            continue
        for lon, lat in c[::2]:
            grid.setdefault((round(lat / CELL), round(lon / CELL)), []).append(f)

    def nearest(lat, lon):
        cl, co = round(lat / CELL), round(lon / CELL)
        best, bd, seen = None, SNAP_M, set()
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for f in grid.get((cl + a, co + b), []):
                    if id(f) in seen:
                        continue
                    seen.add(id(f))
                    d = _dist_to_line(lat, lon, f["geometry"]["coordinates"])
                    if d < bd:
                        best, bd = f, d
        return best

    # Collect signs per segment, then decide the segment's rule once.
    per_seg = {}
    unmapped, skipped = {}, 0
    for sf in data["features"]:
        g = sf.get("geometry")
        if not g or g.get("type") != "Point":
            continue
        lon, lat = g["coordinates"][:2]
        narr = (sf["properties"].get("NARR1") or "").strip()
        if narr in IGNORE:
            continue
        limit = DURATION_MIN.get(narr)
        ban = BANS.get(narr)
        if limit is None and ban is None:
            unmapped[narr] = unmapped.get(narr, 0) + 1
            continue
        seg = nearest(lat, lon)
        if seg is None:
            skipped += 1
            continue
        per_seg.setdefault(seg["properties"]["id"], []).append((limit, ban))

    by_id = {f["properties"]["id"]: f for f in feats}
    applied = parkable = banned = thin = 0
    for sid, signs in per_seg.items():
        f = by_id.get(sid)
        if f is None or f["properties"]["cat"] != "unknown":
            continue
        p = f["properties"]
        limits = [l for l, _ in signs if l is not None]
        length = _length_m(f["geometry"]["coordinates"])
        span = SPAN_LIMIT_M if limits else SPAN_BAN_M
        if len(signs) * span < length:
            thin += 1
            continue
        if limits:
            rule = {"kind": "free_limited", "maxstayMin": min(limits),
                    "permitLabel": LABEL}
            parkable += 1
        else:
            kinds = [b for _, b in signs if b]
            kind, zone = min(kinds, key=lambda k: 0 if k[0] == "no_parking" else 1)
            rule = {"kind": kind, "permitLabel": LABEL}
            if zone:
                rule["zone"] = zone
            banned += 1
        p["left"], p["right"] = dict(rule), dict(rule)
        p["cat"] = rule["kind"]
        if rule.get("zone"):
            p["zone"] = rule["zone"]
        applied += 1

    mark_enriched(coll, PHRASE)
    save(coll)
    after = sum(1 for f in feats if f["properties"]["cat"] != "unknown")
    print(f"✓ Northern Beaches: {applied} segments tagged "
          f"({parkable} with a time limit, {banned} no-stopping/no-parking); "
          f"{thin} segments left unknown - too few signs for their length; "
          f"{skipped} signs matched no street within {SNAP_M:.0f} m "
          f"(classified {before} -> {after})")
    if unmapped:
        print("  sign types seen but not mapped:",
              ", ".join(f"{k} ×{v}" for k, v in sorted(unmapped.items(), key=lambda kv: -kv[1])[:8]))


if __name__ == "__main__":
    if "--fetch" in sys.argv:
        fetch()
    apply()
