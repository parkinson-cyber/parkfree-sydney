/**
 * ParkFree Sydney — find free street parking, live.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import ParkingMap from './src/components/ParkingMap';
import {
  type ParkingMapHandle, SHOW_CLASSIFIED_MAX_DELTA,
} from './src/components/ParkingMap.shared';
import { SearchBar } from './src/components/SearchBar';
import { StreetSheet } from './src/components/StreetSheet';
import { LegendModal } from './src/components/LegendModal';
import { TimerModal, TimerPill } from './src/components/ParkingTimer';
import { WelcomeOverlay } from './src/components/WelcomeOverlay';

import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { classifiedStreets } from './src/lib/parkingData';
import { useCarparks } from './src/lib/carparks';
import { useReports, ago, isFreeKind, type Report } from './src/lib/reports';
import { councilCarParks } from './src/lib/councilCarparks';
import { freeCarParks } from './src/lib/freeCarparks';
import { ReportSheet } from './src/components/ReportBar';
import { MySpotCard } from './src/components/MySpotCard';
import { BusySheet } from './src/components/BusySheet';
import { TabBar } from './src/components/TabBar';
import { Panel } from './src/components/Panels';
import { useKeyboardInset } from './src/lib/useKeyboardInset';
import { estimateAvailability, type Availability } from './src/lib/availability';
import { featureCenter, featureInRegion } from './src/lib/geo';
import { evaluateStreet } from './src/lib/rules';
import {
  findNearestPark, findSoonestPark, formatDistance,
  type ParkSuggestion, type SoonSuggestion,
} from './src/lib/findPark';
import { colors, radius, shadow as elevate } from './src/theme';
import { SYDNEY_REGION, useStore } from './src/state/store';
import type { LiveStatus, StreetFeature } from './src/lib/types';

function Main() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<ParkingMapHandle>(null);

  const now = useStore((s) => s.now);
  const tick = useStore((s) => s.tick);
  const filter = useStore((s) => s.filter);
  const showUnknown = useStore((s) => s.showUnknown);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const region = useStore((s) => s.region);
  const setRegion = useStore((s) => s.setRegion);
  const showLegend = useStore((s) => s.showLegend);
  const hydrate = useStore((s) => s.hydrate);
  const carparks = useCarparks();
  const mySpot = useStore((s) => s.mySpot);
  const setMySpot = useStore((s) => s.setMySpot);
  const [reports, addReport] = useReports(region);
  const [reportAt, setReportAt] = useState<
    { at: { latitude: number; longitude: number }; streetId?: number; streetName?: string } | null
  >(null);
  const [explaining, setExplaining] = useState(false);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const countReport = useStore((s) => s.countReport);
  // The keyboard lifts the bottom chrome. It must never move the map.
  const keyboard = useKeyboardInset();

  const [timerFor, setTimerFor] = useState<{ street: StreetFeature; suggestedMin?: number } | null>(null);
  const [finding, setFinding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // long enough to read a street name, distance and walk time
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const handleSelect = useCallback(
    (f: StreetFeature | null) => {
      if (f && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
      select(f);
    },
    [select],
  );

  useEffect(() => {
    hydrate();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, [hydrate, tick]);

  /** Live status for every classified street — the beating heart of the app. */
  const statusById = useMemo(() => {
    const map = new Map<number, LiveStatus>();
    for (const f of classifiedStreets) {
      map.set(f.properties.id, evaluateStreet(f.properties, now).status);
    }
    return map;
  }, [now]);

  /** Ids passing the active filter (null = show everything). */
  const visibleIds = useMemo(() => {
    if (filter === 'all') return null;
    const ids = new Set<number>();
    for (const f of classifiedStreets) {
      const status = statusById.get(f.properties.id);
      if (filter === 'free_now' && (status === 'free' || status === 'free_limited')) {
        ids.add(f.properties.id);
      } else if (filter === 'free_anytime' && f.properties.cat === 'free' && status === 'free') {
        ids.add(f.properties.id);
      }
    }
    return ids;
  }, [filter, statusById]);

  /** The headline promise: locate the driver, find the closest kerb they can
   *  park on right now, fly there and open its rules. */
  const onFindPark = useCallback(async () => {
    if (finding) return;
    setFinding(true);
    try {
      const at = await mapRef.current?.getUserLocation();
      if (!at) {
        flashToast('Turn on location to find parking near you.');
        return;
      }
      const found: ParkSuggestion | null = findNearestPark(classifiedStreets, statusById, at);
      if (found) {
        mapRef.current?.animateTo(found.center, true);
        handleSelect(found.street);
        flashToast(
          `${found.street.properties.name ?? 'Free spot'} — ${formatDistance(found.meters)} away` +
            ` · ${found.walkMin} min walk${found.limited ? ' · time limit' : ''}`,
        );
        return;
      }
      // Nothing free this minute — offer the spot that frees up soonest.
      const soon: SoonSuggestion | null = findSoonestPark(classifiedStreets, now, at);
      if (soon) {
        mapRef.current?.animateTo(soon.center, true);
        handleSelect(soon.street);
        flashToast(
          `Nothing free now — ${soon.street.properties.name ?? 'a spot'} frees in ${soon.inMin} min` +
            ` (${soon.at}) · ${formatDistance(soon.meters)} away`,
        );
        return;
      }
      flashToast('No free parking found within 1.5 km right now.');
    } finally {
      setFinding(false);
    }
  }, [finding, statusById, now, handleSelect, flashToast]);

  /** Report flow: always anchored to where the phone actually is. */
  const onOpenReport = useCallback(async () => {
    setTab('map');
    const at = await mapRef.current?.getUserLocation();
    if (!at) {
      flashToast('Turn on location to report a spot near you.');
      return;
    }
    const near = findNearestPark(classifiedStreets, statusById, at, 60);
    setReportAt({ at, streetId: near?.street.properties.id, streetName: near?.street.properties.name });
  }, [flashToast, setTab, statusById]);

  const onReported = useCallback((report: Report, message: string) => {
    if (report.id !== 'x') { addReport(report); countReport(); }
    setReportAt(null);
    flashToast(message);
  }, [addReport, countReport, flashToast]);

  /** "Park here" saves where the car is, then offers the timer. */
  const onSaveSpot = useCallback((street: StreetFeature) => {
    const center = featureCenter(street);
    setMySpot({
      latitude: center.latitude,
      longitude: center.longitude,
      streetId: street.properties.id,
      streetName: street.properties.name,
      savedAt: Date.now(),
    });
    flashToast(`Saved — your car is on ${street.properties.name ?? 'this street'}.`);
  }, [setMySpot, flashToast]);

  const onWalkBack = useCallback(() => {
    if (!mySpot) return;
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${mySpot.latitude},${mySpot.longitude}&dirflg=w`
      : `https://www.google.com/maps/dir/?api=1&destination=${mySpot.latitude},${mySpot.longitude}&travelmode=walking`;
    Linking.openURL(url);
  }, [mySpot]);

  const onStartTimer = useCallback(
    (street: StreetFeature, suggestedMin?: number) => {
      setTimerFor({ street, suggestedMin });
    },
    [],
  );

  /** How busy the selected street probably is, with its evidence. */
  const estimate: Availability | null = useMemo(() => {
    if (!selected) return null;
    return estimateAvailability({
      props: selected.properties,
      status: evaluateStreet(selected.properties, now).status,
      center: featureCenter(selected),
      reports,
      carParks: carparks?.facilities ?? [],
      now,
    });
  }, [selected, now, reports, carparks]);

  /** Streets free right now — scoped to the viewport once the user zooms in. */
  const freeNow = useMemo(() => {
    const zoomedIn = region.latitudeDelta <= SHOW_CLASSIFIED_MAX_DELTA;
    let n = 0;
    for (const f of classifiedStreets) {
      const s = statusById.get(f.properties.id);
      if (s !== 'free' && s !== 'free_limited') continue;
      if (zoomedIn && !featureInRegion(f, region)) continue;
      n++;
    }
    return { count: n, nearby: zoomedIn };
  }, [statusById, region]);

  return (
    <View style={styles.root}>
      <ParkingMap
        ref={mapRef}
        statusById={statusById}
        visibleIds={visibleIds}
        showUnknown={showUnknown}
        selectedId={selected?.properties.id ?? null}
        onSelect={handleSelect}
        onRegionChange={setRegion}
        initialRegion={SYDNEY_REGION}
        carparks={carparks?.facilities ?? []}
        reports={reports}
        mySpot={mySpot}
        councilCarParks={councilCarParks}
        freeCarParks={freeCarParks}
      />

      {Platform.OS !== 'web' && region.latitudeDelta > SHOW_CLASSIFIED_MAX_DELTA && (
        <View style={[styles.zoomHint, { top: insets.top + 10 }]}>
          <Text style={styles.zoomHintText}>Zoom in to see parking streets</Text>
        </View>
      )}

      <MySpotCardHost />

      {toast && (
        <View style={[styles.toast, { bottom: (selected ? 270 : 178) + insets.bottom }]} pointerEvents="none">
          <Text style={styles.toastText} numberOfLines={2}>{toast}</Text>
        </View>
      )}

      {/* right-side utilities — map only, clear of the tab bar */}
      <View
        style={[styles.fabs, { bottom: (selected ? 258 : 166) + insets.bottom }]}
        pointerEvents={tab === 'map' ? 'auto' : 'none'}
      >
        <Pressable
          style={styles.fab}
          onPress={() => mapRef.current?.animateToUser()}
          accessibilityLabel="Centre map on my location"
        >
          <Ionicons name="locate" size={19} color={colors.locate} />
        </Pressable>
        <Pressable
          style={styles.fab}
          onPress={() => showLegend(true)}
          accessibilityLabel="What the colours mean"
        >
          <Ionicons name="help-circle-outline" size={20} color={colors.text} />
        </Pressable>
      </View>


      <TimerPill />

      {/* Everything the thumb needs lives in one bottom stack: whatever is in
          context sits directly above the search bar, the way a maps app does
          it. Nothing overlays the top of the screen, so the map stays whole. */}
      <View
        style={[
          styles.bottom,
          // Sits above the tab bar, and rides up with the keyboard so the map
          // underneath stays exactly where the driver left it.
          { paddingBottom: (keyboard > 0 ? keyboard + 8 : insets.bottom + 70) },
        ]}
        pointerEvents="box-none"
      >
        {tab !== 'map' ? null : reportAt ? (
          <ReportSheet
            at={reportAt.at}
            streetId={reportAt.streetId}
            streetName={reportAt.streetName}
            onDone={onReported}
            onCancel={() => setReportAt(null)}
          />
        ) : selected ? (
          <StreetSheet
            street={selected}
            onStartTimer={onStartTimer}
            onSaveSpot={onSaveSpot}
            estimate={estimate}
            onExplainEstimate={() => setExplaining(true)}
          />
        ) : (
          <Pressable
            style={[styles.findBtn, finding && styles.findBtnBusy]}
            onPress={onFindPark}
            disabled={finding}
            accessibilityLabel="Find me a park"
          >
            <Ionicons name="navigate" size={15} color={colors.onAccent} />
            <Text style={styles.findBtnText}>
              {finding ? 'Finding a spot…' : 'Find me a park'}
            </Text>
          </Pressable>
        )}

        <SearchBar
          onGo={(r) => mapRef.current?.animateTo(r, !!r.streetId)}
          freeCount={freeNow.count}
          freeNearby={freeNow.nearby}
        />
      </View>

      <Panel
        onClose={() => setTab('map')}
        onWalkBack={onWalkBack}
        bottomInset={insets.bottom}
      />

      <TabBar
        active={tab}
        onChange={setTab}
        onReport={onOpenReport}
        bottomInset={insets.bottom}
      />

      {explaining && (
        <BusySheet
          estimate={estimate}
          streetName={selected?.properties.name}
          onClose={() => setExplaining(false)}
        />
      )}

      <WelcomeOverlay onFindPark={onFindPark} />
      <LegendModal />
      <TimerModal
        street={timerFor?.street ?? null}
        suggestedMin={timerFor?.suggestedMin}
        onClose={() => setTimerFor(null)}
      />

      <StatusBar style="dark" />
    </View>
  );
}

/** Positions the saved-spot card under the search bar. */
function MySpotCardHost() {
  const insets = useSafeAreaInsets();
  const spot = useStore((s) => s.mySpot);
  if (!spot) return null;
  return (
    <View style={{ position: 'absolute', top: insets.top + 10, left: 0, right: 0 }} pointerEvents="box-none">
      <MySpotCard />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

/** Single side gutter for every floating control, so nothing is off-grid. */
const GUTTER = 12;

/** Soft elevation. Premium map UIs separate layers with shadow, not borders. */
const shadow = (opacity: number, r: number, y: number) => elevate(opacity, r, y);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  // Bottom stack: the search bar always last, whatever is in context above it.
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 8 },
  // Self-sizing rather than a full-width slab: a primary action that spans the
  // screen reads as a web page's submit button, not as a control floating on a
  // map. Centred so the thumb finds it without looking.
  findBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 22,
    ...elevate(0.22, 20, 7),
  },
  findBtnBusy: { opacity: 0.55 },
  findBtnText: {
    color: colors.onAccent, fontSize: 15.5, fontWeight: '700', letterSpacing: -0.2,
  },
  toast: {
    position: 'absolute',
    left: GUTTER,
    right: GUTTER,
    backgroundColor: colors.text,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...elevate(0.2, 14, 5),
  },
  toastText: { color: colors.surface, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  fabs: { position: 'absolute', right: GUTTER, gap: 8 },
  // 48pt: Apple's minimum comfortable touch target, and big enough that the
  // glyph reads clearly against a busy map.
  fab: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.glassStrong,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassRim,
    ...elevate(0.12, 16, 4),
  },
  zoomHint: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.glassStrong,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...elevate(0.08, 10, 2),
  },
  zoomHintText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
});
