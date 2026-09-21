# App Store submission — copy and answers

Everything App Store Connect will ask for, written out so it can be pasted
rather than composed at 11pm. Character limits in brackets are Apple's.

## App information

| field | value |
|---|---|
| **Name** [30] | `ParkFree Sydney` |
| **Subtitle** [30] | `Free street parking, live` |
| **Bundle ID** | `com.parkfree.sydney` |
| **Primary category** | Navigation |
| **Secondary category** | Travel |
| **Age rating** | 4+ |
| **Copyright** | `2026 ParkFree Sydney` |
| **Support URL** | `https://parkfree-sydney.vercel.app/support.html` |
| **Marketing URL** | `https://parkfree-sydney.vercel.app` |
| **Privacy Policy URL** | `https://parkfree-sydney.vercel.app/privacy.html` |

## Promotional text [170]

```
Streets turn green the moment they're free. Built from real council and NSW
Government parking data — and honest about the streets nobody publishes.
```

## Description [4000]

```
ParkFree shows you where you can legally park in Sydney, right now.

Streets are colour-coded from published parking-sign data and re-evaluated
against the clock, so a metered street turns green the minute the meter hours
end. The map always shows this exact moment — not a generic weekday.

WHAT THE COLOURS MEAN
• Green — free right now
• Lime — free, but with a time limit (2P, 4P)
• Ochre — a meter or ticket applies now
• Indigo — residents' permit parking
• Terracotta — clearway, no stopping, no parking
• Grey — no confirmed rules published for this kerb

TAP ANY STREET
See the rule for each side of the road, what time it changes, how long you can
stay, and get walking or driving directions. Set a timer when you park and the
app reminds you before you overstay.

SAVE YOUR SPOT
Tap "Park here" and ParkFree remembers where you left the car, then walks you
back to it. Stored on your phone only, and cleared after a day.

CAR PARKS TOO
Live occupancy for commuter car parks from Transport for NSW, updated hourly,
plus council car parks with their free periods quoted from each council — "3
hours free in Crows Nest" — and over 1,600 free off-street car parks.

HONEST ABOUT WHAT IT DOESN'T KNOW
Most Sydney councils don't publish their parking signs. Where there's no
published rule, the street stays grey instead of being guessed at — because a
wrong "free" is how you get a fine. Where the app estimates how busy a street
is, it shows the confidence and the evidence behind it, never a bare number
dressed up as fact.

NO ACCOUNT, NO ADS, NO TRACKING
Nothing to sign up for. Your location never leaves your phone unless you tap
the report button. No advertising, no analytics, no third-party trackers.

OPEN SOURCE
Every data pipeline is public, so you can check exactly where any rule came
from: github.com/parkinson-cyber/parkfree-sydney

Always check the sign on the kerb. Signs change, roadworks happen, and data has
gaps. The sign wins, every time.
```

## Keywords [100]

```
parking,free parking,street parking,sydney,kerbside,meter,clearway,parking timer,no stopping,2P
```

## What's New in This Version (1.0.0)

```
First release.
```

## App privacy — the exact answers

Apple asks, per data type, three things: do you **collect** it (does it leave
the device), is it **linked to the user's identity**, and is it used to **track**
them across other companies' apps. The answers:

| data type | collected? | linked to identity? | tracking? | purpose |
|---|---|---|---|---|
| **Precise Location** | **Yes** | No | No | App Functionality |
| **Device ID** (install-generated) | **Yes** | No | No | App Functionality |
| Everything else Apple lists | No | — | — | — |

Notes for the questionnaire, so the answers are defensible:

- **Precise Location is "collected" only because of crowd reports.** Viewing the
  map does not transmit your position anywhere. When you tap report, the app
  sends the *report's* location, snapped to the nearest street. Say Yes — Apple
  counts any transmission off device — with purpose **App Functionality**.
- **Device ID**: a random value generated at install, used solely to rate-limit
  reports (30 per device per hour). Not the IDFA, not linked to an account
  (there are no accounts). Purpose **App Functionality**; some reviewers expect
  this filed under Fraud Prevention, which is also true — App Functionality is
  the safer, broader answer.
- **Advertising identifier (IDFA): No.** The app has no ads and no ad SDK.
- **Tracking: No** to everything. There is no third-party SDK in the build.
- **Data deletion**: no account exists, so "account deletion" doesn't apply.
  Reports expire on their own in 15–30 minutes.

## Export compliance

`app.json` already sets `ios.config.usesNonExemptEncryption: false`. The app uses
only standard HTTPS, which is exempt. Answer **No** to "does your app use
encryption beyond exempt standard encryption".

## Screenshots

Apple requires **6.7-inch iPhone** screenshots: 1290 × 2796 px, between 3 and 10.
Take them from the iOS Simulator on an iPhone 15/16 Pro Max once the build runs.
Suggested five, in this order:

1. **The map, Sydney CBD, mid-morning** — colours doing their thing, tab bar visible.
2. **A street sheet open** — rule for each side, time limit, "Park here".
3. **The busy estimate** — confidence pill and evidence list (shows the honesty).
4. **Saved spot / timer running.**
5. **Settings** — the legend and the real coverage numbers.

## Review notes (paste into "Notes for Reviewer")

```
ParkFree shows published parking restrictions for Sydney streets, colour-coded
against the current time. No account is required and nothing is paywalled.

Location permission: used while in use only, to centre the map and — if the
user taps the report button — to snap a crowd report to the nearest street.
The app works with the permission declined.

Parking data comes from published NSW Government and council open data,
credited in the public repository. Streets with no published rule are shown
grey and explicitly labelled as having no confirmed rules; the app does not
claim they are free.

The app is open source: github.com/parkinson-cyber/parkfree-sydney
```
