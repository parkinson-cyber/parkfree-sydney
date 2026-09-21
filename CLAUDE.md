# ParkFree Sydney — read this first

**What this is:** a personal tool. The owner built it to find free parking in
Sydney for himself — it is not a product, has no users to serve, and is not
being maintained as an open-source project (owner, 2026-09-11). Keep that in
mind when weighing effort: polish that only matters to strangers is wasted,
and the accuracy rules below matter *more*, not less — a wrong "free" here is
a fine the owner personally pays.

@AGENTS.md

## Start of every session
0. **Update the docs first, then work.** Re-read `PROGRESS.md` and `PLAN.md`,
   and correct anything the last session left stale *before* writing code —
   coverage numbers, what is deployed, what is blocked. These files are the
   only memory that survives; a wrong line here sends the next session down a
   path that was already tried. `scripts/data/coverage-queue.json` holds the
   per-council work order and is regenerated, not hand-edited.
1. `git fetch origin && git status -sb` — work on `main` in **this** clone (`/Users/abc/Documents/macos/parkfree/repo`). Everything else ParkFree lives under `/Users/abc/Documents/macos/parkfree/` (`docs/`, `ss/` — every redundant version); see its README.
2. Read `PROGRESS.md` — it is the hand-off between conversations. Trust it over memory.
3. Read `PLAN.md` for what's next and why.

## Rules that don't change
- **A photographed sign beats a schedule.** `scripts/data/field-signs.json` holds signs seen on the street (photo in `docs/field-signs/`). It outranks permit-area schedules for the kerb it covers, never beyond its `bbox`, and never over a council sign census. Add new photos there rather than editing `parking.json`. **Street View is the weakest tier**: the owner may read the odd sign off Street View for this personal tool; store it with `"method": "streetview"` and `imageryDate`, it fills only still-unknown streets, a photo always beats it, and the app labels it. Sweep an area with `scripts/fetch-streetview-signs.mjs` (queue only — it never writes `parking.json`, and images stay out of the repo). For all-Sydney bulk, Mapillary.
- **Data provenance is the product.** Never default `unknown` → `free`. Every classification traces to a real fetched council/TfNSW response. OSM `parking:lane` is physical, not regulatory. No Parkopedia. A false "permit required" is the worst error for a free-parking finder.
- **Estimates look like estimates.** Anything derived (availability score, crowd report, timer-based departure) is rendered as a confidence band, never as a verified rule. Inferred data must never be dressed up as a user's report.
- **Docs move with code.** Every change that lands updates `PROGRESS.md` (state + dated changelog line). Convention changes update this file. Commit docs in the same commit.
- **Scheduled jobs are silent when nothing changed.** No "re-confirmed, no change" commits, ever. Data jobs run in GitHub Actions, not in a cloud routine (see PROGRESS.md → "Hourly agent").
- Accounts, API keys, App Store, Vercel login: the user does these. Claude gives exact steps and takes the resulting key.
- **The repo is still public on GitHub** while the app is personal. That is a decision the owner has been asked about, not an oversight; until it changes, anything published here (data, photos of signs, location history) is world-readable, so keep personal detail out of commits.

## Verify before claiming done
```bash
npm run typecheck && npm test        # 122 rules cases
npm run web:preview                  # http://localhost:8090 — start in background Bash, then attach the Browser pane by URL
```
Native: **this Mac cannot build the app locally. Do not try again.** Xcode 16.2
is installed at `/Applications/Xcode 2.app` and gets further than the old 15.4
(CocoaPods now succeeds), but the build dies in `ExpoModulesJSI` with:

```
xcodebuild: error: Could not resolve package dependencies:
  package 'apple' is using Swift tools version 6.2.0 but the installed version is 6.0.0
```

**Expo SDK 57 requires Swift 6.2, which ships only with Xcode 26.** This is a
2018 Intel MacBookPro15,1: macOS tops out at Sequoia 15.8, whose newest Xcode is
16.4 (Swift 6.1). So no local build, no local Simulator run, and no free
on-device install are possible here for SDK 57 — the ceiling is a Swift version,
not a setting. **Build in EAS** (`eas build -p ios`, ~4½ min, Xcode 26.6) and
test through TestFlight on a real iPhone. Metro file-watching is unreliable here
— restart the web server after edits.

## Where things are
| | |
|---|---|
| Live web | https://parkfree-sydney.vercel.app (auto-deploys from `main`) |
| Rules engine | `src/lib/rules.ts` · tests `scripts/test-rules.mjs` |
| Find-me-a-park | `src/lib/findPark.ts` |
| Schema | `src/lib/types.ts` |
| Data | `src/data/parking.json` (28 MB, 78k segments) · pipeline `scripts/` · offline overlays `scripts/apply-enrichment.sh` |
| State | `src/state/store.ts` (zustand) |
| Data-source leads | `scripts/DATA-SOURCE-LEADS.md` → "Candidate endpoints" section only |
