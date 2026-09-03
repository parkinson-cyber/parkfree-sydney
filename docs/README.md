# ParkFree Sydney — docs

| Doc | What it covers |
|---|---|
| [UNBLOCK-NETWORK.md](UNBLOCK-NETWORK.md) | Why every data refresh since 16 Aug did nothing, and the exact allowlist that fixes it |
| [METER-DATA-COVERAGE.md](METER-DATA-COVERAGE.md) | Meter price/hours coverage per council, the gaps, and what to fetch to close them |
| [UI-TIME-SLIDER.md](UI-TIME-SLIDER.md) | The time-travel slider: what it does and how it is wired |

Also useful:

- [`../README.md`](../README.md) — project overview, dev setup, App Store release steps
- [`../scripts/DATA-SOURCE-LEADS.md`](../scripts/DATA-SOURCE-LEADS.md) — researched
  candidate endpoints per council, plus the blocked-run log

## The short version

**The app is healthy. The data is stale.**

`npm run typecheck` and `npm test` (122 cases) both pass. `src/data/parking.json`
holds 78,346 street segments generated **2026-08-16** and has not moved since,
because the sessions that refresh it cannot reach the internet. Fixing that is an
environment setting, not a code change — see UNBLOCK-NETWORK.md.

## Repo shape (worth knowing before you edit)

The repo contains **two applications**. Only the first ships:

| | Ships? | Entry point | Files |
|---|---|---|---|
| **Expo / React Native iOS app** | ✅ yes | `index.ts` → `App.tsx` | `src/components/*.tsx`, `src/lib/*.ts`, `src/state/`, `src/data/parking.json` |
| Vite + React + Leaflet web app | ❌ dead | `index.html` → `src/main.jsx` | `src/App.jsx`, `src/components/*.jsx`, `vite.config.js` |

The Vite app is an earlier prototype that arrived on the orphan branch
`claude/north-sydney-meter-scope-t850mc` (it shares no history with `main`). It
has ~30 streets hard-coded inline instead of using `parking.json`, and it
duplicates component names in `.jsx` alongside the real `.tsx` ones. `vercel.json`
builds the Expo app (`expo export -p web`), so the Vite files are inert — but they
are a trap for anyone grepping the codebase. **Deleting them is a pending
decision, not something already done.**
