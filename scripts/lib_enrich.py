#!/usr/bin/env python3
"""
Shared helpers for council resident-permit / meter enrichment pipelines.

Every council pipeline follows the same shape proven on North Sydney: a
committed schedule of streets per permit area is name-joined onto the OSM
street network inside the council's LGA bounding box, and matched 'unknown'
segments are tagged as resident-permit ("timed visitor parking, permit holders
excepted") — exactly how City of Sydney resident precincts are treated. Only
'unknown' segments are touched, so richer data already present (metered kerbs,
clearways, open-data signs) is never overwritten.

This module factors out the parts that are identical across councils —
name canonicalisation, the LGA bbox test, idempotent metadata bookkeeping and
the tag-apply loop — so each council script is just its data plus a few lines.

Data-file shape (one JSON per council, committed under scripts/data/):
    {
      "<area key>": {
        "label":   "Paddington 3",        # human label shown in the app
        "streets": ["Cascade Street", …],  # street names, verbatim from source
        "area":    12,                      # optional numeric area (North Syd)
        "zone":    "B"                      # optional sub-zone letter
      }, …
    }
Either "label" or ("area"[/"zone"]) may be present; the rules engine prefers
the label, else renders "Area <n><zone>".
"""

import datetime
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "src", "data", "parking.json")

_ABBR = {
    "st": "street", "rd": "road", "ave": "avenue", "av": "avenue",
    "la": "lane", "ln": "lane", "cr": "crescent", "cres": "crescent",
    "cl": "close", "pl": "place", "pde": "parade", "tce": "terrace",
    "gr": "grove", "hwy": "highway", "blvd": "boulevarde", "cct": "circuit",
    "nth": "north", "sth": "south", "esp": "esplanade", "espl": "esplanade",
    "dr": "drive", "gdns": "gardens", "sq": "square", "pwy": "parkway",
    "pkwy": "parkway", "cir": "circle", "crd": "crescent", "prom": "promenade",
}

import re


def norm(s):
    """Canonicalise a street name for matching: drop qualifiers, expand types."""
    s = re.sub(r"\(.*?\)", "", str(s)).lower().strip()
    s = re.sub(r"[^a-z0-9 ]", "", s)
    return " ".join(_ABBR.get(t, t) for t in s.split())


def in_bbox(coords, bbox):
    """bbox = (minLat, maxLat, minLon, maxLon)."""
    a, b, c, d = bbox
    return any(a <= lat <= b and c <= lon <= d for lon, lat in coords)


def _seg_point(coords):
    """Representative (lat, lon) for a segment: its midpoint vertex."""
    lon, lat = coords[len(coords) // 2]
    return (lat, lon)


def _haversine(p, q):
    la1, lo1, la2, lo2 = map(math.radians, (p[0], p[1], q[0], q[1]))
    h = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(h))


def _coherent_keep(points, link_m=400.0, keep_ratio=0.5):
    """Spatial-coherence filter for one permit area's candidate segments.

    A real permit area is a connected blob of adjacent streets; spurious matches
    of a common street name in other suburbs sit far away as separate clusters.
    Group `points` into connected components (edge when two points are within
    `link_m`), keep the largest component plus any component at least
    `keep_ratio` of its size (for legitimately split areas), and return the set
    of kept indices. Small far-flung components are dropped.
    """
    n = len(points)
    if n <= 2:
        return set(range(n))
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in range(n):
        for j in range(i + 1, n):
            if _haversine(points[i], points[j]) <= link_m:
                parent[find(i)] = find(j)

    comps = {}
    for i in range(n):
        comps.setdefault(find(i), []).append(i)
    sizes = sorted((len(v) for v in comps.values()), reverse=True)
    biggest = sizes[0]
    if biggest == 1:  # nothing clusters — data too sparse to judge, keep all
        return set(range(n))
    threshold = max(2, biggest * keep_ratio)
    keep = set()
    for idxs in comps.values():
        if len(idxs) >= threshold:
            keep.update(idxs)
    return keep


def load():
    return json.load(open(DATA_PATH))


def save(coll):
    json.dump(coll, open(DATA_PATH, "w"))


def mark_enriched(coll, phrase):
    """Append `phrase` to metadata.enriched once (idempotent) + bump timestamp."""
    meta = coll.setdefault("metadata", {})
    prev = meta.get("enriched", "")
    if phrase not in prev:
        prev = (prev + " + " + phrase).strip(" +")
    meta["enriched"] = prev
    meta["generated"] = datetime.datetime.now().isoformat()


def _permit_map(areas):
    """Flatten {areakey: {...}} into norm(street) -> (label, area, zone)."""
    pmap = {}
    for key, r in areas.items():
        label = r.get("label", key)
        area = r.get("area")
        zone = r.get("zone")
        for s in r["streets"]:
            n = norm(s)
            if n and n not in pmap:
                pmap[n] = (label, area, zone)
    return pmap


def apply_residents(council, bbox, areas, phrase, verbose=True, cluster=True):
    """Tag matched 'unknown' segments inside bbox as resident-permit.

    Returns (applied, classified_before, classified_after). Idempotent: also
    back-fills permit label/area onto any residents segment we tagged earlier
    that predates the label fields.

    When `cluster` is set (default), each permit area's candidate segments are
    passed through a spatial-coherence filter so that a common street name
    matching in an unrelated part of the LGA bbox is dropped rather than
    falsely tagged as permit-restricted.
    """
    pmap = _permit_map(areas)
    coll = load()
    streets = coll["features"]
    before = sum(1 for f in streets if f["properties"]["cat"] != "unknown")

    applied = 0
    refreshed = 0
    dropped = 0

    # Pass 1: gather candidate 'unknown' matches, grouped by permit-area identity
    # (label/area/zone) so the spatial-coherence filter runs per area.
    cand = {}  # area-key -> list of (feature, (label, area, zone), point)
    for f in streets:
        p = f["properties"]
        coords = f["geometry"]["coordinates"]
        name = p.get("name")
        if not name or p["cat"] != "unknown" or not in_bbox(coords, bbox):
            continue
        n = norm(name)
        if n not in pmap:
            continue
        label, area, zone = pmap[n]
        cand.setdefault((label, area, zone), []).append(
            (f, (label, area, zone), _seg_point(coords)))

    # Pass 2: within each area, keep only the spatially coherent segments, then tag.
    for key, items in cand.items():
        keep = _coherent_keep([pt for _, _, pt in items]) if cluster else set(range(len(items)))
        for i, (f, (label, area, zone), _pt) in enumerate(items):
            if i not in keep:
                dropped += 1
                continue
            p = f["properties"]
            rule = {"kind": "residents", "zone": "residential", "permitExcepted": True}
            if area is not None:
                rule["permitArea"] = area
            if zone:
                rule["permitZone"] = zone
            if label:
                rule["permitLabel"] = label
            p["left"] = dict(rule)
            p["right"] = dict(rule)
            p["cat"] = "residents"
            p["zone"] = "residential"
            applied += 1

    # Back-fill labels onto pre-existing residents segments (unchanged, low-risk).
    for f in streets:
        p = f["properties"]
        coords = f["geometry"]["coordinates"]
        name = p.get("name")
        if not name or not in_bbox(coords, bbox):
            continue
        n = norm(name)
        if n not in pmap:
            continue
        label, area, zone = pmap[n]
        if p["cat"] == "residents" and not (p.get("left") or {}).get("permitLabel") \
                and not (p.get("left") or {}).get("permitArea"):
            for side in ("left", "right"):
                sr = p.get(side)
                if sr and sr.get("kind") == "residents":
                    if area is not None:
                        sr["permitArea"] = area
                    if zone:
                        sr["permitZone"] = zone
                    if label:
                        sr["permitLabel"] = label
            refreshed += 1

    mark_enriched(coll, phrase)
    save(coll)

    after = sum(1 for f in streets if f["properties"]["cat"] != "unknown")
    if verbose:
        inb = [f for f in streets if in_bbox(f["geometry"]["coordinates"], bbox)]
        cls = sum(1 for f in inb if f["properties"]["cat"] != "unknown")
        print(f"✓ {council}: {applied} resident segments tagged"
              + (f", {refreshed} back-filled" if refreshed else "")
              + (f", {dropped} off-cluster dropped" if dropped else ""))
        print(f"  classified {before} -> {after} (+{after - before}) overall")
        if inb:
            print(f"  {council} bbox: {cls}/{len(inb)} = {100 * cls / len(inb):.1f}% classified")
    return applied, before, after
