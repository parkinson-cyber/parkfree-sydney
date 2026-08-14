import React, { useMemo, useState } from 'react';
import {
  Keyboard, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { search, streetById, type SearchResult } from '../lib/parkingData';
import { colors } from '../theme';
import { useStore } from '../state/store';

export function SearchBar({
  onGo,
}: {
  onGo: (r: SearchResult) => void;
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
        <Text style={styles.icon}>🔍</Text>
        <TextInput
          style={styles.input}
          placeholder="Search street or suburb…"
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        )}
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
  wrap: { paddingHorizontal: 16 },
  // A fully-rounded pill floating over the map, separated by shadow rather
  // than a border — the same treatment as every other control.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26,29,36,0.96)',
    borderRadius: 999,
    paddingHorizontal: 18,
    height: 52,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  icon: { fontSize: 15, marginRight: 10, opacity: 0.85 },
  input: {
    flex: 1, color: colors.text, fontSize: 16, height: '100%',
    fontWeight: '500',
  },
  clear: { color: colors.textDim, fontSize: 15, paddingLeft: 10 },
  results: {
    marginTop: 8,
    backgroundColor: 'rgba(26,29,36,0.98)',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  result: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  resultLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  resultSub: { color: colors.textDim, fontSize: 12.5 },
});
