#!/usr/bin/env python3
"""
Lane Cove Council resident-permit enrichment — 5 zones covering Lane Cove West,
Lane Cove North, Lane Cove, Greenwich, and St Leonards.

Source (2026-09-08): the council's *Management Directive - Parking Permits*
(TRIM 1211105, ecouncil.lanecove.nsw.gov.au) carries a text schedule "CURRENT
RESIDENTIAL & VISITOR PARKING SCHEME" listing every street per zone, with the
property numbers each zone covers. That replaced the July 2026 list that had
been read off the raster "Residential Parking Scheme Map" — the map reading
over-tagged badly (Zone 1 is three partial streets, not 25).

Many entries are partial ("ONLY even Nos 22-36"). OSM segments carry no house
numbers, so the whole street is tagged and the `partial` note is folded into
permitLabel so the street sheet tells the driver which part the scheme covers.

Zones render as free_limited "Timed visitor parking — Lane Cove Zone N permit
holders excepted. Check the sign for the limit."

Run:  python3 scripts/fetch-lanecove-parking.py
"""

import json
import os

from lib_enrich import apply_residents

HERE = os.path.dirname(os.path.abspath(__file__))
PERMIT_PATH = os.path.join(HERE, "data", "lanecove-permit-areas.json")

# Lane Cove LGA — from Lane Cove West peninsula across to St Leonards
LANECOVE_BBOX = (-33.840, -33.790, 151.140, 151.215)  # minLat, maxLat, minLon, maxLon


def apply():
    areas = json.load(open(PERMIT_PATH))
    apply_residents("Lane Cove", LANECOVE_BBOX, areas,
                    "Lane Cove resident-permit zones (council schedule, TRIM 1211105)")


if __name__ == "__main__":
    apply()
