import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Region, StreetFeature } from '../lib/types';
import { purchases } from '../purchases';

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

  legendVisible: boolean;
  showLegend: (v: boolean) => void;

  /** null until hydrated — the welcome overlay shows only when explicitly false. */
  onboarded: boolean | null;
  setOnboarded: () => void;

  hydrate: () => Promise<void>;
}

const TIMER_KEY = 'parkfree.timer';
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

  premium: false,
  setPremium: (premium) => set({ premium }),
  paywallVisible: false,
  showPaywall: (paywallVisible) => set({ paywallVisible }),

  timer: null,
  setTimer: (timer) => {
    set({ timer });
    if (timer) AsyncStorage.setItem(TIMER_KEY, JSON.stringify(timer));
    else AsyncStorage.removeItem(TIMER_KEY);
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
      const [premium, timerRaw, onboardedRaw] = await Promise.all([
        purchases.getPremiumStatus(),
        AsyncStorage.getItem(TIMER_KEY),
        AsyncStorage.getItem(ONBOARDED_KEY),
      ]);
      const updates: Partial<AppState> = {
        premium,
        onboarded: onboardedRaw === 'true',
      };
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
