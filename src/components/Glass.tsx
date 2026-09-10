/**
 * A pane of frosted paper.
 *
 * On iOS this is a real UIVisualEffectView, which is what makes a sheet feel
 * native — the map genuinely blurs and shifts underneath as it moves, rather
 * than sitting behind a flat translucent rectangle. Android and web get the
 * closest honest approximation: web adds a CSS backdrop blur, Android falls
 * back to the translucent fill.
 */

import React from 'react';
import { Platform, StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from '../theme';

export function Glass({
  children, style, intensity = 30, strong = false,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  /** Use over busy map detail, where a light frost isn't enough to read against. */
  strong?: boolean;
}) {
  const fill = strong ? colors.glassStrong : colors.glass;

  if (Platform.OS === 'ios') {
    return (
      <BlurView
        intensity={intensity}
        tint="light"
        style={[styles.base, style]}
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: strong ? 'rgba(251,249,244,0.55)' : 'rgba(251,249,244,0.35)' }]} />
        {children}
      </BlurView>
    );
  }

  // RN-Web passes unknown style keys through to CSS, so backdropFilter works
  // in the browser; on Android it is simply ignored and the fill carries it.
  const webBlur = Platform.OS === 'web'
    ? ({ backdropFilter: 'saturate(140%) blur(20px)', WebkitBackdropFilter: 'saturate(140%) blur(20px)' } as unknown as ViewStyle)
    : null;

  return (
    <View style={[styles.base, { backgroundColor: fill }, webBlur, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
});
