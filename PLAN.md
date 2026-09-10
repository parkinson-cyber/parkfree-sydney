# Plan

Goal, in the user's words: *the app up and running, an algorithm to estimate live parking availability, let users note and save their parking spot, open source so other people can share live updates of street parking — because finding a spot in Sydney is always hard.*

Milestones are ordered so each one ships something usable on its own. Estimates are working sessions, not calendar time.

---

## M0 — Housekeeping (½ session)
- Done 2026-09-08: Lane Cove corrected from council text; Willoughby South scheme applied; overlays fully re-derivable.
- Merge `claude/ios-app-documentation-cscddp` after review (time-travel slider is a real feature). Close the stale North Sydney branch.
- Squash-free cleanup of `scripts/DATA-SOURCE-LEADS.md`: keep *Candidate endpoints* + the detached-HEAD note, delete the 80 run logs.
- Confirm the claude.ai/code routine is deleted (user).
- Fix `LICENSE` copyright, repo description, add topics (`sydney`, `parking`, `expo`, `open-data`).

## M1 — Native build actually running (1 session)
- `npm run ios` on the Simulator with Xcode 15.4; harvest `eas.json` from the old clone; commit it.
- EAS preview build so the user can install on their own iPhone (user runs `eas build`; Claude prepares config).
- **Done when:** the user can open the app on their phone and tap "Find me a park".

## M2 — Crowd layer backend — DONE 2026-09-09 (pending Upstash provisioning)
Port `ParkFreeSyd/server/` into this repo as Vercel functions (`api/`), reshaped for streets:
- `POST /api/reports` `{ streetId, side?, kind, deviceId }` where `kind ∈ parked | left | looks_full | looks_empty`. Sydney bbox check, 30/device/hour rate limit, anonymous device id.
- `GET /api/reports?lat&lon&radius` → recent reports, TTL-expired (15 min `left`, 30 min others).
- Storage: Upstash Redis (free) via REST, GEO index + TTL. In-memory fallback so previews work with no env vars.
- **Provenance rule applies:** reports are stored with `source: user` and rendered as reports, never merged into `cat`.
- **Done when:** a report made on one device shows on another within 30 s.

## M3 — Live availability estimate — SHIPPED 2026-09-10 (priors still hand-set; replace with history.jsonl once ~4 weeks accumulate)
Nobody publishes on-street occupancy for Sydney (City of Sydney removed its sensors). So this is an **estimate**, and the UI must say so. Score each classified segment 0–1 = P(a space is free now):

1. **Legal gate** — `rules.ts` says whether you may park now. If not, score = 0. (Exists.)
2. **Prior** `p0(segment, weekday, hour)` — a small table keyed by street class × context: metered CBD after cut-off, residential near a station on a weekday, beach suburbs on a summer weekend, etc. Start hand-set from known Sydney patterns (documented in `src/lib/availability.ts`), then replaced by observed rates as reports accumulate.
3. **Crowd evidence** — each report shifts the score with a weight that decays exponentially (half-life ~10 min for `left`/`looks_empty`, ~20 min for `parked`/`looks_full`). Bayesian-ish log-odds update; five reports never outweigh a legal ban.
4. **Timer-derived departures** — the existing parking timer already knows *when a user intends to leave*. With opt-in ("share when I'm leaving"), a timer expiring in ≤10 min becomes a soft `left`-soon signal for that segment. This is the one genuinely live signal no one else has.
5. **Surface:** three bands — *likely free / uncertain / likely full* — as a subtle stripe on the street, plus "estimate · based on N reports" in the sheet. `findPark.ts` uses score as a tiebreaker within 150 m, never to override distance by more than that.

Tests: property tests on the log-odds update (monotone, bounded, decays to prior), table snapshot for priors. **Done when:** two users in the same block see the same band, and the sheet explains why.

## M4 — Hourly data agent, done right (1 session)
- **Job 1 done 2026-09-08** (see PROGRESS → Live car parks). Job 2 (weekly re-fetch + PR) still open.
Replace the egress-blocked cloud routine with **GitHub Actions** (`schedule: 0 * * * *`, runners have open egress):
- Job 1 (hourly): TfNSW Car Park API → `api/cron/ingest` (needs the user's API key as a repo secret). Also probes the *Candidate endpoints* list once a day and opens a GitHub issue when a host that was down comes up — no commits.
- Job 2 (weekly): re-run `fetch-parking-data.mjs` + `apply-enrichment.sh`, open a PR only if `parking.json` changed and the classified count didn't drop.
- Rule: a run that changes nothing writes nothing.

## M5 — Save my spot — DONE 2026-09-09
- "I parked here" button: stores `{ lat, lon, streetId, at, note?, photo? }` in AsyncStorage; pin on the map; "Walk me back" opens Apple/Google Maps walking directions; ties into the existing timer + move-your-car notification.
- Optional share toggle: posts a `parked` report (M2) and, on timer expiry, a `left` report — this is what feeds M3 step 4.
- **Done when:** park, close the app, reopen an hour later, tap "walk me back".

## M6 — Open source properly (½ session)
- `CONTRIBUTING.md` with the provenance rules and "how to add a council" (the `fetch-<council>-parking.py` pattern + `scripts/data/` schedule format).
- CI on PRs: typecheck + tests + a `parking.json` sanity check (feature count, no `unknown→free` diff).
- Issue templates: *wrong sign data on my street*, *add my council*.
- Data attribution page in-app (OSM ODbL, each council's licence).

## M7 — App Store (user-driven)
- Apple Developer account, EAS production build, screenshots, privacy nutrition label (location: while-in-use; anonymous device id; optional shared reports).

---

## M8 — iOS-native visual pass — palette, glass and the phone-first layout DONE 2026-09-10 (mustard search bar, sage data panel, chrome 25% → 6% of screen). Layout is bottom-anchored (search bar last, context above it) with a live blue location dot. Still to do: bottom-sheet detents (drag between peek/full), spring transitions, haptics on sheet open

The app works; it doesn't yet *feel* like a native iOS app. Wanted: the current
iOS look — translucent/glass layers over the map, proper depth and blur on the
sheets, native-weight typography, spring transitions, larger tap targets, a
real bottom-sheet with detents rather than a fixed card.

Notes for whoever picks this up:
- `expo-blur` gives real material blur on iOS and degrades on web; the sheets
  (`StreetSheet`, `BusySheet`, `ReportBar`, `MySpotCard`) are the place to
  start — they are already the app's whole chrome.
- Keep the map legible: glass over a dark map kills contrast fast, and the
  colour of a street is the product. Test at night and in sun.
- The status page (`public/status.html`) is separate and can stay plain.

## M9 — North Shore fill, in the order requested (2026-09-10)

Each step below names the source *before* the work, because a suburb with no
published source cannot be filled without inventing data. Status as probed
2026-09-10 from this Mac (open egress):

| # | Target | Council | Source found? | Plan |
|---|---|---|---|---|
| 1 | **Roseville** | Ku-ring-gai | **Car parks only** — 53 council car parks with space counts, applied. No RPS (council policy), no sign register. | ✅ car parks done. Streets need field photos or a council request. |
| 2 | **Castlecrag** | Willoughby | **Not yet** — Willoughby's open sign census is Chatswood CBD only; no asset register on ArcGIS; site is Exponare (planning layers). | Probe Exponare REST + Have Your Say for a Castlecrag/Northbridge scheme map (the Willoughby South pattern). |
| 3 | **Ku-ring-gai rest** (Lindfield, Gordon, Killara, St Ives, Pymble, Turramurra, Wahroonga) | Ku-ring-gai | **Car parks only** (same layer). | Car parks applied. Streets: council request, or accept unknown. |
| 4 | **Hornsby** | Hornsby | **Lead**: IntraMaps at `map.hornsby.nsw.gov.au/intramaps99/`; `ApplicationEngine/Projects/` returns JSON, so there is an API to walk. | Walk the IntraMaps project/module tree for a parking or sign layer. |
| 5 | **Northern Beaches (rest)** | Northern Beaches | **Applied** — sign register gave 1,408 segments (Manly 55%). | Refine: Manly permit-scheme areas; the 906 signs that matched no street within 22 m. |
| 6 | **West — Parramatta, Granville, Merrylands, Auburn** | City of Parramatta / Cumberland | **Main roads applied** via TfNSW clearways (Woodville Rd, James Ruse Dr, The Horsley Dr). Side streets: no council source found yet. | Probe Parramatta + Cumberland GIS (in the 3-hourly sweep). Parramatta CBD may have a meter layer. |
| 7 | **South — Hurstville, Kogarah, Rockdale, Bankstown** | Georges River / Bayside / Canterbury-Bankstown | **Main roads applied** (Forest Rd, Stoney Creek Rd, Punchbowl Rd, King Georges Rd). Side streets: none. Georges River was checked in July — permit scheme exists but no online GIS. | Probe Georges River / Bayside / Canterbury-Bankstown (in the sweep). |

**Every 3 hours**, `.github/workflows/gap-sweep.yml` re-runs the network sources
and opens a PR only if the map actually moved, and separately knocks on the
councils in steps 6–7 that publish nothing, reporting anything new in the run
summary. It cannot invent rules and does not try; what it automates is
noticing the day a council opens a layer.

Honest expectation to set: steps 2–4 may all come back "no published source",
in which case those suburbs stay unknown until someone photographs signs or a
council answers a data request. That is the correct outcome, not a failure —
the alternative is inventing parking rules.

## M10 — All of Sydney, scheduled (2026-09-10)

Coverage measured per council, not guessed: every street midpoint in
`parking.json` point-in-polygon'd against **NSW Spatial Services LGA
boundaries**. The machine-readable queue is `scripts/data/coverage-queue.json`
— a future session (or the 3-hourly sweep) can pick up from it without this
conversation.

**Work order.** Councils where a source is already in hand come first: finishing
a source you have is far cheaper than finding one you don't. Then the biggest
unmapped councils, largest gap first.

### Wave 1 — finish what's already sourced (14,418 streets)

| LGA | streets | classified | unknown | source status |
|---|---:|---:|---:|---|
| Northern Beaches | 6,089 | 24% | 4,606 | Sign asset register applied (1,408 segs). Next: Manly permit areas, 906 unmatched signs |
| Inner West | 3,533 | 25% | 2,644 | RPS schedules applied. No sign census published |
| Ryde | 2,575 | 13% | 2,228 | RPS zones applied. Park’nPay sensors exist but are not published |
| Canada Bay | 1,517 | 16% | 1,272 | Five Dock Area 6 only; Areas 1-5 login-walled |
| Willoughby | 1,792 | 32% | 1,225 | Chatswood CBD signs + Willoughby South scheme map. Rest of LGA unsourced — check Have Your Say for more scheme maps |
| Strathfield | 925 | 24% | 704 | RPS 1-50 applied (vision-derived) |
| Lane Cove | 883 | 36% | 563 | Council schedule applied (TRIM directive) |
| Mosman | 643 | 15% | 548 | RPS map read visually; no machine-readable source |
| Burwood | 785 | 47% | 416 | RPS areas applied (vision-derived) |
| Hunters Hill | 237 | 11% | 212 | Woolwich W1 only |

### Wave 2 — biggest gaps, source unknown (39,292 streets)

| LGA | streets | classified | unknown | source status |
|---|---:|---:|---:|---|
| Canterbury-Bankstown | 7,216 | 2% | 7,047 | Not yet probed — biggest single gap in Sydney |
| Blacktown | 5,245 | 0% | 5,243 | Not yet probed |
| The Hills Shire | 4,472 | 1% | 4,413 | Not yet probed |
| City Of Parramatta | 4,820 | 9% | 4,371 | Not yet probed; CBD likely has a meter layer |
| Cumberland | 4,133 | 4% | 3,979 | Not yet probed |
| Bayside | 3,353 | 8% | 3,093 | Appears as a publisher in TfNSW council-data catalogue — check for a sign bundle |
| Fairfield | 3,054 | 2% | 3,003 | Not yet probed |
| Hornsby | 3,074 | 4% | 2,957 | IntraMaps at map.hornsby.nsw.gov.au — ApplicationEngine/Projects answers JSON; walk it |
| Liverpool | 2,704 | 0% | 2,700 | Not yet probed |
| Georges River | 2,579 | 4% | 2,486 | RPS exists, no online GIS found. Probe maps.georgesriver + Have Your Say |

### Wave 3 — checked, nothing published

| LGA | streets | classified | unknown | source status |
|---|---:|---:|---:|---|
| Ku-Ring-Gai | 2,590 | 3% | 2,521 | No RPS by policy, no sign register. 53 council car parks applied |
| Sutherland Shire | 5,060 | 2% | 4,984 | 49 GIS services checked — no parking layer. Cronulla unsourced |

These stay unknown until a council publishes, someone photographs signs, or a
data request is answered. That is the correct state, not a backlog item to be
filled by guessing.

### Effectively done

| LGA | streets | classified | unknown | source status |
|---|---:|---:|---:|---|
| Randwick | 2,591 | 44% | 1,463 | Resident-zone + commercial kerbs GIS — applied |
| Woollahra | 1,352 | 81% | 256 | RPS address-check GIS — applied |
| Sydney | 4,391 | 95% | 202 | ArcGIS: meters, rates, free-15, permits — applied |
| North Sydney | 1,566 | 89% | 168 | RPS PDFs + meter Google map — applied |
| Waverley | 1,164 | 97% | 32 | Full sign census (TfNSW council bundle) — applied |

### How this proceeds without a session

The 3-hourly `gap-sweep` workflow already probes the Wave 2 councils and
reports anything new in its run summary. When a probe comes back with a
parking or sign layer, that council moves to Wave 1 and is worth a session.
Nothing here requires a person to remember it.

## M11 — Crowd-flow signal for the busy estimate (assessed 2026-09-10)

Asked whether Google Maps "Popular times" / live busyness could drive the
availability estimate. **It cannot be used**, and the reason matters:

- Popular Times and live busyness are **not fields in the Google Places API**
  — they exist only in the Maps UI. Every route to them is a scraper
  (populartimes, ScrapingBee, Apify), which breaches Google Maps Platform
  terms and would contradict the calls this project already made on Parkopedia
  and the meter-payment apps. It is also the most aggressively enforced ToS of
  any source we've touched.

**The same signal, from sources we may actually use:**

| Source | What it gives | Status |
|---|---|---|
| TfNSW car park occupancy | Real measured occupancy, hourly, 40 facilities | **Already banked** — `history.jsonl`, growing every hour, and already an input to the estimate |
| Opal tap-on/tap-off patronage | Station-level trip counts by hour — genuine crowd flow, official, free | Not yet used. The closest legitimate substitute for "flow of people" |
| City of Sydney pedestrian sensors | Automated pedestrian counts at fixed sites | Not yet used |
| Our own crowd reports + parking timers | Departures and arrivals on the exact kerb | Live |

Next step for M11: ingest Opal patronage by hour and use it to replace the
hand-set time-of-day priors in `src/lib/availability.ts`, which is exactly
what those priors were written to be replaced by.

### Data leads still worth a session (corridor)
- **Willoughby**: the council has more scheme maps like Willoughby South (Naremburn precinct expansion was consulted on) — search haveyoursaywilloughby.com.au for each, same pipeline. Also its 2020 LTC minutes list RA areas RA1–RA23; no street list found yet.
- **Randwick**: `extTransport/ResidentParkingZone` kerb polylines (699, with house numbers) → snap by geometry instead of area polygon for exact per-kerb tagging.
- **Mosman / Ku-ring-gai / North Sydney remainder**: no open source exists; only crowd reports (M2) or a council data request will move these.

### Open questions for the user
1. Crowd reports: anonymous-only forever, or allow an optional nickname later? (Plan assumes anonymous-only.)
2. Should the availability bands show on `unknown` streets too? Plan says **no** — no legal gate means no estimate.
3. ~~TfNSW Car Park API key~~ — done.
