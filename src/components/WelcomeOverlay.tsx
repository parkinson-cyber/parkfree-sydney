import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, kindColors } from '../theme';
import { useStore } from '../state/store';

const POINTS = [
  {
    swatches: [kindColors.free, kindColors.free_limited],
    title: 'Green means free',
    desc: 'Streets are colour-coded from real parking-sign data. Bright green is free right now; lime is free with a time limit.',
  },
  {
    swatches: [kindColors.paid, kindColors.no_parking],
    title: 'Colours follow the clock',
    desc: 'A metered street turns green the minute the meter hours end. The map always shows this exact moment.',
  },
  {
    swatches: [kindColors.unknown],
    title: 'Tap any street',
    desc: 'See the rules for each side of the road, get directions, and set a timer so you never overstay.',
  },
];

export function WelcomeOverlay({ onFindPark }: { onFindPark: () => void }) {
  const onboarded = useStore((s) => s.onboarded);
  const setOnboarded = useStore((s) => s.setOnboarded);

  // The CTA should do what it says — dismiss, then actually go find one.
  const start = () => {
    setOnboarded();
    onFindPark();
  };

  return (
    <Modal visible={onboarded === false} transparent animationType="fade" onRequestClose={setOnboarded}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.brand}>
            Park<Text style={{ color: colors.accent }}>Free</Text>
            <Text style={styles.brandSub}>  SYDNEY</Text>
          </Text>
          <Text style={styles.tagline}>Free street parking, live.</Text>

          <View style={styles.points}>
            {POINTS.map((p) => (
              <View key={p.title} style={styles.point}>
                <View style={styles.swatches}>
                  {p.swatches.map((c) => (
                    <View key={c} style={[styles.swatch, { backgroundColor: c }]} />
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pointTitle}>{p.title}</Text>
                  <Text style={styles.pointDesc}>{p.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable style={styles.cta} onPress={start}>
            <Text style={styles.ctaText}>Find me a park</Text>
          </Pressable>
          <Text style={styles.note}>Always check street signs — data is community-sourced.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,9,12,0.82)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brand: { color: colors.text, fontSize: 28, fontWeight: '900' },
  brandSub: { color: colors.textDim, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  tagline: { color: colors.textDim, fontSize: 15, marginTop: 4, marginBottom: 22 },
  points: { gap: 18 },
  point: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  swatches: { width: 34, gap: 4, marginTop: 5 },
  swatch: { height: 5, borderRadius: 3 },
  pointTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  pointDesc: { color: colors.textDim, fontSize: 13, lineHeight: 18, marginTop: 2 },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  ctaText: { color: '#04291B', fontSize: 16, fontWeight: '800' },
  note: { color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: 12 },
});
