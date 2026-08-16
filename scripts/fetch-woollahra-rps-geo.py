#!/usr/bin/env python3
"""
Woollahra Council resident-permit enrichment — authoritative per-property data.

Supersedes fetch-woollahra-parking.py + scripts/data/woollahra-permit-areas.json
(street list manually transcribed from a PDF map pulled off the Internet
Archive, since the council's own site 403s automated fetches). That
transcription had real, verifiable errors: three whole zones (Bellevue Hill 1,
Darling Point, Rose Bay 1) were missing entirely, and every other zone had
mismatched streets when checked against the source below.

Woollahra runs a public ArcGIS Feature Service backing their own "Are you
eligible for a resident parking permit?" address-check tool on the council
website. It is NOT on the council's own domain (services3.arcgis.com, an Esri
cloud tenant) so it isn't behind whatever blocks the main site:

    https://services3.arcgis.com/zjbesynggtrdwb3p/arcgis/rest/services/
        Resident_Parking_Scheme_Address_Check/FeatureServer/0/query

Unlike Randwick's polygon layer, this is a POINT layer: one record per
property address that's actually inside a scheme, each carrying its street
name and the zone name directly (`res_pk`, e.g. "Bellevue Hill 2") — no
point-in-polygon needed, just aggregate by street name. 15,809 property
records across 18 zones as of this writing.

Run:  python3 scripts/fetch-woollahra-rps-geo.py
"""

import json
import os
import urllib.parse
import urllib.request

from lib_enrich import apply_residents

HERE = os.path.dirname(os.path.abspath(__file__))

QUERY_URL = (
    "https://services3.arcgis.com/zjbesynggtrdwb3p/arcgis/rest/services/"
    "Resident_Parking_Scheme_Address_Check/FeatureServer/0/query"
)

# Same bbox the old script used — Rushcutters Bay/Paddington west across to
# Watsons Bay/South Head, harbour foreshore to the Oxford St ridge.
WOOLLAHRA_BBOX = (-33.895, -33.835, 151.225, 151.290)  # minLat, maxLat, minLon, maxLon


def fetch_all_records():
    records = []
    offset = 0
    page = 2000
    while True:
        params = {
            "where": "1=1",
            "outFields": "street,suburb,res_pk",
            "returnGeometry": "false",
            "resultOffset": offset,
            "resultRecordCount": page,
            "f": "json",
        }
        url = QUERY_URL + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": "ParkFreeSydney/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
        feats = data.get("features", [])
        records.extend(f["attributes"] for f in feats)
        if len(feats) < page:
            break
        offset += page
    return records


def clean_street(rec):
    """'Aston Gardens BELLEVUE HILL' + suburb 'BELLEVUE HILL' -> 'Aston Gardens'."""
    s = rec.get("street") or ""
    suburb = (rec.get("suburb") or "").strip()
    if suburb and s.upper().endswith(suburb.upper()):
        s = s[: -len(suburb)].strip()
    return s.strip()


def main():
    print("▸ Fetching Woollahra's resident-parking address-check layer…")
    records = fetch_all_records()
    print(f"  {len(records)} property records")

    zone_streets = {}
    for r in records:
        zone = r.get("res_pk")
        name = clean_street(r)
        if not zone or not name:
            continue
        zone_streets.setdefault(zone, set()).add(name)

    print(f"  {len(zone_streets)} zones: {', '.join(sorted(zone_streets))}")

    areas = {
        zone.replace(" ", "_"): {"label": zone, "streets": sorted(streets)}
        for zone, streets in zone_streets.items()
    }

    apply_residents(
        "Woollahra", WOOLLAHRA_BBOX, areas,
        "Woollahra resident-parking-scheme address-check layer "
        "(authoritative, supersedes the old PDF-transcribed schedule)",
    )


if __name__ == "__main__":
    main()
