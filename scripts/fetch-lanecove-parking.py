#!/usr/bin/env python3
"""
Lane Cove Council resident-permit enrichment — 5 zones covering Lane Cove West,
Lane Cove North, Lane Cove, Greenwich, and St Leonards.

Lane Cove publishes its Residential Parking Scheme as a single visual map PDF
("Residential Parking Scheme Map", July 2018, via ecouncil.lanecove.nsw.gov.au).
The PDF is one page, text-only zone/suburb labels but no machine-readable street
schedule — streets were read off the rendered high-res map image zone by zone.

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
                    "Lane Cove resident-permit zones (vision-derived)")


if __name__ == "__main__":
    apply()
