import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

export type AnimatedFavoriteButtonProps = {
  isFav: boolean;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  activeColor?: string;
  inactiveColor?: string;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  accessibilityLabel?: string;
};

/**
 * Botón de favorito con animación de pop al alternar el estado.
 * Crece y rebota al marcarse; encoge brevemente al desmarcarse.
 */
export function AnimatedFavoriteButton({
  isFav,
  onPress,
  disabled,
  size = 24,
  activeColor = colors.success,
  inactiveColor = colors.primary,
  style,
  hitSlop = 8,
  accessibilityLabel,
}: AnimatedFavoriteButtonProps) {
  const scale = useSharedValue(1);
  const prevFavRef = useRef<boolean>(isFav);

  useEffect(() => {
    if (prevFavRef.current === isFav) return;
    prevFavRef.current = isFav;
    if (isFav) {
      scale.value = withSequence(
        withTiming(1.45, { duration: 160, easing: Easing.out(Easing.quad) }),
        withTiming(0.92, { duration: 110, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      scale.value = withSequence(
        withTiming(0.7, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(1.1, { duration: 140, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) }),
      );
    }
  }, [isFav, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        styles.btn,
        style,
        disabled && { opacity: 0.45 },
        pressed && !disabled && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={animatedStyle}>
        <Ionicons
          name={isFav ? 'heart' : 'heart-outline'}
          size={size}
          color={isFav ? activeColor : inactiveColor}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
