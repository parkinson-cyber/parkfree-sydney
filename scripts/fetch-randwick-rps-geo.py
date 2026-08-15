#!/usr/bin/env python3
"""
Randwick City Council resident-permit enrichment — authoritative GIS boundaries.

Supersedes the old fetch-randwick-parking.py approach (9 of 27+ areas,
manually transcribed from visually reading individual PDF maps — see that
file's docstring for why). Randwick runs a public ArcGIS REST service backing
their own "check my address" permit-area map, and it is NOT behind the
Cloudflare bot-protection that blocks the main website — a plain HTTPS GET
returns every current resident-parking-area polygon as GeoJSON, no browser
needed:

    https://mapservices.randwick.nsw.gov.au/arcgis/rest/services/
        extTransport/ResidentParkingArea/MapServer/0/query
        ?where=1=1&outFields=rpsArea,rpsZone,rpsLabel,status
        &returnGeometry=true&outSR=4326&f=geojson

That's all 31 areas (CL1, CO1-6, KF1-4, KN1-3, MB1, MJ1-4, RA1-11, SP1) with
real polygon boundaries, not the 9 this repo had names for previously. Every
'unknown' street inside Randwick's fetch areas gets point-in-polygon tested
against all 31 and tagged if it lands inside one.

Scope, honestly stated: this is Randwick's resident PERMIT scheme layer only.
Unlike Waverley (scripts/fetch-waverley-parking.py), Randwick does not publish
open data for meters, loading zones, or general time-limited signage, so a
street outside every polygon here could still be metered or timed elsewhere —
it is NOT safe to default those to 'free' the way Waverley's complete sign
census allowed. This script only ever produces 'residents' tags or leaves a
street untouched.

Run:  python3 scripts/fetch-randwick-rps-geo.py
"""

import json
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "src", "data", "parking.json")

RPS_QUERY_URL = (
    "https://mapservices.randwick.nsw.gov.au/arcgis/rest/services/"
    "extTransport/ResidentParkingArea/MapServer/0/query"
    "?where=1%3D1&outFields=rpsArea,rpsZone,rpsLabel,status"
    "&returnGeometry=true&outSR=4326&f=geojson"
)

# Randwick LGA bbox (covers Bondi/Coogee/Kingsford/Maroubra/Randwick/Centennial
# Park catchment already fetched into src/data/parking.json's 'east' area) —
# skip point-in-polygon testing for streets nowhere near Randwick at all, same
# guard the old script used.
RANDWICK_BBOX = (-33.9990, -33.8700, 151.2200, 151.2900)  # minLat,maxLat,minLon,maxLon


def in_randwick_bbox(coords):
    a, b, c, d = RANDWICK_BBOX
    return any(a <= lat <= b and c <= lon <= d for lon, lat in coords)


def fetch_rps_polygons():
    req = urllib.request.Request(RPS_QUERY_URL, headers={"User-Agent": "ParkFreeSydney/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def point_in_ring(x, y, ring):
    """Standard ray-casting even-odd test against a single linear ring."""
    inside = False
    n = len(ring)
    x1, y1 = ring[0]
    for i in range(1, n + 1):
        x2, y2 = ring[i % n]
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-15) + x1):
            inside = not inside
        x1, y1 = x2, y2
    return inside


def point_in_polygon(x, y, rings):
    """XOR across every ring so holes (opposite-wound inner rings) subtract correctly."""
    inside = False
    for ring in rings:
        if point_in_ring(x, y, ring):
            inside = not inside
    return inside


def point_in_feature(x, y, geom):
    if geom["type"] == "Polygon":
        return point_in_polygon(x, y, geom["coordinates"])
    if geom["type"] == "MultiPolygon":
        return any(point_in_polygon(x, y, poly) for poly in geom["coordinates"])
    return False


def main():
    print("▸ Fetching Randwick's resident-parking-area GIS layer…")
    fc = fetch_rps_polygons()
    areas = [f for f in fc["features"] if f["properties"].get("status") == "Current"]
    print(f"  {len(areas)} current permit areas: "
          + ", ".join(sorted(a["properties"]["rpsZone"] for a in areas)))

    print("▸ Loading street network…")
    coll = json.load(open(DATA_PATH))
    streets = coll["features"]
    before = sum(1 for f in streets if f["properties"]["cat"] != "unknown")

    candidates = [
        f for f in streets
        if f["properties"]["cat"] == "unknown" and f["properties"].get("name")
        and in_randwick_bbox(f["geometry"]["coordinates"])
    ]
    print(f"▸ Point-in-polygon testing {len(candidates)} unclassified streets "
          f"in the Randwick catchment against {len(areas)} areas…")

    applied = 0
    per_area = {}
    for feat in candidates:
        p = feat["properties"]
        coords = feat["geometry"]["coordinates"]
        mx, my = coords[len(coords) // 2]  # midpoint vertex, same convention as lib_enrich.py
        for area in areas:
            ap = area["properties"]
            if point_in_feature(mx, my, area["geometry"]):
                rule = {
                    "kind": "residents",
                    "zone": "residential",
                    "permitExcepted": True,
                    "permitArea": ap["rpsZone"],
                    "permitLabel": f"{ap['rpsArea']} - {ap['rpsZone']}",
                }
                p["left"] = dict(rule)
                p["right"] = dict(rule)
                p["cat"] = "residents"
                p["zone"] = "residential"
                applied += 1
                per_area[ap["rpsZone"]] = per_area.get(ap["rpsZone"], 0) + 1
                break  # areas don't overlap; first hit wins

    coll.setdefault("metadata", {})
    prev = coll["metadata"].get("enriched", "")
    phrase = "Randwick resident-parking-area GIS layer (all 31 current areas, point-in-polygon)"
    coll["metadata"]["enriched"] = prev if phrase in prev else (prev + " + " + phrase).strip(" +")
    coll["metadata"]["generated"] = __import__("datetime").datetime.now().isoformat()
    json.dump(coll, open(DATA_PATH, "w"))

    after = sum(1 for f in streets if f["properties"]["cat"] != "unknown")
    print(f"\n✓ Randwick GIS enrichment complete: {applied} street segments tagged")
    for zone in sorted(per_area):
        print(f"    {zone}: {per_area[zone]} streets")
    print(f"  classified {before} -> {after} (+{after - before}) overall")


if __name__ == "__main__":
    main()
