import React, { useMemo, useState } from 'react';
import {
  Keyboard, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
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
      <View style={styles.bar}>
        <Text style={styles.mark}>P</Text>
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
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        ) : freeCount != null ? (
          // The count lives in the bar rather than on its own row: it was
          // costing a whole band of screen to say one number.
          <Text style={styles.count} numberOfLines={1}>
            {freeCount} free{freeNearby ? ' here' : ''}
          </Text>
        ) : null}
      </View>
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
    backgroundColor: colors.search,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    height: 44,
    ...shadow(0.14, 12, 3),
  },
  mark: {
    fontFamily: font, color: colors.searchInk, fontSize: 16, fontWeight: '800',
    marginRight: 10, opacity: 0.75,
  },
  input: {
    flex: 1, color: colors.searchInk, fontSize: 15, height: '100%',
    fontWeight: '500', letterSpacing: tracking.body,
  },
  clear: { color: colors.searchInk, fontSize: 14, paddingLeft: 10, opacity: 0.7 },
  count: {
    fontFamily: font, color: colors.searchInk, fontSize: 12.5, fontWeight: '700',
    paddingLeft: 10, opacity: 0.8,
  },
  results: {
    marginTop: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: 'hidden',
    ...shadow(0.16, 18, 8),
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
