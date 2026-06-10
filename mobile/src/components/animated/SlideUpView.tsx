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
  delay?: number;
  duration?: number;
  distance?: number;
  style?: ViewStyle;
}>;

export function SlideUpView({ children, delay = 0, duration = 500, distance = 30, style }: Props) {
  const focusKey = useScreenFocusKey();
  const translateY = useSharedValue(distance);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = distance;
    opacity.value = 0;
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
  }, [focusKey, delay, distance, duration, opacity, translateY]);

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
