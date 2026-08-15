/**
 * Web map (MapLibre GL) — powers the browser dev preview with the exact same
 * data and behaviour as the native map. Uses the free Carto dark basemap.
 */

import React, {
  forwardRef, useEffect, useImperativeHandle, useMemo, useRef,
} from 'react';
import { View } from 'react-native';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { allStreets, streetById } from '../lib/parkingData';
import { pShort } from '../lib/rules';
import { statusColors, kindColors } from '../theme';
import type { Region } from '../lib/types';

/** Static sign-style time-limit label per street id (e.g. "2P"). */
const P_LABEL_BY_ID = new Map<number, string>();
for (const f of allStreets) {
  const min = f.properties.left?.maxstayMin ?? f.properties.right?.maxstayMin;
  if (min) P_LABEL_BY_ID.set(f.properties.id, pShort(min));
}
import type { ParkingMapHandle, ParkingMapProps } from './ParkingMap.shared';

/** Browser geolocation; null when unsupported, denied or timed out. */
function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

const BASEMAP: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
};

function regionFromMap(map: maplibregl.Map): Region {
  const b = map.getBounds();
  const c = map.getCenter();
  return {
    latitude: c.lat,
    longitude: c.lng,
    latitudeDelta: b.getNorth() - b.getSouth(),
    longitudeDelta: b.getEast() - b.getWest(),
  };
}

// data-driven colour via the generated per-feature "status" property
const STATUS_COLOR_EXPR = ['match', ['get', 'status'],
  'free', statusColors.free,
  'free_limited', statusColors.free_limited,
  'paid', statusColors.paid,
  'residents', statusColors.residents,
  'banned', statusColors.banned,
  kindColors.unknown,
] as maplibregl.ExpressionSpecification;

const ParkingMap = forwardRef<ParkingMapHandle, ParkingMapProps>(function ParkingMap(
  { statusById, visibleIds, showUnknown, selectedId, onSelect, onRegionChange, initialRegion },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);

  const geojson = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: allStreets.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          status:
            f.properties.cat === 'unknown'
              ? 'unknown'
              : statusById.get(f.properties.id) ?? 'unknown',
          known: f.properties.cat !== 'unknown',
          pass: visibleIds ? visibleIds.has(f.properties.id) : true,
          plabel: P_LABEL_BY_ID.get(f.properties.id) ?? '',
        },
      })),
    };
  }, [statusById, visibleIds]);

  // latest state, readable from the deferred 'load' handler without stale closures
  const geojsonRef = useRef(geojson);
  geojsonRef.current = geojson;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const unknownVisibleRef = useRef(showUnknown && !visibleIds);
  unknownVisibleRef.current = showUnknown && !visibleIds;

  useImperativeHandle(ref, () => ({
    animateTo(center, zoomedIn = true) {
      mapRef.current?.flyTo({
        center: [center.longitude, center.latitude],
        zoom: zoomedIn ? 16 : 14.2,
        duration: 700,
      });
    },
    getUserLocation: currentPosition,
    async animateToUser() {
      const at = await currentPosition();
      if (!at) return false;
      mapRef.current?.flyTo({ center: [at.longitude, at.latitude], zoom: 16, duration: 700 });
      return true;
    },
  }));

  // init once — deferred until the container has been laid out (RN-web
  // measures asynchronously; creating a MapLibre map in a 0×0 container
  // leaves it permanently stuck before its style ever loads).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    let disposed = false;
    let map: maplibregl.Map | null = null;
    let ro: ResizeObserver | null = null;

    const create = () => {
      if (disposed || mapRef.current) return;
      map = buildMap(el);
      mapRef.current = map;
      ro = new ResizeObserver(() => map?.resize());
      ro.observe(el);
    };

    // Poll layout with a timer (not ResizeObserver / rAF — those are paused
    // in hidden tabs, and RN-web lays out asynchronously).
    let poll: ReturnType<typeof setInterval> | null = null;
    const tryCreate = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        if (poll) clearInterval(poll);
        poll = null;
        create();
      }
    };
    tryCreate();
    if (!mapRef.current) {
      poll = setInterval(tryCreate, 150);
    }

    return () => {
      disposed = true;
      if (poll) clearInterval(poll);
      ro?.disconnect();
      map?.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildMap(el: HTMLDivElement): maplibregl.Map {
    const map = new maplibregl.Map({
      container: el,
      style: BASEMAP,
      center: [initialRegion.longitude, initialRegion.latitude],
      zoom: 14.2,
      attributionControl: { compact: true },
    });
    if (process.env.NODE_ENV !== 'production') {
      map.on('error', (e) => console.warn('[map error]', e.error?.message ?? e));
    }

    map.on('load', () => {
      map.addSource('streets', { type: 'geojson', data: geojsonRef.current as any });

      map.addLayer({
        id: 'streets-unknown',
        type: 'line',
        source: 'streets',
        filter: ['==', ['get', 'known'], false],
        // Was 14.8 — invisible until zoomed in almost to street level, which
        // made every uncategorized suburb (i.e. most of the 30km disc outside
        // inner Sydney, where OSM's parking:lane tagging is sparse) look like
        // a data hole when it's actually fetched, just hidden. 8 shows the
        // whole road network from a whole-of-Sydney zoom.
        minzoom: 8,
        paint: {
          'line-color': kindColors.unknown,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 1, 16, 2],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.35, 13, 0.55],
        },
        layout: { 'line-cap': 'round' },
      });
      map.addLayer({
        id: 'streets-classified',
        type: 'line',
        source: 'streets',
        filter: ['all', ['==', ['get', 'known'], true], ['==', ['get', 'pass'], true]],
        paint: {
          'line-color': STATUS_COLOR_EXPR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 4.5, 18, 7],
          'line-opacity': 0.9,
        },
        layout: { 'line-cap': 'round' },
      });
      map.addLayer({
        id: 'streets-selected',
        type: 'line',
        source: 'streets',
        filter: ['==', ['get', 'id'], -1],
        paint: { 'line-color': '#FFFFFF', 'line-width': 7, 'line-opacity': 0.95 },
        layout: { 'line-cap': 'round' },
      });
      // Time-limit labels ("2P", "½P"…) hugging the streets that have one.
      map.addLayer({
        id: 'streets-plabel',
        type: 'symbol',
        source: 'streets',
        minzoom: 13.5,
        filter: ['all', ['!=', ['get', 'plabel'], ''], ['==', ['get', 'pass'], true]],
        layout: {
          'symbol-placement': 'line-center',
          'text-field': ['get', 'plabel'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 13.5, 11, 18, 16],
          'text-allow-overlap': false,
          'text-padding': 4,
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': '#0F1115',
          'text-halo-width': 1.6,
        },
      });

      // apply whatever state changed while the style was loading
      map.setLayoutProperty(
        'streets-unknown', 'visibility',
        unknownVisibleRef.current ? 'visible' : 'none',
      );
      map.setFilter('streets-selected', ['==', ['get', 'id'], selectedIdRef.current ?? -1]);

      loadedRef.current = true;
      onRegionChange(regionFromMap(map));
    });

    map.on('moveend', () => onRegionChange(regionFromMap(map)));

    map.on('click', (e) => {
      const hits = map.queryRenderedFeatures(
        [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]],
        { layers: ['streets-classified', 'streets-unknown'] },
      );
      const id = hits[0]?.properties?.id as number | undefined;
      onSelect(id != null ? streetById(id) ?? null : null);
    });

    return map;
  }

  // keep data in sync (live status ticks, filter changes)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource('streets') as maplibregl.GeoJSONSource | undefined)?.setData(geojson as any);
  }, [geojson]);

  // unknown-layer visibility toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.setLayoutProperty(
      'streets-unknown', 'visibility',
      showUnknown && !visibleIds ? 'visible' : 'none',
    );
  }, [showUnknown, visibleIds]);

  // selected street highlight
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.setFilter('streets-selected', ['==', ['get', 'id'], selectedId ?? -1]);
  }, [selectedId]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </View>
  );
});

export default ParkingMap;
