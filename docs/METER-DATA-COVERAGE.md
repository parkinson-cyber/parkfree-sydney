# Meter data coverage — prices and hours, per council

The paid-parking half of ParkFree depends on two facts per metered kerb:

| Field | Why it matters |
|---|---|
| `pricePerHour` | What it costs — shown as `$7/hr` in the street sheet |
| `feeInterval` / `cutOffMin` | **When it stops costing** — this is what turns a street green |

Price without hours is the worse gap of the two: we can tell someone a meter
costs $8.40, but not that it is free after 6pm, which is the whole product.

Regenerate this snapshot with:

```bash
node scripts/meter-coverage.mjs           # table below
node scripts/meter-coverage.mjs --json    # same data for CI
```

## Current snapshot

```

Meter coverage — data generated 2026-08-16T11:54:40.949175
78,346 segments, 1,732 of them paid

area                        paid   price    hours   price+hours  rate-zone guess
──────────────────────────────────────────────────────────────────────────────────
Inner Sydney / CBD          1199   99.4%    53.7%        53.6%              549
North Sydney                 338   89.6%   100.0%        89.6%                0
Eastern suburbs              110   70.9%    99.1%        70.9%                0
West                          54    0.0%   100.0%         0.0%                0
Inner West                    18    0.0%     0.0%         0.0%                0
North Shore                   13   61.5%    61.5%        61.5%                0
──────────────────────────────────────────────────────────────────────────────────
ALL                         1732   91.3%    66.6%        59.6%              549

Tariffs in the dataset ($/hr → kerb count):
  $2.00 × 1
  $4.63 × 128
  $4.90 × 7
  $5.60 × 68
  $6.00 × 26
  $6.40 × 107
  $7.00 × 372
  $7.40 × 430
  $8.40 × 495
  $8.95 × 140
  $9.00 × 236
  $9.80 × 2
  $30.00 × 3

Gaps to close (segments missing price and/or hours):
  Inner Sydney / CBD         556 of 1199
  North Sydney               35 of 338
  Eastern suburbs            32 of 110
  West                       54 of 54
  Inner West                 18 of 18
  North Shore                5 of 13

```

## How to read it

- **price** — at least one kerb on the segment has a known `$/hr`.
- **hours** — at least one kerb has `feeInterval` or `cutOffMin`, so the rules
  engine can compute a "free from" time.
- **price+hours** — the only column that means the street is fully usable.
- **rate-zone guess** — the tariff came from a council rate-zone *polygon*, not
  from a sign or meter record. The dollar figure is right for the area; the
  hours are inferred. These 549 CBD segments are the single biggest quality
  problem in the dataset.

## What the numbers say

**59.6% of metered kerbs are fully described.** The rest break down as:

1. **Inner Sydney / CBD — 556 of 1,199 incomplete.** Price coverage is
   effectively total (99.4%) but hours are only 53.7%. Cause: 549 segments were
   filled from tariff polygons rather than per-meter records. Fix: pull City of
   Sydney's per-meter dataset (meter id → tariff → operating hours) instead of
   the rate-zone layer.
2. **West — 54 of 54 have hours but no price.** Restriction windows came from
   OSM; no council tariff source is wired up at all.
3. **Inner West — 18 of 18 have neither.** No meter source wired up.
4. **North Sydney — 303 of 338 complete (89.6%).** Best-covered council; the
   `scripts/data/northsydney-meters.json` approach is the model to copy.
5. **Eastern suburbs (Waverley) — 78 of 110 (70.9%).** Hours are near-complete
   from the sign census; 32 segments lack a tariff.

## Known data bug

The tariff histogram contains **`$30.00 × 3`**, all on **Bronte Road, Waverley**
(`Mo-Su 09:00-20:00`). Waverley's beachside rates are the highest in the dataset,
but $30/hr is roughly triple its next-highest, so this is most likely a daily
maximum or a flat beach-event rate parsed into the hourly field. Three segments,
so low impact — but the parser should treat any `pricePerHour` above ~$15 as
suspect: log it for review rather than silently storing it. Verify against
Waverley's published fees before either keeping or dropping it.

## Councils with no meter data at all

These have resident-permit areas wired up (see `scripts/data/*-permit-areas.json`)
but **no meter tariff or hours source**:

Woollahra · Randwick · Inner West (Marrickville, Leichhardt, Ashfield) ·
Willoughby · Ryde · Mosman · Canada Bay · Burwood · Strathfield · Lane Cove ·
Hunters Hill · Northern Beaches · Sutherland · Georges River · Bayside ·
Parramatta

Each needs the same three things, in this order of preference:

1. An **open-data meter layer** (ArcGIS FeatureServer or CSV) with tariff and
   operating hours per meter — best case, fully automatable.
2. A **rate-zone polygon layer** plus the council's published fees-and-charges
   schedule — gives price, needs hours from elsewhere.
3. **Sign transcription** from the council's parking pages — last resort, manual,
   and must be dated so it can be re-checked.

Every one of these requires network access the sessions do not currently have —
see [UNBLOCK-NETWORK.md](UNBLOCK-NETWORK.md). Candidate endpoints already
researched are listed in [`../scripts/DATA-SOURCE-LEADS.md`](../scripts/DATA-SOURCE-LEADS.md).

## Target

| Milestone | price+hours |
|---|---|
| Today | 59.6% |
| After the CBD per-meter fix | ~95% of CBD, ~85% overall |
| After Woollahra + Randwick + Inner West | ~90% overall |
