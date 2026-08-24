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

Offline avenues already checked and exhausted:

- `scripts/data/_recovery/` (28 MB of previously-fetched raw sources) contains
  only North Sydney and Willoughby material that is already applied, plus TfNSW
  transit maps. Nothing there is applicable to an unenriched council.
- The cached CKAN/ArcGIS-Hub catalogue searches in `_recovery/` list dataset
  *metadata* whose download URLs all point at blocked hosts.

## Current coverage (2026-08-24)

78,346 street features; 65,740 still `cat: "unknown"`. Largest gaps, all at or
near 100% unknown:

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
