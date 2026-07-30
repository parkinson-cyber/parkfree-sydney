#!/usr/bin/env python3
"""
Inner West Council resident-permit enrichment — former Leichhardt & Ashfield
LGAs (Balmain, Birchgrove, Leichhardt, Lilyfield, Annandale, Haberfield,
Summer Hill). Complements fetch-innerwest-parking.py, which covers the
Marrickville (M-series) areas.

Inner West Council publishes its whole RPS as one 24-page map document
("Map Leichhardt Parking areas.pdf") — each page a street map with the
permit streets shaded in a per-area legend colour, no machine-readable
schedule. The council's live IntraMaps tool blocks automated crawlers, so the
map was taken from the Internet Archive (a separate public archive) and the
shaded streets read off each area map by rendering it to a high-res PNG and
transcribing — the same vision-derived method used for Mosman/Randwick/Ryde.

Coverage is intentionally partial: the clearly-shaded principal streets of the
Balmain-peninsula, Leichhardt, Annandale, Lilyfield and Haberfield/Summer Hill
areas. Boundary arterials (Parramatta Rd, City West Link) are excluded.

Run:  python3 scripts/fetch-innerwest-leichhardt-parking.py
"""

import json
import os

from lib_enrich import apply_residents

HERE = os.path.dirname(os.path.abspath(__file__))
PERMIT_PATH = os.path.join(HERE, "data", "innerwest-leichhardt-permit-areas.json")

# Former Leichhardt + Ashfield LGAs: Balmain/Birchgrove in the east across
# Leichhardt/Annandale/Lilyfield to Haberfield/Summer Hill in the west.
INNERWEST_N_BBOX = (-33.895, -33.845, 151.125, 151.190)  # minLat, maxLat, minLon, maxLon


def apply():
    areas = json.load(open(PERMIT_PATH))
    apply_residents("Inner West (Leichhardt/Ashfield)", INNERWEST_N_BBOX, areas,
                    "Inner West (Leichhardt/Balmain/Ashfield) resident-permit areas (partial, vision-derived)")


if __name__ == "__main__":
    apply()
