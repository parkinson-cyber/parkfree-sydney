/**
 * Crowd reports — people marking a space free or taken, right now.
 *
 * Backend: api/reports.js on the same Vercel deployment. Reports are shown
 * as reports (a car pin with "free · 3 min ago"), never folded into a
 * street's rules: inferred or crowd data must not look like a sign.
 */

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Region } from './types';

export type { ReportKind, Report } from './reportKinds';
export { isFreeKind } from './reportKinds';

import type { Report, ReportKind } from './reportKinds';

export const API_BASE =
  Platform.OS === 'web' && typeof window !== 'undefined' && /^https?:/.test(window.location.origin) && !/localhost|127\.0\.0\.1/.test(window.location.host)
    ? `${window.location.origin}/api`
    : 'https://parkfree-sydney.vercel.app/api';

const DEVICE_KEY = 'parkfree.deviceId';
let deviceIdCache: string | null = null;

/** Anonymous per-install id — no account, no sign-in. */
export async function deviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache;
  try {
    const existing = await AsyncStorage.getItem(DEVICE_KEY);
    if (existing) return (deviceIdCache = existing);
  } catch { /* fall through */ }
  const fresh = `d_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try { await AsyncStorage.setItem(DEVICE_KEY, fresh); } catch { /* memory only */ }
  return (deviceIdCache = fresh);
}

export async function fetchReportsNear(center: { latitude: number; longitude: number }, radius = 1500): Promise<Report[]> {
  try {
    const url = `${API_BASE}/reports?lat=${center.latitude}&lon=${center.longitude}&radius=${radius}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as { reports: Report[] };
    const now = Date.now();
    return (json.reports ?? []).filter((r) => Date.parse(r.expiresAt) > now);
  } catch {
    return [];
  }
}

export type PostResult = 'ok' | 'rate_limited' | 'outside' | 'error';

export async function postReport(input: {
  latitude: number; longitude: number; kind: ReportKind; streetId?: number; streetName?: string;
}): Promise<{ result: PostResult; report?: Report; live?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: input.latitude, lon: input.longitude, kind: input.kind,
        streetId: input.streetId, streetName: input.streetName,
        deviceId: await deviceId(),
      }),
    });
    if (res.status === 429) return { result: 'rate_limited' };
    if (res.status === 422) return { result: 'outside' };
    if (!res.ok) return { result: 'error' };
    const json = (await res.json()) as { report: Report; live?: boolean };
    return { result: 'ok', report: json.report, live: json.live };
  } catch {
    return { result: 'error' };
  }
}

/** "3 min ago" */
export function ago(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return min === 0 ? 'just now' : min === 1 ? '1 min ago' : `${min} min ago`;
}

/** Poll reports around the map centre while the map is open. */
export function useReports(region: Region, everyMs = 30000): [Report[], (r: Report) => void] {
  const [reports, setReports] = useState<Report[]>([]);
  const centerRef = useRef({ latitude: region.latitude, longitude: region.longitude });
  centerRef.current = { latitude: region.latitude, longitude: region.longitude };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next = await fetchReportsNear(centerRef.current, 2500);
      if (alive) setReports(next);
    };
    load();
    const iv = setInterval(load, everyMs);
    return () => { alive = false; clearInterval(iv); };
  }, [everyMs]);

  // refetch when the map moves a long way
  const lastRef = useRef(centerRef.current);
  useEffect(() => {
    const d = Math.hypot(region.latitude - lastRef.current.latitude, region.longitude - lastRef.current.longitude);
    if (d > 0.01) {
      lastRef.current = { latitude: region.latitude, longitude: region.longitude };
      fetchReportsNear(lastRef.current, 2500).then(setReports);
    }
  }, [region.latitude, region.longitude]);

  const add = (r: Report) => setReports((prev) => [r, ...prev.filter((x) => x.id !== r.id)]);
  return [reports, add];
}
