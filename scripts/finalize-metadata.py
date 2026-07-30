#!/usr/bin/env python3
"""
Normalise src/data/parking.json metadata after an enrichment run.

The base orchestrator (fetch-parking-data.mjs) rewrites metadata on every run
and drops the human-readable `enriched` provenance string; each enrichment
script then re-appends its own phrase. Running scripts more than once, or an
incremental base fetch that only touches some areas, used to leave the string
either duplicated or incomplete. This step sets it to a single canonical,
deduplicated sentence listing every data source currently applied, so provenance
is stable regardless of run order.

Run last in the pipeline:  python3 scripts/finalize-metadata.py
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "src", "data", "parking.json")

# Canonical provenance, in application order. Keep in sync with the pipeline.
SOURCES = [
    "City of Sydney + TfNSW open data (meters, loading, free15, permits)",
    "Waverley open data (signs, meters, loading, PUDO)",
    "Willoughby/Chatswood signs",
    "North Sydney resident-permit areas",
    "North Sydney meters (rates & demand areas)",
    "Woollahra resident-permit zones",
    "City of Ryde resident-permit zones (partial, vision-derived)",
    "Mosman resident-permit areas (partial, vision-derived)",
    "Randwick resident-permit areas (partial, vision-derived)",
    "Inner West (Marrickville) resident-permit areas (partial, vision-derived)",
    "Inner West (Leichhardt/Balmain/Ashfield) resident-permit areas (partial, vision-derived)",
    "Lane Cove resident-permit zones (vision-derived)",
    "Canada Bay (Five Dock Area 6) resident-permit areas (partial)",
    "Burwood resident-permit areas (vision-derived)",
    "Hunters Hill (Woolwich W1) resident-permit area",
    "Strathfield resident-permit schemes (vision-derived, partial)",
]


def main():
    coll = json.load(open(DATA_PATH))
    coll.setdefault("metadata", {})
    coll["metadata"]["enriched"] = " + ".join(SOURCES)
    json.dump(coll, open(DATA_PATH, "w"))
    print("✓ metadata.enriched normalised (%d sources)" % len(SOURCES))
    # quick coverage summary
    feats = coll["features"]
    cls = sum(1 for f in feats if f["properties"]["cat"] != "unknown")
    print(f"  {cls}/{len(feats)} = {100 * cls / len(feats):.1f}% classified overall")


if __name__ == "__main__":
    main()
