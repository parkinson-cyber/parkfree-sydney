#!/usr/bin/env python3
"""
Signs photographed on the street.

Councils publish where a permit scheme applies far more often than they
publish what its signs actually say, which is why so many streets read
"permit holders excepted — check the sign for the limit". A photo of the sign
closes that gap with the strongest evidence there is: the sign itself.

So these entries deliberately outrank the permit-area schedules — but only
within the `bbox` recorded with each one, and only over segments whose current
data is *less* specific (unknown, or a permit tag with no time limit). Anything
already derived from a real sign census or a metered-kerb feed is left alone;
a single photo shouldn't overwrite a council's own sign database.

Every entry keeps the photo in docs/field-signs/, so a future session can check
the claim against the picture rather than trusting this file.

Run:  python3 scripts/fetch-field-signs.py
"""

import json
import os

from lib_enrich import norm, load, save, mark_enriched, in_bbox

HERE = os.path.dirname(os.path.abspath(__file__))
SIGNS_PATH = os.path.join(HERE, "data", "field-signs.json")
PHRASE = "field-observed signs (photographed on site)"

# Only these are less specific than a photographed sign.
UPGRADABLE = ("unknown", "residents")


def apply():
    signs = json.load(open(SIGNS_PATH))["signs"]
    coll = load()
    feats = coll["features"]
    before = sum(1 for f in feats if f["properties"]["cat"] != "unknown")

    total = 0
    for sign in signs:
        want = norm(sign["street"])
        bbox = tuple(sign["bbox"])
        applied = 0
        for f in feats:
            p = f["properties"]
            if norm(p.get("name") or "") != want:
                continue
            if not in_bbox(f["geometry"]["coordinates"], bbox):
                continue
            # A permit tag that already carries a time limit came from a sign
            # census; don't touch it.
            if p["cat"] not in UPGRADABLE or (p.get("left") or {}).get("maxstayMin"):
                continue
            rule = dict(sign["rule"])
            # Marks the tag as coming from this pipeline so reset-residents.py
            # can strip it and the overlay stays fully re-derivable.
            rule["fieldSign"] = sign["id"]
            p["left"], p["right"] = dict(rule), dict(rule)
            p["cat"] = rule["kind"]
            if rule.get("zone"):
                p["zone"] = rule["zone"]
            applied += 1
        total += applied
        print(f"  {sign['street']} ({sign['suburb']}): {applied} segments ← \"{sign['signText']}\" "
              f"[seen {sign['observed']}]")

    mark_enriched(coll, PHRASE)
    save(coll)
    after = sum(1 for f in feats if f["properties"]["cat"] != "unknown")
    print(f"✓ field signs: {total} segments tagged from {len(signs)} photographed sign(s) "
          f"(classified {before} -> {after})")


if __name__ == "__main__":
    apply()
