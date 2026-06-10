import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, type ImageSourcePropType } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedProps,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated';
import { colors, typography } from '../theme';
import { useScreenFocusKey } from './animated/ScreenFocusContext';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 72;
const STROKE = 6;
const R = (RING_SIZE - STROKE) / 2;
const CX = RING_SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

type Props = {
  label: string;
  current: number;
  target: number;
  color: string;
  /** Emoji (`string`) o imagen local (`require(...)`). */
  icon: string | ImageSourcePropType;
  mode?: 'consumed' | 'remaining';
  /**
   * Escala visual del icono (1 = base). No cambia el contenedor del anillo (72px).
   * Útil para alinear percepción entre assets distintos.
   */
  iconScale?: number;
};

export function CompactMacroColumn({ label, current, target, color, icon, mode = 'consumed', iconScale = 1 }: Props) {
  const remaining = Math.max(target - current, 0);
  const ratio = target > 0 ? current / target : 0;
  const pct = target > 0
    ? (mode === 'consumed' ? Math.min(ratio, 1) : Math.max(0, 1 - ratio))
    : 0;
  const targetDash = CIRCUMFERENCE * pct;

  const focusKey = useScreenFocusKey();
  const prevFocusKey = useRef(focusKey);
  const prevMode = useRef(mode);
  const mounted = useRef(false);
  const dashValue = useSharedValue(0);
  const textOpacity = useSharedValue(0);

  useEffect(() => {
    const isNewFocus = prevFocusKey.current !== focusKey;
    const isNewMode = prevMode.current !== mode;
    prevFocusKey.current = focusKey;
    prevMode.current = mode;

    if (!mounted.current || isNewFocus || isNewMode) {
      mounted.current = true;
      dashValue.value = 0;
      textOpacity.value = 0;
      dashValue.value = withTiming(targetDash, { duration: 1000, easing: Easing.out(Easing.cubic) });
      textOpacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) });
      return;
    }
    dashValue.value = withTiming(targetDash, { duration: 550, easing: Easing.out(Easing.cubic) });
  }, [focusKey, mode, targetDash, dashValue, textOpacity]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: [dashValue.value, CIRCUMFERENCE],
  }));

  const textAnimStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  const valueText = mode === 'consumed'
    ? `${Math.round(current)}/${Math.round(target)}g`
    : `${Math.round(remaining)}g`;

  return (
    <View style={styles.wrap}>
      <View style={styles.ringContainer}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
          <Circle cx={CX} cy={CX} r={R} stroke={colors.ringTrack} strokeWidth={STROKE} fill="none" />
          <AnimatedCircle
            cx={CX} cy={CX} r={R}
            stroke={color}
            strokeWidth={STROKE}
            fill="none"
            animatedProps={animatedProps}
            strokeLinecap="round"
            transform={`rotate(-90 ${CX} ${CX})`}
          />
        </Svg>
        {typeof icon === 'string' ? (
          <Text style={[styles.emoji, iconScale !== 1 && { transform: [{ scale: iconScale }] }]}>{icon}</Text>
        ) : (
          <Image
            source={icon}
            style={[styles.emojiImg, iconScale !== 1 && { transform: [{ scale: iconScale }] }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        )}
      </View>
      <Animated.Text style={[styles.grams, textAnimStyle]}>{valueText}</Animated.Text>
      <Animated.Text style={[styles.label, textAnimStyle]}>{label}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  emoji: {
    fontSize: 30,
    lineHeight: 36,
  },
  emojiImg: {
    width: 58,
    height: 52,
  },
  grams: {
    ...typography.captionBold,
    color: '#e8e8e8',
    fontSize: 13,
  },
  label: {
    ...typography.small,
    color: colors.white,
    fontSize: 11,
  },
});
