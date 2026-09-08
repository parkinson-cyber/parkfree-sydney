#!/usr/bin/env python3
"""
Randwick per-kerb sign data — the council's own GIS, snapped by geometry.

Two authoritative layers on mapservices.randwick.nsw.gov.au (no login, plain
GET, not behind the website's bot protection):

  extTransport/ResidentParkingZone/0   699 kerb polylines, each with street,
      house range, RPS zone, and — for ~300 of them — the signed limit in
      `zoneType` ("2P 8am - 8pm Mon-Sun Permit Holders Excepted").
  extCollectorApp/Commercial_Parking/0  77 kerb sections in four shopping strips
      (Coogee Bay Rd, Clovelly Rd, Anzac Pde La Perouse, Snape St) with the
      signed restriction (1/2P, NO STOPPING, BUS ZONE, UNRESTRICTED…), hours,
      and which side of the road.

Both are snapped onto OSM segments by geometry (kerb midpoint within 25 m)
AND street name, so a same-named street elsewhere can't match. This is
stronger than the name-joined area polygons, so it may upgrade:
  - `residents` segments (from the area-polygon pass) to free_limited with the
    real limit/hours + permit exception — "2P 8am–8pm" instead of "check sign";
  - `unknown` segments the polygons missed;
  - OSM-tagged `free` segments that the council says are a signed permit zone.
Metered, banned and other sign-derived segments are left alone. Kerbs with a
null zoneType keep the "check the sign" treatment.

For commercial kerbs the rule per side is the MOST restrictive parkable sign
on that kerb (a kerb mixing 1/2P and unrestricted sections is shown as 1/2P
— under-promising beats sending someone to a space that isn't there); a kerb
with no parkable section gets its ban. N/E kerbs go to `left`, S/W to
`right` — the app shows both sides either way.

Run:  python3 scripts/fetch-randwick-kerbs-parking.py            (offline, from the
      committed GeoJSON)   or  --fetch  to refresh the two files first.
"""

import json
import math
import os
import re
import subprocess
import sys

from lib_enrich import norm, load, save, mark_enriched

HERE = os.path.dirname(os.path.abspath(__file__))
ZONES = os.path.join(HERE, "data", "randwick-resident-zone-kerbs.geojson")
COMM = os.path.join(HERE, "data", "randwick-commercial-kerbs.geojson")
LABEL = json.load(open(os.path.join(HERE, "data", "randwick-kerbs-scheme.json")))["label"]
PHRASE = "Randwick kerb signs (council GIS: resident-zone kerbs with limits + shopping-strip kerbs)"
BASE = "https://mapservices.randwick.nsw.gov.au/arcgis/rest/services"
SNAP_M = 25.0

# Randwick LGA (Centennial Park to La Perouse) — geometry is already precise;
# the bbox just keeps the grid small.
BBOX = (-34.0, -33.88, 151.19, 151.29)


def fetch():
    for path, svc in ((ZONES, "extTransport/ResidentParkingZone"),
                      (COMM, "extCollectorApp/Commercial_Parking")):
        url = (f"{BASE}/{svc}/MapServer/0/query?where=1%3D1&outFields=*"
               f"&outSR=4326&resultRecordCount=2000&f=geojson")
        raw = subprocess.run(["curl", "-sS", url], capture_output=True, check=True).stdout
        json.loads(raw)  # validate before overwriting
        open(path, "wb").write(raw)
        print(f"  fetched {svc} -> {os.path.basename(path)} ({len(raw)} bytes)")


# ---------------------------------------------------------------- sign parsing

DAYS = {"mon-sun": "Mo-Su", "mon-fri": "Mo-Fr", "mon-sat": "Mo-Sa", "sat-sun": "Sa-Su",
        "sat": "Sa", "sun": "Su"}


def _hhmm(h, m, ap):
    h = int(h) % 12 + (12 if ap == "pm" else 0)
    return f"{h:02d}:{int(m or 0):02d}"


def parse_interval(text):
    """'8am - 8pm Mon-Sun' / '8:30AM-6PM, MON-FRI' -> 'Mo-Su 08:00-20:00'.
    A time range with no days means every day, as on the sign."""
    t = text.lower()
    m = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)", t)
    if not m:
        return None
    start = _hhmm(m.group(1), m.group(2), m.group(3))
    end = _hhmm(m.group(4), m.group(5), m.group(6))
    if end == "00:00":
        end = "24:00"
    days = "Mo-Su"
    rest = t[m.end():] + " " + t[:m.start()]  # day tokens live outside the time range
    for k, v in DAYS.items():
        if re.search(r"(?<![a-z])" + k + r"(?![a-z])", rest):
            days = v
            break
    return f"{days} {start}-{end}"


def parse_limit(text):
    t = text.upper()
    if "1/2P" in t.replace(" ", ""):
        return 30
    if "1/4P" in t.replace(" ", ""):
        return 15
    # "2P" — but never the "8PM" inside a time range, nor "P30"'s P
    m = re.search(r"(?<![\d/:])(\d{1,2})P(?![A-Z0-9])", t)
    if m:
        return int(m.group(1)) * 60
    m = re.search(r"(?<![A-Z])P(\d{1,3})(?![0-9])", t)
    if m:
        return int(m.group(1))
    return None


BANS = {"NO STOPPING": "no_stopping", "NO PARKING": "no_parking", "BUS ZONE": "no_stopping",
        "LOADING ZONE": "no_parking", "MAIL ZONE": "no_parking", "TAXI ZONE": "no_stopping",
        "MOBILITY PARKING (MIPPS)": "no_parking", "WORKS ZONE": "no_parking"}


# ---------------------------------------------------------------- snapping

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


class Snapper:
    CELL = 0.004

    def __init__(self, feats):
        self.grid = {}
        for f in feats:
            c = f["geometry"]["coordinates"]
            if not any(BBOX[0] <= la <= BBOX[1] and BBOX[2] <= lo <= BBOX[3] for lo, la in c):
                continue
            for lon, lat in c[::3]:
                self.grid.setdefault((round(lat / self.CELL), round(lon / self.CELL)), []).append(f)

    def nearest(self, lat, lon, name):
        cl, co = round(lat / self.CELL), round(lon / self.CELL)
        best, bd, seen = None, SNAP_M, set()
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for f in self.grid.get((cl + a, co + b), []):
                    if id(f) in seen:
                        continue
                    seen.add(id(f))
                    if norm(f["properties"].get("name") or "") != name:
                        continue
                    d = _dist_to_line(lat, lon, f["geometry"]["coordinates"])
                    if d < bd:
                        best, bd = f, d
        return best


def _mid(geom):
    c = geom["coordinates"]
    if geom["type"] == "MultiLineString":
        c = max(c, key=len)
    m = c[len(c) // 2]
    return m[1], m[0]


# ---------------------------------------------------------------- apply

UPGRADABLE = ("unknown", "residents", "free")


def apply():
    coll = load()
    feats = coll["features"]
    snap = Snapper(feats)
    before = sum(1 for f in feats if f["properties"]["cat"] != "unknown")

    # -- resident-zone kerbs -------------------------------------------------
    zones = json.load(open(ZONES))["features"]
    per_seg = {}
    for k in zones:
        p, g = k["properties"], k.get("geometry")
        if not g:
            continue
        lat, lon = _mid(g)
        seg = snap.nearest(lat, lon, norm(p.get("streetName") or ""))
        if not seg:
            continue
        per_seg.setdefault(seg["properties"]["id"], []).append(p)

    limited = unknown_tagged = 0
    for f in feats:
        p = f["properties"]
        kerbs = per_seg.get(p["id"])
        if not kerbs or p["cat"] not in UPGRADABLE:
            continue
        zone = next((k["residentParkingSchemeZone"] for k in kerbs if k.get("residentParkingSchemeZone")), None)
        label = f"{LABEL} {zone}" if zone else LABEL
        signs = [k["zoneType"].strip() for k in kerbs if (k.get("zoneType") or "").strip()]
        if signs:
            # most restrictive signed limit on the segment
            parsed = [(parse_limit(s) or 10 ** 6, s) for s in signs]
            limit, sign = min(parsed)
        if signs and limit < 10 ** 6:
            rule = {"kind": "free_limited", "maxstayMin": limit, "permitExcepted": True,
                    "zone": "residential", "permitLabel": label, "permitArea": zone}
            iv = parse_interval(sign)
            if iv:
                rule["interval"] = iv
            p["left"], p["right"] = dict(rule), dict(rule)
            p["cat"] = "free_limited"
            p["zone"] = "residential"
            limited += 1
        elif p["cat"] == "unknown":  # no parseable limit: permit zone, "check the sign"
            rule = {"kind": "residents", "zone": "residential", "permitExcepted": True,
                    "permitLabel": label, "permitArea": zone}
            p["left"], p["right"] = dict(rule), dict(rule)
            p["cat"] = "residents"
            p["zone"] = "residential"
            unknown_tagged += 1

    # -- shopping-strip kerbs ------------------------------------------------
    comm = json.load(open(COMM))["features"]
    per_seg = {}
    for k in comm:
        p, g = k["properties"], k.get("geometry")
        if not g:
            continue
        lat, lon = _mid(g)
        seg = snap.nearest(lat, lon, norm(p.get("streetName") or ""))
        if not seg:
            continue
        per_seg.setdefault(seg["properties"]["id"], []).append(p)

    order = {"free": 0, "free_limited": 1, "no_parking": 2, "no_stopping": 3}
    strips = 0
    for f in feats:
        p = f["properties"]
        kerbs = per_seg.get(p["id"])
        if not kerbs or p["cat"] not in UPGRADABLE:
            continue
        sides = {"left": [], "right": []}
        for k in kerbs:
            side = "left" if (k.get("side") or "N")[:1].upper() in "NE" else "right"
            zone = (k.get("restrictionZone") or "").strip().upper()
            when = (k.get("restrictionTime") or "").strip()
            if zone == "UNRESTRICTED":
                sides[side].append({"kind": "free"})
            elif zone in BANS:
                r = {"kind": BANS[zone]}
                if zone == "LOADING ZONE":
                    r["zone"] = "loading"
                iv = parse_interval(when)
                if iv:
                    r["banInterval"] = iv
                sides[side].append(r)
            else:
                lim = parse_limit(zone)
                if lim:
                    r = {"kind": "free_limited", "maxstayMin": lim}
                    iv = parse_interval(when)
                    if iv:
                        r["interval"] = iv
                    sides[side].append(r)
        rules = {}
        for side, lst in sides.items():
            if not lst:
                continue
            parkable = [r for r in lst if r["kind"] in ("free", "free_limited")]
            if parkable:
                # most restrictive parkable: smallest limit, 'free' last
                rules[side] = min(parkable, key=lambda r: r.get("maxstayMin", 10 ** 6))
            else:
                rules[side] = max(lst, key=lambda r: order[r["kind"]])
        if not rules:
            continue
        for side in ("left", "right"):
            r = dict(rules.get(side) or rules[next(iter(rules))])
            r["permitLabel"] = f"{LABEL} kerb signs"  # reset marker only; not shown (no permit)
            p[side] = r
        best = min(rules.values(), key=lambda r: order[r["kind"]])
        p["cat"] = best["kind"]
        strips += 1

    mark_enriched(coll, PHRASE)
    save(coll)
    after = sum(1 for f in feats if f["properties"]["cat"] != "unknown")
    print(f"✓ Randwick kerbs: {limited} permit segments now carry the signed limit, "
          f"{unknown_tagged} unknown tagged as permit zone, {strips} shopping-strip segments "
          f"(classified {before} -> {after})")


def _selftest():
    assert parse_limit("2P 8am - 8pm Mon-Sun Permit Holders Excepted") == 120
    assert parse_limit("8am - 8pm Permit Holders Excepted") is None
    assert parse_limit("1/2P") == 30 and parse_limit("P30") == 30 and parse_limit("P5") == 5
    assert parse_interval("2P 8am - 8pm Mon-Sun Permit Holders Excepted") == "Mo-Su 08:00-20:00"
    assert parse_interval("2P, 8:30am-6pm, Mon-Fri, Permit Holders Excepted") == "Mo-Fr 08:30-18:00"
    assert parse_interval("10PM-3AM") == "Mo-Su 22:00-03:00"
    assert parse_interval("8:30AM-4PM, MON-FRI, 7AM-12PM, SAT") == "Mo-Fr 08:30-16:00"


if __name__ == "__main__":
    _selftest()
    if "--fetch" in sys.argv:
        fetch()
    apply()
