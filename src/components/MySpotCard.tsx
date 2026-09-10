/**
 * "Where did I park?" — the card that shows once a spot is saved.
 * Everything here is local to the phone.
 */

import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, shadow } from '../theme';
import { tracking } from '../theme';
import { Glass } from './Glass';
import { useStore } from '../state/store';
import { distanceM } from '../lib/geo';

function since(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m ago`;
}

export function MySpotCard({ at }: { at?: { latitude: number; longitude: number } | null }) {
  const spot = useStore((s) => s.mySpot);
  const setMySpot = useStore((s) => s.setMySpot);
  if (!spot) return null;

  const away = at ? Math.round(distanceM(at.latitude, at.longitude, spot.latitude, spot.longitude)) : null;

  const walkBack = () => {
    const { latitude, longitude } = spot;
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=w`
      : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=walking`;
    Linking.openURL(url);
  };

  return (
    <Glass strong style={styles.card}>
      <Text style={styles.icon}>🅿️</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          Car parked{spot.streetName ? ` on ${spot.streetName}` : ''}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {since(spot.savedAt)}{away != null ? ` · ${away < 1000 ? `${away} m` : `${(away / 1000).toFixed(1)} km`} away` : ''}
        </Text>
      </View>
      <Pressable style={styles.walk} onPress={walkBack} hitSlop={6}>
        <Text style={styles.walkText}>Walk back</Text>
      </Pressable>
      <Pressable style={styles.clear} onPress={() => setMySpot(null)} hitSlop={10}>
        <Text style={styles.clearText}>✕</Text>
      </Pressable>
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 11,
    ...shadow(0.12, 16, 5),
  },
  icon: { fontSize: 18 },
  title: { fontFamily: font, color: colors.text, fontSize: 14.5, fontWeight: '700', letterSpacing: tracking.body },
  sub: { fontFamily: font, color: colors.textDim, fontSize: 12.5, marginTop: 1 },
  walk: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  walkText: { fontFamily: font, color: colors.onAccent, fontSize: 13, fontWeight: '700' },
  clear: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  clearText: { fontFamily: font, color: colors.textDim, fontSize: 13, fontWeight: '600' },
});
