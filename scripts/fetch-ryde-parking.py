#!/usr/bin/env python3
"""
City of Ryde resident-permit enrichment — north-west (Ryde) coverage.

Ryde publishes its Resident Parking Scheme as a 9-page "permit-parking-maps.pdf"
(zones 1, 3, 4, 6-11) — each page a street map with the eligible properties
colour-shaded, no machine-readable street schedule. The PDF was retrieved from
the Internet Archive (the live council file 403s automated fetches) and the
shaded streets read off each zone map by rendering it to a high-res PNG and
transcribing the highlighted street names, region by region — the same
vision-derived approach used for Mosman and Randwick. The result is committed
to scripts/data/ryde-permit-areas.json.

Coverage is intentionally the clearly-shaded streets only; zone 3 (a large
North Ryde block) is transcribed from its principal shaded streets. Boundary
arterials (Epping Rd, Lane Cove Rd, Herring Rd) are deliberately excluded — they
edge the zones but are not permit streets.

Every zone renders as free_limited "Timed visitor parking — Ryde Zone N permit
holders excepted", matching the North Sydney / City of Sydney treatment.

Run:  python3 scripts/fetch-ryde-parking.py
"""

import json
import os

from lib_enrich import apply_residents

HERE = os.path.dirname(os.path.abspath(__file__))
PERMIT_PATH = os.path.join(HERE, "data", "ryde-permit-areas.json")

# City of Ryde LGA bbox (Meadowbank/West Ryde in the west across to Macquarie
# Park/North Ryde/Marsfield in the east; Gladesville on the southern edge).
RYDE_BBOX = (-33.835, -33.760, 151.060, 151.155)  # minLat, maxLat, minLon, maxLon


def apply():
    areas = json.load(open(PERMIT_PATH))
    apply_residents("Ryde", RYDE_BBOX, areas,
                    "City of Ryde resident-permit zones (partial, vision-derived)")


if __name__ == "__main__":
    apply()
