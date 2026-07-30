#!/usr/bin/env python3
"""
Burwood Council resident-permit enrichment.

Burwood operates 19 permit parking areas (Areas 1–19 including 4a) covering
suburbs within the Burwood LGA: Burwood, Burwood Heights, Croydon Park,
and parts of Enfield. Streets derived from the council's Permit Parking Scheme
maps (M551-1 through M551-19, March 2024) obtained from:
https://www.burwood.nsw.gov.au/files/sharedassets/public/v/3/parking/permit-parking-areas.pdf

Run:  python3 scripts/fetch-burwood-parking.py
"""

import json
import os

from lib_enrich import apply_residents

HERE = os.path.dirname(os.path.abspath(__file__))
PERMIT_PATH = os.path.join(HERE, "data", "burwood-permit-areas.json")

# Burwood LGA bbox
BURWOOD_BBOX = (-33.900, -33.855, 151.085, 151.140)  # minLat, maxLat, minLon, maxLon


def apply():
    areas = json.load(open(PERMIT_PATH))
    apply_residents("Burwood", BURWOOD_BBOX, areas,
                    "Burwood resident-permit areas (vision-derived)")


if __name__ == "__main__":
    apply()
