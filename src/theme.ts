import { Platform } from 'react-native';
import type { ParkingKind, LiveStatus } from './lib/types';

/**
 * San Francisco on Apple platforms, the platform default elsewhere. SF is what
 * makes dense UI read as native rather than as a web page in a wrapper — it is
 * optically tighter than Roboto at the same size, so pair it with the negative
 * tracking below on anything 17pt or larger.
 */
export const font = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
}) as string;

/** Apple tracks large text tighter and small text looser. */
export const tracking = {
  title: -0.45,
  body: -0.1,
  caption: 0.3,
};

export const colors = {
  bg: '#0F1115',
  surface: '#1A1D24',
  surfaceRaised: '#232733',
  border: '#2E3340',
  text: '#F4F6FA',
  textDim: '#9AA3B2',
  accent: '#34D399', // signature green — "free parking"
  accentDark: '#059669',
  danger: '#F87171',
  warning: '#FBBF24',
  premium: '#A78BFA',
};

/** Map line colours per parking category (static data classification). */
export const kindColors: Record<ParkingKind, string> = {
  free: '#22C55E',
  free_limited: '#84CC16',
  paid: '#F59E0B',
  residents: '#8B5CF6',
  no_parking: '#EF4444',
  no_stopping: '#B91C1C',
  unknown: '#5B6472',
};

/** Colours for the live (time-evaluated) status shown in the detail sheet. */
export const statusColors: Record<LiveStatus, string> = {
  free: '#22C55E',
  free_limited: '#84CC16',
  paid: '#F59E0B',
  residents: '#8B5CF6',
  banned: '#EF4444',
  unknown: '#9AA3B2',
};

export const statusLabels: Record<LiveStatus, string> = {
  free: 'FREE now',
  free_limited: 'Free now — time limit',
  paid: 'Paid now',
  residents: 'Residents only',
  banned: 'No parking now',
  unknown: 'Check signs',
};
