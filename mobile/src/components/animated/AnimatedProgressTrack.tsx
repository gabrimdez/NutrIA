import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useScreenFocusKey } from './ScreenFocusContext';
import { colors, borderRadius } from '../../theme';

type Size = 'sm' | 'md';

type Props = {
  progress: number;
  color: string;
  size?: Size;
  trackColor?: string;
  delay?: number;
  duration?: number;
};

const heights: Record<Size, number> = { sm: 4, md: 6 };

export function AnimatedProgressTrack({
  progress,
  color,
  size = 'md',
  trackColor = colors.surfaceMuted,
  delay = 300,
  duration = 700,
}: Props) {
  const focusKey = useScreenFocusKey();
  const pct = Math.min(100, Math.max(0, progress));
  const widthPct = useSharedValue(0);
  const prevFocusKey = useRef(focusKey);
  const mounted = useRef(false);

  useEffect(() => {
    const isNewFocus = prevFocusKey.current !== focusKey;
    prevFocusKey.current = focusKey;

    if (!mounted.current || isNewFocus) {
      mounted.current = true;
      widthPct.value = 0;
      const timeout = setTimeout(() => {
        widthPct.value = withTiming(pct, {
          duration,
          easing: Easing.out(Easing.cubic),
        });
      }, delay);
      return () => clearTimeout(timeout);
    }

    widthPct.value = withTiming(pct, {
      duration: 550,
      easing: Easing.out(Easing.cubic),
    });
  }, [focusKey, delay, duration, pct, widthPct]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${widthPct.value}%`,
  }));

  return (
    <View style={[styles.track, { height: heights[size], backgroundColor: trackColor }]}>
      <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
});
