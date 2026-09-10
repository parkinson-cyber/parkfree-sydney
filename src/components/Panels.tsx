/**
 * The non-map sections: Saved, Settings, You.
 *
 * They sit *over* the map rather than replacing it — the map is expensive to
 * mount and, more to the point, a map app should never feel like it has left
 * the map. Each is a sheet you can dismiss straight back to it.
 */

import React from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, kindColors, radius, shadow, statusLabels, tracking } from '../theme';
import { useStore } from '../state/store';
import { councilCarParks, councilCarParksSource } from '../lib/councilCarparks';
import { freeCarParks, freeCarParksSource } from '../lib/freeCarparks';
import { allStreets, classifiedStreets } from '../lib/parkingData';
import { API_BASE } from '../lib/reports';

function Row({
  icon, title, sub, onPress, right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const Wrap: React.ComponentType<any> = onPress ? Pressable : View;
  return (
    <Wrap style={styles.row} onPress={onPress}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={17} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textDim} /> : null)}
    </Wrap>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function Panel({
  onClose, onWalkBack, bottomInset,
}: {
  onClose: () => void;
  onWalkBack: () => void;
  bottomInset: number;
}) {
  const tab = useStore((s) => s.tab);
  const mySpot = useStore((s) => s.mySpot);
  const setMySpot = useStore((s) => s.setMySpot);
  const timer = useStore((s) => s.timer);
  const showUnknown = useStore((s) => s.showUnknown);
  const setShowUnknown = useStore((s) => s.setShowUnknown);
  const reportsMade = useStore((s) => s.reportsMade);

  if (tab === 'map') return null;

  const title = tab === 'saved' ? 'Saved' : tab === 'settings' ? 'Settings' : 'You';
  const classifiedPct = Math.round((classifiedStreets.length / allStreets.length) * 1000) / 10;

  return (
    <View style={[styles.overlay, { paddingBottom: bottomInset + 74 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.textDim} />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'saved' && (
          <>
            <Section title="Your car">
              {mySpot ? (
                <>
                  <Row
                    icon="car-outline"
                    title={mySpot.streetName ?? 'Saved spot'}
                    sub={`Saved ${new Date(mySpot.savedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`}
                  />
                  <Row icon="walk-outline" title="Walk me back" onPress={onWalkBack} />
                  <Row icon="trash-outline" title="Clear saved spot" onPress={() => setMySpot(null)} />
                </>
              ) : (
                <Row
                  icon="car-outline"
                  title="No spot saved"
                  sub="Tap a street, then “Park here” to remember where you left the car"
                />
              )}
            </Section>

            <Section title="Timer">
              {timer ? (
                <Row
                  icon="timer-outline"
                  title={timer.streetName ?? 'Parking timer'}
                  sub={`Expires ${new Date(timer.expiresAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`}
                />
              ) : (
                <Row icon="timer-outline" title="No timer running" sub="Set one when you park so you never overstay" />
              )}
            </Section>
          </>
        )}

        {tab === 'settings' && (
          <>
            <Section title="Map">
              <Row
                icon="git-branch-outline"
                title="Show unverified streets"
                sub="Faint lines where we have no confirmed rules"
                right={
                  <Switch
                    value={showUnknown}
                    onValueChange={setShowUnknown}
                    trackColor={{ true: colors.accent, false: colors.border }}
                  />
                }
              />
            </Section>

            <Section title="What the colours mean">
              {(['free', 'free_limited', 'paid', 'residents', 'no_parking', 'unknown'] as const).map((k) => (
                <View key={k} style={styles.row}>
                  <View style={[styles.swatch, { backgroundColor: kindColors[k] }]} />
                  <Text style={styles.rowTitle}>
                    {k === 'unknown' ? 'No confirmed rules' : statusLabels[k === 'no_parking' ? 'banned' : k]}
                  </Text>
                </View>
              ))}
            </Section>

            <Section title="Coverage">
              <Row
                icon="stats-chart-outline"
                title={`${classifiedPct}% of streets have known rules`}
                sub={`${classifiedStreets.length.toLocaleString()} of ${allStreets.length.toLocaleString()} · updated hourly`}
                onPress={() => Linking.openURL('https://parkfree-sydney.vercel.app/status.html')}
              />
              <Row
                icon="business-outline"
                title={`${councilCarParks.length} council car parks`}
                sub="Free periods, fees and hours quoted from each council"
              />
              <Row
                icon="pricetag-outline"
                title={`${freeCarParks.length.toLocaleString()} free car parks`}
                sub="Supermarkets, clubs and reserves — check the sign on arrival"
              />
            </Section>

            <Section title="Where the data comes from">
              <Text style={styles.body}>{councilCarParksSource}</Text>
              <Text style={[styles.body, { marginTop: 8 }]}>{freeCarParksSource}</Text>
              <Text style={[styles.body, { marginTop: 8 }]}>
                Street rules come from council sign registers, resident-parking schemes and TfNSW
                clearway data. Nothing on this map is guessed: a street with no confirmed rule is
                shown as unverified rather than free.
              </Text>
            </Section>
          </>
        )}

        {tab === 'profile' && (
          <>
            <Section title="Account">
              <Row
                icon="lock-open-outline"
                title="No account needed"
                sub="Reports are anonymous — the app only stores a random id on this device"
              />
            </Section>

            <Section title="Your contribution">
              <Row
                icon="megaphone-outline"
                title={reportsMade === 1 ? '1 report shared' : `${reportsMade} reports shared`}
                sub={reportsMade === 0
                  ? 'Tap + when you leave a spot — the next driver sees it for 15 minutes'
                  : 'Every one of those helped someone find a space'}
              />
            </Section>

            <Section title="About">
              <Row
                icon="logo-github"
                title="Open source"
                sub="parkinson-cyber/parkfree-sydney"
                onPress={() => Linking.openURL('https://github.com/parkinson-cyber/parkfree-sydney')}
              />
              <Row
                icon="pulse-outline"
                title="Live status"
                sub="Coverage, feed health and recent work"
                onPress={() => Linking.openURL('https://parkfree-sydney.vercel.app/status.html')}
              />
              <Row icon="server-outline" title="Reports API" sub={API_BASE} />
            </Section>

            <Text style={styles.footer}>
              Map data © OpenStreetMap contributors (ODbL). Parking data © the councils and
              Transport for NSW. Always check the sign — it is the only thing that can fine you.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'web' ? 22 : 58, paddingBottom: 10,
  },
  title: {
    flex: 1, fontFamily: font, color: colors.text, fontSize: 28,
    fontWeight: '800', letterSpacing: -0.7,
  },
  close: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(46,43,38,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  section: { marginTop: 18 },
  sectionTitle: {
    fontFamily: font, color: colors.textDim, fontSize: 11.5, fontWeight: '700',
    letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 4,
    ...shadow(0.06, 10, 2),
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(110,139,91,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: {
    flex: 1, fontFamily: font, color: colors.text, fontSize: 15,
    fontWeight: '600', letterSpacing: tracking.body,
  },
  rowSub: { fontFamily: font, color: colors.textDim, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  swatch: { width: 22, height: 5, borderRadius: 3, marginLeft: 4, marginRight: 4 },
  body: {
    fontFamily: font, color: colors.textDim, fontSize: 12.5, lineHeight: 18,
    paddingVertical: 8,
  },
  footer: {
    fontFamily: font, color: colors.textDim, fontSize: 11, lineHeight: 16,
    textAlign: 'center', marginTop: 22, paddingHorizontal: 12,
  },
});
