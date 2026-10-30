# Launching on iOS — the five-day path

Written 2026-10-30, for the owner. Companion to `app-store-listing.md`, which
has the copy to paste; this is the order of operations and what blocks what.

**Not legal advice.** The IP section is general information. One conversation
with an Australian patent/trade-mark attorney would cost a few hundred dollars
and settle it properly.

---

## First: the patent is not a prerequisite, and chasing it will cost you the launch

Apple never asks whether you hold a patent. Nothing in the submission flow
mentions one. So the sequencing in "patent first, then launch" is not required
by anything — and if you wait for a patent you will not launch this year.

Three reasons it is the wrong tool here:

**1. There is no fast patent in Australia any more.** The innovation patent —
the quick one, granted in months — was abolished; the last applications were
accepted on 25 August 2021. What remains is the standard patent, which takes
years from filing to grant. The only thing you can file in five days is a
**provisional application** (~A$110 at IP Australia, plus attorney drafting
that realistically runs A$3,000–6,000). A provisional is not a granted right.
It reserves a priority date for twelve months and you cannot enforce it
against anyone.

**2. Software like this is very hard to patent in Australia.** Since
*Encompass Corporation v InfoTrack* (2019) and *Commissioner of Patents v
Aristocrat* (High Court, 2022, which split 3–3 and so left the decision
against patentability standing), a "mere scheme or business method implemented
on a computer" is not patentable subject matter. ParkFree applies published
rules to published government data. That is squarely the shape of claim the
courts have been refusing. The Opal-derived demand model is the most inventive
thing in here and even that is an application of ordinary statistics to an open
dataset.

**3. The disclosure has already happened.** The repo is public on GitHub and
the app is live at parkfree-sydney.vercel.app. Australia has a twelve-month
grace period for the applicant's own disclosure (s 24(1)(a) Patents Act 1990,
reg 2.2C), so an Australian filing is still possible. **Most of the world has
no such grace period** — Europe and China among them — so novelty outside
Australia is likely already gone. If international protection ever mattered,
that decision needed making before the repo went public.

### What is worth doing instead, and fits in an afternoon

| | what it protects | cost | time |
|---|---|---|---|
| **Trade mark** on "ParkFree" / "ParkFree Sydney" | the name, so nobody else ships a parking app under it | ~A$250/class online via IP Australia's picklist; TM Headstart ~A$200 + A$150/class for a pre-assessment | filed same day; examination a few months |
| **Copyright** in the code and the written data pipeline | automatic in Australia, no registration, no fee | A$0 | already yours |

Two cautions on the trade mark. "ParkFree" is close to descriptive — marks that
simply describe the service are harder to register, and IP Australia may object
under s 41. And search the register first (search.ipaustralia.gov.au) plus the
App Store, because a name clash found after launch is worse than one found now.
TM Headstart exists precisely to tell you which way that will go before you pay
the full fee.

**Recommendation:** file the trade mark if the name matters to you, skip the
patent, launch. If you still want the patent conversation, have it *after*
submission — the twelve-month Australian grace period gives you until roughly
September 2027 from when the repo went public.

---

## Day 1 — enrol. This is the critical path; start it before anything else.

Go to **developer.apple.com/programs/enroll**.

**Choose Individual / Sole Trader, not Organisation.** This is the single
decision that decides whether five days is possible. An Organisation enrolment
requires a D-U-N-S number, which in Australia takes days to weeks to issue —
that alone blows the deadline. The trade-off is that the App Store seller name
becomes your personal legal name rather than a company name.

What you need in hand:
- An Apple ID with **two-factor authentication already enabled** (it will not
  proceed without it)
- A government photo ID — driver's licence or passport
- A payment card

**Cost: US$99 per year**, which Apple bills in local currency — budget around
A$150 and check the figure at checkout rather than trusting a number from a
blog post.

**Enrol from the Apple Developer app on an iPhone or iPad if you have one.**
Identity verification there can scan the ID directly and often clears faster
than the web flow.

**The name trap, in Apple's own words:** *"Make sure to use your legal name in
the first and last name fields of your Apple Account. Using an alias, nickname,
or company name"* will stall the enrolment. So before you start, open your
Apple Account settings and check the first/last name fields match your driver's
licence or passport exactly. This is the single most common cause of a
multi-day hold, and it is entirely avoidable in about ninety seconds.

**One piece of good news:** ParkFree is free, so you only accept the **Free
Apps agreement**, which is instant. You do not need to complete the Paid Apps
agreement, which is where the banking details, tax forms and W-8BEN-E live and
where people lose a week.

## Day 1–2 — while enrolment is pending, close the asset gap

Everything else is already done and checked:

- ✅ Icon — paper ground, no alpha channel (App Store Connect rejects alpha)
- ✅ Bundle ID `com.parkfree.sydney`, version 1.0.0
- ✅ Privacy policy and support URLs both live and returning 200
- ✅ `usesNonExemptEncryption: false` already set, so export compliance is one
  checkbox
- ✅ Listing copy written out in `app-store-listing.md`
- ✅ EAS project registered as `@chrislee123400/parkfree-sydney`

- ❌ **Screenshots.** This is the only thing missing. `scripts/store-screenshots.sh`
  drives the iOS Simulator, and **this Mac cannot run the Simulator for SDK 57**
  (it needs Swift 6.2, which ships only with Xcode 26, which cannot install on
  a 2018 Intel MacBook Pro). Two ways round it:
  1. **Capture from the web build at 3× device scale.** The web and native UIs
     are the same React Native code, so a 393×852 viewport at
     `deviceScaleFactor: 3` gives exactly 1179×2556. No Simulator needed.
  2. **Shoot on your own iPhone** once enrolment completes and TestFlight has
     the build. Slower, but unambiguously real device screenshots.

### Get the size right — the script in this repo targets the wrong one

Checked against Apple's screenshot specification on 2026-10-30:

> **Required device sizes.** To submit your app, you must provide screenshots
> for the following required display sizes: iPhone: **at least one screenshot
> for iPhone with Dynamic Island (medium display)**. iPad (if your app supports
> iPadOS): at least one screenshot for iPad 13-inch display.

"Medium display" is the iPhone 15/16/17 Pro class, and it takes
**1179 × 2556** or **1206 × 2622** portrait.

`scripts/store-screenshots.sh` and `app-store-listing.md` both target
**1320 × 2868**, which is the *large* display (Pro Max). That size is accepted,
but it is not the slot Apple requires, so uploading only those can leave the
required slot empty and block submission. Shoot **1179 × 2556** first.

`app.json` sets `supportsTablet: false`, so **no iPad screenshots are needed**
at all.

You need at least one; three to five is normal.

## Day 2–3 — build and upload

This Mac cannot build iOS locally. Everything goes through EAS cloud build,
which takes about five minutes.

```bash
eas build -p ios --profile production
```

```bash
eas submit -p ios --latest
```

The build must come *after* enrolment is active — EAS creates the signing
certificate and provisioning profile against your developer account, and
cannot do that until it exists.

Once it is uploaded, install it on your own phone through **TestFlight** and
actually drive somewhere with it before submitting. A rejection costs a day; a
bug found by a reviewer costs more.

## Day 3 — the App Store Connect listing

Create the app record, then paste from `app-store-listing.md`. The fields that
need thought rather than pasting:

- **App Privacy questionnaire.** Location: collected, used for App
  Functionality, **not linked to identity, not used for tracking**. The crowd
  reports use an anonymous device id and no account. Getting "not used for
  tracking" right matters — claiming tracking would trigger the App Tracking
  Transparency prompt requirement.
- **Age rating:** 4+.
- **Screenshots:** at least one at 1179 × 2556 (see above). No iPad set.
- **Export compliance:** no, uses only exempt encryption (already declared in
  `app.json`).

### Put this in the review notes — it pre-empts the two likely rejections

> **Data sources and licensing.** Street geometry is © OpenStreetMap
> contributors (ODbL). Parking rules are derived from published NSW council and
> Transport for NSW open data under CC BY 4.0, attributed in-app under the map
> legend. No third-party commercial parking data is used.
>
> **User-generated content.** The "report a spot" feature submits one of four
> fixed values (free / left / looks full / looks empty) tied to a location.
> There is no free text, no images, no usernames and no profiles, so no
> user-submitted content can be objectionable. Reports expire automatically
> after 15–30 minutes.
>
> **Accuracy.** The app states throughout that parking signs are authoritative
> and that availability figures are estimates, not measurements.

That second paragraph is the important one. Guideline 1.2 requires apps with
user-generated content to have content filtering, reporting and user blocking —
reviewers apply it mechanically when they see any "report" feature, and
explaining upfront that the content is four enum values is what stops a
rejection you would otherwise spend a day arguing out of.

## Day 3–5 — review

Median review time is now around 24 hours, and roughly 90% clear within 48.
That leaves enough room for exactly **one** rejection and resubmit, and no
more.

---

## Honest assessment of the five days

Achievable, with zero slack. Two things can take it from you:

1. **Enrolment identity verification running past 48 hours.** Entirely outside
   your control. Mitigate by enrolling today, from the iPhone app, with the
   name on your ID matching your Apple ID exactly.
2. **A rejection that needs more than a one-line fix.** Mitigated by the review
   notes above.

If day 3 arrives and enrolment has not cleared, the launch date is gone and no
amount of effort recovers it — so treat enrolment as the only thing that
matters today and leave the screenshots for the waiting period.

Worth remembering that the PWA at parkfree-sydney.vercel.app already works on
an iPhone home screen today, with no Apple account and no review. If the point
of the deadline is *having something to show*, that part is already done.
