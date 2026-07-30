#!/usr/bin/env python3
"""
Reset vision-pipeline resident-permit tags back to 'unknown'.

apply-enrichment.sh is idempotent but only ever *adds* tags — it cannot remove a
segment that a previous run tagged. To fully rebuild the offline overlays (e.g.
after changing the matching logic in lib_enrich), first run this to strip the
resident tags produced by the apply_residents-based council scripts, then run
apply-enrichment.sh to re-derive them from scratch.

Only segments whose permitLabel matches a label defined in one of the council
schedule files below are reset. The accurate sign-based open-data residents
(City of Sydney / Waverley / TfNSW — no permitLabel) and the custom North
Sydney/Mosman/Randwick/Inner-West pipelines are left untouched.

Run:  python3 scripts/reset-residents.py
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "src", "data", "parking.json")

# Schedule files whose enrichment goes through lib_enrich.apply_residents.
VISION_FILES = [
    "woollahra-permit-areas.json",
    "ryde-permit-areas.json",
    "innerwest-leichhardt-permit-areas.json",
    "lanecove-permit-areas.json",
    "canadabay-permit-areas.json",
    "burwood-permit-areas.json",
    "huntershill-permit-areas.json",
    "strathfield-permit-areas.json",
]


def vision_labels():
    labels = set()
    for fn in VISION_FILES:
        areas = json.load(open(os.path.join(HERE, "data", fn)))
        for key, area in areas.items():
            labels.add(area.get("label", key))
    return labels


def main():
    labels = vision_labels()
    coll = json.load(open(DATA_PATH))
    reset = 0
    for f in coll["features"]:
        p = f["properties"]
        if p.get("cat") != "residents":
            continue
        if (p.get("left") or {}).get("permitLabel") in labels:
            p["cat"] = "unknown"
            p["left"] = {"kind": "unknown"}
            p.pop("right", None)
            p.pop("zone", None)
            reset += 1
    json.dump(coll, open(DATA_PATH, "w"))
    print(f"✓ reset {reset} vision-pipeline resident segments to 'unknown' "
          f"({len(labels)} labels)")


if __name__ == "__main__":
    main()
