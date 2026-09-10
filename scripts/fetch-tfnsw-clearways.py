#!/usr/bin/env python3
"""
TfNSW clearways — the parking rules on Sydney's main roads.

Councils sign the side streets; Transport for NSW signs the state roads, and
publishes them. That is why Parramatta Road, Victoria Road, the Princes
Highway and King Georges Road were blank while the suburbs around them filled
in: we were only ever asking councils.

Source: the TfNSW ArcGIS feature service TRA_Clearways_3857 — 15,522 road
links, 8,579 of which carry CLEARWAY_HOURS ("M-F 0600-1000, 1500-1900"), plus
STREET_NAME and SUBURB.

What this can and cannot say:
  * Inside the clearway hours: no stopping. Certain, published, and the single
    most useful thing to know on a main road at 8am.
  * Outside them: unknown. The same kerb is often a bus lane, a loading zone
    or metered, and none of that is in this layer — so the rule carries
    `otherTimesUnknown`, and the app says the ban and then sends you to the
    sign rather than claiming the kerb is free.

Only 'unknown' segments are touched, so council sign censuses and photographed
signs always win.

Run:  python3 scripts/fetch-tfnsw-clearways.py            (offline)
      python3 scripts/fetch-tfnsw-clearways.py --fetch    (refresh)
"""

import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request

from lib_enrich import norm, load, save, mark_enriched, in_bbox

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "tfnsw-clearways.json")
LAYER = ("https://services6.arcgis.com/LHYr6B7cFUs40aCx/arcgis/rest/services"
         "/TRA_Clearways_3857/FeatureServer/0")
PHRASE = "TfNSW clearways (state roads; ban hours published, other times unknown)"
LABEL = "TfNSW clearway"
SNAP_M = 25.0
PAGE = 1000

# Greater Sydney — the layer is statewide.
BBOX = (-34.2, -33.5, 150.5, 151.4)


def fetch():
    out, offset = [], 0
    while True:
        params = {
            "where": "CLEARWAY_HOURS IS NOT NULL",
            "outFields": "OBJECTID,STREET_NAME,SUBURB,CLEARWAY_HOURS,DIRECTION",
            "outSR": "4326", "returnGeometry": "true",
            "resultOffset": offset, "resultRecordCount": PAGE, "f": "geojson",
        }
        url = LAYER + "/query?" + urllib.parse.urlencode(params)
        page = json.load(urllib.request.urlopen(url, timeout=180))
        feats = page.get("features", [])
        out.extend(feats)
        print(f"  fetched {len(out)} clearway links…")
        if len(feats) < PAGE:
            break
        offset += PAGE
    json.dump({"source": LAYER, "features": out}, open(DATA, "w"))
    print(f"✓ {len(out)} clearway links -> {os.path.basename(DATA)}")


# ------------------------------------------------------------- hour parsing

DAY_TOKENS = [
    (r"M\s*-\s*F|MON\s*-\s*FRI", "Mo-Fr"),
    (r"S\s*-\s*S\s*-?\s*(?:&\s*)?PH|S\s*-\s*S|SS|SAT\s*-\s*SUN|WE(?:EKEND)?", "Sa-Su"),
]
ALWAYS = re.compile(r"24\s*(?:hours?|hrs?)", re.I)


def parse_hours(text):
    """'M-F 0600-1000, 1500-1900' -> 'Mo-Fr 06:00-10:00; Mo-Fr 15:00-19:00'.

    Returns None for a 24/7 clearway — that is a permanent ban, expressed by
    having no interval at all, which the engine already treats as absolute.
    """
    if not text:
        return None
    if ALWAYS.search(text):
        return None

    # Find each day token and the stretch of text it governs (up to the next one).
    marks = []
    for pattern, label in DAY_TOKENS:
        for m in re.finditer(pattern, text, re.I):
            marks.append((m.start(), m.end(), label))
    marks.sort()

    clauses = []
    for i, (start, end, label) in enumerate(marks):
        stop = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        for t in re.finditer(r"(\d{3,4})\s*-\s*(\d{3,4})", text[end:stop]):
            a, b = t.group(1).zfill(4), t.group(2).zfill(4)
            clauses.append(f"{label} {a[:2]}:{a[2:]}-{b[:2]}:{b[2:]}")
    if not clauses:
        # times with no day token at all: treat as every day
        for t in re.finditer(r"(\d{3,4})\s*-\s*(\d{3,4})", text):
            a, b = t.group(1).zfill(4), t.group(2).zfill(4)
            clauses.append(f"Mo-Su {a[:2]}:{a[2:]}-{b[:2]}:{b[2:]}")
    return "; ".join(dict.fromkeys(clauses)) or None


def _selftest():
    assert parse_hours("M-F 0600-1000, 1500-1900") == "Mo-Fr 06:00-10:00; Mo-Fr 15:00-19:00"
    assert parse_hours("M-F 0600-1900 S-S 0900-1800 PH") == "Mo-Fr 06:00-19:00; Sa-Su 09:00-18:00"
    assert parse_hours("M-F 0600-1000 & 1500-1900,WE 1000-1900") == \
        "Mo-Fr 06:00-10:00; Mo-Fr 15:00-19:00; Sa-Su 10:00-19:00"
    assert parse_hours("24 Hrs / 7 Days & Pub Hols") is None
    assert parse_hours("24 Hours 7 Days") is None
    assert parse_hours("M-F 0600-1000") == "Mo-Fr 06:00-10:00"


# ----------------------------------------------------------------- snapping

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


def apply():
    _selftest()
    data = json.load(open(DATA))
    coll = load()
    feats = coll["features"]
    before = sum(1 for f in feats if f["properties"]["cat"] != "unknown")

    # Idempotent: clear this pipeline's own tags first.
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

    def nearest(lat, lon, name):
        cl, co = round(lat / CELL), round(lon / CELL)
        best, bd, seen = None, SNAP_M, set()
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for f in grid.get((cl + a, co + b), []):
                    if id(f) in seen:
                        continue
                    seen.add(id(f))
                    # Street name must agree: a clearway link runs beside side
                    # streets, and tagging those would be badly wrong.
                    if norm(f["properties"].get("name") or "") != name:
                        continue
                    d = _dist_to_line(lat, lon, f["geometry"]["coordinates"])
                    if d < bd:
                        best, bd = f, d
        return best

    per_seg = {}
    unmatched = 0
    for link in data["features"]:
        g = link.get("geometry")
        p = link["properties"]
        if not g:
            continue
        name = norm(p.get("STREET_NAME") or "")
        if not name:
            continue
        lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        hit = False
        for line in lines:
            # sample along the link so a long one tags its whole run
            for lon, lat in line[::3] or []:
                if not (BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lon <= BBOX[3]):
                    continue
                seg = nearest(lat, lon, name)
                if seg is not None:
                    per_seg.setdefault(seg["properties"]["id"], set()).add(p.get("CLEARWAY_HOURS"))
                    hit = True
        if not hit:
            unmatched += 1

    by_id = {f["properties"]["id"]: f for f in feats}
    applied = permanent = 0
    for sid, hour_texts in per_seg.items():
        f = by_id.get(sid)
        if f is None or f["properties"]["cat"] != "unknown":
            continue
        # If any sign on the segment is 24/7, the whole segment is 24/7.
        intervals = [parse_hours(t) for t in hour_texts if t]
        rule = {"kind": "no_stopping", "permitLabel": LABEL}
        if any(i is None for i in intervals):
            permanent += 1
        else:
            merged = "; ".join(dict.fromkeys("; ".join(i for i in intervals if i).split("; ")))
            if not merged:
                continue
            rule["banInterval"] = merged
            rule["otherTimesUnknown"] = True
        p = f["properties"]
        p["left"], p["right"] = dict(rule), dict(rule)
        p["cat"] = "no_stopping"
        applied += 1

    mark_enriched(coll, PHRASE)
    save(coll)
    after = sum(1 for f in feats if f["properties"]["cat"] != "unknown")
    print(f"✓ TfNSW clearways: {applied} segments tagged "
          f"({permanent} are 24/7, the rest carry published ban hours); "
          f"{unmatched} links matched no street by name within {SNAP_M:.0f} m "
          f"(classified {before} -> {after})")


if __name__ == "__main__":
    _selftest()
    print("  hour parser self-test OK")
    if "--fetch" in sys.argv:
        fetch()
    apply()
