# The demand model

How ParkFree guesses whether a space is free, and why that guess is now built
out of measurements instead of out of opinions.

Written 2026-10-12. The code is `scripts/fetch-opal-demand.py`,
`scripts/train-occupancy-model.py` and `src/lib/demand.ts`.

---

## The problem

Nobody measures on-street parking occupancy in Sydney. The City of Sydney
removed its in-ground sensors and published nothing in their place; no council
publishes kerb occupancy; the one measured parking dataset that exists is
Transport for NSW's Park&Ride feed, which covers about forty off-street
commuter car parks.

So the app's "how busy is it?" estimate began life as a hand-written table in
`src/lib/availability.ts`:

```
residential permit street, weekday  → 0.55
metered street, business hours      → 0.55
late night                          → 0.80
```

Every permit street in Sydney got the same number at the same hour. The table
was honest about being a guess — the UI said so — but it was still a guess,
and the file's own comment called it "the first thing that should be replaced".

## The idea

The thing that fills the kerb around a railway station is measured, in public,
at fifteen-minute resolution. It is just measured on the wrong side: Transport
for NSW publishes Opal tap-ons and tap-offs, not cars.

For a station people *leave from* in the morning, the connection is almost
mechanical. Each morning tap-on is one more person who got to that station
somehow, and a fixed share of them drove and left a car nearby. Each afternoon
tap-off is one of those people coming back for it. So the number of cars parked
around the station at time *t* is proportional to the running difference:

```
parked(t) ∝ Σ  [ tapOn(τ) − tapOff(τ) ]
           τ≤t
```

Normalise that by its own daily peak and the two things nobody knows — the
drive-access share, and how many cars the kerb holds — divide straight out,
leaving a shape between 0 and 1. That shape is derived from measurement.

Here is the weekday result for Gordon, one of the classic North Shore
park-and-ride stations, as percentages of its own peak:

```
hour      0   3   6   7   8   9  10  12  14  16  17  18  19  21  23
parked   13   0  14  55  84  91  96 100  97  89  70  44  31  18  13
```

Empty at 3am, filling from 6, full by late morning, draining from 4pm, and
13% still there at midnight. Nobody wrote that curve. It came out of the tap
counts.

A second curve covers everywhere that is not a park-and-ride — a shopping
strip, a beach — where the kerb is consumed by people arriving:

```
arrivals(t) ∝ tapOff(t)
```

Tap-offs alone, and that detail matters. Total taps looks like the obvious
measure of "how busy is this area" and is quietly wrong for most of Sydney: in
a commuter suburb the total peaks at 7.30am, which is everybody *leaving*.
Reading that as visitors arriving puts a shopping strip's busiest hour at dawn
— which is exactly what the first version of this model did, until the numbers
for Gordon were printed out and looked at.

## The trap, and the thing that makes this honest

Run the same arithmetic at Wynyard and you get this:

```
hour      0   3   6   8  10  12  14  16  18  20  22  23
parked  100   0   0   0   0   0   0  30  82  94  99 100
```

Which is nonsense as a parking curve. Wynyard is a *destination*: almost
everyone taps **off** there in the morning and **on** in the evening, so the
cumulative net is negative all day, gets clipped at zero, and then measures the
evening exodus. It would have told the app that the CBD kerb is empty at 9am.

So the pipeline classifies each station from the data itself —

```
origin = (6–10am tap-ons) / (6–10am taps)
```

— and ships the `parked` curve **only** where that is ≥ 0.62. Gordon scores
0.77, Revesby 0.89, Sutherland 0.82; Wynyard scores 0.11 and Chatswood 0.40,
and both get `parked: null`. 112 of the 160 stations in range are origins.
Everywhere else falls back to `arrivals`.

## Which week

Release 3 of the Opal tap data covers four non-consecutive weeks of 2020:

| week | what it was |
|---|---|
| 24 Feb – 1 Mar | normal, pre-COVID |
| 23 – 29 Mar | the first lockdown week |
| 24 – 30 Aug | restrictions |
| 16 – 22 Nov | partial recovery |

Only the first describes a week that looks like now, so the shipped curves come
from it. The November week is still computed, as a check: if the February shape
were an artefact of one week, November would disagree.

**It does not.** The `parked` curve correlates at **r = 0.963** between the two
weeks across 112 origin stations. The shape is a property of how Sydney
commutes, not of the week it was sampled in.

The *level* is a different matter, and five years is a long time. The
2024–25 station monthly-usage feed supplies a per-station correction (`now` in
the model file): the median station is at **0.69** of its 2020 patronage, which
is the post-COVID rail picture everyone already knew, now attached to the right
stations one at a time. Stations the modern feed does not name carry `now:
null` rather than a silent 1.0.

## From a shape to a probability

A shape is not an occupancy. Turning one into "there is probably a space" needs
something measured to fit against — which brings us back to the forty Park&Ride
car parks.

The Car Park API has no history: it accepts an `eventdate` parameter and
ignores it, returning the current snapshot whatever you ask for (checked
2026-10-12). But this repo has been keeping a history since **2026-09-10**
without anyone planning to need it. The `carparks-live` workflow carries
`history.jsonl` forward on the `data-live` branch each time it force-pushes,
and that file now holds a month of hourly readings. No new scheduled job was
needed; the training set already existed.

`scripts/train-occupancy-model.py` fits

```
logit(occupancy) ≈ b0 + b1·parked(t) + b2·arrivals(t)
                      + b3·weekend + b4·sin(2πh/24) + b5·cos(2πh/24)
```

by ridge-regularised least squares, in plain Python — the repo has no
dependencies and a 6×6 normal-equation solve does not need any.

Result, on 3,292 readings from 18 car parks over 33 days:

```
  parked     +2.948
  arrivals   +0.127
  weekend    −1.708
  sin_h      −0.478
  cos_h      −1.202

  R² with Opal curves      0.703
  R² from the clock alone  0.641
  Opal adds                +0.062
  RMSE                     0.189 occupancy (19 percentage points)
```

Two things in there matter more than the headline.

**The clock is included as a rival, on purpose.** `sin_h`/`cos_h` are a plain
time-of-day cycle with no Opal input at all. If the tap curves were only a
roundabout way of saying "it's 9am", they would add nothing once the clock is in
the model. They add +0.062 of R². That is a real but *modest* gain, and the
honest reading is that most of what the Opal curve knows is time-of-day — what
it adds on top is the part that differs **between stations**, which is exactly
what a per-street estimate needs and what a global clock cannot give.

**Only `parkRideGain` is taken from the fit.** The `arrivals` coefficient comes
out at +0.127 — small and collinear with the clock — which is what you would
expect: a commuter car park sits at a station, so it measures commuter flow
well and neighbourhood arrivals badly. Fitting the arrivals term on it would be
fitting noise, so it keeps its reasoned default until something kerbside can
test it.

## One curve, read from both ends

This is the part of `src/lib/demand.ts` that is not fitted, because no data in
Sydney can fit it — and it is the part that decides whether the model is useful
or actively harmful.

The morning departure curve is a single fact about a place: how far through the
day's leaving it is. What that fact *means* for a kerb depends on whose cars
are on it.

* **An unrestricted kerb next to the station fills**, because the people
  leaving arrived in cars and left them there.
* **The permit street behind it empties**, because the cars on it belonged to
  the residents who just drove off, and nobody else is allowed to take the
  space.

Same number, opposite sign. So the term enters twice:

```
base  = (departures − 0.5) × gain × stationWeight
odds −= base × exposure(kerb)        commuters arriving
odds += base × residentShare(kerb)   residents leaving
```

| kerb | exposure | resident share | why |
|---|---|---|---|
| unrestricted | 1.00 | 0.35 | where commuters go; some locals too |
| metered | 0.50 | 0.10 | a meter is a price, not a prohibition; nobody lives on it |
| time-limited (2P etc.) | 0.30 | 0.35 | stops a nine-hour commuter outright |
| resident permit | 0.20 | 1.00 | almost entirely residents' cars |

Get this wrong and the model reports that every permit street around Gordon is
full on a weekday morning, which is the **opposite** of the truth — permit
streets near stations are among the emptiest kerbs in Sydney at 10am, because
the residents have gone to work and nobody else may park there. That error
would send the owner driving across town.

With it right, the two kerb types come out in opposite phase, which is what
Sydney actually looks like:

```
220 m from Gordon Station      03:00 06:00 08:00 10:00 13:00 17:00 20:00 23:00
  unrestricted kerb             63%   61%   42%   48%   48%   48%   60%   62%
  resident permit               41%   44%   56%   58%   59%   54%   45%   44%
  metered                       61%   59%   44%   51%   51%   50%   59%   60%
```

(P(a space is free), Wednesday.) Sutherland, an independent station on the
other side of the city, produces the same picture to within two points. It is
tested in `scripts/test-rules.mjs`: *"a permit street is freer once its
residents have driven to work"* and *"the unrestricted kerb beside it moves the
other way at the same hour"*.

The arrivals term gets the same treatment from the other direction: it is
switched off entirely on a residential street (those cars are residents', not
visitors') and scaled by `1 − origin` elsewhere, because in a suburb people
mostly leave from, much of the inbound flow is residents coming home — which
the departure curve already counts, running backwards.

## What the app shows

Where the tap data reaches, the street sheet's "how busy is it?" explanation
now reads something like:

> At this hour everyone who drives to the train has already gone around Gordon
> Station, 222 m away — 96% of the daily peak, from Transport for NSW Opal tap
> data
>
> Those are mostly residents' cars, and the rules here keep commuters from
> taking the space they leave behind
>
> Pattern from Transport for NSW Opal tap-on/tap-off data, week of 2020-02-24
> (shape reproduces at r=0.96 against a second week), calibrated against 3,292
> measured car-park readings

Confidence stays capped well below certainty. The shapes are measured and the
response is fitted, but it is fitted on **off-street** car parks, and a lot is
not a kerb. What transfers is the response to commuter flow, not the level.

## Limits, in one place

- **Privacy suppression.** Fifteen-minute buckets under about 18 taps are
  omitted from the source, not zeroed. A quiet station therefore looks emptier
  overnight than it is, so any location under 1,500 taps a day is dropped
  rather than shipped with a curve made mostly of absences. 330 locations were
  dropped for this.
- **Age.** The shape is 2020. The level is corrected to 2024–25 where the
  modern feed names the station, and is `null` where it does not.
- **Coverage.** 160 stations and 133 postcodes inside the 30 km disc. A street
  more than 1 km from an origin station and outside a bus-served postcode gets
  no transit signal at all and falls back to the old hand-set prior — which is
  still there, still labelled a guess, now only as the fallback.
- **Transfer.** Fitted on off-street commuter lots, applied to kerbs.
- **Stations that opened since 2020** (most of the Metro, the Parramatta light
  rail) have a modern level and no 2020 curve. They are listed by name in
  `openedSince2020` in the model file rather than silently treated as quiet.
- **It is an estimate, and it stays one.** Nothing here ever changes a street's
  classification. A kerb's rules come from a council or TfNSW response or a
  photographed sign, and this model cannot touch them.

## Sources

All public, all attributed.

| data | source | licence |
|---|---|---|
| Opal tap-on/tap-off, 2020 Release 3 | TfNSW Open Data Hub | CC BY 4.0 |
| Station monthly usage, Nov 2024 → | TfNSW Open Data Hub | CC BY 4.0 |
| Station and wharf coordinates | TfNSW GTFS static feeds | CC BY 4.0 |
| Suburb boundaries and postcodes | NSW Spatial Services, NSW Administrative Boundaries Theme | CC BY 4.0 |
| Park&Ride occupancy | TfNSW Car Park API | Open Data Hub terms |

## Running it

```bash
python3 scripts/fetch-opal-demand.py            # rebuild the curves (cached downloads)
python3 scripts/fetch-opal-demand.py --refresh  # re-download everything
python3 scripts/train-occupancy-model.py        # dry run: print the fit
python3 scripts/train-occupancy-model.py --write --refresh   # refit on new history
```

The 31 MB of Opal CSVs are cached in `.cache/opal/`, not committed — they are a
fixed historical release and the URLs are in the script. What is committed is
the 151 KB model the app actually reads, plus `scripts/data/transit-stops.json`
so the station geocoding can be re-derived offline.

Refit occasionally — every few weeks is plenty. The history grows by about
1,000 readings a week and the fit will tighten as it covers more of the year.
