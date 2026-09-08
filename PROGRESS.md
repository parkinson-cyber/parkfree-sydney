# Progress

The hand-off between conversations. Update the **State** block and add a **Changelog** line with every change that lands.

## State (2026-09-08)

- **Live:** https://parkfree-sydney.vercel.app · repo `parkinson-cyber/parkfree-sydney` · `main` @ `e6f0e18` (+ this docs commit)
- **Build health:** `npm run typecheck` clean · `npm test` 122/122
- **Data:** 78,346 segments, ~16% classified (12,606). 16 councils enriched. Largest gaps: Hills, Sutherland, Bankstown, Parramatta/west, Northern Beaches, south — see `scripts/DATA-SOURCE-LEADS.md` → *Candidate endpoints*.
- **Tier:** everything free (paywall removed 2026-08-12, code dormant).
- **Unmerged branches on origin:**
  - `claude/ios-app-documentation-cscddp` (2026-09-03) — time-travel slider (`TimeSlider.tsx`), meter-coverage audit, docs. +767 lines. **Review and merge next** — it's the newest real work.
  - `claude/north-sydney-meter-scope-t850mc` (2026-07-30) — touches the old Vite `src/App.jsx`; superseded, close it.
- **Hourly agent:** the claude.ai/code routine that ran hourly Aug 24–27 was egress-blocked (GitHub-only allowlist) and produced 80 "no data change" commits. It has been quiet since Aug 27 but only the user can confirm it's paused/deleted at claude.ai/code → routines. Replacement lives in PLAN.md → M4 (GitHub Actions, open egress).
- **Local layout:** everything is under `/Users/abc/Documents/macos/parkfree/` — `repo/` (this), `docs/`, `archive/` (five old clones + SwiftUI scaffold; `archive/clone-aug12-with-ios-xcodeproj/{ios,eas.json}` is the only part worth harvesting). Consolidated 2026-09-08.
- **Draft to port in:** a dependency-free Vercel crowd-report backend (Upstash Redis GEO, rate-limit, Sydney bbox, hourly ingest endpoint, GH Actions hourly workflow) was built 2026-09-08 in `archive/swiftui-scaffold-with-vercel-server-draft/server/` against a throwaway SwiftUI scaffold before this repo was rediscovered. Logic is tested; it belongs here under `api/` — see PLAN.md → M2.
- **Open-source hygiene gaps:** `LICENSE` is Expo's template (copyright "650 Industries") — needs the project's own MIT text; no `CONTRIBUTING.md`, no CI, no issue templates, repo description is a typo ("finding free parking spot inparkfree-sydney"), no topics.
- **Accounts pending (user):** TfNSW Open Data Hub API key (only needed for the live *commuter car park* feed; every other source used so far needs no account). Apple Developer + Expo/EAS for the App Store build.

## Changelog

- **2026-09-08** — Consolidated six local clones under `Documents/macos/parkfree/` (repo/docs/archive); identified this repo as canonical. Started corridor data gathering (eastern suburbs → Chatswood): Willoughby 61% / Mosman 80% / Lane Cove 68% / North Sydney 35% / Eastern 30% unknown. Added `CLAUDE.md`, `PROGRESS.md`, `PLAN.md`. Verified typecheck + 122 tests on `main`. Saved cross-session memory (project, workspace layout, agent history, env quirks). No app code changed.
- **2026-08-27** — Last of 80 automated "egress blocker" commits (Aug 24–27). No data change.
- **2026-08-16** — Woollahra authoritative per-property zone data; fixed Waverley bbox bleed-over; restored `metadata.enriched` history.
- **2026-08-15** — 30 km disc coverage, Northern Beaches base network, Randwick all-31-area GIS, Bondi/Waverley sign completion, Waze-style map controls, minimal street sheet.
- **2026-08-14** — App made fully free; web build shipped as installable PWA; fixed blank map (`#root` flex).
- **2026-07-24 → 08-12** — Council resident-permit expansion across 12 LGAs; spatial-coherence guard against false permit tags; Expo native build scripts.
- **2026-07-15 → 07-19** — Rules engine, Find-me-a-park, countdown-to-free, CBD/Waverley/Willoughby/North Sydney enrichment.
