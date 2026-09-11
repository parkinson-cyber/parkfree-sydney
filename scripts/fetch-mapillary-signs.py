#!/usr/bin/env python3
"""Parking signs from Mapillary street-level imagery.

Why this and not Street View: Google's terms forbid building a derived dataset
from their imagery, and 62,000 unknown segments is not a thing a person can
look at one at a time. Mapillary publishes the same kind of photography under
CC BY-SA with a free API, and - the part that matters - it has already run sign
detection over it, so a parking sign is a *point with a class and a photo*
rather than a picture someone has to find.

What it can and cannot do, honestly:

  * The detector's classes are built around MUTCD and European signs. An
    Australian time plate ("2P 8:30AM-6PM MON-FRI") is not one of them, so a
    detection tells us *a parking sign is here*, not what it says. That still
    has value - it marks which kerbs are signed at all - but the hours must be
    read off the image, which is a second step and stays a human/vision job.
  * Coverage is crowd-sourced: good along main roads, thin in back streets.
  * Detections are observations, not law. Nothing here may set a segment to
    free. This script writes *leads* - where to look - and never writes into
    parking.json.

Needs a free Mapillary token in MAPILLARY_TOKEN (or ../.secrets/mapillary.env).

    python3 scripts/fetch-mapillary-signs.py --bbox 151.19,-33.84,151.22,-33.82
    python3 scripts/fetch-mapillary-signs.py --unknown-streets 200
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "mapillary-sign-leads.json")
SECRETS = os.path.join(HERE, "..", "..", ".secrets", "mapillary.env")
API = "https://graph.mapillary.com"

# Mapillary's own class names. Parking-relevant regulatory classes; the list is
# deliberately broad because the Australian equivalents map loosely onto these.
WANTED = (
    "regulatory--no-parking",
    "regulatory--no-stopping",
    "regulatory--no-standing",
    "regulatory--parking-restrictions",
    "regulatory--time-limited-parking",
    "regulatory--permit-parking",
    "information--parking",
    "complementary--time-limit",
)


def token():
    t = os.environ.get("MAPILLARY_TOKEN")
    if t:
        return t.strip()
    try:
        for line in open(SECRETS):
            if line.startswith("MAPILLARY_TOKEN"):
                return line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    sys.exit(
        "No Mapillary token. Create one free at https://www.mapillary.com/dashboard/developers\n"
        "then:  export MAPILLARY_TOKEN=MLY|...   (or put it in ../.secrets/mapillary.env)"
    )


def fetch(url, tok):
    req = urllib.request.Request(url, headers={
        "Authorization": f"OAuth {tok}",
        "User-Agent": "ParkFreeSydney/1.0",
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(2 ** attempt * 2)
                continue
            raise
    return {}


def signs_in(bbox, tok):
    """bbox is west,south,east,north in degrees."""
    q = urllib.parse.urlencode({
        "fields": "id,object_value,geometry,first_seen_at,last_seen_at,images",
        "bbox": ",".join(str(v) for v in bbox),
        "object_types": "traffic_sign",
        "limit": 2000,
    })
    data = fetch(f"{API}/map_features?{q}", tok)
    out = []
    for f in data.get("data", []):
        val = f.get("object_value", "")
        if not any(val.startswith(w) for w in WANTED):
            continue
        lon, lat = f["geometry"]["coordinates"]
        out.append({
            "id": f["id"],
            "class": val,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "lastSeen": f.get("last_seen_at"),
            # Attribution is a licence condition, not a nicety.
            "image": f"https://www.mapillary.com/app/?focus=map&lat={lat}&lng={lon}&z=20",
            "licence": "CC BY-SA 4.0, Mapillary contributors",
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", help="west,south,east,north in degrees")
    ap.add_argument("--tile", type=float, default=0.02,
                    help="split the bbox into tiles this many degrees wide (the API caps a query)")
    args = ap.parse_args()
    if not args.bbox:
        sys.exit("give --bbox west,south,east,north")
    tok = token()
    w, s, e, n = (float(v) for v in args.bbox.split(","))

    found, tiles = [], 0
    y = s
    while y < n:
        x = w
        while x < e:
            tiles += 1
            found += signs_in((x, y, min(x + args.tile, e), min(y + args.tile, n)), tok)
            time.sleep(0.2)
            x += args.tile
        y += args.tile

    uniq = {f["id"]: f for f in found}
    by_class = {}
    for f in uniq.values():
        by_class[f["class"]] = by_class.get(f["class"], 0) + 1
    payload = {
        "_source": "Mapillary traffic-sign detections (CC BY-SA 4.0, Mapillary contributors). "
                   "These are observations of where a parking sign stands, not what it says, "
                   "and never set a street's rules on their own.",
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "bbox": [w, s, e, n],
        "byClass": by_class,
        "signs": sorted(uniq.values(), key=lambda f: (f["lat"], f["lon"])),
    }
    json.dump(payload, open(OUT, "w"), indent=1)
    print(f"{tiles} tiles → {len(uniq)} parking-sign detections → {OUT}")
    for k, v in sorted(by_class.items(), key=lambda kv: -kv[1]):
        print(f"  {v:5}  {k}")


if __name__ == "__main__":
    main()
