#!/usr/bin/env python3
"""
Willoughby South resident parking scheme — Artarmon/Naremburn streets between
Sydney Street and Willoughby Road, Mowbray Road and the Gore Hill Freeway.

Willoughby publishes no parking GIS and its open-data sign census covers the
Chatswood CBD only, so the rest of the LGA was blank. The council's Willoughby
South scheme (approved by the Local Traffic Committee, 5 March 2024) was
published as a street-level map with the exact restriction per kerb — 1P/2P/4P,
hours, and "Permit Holders Excepted" — which is richer than a permit-area list:
these streets get real time limits and hours, not "check the sign".

The map is a raster; the schedule in scripts/data/willoughby-south-scheme.json
was read from it kerb by kerb (same trust tier as the other council-map
overlays, and noted as such in metadata). Where the two kerbs differ, both are
recorded and the app shows each side.

Run:  python3 scripts/fetch-willoughby-south-parking.py
"""

import json
import os

from lib_enrich import apply_rules

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEME_PATH = os.path.join(HERE, "data", "willoughby-south-scheme.json")


def apply():
    scheme = json.load(open(SCHEME_PATH))
    entries = [dict(e, label=scheme["label"]) for e in scheme["entries"]]
    apply_rules("Willoughby South", tuple(scheme["bbox"]), entries,
                "Willoughby South resident parking scheme (council map, Mar 2024)")


if __name__ == "__main__":
    apply()
