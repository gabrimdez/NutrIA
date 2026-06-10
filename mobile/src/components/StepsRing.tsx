import React, { useEffect, useId } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface StepsRingProps {
  current: number;
  goal: number;
  size?: number;
}

export function StepsRing({ current, goal, size = 112 }: StepsRingProps) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const scale = size / 112;
  const stroke = Math.max(8, Math.round(10 * scale));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const safeGoal = Math.max(goal, 1);
  const pct = Math.min(Math.max(current / safeGoal, 0), 1);
  const targetDash = circumference * pct;
  const pctInt = Math.round(pct * 100);

  const dashValue = useSharedValue(0);

  useEffect(() => {
    dashValue.value = withTiming(targetDash, {
      duration: 480,
      easing: Easing.out(Easing.cubic),
    });
  }, [targetDash, dashValue]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: [dashValue.value, circumference],
  }));

  const fontBig = Math.round(30 * scale);
  const walkIconSize = Math.round(21 * scale);

  const currentRounded = Math.round(current);
  const goalRounded = Math.round(safeGoal);
  const a11yLabel = `Pasos ${currentRounded} de ${goalRounded}, ${pctInt} por ciento de la meta`;

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11yLabel}
    >
      <Svg width={size} height={size} style={styles.svg}>
        <Defs>
          <SvgGradient id={`steps-grad-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={colors.primary} />
            <Stop offset="100%" stopColor={colors.primaryLight} />
          </SvgGradient>
        </Defs>
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={colors.ringTrack}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={r}
          stroke={`url(#steps-grad-${gid})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          animatedProps={animatedProps}
        />
      </Svg>
      <View
        style={[
          styles.center,
          { width: size * 0.7, minHeight: size * 0.48, pointerEvents: 'none' },
        ]}
      >
        <Ionicons
          name="walk"
          size={walkIconSize}
          color={colors.textSecondary}
          style={styles.walkIcon}
        />
        <Text
          style={[styles.stepsBig, { fontSize: fontBig, lineHeight: fontBig + 2 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {currentRounded.toLocaleString('es-ES')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  walkIcon: { marginBottom: 3, opacity: 0.9 },
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: { position: 'absolute' },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsBig: {
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
});
