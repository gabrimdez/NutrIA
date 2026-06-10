import React, { useEffect, useId } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, typography } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Cada vaso cuenta como 250 ml hacia el objetivo diario. */
export const WATER_ML_PER_GLASS = 250;
/** Objetivo de hidratación mostrado en la rueda (3 L). */
export const WATER_GOAL_ML = 3000;

/** A partir de 1 L se muestra en litros; por debajo, en ml (es-ES). */
export function formatWaterVolume(ml: number): { value: string; unit: string } {
  const n = Math.max(0, Math.round(ml));
  if (n < 1000) {
    return { value: n.toLocaleString('es-ES'), unit: 'ml' };
  }
  const L = n / 1000;
  const value = L.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return { value, unit: 'L' };
}

export function waterGoalLitersLabel(): string {
  const L = WATER_GOAL_ML / 1000;
  const v = Number.isInteger(L) ? L.toLocaleString('es-ES') : L.toLocaleString('es-ES', { maximumFractionDigits: 1 });
  return `${v} L`;
}

interface WaterIntakeRingProps {
  glasses: number;
  size?: number;
}

export function WaterIntakeRing({ glasses, size = 96 }: WaterIntakeRingProps) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const scale = size / 96;
  const stroke = Math.max(6, Math.round(8 * scale));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const consumedMl = Math.max(0, glasses) * WATER_ML_PER_GLASS;
  const pct = WATER_GOAL_ML > 0 ? Math.min(consumedMl / WATER_GOAL_ML, 1) : 0;
  const targetDash = circumference * pct;

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

  const { value: volValue, unit: volUnit } = formatWaterVolume(consumedMl);
  const a11yVol =
    volUnit === 'L'
      ? `${volValue} litros`
      : `${volValue} mililitros`;

  const fontMain = Math.round(20 * scale);
  const fontSub = Math.round(11 * scale);

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Hidratación ${a11yVol}, objetivo ${waterGoalLitersLabel()}`}
    >
      <Svg width={size} height={size} style={styles.svg}>
        <Defs>
          <SvgGradient id={`water-grad-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#22d3ee" />
            <Stop offset="100%" stopColor="#38bdf8" />
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
          stroke={`url(#water-grad-${gid})`}
          strokeWidth={stroke}
          fill="none"
          animatedProps={animatedProps}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
      <View style={[styles.center, { pointerEvents: 'none' }]}>
        <Text style={[styles.mlValue, { fontSize: fontMain, lineHeight: fontMain + 2 }]}>{volValue}</Text>
        <Text style={[styles.mlUnit, { fontSize: fontSub, lineHeight: fontSub + 2 }]}>{volUnit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  svg: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
  mlValue: { ...typography.metricSm, color: colors.white, fontWeight: '700' },
  mlUnit: { ...typography.caption, color: colors.white, marginTop: 2, fontWeight: '600' },
  goalCaption: { ...typography.caption, color: colors.textSecondary, marginTop: 1, fontWeight: '600' },
});
