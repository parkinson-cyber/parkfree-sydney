#!/usr/bin/env python3
"""
Strathfield Council resident-permit enrichment.

Strathfield operates six resident parking schemes (RPS1, RPS10, RPS20, RPS30,
RPS40, RPS50) across Strathfield, Homebush, Homebush West and Greenacre. Street
schedules were vision-derived from the council's published RPS boundary maps at:
https://www.strathfield.nsw.gov.au/Live/Roads-Footpaths-and-Traffic/Resident-Parking-Scheme

Each RPS is a small sub-area within a large LGA, and several of its streets
(Albert Road, Margaret Street, Station Street, Wentworth Street, Telopea Avenue)
share names with unrelated streets elsewhere in the LGA. To avoid falsely tagging
those, each scheme is matched only within its own tight bounding box rather than
one LGA-wide box. Major arterial boundaries (Homebush Road, The Boulevarde,
Parramatta Road) are excluded — only interior residential streets are tagged, so
this is a close-but-partial reconstruction of the sign-posted extents.

Run:  python3 scripts/fetch-strathfield-parking.py
"""

import json
import os

from lib_enrich import apply_residents

HERE = os.path.dirname(os.path.abspath(__file__))
PERMIT_PATH = os.path.join(HERE, "data", "strathfield-permit-areas.json")

# Tight per-scheme bboxes (minLat, maxLat, minLon, maxLon), one per RPS footprint.
AREA_BBOX = {
    "rps1":  (-33.8770, -33.8680, 151.0840, 151.0945),  # Strathfield stn precinct
    "rps10": (-33.8810, -33.8730, 151.0850, 151.0960),  # Homebush Rd/Boulevarde/Albyn
    "rps20": (-33.8670, -33.8580, 151.0710, 151.0880),  # Homebush/Flemington + Loftus
    "rps30": (-33.8660, -33.8530, 151.0750, 151.0890),  # Homebush West / railway
    "rps40": (-33.9020, -33.8970, 151.0660, 151.0750),  # Wentworth St, Greenacre
    "rps50": (-33.8670, -33.8600, 151.0620, 151.0710),  # Courallie/Mandemar/Marlborough
}


def apply():
    areas = json.load(open(PERMIT_PATH))
    total = 0
    for key, area in areas.items():
        bbox = AREA_BBOX[key]
        # Each RPS already has its own tight bbox, so the spatial-coherence
        # guard isn't needed here and would clip legit spread-out segments.
        applied, _, _ = apply_residents(
            f"Strathfield {area['label']}", bbox, {key: area},
            "Strathfield resident-permit schemes (vision-derived, partial)",
            cluster=False)
        total += applied
    print(f"── Strathfield total: {total} resident segments tagged")


if __name__ == "__main__":
    apply()
