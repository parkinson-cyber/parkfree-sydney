# ParkFree Sydney 🚗💚

Find **free street parking** in Sydney, live. Every street is colour-coded from real
OpenStreetMap parking data, and the app evaluates the rules against the clock — a
metered street literally turns green on the map the minute the meter hours end.

Built with **Expo (React Native + TypeScript)** — ships as a real native iOS app via
EAS Build, with Apple Maps on-device and a MapLibre-powered web preview for development.

## Features

| Feature | Tier |
|---|---|
| Live colour-coded parking map (free / time-limited / paid / residents / no-parking) | Free |
| Street detail sheet — per-side rules, live status, directions | Free |
| Street & suburb search | Free |
| **✨ Free NOW filter** — only streets free at this exact minute | Premium |
| **Free 24/7 filter** | Premium |
| **Parking timer** — countdown pill + "move your car" notification | Premium |
| All-Sydney coverage (Eastern suburbs, Inner West, North Shore) | Premium |

Premium is a yearly subscription or lifetime unlock through Apple in-app purchases
(RevenueCat-ready — see below).

## Project layout

```
scripts/fetch-parking-data.mjs   Data pipeline: Overpass API → classified GeoJSON
src/data/parking.json            Bundled street data (regenerate any time)
src/lib/rules.ts                 "Free NOW" engine — parses & evaluates OSM time rules
src/lib/geo.ts                   Haversine, tap-to-street matching, viewport culling
src/lib/parkingData.ts           Data loading, search index, suburb list
src/lib/notifications.ts         Local notifications for the parking timer
src/state/store.ts               Zustand app state (filters, premium, timer)
src/purchases/index.ts           IAP abstraction: RevenueCat in prod, mock in dev
src/components/ParkingMap.*      Platform-split map (native: Apple Maps, web: MapLibre)
src/components/…                 StreetSheet, FilterBar, SearchBar, Paywall, Timer, Legend
App.tsx                          Composition root
```

## Development

```bash
npm install
npm run web        # browser preview (MapLibre map)
npm run ios        # iOS simulator / Expo Go (needs Xcode or a device)
npm test           # rules-engine test suite (36 cases)
npm run typecheck  # tsc --noEmit
```

> Node ≥ 20.19 is recommended (Expo SDK 57 warns on older versions).

## Refreshing / expanding the street data

```bash
node scripts/fetch-parking-data.mjs                 # inner Sydney only
node scripts/fetch-parking-data.mjs --area all      # + east, inner west, north shore
```

The script queries the Overpass API (with mirror fallback + retries), merges the
explicitly-tagged parking streets with the base residential network, classifies every
segment, and writes `src/data/parking.json`. Data is © OpenStreetMap contributors
(ODbL) — attribution is displayed in the app's legend.

Run it before each release so the bundled data stays fresh. Coverage grows as the
OSM community maps more parking lanes — re-running is free.

## Shipping to the App Store

You don't need Xcode locally — EAS builds in the cloud.

1. **Accounts**: an [Apple Developer Program](https://developer.apple.com/programs/)
   membership (A$149/yr) and a free [Expo account](https://expo.dev).
2. **Wire up real purchases** (before release):
   ```bash
   npx expo install react-native-purchases
   ```
   - Create products in App Store Connect: `parkfree_premium_yearly` (auto-renewing),
     `parkfree_premium_lifetime` (non-consumable).
   - Create a free [RevenueCat](https://www.revenuecat.com) project, attach both
     products to an entitlement named **`premium`**.
   - Paste your RevenueCat *public Apple API key* into `REVENUECAT_APPLE_KEY` in
     [src/purchases/index.ts](src/purchases/index.ts). The runtime auto-switches from
     the dev mock to real StoreKit purchases.
3. **App icon**: a generated icon ships in `assets/icon.png` (rebuild it with
   `swiftc scripts/make-icon.swift -o /tmp/mi && /tmp/mi assets/icon.png && sips -z 1024 1024 assets/icon.png`);
   replace it with brand artwork whenever you have some.
4. **Build & submit**:
   ```bash
   npm install -g eas-cli
   eas login
   eas build:configure          # creates eas.json, registers the bundle id
   eas build --platform ios     # cloud build → .ipa
   eas submit --platform ios    # upload to App Store Connect
   ```
5. In App Store Connect: screenshots, description, privacy labels
   (Location — "used to show parking near you", not linked to identity), then submit
   for review.

`app.json` already carries the bundle id (`com.parkfree.sydney`), location permission
strings, notification config and the export-compliance flag.

### Pre-release checklist

- [ ] `npm run fetch-data` (refreshes all-Sydney street data)
- [ ] `npm test` and `npm run typecheck` pass
- [ ] RevenueCat key set + sandbox purchase tested on TestFlight
- [ ] Bump `version` / `buildNumber` in app.json

## Disclaimer

Parking data is community-sourced and may be incomplete or out of date. The app tells
users to always check street signs; keep that wording — it matters for App Review and
for liability.
