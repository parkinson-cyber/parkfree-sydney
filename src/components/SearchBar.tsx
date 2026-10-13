/**
 * Search: a pill at the bottom, and a full screen once you tap it.
 *
 * WHY IT WORKS THIS WAY NOW
 * The bar used to stay where it was and try to ride above the keyboard, with
 * the results opening upward into the map. On a phone that is a losing game.
 * The visible area left over is a couple of hundred points, the measured
 * keyboard inset lags Safari's own animation by a frame or two, and in the
 * standalone PWA — where Safari shifts the *visual* viewport instead of
 * scrolling the document — the bar ended up behind the keyboard altogether.
 * The owner's words: the search bar "would be gone and disappeared".
 *
 * So the fix is structural rather than arithmetic. Focusing search opens a
 * sheet that owns the whole screen with the field pinned at the **top**, which
 * is the one place a keyboard can never reach. Nothing has to be measured for
 * the field to stay visible; the inset is now only used to keep the last
 * result row clear of the keys. This is also what Maps, Citymapper and
 * Transit all do, so it is what a thumb expects.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { search, streetById, streetsInSuburb, type SearchResult } from '../lib/parkingData';
import { evaluateStreet } from '../lib/rules';
import { SUBURBS } from '../lib/suburbs';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import { colors, font, radius, shadow, statusColors, tracking } from '../theme';
import { useStore } from '../state/store';
import type { LiveStatus } from '../lib/types';

/* ── the resting state: one slim bar, as before ─────────────────────────── */

export function SearchBar({
  onOpen, freeCount, freeNearby,
}: {
  onOpen: () => void;
  /** Live count, shown inside the bar so it costs no extra height. */
  freeCount?: number;
  freeNearby?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable style={styles.bar} onPress={onOpen} accessibilityLabel="Search streets and suburbs">
        <Ionicons name="search" size={17} color={colors.textDim} style={styles.mark} />
        <Text style={styles.placeholder} numberOfLines={1}>Search street or suburb</Text>
        {freeCount != null && (
          // The count lives in the bar rather than on its own row: it was
          // costing a whole band of screen to say one number.
          <Text style={styles.count} numberOfLines={1}>
            {freeCount} free{freeNearby ? ' here' : ''}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

/* ── the open state: the whole screen, field at the top ─────────────────── */

export function SearchPanel({
  onGo, onClose,
}: {
  onGo: (r: SearchResult) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const [query, setQuery] = useState('');
  const select = useStore((s) => s.select);
  const region = useStore((s) => s.region);
  const now = useStore((s) => s.now);
  const inputRef = useRef<TextInput>(null);

  // Autofocus through the ref rather than the prop: on iOS the `autoFocus`
  // prop races the sheet's own mount and sometimes opens the keyboard without
  // ever giving the field the caret.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // search() declines anything under two characters, so the first keystroke
  // returns [] without ever having looked. Track that separately: showing
  // "Nothing matches 'a'" on the way to "alfred" is both wrong and a dead end.
  const tooShort = query.trim().length < 2;
  const results = useMemo(() => (tooShort ? [] : search(query)), [query, tooShort]);

  /** With nothing typed, offer the suburbs around where the map is looking. */
  const nearby = useMemo(() => {
    if (query.trim().length >= 2) return [];
    return [...SUBURBS]
      .filter((s) => s.classified > 0)
      .map((s) => ({
        s,
        d: Math.abs(s.latitude - region.latitude) + Math.abs(s.longitude - region.longitude),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)
      .map(({ s }) => s);
  }, [query, region.latitude, region.longitude]);

  const pick = (r: SearchResult) => {
    Keyboard.dismiss();
    onGo(r);
    if (r.streetId) {
      const f = streetById(r.streetId);
      if (f) select(f);
    }
    onClose();
  };

  const suburbs = results.filter((r) => r.kind === 'suburb');
  const streets = results.filter((r) => r.kind === 'street');

  return (
    <View style={[styles.panel, { paddingTop: insets.top }]}>
      <View style={styles.field}>
        <Pressable onPress={onClose} hitSlop={12} style={styles.back} accessibilityLabel="Close search">
          <Ionicons name="arrow-back" size={21} color={colors.text} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Street or suburb"
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={() => results[0] && pick(results[0])}
          // Esc closes on a desktop browser, where there is no back gesture.
          onKeyPress={(e) => {
            if (Platform.OS === 'web' && (e.nativeEvent as { key?: string }).key === 'Escape') onClose();
          }}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={12} style={styles.clear}>
            <Ionicons name="close-circle" size={18} color={colors.textDim} />
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // The field is safe at the top, so the inset is only needed down here,
        // to keep the last row from sitting under the keys.
        contentContainerStyle={{ paddingBottom: keyboard + insets.bottom + 24 }}
      >
        {query.length === 0 || tooShort ? (
          <>
            <Section title="Suburbs near you" />
            {nearby.map((s) => (
              <Row
                key={s.name}
                label={s.name}
                sub={`${s.postcode ?? ''}${s.postcode ? ' · ' : ''}${s.classified.toLocaleString()} streets with rules`}
                icon="map-outline"
                onPress={() => pick({
                  kind: 'suburb',
                  label: s.name,
                  sub: '',
                  latitude: s.latitude,
                  longitude: s.longitude,
                  bbox: s.bbox,
                  suburb: s.name,
                })}
              />
            ))}
            <Text style={styles.hint}>
              Try a suburb (“Chatswood”), a postcode (“2067”), or a street with its
              suburb (“Alfred Street, Milsons Point”).
            </Text>
          </>
        ) : results.length === 0 ? (
          <Text style={styles.hint}>
            Nothing matches “{query}”. Street names need their full word — “Alfred”, not “Alf”.
          </Text>
        ) : (
          <>
            {suburbs.length > 0 && <Section title="Suburbs" />}
            {suburbs.map((r) => (
              <Row
                key={`s-${r.label}`}
                label={r.label}
                sub={r.sub.replace(/^Suburb · /, '')}
                icon="map-outline"
                onPress={() => pick(r)}
                right={<FreeNow suburb={r.label} now={now} />}
              />
            ))}
            {streets.length > 0 && <Section title="Streets" />}
            {streets.map((r) => (
              <Row
                key={`t-${r.streetId}`}
                label={r.label}
                sub={r.sub}
                dot={statusOf(r.streetId, now)}
                onPress={() => pick(r)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function statusOf(id: number | undefined, now: Date): LiveStatus | undefined {
  if (id == null) return undefined;
  const f = streetById(id);
  if (!f) return undefined;
  return evaluateStreet(f.properties, now).status;
}

/**
 * How many free streets a suburb has — cached across keystrokes.
 *
 * Counting means evaluating every street's rules, and rules.ts caches nothing:
 * Sydney's 565 streets measured 5.3 ms, so four suburb rows cost ~21 ms on a
 * desktop and several times that on a phone. A `useMemo` inside the row does
 * not help, because every keystroke builds new rows and remounts them. The
 * answer only changes when the clock does, so key the cache on the minute.
 */
const freeCountCache = new Map<string, number>();

function freeInSuburb(suburb: string, now: Date): number {
  const key = `${suburb}|${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
    + `-${now.getHours()}-${now.getMinutes()}`;
  const hit = freeCountCache.get(key);
  if (hit !== undefined) return hit;

  let free = 0;
  for (const f of streetsInSuburb(suburb)) {
    if (f.properties.cat === 'unknown') continue;
    const s = evaluateStreet(f.properties, now).status;
    if (s === 'free' || s === 'free_limited') free++;
  }
  // One entry per suburb per minute; a search session touches a handful, and
  // the map is cleared rather than left to grow across an evening of use.
  if (freeCountCache.size > 200) freeCountCache.clear();
  freeCountCache.set(key, free);
  return free;
}

/** "14 free now" beside a suburb — the reason you'd pick one over another. */
function FreeNow({ suburb, now }: { suburb: string; now: Date }) {
  const n = useMemo(() => freeInSuburb(suburb, now), [suburb, now]);
  if (n === 0) return null;
  return <Text style={styles.freeNow}>{n} free now</Text>;
}

function Section({ title }: { title: string }) {
  return <Text style={styles.section}>{title.toUpperCase()}</Text>;
}

function Row({
  label, sub, icon, dot, right, onPress,
}: {
  label: string;
  sub: string;
  icon?: keyof typeof Ionicons.glyphMap;
  dot?: LiveStatus;
  right?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowMark}>
        {icon ? (
          <Ionicons name={icon} size={17} color={colors.textDim} />
        ) : (
          <View style={[styles.dot, { backgroundColor: dot ? statusColors[dot] : colors.border }]} />
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
        {!!sub && <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12 },
  // One slim mustard bar carrying the mark, the field and the live count.
  // It replaced a brand row, a count pill and a taller search box stacked on
  // top of each other, which between them ate a quarter of the screen.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.glassStrong,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    height: 46,
    // A hairline of paper-white along the rim: what separates glass that looks
    // like a real material from a rectangle with a blur behind it.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassRim,
    ...shadow(0.13, 18, 5),
  },
  mark: { marginRight: 9 },
  placeholder: {
    flex: 1, fontFamily: font, color: colors.textDim, fontSize: 15,
    fontWeight: '500', letterSpacing: tracking.body,
  },
  count: {
    fontFamily: font, color: colors.accent, fontSize: 12, fontWeight: '700',
    letterSpacing: tracking.caption,
    paddingLeft: 10,
  },

  // The open sheet owns the screen. Opaque paper rather than glass: results
  // have to be readable over whatever part of the map is underneath.
  panel: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 6,
    height: 50,
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  back: { paddingHorizontal: 8, paddingVertical: 8 },
  input: {
    flex: 1, color: colors.text, fontSize: 17, height: '100%',
    fontWeight: '500', letterSpacing: tracking.body,
    // RN-web draws a focus ring on the host input that fights the field's own
    // border; the border is the affordance here.
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null),
  },
  clear: { paddingHorizontal: 8 },

  list: { flex: 1 },
  section: {
    fontFamily: font, color: colors.textDim, fontSize: 11, fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 22, paddingTop: 16, paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 12,
  },
  rowMark: { width: 20, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  rowText: { flex: 1 },
  rowLabel: {
    fontFamily: font, color: colors.text, fontSize: 16, fontWeight: '600',
    letterSpacing: tracking.body,
  },
  rowSub: { fontFamily: font, color: colors.textDim, fontSize: 12.5, marginTop: 1 },
  freeNow: {
    fontFamily: font, color: colors.accent, fontSize: 12, fontWeight: '700',
    letterSpacing: tracking.caption,
  },
  hint: {
    fontFamily: font, color: colors.textDim, fontSize: 13.5,
    lineHeight: 20, paddingHorizontal: 22, paddingTop: 18,
  },
});
