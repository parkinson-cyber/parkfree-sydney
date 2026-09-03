/**
 * Time slider — "when will this street be free?"
 *
 * Drag to shift the whole map forward in time, up to 24 hours. Every street
 * re-evaluates against the shifted clock, so a metered kerb visibly turns green
 * the minute its meter hours end. Snaps to 15-minute steps: parking signs never
 * change on a finer grain than that, and coarse steps make the drag feel precise
 * rather than twitchy.
 *
 * Built on PanResponder rather than a slider dependency — it has to work
 * identically on iOS and in the web preview, and it is a bar with a knob.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent, PanResponder, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { colors, font, tracking } from '../theme';
import { useStore } from '../state/store';

/** How far ahead you can look. A full day covers "tonight" and "tomorrow morning". */
export const MAX_OFFSET_MIN = 24 * 60;
/** Signs change on the quarter hour at finest. */
const STEP_MIN = 15;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** "Now", "in 45 min", "in 3 hr", "in 8 hr" — the amount of travel, not the clock. */
function offsetLabel(min: number): string {
  if (min === 0) return 'Now';
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `in ${h} hr`;
  return `in ${h} hr ${m} min`;
}

/** "6:45 pm" / "Thu 7:00 am" — day prefix only once the offset crosses midnight. */
function clockLabel(at: Date, now: Date): string {
  const time = at
    .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s/g, ' ');
  const sameDay = at.toDateString() === now.toDateString();
  if (sameDay) return time;
  const day = at.toLocaleDateString('en-AU', { weekday: 'short' });
  return `${day} ${time}`;
}

export function TimeSlider({ bottom }: { bottom: number }) {
  const now = useStore((s) => s.now);
  const offset = useStore((s) => s.timeOffsetMin);
  const setTimeOffset = useStore((s) => s.setTimeOffset);

  const [trackWidth, setTrackWidth] = useState(0);
  // PanResponder closures are created once, so the live values they need have
  // to come from refs rather than from captured state.
  const widthRef = useRef(0);
  const offsetRef = useRef(0);
  const startRef = useRef(0);
  offsetRef.current = offset;
  widthRef.current = trackWidth;

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const commit = useCallback(
    (raw: number) => {
      const snapped = clamp(Math.round(raw / STEP_MIN) * STEP_MIN, 0, MAX_OFFSET_MIN);
      if (snapped === offsetRef.current) return;
      offsetRef.current = snapped;
      setTimeOffset(snapped);
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    },
    [setTimeOffset],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Claim the gesture before the map does, or a horizontal drag pans the map.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          startRef.current = offsetRef.current;
        },
        onPanResponderMove: (_e, g) => {
          const w = widthRef.current;
          if (w <= 0) return;
          commit(startRef.current + (g.dx / w) * MAX_OFFSET_MIN);
        },
      }),
    [commit],
  );

  const at = offset === 0 ? now : new Date(now.getTime() + offset * 60_000);
  const pct = offset / MAX_OFFSET_MIN;
  const live = offset === 0;

  return (
    <View style={[styles.wrap, { bottom }]}>
      <View style={styles.labelRow}>
        <View style={styles.labelLeft}>
          <View style={[styles.dot, live && styles.dotLive]} />
          <Text style={styles.label} numberOfLines={1}>
            {clockLabel(at, now)}
            <Text style={styles.labelDim}>{`  ${offsetLabel(offset)}`}</Text>
          </Text>
        </View>
        {!live && (
          <Pressable
            onPress={() => setTimeOffset(0)}
            hitSlop={10}
            accessibilityLabel="Back to now"
            style={styles.reset}
          >
            <Text style={styles.resetText}>NOW</Text>
          </Pressable>
        )}
      </View>

      <View
        style={styles.track}
        onLayout={onTrackLayout}
        accessibilityRole="adjustable"
        accessibilityLabel="Preview parking at a later time"
        accessibilityValue={{ text: clockLabel(at, now) }}
        {...pan.panHandlers}
      >
        <View style={styles.trackBase} />
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
        <View style={[styles.knob, { left: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15,17,21,0.86)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 13,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  labelLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textDim },
  dotLive: { backgroundColor: colors.accent },
  label: {
    flexShrink: 1,
    fontFamily: font, color: colors.text, fontSize: 13.5, fontWeight: '700',
    letterSpacing: tracking.body,
  },
  labelDim: { color: colors.textDim, fontWeight: '600' },
  // Tapping "NOW" is the escape hatch from time travel, so it stays the one
  // tinted control in the row.
  reset: {
    backgroundColor: 'rgba(52,211,153,0.16)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  resetText: {
    fontFamily: font, color: colors.accent, fontSize: 10.5, fontWeight: '800',
    letterSpacing: 1,
  },

  // The track is 4pt but the row it sits in is 22pt tall, so the whole strip is
  // draggable — a 4pt hit target would be unusable.
  track: {
    height: 22,
    justifyContent: 'center',
  },
  trackBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  knob: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    backgroundColor: colors.text,
    borderWidth: 3,
    borderColor: colors.accent,
  },
});
