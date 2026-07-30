import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, statusColors, statusLabels } from '../theme';
import { useStore } from '../state/store';
import { parkingData } from '../lib/parkingData';
import type { LiveStatus } from '../lib/types';

const ORDER: LiveStatus[] = [
  'free', 'free_limited', 'paid', 'residents', 'banned', 'unknown',
];

const DESCRIPTIONS: Record<LiveStatus, string> = {
  free: 'Free right now with no restriction in force.',
  free_limited: 'Free right now with a time limit (1P/2P/4P) in force.',
  paid: 'Ticket or meter applies right now — many turn green evenings & Sundays.',
  residents: 'Permit holders only.',
  banned: 'No parking or no stopping in force right now (incl. clearways).',
  unknown: 'Street mapped, parking rules not yet verified — check signs.',
};

export function LegendModal() {
  const visible = useStore((s) => s.legendVisible);
  const showLegend = useStore((s) => s.showLegend);
  const showUnknown = useStore((s) => s.showUnknown);
  const setShowUnknown = useStore((s) => s.setShowUnknown);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => showLegend(false)}>
      <Pressable style={styles.backdrop} onPress={() => showLegend(false)}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Map legend</Text>
          {ORDER.map((k) => (
            <View key={k} style={styles.row}>
              <View style={[styles.swatch, { backgroundColor: statusColors[k] }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{statusLabels[k]}</Text>
                <Text style={styles.desc}>{DESCRIPTIONS[k]}</Text>
              </View>
            </View>
          ))}

          <Pressable style={styles.toggleRow} onPress={() => setShowUnknown(!showUnknown)}>
            <Text style={styles.label}>Show unverified streets</Text>
            <View style={[styles.toggle, showUnknown && styles.toggleOn]}>
              <View style={[styles.knob, showUnknown && styles.knobOn]} />
            </View>
          </Pressable>

          <Text style={styles.attribution}>
            Line colours update live with the clock — a metered street turns green when the
            meter hours end.{'\n\n'}
            Data © OpenStreetMap contributors (ODbL), updated {parkingData.metadata.generated.slice(0, 10)}.
            Always check street signs — rules change.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  swatch: { width: 26, height: 6, borderRadius: 3, marginTop: 6 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  desc: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: colors.surfaceRaised,
    padding: 3,
  },
  toggleOn: { backgroundColor: colors.accentDark },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textDim },
  knobOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },
  attribution: { color: colors.textDim, fontSize: 11, lineHeight: 16, marginTop: 14 },
});
