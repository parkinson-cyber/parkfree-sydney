/**
 * Live commuter car-park occupancy (TfNSW Park&Ride), refreshed hourly by
 * .github/workflows/carparks-live.yml into the `data-live` branch.
 *
 * This is the one genuinely live signal on the map, and it is an *estimate*
 * (TfNSW's words) — the sheet says so. Anything older than STALE_MS is
 * treated as absent rather than shown as current.
 */

import { useEffect, useState } from 'react';

export interface CarPark {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  spots: number;
  occupied: number;
  free: number;
  /** ISO time of the operator's last count. */
  at: string;
}

export interface CarParkFeed {
  updated: string;
  source: string;
  facilities: CarPark[];
}

export const CARPARKS_URL =
  'https://raw.githubusercontent.com/parkinson-cyber/parkfree-sydney/data-live/carparks.json';

const STALE_MS = 3 * 60 * 60 * 1000;
const REFRESH_MS = 10 * 60 * 1000;

export async function fetchCarparks(): Promise<CarParkFeed | null> {
  try {
    const res = await fetch(`${CARPARKS_URL}?t=${Math.floor(Date.now() / REFRESH_MS)}`);
    if (!res.ok) return null;
    const feed = (await res.json()) as CarParkFeed;
    if (!Array.isArray(feed.facilities)) return null;
    if (Date.now() - Date.parse(feed.updated) > STALE_MS) return null;
    return feed;
  } catch {
    return null;
  }
}

/** "9:04pm" in Sydney time, for "updated …" labels. */
export function formatUpdated(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-AU', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney',
  }).toLowerCase().replace(' ', '');
}

export function useCarparks(): CarParkFeed | null {
  const [feed, setFeed] = useState<CarParkFeed | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next = await fetchCarparks();
      if (alive) setFeed(next);
    };
    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);
  return feed;
}
