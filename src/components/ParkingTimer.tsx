import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { useStore } from '../state/store';
import { cancelAlert, scheduleExpiryAlert } from '../lib/notifications';
import { featureCenter } from '../lib/geo';
import { formatMaxstay } from '../lib/rules';
import type { StreetFeature } from '../lib/types';

const PRESETS_MIN = [30, 60, 120, 240];

/** Duration picker shown after tapping "Park here". */
export function TimerModal({
  street, suggestedMin, onClose,
}: {
  street: StreetFeature | null;
  suggestedMin?: number;
  onClose: () => void;
}) {
  const setTimer = useStore((s) => s.setTimer);
  const [busy, setBusy] = useState(false);

  const start = async (minutes: number) => {
    if (!street || busy) return;
    setBusy(true);
    const expiresAt = Date.now() + minutes * 60000;
    const { latitude, longitude } = featureCenter(street);
    const notificationId = await scheduleExpiryAlert(expiresAt, street.properties.name);
    setTimer({
      expiresAt,
      streetName: street.properties.name,
      latitude,
      longitude,
      notificationId,
    });
    setBusy(false);
    onClose();
  };

  const options = suggestedMin && !PRESETS_MIN.includes(suggestedMin)
    ? [suggestedMin, ...PRESETS_MIN]
    : PRESETS_MIN;

  return (
    <Modal visible={!!street} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>⏱ Parking timer</Text>
          <Text style={styles.sub}>
            {street?.properties.name ?? 'This street'}
            {suggestedMin ? ` — sign limit ${formatMaxstay(suggestedMin)}` : ''}
          </Text>
          <View style={styles.grid}>
            {options.map((min) => (
              <Pressable
                key={min}
                style={[styles.option, min === suggestedMin && styles.optionSuggested]}
                onPress={() => start(min)}
              >
                <Text style={styles.optionText}>
                  {min < 60 ? `${min} min` : `${min / 60} hour${min > 60 ? 's' : ''}`}
                </Text>
                {min === suggestedMin && <Text style={styles.optionTag}>SIGN LIMIT</Text>}
              </Pressable>
            ))}
          </View>
          <Text style={styles.note}>You'll get an alert 10 minutes before time is up.</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Floating countdown pill while a timer is running. */
export function TimerPill() {
  const timer = useStore((s) => s.timer);
  const setTimer = useStore((s) => s.setTimer);
  const [, force] = useState(0);

  useEffect(() => {
    if (!timer) return;
    const iv = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(iv);
  }, [timer]);

  if (!timer) return null;

  const msLeft = timer.expiresAt - Date.now();
  const expired = msLeft <= 0;
  const totalSec = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const label = expired
    ? 'Time expired!'
    : h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;

  const stop = () => {
    cancelAlert(timer.notificationId);
    setTimer(null);
  };

  return (
    <View style={[styles.pill, expired && styles.pillExpired]}>
      <Text style={styles.pillIcon}>🚗</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.pillTime}>{label}</Text>
        {timer.streetName && <Text style={styles.pillStreet}>{timer.streetName}</Text>}
      </View>
      <Pressable onPress={stop} style={styles.pillStop} hitSlop={8}>
        <Text style={styles.pillStopText}>{expired ? 'Dismiss' : 'Stop'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', padding: 28,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 13, marginTop: 4, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: {
    flexGrow: 1, minWidth: '45%',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  optionSuggested: { borderColor: colors.accent },
  optionText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  optionTag: { color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 3 },
  note: { color: colors.textDim, fontSize: 12, marginTop: 14, textAlign: 'center' },

  pill: {
    position: 'absolute',
    top: 118,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    minWidth: 220,
  },
  pillExpired: { borderColor: colors.danger, backgroundColor: '#2A1417' },
  pillIcon: { fontSize: 18 },
  pillTime: { color: colors.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pillStreet: { color: colors.textDim, fontSize: 11 },
  pillStop: {
    backgroundColor: colors.surfaceRaised, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  pillStopText: { color: colors.text, fontSize: 12, fontWeight: '700' },
});
