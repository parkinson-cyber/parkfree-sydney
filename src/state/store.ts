import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Region, StreetFeature } from '../lib/types';
// import { purchases } from '../purchases'; // re-enable if a paid tier comes back

export const SYDNEY_REGION: Region = {
  latitude: -33.8845,
  longitude: 151.207,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

export interface ActiveTimer {
  /** Epoch ms when the parking expires. */
  expiresAt: number;
  streetName?: string;
  latitude: number;
  longitude: number;
  notificationId?: string;
}

export type StatusFilter = 'all' | 'free_now' | 'free_anytime';

/** Which bottom-bar section is showing. The map stays mounted underneath. */
export type Tab = 'map' | 'saved' | 'settings' | 'profile';

/** Where I left the car. Local-first; nothing leaves the phone unless the
 *  user chose to share a "parked" report. */
export interface SavedSpot {
  latitude: number;
  longitude: number;
  streetId?: number;
  streetName?: string;
  savedAt: number;
  note?: string;
}

interface AppState {
  region: Region;
  setRegion: (r: Region) => void;

  selected: StreetFeature | null;
  select: (f: StreetFeature | null) => void;

  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  showUnknown: boolean;
  setShowUnknown: (v: boolean) => void;

  /** Ticks every 30 s so "free now" stays live. */
  now: Date;
  tick: () => void;

  premium: boolean;
  setPremium: (v: boolean) => void;
  paywallVisible: boolean;
  showPaywall: (v: boolean) => void;

  timer: ActiveTimer | null;
  setTimer: (t: ActiveTimer | null) => void;

  mySpot: SavedSpot | null;
  setMySpot: (s: SavedSpot | null) => void;

  tab: Tab;
  setTab: (t: Tab) => void;

  /** How many reports this device has contributed. Local, for encouragement. */
  reportsMade: number;
  countReport: () => void;

  legendVisible: boolean;
  showLegend: (v: boolean) => void;

  /** null until hydrated — the welcome overlay shows only when explicitly false. */
  onboarded: boolean | null;
  setOnboarded: () => void;

  hydrate: () => Promise<void>;
}

const TIMER_KEY = 'parkfree.timer';
const SPOT_KEY = 'parkfree.myspot';
const REPORTS_KEY = 'parkfree.reportsMade';
const ONBOARDED_KEY = 'parkfree.onboarded';

export const useStore = create<AppState>((set, get) => ({
  region: SYDNEY_REGION,
  setRegion: (region) => set({ region }),

  selected: null,
  select: (selected) => set({ selected }),

  filter: 'all',
  setFilter: (filter) => set({ filter }),
  showUnknown: true,
  setShowUnknown: (showUnknown) => set({ showUnknown }),

  now: new Date(),
  tick: () => set({ now: new Date() }),

  // Everything is free — no paid tier while we grow the user base and
  // gather parking data. Flip back to false (and restore the purchases
  // lookup in hydrate) if a premium tier ever returns.
  premium: true,
  setPremium: (premium) => set({ premium }),
  paywallVisible: false,
  showPaywall: (paywallVisible) => set({ paywallVisible }),

  timer: null,
  setTimer: (timer) => {
    set({ timer });
    if (timer) AsyncStorage.setItem(TIMER_KEY, JSON.stringify(timer));
    else AsyncStorage.removeItem(TIMER_KEY);
  },

  mySpot: null,
  setMySpot: (mySpot) => {
    set({ mySpot });
    if (mySpot) AsyncStorage.setItem(SPOT_KEY, JSON.stringify(mySpot));
    else AsyncStorage.removeItem(SPOT_KEY);
  },

  tab: 'map',
  setTab: (tab) => set({ tab }),

  reportsMade: 0,
  countReport: () => {
    const next = get().reportsMade + 1;
    set({ reportsMade: next });
    AsyncStorage.setItem(REPORTS_KEY, String(next));
  },

  legendVisible: false,
  showLegend: (legendVisible) => set({ legendVisible }),

  onboarded: null,
  setOnboarded: () => {
    set({ onboarded: true });
    AsyncStorage.setItem(ONBOARDED_KEY, 'true');
  },

  hydrate: async () => {
    try {
      const [timerRaw, onboardedRaw, spotRaw, reportsRaw] = await Promise.all([
        AsyncStorage.getItem(TIMER_KEY),
        AsyncStorage.getItem(ONBOARDED_KEY),
        AsyncStorage.getItem(SPOT_KEY),
        AsyncStorage.getItem(REPORTS_KEY),
      ]);
      const updates: Partial<AppState> = {
        premium: true, // free for everyone — see note above
        onboarded: onboardedRaw === 'true',
        reportsMade: Number(reportsRaw) || 0,
      };
      if (spotRaw) {
        const spot: SavedSpot = JSON.parse(spotRaw);
        // a spot older than a day is almost certainly stale
        if (Date.now() - spot.savedAt < 24 * 3600 * 1000) updates.mySpot = spot;
        else AsyncStorage.removeItem(SPOT_KEY);
      }
      if (timerRaw) {
        const timer: ActiveTimer = JSON.parse(timerRaw);
        if (timer.expiresAt > Date.now()) updates.timer = timer;
        else AsyncStorage.removeItem(TIMER_KEY);
      }
      set(updates);
    } catch {
      // first launch / storage unavailable — defaults are fine
      set({ onboarded: false });
    }
  },
}));
