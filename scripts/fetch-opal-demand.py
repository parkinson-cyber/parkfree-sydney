#!/usr/bin/env python3
"""
Opal tap data → an hour-by-hour parking-pressure model for Sydney.

────────────────────────────────────────────────────────────────────────────
THE IDEA
Nobody measures on-street occupancy in Sydney. But the thing that *fills* the
kerb around a station is measured, in public, at fifteen-minute resolution:
people tapping on and off.

For a park-and-ride street, the physics is almost embarrassingly direct. Every
morning tap-ON at a suburban station is one more person who got to that station
somehow, and some fixed share of them drove and left a car. Every afternoon
tap-OFF is one of those people coming back to collect it. So the number of
cars parked around the station at time t is proportional to the running
difference:

    parked(t)  ∝  Σ_{τ ≤ t} [ tapOn(τ) − tapOff(τ) ]

Normalise that by its own daily peak and the two unknowns — the drive-access
share and the kerb's capacity — divide out, leaving a shape: flat overnight,
climbing from 6am, a long plateau, draining between 3pm and 7pm. That shape is
*derived from measurement*, not hand-set, and it is the single biggest thing
the availability estimate was missing. The hand-written priors it replaces
said "residential permit street on a weekday, 0.55" for every such street in
Sydney at every hour.

A second curve covers everywhere that isn't a park-and-ride — a shopping
strip, a beach, the CBD — where the kerb is consumed by people *arriving*:

    arrivals(t)  ∝  tapOff(t)

Note that this is tap-OFFs alone, not total taps. Total taps looked like the
obvious measure of "how busy is this area" and is quietly wrong for most of
Sydney: in a commuter suburb the total peaks at 7.30am, which is everybody
*leaving*, and reading that as visitors arriving puts the busiest hour on a
shopping strip at dawn. Tap-offs are arrivals and nothing else.

────────────────────────────────────────────────────────────────────────────
SOURCES   (all public, all attributed; nothing here is scraped or inferred
           from a source that forbids it)
1. Opal Tap On and Tap Off **Release 3 (2020)**, `time-loc_*.csv` —
   TfNSW Open Data Hub, CC BY 4.0. mode · date · tap · 15-min time · location
   · count. Location is a **postcode** for bus taps and a **station/wharf
   name** for train, metro, light rail and ferry.
2. TfNSW **GTFS** static feeds (Sydney Trains, Metro, four light-rail lines,
   Sydney Ferries) — station and wharf coordinates, so a station name becomes
   a point on the map. Needs the Open Data Hub key we already hold.
3. **Station Monthly Usage from November 2024** (`entry_exit.csv`) — TfNSW.
   The 2020 shape is five years old; this says how busy each station is *now*,
   so a station that has doubled since 2020 is weighted as it is today.
4. **NSW Spatial Services suburb boundaries** (scripts/fetch-suburbs.py) —
   turns the bus postcodes into places on the map.

WHICH WEEK, AND WHY IT MATTERS
Release 3 covers four non-consecutive weeks of 2020:
    24 Feb – 1 Mar   normal, pre-COVID
    23 – 29 Mar      the first lockdown week
    24 – 30 Aug      restrictions
    16 – 22 Nov      partial recovery
Only the first describes a week that looks like now, so the shipped curves come
from it. The others are still computed and compared: if the Feb shape were an
artefact, November would disagree with it, and the script prints the
correlation between them as a reproducibility check rather than asking anyone
to take the Feb week on faith.

WHAT THE DATA WILL NOT SUPPORT
* Counts below ~18 in a 15-minute bucket are **suppressed for privacy** — the
  row is absent, not zero. A quiet station therefore looks emptier overnight
  than it is, so any location with fewer than MIN_DAILY_TAPS taps a day is
  dropped rather than shipped with a curve made mostly of absences.
* The tap counts are *not* linked into trips, so this cannot know who drove.
  The drive-access share is exactly the unknown that normalising removes — and
  it is also why the output is a **shape, not an occupancy**. Turning the shape
  into a probability needs measured occupancy, which is what
  scripts/train-occupancy-model.py does against the Park&Ride feed.

Run:  python3 scripts/fetch-opal-demand.py            # uses the cache if present
      python3 scripts/fetch-opal-demand.py --refresh  # re-download everything
"""

import csv
import io
import json
import math
import os
import sys
import time
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "..", ".cache", "opal")
STOPS_OUT = os.path.join(HERE, "data", "transit-stops.json")
MODEL_OUT = os.path.join(HERE, "..", "src", "data", "demand-model.json")
SUBURBS = os.path.join(HERE, "data", "suburbs-nsw.json")
SECRETS = os.path.join(HERE, "..", "..", ".secrets", "tfnsw.env")

OPAL_BASE = ("https://opendata.transport.nsw.gov.au/data/dataset/"
             "f3ea9e21-9fbf-45da-84cf-54e95cd7b841/resource")
# Resource ids are stable; the week each covers is the key.
OPAL_WEEKS = {
    "2020-02-24": ("a8718b62-fd01-49c6-992d-0429cfee92e4", "time-loc_24feb.csv",
                   "normal week, pre-COVID"),
    "2020-03-23": ("c21dffd6-99c7-4c85-82e2-e4a2fa3f2d47", "time-loc_23mar.csv",
                   "first lockdown week"),
    "2020-08-24": ("36e442e0-600d-4916-bc59-af57d1fb86e8", "time-loc_24aug.csv",
                   "restrictions"),
    "2020-11-16": ("08c548d6-551c-44a2-a6cc-8c2eb4af4a46", "time-loc_16nov.csv",
                   "partial recovery"),
}
# The week the shipped curves come from. See "WHICH WEEK" above.
BASE_WEEK = "2020-02-24"
# The week used only to check the base week reproduces.
CHECK_WEEK = "2020-11-16"

ENTRY_EXIT = ("https://opendata.transport.nsw.gov.au/data/dataset/"
              "3977df59-a1fa-422e-91ff-cfaeac355cc9/resource/"
              "f8bb2918-0540-4bb3-9ccf-f7aef04d4249/download/entry_exit.csv")

GTFS_FEEDS = [
    ("train", "sydneytrains"),
    ("metro", "metro"),
    ("light_rail", "lightrail/innerwest"),
    ("light_rail", "lightrail/cbdandsoutheast"),
    ("light_rail", "lightrail/parramatta"),
    ("ferry", "ferries/sydneyferries"),
]
GTFS_BASE = "https://api.transport.nsw.gov.au/v1/gtfs/schedule"

# The 30 km disc the parking dataset covers.
CENTRE = (-33.8688, 151.2093)
DISC_KM = 32.0

# Below this, the privacy floor has eaten too much of the day to trust a shape.
MIN_DAILY_TAPS = 1500

HOURS = 24
DAYTYPES = ("wd", "sa", "su")


# ─── plumbing ────────────────────────────────────────────────────────────────

def api_key():
    for line in open(SECRETS):
        if line.startswith("TFNSW_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("TFNSW_API_KEY not found in ../.secrets/tfnsw.env")


def fetch(url, dest, headers=None, label=None):
    """Download once, then reuse. The Opal CSVs are 31 MB together and never
    change — a release is a release — so they are cached rather than committed
    and rather than re-fetched on every run."""
    if os.path.exists(dest) and "--refresh" not in sys.argv:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers=headers or {})
    print(f"  ↓ {label or os.path.basename(dest)}")
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as fh:
        fh.write(r.read())
    return dest


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * 6371.0 * math.asin(math.sqrt(h))


# ─── stop coordinates ────────────────────────────────────────────────────────

def build_stops():
    """name → {lat, lon, mode} for every station, wharf and light-rail stop.

    GTFS calls a station a parent stop (`location_type` 1) and its platforms
    children; light rail and ferries often have no parent at all, so both are
    accepted and children are averaged into their parent when one exists.
    """
    key = api_key()
    stops = {}
    for mode, feed in GTFS_FEEDS:
        path = fetch(f"{GTFS_BASE}/{feed}",
                     os.path.join(CACHE, "gtfs", feed.replace("/", "-") + ".zip"),
                     {"Authorization": f"apikey {key}"}, f"GTFS {feed}")
        with zipfile.ZipFile(path) as z:
            text = z.read("stops.txt").decode("utf-8-sig")
        agg = {}
        for r in csv.DictReader(io.StringIO(text)):
            name = (r.get("stop_name") or "").strip()
            if not name:
                continue
            try:
                lat, lon = float(r["stop_lat"]), float(r["stop_lon"])
            except (TypeError, ValueError):
                continue
            # A platform's name is "Chatswood Station Platform 3"; fold it back
            # onto the station so an Opal location name can find it.
            base = " ".join(name.split(" Platform ")[0].split())
            a = agg.setdefault(base, [0.0, 0.0, 0])
            a[0] += lat
            a[1] += lon
            a[2] += 1
        for name, (slat, slon, n) in agg.items():
            if name not in stops:
                stops[name] = {"lat": round(slat / n, 5), "lon": round(slon / n, 5),
                               "mode": mode}

    with open(STOPS_OUT, "w") as fh:
        json.dump({
            "_source": "Transport for NSW GTFS static feeds "
                       "(Sydney Trains, Metro, light rail, Sydney Ferries), "
                       "via the Open Data Hub.",
            "_fetched": time.strftime("%Y-%m-%d"),
            "stops": stops,
        }, fh, indent=0)
    print(f"✓ {len(stops)} transit stops → scripts/data/transit-stops.json")
    return stops


def load_stops():
    if os.path.exists(STOPS_OUT) and "--refresh" not in sys.argv:
        return json.load(open(STOPS_OUT))["stops"]
    return build_stops()


# ─── postcode centroids ──────────────────────────────────────────────────────

def postcode_points():
    """postcode → (lat, lon) — the mean of the suburbs carrying it.

    Bus taps are reported by postcode, which is the coarsest location in the
    release. It is still worth having: a postcode is about the size of the area
    you would consider walking across to find a space.
    """
    bounds = json.load(open(SUBURBS))["suburbs"]
    acc = {}
    for s in bounds:
        pc = s.get("postcode")
        if not pc:
            continue
        xs = [p[0] for ring in s["rings"] for p in ring]
        ys = [p[1] for ring in s["rings"] for p in ring]
        a = acc.setdefault(int(pc), [0.0, 0.0, 0])
        a[0] += sum(ys) / len(ys)
        a[1] += sum(xs) / len(xs)
        a[2] += 1
    return {pc: (lat / n, lon / n) for pc, (lat, lon, n) in acc.items()}


# ─── the curves ──────────────────────────────────────────────────────────────

def read_week(week):
    """loc → daytype → (on[24], off[24], days) summed over the week."""
    rid, fname, _ = OPAL_WEEKS[week]
    path = fetch(f"{OPAL_BASE}/{rid}/download/{fname}",
                 os.path.join(CACHE, fname), None, f"Opal {week}")

    # Mon=0 … Sun=6 for the seven dates in the file, derived from the date
    # itself rather than assumed, so a week that starts on another day works.
    def daytype(datestr):
        y, m, d = int(datestr[:4]), int(datestr[4:6]), int(datestr[6:])
        wd = time.localtime(time.mktime((y, m, d, 12, 0, 0, 0, 0, -1))).tm_wday
        return "wd" if wd < 5 else ("sa" if wd == 5 else "su")

    out = {}
    seen_days = {dt: set() for dt in DAYTYPES}
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            loc = " ".join(r["loc"].split())
            if loc in ("-1", "UNKNOWN", ""):
                continue
            dt = daytype(r["date"])
            seen_days[dt].add(r["date"])
            hour = int(r["time"][:2]) % 24
            rec = out.setdefault(loc, {d: {"on": [0] * HOURS, "off": [0] * HOURS,
                                           "mode": r["mode"]} for d in DAYTYPES})
            rec[dt][r["tap"]][hour] += int(r["count"])
    days = {dt: max(1, len(s)) for dt, s in seen_days.items()}
    return out, days


# A station whose morning taps are mostly ON is somewhere people *leave* from
# — a park-and-ride, where the cumulative-net curve means cars on the kerb. A
# station whose morning taps are mostly OFF is somewhere people *arrive* at,
# where that curve measures the evening exodus instead and is worthless for
# parking. The cut is drawn from the data rather than from a list of suburbs.
ORIGIN_MIN = 0.62
ORIGIN_WINDOW = range(6, 10)


def origin_score(rec, dt="wd"):
    """Share of 6–10am taps at this location that are tap-ONs."""
    on = sum(rec[dt]["on"][h] for h in ORIGIN_WINDOW)
    off = sum(rec[dt]["off"][h] for h in ORIGIN_WINDOW)
    return on / (on + off) if (on + off) else 0.0


def curves(rec, days):
    """One location's record → the two normalised shapes, per day type.

    `parked` is the cumulative net of taps-on minus taps-off, started at 3am
    (the quietest hour of the network, so the integral starts from an empty
    kerb rather than from midnight's leftovers) and clipped at zero — a kerb
    cannot hold a negative number of cars, and clipping is what keeps a
    station whose tap-offs lead its tap-ons from producing a mirror-image
    curve.

    `activity` is total taps. Both are scaled to their own daily maximum, so
    what ships is a shape between 0 and 1 and never a count of people.
    """
    out = {"parked": {}, "activity": {}, "arrivals": {}, "taps": {}}
    for dt in DAYTYPES:
        on = [v / days[dt] for v in rec[dt]["on"]]
        off = [v / days[dt] for v in rec[dt]["off"]]
        out["taps"][dt] = round(sum(on) + sum(off))

        net, run = [0.0] * HOURS, 0.0
        for i in range(HOURS):
            h = (3 + i) % 24
            run = max(0.0, run + on[h] - off[h])
            net[h] = run
        peak = max(net) or 1.0
        out["parked"][dt] = [round(100 * v / peak) for v in net]

        act = [on[h] + off[h] for h in range(HOURS)]
        peak = max(act) or 1.0
        out["activity"][dt] = [round(100 * v / peak) for v in act]

        peak = max(off) or 1.0
        out["arrivals"][dt] = [round(100 * v / peak) for v in off]
    return out


def correlation(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = math.sqrt(sum((x - ma) ** 2 for x in a))
    db = math.sqrt(sum((y - mb) ** 2 for y in b))
    return num / (da * db) if da and db else 0.0


# ─── current-era station levels ──────────────────────────────────────────────

def modern_levels():
    """station → taps per average day, from the Nov-2024-onwards monthly feed.

    Used only as a *scale*: the 2020 curves say when a station is busy, this
    says how busy it is today. A station that did not exist in 2020 (most of
    the Metro) has a level here and no curve, which is exactly the case the
    model has to notice rather than silently treat as quiet.
    """
    path = fetch(ENTRY_EXIT, os.path.join(CACHE, "entry_exit.csv"), None,
                 "station monthly usage (Nov 2024 →)")
    with open(path, newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        return {}
    cols = {c.lower(): c for c in rows[0]}
    name_col = next((cols[c] for c in cols if "station" in c and "name" in c), None) \
        or next((cols[c] for c in cols if c in ("station", "stn_name")), None)
    trip_col = next((cols[c] for c in cols
                     if "trip" in c or "entries" in c or "count" in c), None)
    month_col = next((cols[c] for c in cols if "month" in c or "year" in c), None)
    if not name_col or not trip_col:
        print(f"  ! monthly usage columns not recognised ({list(rows[0])[:6]}) — "
              "shipping curves without a current-era scale")
        return {}

    acc = {}
    months = {}
    suppressed = 0
    for r in rows:
        raw = str(r[trip_col]).replace(",", "").strip()
        try:
            v = float(raw)
        except (TypeError, ValueError):
            # The feed writes "Less than 50" rather than a number when a month's
            # count is small enough to identify people. Take the midpoint: it is
            # only ever used to scale a station that is quiet either way.
            if raw.lower().startswith("less than"):
                v = 25.0
                suppressed += 1
            else:
                continue
        # Names in this feed carry double spaces ("Aberdeen  Station") where the
        # Opal release does not. One normalisation, or nothing joins at all.
        name = " ".join((r[name_col] or "").split())
        if not name:
            continue
        acc[name] = acc.get(name, 0.0) + v
        if month_col:
            months.setdefault(name, set()).add(r[month_col])
    # Monthly totals → an average day.
    out = {}
    for name, total in acc.items():
        n_months = max(1, len(months.get(name, {1})))
        out[name] = total / n_months / 30.4
    print(f"  · current-era level for {len(out)} stations"
          f"{f' ({suppressed} suppressed months taken as 25)' if suppressed else ''}")
    return out


# ─── build ───────────────────────────────────────────────────────────────────

def main():
    print("── transit stop coordinates ──")
    stops = load_stops()
    pcs = postcode_points()

    print(f"── Opal {BASE_WEEK} ({OPAL_WEEKS[BASE_WEEK][2]}) ──")
    base, base_days = read_week(BASE_WEEK)
    print(f"── Opal {CHECK_WEEK} ({OPAL_WEEKS[CHECK_WEEK][2]}) — reproducibility check ──")
    check, check_days = read_week(CHECK_WEEK)

    levels = modern_levels()

    stations, postcodes = [], []
    dropped_quiet = dropped_nogeo = 0
    corrs = []

    for loc, rec in base.items():
        c = curves(rec, base_days)
        if c["taps"]["wd"] < MIN_DAILY_TAPS:
            dropped_quiet += 1
            continue

        if loc.isdigit() and len(loc) == 4:
            pt = pcs.get(int(loc))
            if not pt or km(pt, CENTRE) > DISC_KM:
                dropped_nogeo += 1
                continue
            # A postcode gets the same treatment as a station. In a dormitory
            # suburb the cumulative net of bus taps is the share of residents
            # who have left for the day — which is what empties a residential
            # kerb — and `origin` says whether the area is one people leave
            # from or arrive at, which decides the sign the runtime uses.
            pc_score = origin_score(rec)
            postcodes.append({
                "pc": int(loc),
                "lat": round(pt[0], 5), "lon": round(pt[1], 5),
                "taps": c["taps"]["wd"],
                "origin": round(pc_score, 3),
                "parked": c["parked"] if pc_score >= ORIGIN_MIN else None,
                "arrivals": c["arrivals"],
            })
            continue

        stop = stops.get(loc)
        if not stop or km((stop["lat"], stop["lon"]), CENTRE) > DISC_KM:
            dropped_nogeo += 1
            continue

        # Reproducibility is only meaningful on the curve we actually ship.
        if loc in check and origin_score(rec) >= ORIGIN_MIN:
            cc = curves(check[loc], check_days)
            corrs.append(correlation(c["parked"]["wd"], cc["parked"]["wd"]))

        score = origin_score(rec)
        level = levels.get(loc)
        stations.append({
            "name": loc,
            "mode": stop["mode"],
            "lat": stop["lat"], "lon": stop["lon"],
            "taps": c["taps"]["wd"],
            # How busy the station is today against its 2020 self. null where
            # the modern feed does not name it — better than a silent 1.0.
            "now": round(level / c["taps"]["wd"], 3) if (level and c["taps"]["wd"]) else None,
            "origin": round(score, 3),
            # Only an origin station's cumulative-net curve describes cars on a
            # kerb. At a destination station the same arithmetic describes the
            # evening exodus, so it is left out rather than shipped misleading.
            "parked": c["parked"] if score >= ORIGIN_MIN else None,
            "arrivals": c["arrivals"],
        })

    # Stations that opened after 2020 have a modern level and no 2020 curve.
    # Name them rather than let them look like quiet places.
    missing_now = sorted(
        n for n in levels
        if n not in base and n in stops and km((stops[n]["lat"], stops[n]["lon"]), CENTRE) <= DISC_KM
    )

    stations.sort(key=lambda s: -s["taps"])
    postcodes.sort(key=lambda p: p["pc"])

    repro = sum(corrs) / len(corrs) if corrs else None
    model = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "week": BASE_WEEK,
        "weekNote": OPAL_WEEKS[BASE_WEEK][2],
        "bins": "hourly, local time, index 0 = 00:00",
        "sources": [
            "Opal Tap On and Tap Off Release 3 (2020), Transport for NSW, CC BY 4.0",
            "Transport for NSW GTFS static feeds (station and wharf coordinates)",
            "Train, Metro and Light Rail Station Monthly Usage from November 2024, "
            "Transport for NSW",
            "NSW Spatial Services, NSW Administrative Boundaries Theme (suburb "
            "postcodes), CC BY 4.0",
        ],
        "limits": {
            "privacyFloor": "15-minute buckets under ~18 taps are suppressed in the "
                            "source, so quiet hours are absent rather than zero; "
                            f"locations under {MIN_DAILY_TAPS} taps a day are dropped.",
            "age": "The shape is from 2020. The level is corrected to 2024-25 where "
                   "the monthly feed names the station ('now'), and is null where it "
                   "does not.",
            "notOccupancy": "These are normalised shapes, not occupancies. "
                            "scripts/train-occupancy-model.py turns them into a "
                            "probability using measured Park&Ride occupancy.",
            "arrivalsNotTotalTaps": "'arrivals' is tap-OFFs only. Total taps peak "
                                    "at 7.30am in a commuter suburb, which is "
                                    "everyone leaving — reading that as visitors "
                                    "arriving puts a shopping strip's busiest hour "
                                    "at dawn.",
            "originOnly": f"'parked' is present only where at least "
                          f"{ORIGIN_MIN:.0%} of 6-10am taps are tap-ONs, i.e. a "
                          "station people leave from. Elsewhere the cumulative "
                          "net describes the evening exodus, not a kerb, so it "
                          "is null and 'activity' is the signal.",
        },
        "reproducibility": {
            "checkWeek": CHECK_WEEK,
            "meanCorrelationOfParkedCurve": round(repro, 3) if repro is not None else None,
            "stationsCompared": len(corrs),
        },
        "openedSince2020": missing_now,
        # Filled in by train-occupancy-model.py once there is measured
        # occupancy to fit against. Until then the runtime says so.
        "calibration": {"state": "uncalibrated", "samples": 0,
                        "weights": None, "fittedAt": None},
        "stations": stations,
        "postcodes": postcodes,
    }

    with open(MODEL_OUT, "w") as fh:
        json.dump(model, fh)

    mb = os.path.getsize(MODEL_OUT) / 1048576
    print()
    print(f"✓ {len(stations)} stations + {len(postcodes)} postcodes "
          f"→ src/data/demand-model.json ({mb:.2f} MB)")
    print(f"  dropped: {dropped_quiet} below the privacy-floor threshold, "
          f"{dropped_nogeo} outside the disc or without coordinates")
    if repro is not None:
        print(f"  parked-curve correlation {BASE_WEEK} vs {CHECK_WEEK}: "
              f"{repro:.3f} over {len(corrs)} stations")
    if missing_now:
        print(f"  {len(missing_now)} stations are busy today but absent from 2020 "
              f"(e.g. {', '.join(missing_now[:4])})")


if __name__ == "__main__":
    os.makedirs(CACHE, exist_ok=True)
    main()
