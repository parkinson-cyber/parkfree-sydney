#!/usr/bin/env python3
"""
Willoughby Council (Chatswood CBD) parking enrichment — northern coverage.

North Sydney Council publishes NO open parking data (only flood studies; their
live map is a token-gated Cadcorp image viewer). The nearest usable northern
data is Willoughby Council's street-parking-sign survey for the Chatswood CBD,
published open via TfNSW / Data.NSW as a CSV (Easting/Northing in EPSG:28356,
up to 4 categorised signs per point with "Max Dur." descriptions).

Run:  python3 scripts/fetch-willoughby-parking.py
"""

import csv
import io
import json
import math
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "src", "data", "parking.json")
CSV_URL = ("https://opendata.transport.nsw.gov.au/data/dataset/"
           "7e150818-58c2-43ac-89cb-529cd244b073/resource/"
           "6524a6bf-fe7e-4478-b6fa-74a52137ae8a/download/"
           "willoughby_council_street_parking_signs_data.csv")
SNAP_M = 35

# ── inverse transverse Mercator: EPSG:28356 → WGS84 (shared with Waverley) ────
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


# ── description parsing ───────────────────────────────────────────────────────

def _t2m(h, mn, ap):
    hh = int(h) % 12
    if ap == "p":
        hh += 12
    return hh * 60 + int(mn or 0)


def _hhmm(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def _days(seg):
    if "m-f" in seg:
        return "Mo-Fr"
    if re.search(r"\bsa\b", seg):
        return "Sa"
    if re.search(r"\bsu\b", seg):
        return "Su"
    return "Mo-Su"


def parse_desc(desc):
    """'Max Dur. 2 hours 8:30a - 6:00p M-F; ... Sa' → (maxstayMin, interval, cutOff)."""
    d = desc.lower()
    hrs = re.search(r"(\d+)\s*hour", d)
    mins = re.search(r"(\d+)\s*minute", d)
    maxstay = int(hrs.group(1)) * 60 if hrs else (int(mins.group(1)) if mins else None)
    clauses, cut = [], 0
    for seg in d.split(";"):
        m = re.search(r"(\d{1,2}):(\d{2})\s*([ap])\s*-\s*(\d{1,2}):(\d{2})\s*([ap])", seg)
        if not m:
            continue
        start = _t2m(m.group(1), m.group(2), m.group(3))
        end = _t2m(m.group(4), m.group(5), m.group(6))
        if end == 0:
            end = 24 * 60
        cut = max(cut, end)
        clauses.append(f"{_days(seg)} {_hhmm(start)}-{_hhmm(end)}")
    return maxstay, "; ".join(sorted(set(clauses))) or None, (cut if 0 < cut < 24 * 60 else None)


BAN_CATS = ("no stopping", "no parking", "bus zone", "clearway", "towaway",
            "works zone", "truck zone", "mail zone", "taxi zone",
            "disabled parking", "motorbikes only")


def parse_sign(category, desc):
    c = category.lower().strip()
    if not c:
        return None
    if "loading" in c:
        rule = {"kind": "no_parking", "zone": "loading"}
        _, iv, _ = parse_desc(desc)
        if iv:
            rule["banInterval"] = iv
        return rule
    if "no stopping" in c:
        return {"kind": "no_stopping"}
    if any(b in c for b in BAN_CATS):
        return {"kind": "no_parking"}
    if "unrestricted" in c:
        return {"kind": "free"}
    if "metered" in c or "restricted" in c:
        maxstay, iv, cut = parse_desc(desc)
        metered = "metered" in c
        rule = {"kind": "paid" if metered else "free_limited"}
        if metered:
            rule["zone"] = "meter"
        if maxstay:
            rule["maxstayMin"] = maxstay
        if iv:
            rule["feeInterval" if metered else "interval"] = iv
        if cut:
            rule["cutOffMin"] = cut
        if "exempt" in desc.lower() or "excepted" in desc.lower():
            rule["permitExcepted"] = True
        return rule
    return None


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
                    dd = dist_to_line(lat, lon, feat["geometry"]["coordinates"])
                    if dd < bd:
                        best, bd = feat, dd
        return best

    order = {"paid": 3, "free_limited": 2, "free": 1.5, "no_parking": 1, "no_stopping": 0}

    def rank(rule):
        r = order.get(rule.get("kind"), 0)
        if rule.get("maxstayMin"):
            r += 0.3
        return r

    def apply_rule(feat, rule, direction):
        p = feat["properties"]
        parkable = rule["kind"] in ("paid", "free_limited", "free")
        slot = "left" if parkable else "right"
        if not p.get(slot) or rank(rule) > rank(p[slot]):
            p[slot] = rule
        if direction == "both" and parkable:
            p["right"] = rule
        if parkable:
            p["cat"] = rule["kind"]
            if rule.get("zone") and not p.get("zone"):
                p["zone"] = rule["zone"]
        elif p.get("cat") == "unknown":
            p["cat"] = rule["kind"]

    print("▸ Fetching Willoughby (Chatswood) signs…")
    raw = subprocess.run(["curl", "-sSL", CSV_URL], capture_output=True, check=True).stdout
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))

    tagged = 0
    for row in rows:
        try:
            E, N = float(row["Eastin"]), float(row["Northing"])
        except (ValueError, KeyError):
            continue
        lon, lat = mga56_to_wgs84(E, N)
        st = nearest(lat, lon, SNAP_M)
        if not st:
            continue
        applied = False
        for i in (1, 2, 3, 4):
            rule = parse_sign(row.get(f"sign{i}_category", ""), row.get(f"sign{i}_description", ""))
            if rule:
                apply_rule(st, rule, row.get(f"sign{i}_direction", "both"))
                applied = True
        if applied:
            tagged += 1

    coll.setdefault("metadata", {})
    prev = coll["metadata"].get("enriched", "")
    _p = "Willoughby/Chatswood signs"
    coll["metadata"]["enriched"] = prev if _p in prev else (prev + " + " + _p).strip(" +")
    coll["metadata"]["generated"] = __import__("datetime").datetime.now().isoformat()
    with open(DATA_PATH, "w") as f:
        json.dump(coll, f)

    classified = sum(1 for x in streets if x["properties"]["cat"] != "unknown")
    print(f"\n✓ Chatswood enrichment complete: {tagged} sign points applied")
    print(f"  {classified} classified / {len(streets)} total streets")


if __name__ == "__main__":
    main()
