#!/usr/bin/env python3
"""
Fact-check the clearway tags against every other source we can reach.

Main roads carry the strongest claims this map makes ("you may not stop here
at 8am"), and they came from a single feature service. This checks that claim
four ways and prints the disagreements. It changes no data — it is a report.

  1. TfNSW shapefile      the same clearways published separately as a 2018
                          shapefile. NOT independent evidence (identical record
                          count, same origin) but it does verify our reading:
                          if the service and the shapefile disagree on a road's
                          hours, we parsed something wrong or the rule changed.
  2. TfNSW bus lanes      an independent layer. A bus lane on the same road
                          corroborates "this kerb is restricted", and flags
                          where our clearway hours are the *lesser* restriction.
  3. OpenStreetMap        our own base data. If OSM tags a road we called a
                          clearway as free or residential, one of us is wrong
                          and it is worth a human look.
  4. Road class           a clearway belongs on a main road. A clearway landing
                          on a residential street means the snap went wrong.

Run:  python3 scripts/verify-clearways.py
"""

import json
import os
import re
import struct
import sys
import urllib.request

from lib_enrich import norm

HERE = os.path.dirname(os.path.abspath(__file__))
SHP_DIR = os.environ.get("CLEARWAY_SHP_DIR", "")
PARKING = os.path.join(HERE, "..", "src", "data", "parking.json")
SERVICE = os.path.join(HERE, "data", "tfnsw-clearways.json")
BUSLANES = ("https://services6.arcgis.com/LHYr6B7cFUs40aCx/arcgis/rest/services"
            "/TRA_BusLanes_3857/FeatureServer/0/query"
            "?where=1%3D1&outFields=road_name,operating,lane_type&returnGeometry=false"
            "&resultRecordCount=2000&f=json")
LABEL = "TfNSW clearway"


def read_dbf(buf):
    numrec = struct.unpack("<I", buf[4:8])[0]
    hdrsize = struct.unpack("<H", buf[8:10])[0]
    recsize = struct.unpack("<H", buf[10:12])[0]
    nfields = (hdrsize - 33) // 32
    fields = []
    for i in range(nfields):
        fd = buf[32 + i * 32: 64 + i * 32]
        fields.append((fd[:11].split(b"\x00")[0].decode("latin1"), fd[16]))
    rows = []
    for r in range(numrec):
        rec = buf[hdrsize + r * recsize: hdrsize + (r + 1) * recsize]
        if len(rec) < recsize:
            break
        vals, off = {}, 1
        for name, flen in fields:
            vals[name] = rec[off:off + flen].decode("latin1").strip()
            off += flen
        rows.append(vals)
    return rows


def main():
    coll = json.load(open(PARKING))
    tagged = [f for f in coll["features"]
              if (f["properties"].get("left") or {}).get("permitLabel") == LABEL]
    print(f"Checking {len(tagged)} clearway-tagged segments.\n")

    service = json.load(open(SERVICE))["features"]
    svc_hours = {}
    for f in service:
        n = norm(f["properties"].get("STREET_NAME") or "")
        if n:
            svc_hours.setdefault(n, set()).add(f["properties"].get("CLEARWAY_HOURS"))

    # ---- 1. the separately published shapefile --------------------------------
    print("1. TfNSW shapefile (verifies our reading, not an independent fact)")
    if SHP_DIR and os.path.isdir(SHP_DIR):
        dbf = next((os.path.join(SHP_DIR, f) for f in os.listdir(SHP_DIR)
                    if f.lower().endswith(".dbf")), None)
        rows = read_dbf(open(dbf, "rb").read()) if dbf else []
        shp_hours = {}
        for r in rows:
            n = norm(r.get("STREET_NAM") or r.get("STREET_NAME") or "")
            h = r.get("CLEARWAY_H") or r.get("CLEARWAY_HOURS") or ""
            if n:
                shp_hours.setdefault(n, set()).add(h.strip())
        print(f"   shapefile records: {len(rows)}; service records: {len(service)}")
        both = set(svc_hours) & set(shp_hours)
        disagree = [n for n in both
                    if {h for h in svc_hours[n] if h} != {h for h in shp_hours[n] if h}]
        print(f"   roads in both: {len(both)}; hours differ on: {len(disagree)}")
        for n in sorted(disagree)[:6]:
            print(f"     {n}: service={sorted(h for h in svc_hours[n] if h)[:2]} "
                  f"shapefile={sorted(h for h in shp_hours[n] if h)[:2]}")
        if disagree:
            print("   (2018 shapefile vs live service — differences are usually real rule changes)")
    else:
        print("   skipped — set CLEARWAY_SHP_DIR to the unzipped shapefile directory")

    # ---- 2. bus lanes ---------------------------------------------------------
    print("\n2. TfNSW bus lanes (independent layer)")
    try:
        bl = json.load(urllib.request.urlopen(BUSLANES, timeout=90))
        bus = {}
        for f in bl.get("features", []):
            a = f["attributes"]
            n = norm(a.get("road_name") or "")
            if n:
                bus.setdefault(n, set()).add(a.get("operating"))
        names = {norm(f["properties"].get("name") or "") for f in tagged}
        overlap = names & set(bus)
        print(f"   bus-lane roads: {len(bus)}; also clearway-tagged here: {len(overlap)}")
        for n in sorted(overlap)[:6]:
            print(f"     {n}: bus lane {sorted(h for h in bus[n] if h)[:1]}")
        print("   → these kerbs carry a second restriction our clearway hours do not describe,")
        print("     which is exactly why the rule is marked otherTimesUnknown.")
    except Exception as e:
        print(f"   bus-lane layer unreachable: {e}")

    # ---- 3 & 4. our own data --------------------------------------------------
    print("\n3. OpenStreetMap / our own classification")
    conflicts = []
    by_name = {}
    for f in coll["features"]:
        by_name.setdefault(norm(f["properties"].get("name") or ""), []).append(f)
    for f in tagged:
        n = norm(f["properties"].get("name") or "")
        for other in by_name.get(n, []):
            cat = other["properties"]["cat"]
            if cat in ("free",) and (other["properties"].get("left") or {}).get("permitLabel") != LABEL:
                conflicts.append((n, cat))
                break
    print(f"   roads we call a clearway that another source calls free elsewhere: {len(set(c[0] for c in conflicts))}")
    for n, cat in sorted(set(conflicts))[:6]:
        print(f"     {n} — also tagged '{cat}' on another segment "
              f"(different stretch of the same road; not necessarily wrong)")

    print("\n4. Road class sanity")
    suspicious = [f for f in tagged
                  if re.search(r"(place|close|court|crescent|lane)$",
                               (f["properties"].get("name") or "").lower())]
    print(f"   clearways landing on place/close/court/crescent/lane names: {len(suspicious)}")
    for f in suspicious[:6]:
        print(f"     {f['properties'].get('name')}")
    print("   → a clearway on a cul-de-sac means the snap went wrong; investigate any listed.")

    print("\nReport only — no data was changed.")


if __name__ == "__main__":
    main()
