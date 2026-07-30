#!/usr/bin/env python3
"""
Woollahra Council resident-permit enrichment — eastern harbourside coverage.

Woollahra publishes a clean, machine-readable street schedule for its Resident
Parking scheme: "Resident Parking Zones — Streets Included" (TRIM 15/70694),
a 5-page PDF listing every street in each named zone (Bellevue Hill, Darling
Point, Double Bay, Edgecliff 1-2, Paddington 1-6, Rose Bay 1-2, Rushcutters
Bay, Watsons Bay, Woollahra 1-2). The council website sits behind Akamai and
403s automated fetches; the schedule was retrieved from the Internet Archive
(a separate public archive, not a bypass of the block) and parsed column-aware
(zone-name column vs street column by x-position) into
scripts/data/woollahra-permit-areas.json.

Every zone renders as free_limited "Timed visitor parking — <zone> permit
holders excepted", matching how North Sydney / City of Sydney resident
precincts are treated.

Run:  python3 scripts/fetch-woollahra-parking.py
"""

import json
import os

from lib_enrich import apply_residents

HERE = os.path.dirname(os.path.abspath(__file__))
PERMIT_PATH = os.path.join(HERE, "data", "woollahra-permit-areas.json")

# Woollahra LGA bbox: Rushcutters Bay/Paddington in the west across to Watsons
# Bay / South Head in the east, harbour foreshore to Oxford St ridge.
WOOLLAHRA_BBOX = (-33.895, -33.835, 151.225, 151.290)  # minLat, maxLat, minLon, maxLon


def apply():
    areas = json.load(open(PERMIT_PATH))
    apply_residents("Woollahra", WOOLLAHRA_BBOX, areas,
                    "Woollahra resident-permit zones")


if __name__ == "__main__":
    apply()
