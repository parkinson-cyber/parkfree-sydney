# Unblocking network access (why the data refresh has done nothing since 16 Aug)

## The symptom

`git log` shows ~80 consecutive commits reading

```
Re-confirm egress blocker a seventy-ninth consecutive run; no data change
```

and `src/data/parking.json` still carries `"generated": "2026-08-16T11:54:40"`.

Every scheduled refresh since then has started, discovered it cannot reach a
single data source, written a note, and stopped. Nothing is wrong with the
pipeline or the app — the sessions simply have no route to the internet.

## The cause

Claude Code sessions run in a sandboxed container whose outbound HTTPS goes
through an agent proxy. That proxy enforces the **network policy chosen on the
environment**, not on the session. This repo's environment is currently on a
policy that allows only:

- GitHub
- package registries (npm, PyPI, crates.io, jsr, Go proxy)
- Anthropic API hosts

Everything else is refused at the gateway. Confirmed live in this session:

```
$ curl -sS -o /dev/null -w '%{http_code}\n' https://overpass-api.de/api/status
000

$ curl -sS "$HTTPS_PROXY/__agentproxy/status"
"recentRelayFailures": [
  { "kind": "connect_rejected",
    "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
    "host": "overpass-api.de:443" },
  { ... "host": "data.cityofsydney.nsw.gov.au:443" },
  { ... "host": "docs.expo.dev:443" }
]
```

`connect_rejected` / 403-on-CONNECT is a **policy denial**, not an outage and
not a TLS problem. No amount of retrying, mirror-switching or proxy fiddling
from inside a session can fix it — and nothing should ever be "fixed" by
disabling TLS verification or unsetting `HTTPS_PROXY`.

## The fix (has to be done from outside the session)

1. Go to **claude.ai/code → Environments** and open the environment this repo
   uses.
2. Change its **network access** setting from the restricted default to a
   policy that permits custom domains, and add the allowlist below.
3. Save. New sessions pick the policy up; **existing sessions do not** — start a
   fresh one to test.
4. Verify inside the new session:
   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' https://overpass-api.de/api/status   # want 200
   node scripts/meter-coverage.mjs                                               # baseline
   npm run fetch-data                                                            # real refresh
   ```

Reference: <https://code.claude.com/docs/en/claude-code-on-the-web>

## Hosts to allow

Grouped so you can start narrow and widen later. The first group alone unblocks
the bulk refresh; the rest unblock per-council meter enrichment.

### Base street network (required)

```
overpass-api.de
overpass.kumi.systems
overpass.private.coffee
```

### NSW / state open data

```
opendata.transport.nsw.gov.au
data.nsw.gov.au
```

### Esri ArcGIS (most councils publish through these)

```
services.arcgis.com
services1.arcgis.com
services3.arcgis.com
utility.arcgis.com
```

### Council-hosted GIS and documents

```
data.cityofsydney.nsw.gov.au
www.northsydney.nsw.gov.au
mapservices.randwick.nsw.gov.au
maps.kmc.nsw.gov.au
maps.northernbeaches.nsw.gov.au
mapping.northernbeaches.nsw.gov.au
geoserver.ssc.nsw.gov.au
www.burwood.nsw.gov.au
www.huntershill.nsw.gov.au
www.strathfield.nsw.gov.au
```

### Project rule compliance

```
docs.expo.dev
```

`AGENTS.md` requires reading the pinned Expo SDK 57 docs before writing code.
That host is blocked too, so the project's own rule is currently impossible to
follow — worth allowing regardless of the data pipeline.

## Also: stop the no-op commits

While the blocker stands, the scheduled job should **log once and exit**, not
commit. Eighty near-identical commits bury the real history and make
`origin/main` look like it is moving when it is not. If the job is a Routine,
either pause it until the allowlist lands, or change its prompt so it only
writes a commit when `src/data/parking.json` actually changes.
