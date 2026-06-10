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
  style?: ViewStyle;
}>;

export function FadeInView({ children, delay = 0, duration = 400, style }: Props) {
  const focusKey = useScreenFocusKey();
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = 0;
    const timeout = setTimeout(() => {
      opacity.value = withTiming(1, {
        duration,
        easing: Easing.out(Easing.quad),
      });
    }, delay);
    return () => clearTimeout(timeout);
  }, [focusKey, delay, duration, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}
