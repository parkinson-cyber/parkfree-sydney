# The time slider

Borrowed from the Hong Kong stormwater map (香港雨水排放系統), which puts a
rainfall-intensity slider under a dark map and re-renders the whole network at
each setting. The same move works for parking, and it fits what the app already
had: the rules engine was already a pure function of `(street, time)` — nothing
was reading the wall clock except the store.

## What it does

A slider above the primary action, spanning **now → +24 h in 15-minute steps**.
Drag it and the entire map re-evaluates at that later moment: metered kerbs turn
green as their fee hours end, clearways go red as they start, resident-permit
streets open up in the evening.

Everything follows the shifted clock, so nothing on screen can disagree with
anything else:

- street colours on the map
- the `N free nearby` counter in the header (`now` → `then`)
- the street sheet, including its "Free from 6pm · in 2 hr" line
- the primary button, which becomes **Find a park for then**

Tap **NOW** to snap back to live. The dot beside the clock label is green when
live and grey when time-travelling, so the state is never ambiguous.

## Why it earns its place

"Is this spot free right now" is the question the app already answered. "Will it
still be free when I get there" is the question drivers actually ask, and it was
unanswerable — you had to read the fee interval out of the sheet and do the
arithmetic yourself. This is the single feature that makes the underlying rules
data visible.

## How it is wired

```
src/state/store.ts       timeOffsetMin + setTimeOffset, and useViewNow()
src/components/TimeSlider.tsx   the control
App.tsx                  statusById / freeNow / find-park evaluate at viewNow
src/components/StreetSheet.tsx  evaluates at viewNow
```

`useViewNow()` is the whole mechanism:

```ts
export function useViewNow(): Date {
  const now = useStore((s) => s.now);
  const offset = useStore((s) => s.timeOffsetMin);
  return offset === 0 ? now : new Date(now.getTime() + offset * 60_000);
}
```

`now` still ticks every 30 s, so a time-travelled view stays correctly anchored as
real time advances rather than drifting.

## Implementation notes

- **No new dependency.** React Native has no built-in slider and
  `@react-native-community/slider` would mean a native rebuild, so the control is
  a `View` + `PanResponder`. It behaves identically on iOS and in the web preview.
- **`onPanResponderTerminationRequest: () => false`** — without it the map steals
  a horizontal drag halfway through and the map pans instead of the slider moving.
- **Refs, not state, inside the gesture.** `PanResponder.create` closes over its
  handlers once; reading `offset` from state there would capture a stale value.
- **15-minute snapping.** Parking signs never change on a finer grain, and coarse
  steps make the drag feel deliberate instead of twitchy. Selection haptics fire
  on each step (native only).
- **4pt track, 22pt row.** The visible line is thin; the draggable area is the
  full row, or it would be unusable on a phone.
- The slider hides while a street sheet is open — the sheet carries its own
  "free from" line, and two time affordances at once is one too many.

## Not done yet

- Only forward in time. Backwards ("was it free when I got the ticket?") is a
  different feature and probably a different screen.
- No day-of-week jump. Reaching Saturday morning from a Thursday afternoon needs
  the full 24 h drag and then some — a 7-day range with day ticks would be the
  natural next step.
- The slider does not yet appear in the welcome overlay's feature tour.
