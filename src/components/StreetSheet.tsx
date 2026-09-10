import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StreetFeature } from '../lib/types';
import {
  evaluateSide, evaluateStreet, formatClock, formatPrice, pShort,
  nextFreeAt, formatCountdown,
} from '../lib/rules';
import { featureCenter, sideLabels } from '../lib/geo';
import { colors, font, radius, shadow, statusColors, statusLabels, tracking } from '../theme';
import { Glass } from './Glass';
import { useStore } from '../state/store';
import type { SideRule, ZoneType } from '../lib/types';
import type { Availability } from '../lib/availability';
import { BusyLine } from './BusySheet';

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
  street, onStartTimer, onSaveSpot, estimate, onExplainEstimate,
}: {
  street: StreetFeature;
  onStartTimer: (street: StreetFeature, suggestedMin?: number) => void;
  /** Remember where the car is, so "walk me back" works later. */
  onSaveSpot: (street: StreetFeature) => void;
  /** How busy it probably is — an estimate, opened in full by tapping it. */
  estimate?: Availability | null;
  onExplainEstimate?: () => void;
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
    <Glass strong style={styles.sheet} intensity={40}>
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

      {estimate && onExplainEstimate && (
        <BusyLine estimate={estimate} onPress={onExplainEstimate} />
      )}

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
          onPress={() => {
            onSaveSpot(street);
            onStartTimer(street, overall.maxstayMin);
          }}
        >
          {/* sign-style short form ("½P") keeps this on one line — the verbose
              limit is already spelled out in the detail text above */}
          <Text style={styles.buttonSecondaryText} numberOfLines={1}>
            Park here{overall.maxstayMin ? ` · ${pShort(overall.maxstayMin)}` : ''}
          </Text>
        </Pressable>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  // Deliberately shallow: it was taking a third of the screen to state one
  // street's rules, which pushed the map — the actual product — out of view.
  // Positioned by the caller, since it sits directly above the search bar.
  sheet: {
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    ...shadow(0.16, 20, 8),
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: {
    flex: 1,
    fontFamily: font,
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: tracking.title,
  },
  // Borderless and barely-there: closing is a fallback, tapping the map works too.
  close: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(46,43,38,0.07)',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },
  closeText: { fontFamily: font, color: colors.textDim, fontSize: 13, fontWeight: '600' },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  metaStatus: {
    flexShrink: 0,
    fontFamily: font, fontSize: 13, fontWeight: '700', letterSpacing: tracking.body,
  },
  metaChips: {
    flexShrink: 1,
    fontFamily: font, color: colors.textDim, fontSize: 13, fontWeight: '500',
    letterSpacing: tracking.body,
  },

  detail: {
    fontFamily: font,
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: tracking.body,
    marginTop: 5,
  },
  // A plain line of text, not a boxed callout — the colour carries the urgency.
  soonText: {
    fontFamily: font, color: colors.textDim, fontSize: 13, fontWeight: '600',
    letterSpacing: tracking.body, marginTop: 4,
  },
  soonTextImminent: { color: colors.accent },

  sides: { flexDirection: 'row', gap: 8, marginTop: 8 },
  sideCard: {
    flex: 1,
    backgroundColor: 'rgba(46,43,38,0.05)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sideLabel: {
    fontFamily: font, color: colors.textDim, fontSize: 10.5, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: tracking.caption,
  },
  sideStatus: {
    fontFamily: font, fontSize: 14, fontWeight: '600',
    letterSpacing: tracking.body, marginTop: 2,
  },

  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  button: {
    flex: 1,
    borderRadius: radius.control,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonPrimaryText: {
    fontFamily: font, color: colors.onAccent, fontSize: 15, fontWeight: '600',
    letterSpacing: tracking.body,
  },
  buttonSecondary: { backgroundColor: 'rgba(46,43,38,0.07)' },
  buttonSecondaryText: {
    fontFamily: font, color: colors.text, fontSize: 15, fontWeight: '600',
    letterSpacing: tracking.body,
  },
});
