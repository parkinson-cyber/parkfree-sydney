import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StreetFeature } from '../lib/types';
import {
  evaluateSide, evaluateStreet, formatClock, formatPrice, pShort,
  nextFreeAt, formatCountdown,
} from '../lib/rules';
import { featureCenter, sideLabels } from '../lib/geo';
import { colors, font, statusColors, statusLabels, tracking } from '../theme';
import { useStore, useViewNow } from '../state/store';
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
  // Same clock the map is coloured against, so the sheet can never disagree
  // with the line the user just tapped.
  const now = useViewNow();
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
        <Text style={styles.title} numberOfLines={1}>
          {p.name ?? 'Unnamed street'}
        </Text>
        <Pressable onPress={() => select(null)} hitSlop={14} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      {/* Status and the headline facts share one line — stacked as a badge over
          a chip row they cost ~60pt of screen and said little more. Status
          never shrinks: with 3-4 chips the row can run long, and it's the one
          word that must never truncate. Only price + zone show here — cut-off
          time and permit notes are already covered by the sentence below, so
          cutting them from the headline loses nothing, not just space. */}
      <View style={styles.metaRow}>
        <View style={[styles.dot, { backgroundColor: statusColors[overall.status] }]} />
        <Text style={[styles.metaStatus, { color: statusColors[overall.status] }]}>
          {statusLabels[overall.status]}
        </Text>
        {chips.length > 0 && (
          // Non-breaking spaces around the separator: RN-Web collapses plain
          // ASCII spaces sitting at a text-node boundary, which was rendering
          // as "FREE now· $7/hr" with no gap before the dot.
          <Text style={styles.metaChips} numberOfLines={1}>
            {' · '}{chips.slice(0, 2).join(' · ')}
          </Text>
        )}
      </View>

      <Text style={styles.detail} numberOfLines={2}>{overall.detail}</Text>

      {soon && (
        <Text style={[styles.soonText, imminent && styles.soonTextImminent]} numberOfLines={1}>
          Free from {soon.at} · {formatCountdown(soon.inMin)}
        </Text>
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
            Park here{overall.maxstayMin ? ` · ${pShort(overall.maxstayMin)}` : ''}
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
    backgroundColor: 'rgba(26,29,36,0.98)',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: {
    flex: 1,
    fontFamily: font,
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: tracking.title,
  },
  // Borderless and barely-there: closing is a fallback, tapping the map works too.
  close: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },
  closeText: { fontFamily: font, color: colors.textDim, fontSize: 13, fontWeight: '600' },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  metaStatus: {
    flexShrink: 0,
    fontFamily: font, fontSize: 14, fontWeight: '600', letterSpacing: tracking.body,
  },
  metaChips: {
    flexShrink: 1,
    fontFamily: font, color: colors.textDim, fontSize: 14, fontWeight: '500',
    letterSpacing: tracking.body,
  },

  detail: {
    fontFamily: font,
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: tracking.body,
    marginTop: 8,
  },
  // A plain line of text, not a boxed callout — the colour carries the urgency.
  soonText: {
    fontFamily: font, color: colors.textDim, fontSize: 14, fontWeight: '600',
    letterSpacing: tracking.body, marginTop: 7,
  },
  soonTextImminent: { color: colors.accent },

  sides: { flexDirection: 'row', gap: 8, marginTop: 12 },
  sideCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  sideLabel: {
    fontFamily: font, color: colors.textDim, fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: tracking.caption,
  },
  sideStatus: {
    fontFamily: font, fontSize: 14, fontWeight: '600',
    letterSpacing: tracking.body, marginTop: 2,
  },

  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  button: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonPrimaryText: {
    fontFamily: font, color: '#04291B', fontSize: 16, fontWeight: '600',
    letterSpacing: tracking.body,
  },
  buttonSecondary: { backgroundColor: 'rgba(255,255,255,0.09)' },
  buttonSecondaryText: {
    fontFamily: font, color: colors.text, fontSize: 16, fontWeight: '600',
    letterSpacing: tracking.body,
  },
});
