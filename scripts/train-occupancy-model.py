#!/usr/bin/env python3
"""
Fit the Opal demand shapes against measured occupancy, and write the result
into src/data/demand-model.json.

────────────────────────────────────────────────────────────────────────────
WHAT IS BEING LEARNED, AND WHAT IS NOT
`fetch-opal-demand.py` derives, from Transport for NSW tap data, *when* the
cars arrive and leave around a station. That is a shape between 0 and 1 and it
is measured. What it cannot say is how a shape becomes a probability that a
space is free — that needs occupancy, and the only occupancy anyone publishes
in Sydney is the Park&Ride feed: ~40 commuter car parks, hourly.

That feed has no history of its own (the API accepts `eventdate` and ignores
it — checked 2026-10-12), but this repo has been keeping one since
2026-09-10 without anyone noticing it would be needed: the `carparks-live`
workflow carries `history.jsonl` forward on the `data-live` branch every time
it force-pushes. That file is the training set, and it is why no new
scheduled job was added for this.

So this fits

    logit(occupancy) ≈ b0
                     + b1 · parked(t)        the Opal cars-on-kerb shape
                     + b2 · arrivals(t)      area tap-offs, same source
                     + b3 · weekend
                     + b4 · sin(2πh/24) + b5 · cos(2πh/24)

by ridge-regularised least squares (pure Python — this repo has no
dependencies and a 6×6 normal-equation solve does not need any).

**The honest limits, stated here because the number this produces will end up
on a screen:**

* A Park&Ride lot is not a kerb. It is fitted here because it is the only
  measured parking in Sydney, and what transfers is the *response to commuter
  flow*, not the level. Kerbside levels stay uncalibrated, which is why the
  runtime keeps its confidence cap.
* b4/b5 are a plain hour-of-day cycle, included **as a rival**. If the Opal
  curve is worth anything it has to beat time-of-day alone, so the script
  fits both and prints the difference. A b1 that survives that comparison is
  evidence; one that does not is a coincidence and is reported as such.
* Nothing is marked `fitted` until there are MIN_SAMPLES readings spanning
  MIN_DAYS distinct days. One busy Tuesday is not a model of a week, and a
  model that claimed to be would push a confident wrong answer at the one
  person who uses this app.

Run:  python3 scripts/train-occupancy-model.py           # dry run, prints the fit
      python3 scripts/train-occupancy-model.py --write   # update the model
"""

import argparse
import datetime as dt
import json
import math
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "..", "src", "data", "demand-model.json")
CACHE = os.path.join(HERE, "..", ".cache", "occupancy")
REPO = "parkinson-cyber/parkfree-sydney"
RAW = f"https://raw.githubusercontent.com/{REPO}/data-live"

# A Park&Ride lot sits at its station; this is slack for where the API puts
# the pin, not a walking radius.
MATCH_M = 1200
# Below either of these the fit is not allowed to call itself calibrated.
MIN_SAMPLES = 400
MIN_DAYS = 7
RIDGE = 1e-2

FEATURES = ["parked", "arrivals", "weekend", "sin_h", "cos_h"]


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def curve_at(curve, when):
    """A 24-value hourly curve, read at `when`, interpolated — same reading the
    runtime does in demand.ts, so the fit matches what ships."""
    key = "su" if when.weekday() == 6 else ("sa" if when.weekday() == 5 else "wd")
    row = curve.get(key)
    if not row or len(row) != 24:
        return None
    frac = when.minute / 60
    a, b = row[when.hour], row[(when.hour + 1) % 24]
    return (a + (b - a) * frac) / 100


def solve(ata, atb):
    """Gaussian elimination with partial pivoting."""
    n = len(atb)
    m = [list(row) + [atb[i]] for i, row in enumerate(ata)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        if abs(m[p][c]) < 1e-12:
            return None
        m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r == c:
                continue
            f = m[r][c] / m[c][c]
            for k in range(c, n + 1):
                m[r][k] -= f * m[c][k]
    return [m[i][n] / m[i][i] for i in range(n)]


def ridge(rows, ys, lam=RIDGE):
    """Least squares with an intercept and an L2 penalty on the slopes."""
    n_f = len(rows[0])
    X = [[1.0] + list(r) for r in rows]
    n = n_f + 1
    ata = [[0.0] * n for _ in range(n)]
    atb = [0.0] * n
    for x, y in zip(X, ys):
        for i in range(n):
            atb[i] += x[i] * y
            for j in range(n):
                ata[i][j] += x[i] * x[j]
    for i in range(1, n):          # never penalise the intercept
        ata[i][i] += lam * len(X)
    return solve(ata, atb)


def predict(beta, row):
    return beta[0] + sum(b * v for b, v in zip(beta[1:], row))


def r2(ys, preds):
    m = sum(ys) / len(ys)
    ss_t = sum((y - m) ** 2 for y in ys)
    ss_r = sum((y - p) ** 2 for y, p in zip(ys, preds))
    return 1 - ss_r / ss_t if ss_t else 0.0


def pull(name, refresh):
    """Fetch one file from the data-live branch, cached."""
    dest = os.path.join(CACHE, name)
    if os.path.exists(dest) and not refresh:
        return dest
    os.makedirs(CACHE, exist_ok=True)
    print(f"  ↓ {name} from the data-live branch")
    with urllib.request.urlopen(f"{RAW}/{name}", timeout=300) as r, open(dest, "wb") as fh:
        fh.write(r.read())
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true",
                    help="re-download the occupancy history from data-live")
    ap.add_argument("--write", action="store_true",
                    help="write the fit into src/data/demand-model.json")
    args = ap.parse_args()

    model = json.load(open(MODEL))
    stations = model["stations"]
    postcodes = model["postcodes"]

    try:
        where = {f["id"]: f for f in json.load(open(pull("carparks.json", args.refresh)))["facilities"]}
        hist_path = pull("history.jsonl", args.refresh)
    except Exception as e:                                   # noqa: BLE001
        print(f"could not read the occupancy history from data-live: {e}")
        print("The model stays on its reasoned defaults until it can be fitted.")
        return 0

    rows, ys, days, used_facilities = [], [], set(), set()
    skipped_nostation = skipped_bad = seen = 0
    # The same reading can be written more than once when a run re-reads a
    # facility the API had not refreshed; a repeat is not a measurement.
    seen_keys = set()

    with open(hist_path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            seen += 1
            try:
                r = json.loads(line)
                # `at` is the API's own MessageDate in Sydney local time with
                # an offset; the curves are indexed by local hour, so read it
                # as local and drop the offset rather than converting to UTC.
                when = dt.datetime.fromisoformat(r["at"]).replace(tzinfo=None)
                spots, occupied = int(r["spots"]), int(r["occupied"])
                fac = where.get(str(r["id"]))
            except (ValueError, KeyError, TypeError):
                skipped_bad += 1
                continue
            if not fac or spots <= 0 or occupied < 0:
                skipped_bad += 1
                continue
            key = (r["id"], r["at"])
            if key in seen_keys:
                continue
            seen_keys.add(key)

            at = (float(fac["latitude"]), float(fac["longitude"]))
            near = [s for s in stations
                    if s.get("parked") and km(at, (s["lat"], s["lon"])) * 1000 <= MATCH_M]
            if not near:
                skipped_nostation += 1
                continue
            st = min(near, key=lambda s: km(at, (s["lat"], s["lon"])))
            parked = curve_at(st["parked"], when)
            if parked is None:
                skipped_bad += 1
                continue

            pc = min(postcodes, key=lambda p: km(at, (p["lat"], p["lon"]))) if postcodes else None
            activity = curve_at(pc["arrivals"], when) if pc else 0.0
            if activity is None:
                activity = 0.0

            y = min(0.98, max(0.02, occupied / spots))
            h = when.hour + when.minute / 60
            rows.append([
                parked, activity,
                1.0 if when.weekday() >= 5 else 0.0,
                math.sin(2 * math.pi * h / 24), math.cos(2 * math.pi * h / 24),
            ])
            ys.append(math.log(y / (1 - y)))
            days.add(when.date())
            used_facilities.add(str(r["id"]))

    print(f"{seen:,} readings in the history "
          f"({len(seen_keys):,} distinct)")

    n = len(rows)
    print(f"{n:,} usable readings from {len(used_facilities)} car parks "
          f"over {len(days)} days")
    if skipped_nostation:
        print(f"  ({skipped_nostation:,} readings at car parks with no origin-station "
              "curve within 1.2 km — Metro and regional lots mostly)")
    if n < 20:
        print("Too few to fit anything. Leaving the model on its defaults.")
        return 0

    beta = ridge(rows, ys)
    if beta is None:
        print("! the normal equations are singular — not enough variety in the data yet")
        return 0
    preds = [predict(beta, r) for r in rows]
    full_r2 = r2(ys, preds)

    # The rival: hour-of-day and weekend alone, with no Opal input at all.
    clock_rows = [[r[2], r[3], r[4]] for r in rows]
    clock_beta = ridge(clock_rows, ys)
    clock_r2 = r2(ys, [predict(clock_beta, r) for r in clock_rows])

    # RMSE back in occupancy terms, which is the number a person can judge.
    def inv(z):
        return 1 / (1 + math.exp(-z))
    rmse = math.sqrt(sum((inv(p) - inv(y)) ** 2 for p, y in zip(preds, ys)) / n)

    names = ["intercept"] + FEATURES
    print()
    for name, b in zip(names, beta):
        print(f"  {name:<10s} {b:+.3f}")
    print()
    print(f"  R² with Opal curves      {full_r2:.3f}")
    print(f"  R² from the clock alone  {clock_r2:.3f}")
    print(f"  Opal adds                {full_r2 - clock_r2:+.3f}")
    print(f"  RMSE                     {rmse:.3f} occupancy "
          f"({rmse * 100:.0f} percentage points)")

    fitted = n >= MIN_SAMPLES and len(days) >= MIN_DAYS
    if not fitted:
        print()
        print(f"Not marking the model calibrated yet: needs ≥{MIN_SAMPLES} readings "
              f"over ≥{MIN_DAYS} days (have {n:,} over {len(days)}).")
    if full_r2 - clock_r2 < 0.01 and fitted:
        print()
        print("The Opal curves add nothing the clock did not already explain. "
              "Leaving the defaults in place rather than fitting noise.")
        fitted = False

    model["calibration"] = {
        "state": "fitted" if fitted else "uncalibrated",
        "samples": n,
        "days": len(days),
        "carParks": len(used_facilities),
        "fittedAt": dt.datetime.now().isoformat(timespec="seconds") if fitted else None,
        "fit": {
            "r2": round(full_r2, 4),
            "r2ClockOnly": round(clock_r2, 4),
            "rmseOccupancy": round(rmse, 4),
            "coefficients": {k: round(v, 4) for k, v in zip(names, beta)},
        },
        "note": "Fitted against TfNSW Park&Ride occupancy, which is off-street. "
                "What transfers to a kerb is the response to commuter flow, not "
                "the level — so the runtime still caps its confidence. Only "
                "parkRideGain is taken from the fit: a commuter car park sits at "
                "a station, so it measures commuter flow well and neighbourhood "
                "arrivals badly, and the arrivals coefficient here comes out "
                "small and collinear with the clock. activityGain keeps its "
                "reasoned default until something kerbside can test it.",
        "weights": ({
            # The runtime subtracts (parked − 0.5) × gain from the odds a space
            # is free, so the gain is the fitted occupancy coefficient.
            "parkRideGain": round(min(4.0, max(0.5, beta[1])), 3),
        } if fitted else None),
    }

    if args.write:
        with open(MODEL, "w") as fh:
            json.dump(model, fh)
        print(f"\n✓ written into src/data/demand-model.json "
              f"(state: {model['calibration']['state']})")
    else:
        print("\n(dry run — pass --write to update src/data/demand-model.json)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
