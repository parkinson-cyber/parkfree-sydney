/**
 * ParkFree Sydney — find free street parking, live.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import ParkingMap from './src/components/ParkingMap';
import {
  type ParkingMapHandle, SHOW_CLASSIFIED_MAX_DELTA,
} from './src/components/ParkingMap.shared';
import { SearchBar } from './src/components/SearchBar';
import { FilterBar } from './src/components/FilterBar';
import { StreetSheet } from './src/components/StreetSheet';
import { LegendModal } from './src/components/LegendModal';
import { PaywallModal } from './src/components/PaywallModal';
import { TimerModal, TimerPill } from './src/components/ParkingTimer';
import { WelcomeOverlay } from './src/components/WelcomeOverlay';

import * as Haptics from 'expo-haptics';

import { classifiedStreets } from './src/lib/parkingData';
import { featureInRegion } from './src/lib/geo';
import { evaluateStreet } from './src/lib/rules';
import {
  findNearestPark, findSoonestPark, formatDistance,
  type ParkSuggestion, type SoonSuggestion,
} from './src/lib/findPark';
import { colors } from './src/theme';
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
  const premium = useStore((s) => s.premium);
  const showPaywall = useStore((s) => s.showPaywall);
  const showLegend = useStore((s) => s.showLegend);
  const hydrate = useStore((s) => s.hydrate);

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

  const onStartTimer = useCallback(
    (street: StreetFeature, suggestedMin?: number) => {
      if (!premium) {
        showPaywall(true);
        return;
      }
      setTimerFor({ street, suggestedMin });
    },
    [premium, showPaywall],
  );

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
      />

      {/* top overlays */}
      <View style={[styles.top, { paddingTop: insets.top + 8, pointerEvents: 'box-none' }]}>
        <View style={[styles.brandRow, { pointerEvents: 'box-none' }]}>
          <View style={styles.brand}>
            <Text style={styles.brandText}>
              Park<Text style={{ color: colors.accent }}>Free</Text>
            </Text>
            <Text style={styles.brandSub}>SYDNEY</Text>
          </View>
          <View style={styles.freeNow}>
            <View style={styles.freeNowDot} />
            <Text style={styles.freeNowText}>
              {freeNow.count} free {freeNow.nearby ? 'nearby' : 'now'}
            </Text>
          </View>
          <Pressable
            style={[styles.premiumBtn, premium && styles.premiumBtnActive]}
            onPress={() => showPaywall(true)}
          >
            <Text style={styles.premiumBtnText}>{premium ? '★' : '☆'}</Text>
          </Pressable>
        </View>
        <SearchBar onGo={(r) => mapRef.current?.animateTo(r, !!r.streetId)} />
        <FilterBar />
        {Platform.OS !== 'web' && region.latitudeDelta > SHOW_CLASSIFIED_MAX_DELTA && (
          <View style={styles.zoomHint}>
            <Text style={styles.zoomHintText}>Zoom in to see parking streets</Text>
          </View>
        )}
      </View>

      {toast && (
        <View style={[styles.toast, { bottom: selected ? 340 : 108 + insets.bottom }]} pointerEvents="none">
          <Text style={styles.toastText} numberOfLines={2}>{toast}</Text>
        </View>
      )}

      {/* the app's headline action — always reachable */}
      {!selected && (
        <Pressable
          style={[styles.findBtn, { bottom: 40 + insets.bottom }, finding && styles.findBtnBusy]}
          onPress={onFindPark}
          disabled={finding}
        >
          <Text style={styles.findBtnText}>
            {finding ? 'Finding…' : '✨ Find me a park'}
          </Text>
        </Pressable>
      )}

      {/* right-side floating buttons */}
      <View style={[styles.fabs, { bottom: selected ? 330 : 40 + insets.bottom }]}>
        <Pressable style={styles.fab} onPress={() => mapRef.current?.animateToUser()}>
          <Text style={styles.fabText}>📍</Text>
        </Pressable>
        <Pressable style={styles.fab} onPress={() => showLegend(true)}>
          <Text style={styles.fabText}>ℹ️</Text>
        </Pressable>
      </View>

      <TimerPill />
      {selected && <StreetSheet street={selected} onStartTimer={onStartTimer} />}

      <WelcomeOverlay onFindPark={onFindPark} />
      <LegendModal />
      <PaywallModal />
      <TimerModal
        street={timerFor?.street ?? null}
        suggestedMin={timerFor?.suggestedMin}
        onClose={() => setTimerFor(null)}
      />

      <StatusBar style="light" />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 10,
    gap: 10,
  },
  brand: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  brandText: {
    color: colors.text, fontSize: 22, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 6,
  },
  brandSub: {
    color: colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 6,
  },
  freeNow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(15,17,21,0.85)',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.border,
    marginLeft: 'auto',
  },
  freeNowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  freeNowText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  premiumBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(15,17,21,0.85)',
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  premiumBtnActive: { borderColor: colors.premium },
  premiumBtnText: { color: colors.premium, fontSize: 16 },
  findBtn: {
    position: 'absolute',
    left: 14,
    // clear of the right-hand FAB stack
    right: 74,
    backgroundColor: colors.accent,
    borderRadius: 26,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  findBtnBusy: { opacity: 0.6 },
  findBtnText: { color: '#04291B', fontSize: 16, fontWeight: '800' },
  toast: {
    position: 'absolute',
    left: 14,
    right: 14,
    backgroundColor: 'rgba(26,29,36,0.96)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  toastText: { color: colors.text, fontSize: 13.5, fontWeight: '600', textAlign: 'center' },
  fabs: { position: 'absolute', right: 14, gap: 10 },
  fab: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabText: { fontSize: 18 },
  zoomHint: {
    alignSelf: 'center',
    marginTop: 10,
    backgroundColor: 'rgba(15,17,21,0.85)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  zoomHintText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
});
