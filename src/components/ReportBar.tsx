/**
 * "I'm leaving" / "It's full" — the crowd layer's only input.
 *
 * Deliberately two taps at most, and only about where the user actually is:
 * a report you make from across town is noise. Reports expire (15 min for a
 * free space, 30 for a taken one) so the map self-cleans.
 */

import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, font, tracking } from '../theme';
import { postReport, type Report, type ReportKind } from '../lib/reports';

export function ReportSheet({
  at, streetId, streetName, onDone, onCancel,
}: {
  at: { latitude: number; longitude: number } | null;
  streetId?: number;
  streetName?: string;
  onDone: (report: Report, message: string) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState<ReportKind | null>(null);
  if (!at) return null;

  const send = async (kind: ReportKind) => {
    if (busy) return;
    setBusy(kind);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const { result, report, live } = await postReport({ ...at, kind, streetId, streetName });
    setBusy(null);
    if (result === 'ok' && report) {
      const base = kind === 'left' || kind === 'looks_empty'
        ? 'Thanks — a free space is on the map for 15 minutes.'
        : 'Thanks — marked as full for 30 minutes.';
      // `live: false` means the backend has no shared storage yet, so the
      // report exists only for whoever hits the same server instance. Say so
      // rather than implying the whole city can see it.
      onDone(report, live === false ? `${base.replace('on the map', 'on your map')} (not shared yet)` : base);
    } else {
      onDone(
        { id: 'x', latitude: 0, longitude: 0, kind, streetId: null, streetName: null,
          source: 'user', reportedAt: '', expiresAt: '', reportedBy: '' },
        result === 'rate_limited' ? "You've reported a lot recently — try again later."
          : result === 'outside' ? 'ParkFree covers Sydney only.'
          : "Couldn't send that — check your connection.",
      );
    }
  };

  const Option = ({ kind, label, hint, tint }: { kind: ReportKind; label: string; hint: string; tint: string }) => (
    <Pressable style={[styles.option, busy === kind && styles.optionBusy]} onPress={() => send(kind)} disabled={!!busy}>
      <View style={[styles.optionDot, { backgroundColor: tint }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionHint}>{hint}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <View style={styles.headerRow}>
        <Text style={styles.title}>Help the next driver</Text>
        <Pressable onPress={onCancel} hitSlop={14} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      <Text style={styles.sub} numberOfLines={1}>
        {streetName ? `At ${streetName}` : 'At your current location'}
      </Text>

      <Option kind="left" label="I'm leaving this spot" hint="Shows as free for 15 minutes" tint={colors.accent} />
      <Option kind="looks_empty" label="Spaces free here" hint="You can see empty kerb" tint="#84CC16" />
      <Option kind="looks_full" label="Street is full" hint="Saves someone the drive · 30 min" tint={colors.danger} />

      <Text style={styles.note}>Reports are anonymous and expire on their own.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 12, right: 12, bottom: 20,
    backgroundColor: 'rgba(26,29,36,0.98)', borderRadius: 24,
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontFamily: font, color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: tracking.title },
  close: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  closeText: { fontFamily: font, color: colors.textDim, fontSize: 13, fontWeight: '600' },
  sub: { fontFamily: font, color: colors.textDim, fontSize: 14, letterSpacing: tracking.body, marginTop: 4, marginBottom: 12 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  optionBusy: { opacity: 0.5 },
  optionDot: { width: 10, height: 10, borderRadius: 5 },
  optionLabel: { fontFamily: font, color: colors.text, fontSize: 16, fontWeight: '600', letterSpacing: tracking.body },
  optionHint: { fontFamily: font, color: colors.textDim, fontSize: 12.5, marginTop: 1 },
  note: { fontFamily: font, color: colors.textDim, fontSize: 11.5, textAlign: 'center', marginTop: 4 },
});
