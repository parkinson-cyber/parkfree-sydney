#!/usr/bin/env python3
"""
Waverley Council (eastern beaches) parking enrichment.

Waverley — Bondi, Bronte, Tamarama, Bondi Junction, Waverley, Dover Heights —
publishes exceptionally rich open data (CC-BY, via TfNSW / Data.NSW): actual
*sign-level* restrictions, metered tariffs, loading zones and Kiss & Ride
(PUDO) zones. This is even richer than the City of Sydney feed (which only had
meters), so we get real residential "1P/2P Permit Holders Excepted" limits.

Source shapefiles are EPSG:28356 (GDA94 / MGA Zone 56); we parse them with the
stdlib (no geopandas/GDAL available) and reproject with an inverse transverse
Mercator, then snap points to the OSM street network in src/data/parking.json.

Run:  python3 scripts/fetch-waverley-parking.py
"""

import io
import json
import math
import os
import re
import struct
import subprocess
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "src", "data", "parking.json")

RES = "https://opendata.transport.nsw.gov.au/data/dataset/5a6d694f-fbbf-49d9-a147-b7d7b00c8013/resource"
SOURCES = {
    "signs": f"{RES}/6b7fa599-9b3f-40c6-b5ab-78cc002c1462/download/traffic-and-parking-signs_3.zip",
    "meters": f"{RES}/bc55f663-3403-4bc8-9bff-a43c1a00d6f7/download/parkingmeters_5.zip",
    "loading": f"{RES}/786bbf46-d679-4680-8430-7f5cf8bd5fe3/download/truckandloadingzones_6.zip",
    "pudo": f"{RES}/4cf8274d-f32b-4445-9233-a54dece14a8a/download/pudo_cars_8.zip",
}

SNAP_M = 35  # sign-to-street snap tolerance (metres)

# ── shapefile + dbf readers (stdlib only) ────────────────────────────────────

def read_dbf(buf):
    numrec = struct.unpack("<I", buf[4:8])[0]
    hdrsize = struct.unpack("<H", buf[8:10])[0]
    recsize = struct.unpack("<H", buf[10:12])[0]
    nfields = (hdrsize - 33) // 32
    fields = []
    for i in range(nfields):
        fd = buf[32 + i * 32: 64 + i * 32]
        name = fd[:11].split(b"\x00")[0].decode("latin1")
        fields.append((name, fd[16]))
    rows = []
    base = hdrsize
    for r in range(numrec):
        rec = buf[base + r * recsize: base + (r + 1) * recsize]
        if len(rec) < recsize:
            break
        vals, off = {}, 1
        for name, flen in fields:
            vals[name] = rec[off:off + flen].decode("latin1").strip()
            off += flen
        rows.append(vals)
    return rows


def read_shp_points(buf):
    """Return XY for Point/PointZ/PointM shapefiles (None for null/other)."""
    pts, off, n = [], 100, len(buf)
    while off + 8 <= n:
        _, clen = struct.unpack(">II", buf[off:off + 8])
        off += 8
        st = struct.unpack("<I", buf[off:off + 4])[0]
        if st in (1, 11, 21):
            x, y = struct.unpack("<dd", buf[off + 4:off + 20])
            pts.append((x, y))
        else:
            pts.append(None)
        off += clen * 2
    return pts


# ── inverse transverse Mercator: EPSG:28356 → WGS84 ──────────────────────────

_A = 6378137.0
_F = 1 / 298.257222101
_E2 = 2 * _F - _F * _F
_K0 = 0.9996
_FE, _FN = 500000.0, 10000000.0
_LON0 = math.radians(153.0)


def mga56_to_wgs84(E, N):
    M = (N - _FN) / _K0
    mu = M / (_A * (1 - _E2 / 4 - 3 * _E2 ** 2 / 64 - 5 * _E2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - _E2)) / (1 + math.sqrt(1 - _E2))
    phi = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
           + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
           + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
           + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    ep2 = _E2 / (1 - _E2)
    C1 = ep2 * math.cos(phi) ** 2
    T1 = math.tan(phi) ** 2
    sp = math.sin(phi)
    N1 = _A / math.sqrt(1 - _E2 * sp * sp)
    R1 = _A * (1 - _E2) / (1 - _E2 * sp * sp) ** 1.5
    D = (E - _FE) / (N1 * _K0)
    lat = phi - (N1 * math.tan(phi) / R1) * (
        D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720)
    lon = _LON0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
                   + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / math.cos(phi)
    return math.degrees(lon), math.degrees(lat)


# ── geometry (planar, small-area) ────────────────────────────────────────────

def _scale(lat):
    return 111320 * math.cos(math.radians(lat)), 110540


def dist_to_line(lat, lon, coords):
    sx, sy = _scale(lat)
    px, py = lon * sx, lat * sy
    best = float("inf")
    for i in range(1, len(coords)):
        ax, ay = coords[i - 1][0] * sx, coords[i - 1][1] * sy
        bx, by = coords[i][0] * sx, coords[i][1] * sy
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        t = 0 if l2 == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
        cx, cy = ax + t * dx, ay + t * dy
        best = min(best, math.hypot(px - cx, py - cy))
    return best


# ── restriction-text parsing ─────────────────────────────────────────────────

DAY_RE = [
    (r"mon-fri", "Mo-Fr"), (r"mon-sat", "Mo-Sa"), (r"mon-sun", "Mo-Su"),
    (r"sat-sun", "Sa-Su"), (r"\bsat\b", "Sa"), (r"\bsun\b", "Su"),
]


def _limit_to_min(tok):
    if "/" in tok:
        a, b = tok.split("/")
        return round(int(a) / int(b) * 60)
    return int(tok) * 60


def _t2m(h, mn, ap):
    hh = int(h) % 12
    if ap == "pm":
        hh += 12
    return hh * 60 + int(mn or 0)


def _hhmm(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def _days(seg):
    for rx, tok in DAY_RE:
        if re.search(rx, seg):
            return tok
    return "Mo-Su"


BAN_WORDS = ("no stopping", "no parking", "bus zone", "truck zone",
             "mobility parking", "motor bike", "motor cycle", "motorbike",
             "car share", "taxi")


def parse_restriction(text, phe=False):
    """Parse a Waverley sign / meter restriction string into a SideRule dict."""
    if not text:
        return None
    t = text.lower()
    metered = "meter" in t
    loading = "loading zone" in t or "truck zone" in t
    permit = phe or "permit holders excepted" in t

    limits = [_limit_to_min(m) for m in re.findall(r"(\d+/\d+|\d+)\s*p\b", t)]
    hours = re.findall(r"(\d{1,2})(?:\.(\d{2}))?\s*(am|pm)\s*-\s*(\d{1,2})(?:\.(\d{2}))?\s*(am|pm)", t)
    fee_clauses, cut = [], 0
    for h1, m1, ap1, h2, m2, ap2 in hours:
        start = _t2m(h1, m1, ap1)
        end = _t2m(h2, m2, ap2)
        if end == 0:
            end = 24 * 60
        cut = max(cut, end)
        seg = t[:t.find(f"{h2}")] if False else t  # day applies to whole clause
        fee_clauses.append(f"{_days(t)} {_hhmm(start)}-{_hhmm(end)}")

    # Loading / bans that are not park-able for general cars.
    if loading:
        rule = {"kind": "no_parking", "zone": "loading"}
        if fee_clauses:
            rule["banInterval"] = "; ".join(sorted(set(fee_clauses)))
        return rule
    if limits or metered:
        rule = {
            "kind": "paid" if metered else "free_limited",
            "zone": "meter" if metered else None,
            "maxstayMin": min(limits) if limits else None,
        }
        if fee_clauses:
            key = "feeInterval" if metered else "interval"
            rule[key] = "; ".join(sorted(set(fee_clauses)))
        if permit:
            rule["permitExcepted"] = True
        if cut and cut < 24 * 60:
            rule["cutOffMin"] = cut
        return {k: v for k, v in rule.items() if v is not None}
    if any(w in t for w in BAN_WORDS):
        kind = "no_stopping" if "no stopping" in t else "no_parking"
        rule = {"kind": kind}
        if fee_clauses:
            rule["banInterval"] = "; ".join(sorted(set(fee_clauses)))
        return rule
    return None


def max_price(fee_text):
    prices = [float(x) for x in re.findall(r"\$\s*([\d.]+)", fee_text or "")]
    return max(prices) if prices else None


def sign_side(text):
    m = re.search(r"\b(lr|l|r)\s*$", text.strip().lower())
    return m.group(1).upper() if m else "LR"


# ── download + parse ─────────────────────────────────────────────────────────

def load_layer(name):
    # curl (not urllib) so we use the system cert store behind the proxy.
    raw = subprocess.run(
        ["curl", "-sSL", SOURCES[name]], capture_output=True, check=True
    ).stdout
    zf = zipfile.ZipFile(io.BytesIO(raw))
    shp = dbf = None
    for n in zf.namelist():
        if n.lower().endswith(".shp"):
            shp = read_shp_points(zf.read(n))
        elif n.lower().endswith(".dbf"):
            dbf = read_dbf(zf.read(n))
    out = []
    for pt, row in zip(shp, dbf):
        if pt:
            lon, lat = mga56_to_wgs84(*pt)
            out.append((lat, lon, row))
    return out


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    print("▸ Loading street network…")
    with open(DATA_PATH) as f:
        coll = json.load(f)
    streets = coll["features"]

    CELL = 0.004
    grid = {}
    for feat in streets:
        if feat["geometry"].get("type") != "LineString":
            continue
        c = feat["geometry"]["coordinates"]
        lon, lat = c[len(c) // 2]
        grid.setdefault((round(lat / CELL), round(lon / CELL)), []).append(feat)

    def nearest(lat, lon, maxm):
        best, bd = None, maxm
        cl, co = round(lat / CELL), round(lon / CELL)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for feat in grid.get((cl + dy, co + dx), []):
                    d = dist_to_line(lat, lon, feat["geometry"]["coordinates"])
                    if d < bd:
                        best, bd = feat, d
        return best

    def rank(rule):
        # prefer richer, park-able info when a street collects several signs
        order = {"paid": 3, "free_limited": 2, "no_parking": 1, "no_stopping": 0}
        r = order.get(rule.get("kind"), 0)
        if rule.get("pricePerHour"):
            r += 0.5
        if rule.get("maxstayMin"):
            r += 0.3
        return r

    def apply_rule(feat, rule, side):
        p = feat["properties"]
        parkable = rule["kind"] in ("paid", "free_limited")
        slot = "left" if parkable else "right"
        cur = p.get(slot)
        if not cur or rank(rule) > rank(cur):
            p[slot] = rule
        if side == "LR" and parkable:
            p["right"] = rule
        # street category = its best park-able state, else the ban
        if parkable:
            p["cat"] = rule["kind"]
            if rule.get("zone") and not p.get("zone"):
                p["zone"] = rule["zone"]
        elif p.get("cat") == "unknown":
            p["cat"] = rule["kind"]

    stats = {"signs": 0, "meters": 0, "loading": 0, "pudo": 0}

    # 1 ── traffic & parking signs ──────────────────────────────────────────
    print("▸ Signs…")
    for lat, lon, row in load_layer("signs"):
        if not row.get("SignType", "").startswith("reg"):
            continue
        text = row.get("Sign", "")
        rule = parse_restriction(text)
        if not rule:
            continue
        st = nearest(lat, lon, SNAP_M)
        if st:
            apply_rule(st, rule, sign_side(text))
            stats["signs"] += 1

    # 2 ── metered streets (with tariff) ────────────────────────────────────
    print("▸ Meters…")
    for lat, lon, row in load_layer("meters"):
        combined = " ".join(row.get(f"Restr{i}", "") for i in range(1, 6))
        rule = parse_restriction(combined, phe=(row.get("PHE", "").lower() == "yes"))
        if not rule:
            continue
        price = max_price(row.get("ParkFee"))
        if price:
            rule["pricePerHour"] = price
            rule["kind"] = "paid"
            rule["zone"] = "meter"
            # A metered kerb's time windows are fee windows, not bans — reclassify
            # if the combined text led with a loading/ban clause.
            if "banInterval" in rule and "feeInterval" not in rule:
                rule["feeInterval"] = rule.pop("banInterval")
        st = nearest(lat, lon, SNAP_M)
        if st:
            apply_rule(st, rule, "LR")
            stats["meters"] += 1

    # 3 ── loading / truck zones ────────────────────────────────────────────
    print("▸ Loading zones…")
    for lat, lon, row in load_layer("loading"):
        rule = parse_restriction(row.get("ParkRestr", "")) or {"kind": "no_parking", "zone": "loading"}
        rule.setdefault("zone", "loading")
        st = nearest(lat, lon, SNAP_M)
        if st:
            apply_rule(st, rule, "LR")
            stats["loading"] += 1

    # 4 ── Kiss & Ride (PUDO) ───────────────────────────────────────────────
    print("▸ Kiss & Ride (PUDO)…")
    for lat, lon, row in load_layer("pudo"):
        st = nearest(lat, lon, SNAP_M)
        if st:
            st["properties"]["left"] = {"kind": "no_parking", "zone": "kiss_ride"}
            st["properties"]["zone"] = "kiss_ride"
            if st["properties"].get("cat") == "unknown":
                st["properties"]["cat"] = "no_parking"
            stats["pudo"] += 1

    coll.setdefault("metadata", {})["generated"] = __import__("datetime").datetime.now().isoformat()
    prev = coll["metadata"].get("enriched", "")
    _p = "Waverley open data (signs, meters, loading, PUDO)"
    coll["metadata"]["enriched"] = prev if _p in prev else (prev + " + " + _p).strip(" +")
    with open(DATA_PATH, "w") as f:
        json.dump(coll, f)

    classified = sum(1 for f in streets if f["properties"]["cat"] != "unknown")
    print("\n✓ Waverley enrichment complete")
    for k, v in stats.items():
        print(f"  {k}: {v} streets tagged")
    print(f"  {classified} classified / {len(streets)} total streets")


if __name__ == "__main__":
    main()
