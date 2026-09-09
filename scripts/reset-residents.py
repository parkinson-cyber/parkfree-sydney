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


# Scheme-map files applied through lib_enrich.apply_rules (timed rules, not
# just permit areas). Their label is the scheme label; notes are appended
# after " · ", so match on the prefix.
SCHEME_FILES = [
    "willoughby-south-scheme.json",
    "randwick-kerbs-scheme.json",
]


def vision_labels():
    labels = set()
    for fn in VISION_FILES:
        areas = json.load(open(os.path.join(HERE, "data", fn)))
        for key, area in areas.items():
            if key.startswith("_"):  # provenance notes, not areas
                continue
            labels.add(area.get("label", key))
    return labels


def scheme_labels():
    return {json.load(open(os.path.join(HERE, "data", fn)))["label"] for fn in SCHEME_FILES}


def field_signs():
    """Photographed-sign entries, for resetting their tags.

    Matching is by marker where present, and otherwise by the sign's own rule
    within its street and bbox — tags written before the marker existed have to
    reset too, or the overlay stops being re-derivable.
    """
    path = os.path.join(HERE, "data", "field-signs.json")
    if not os.path.exists(path):
        return []
    return json.load(open(path))["signs"]


def _matches_sign(props, sign):
    from lib_enrich import norm, in_bbox
    if norm(props.get("name") or "") != norm(sign["street"]):
        return False
    if not in_bbox(props["_coords"], tuple(sign["bbox"])):
        return False
    left = props.get("left") or {}
    rule = sign["rule"]
    return (left.get("maxstayMin") == rule.get("maxstayMin")
            and left.get("interval") == rule.get("interval")
            and left.get("kind") == rule.get("kind"))


def main():
    labels = vision_labels()
    signs = field_signs()
    field = 0
    schemes = scheme_labels()
    coll = json.load(open(DATA_PATH))
    reset = 0
    for f in coll["features"]:
        p = f["properties"]
        # Photographed-sign tags carry a marker, so they reset cleanly whatever
        # category they produced.
        p["_coords"] = f["geometry"]["coordinates"]
        is_field = bool((p.get("left") or {}).get("fieldSign")) or any(
            _matches_sign(p, sign) for sign in signs)
        p.pop("_coords", None)
        if is_field:
            p["cat"] = "unknown"
            p["left"] = {"kind": "unknown"}
            p.pop("right", None)
            p.pop("zone", None)
            field += 1
            continue
        if p.get("cat") not in ("residents", "free_limited"):
            continue
        label = (p.get("left") or {}).get("permitLabel") or ""
        if label in labels or any(label.startswith(s) for s in schemes):
            p["cat"] = "unknown"
            p["left"] = {"kind": "unknown"}
            p.pop("right", None)
            p.pop("zone", None)
            reset += 1
    json.dump(coll, open(DATA_PATH, "w"))
    print(f"✓ reset {reset} vision-pipeline resident segments to 'unknown' "
          f"({len(labels)} labels)" + (f", plus {field} field-sign segments" if field else ""))


if __name__ == "__main__":
    main()
