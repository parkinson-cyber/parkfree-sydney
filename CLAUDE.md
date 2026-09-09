# ParkFree Sydney — read this first

@AGENTS.md

## Start of every session
1. `git fetch origin && git status -sb` — work on `main` in **this** clone (`/Users/abc/Documents/macos/parkfree/repo`). Everything else ParkFree lives under `/Users/abc/Documents/macos/parkfree/` (`docs/`, `archive/`); see its README.
2. Read `PROGRESS.md` — it is the hand-off between conversations. Trust it over memory.
3. Read `PLAN.md` for what's next and why.

## Rules that don't change
- **A photographed sign beats a schedule.** `scripts/data/field-signs.json` holds signs seen on the street (photo in `docs/field-signs/`). It outranks permit-area schedules for the kerb it covers, never beyond its `bbox`, and never over a council sign census. Add new photos there rather than editing `parking.json`.
- **Data provenance is the product.** Never default `unknown` → `free`. Every classification traces to a real fetched council/TfNSW response. OSM `parking:lane` is physical, not regulatory. No Parkopedia. A false "permit required" is the worst error for a free-parking finder.
- **Estimates look like estimates.** Anything derived (availability score, crowd report, timer-based departure) is rendered as a confidence band, never as a verified rule. Inferred data must never be dressed up as a user's report.
- **Docs move with code.** Every change that lands updates `PROGRESS.md` (state + dated changelog line). Convention changes update this file. Commit docs in the same commit.
- **Scheduled jobs are silent when nothing changed.** No "re-confirmed, no change" commits, ever. Data jobs run in GitHub Actions, not in a cloud routine (see PROGRESS.md → "Hourly agent").
- Accounts, API keys, App Store, Vercel login: the user does these. Claude gives exact steps and takes the resulting key.

## Verify before claiming done
```bash
npm run typecheck && npm test        # 122 rules cases
npm run web:preview                  # http://localhost:8090 — start in background Bash, then attach the Browser pane by URL
```
Native: `npm run ios` (Xcode 15.4 is installed). Metro file-watching is unreliable here — restart the server after edits.

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
