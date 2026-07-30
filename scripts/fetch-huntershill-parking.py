#!/usr/bin/env python3
"""
Hunters Hill Council resident-permit enrichment.

Hunters Hill operates a single resident parking scheme — the Woolwich Area (W1),
an area-wide sign-posted scheme covering the Woolwich peninsula. Permits exempt
residents from time restrictions in sign-posted areas within W1.
(https://www.huntershill.nsw.gov.au/Roads/Parking/Woolwich-Area-W1-Resident-Parking-Permits)

The scheme has no per-street gazette; the permit area is the whole peninsula, so
the street schedule is the set of peninsula streets within the W1 bounding box.

Run:  python3 scripts/fetch-huntershill-parking.py
"""

import json
import os

from lib_enrich import apply_residents

HERE = os.path.dirname(os.path.abspath(__file__))
PERMIT_PATH = os.path.join(HERE, "data", "huntershill-permit-areas.json")

# Woolwich peninsula bbox
WOOLWICH_BBOX = (-33.844, -33.834, 151.168, 151.182)  # minLat, maxLat, minLon, maxLon


def apply():
    areas = json.load(open(PERMIT_PATH))
    # Single compact area within a tight peninsula bbox — no LGA-wide over-match
    # to filter, so the spatial-coherence guard is off (it would clip legit
    # peripheral streets of the one connected zone).
    apply_residents("Hunters Hill", WOOLWICH_BBOX, areas,
                    "Hunters Hill (Woolwich W1) resident-permit area", cluster=False)


if __name__ == "__main__":
    apply()
