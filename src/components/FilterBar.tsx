import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { useStore, type StatusFilter } from '../state/store';

const FILTERS: { key: StatusFilter; label: string; premium: boolean }[] = [
  { key: 'all', label: 'All streets', premium: false },
  { key: 'free_now', label: '✨ Free NOW', premium: true },
  { key: 'free_anytime', label: 'Free 24/7', premium: true },
];

export function FilterBar() {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const premium = useStore((s) => s.premium);
  const showPaywall = useStore((s) => s.showPaywall);

  return (
    <View style={styles.row}>
      {FILTERS.map((f) => {
        const active = filter === f.key;
        const locked = f.premium && !premium;
        return (
          <Pressable
            key={f.key}
            onPress={() => (locked ? showPaywall(true) : setFilter(f.key))}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {f.label}
              {locked ? ' 🔒' : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginTop: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: '#04291B' },
});
