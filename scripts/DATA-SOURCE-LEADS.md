# Parking data source leads — and the egress blocker

## READ THIS FIRST (2026-08-24)

The scheduled data-enrichment session that produced this file could not fetch
**any** parking data. The remote environment's network egress policy allows
GitHub only. Every source host this repo's scripts depend on is refused at the
proxy with `403` to `CONNECT`:

| Host | Result |
| --- | --- |
| `mapservices.randwick.nsw.gov.au` | 403 CONNECT (blocked) |
| `geoserver.ssc.nsw.gov.au` | 403 CONNECT (blocked) |
| `data.nsw.gov.au` | 403 CONNECT (blocked) |
| `opendata.transport.nsw.gov.au` | 403 CONNECT (blocked) |
| `www.arcgis.com`, `services.arcgis.com` | 403 CONNECT (blocked) |
| `maps.six.nsw.gov.au`, `portal.spatial.nsw.gov.au` | 403 CONNECT (blocked) |
| `api.github.com`, `raw.githubusercontent.com` | reachable |

`curl` and the `WebFetch` tool are blocked identically — this is the egress
policy, not a TLS or user-agent problem, so there is nothing to work around in
the scripts. Server-side web *search* still works, which is how the leads below
were gathered, but search snippets are not a verifiable data source and nothing
from them has been (or should be) written into `src/data/parking.json`.

**To unblock:** allow the council GIS / open-data hosts in the environment's
egress policy (claude.ai/code → environment settings). Until then a scheduled
run can only do offline work.

**Re-confirmed on the next hourly run (2026-08-24, second consecutive run).**
Same six hosts, same `403` to `CONNECT`, plus `maps.northernbeaches.nsw.gov.au`.
`curl -sS "$HTTPS_PROXY/__agentproxy/status"` lists each refusal under
`recentRelayFailures` with `"detail": "gateway answered 403 to CONNECT (policy
denial or upstream failure)"` — that is the fastest way to confirm the blocker
in one call at the start of a run. Do not spend a run re-testing hosts one by
one; check the proxy status, and if the council hosts are still refused, do

**Re-confirmed a third consecutive time (2026-08-24, ~05:19 UTC).**
`recentRelayFailures` was empty at session start (nothing had hit the proxy
yet this run), so a direct probe of `data.nsw.gov.au`,
`maps.northernbeaches.nsw.gov.au`, `geoserver.ssc.nsw.gov.au`,
`opendata.transport.nsw.gov.au`, and `www.arcgis.com` was run instead — all
five still return `403` to `CONNECT`, confirming the policy is unchanged.
`origin/main` matched local `HEAD` at session start (previous run's push had
already landed), so there was nothing to fetch and nothing new to add to the
offline avenues above — this run made no data change and pushed only this
note. A push notification was sent flagging the unresolved egress policy so a
human sees it; if a future run finds the hosts still blocked, prefer silence
over repeating this same notification unless something has materially
changed (e.g. a new host observation, or a long gap since the last one).
offline bookkeeping and stop.

**Re-confirmed a fourth consecutive time (2026-08-24, ~06:20 UTC).** Same
council hosts still `403` to `CONNECT` (`recentRelayFailures` was empty again
at session start, so all were re-probed directly). New data point: also
probed `example.com` — a plain, non-council, non-NSW-gov host — and it was
refused with the identical `403 CONNECT` error. This confirms the policy is a
strict allowlist (GitHub + package registries only, per `noProxy` in the
proxy status), not a targeted block of council/government domains
specifically — so there is no narrower workaround to hunt for (e.g. trying a
council's plain marketing site instead of its GIS subdomain would not help
either). Also tried the four previously-untested "candidate" hosts from the
list below (`maps.kmc.nsw.gov.au`, `maps.cityofparramatta.nsw.gov.au`,
`maps.hornsby.nsw.gov.au`, `maps.thehills.nsw.gov.au`) plus
`services.arcgis.com`, `portal.spatial.nsw.gov.au`, and
`mapping.northernbeaches.nsw.gov.au` — all `403` to `CONNECT`, no exceptions.
`origin/main` matched local `HEAD` at session start; no data change, no
notification sent this run (per the standing guidance above — nothing
materially new happened, and it has only been ~1h since the last one). The
next run that finds the hosts still blocked should likewise stay silent
unless a genuinely new observation or a long gap warrants it.

Offline avenues already checked and exhausted:

- `scripts/data/_recovery/` (28 MB of previously-fetched raw sources) contains
  only North Sydney and Willoughby material that is already applied, plus TfNSW
  transit maps. Nothing there is applicable to an unenriched council.
- The cached CKAN/ArcGIS-Hub catalogue searches in `_recovery/` list dataset
  *metadata* whose download URLs all point at blocked hosts.
- `_recovery/osm-raw.json` — a real cached Overpass response (443 elements,
  bbox `-33.86,151.18,-33.79,151.245`), **deliberately not applied**, and it
  should stay that way. Three independent reasons: (a) the bbox is North
  Sydney / Cremorne / Mosman / Willoughby / Chatswood, all of which already
  carry *authoritative council* tagging, so applying it could only overwrite
  better data with worse; (b) the tags are overwhelmingly physical, not
  regulatory — `parking:both=lane` (154) means "a parking lane exists here",
  which is **not** evidence of `free`; only ~20 elements carry a real
  `restriction`/`condition`/`maxstay` value; (c) OSM is crowd-sourced and is
  neither an ArcGIS query result nor a council open-data feed, so it does not
  meet this repo's provenance bar. Leave it as a cached artefact.
- GitHub is the one reachable host, so it was checked as a possible mirror of
  NSW council parking GIS data. There is none — public Australian GeoJSON
  repos carry suburb/postcode/state boundaries, not kerbside parking
  regulation. OSM mirrors (`overpass-api.de`, `overpass.kumi.systems`,
  `nominatim`, `planet.osm.org`, `download.geofabrik.de`) are all blocked too.
  Even if a mirror existed, a third-party copy would be weaker provenance than
  the hard rules allow. This avenue is closed — do not re-search it.

## Gotcha: the session starts on a detached HEAD

A scheduled run's checkout is not on a branch (`git status -sb` prints
`## HEAD (no branch)`). `git push origin main` then reports **"Everything
up-to-date"** and pushes nothing, because local `main` really is unchanged —
your commit is only on the detached HEAD. Push with:

```sh
git push origin HEAD:main
```

Always confirm with `git rev-parse HEAD origin/main` afterwards; if they match,
the push landed and Vercel will deploy.

**Confirmed working:** the next run started at the same detached HEAD and found
both of the previous run's commits already on `origin/main`, so
`git push origin HEAD:main` does land. One trap when you verify: the *local*
`origin/main` ref can be stale at session start, making it look like the last
run's push failed. `git fetch origin main` before comparing, or note that a
`git push` reporting "Everything up-to-date" while it simultaneously advances
your local `origin/main` ref means the remote already had the commits.

## Current coverage (2026-08-24, unchanged across both blocked runs)

78,346 street features; 65,740 still `cat: "unknown"` (83.9%). Classified
breakdown: `residents` 7,456, `free` 1,784, `paid` 1,732, `no_parking` 845,
`free_limited` 442, `no_stopping` 347. Largest gaps, all at or near 100%
unknown:

| area | unknown / total |
| --- | --- |
| `hills` | 6,420 / 6,420 |
| `sutherland` | 5,801 / 5,801 |
| `bankstown` | 5,022 / 5,022 |
| `farwest` | 5,938 / 5,947 |
| `south` | 5,867 / 5,988 |
| `northernbeaches_south` | 3,870 / 3,870 |
| `northernbeaches_north` | 1,739 / 1,739 |
| `farnorth` | 3,737 / 3,837 |
| `northshore` | 3,729 / 4,085 |
| `west` | 6,983 / 7,268 |

## Candidate endpoints to try first when egress is opened

These are hosts surfaced by search, **not yet verified by an actual fetch**.
Treat each as a hypothesis: hit `/arcgis/rest/services?f=json`, walk the folders
for a transport/parking service, and only then run the point-in-polygon pattern
from `fetch-randwick-rps-geo.py`.

- **Sutherland Shire** — `https://geoserver.ssc.nsw.gov.au/arcgis/rest/services`
  (the `ShireMaps/MapServer` service is known to exist). Sutherland has a
  Resident Parking Scheme, so a permit-area layer is plausible.
- **Northern Beaches** — `https://maps.northernbeaches.nsw.gov.au/arcgis/rest/services`
  and `https://mapping.northernbeaches.nsw.gov.au/arcgis/rest/services`
  (`NBC_PWM_LEPs/MapServer` is known to exist). The council publishes a *Manly
  Parking Permit Scheme map* page, so a permit-scheme polygon layer is likely;
  there is also a separate Beach Parking Permit scheme.
- **Ku-ring-gai** — `https://maps.kmc.nsw.gov.au/arcgis/rest/services`
  (`Public/WebTileBase/MapServer` is known to exist).
- **Randwick (already done, but note the extra services)** —
  `intTransport/ResidentParkingZone/MapServer` and
  `extTransport/ase_ResidentParkingZone/MapServer` appear alongside the
  `extTransport/ResidentParkingArea` layer already used. Worth checking whether
  either carries per-street or per-zone detail the current script drops.
- **Georges River** — no ArcGIS host surfaced. Council runs a Resident Parking
  Permit Scheme but has no online permit system, which suggests no public GIS
  layer. Likely a dead end; do not spend long here.
- **Bayside** — appears as a publisher in TfNSW/data.gov.au "Parking and Council
  Data" catalogue searches. Check
  `https://opendata.transport.nsw.gov.au/data/dataset/?groups=parking-and-council-data`
  for a Bayside sign/meter dataset. If (and only if) it is a genuinely complete
  sign census for a defined footprint, the Waverley treatment in
  `fetch-waverley-parking.py` applies; otherwise permit-only tagging.
- **Parramatta / Hornsby / The Hills** — nothing concrete surfaced beyond
  general council ArcGIS usage. Try `?f=json` on obvious hosts
  (`maps.cityofparramatta.nsw.gov.au`, `maps.hornsby.nsw.gov.au`,
  `maps.thehills.nsw.gov.au`) before spending search time.

Reminder of the standing rule, unchanged: never default `unknown` to `free`
without a complete regulatory census for that exact footprint, and never write a
classification that does not trace to a real fetched response.

**Re-confirmed a fifth consecutive time (2026-08-24, ~07:2x UTC).**
`recentRelayFailures` was empty at session start again, so the four core
hosts (Randwick mapservices, Sutherland geoserver, data.nsw.gov.au,
arcgis.com) were re-probed directly — all still `403` to `CONNECT`, no
change. `origin/main` matched local `HEAD` at session start (previous run's
push had already landed), so there was nothing to fetch and no data change
this run either. Per the standing guidance above, no push notification was
sent — the last one went out on the third run and only ~1h has passed,
nothing materially new happened. Stop re-probing every host every run: the
proxy status check plus a 2-4 host spot-check is enough to confirm the
policy is unchanged; save the remaining runtime rather than repeating the
same exhaustive sweep.

**Re-confirmed a sixth consecutive time (2026-08-24, ~10:1x UTC).** Proxy
status again showed `recentRelayFailures: []`; a 5-host spot-check
(Randwick mapservices, Sutherland geoserver, data.nsw.gov.au,
services.arcgis.com, Northern Beaches maps) via both `curl` and the
server-side `WebFetch` tool all still returned `403` to `CONNECT` /
`EGRESS_BLOCKED` — so `WebFetch` running server-side does not bypass this,
it's the same policy. `WebSearch` (which doesn't fetch the target hosts
directly) still works and was used to sanity-check Bayside and Georges
River for anything new: nothing actionable turned up — Bayside's "Resident
Parking Schemes Map" exists but no ArcGIS REST endpoint surfaced in search
snippets, and Georges River remains a likely dead end (no online permit
system, no GIS host found), consistent with the existing notes above. No
data change; `origin/main` again matched local HEAD at session start. This
is now 5+ hours and 6 consecutive hourly runs with zero fetchable data —
notified the user this run, since the blocker has moved from "transient" to
"this schedule cannot make progress until a human changes the environment's
network egress policy."

**Re-confirmed a seventh consecutive time (2026-08-24, ~11:1x UTC).** Proxy
status again `recentRelayFailures: []`; re-probed Randwick mapservices,
Sutherland geoserver, data.nsw.gov.au, and `services.arcgis.com` via curl,
and Randwick mapservices again via the server-side `WebFetch` tool — all
still `403 CONNECT` / `EGRESS_BLOCKED`, no change. One new data point:
`registry.npmjs.org` (already in the proxy's `noProxy` allowlist) was
reachable this run, so `npm install` succeeded and both `npx tsc --noEmit`
and `npx expo export -p web --clear` were actually run and pass clean —
prior blocked runs sometimes had to skip this check when `node_modules` was
absent; it isn't the registry that's blocked, only the council/gov API
hosts. This doesn't change the core blocker (no parking-data source is on
the allowlist) but confirms the repo itself stays healthy. No data change,
no notification sent — per the standing guidance above, the last
notification (sixth run) was only ~1h ago and nothing material changed.

**Re-confirmed an eighth consecutive time (2026-08-24, ~12:2x UTC).** Proxy
status again `recentRelayFailures: []` at session start; spot-checked
Randwick mapservices, Sutherland geoserver, `data.nsw.gov.au`, and
`services.arcgis.com` via curl — all still `403 CONNECT`, no change.
`origin/main` matched local `HEAD` at session start, so no data change this
run either. No notification sent — the last one (sixth run) was ~2h ago and
nothing material changed since the seventh run's confirmation.

**Re-confirmed a ninth consecutive time (2026-08-24, ~13:1x UTC).** Proxy
status showed a fresh `recentRelayFailures` entry this time (a stray
`www.google.com` probe plus `portal.spatial.nsw.gov.au` and
`data.nsw.gov.au`, all `403 connect_rejected`); a direct 4-host spot-check
(Randwick mapservices, Sutherland geoserver, `data.nsw.gov.au`,
`services.arcgis.com`) confirmed the same `403 CONNECT` with no exceptions.
`origin/main` matched local `HEAD` at session start, so no data change this
run either. This is now **9 consecutive hourly runs (~10 hours) with zero
fetchable parking data** — a notification was sent this run since the gap
since the last one (sixth run, ~10:1x UTC) is now ~3 hours, per the standing
"long gap" exception above. Nothing about the blocker itself is new: it
remains a session-level egress allowlist that only a human can widen
(claude.ai/code → environment settings, per "To unblock" above). Future runs
should keep doing the lightweight proxy-status + 4-host spot-check and stay
silent unless a similarly long gap has passed or something material changes
(a host becomes reachable, the policy changes, etc.) — repeating this same
notification hourly would not serve the user.

**Re-confirmed a tenth consecutive time (2026-08-24, ~14:1x UTC).** Proxy
status showed `recentRelayFailures: []` at session start; a direct 4-host
spot-check (Randwick mapservices, Sutherland geoserver, `data.nsw.gov.au`,
`services.arcgis.com`) via curl again returned `403` to `CONNECT` /
`connect_rejected` for all four, no exceptions. `origin/main` matched local
`HEAD` at session start, so no data change this run. `node_modules` was
absent this run (fresh container), so `npm install` was run first (succeeded,
`registry.npmjs.org` reachable as before); `npx tsc --noEmit` then passed
clean and `npx expo export -p web --clear` built successfully — repo stays
healthy. No notification sent — the last one (ninth run) was only ~1h ago and
nothing material changed, per the standing "stay silent unless a similarly
long gap or a material change" guidance above.

**Re-confirmed an eleventh consecutive time (2026-08-24, ~15:18 UTC).** Proxy
status again `recentRelayFailures: []` at session start; a direct 4-host
spot-check (Randwick mapservices, Sutherland geoserver, `data.nsw.gov.au`,
`services.arcgis.com`) via curl again returned `403 CONNECT` /
`connect_rejected` for all four, no exceptions. `origin/main` matched local
`HEAD` at session start, so no data change this run. `node_modules` was
present this run; `npx tsc --noEmit` passed clean and
`npx expo export -p web --clear` built successfully — repo stays healthy. No
notification sent — the last one (ninth run, ~13:1x UTC) was only ~2h ago and
nothing material changed, below the "similarly long gap" bar (~3h) used for
the last notification.

**Re-confirmed a twelfth consecutive time (2026-08-24, ~16:2x UTC).** Proxy
status showed a fresh `recentRelayFailures` entry at session start (Randwick
mapservices, `data.nsw.gov.au`, `opendata.transport.nsw.gov.au`,
`www.arcgis.com`, all `403 connect_rejected`); a direct 4-host spot-check
(Randwick mapservices, Sutherland geoserver, `data.nsw.gov.au`,
`services.arcgis.com`) via curl confirmed the same `403 CONNECT` for all
four, no exceptions. `origin/main` matched local `HEAD` after `git fetch
origin main` at session start, so no data change this run. `node_modules`
was absent this run (fresh container); `npm install` succeeded
(`registry.npmjs.org` reachable as before), then `npx tsc --noEmit` passed
clean and `npx expo export -p web --clear` built successfully — repo stays
healthy. This is now **12 consecutive hourly runs (~13 hours since the
original block was first hit) with zero fetchable parking data.** A push
notification was sent this run — the last one (ninth run, ~13:1x UTC) was
~3h ago, matching the "similarly long gap" bar. Nothing about the blocker
itself is new: it remains a session-level egress allowlist (GitHub +
package registries only) that only a human can widen (claude.ai/code →
environment settings, per "To unblock" above). Until that changes, this
schedule can only re-confirm the block and keep the repo building — it
cannot advance parking-data coverage.

**Re-confirmed a fourteenth consecutive time (2026-08-24, ~18:1x UTC).**
`recentRelayFailures` showed a fresh batch at session start (`portal.spatial.
nsw.gov.au`, `maps.randwick.nsw.gov.au`, `data.nsw.gov.au`,
`opendata.transport.nsw.gov.au`, `services.arcgis.com`,
`www.northernbeaches.nsw.gov.au`, all `403 connect_rejected`); a direct
4-host spot-check (Randwick mapservices, Sutherland geoserver,
`data.nsw.gov.au`, `services.arcgis.com`) via curl confirmed the same `403
CONNECT`, no exceptions. `origin/main` matched local `HEAD` after `git fetch
origin main` at session start (the detached-HEAD ref was stale by one commit
until fetched, as this doc's gotcha section predicts), so no data change
this run. `node_modules` was present but stale/incomplete (bare `npx tsc
--noEmit` failed on missing `zustand`/`react-native`/etc.); `npm install`
fixed it, then `npx tsc --noEmit` passed clean and `npx expo export -p web
--clear` built successfully — repo stays healthy. No notification sent —
the previous run (thirteenth, ~17:18 UTC) notified only ~1h ago and nothing
material changed since; per the standing guidance, holding for a similarly
long gap (~3h) or an actual change before notifying again.

**Re-confirmed a fifteenth consecutive time (2026-08-24, ~19:17 UTC).**
Proxy status showed `recentRelayFailures: []` at session start; a direct
4-host spot-check (Randwick mapservices, Sutherland geoserver,
`data.nsw.gov.au`, `services.arcgis.com`) via curl again returned `403`
(`CONNECT tunnel failed, response 403`) for all four, no exceptions.
`origin/main` matched local `HEAD` after `git fetch origin main` at session
start, so no data change this run. `node_modules` was absent this run
(fresh container); `npm install` succeeded (`registry.npmjs.org` reachable
as before), then `npx tsc --noEmit` passed clean and `npx expo export -p web
--clear` built successfully — repo stays healthy. No notification sent —
the last one (thirteenth run, ~17:18 UTC) was only ~2h ago, short of the
"similarly long gap" bar (~3h) used previously, and nothing material
changed since the fourteenth run's re-confirmation.

**Re-confirmed a sixteenth consecutive time (2026-08-24, ~20:17 UTC).** Proxy
status showed `recentRelayFailures: []` at session start; a direct 5-host
spot-check (Randwick mapservices, Sutherland geoserver, `data.nsw.gov.au`,
`opendata.transport.nsw.gov.au`, `services.arcgis.com`) via curl again
returned `403` (`CONNECT tunnel failed, response 403`) for all five, no
exceptions. `origin/main` matched local `HEAD` at session start (nothing to
fetch), so no data change this run. `node_modules` was absent this run
(fresh container); `npm install` succeeded, then `npx tsc --noEmit` passed
clean and `npx expo export -p web --clear` built successfully — repo stays
healthy. This is now **16 consecutive hourly runs (~17 hours since the
original block was first hit) with zero fetchable parking data.** A push
notification was sent this run — the last one (thirteenth run, ~17:18 UTC)
was ~3h ago, matching the "similarly long gap" bar this doc has been using.
Nothing about the blocker itself is new: it remains a session-level egress
allowlist (GitHub + package registries only) that only a human can widen
(claude.ai/code → environment settings, per "To unblock" above). Until that
changes, this schedule can only re-confirm the block and keep the repo
building — it cannot advance parking-data coverage.

**Re-confirmed a seventeenth consecutive time (2026-08-24, ~21:16 UTC).**
Proxy status showed `recentRelayFailures: []` at session start; a direct
4-host spot-check (Randwick mapservices, Sutherland geoserver,
`data.nsw.gov.au`, `services.arcgis.com`) via curl again returned `403`
(`CONNECT tunnel failed, response 403`) for all four, no exceptions.
`origin/main` matched local `HEAD` after `git fetch origin main` at session
start, so no data change this run. `node_modules` was present but
required a fresh `npm install`; `npx tsc --noEmit` passed clean and
`npx expo export -p web --clear` built successfully — repo stays healthy.
No notification sent — the last one (sixteenth run, ~20:17 UTC) was only
~1h ago, well short of the "similarly long gap" bar (~3h) used previously,
and nothing material changed. This is now **17 consecutive hourly runs
(~18 hours since the original block was first hit) with zero fetchable
parking data.**

**Re-confirmed an eighteenth consecutive time (2026-08-24, ~22:17 UTC).**
Proxy status showed `recentRelayFailures: []` at session start; a direct
5-host spot-check (Randwick mapservices, Sutherland geoserver,
`data.nsw.gov.au`, `services.arcgis.com`, `opendata.transport.nsw.gov.au`)
via curl again returned `403` (`CONNECT tunnel failed, response 403`) for
all five, no exceptions; a plain non-government control host
(`example.com`) got the identical `403`, reconfirming this is the blanket
allowlist policy, not a targeted government-domain block. `origin/main`
matched local `HEAD` after `git fetch origin main` at session start
(nothing to fetch), so no data change this run. Also re-did the
detached-HEAD-at-session-start workaround explicitly this time
(`git checkout -B main origin/main`) before committing, per this doc's
gotcha note. `node_modules` was present but required a fresh
`npm install`; `npx tsc --noEmit` passed clean and `npx expo export -p web
--clear` built successfully — repo stays healthy. No notification sent —
the last one (sixteenth run, ~20:17 UTC) was ~2h ago, still short of the
"similarly long gap" bar (~3h) used previously, and nothing material
changed since the seventeenth run's re-confirmation. This is now **18
consecutive hourly runs (~19 hours since the original block was first hit)
with zero fetchable parking data.**

**Re-confirmed a nineteenth consecutive time (2026-08-24, ~23:16 UTC).**
Proxy status showed `recentRelayFailures: []` at session start; a direct
5-host spot-check (Randwick mapservices, `data.nsw.gov.au`,
`services.arcgis.com`, `opendata.transport.nsw.gov.au`, and a plain
non-government control host `example.com`) via curl again returned `403`
(`CONNECT tunnel failed, response 403`) for all five, no exceptions — the
control host confirms this remains the blanket allowlist policy, not a
targeted government-domain block. `origin/main` matched local `HEAD` after
`git fetch origin main` at session start (nothing to fetch); re-did the
detached-HEAD-at-session-start workaround (`git checkout -B main
origin/main`) before committing, per this doc's gotcha note. `node_modules`
was absent this run (fresh container); `npm install` succeeded, then
`npx tsc --noEmit` passed clean and `npx expo export -p web --clear` built
successfully — repo stays healthy. This is now **19 consecutive hourly runs
(~20 hours since the original block was first hit) with zero fetchable
parking data.** A push notification was sent this run — the last one
(sixteenth run, ~20:17 UTC) was ~3h ago, matching the "similarly long gap"
bar this doc has been using. Nothing about the blocker itself is new: it
remains a session-level egress allowlist (GitHub + package registries only)
that only a human can widen (claude.ai/code → environment settings, per "To
unblock" above). Until that changes, this schedule can only re-confirm the
block and keep the repo building — it cannot advance parking-data coverage.
