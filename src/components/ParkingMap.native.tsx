/**
 * Native map (iOS: Apple Maps, Android: Google Maps) rendering the parking
 * street network as colour-coded polylines with progressive detail.
 */

import React, {
  forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type Region as RNRegion } from 'react-native-maps';
import * as Location from 'expo-location';
import { classifiedStreets, unknownStreets, streetById } from '../lib/parkingData';
import { featureCenter, featureInRegion, nearestStreet } from '../lib/geo';
import { pShort } from '../lib/rules';
import { formatUpdated } from '../lib/carparks';
import { ago, isFreeKind } from '../lib/reports';
import { evaluateCarPark } from '../lib/councilCarparks';
import { freeBadge, freeDetail } from '../lib/freeCarparks';
import { colors, statusColors, kindColors } from '../theme';
import type { Region, StreetFeature } from '../lib/types';
import {
  availColor, availLabel,
  type ParkingMapHandle, type ParkingMapProps,
  SHOW_CLASSIFIED_MAX_DELTA, SHOW_UNKNOWN_MAX_DELTA,
} from './ParkingMap.shared';

const MAX_LINES = 1600;

/** Ask the OS where we are; null when permission is denied or the fix fails. */
async function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}

const ParkingMap = forwardRef<ParkingMapHandle, ParkingMapProps>(function ParkingMap(
  { statusById, visibleIds, showUnknown, selectedId, onSelect, onRegionChange, initialRegion, carparks, reports, mySpot, councilCarParks, freeCarParks, availById },
  ref,
) {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(initialRegion);

  useImperativeHandle(ref, () => ({
    animateTo(center, zoomedIn = true) {
      mapRef.current?.animateToRegion(
        {
          ...center,
          latitudeDelta: zoomedIn ? 0.012 : 0.03,
          longitudeDelta: zoomedIn ? 0.012 : 0.03,
        },
        450,
      );
    },
    fitBounds([west, south, east, north]) {
      // 25% of slack around the box so the suburb isn't jammed against the
      // bezel, and a floor on the span so a one-street suburb doesn't zoom
      // past the level at which streets are drawn at all.
      const latitudeDelta = Math.max((north - south) * 1.25, 0.008);
      const longitudeDelta = Math.max((east - west) * 1.25, 0.008);
      mapRef.current?.animateToRegion(
        {
          latitude: (north + south) / 2,
          longitude: (east + west) / 2,
          latitudeDelta,
          longitudeDelta,
        },
        600,
      );
    },
    getUserLocation: currentPosition,
    async animateToUser() {
      const at = await currentPosition();
      if (!at) return false;
      mapRef.current?.animateToRegion({ ...at, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 450);
      return true;
    },
  }));

  const visibleClassified = useMemo(() => {
    if (region.latitudeDelta > SHOW_CLASSIFIED_MAX_DELTA) return [];
    let list = classifiedStreets.filter((f) => featureInRegion(f, region));
    if (visibleIds) list = list.filter((f) => visibleIds.has(f.properties.id));
    return list.slice(0, MAX_LINES);
  }, [region, visibleIds]);

  const visibleUnknown = useMemo(() => {
    if (!showUnknown || visibleIds || region.latitudeDelta > SHOW_UNKNOWN_MAX_DELTA) return [];
    return unknownStreets.filter((f) => featureInRegion(f, region)).slice(0, MAX_LINES);
  }, [region, showUnknown, visibleIds]);

  const handleRegionChange = useCallback(
    (r: RNRegion) => {
      setRegion(r);
      onRegionChange(r);
    },
    [onRegionChange],
  );

  const handlePress = useCallback(
    (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      const pool = [...visibleClassified, ...visibleUnknown];
      const tapToleranceM = Math.max(25, region.latitudeDelta * 111320 * 0.02);
      onSelect(nearestStreet(pool, latitude, longitude, tapToleranceM));
    },
    [visibleClassified, visibleUnknown, region.latitudeDelta, onSelect],
  );

  const selected: StreetFeature | undefined = useMemo(
    () => (selectedId != null ? streetById(selectedId) : undefined),
    [selectedId],
  );

  // Time-limit pills ("2P", "½P"…), only when zoomed in enough to read them.
  const pLabels = useMemo(() => {
    if (region.latitudeDelta > 0.022) return [];
    return visibleClassified
      .map((f) => {
        const min = f.properties.left?.maxstayMin ?? f.properties.right?.maxstayMin;
        if (!min) return null;
        return { id: f.properties.id, label: pShort(min), ...featureCenter(f) };
      })
      .filter((x): x is { id: number; label: string; latitude: number; longitude: number } => !!x)
      .slice(0, 80);
  }, [visibleClassified, region.latitudeDelta]);

  /**
   * The availability estimate, drawn on the street it belongs to. The caller
   * has already decided which streets are worth it; this just places them at
   * the true midpoint so a long street's number is not sitting on the corner.
   */
  const availPins = useMemo(() => {
    if (availById.size === 0) return [];
    const out: { id: number; label: string; color: string; latitude: number; longitude: number }[] = [];
    for (const f of visibleClassified) {
      const score = availById.get(f.properties.id);
      if (score == null) continue;
      out.push({
        id: f.properties.id,
        label: availLabel(score),
        color: availColor(score),
        ...featureCenter(f),
      });
      if (out.length >= 80) break;
    }
    return out;
  }, [visibleClassified, availById]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      onRegionChangeComplete={handleRegionChange}
      onPress={handlePress}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      userInterfaceStyle="light"
    >
      {visibleUnknown.map((f) => (
        <Polyline
          key={f.properties.id}
          coordinates={f.geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon }))}
          strokeColor={kindColors.unknown + 'B3'}
          strokeWidth={2}
          tappable={false}
        />
      ))}
      {visibleClassified.map((f) => {
        const status = statusById.get(f.properties.id) ?? 'unknown';
        return (
          <Polyline
            key={f.properties.id}
            coordinates={f.geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon }))}
            strokeColor={statusColors[status]}
            strokeWidth={4}
            tappable={false}
          />
        );
      })}
      {selected && (
        <Polyline
          coordinates={selected.geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon }))}
          strokeColor={colors.text}
          strokeWidth={7}
        />
      )}
      {region.latitudeDelta <= 0.045 && freeCarParks
        .filter((c) => c.latitude > region.latitude - region.latitudeDelta
          && c.latitude < region.latitude + region.latitudeDelta
          && c.longitude > region.longitude - region.longitudeDelta
          && c.longitude < region.longitude + region.longitudeDelta)
        .slice(0, 120)
        .map((c) => (
          <Marker
            key={c.id}
            coordinate={{ latitude: c.latitude, longitude: c.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            title={c.name}
            description={freeDetail(c)}
          >
            <View style={styles.freePill}><Text style={styles.freeText}>P {freeBadge(c)}</Text></View>
          </Marker>
        ))}
      {region.latitudeDelta <= 0.35 && councilCarParks.map((c) => {
        const ev = evaluateCarPark(c, new Date());
        return (
          <Marker
            key={c.id}
            coordinate={{ latitude: c.latitude, longitude: c.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            title={c.name}
            description={`${ev.detail}${c.openingHours ? ` · ${c.openingHours}` : ''}`}
          >
            <View style={[styles.cpPill, !ev.freeNow && styles.cpPillPaid]}>
              <Text style={styles.cpText}>P {ev.badge}</Text>
            </View>
          </Marker>
        );
      })}
      {mySpot && (
        <Marker
          coordinate={{ latitude: mySpot.latitude, longitude: mySpot.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          title="Your car"
          description={mySpot.streetName ?? undefined}
        >
          <View style={styles.spotPin}><Text style={styles.spotPinText}>🅿️</Text></View>
        </Marker>
      )}
      {reports.map((r) => (
        <Marker
          key={r.id}
          coordinate={{ latitude: r.latitude, longitude: r.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          title={isFreeKind(r.kind) ? 'Someone left a space' : 'Reported full'}
          description={`${r.streetName ? r.streetName + ' · ' : ''}${ago(r.reportedAt)}`}
        >
          <View style={[styles.reportPin, !isFreeKind(r.kind) && styles.reportPinFull]}>
            <Text style={styles.reportPinText}>{isFreeKind(r.kind) ? '✓' : '✕'}</Text>
          </View>
        </Marker>
      ))}
      {region.latitudeDelta <= 0.35 && carparks.map((c) => (
        <Marker
          key={`cp-${c.id}`}
          coordinate={{ latitude: c.latitude, longitude: c.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          title={c.name}
          description={`${c.free} of ${c.spots} spaces free · TfNSW estimate, updated ${formatUpdated(c.at)}`}
        >
          <View style={[styles.cpPill, c.free === 0 && styles.cpPillFull]}>
            <Text style={styles.cpText}>P {c.free} free</Text>
          </View>
        </Marker>
      ))}
      {pLabels.map((p) => (
        <Marker
          key={`p-${p.id}`}
          coordinate={{ latitude: p.latitude, longitude: p.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          onPress={() => onSelect(streetById(p.id) ?? null)}
        >
          <View style={styles.pPill}>
            <Text style={styles.pText}>{p.label}</Text>
          </View>
        </Marker>
      ))}

      {/* Sits below the time-limit pill rather than on it: the limit is a rule
          and the percentage is a guess, so they must not read as one label. */}
      {availPins.map((a) => (
        <Marker
          key={`a-${a.id}`}
          coordinate={{ latitude: a.latitude, longitude: a.longitude }}
          anchor={{ x: 0.5, y: -0.35 }}
          tracksViewChanges={false}
          onPress={() => onSelect(streetById(a.id) ?? null)}
        >
          <View style={[styles.availPill, { borderColor: a.color }]}>
            <Text style={[styles.availText, { color: a.color }]}>{a.label}</Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
});

const styles = StyleSheet.create({
  // Outlined rather than filled, and a size down from the time-limit pill:
  // an estimate should look lighter on the map than a rule does.
  availPill: {
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  availText: { fontSize: 10, fontWeight: '700', letterSpacing: -0.1 },
  pPill: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  // Live Park&Ride pin — solid accent so it reads as "a place with N spaces",
  // not as another street rule.
  cpPill: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  cpPillFull: { backgroundColor: colors.danger },
  cpPillPaid: { backgroundColor: colors.warning },
  // Quieter than a council car park: free, but usually conditional on being a
  // customer, so it should not shout as loudly as a public facility.
  freePill: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.accent, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2,
  },
  freeText: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  cpText: { color: colors.onAccent, fontSize: 11, fontWeight: '700' },
  // Crowd reports are round badges — a different shape from the rule lines and
  // the car-park pills, because they mean "a person said so", not "a sign says".
  reportPin: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface,
  },
  reportPinFull: { backgroundColor: colors.danger },
  reportPinText: { color: colors.onAccent, fontSize: 13, fontWeight: '800' },
  spotPin: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.text,
  },
  spotPinText: { fontSize: 15 },
});

export default ParkingMap;
