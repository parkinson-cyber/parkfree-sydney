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

  /** Time-travel offset in minutes from now (0 = live). Drives the time slider:
   *  the whole map re-evaluates at now + offset, so you can see which streets
   *  will be free when you actually get there. */
  timeOffsetMin: number;
  setTimeOffset: (min: number) => void;

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

  timeOffsetMin: 0,
  setTimeOffset: (timeOffsetMin) => set({ timeOffsetMin }),

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

  legendVisible: false,
  showLegend: (legendVisible) => set({ legendVisible }),

  onboarded: null,
  setOnboarded: () => {
    set({ onboarded: true });
    AsyncStorage.setItem(ONBOARDED_KEY, 'true');
  },

  hydrate: async () => {
    try {
      const [timerRaw, onboardedRaw] = await Promise.all([
        AsyncStorage.getItem(TIMER_KEY),
        AsyncStorage.getItem(ONBOARDED_KEY),
      ]);
      const updates: Partial<AppState> = {
        premium: true, // free for everyone — see note above
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

/**
 * The clock the map is drawn against: real time, shifted by the time-slider
 * offset. Every rule evaluation in the UI goes through this, so "now" and
 * "9pm tonight" share one code path.
 */
export function useViewNow(): Date {
  const now = useStore((s) => s.now);
  const offset = useStore((s) => s.timeOffsetMin);
  return offset === 0 ? now : new Date(now.getTime() + offset * 60_000);
}
