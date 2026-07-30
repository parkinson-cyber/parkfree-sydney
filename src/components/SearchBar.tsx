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
  wrap: { paddingHorizontal: 12 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  icon: { fontSize: 14, marginRight: 8 },
  input: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  clear: { color: colors.textDim, fontSize: 14, paddingLeft: 8 },
  results: {
    marginTop: 6,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  result: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  resultSub: { color: colors.textDim, fontSize: 12 },
});
