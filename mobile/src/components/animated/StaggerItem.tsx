import React, { useEffect, type PropsWithChildren } from 'react';
import { type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useScreenFocusKey } from './ScreenFocusContext';

type Props = PropsWithChildren<{
  index: number;
  baseDelay?: number;
  staggerMs?: number;
  duration?: number;
  distance?: number;
  style?: ViewStyle;
}>;

export function StaggerItem({
  children,
  index,
  baseDelay = 80,
  staggerMs = 60,
  duration = 420,
  distance = 24,
  style,
}: Props) {
  const focusKey = useScreenFocusKey();
  const translateY = useSharedValue(distance);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = distance;
    opacity.value = 0;
    const delay = baseDelay + index * staggerMs;
    const timeout = setTimeout(() => {
      translateY.value = withTiming(0, {
        duration,
        easing: Easing.out(Easing.cubic),
      });
      opacity.value = withTiming(1, {
        duration: duration * 0.7,
        easing: Easing.out(Easing.quad),
      });
    }, delay);
    return () => clearTimeout(timeout);
  }, [focusKey, baseDelay, duration, index, opacity, staggerMs, translateY, distance]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}
