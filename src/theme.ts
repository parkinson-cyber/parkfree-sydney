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

/**
 * Palette: unbleached paper, in the MUJI sense — undyed cotton, cardboard,
 * warm greys, and dyes that look mixed from earth rather than printed. Nothing
 * is fully saturated and nothing is pure white or pure black.
 *
 * The map is the product, so the chrome is deliberately quiet: paper-toned
 * glass floating over a light basemap, letting the coloured streets carry all
 * the meaning. That is also why the accent is a muted sage rather than the old
 * neon green — on a light map a bright accent competes with the data.
 */
export const colors = {
  bg: '#F2EFE7',           // unbleached paper — the app's ground
  surface: '#FBF9F4',      // a sheet of lighter stock laid on it
  surfaceRaised: '#FFFFFF',
  border: '#DED8CB',       // a crease, not a rule
  text: '#2E2B26',         // soft charcoal, never #000
  textDim: '#7C776C',      // warm grey
  accent: '#6E8B5B',       // sage — "you can park here"
  accentDark: '#54704A',
  onAccent: '#FBF9F4',     // text on a sage button
  danger: '#A8574A',       // terracotta
  warning: '#B5813A',      // ochre
  premium: '#6A7A93',      // muted indigo

  /** Materials — translucent paper for glass layers. */
  glass: 'rgba(251,249,244,0.72)',
  glassStrong: 'rgba(251,249,244,0.88)',
  glassBorder: 'rgba(46,43,38,0.08)',
  scrim: 'rgba(46,43,38,0.32)',
};

/**
 * Map line colours per parking category. Deepened from the palette above so
 * they stay legible as thin lines on a light basemap — a muted colour that
 * reads beautifully as a large field disappears at 2px over pale grey roads.
 */
export const kindColors: Record<ParkingKind, string> = {
  free: '#4F7A3F',
  free_limited: '#7E9046',
  paid: '#B5813A',
  residents: '#6A7A93',
  no_parking: '#A8574A',
  no_stopping: '#8C3F35',
  unknown: '#BFB8AA',
};

/** Colours for the live (time-evaluated) status shown in the detail sheet. */
export const statusColors: Record<LiveStatus, string> = {
  free: '#4F7A3F',
  free_limited: '#7E9046',
  paid: '#B5813A',
  residents: '#6A7A93',
  banned: '#A8574A',
  unknown: '#8E887C',
};

export const statusLabels: Record<LiveStatus, string> = {
  free: 'FREE now',
  free_limited: 'Free now — time limit',
  paid: 'Paid now',
  residents: 'Residents only',
  banned: 'No parking now',
  unknown: 'Check signs',
};

/**
 * iOS-style elevation: a wide, very soft shadow and no border. Sheets on iOS
 * separate by depth, not by outline.
 */
export const shadow = (opacity = 0.12, radius = 24, y = 10) => ({
  shadowColor: '#2E2B26',
  shadowOpacity: opacity,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: y },
  elevation: Math.round(radius / 2),
});

/** Corner radii, iOS-ish: generous on sheets, tight on controls. */
export const radius = {
  sheet: 28,
  card: 18,
  control: 14,
  pill: 999,
};
