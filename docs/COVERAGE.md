# Coverage — how much of Sydney the app can actually describe

The meter audit ([METER-DATA-COVERAGE.md](METER-DATA-COVERAGE.md)) asks how good
our paid-parking data is. This one asks the prior question: **for how many
streets do we know anything at all?**

```bash
npm run coverage        # the table below
npm run fetch-plan      # what is left to fetch (works offline)
```

## The headline

**16.1% of shipped segments are classified. 65,740 of 78,346 are `unknown`** —
drawn as a grey line whose detail sheet says "check signs", which is what the
driver was doing before they installed the app.

That number is not a bug, it is where the sweep stopped. Classification comes
from OSM `parking:lane:*` tagging plus council enrichment, and both thin out
fast past the inner suburbs.

## Current snapshot

```

Classification coverage — data generated 2026-08-16T11:54:40.949175
78,346 street segments across 23 pipeline areas

area                    total   free    ltd   paid  resid noPark noStop  unknown    known
────────────────────────────────────────────────────────────────────────────────────────
Inner Sydney / CBD       8629    431     98   1199   4124    190     17     2570    70.2%
West                     7268     91     12     54      0    125      3     6983     3.9%
The Hills                6420      0      0      0      0      0      0     6420     0.0%
South                    5988     72      0      0     22     27      0     5867     2.0%
Far West                 5947      0      0      0      0      8      1     5938     0.2%
Sutherland               5801      0      0      0      0      0      0     5801     0.0%
North Sydney             5244    204     52    338   1382    250     11     3007    42.7%
Canterbury-Bankstown     5022      0      0      0      0      0      0     5022     0.0%
North Shore              4085     25      4     13    267     46      1     3729     8.7%
Northern Beaches (S)     3870      0      0      0      0      0      0     3870     0.0%
Far North                3837     67      0      0      0     33      0     3737     2.6%
Inner West               3118     64      1     18    620     23      0     2392    23.3%
Eastern suburbs          2685    637    264    110    580    106    280      708    73.6%
disc sweep @30           2216      0      0      0      0      0      0     2216     0.0%
Inner West (west)        2147     32      0      0    347      7      0     1761    18.0%
Northern Beaches (N)     1739      0      0      0      0      0      0     1739     0.0%
disc sweep @60           1640      0      0      0      0      0      0     1640     0.0%
Far North (2)             826      0      0      0      0      0      0      826     0.0%
South East                815     41      0      0     11     14      0      749     8.1%
disc sweep @90            645      0      0      0      0      0      0      645     0.0%
Eastern suburbs (north)    353    120     11      0    103     16     34       69    80.5%
disc sweep @120            27      0      0      0      0      0      0       27     0.0%
disc sweep @0              24      0      0      0      0      0      0       24     0.0%
────────────────────────────────────────────────────────────────────────────────────────
ALL                     78346   1784    442   1732   7456    845    347    65740    16.1%

Bundle weight: 20.3 MB unknown + 5.4 MB classified
  79% of the data ships to draw streets the app cannot describe.

Areas with nothing classified at all (28,230 segments):
  The Hills                6420 segments
  Sutherland               5801 segments
  Canterbury-Bankstown     5022 segments
  Northern Beaches (S)     3870 segments
  disc sweep @30           2216 segments
  Northern Beaches (N)     1739 segments
  disc sweep @60           1640 segments
  Far North (2)             826 segments
  disc sweep @90            645 segments
  disc sweep @120            27 segments
  disc sweep @0              24 segments

Areas under 50% classified — best return on the next fetch:
  West                     3.9%  (6,983 unknown)
  South                    2.0%  (5,867 unknown)
  Far West                 0.2%  (5,938 unknown)
  North Sydney            42.7%  (3,007 unknown)
  North Shore              8.7%  (3,729 unknown)
  Far North                2.6%  (3,737 unknown)
  Inner West              23.3%  (2,392 unknown)
  Inner West (west)       18.0%  (1,761 unknown)
  South East               8.1%  (749 unknown)

```

## Reading the table

Three distinct situations hide behind "unknown":

1. **Swept, genuinely untagged.** The Hills, Sutherland, Canterbury-Bankstown,
   Northern Beaches — 28,230 segments with *nothing* classified. The base road
   network was fetched; OSM simply has no parking tags there, and no council
   source is wired up. More Overpass requests will not help. These need council
   open data or they stay grey.
2. **Swept, partially tagged.** West (3.9%), South (2.0%), Far West (0.2%),
   North Shore (8.7%), Far North (2.6%). Some tagging exists; enrichment has not
   been run for these councils.
3. **Well covered.** Eastern suburbs (north) 80.5%, Eastern suburbs 73.6%,
   Inner Sydney 70.2%, North Sydney 42.7%. These are the areas where the app
   does what it promises.

**The product is honest only in group 3.** Anyone opening the app in Castle Hill
or Cronulla sees a grey map. That is worth saying out loud in the App Store
description and the welcome overlay, rather than letting them discover it.

## The disc sweep stopped halfway

`disc_*` areas are chunks of a resumable grid sweep over a 30 km disc around the
CBD. `npm run fetch-plan` reads the bundle and reports exactly where it stopped:

```
Bundle: 78,346 segments, generated 2026-08-16T11:54:40.949175

Disc grid: 309 cells of ~3.3km within 30km of the CBD.
  108 inside the 18km tagged-query radius (2 requests each), 201 outside it (1 request each).
  Full sweep = 417 Overpass requests.

Chunks already fetched: disc_0, disc_30, disc_60, disc_90, disc_120
  chunk size looks like 30 cells; sweep reached cell ~150 of 309
  48.5% of the disc swept, 159 cells left

Resume with (one chunk at a time, each is resumable):
  node scripts/fetch-parking-data.mjs --area disc --from 150 --count 30
  node scripts/fetch-parking-data.mjs --area disc --from 180 --count 30
  node scripts/fetch-parking-data.mjs --area disc --from 210 --count 30
  node scripts/fetch-parking-data.mjs --area disc --from 240 --count 30
  node scripts/fetch-parking-data.mjs --area disc --from 270 --count 30
  node scripts/fetch-parking-data.mjs --area disc --from 300 --count 30
```

**48.5% swept, 159 cells left, 417 Overpass requests for the full grid.** The
sweep is not lost — it is paused at cell 150, resumable one chunk at a time, and
every chunk lands under its own `disc_<N>` area so nothing overwrites anything.

Worth knowing: with `--gaps-only` the grid shrinks to 129 cells (155 requests),
because ~58% of the disc already sits inside the hand-placed area boxes. That is
the cheaper sweep, but its cell indices do not line up with the chunks already
fetched — `--plan --gaps-only` will tell you so rather than reporting nonsense.

All of it needs network access the sessions do not have. See
[UNBLOCK-NETWORK.md](UNBLOCK-NETWORK.md).

## The bundle-size problem this creates

```
Bundle weight: 20.3 MB unknown + 5.4 MB classified
```

**79% of the data ships to draw streets the app cannot describe.** `parking.json`
is 28 MB on disk and the exported web bundle is 26 MB, essentially all of it this
file. On iOS that is download size and memory.

And it gets worse as coverage improves: finishing the disc sweep roughly doubles
the segment count, most of it more unknowns.

Options, cheapest first:

1. **Drop unknown segments outside the covered areas.** The basemap already draws
   those roads. We would lose the "grey means we looked" signal in places where
   we have nothing to say anyway.
2. **Split the bundle by area and load on demand.** Keeps the signal, fixes the
   size, costs a loader and a cache. This is the right answer if coverage is
   going to keep growing.
3. **Simplify unknown geometry.** They are drawn as thin grey lines and used for
   tap-matching; they do not need every vertex. Coordinates are already at 5 dp
   (~1 m), so the win here is vertex count, not precision.

Not done — each is a real change with real trade-offs, and the decision depends
on whether we expect the unknown share to shrink.

## What would move the number

| Action | Needs | Expected gain |
|---|---|---|
| Resume the disc sweep (159 cells) | Overpass access | More segments, mostly unknown — coverage *breadth*, not depth |
| Wire council meter sources (16 councils) | Council open data | Turns `unknown` and bare `paid` into real rules — see the meter audit |
| Run enrichment for West / South / North Shore | Council open data | Lifts three areas out of single-digit percentages |
| Nothing at all | — | The number stays 16.1% and the data keeps ageing |

The second row is where the product value is. Breadth without depth just adds
more grey lines.
