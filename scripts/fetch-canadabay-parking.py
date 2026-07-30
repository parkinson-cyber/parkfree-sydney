#!/usr/bin/env python3
"""
City of Canada Bay resident-permit enrichment.

Canada Bay operates 6 permit parking areas. This script covers Area 6 — the
Five Dock Permit Parking Scheme implemented November 2023, with streets derived
from the publicly downloadable "Five Dock PPS Restrictions 2023" PDF map
(collaborate.canadabay.nsw.gov.au/download_file/7587/1855). Streets with
green (2P PERMIT HOLDERS EXCEPTED) and brown (4P PERMIT HOLDERS EXCEPTED)
markings are included.

Areas 1-5 (Drummoyne, Chiswick, Strathfield, Concord West) are omitted for
now — their street schedules are behind a login wall on the council website;
add them to scripts/data/canadabay-permit-areas.json when a source is found.

Run:  python3 scripts/fetch-canadabay-parking.py
"""

import json
import os

from lib_enrich import apply_residents

HERE = os.path.dirname(os.path.abspath(__file__))
PERMIT_PATH = os.path.join(HERE, "data", "canadabay-permit-areas.json")

# Five Dock town centre bbox
CANADABAY_BBOX = (-33.875, -33.845, 151.120, 151.160)  # minLat, maxLat, minLon, maxLon


def apply():
    areas = json.load(open(PERMIT_PATH))
    apply_residents("Canada Bay", CANADABAY_BBOX, areas,
                    "Canada Bay (Five Dock Area 6) resident-permit areas (partial)")


if __name__ == "__main__":
    apply()
