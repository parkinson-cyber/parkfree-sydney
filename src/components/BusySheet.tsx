/**
 * "How busy is it?" — the estimate, its confidence, and the evidence behind it.
 *
 * Modelled on the way good price-history apps disclose a suspicious discount:
 * lead with the claim, put a confidence number next to it, then list the
 * evidence so the reader can overrule you. On-street occupancy in Sydney is
 * not measured by anyone, so the honest move is to show the working rather
 * than a bare percentage.
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, tracking } from '../theme';
import { confidenceLabel, type Availability } from '../lib/availability';

const BAND_COLOR: Record<Availability['band'], string> = {
  likely: colors.accent,
  mixed: colors.warning,
  unlikely: colors.danger,
  unavailable: colors.danger,
  unknown: colors.textDim,
};

export function BusyLine({ estimate, onPress }: { estimate: Availability; onPress: () => void }) {
  if (estimate.band === 'unknown') return null;
  const tint = BAND_COLOR[estimate.band];
  return (
    <Pressable style={styles.line} onPress={onPress} hitSlop={6}>
      <View style={[styles.lineDot, { backgroundColor: tint }]} />
      <Text style={[styles.lineText, { color: tint }]} numberOfLines={1}>
        {estimate.headline}
      </Text>
      <Text style={styles.lineHint}>
        {estimate.score !== null ? `${Math.round(estimate.score * 100)}%` : ''} · why?
      </Text>
    </Pressable>
  );
}

export function BusySheet({
  estimate, streetName, onClose,
}: {
  estimate: Availability | null;
  streetName?: string;
  onClose: () => void;
}) {
  if (!estimate) return null;
  const tint = BAND_COLOR[estimate.band];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{estimate.headline}</Text>
            <Pressable onPress={onClose} hitSlop={14} style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.badgeIcon, { backgroundColor: tint }]}>
              <Text style={styles.badgeIconText}>
                {estimate.band === 'likely' ? '✓' : estimate.band === 'unavailable' ? '✕' : '!'}
              </Text>
            </View>
            <View style={[styles.pill, { backgroundColor: `${tint}22` }]}>
              <Text style={[styles.pillText, { color: tint }]}>{confidenceLabel(estimate.confidence)}</Text>
            </View>
            {estimate.score !== null && (
              <Text style={styles.scoreText}>{Math.round(estimate.score * 100)}% chance of a space</Text>
            )}
          </View>

          <Text style={styles.lede}>
            {estimate.basis === 'law'
              ? 'This is the rule on the sign, not a guess.'
              : 'Nobody measures on-street parking in Sydney, so this is an estimate. Here is everything it is based on — judge it yourself.'}
          </Text>

          <ScrollView style={styles.evidence} showsVerticalScrollIndicator={false}>
            {estimate.evidence.map((line, i) => (
              <View key={i} style={styles.evidenceRow}>
                <View style={[styles.tick, { backgroundColor: tint }]}>
                  <Text style={styles.tickText}>✓</Text>
                </View>
                <Text style={styles.evidenceText}>{line}</Text>
              </View>
            ))}
          </ScrollView>

          <Text style={styles.footer}>
            {streetName ? `${streetName} · ` : ''}Always check the sign — it is the only thing that can fine you.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%', maxWidth: 480, maxHeight: '80%',
    backgroundColor: colors.surface, borderRadius: 24, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontFamily: font, color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: tracking.title },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: font, color: colors.textDim, fontSize: 14, fontWeight: '600' },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  badgeIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  badgeIconText: { color: '#0F1115', fontSize: 17, fontWeight: '900' },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontFamily: font, fontSize: 13.5, fontWeight: '700' },
  scoreText: { fontFamily: font, color: colors.textDim, fontSize: 13, fontWeight: '600' },

  lede: { fontFamily: font, color: colors.textDim, fontSize: 14, lineHeight: 20, marginTop: 14, letterSpacing: tracking.body },

  evidence: { marginTop: 14 },
  evidenceRow: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'flex-start' },
  tick: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tickText: { color: '#0F1115', fontSize: 11, fontWeight: '900' },
  evidenceText: { flex: 1, fontFamily: font, color: colors.text, fontSize: 14, lineHeight: 20, letterSpacing: tracking.body },

  footer: { fontFamily: font, color: colors.textDim, fontSize: 12, marginTop: 6, textAlign: 'center' },

  line: { flexDirection: 'row', alignItems: 'center', marginTop: 9 },
  lineDot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  lineText: { fontFamily: font, fontSize: 14, fontWeight: '600', letterSpacing: tracking.body },
  lineHint: { fontFamily: font, color: colors.textDim, fontSize: 13, fontWeight: '600', marginLeft: 'auto' },
});
