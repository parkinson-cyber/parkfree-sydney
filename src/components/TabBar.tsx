/**
 * The bottom navigation.
 *
 * A floating bar rather than a full-width slab: the map runs to the edges of
 * the screen underneath it, which is what makes a map app feel like the map is
 * the app. The report action is the raised centre button because it is the
 * only thing here that *adds* something — everything else just looks.
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, shadow, tracking } from '../theme';
import { Glass } from './Glass';

export type Tab = 'map' | 'saved' | 'settings' | 'profile';

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'map', label: 'Map', icon: 'map-outline' },
  { key: 'saved', label: 'Saved', icon: 'bookmark-outline' },
  { key: 'settings', label: 'Settings', icon: 'options-outline' },
  { key: 'profile', label: 'You', icon: 'person-outline' },
];

export function TabBar({
  active, onChange, onReport, bottomInset,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  onReport: () => void;
  bottomInset: number;
}) {
  const tap = (fn: () => void) => () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    fn();
  };

  const item = ({ key, label, icon }: typeof TABS[number]) => {
    const on = active === key;
    return (
      <Pressable key={key} style={styles.item} onPress={tap(() => onChange(key))} hitSlop={6}>
        <View style={[styles.iconWell, on && styles.iconWellOn]}>
        <Ionicons
          name={on ? (icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : icon}
          size={21}
          color={on ? colors.accent : colors.textDim}
        />
        </View>
        <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrap, { paddingBottom: bottomInset }]} pointerEvents="box-none">
      <Glass strong style={styles.bar} intensity={40}>
        {item(TABS[0])}
        {item(TABS[1])}
        <View style={styles.centerSlot} />
        {item(TABS[2])}
        {item(TABS[3])}
      </Glass>

      {/* Raised, and the only filled control in the bar. */}
      <Pressable style={styles.center} onPress={tap(onReport)} accessibilityLabel="Report a spot">
        <Ionicons name="add" size={26} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginHorizontal: 10,
    marginBottom: 6,
    height: 60,
    borderRadius: radius.sheet,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassRim,
    ...shadow(0.15, 24, 8),
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, paddingVertical: 6 },
  // The active tab sits in a soft sage well rather than only changing colour:
  // colour alone is easy to miss at 21pt on a busy map.
  iconWell: {
    width: 40, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWellOn: { backgroundColor: colors.accentSoft },
  centerSlot: { width: 62 },
  label: {
    fontFamily: font, color: colors.textDim, fontSize: 10,
    fontWeight: '600', letterSpacing: tracking.caption,
  },
  labelOn: { color: colors.accent, fontWeight: '700' },
  center: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 26,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3.5,
    borderColor: colors.bg,
    ...shadow(0.3, 18, 7),
  },
});
