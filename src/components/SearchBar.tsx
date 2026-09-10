import React, { useMemo, useState } from 'react';
import {
  Keyboard, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { search, streetById, type SearchResult } from '../lib/parkingData';
import { colors, font, radius, shadow, tracking } from '../theme';
import { useStore } from '../state/store';

export function SearchBar({
  onGo, freeCount, freeNearby,
}: {
  onGo: (r: SearchResult) => void;
  /** Live count, shown inside the bar so it costs no extra height. */
  freeCount?: number;
  freeNearby?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const select = useStore((s) => s.select);

  const results = useMemo(() => search(query), [query]);

  const pick = (r: SearchResult) => {
    setQuery('');
    Keyboard.dismiss();
    onGo(r);
    if (r.streetId) {
      const f = streetById(r.streetId);
      if (f) select(f);
    }
  };

  return (
    <View style={styles.wrap}>
      {/* The bar lives at the bottom of the screen, so its results open
          upward into the map rather than off the bottom edge. */}
      {focused && results.length > 0 && (
        <View style={styles.results}>
          {results.map((r) => (
            <Pressable key={`${r.sub}-${r.label}`} style={styles.result} onPress={() => pick(r)}>
              <Text style={styles.resultLabel}>{r.label}</Text>
              <Text style={styles.resultSub}>{r.sub}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.bar}>
        <Ionicons name="search" size={17} color={colors.textDim} style={styles.mark} />
        <TextInput
          style={styles.input}
          placeholder="Search street or suburb"
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} style={styles.clear}>
            <Ionicons name="close-circle" size={17} color={colors.textDim} />
          </Pressable>
        ) : freeCount != null ? (
          // The count lives in the bar rather than on its own row: it was
          // costing a whole band of screen to say one number.
          <Text style={styles.count} numberOfLines={1}>
            {freeCount} free{freeNearby ? ' here' : ''}
          </Text>
        ) : null}
      </View>
    </View>
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
  input: {
    flex: 1, color: colors.text, fontSize: 15, height: '100%',
    fontWeight: '500', letterSpacing: tracking.body,
  },
  clear: { paddingLeft: 10 },
  count: {
    fontFamily: font, color: colors.accent, fontSize: 12, fontWeight: '700',
    letterSpacing: tracking.caption,
    paddingLeft: 10,
  },
  results: {
    marginBottom: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassRim,
    ...shadow(0.16, 22, 10),
  },
  result: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultLabel: { fontFamily: font, color: colors.text, fontSize: 15, fontWeight: '600' },
  resultSub: { fontFamily: font, color: colors.textDim, fontSize: 12.5 },
});
