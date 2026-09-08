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
import { colors, statusColors, kindColors } from '../theme';
import type { Region, StreetFeature } from '../lib/types';
import {
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
  { statusById, visibleIds, showUnknown, selectedId, onSelect, onRegionChange, initialRegion, carparks, reports, mySpot, councilCarParks },
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
      userInterfaceStyle="dark"
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
          strokeColor="#FFFFFF"
          strokeWidth={7}
        />
      )}
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
    </MapView>
  );
});

const styles = StyleSheet.create({
  pPill: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  pText: { color: colors.text, fontSize: 11, fontWeight: '800' },
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
  cpText: { color: '#0F1115', fontSize: 11, fontWeight: '800' },
  // Crowd reports are round badges — a different shape from the rule lines and
  // the car-park pills, because they mean "a person said so", not "a sign says".
  reportPin: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0F1115',
  },
  reportPinFull: { backgroundColor: colors.danger },
  reportPinText: { color: '#0F1115', fontSize: 13, fontWeight: '900' },
  spotPin: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.text,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.accent,
  },
  spotPinText: { fontSize: 15 },
});

export default ParkingMap;
