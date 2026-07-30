import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StreetFeature } from '../lib/types';
import {
  evaluateSide, evaluateStreet, formatClock, formatPrice, pShort,
  nextFreeAt, formatCountdown,
} from '../lib/rules';
import { featureCenter, sideLabels } from '../lib/geo';
import { colors, statusColors, statusLabels } from '../theme';
import { useStore } from '../state/store';
import type { SideRule, ZoneType } from '../lib/types';

const ZONE_LABEL: Record<ZoneType, string> = {
  meter: 'Metered',
  loading: 'Loading zone',
  kiss_ride: 'Kiss & Ride',
  residential: 'Resident permit',
  free15: 'Free 15 min',
};

/** Scannable headline facts (price, zone, cut-off, permit) from a street's kerbs. */
function metaChips(rules: (SideRule | undefined)[]): string[] {
  const chips: string[] = [];
  const price = Math.max(0, ...rules.map((r) => r?.pricePerHour ?? 0));
  if (price > 0) chips.push(formatPrice(price));
  const zone = rules.find((r) => r?.zone)?.zone;
  if (zone) chips.push(ZONE_LABEL[zone]);
  const cutOff = Math.max(0, ...rules.map((r) => (r?.cutOffMin && r.cutOffMin < 1440 ? r.cutOffMin : 0)));
  if (cutOff > 0) chips.push(`Free after ${formatClock(cutOff)}`);
  if (rules.some((r) => r?.permitExcepted)) chips.push('Permit excepted');
  return chips;
}

export function StreetSheet({
  street, onStartTimer,
}: {
  street: StreetFeature;
  onStartTimer: (street: StreetFeature, suggestedMin?: number) => void;
}) {
  const now = useStore((s) => s.now);
  const select = useStore((s) => s.select);

  const p = street.properties;
  const overall = evaluateStreet(p, now);
  const compass = sideLabels(street);
  const sides = [
    { label: compass.left, rule: p.left },
    { label: compass.right, rule: p.right },
  ].filter((s) => s.rule);
  const chips = metaChips([p.left, p.right]);
  // "Free from 6pm · in 15 min" — the wait-or-drive-on call.
  const soon = nextFreeAt(p, now);
  const imminent = !!soon && soon.inMin <= 60;
  const sideEvals = sides.map((s) => ({ ...s, ev: evaluateSide(s.rule, now) }));
  // Only break parking down per-side when the two sides genuinely differ —
  // otherwise the overall summary already says everything.
  const sidesDiffer =
    sideEvals.length === 2 &&
    (sideEvals[0].ev.status !== sideEvals[1].ev.status ||
      (sideEvals[0].rule!.maxstayMin ?? 0) !== (sideEvals[1].rule!.maxstayMin ?? 0));

  const openDirections = () => {
    const { latitude, longitude } = featureCenter(street);
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=d`
        : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    Linking.openURL(url);
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {p.name ?? 'Unnamed street'}
          </Text>
          <View style={[styles.badge, { backgroundColor: statusColors[overall.status] + '26', borderColor: statusColors[overall.status] }]}>
            <View style={[styles.dot, { backgroundColor: statusColors[overall.status] }]} />
            <Text style={[styles.badgeText, { color: statusColors[overall.status] }]}>
              {statusLabels[overall.status]}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => select(null)} hitSlop={12} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map((c) => (
            <View key={c} style={styles.chip}>
              <Text style={styles.chipText}>{c}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.detail} numberOfLines={3}>{overall.detail}</Text>

      {soon && (
        <View style={[styles.soon, imminent && styles.soonImminent]}>
          <Text style={[styles.soonText, imminent && styles.soonTextImminent]} numberOfLines={1}>
            🕐 Free from {soon.at}
            <Text style={styles.soonCount}> · {formatCountdown(soon.inMin)}</Text>
          </Text>
        </View>
      )}

      {sidesDiffer && (
        <View style={styles.sides}>
          {sideEvals.map(({ label, rule, ev }) => (
            <View key={label} style={styles.sideCard}>
              <Text style={styles.sideLabel}>{label}</Text>
              <Text style={[styles.sideStatus, { color: statusColors[ev.status] }]} numberOfLines={1}>
                {statusLabels[ev.status]}
                {rule!.maxstayMin ? ` · ${pShort(rule!.maxstayMin)}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.buttonPrimary]} onPress={openDirections}>
          <Text style={styles.buttonPrimaryText}>Directions</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => onStartTimer(street, overall.maxstayMin)}
        >
          {/* sign-style short form ("½P") keeps this on one line — the verbose
              limit is already spelled out in the detail text above */}
          <Text style={styles.buttonSecondaryText} numberOfLines={1}>
            ⏱ Park here{overall.maxstayMin ? ` · ${pShort(overall.maxstayMin)}` : ''}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 20,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 14,
    paddingTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  close: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  detail: { color: colors.textDim, fontSize: 13.5, lineHeight: 19, marginTop: 8 },
  soon: {
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  // Within the hour it's a decision you can act on — make it glow.
  soonImminent: { backgroundColor: colors.accent + '1F', borderColor: colors.accent + '66' },
  soonText: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  soonTextImminent: { color: colors.accent },
  soonCount: { fontWeight: '800' },
  sides: { flexDirection: 'row', gap: 8, marginTop: 10 },
  sideCard: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sideLabel: { color: colors.textDim, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  sideStatus: { fontSize: 13, fontWeight: '700', marginTop: 3 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  button: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonPrimaryText: { color: '#04291B', fontSize: 15, fontWeight: '800' },
  buttonSecondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  buttonSecondaryText: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
