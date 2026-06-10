import React, { useId, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Line, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  useAnimatedReaction,
  runOnJS,
  Easing,
  useAnimatedStyle,
  SharedValue,
} from 'react-native-reanimated';
import { colors, spacing, typography } from '../theme';
import { useScreenFocusKey } from './animated/ScreenFocusContext';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);

interface CalorieRingProps {
  current: number;
  target: number;
  size?: number;
  mode?: 'consumed' | 'remaining';
}

const OVER_SEGMENTS = 64;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

interface SegmentDef {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  start: number;
  end: number;
  color: string;
}

interface OverSegmentProps {
  seg: SegmentDef;
  stroke: number;
  overArcValue: SharedValue<number>;
}

function OverSegment({ seg, stroke, overArcValue }: OverSegmentProps) {
  const animatedProps = useAnimatedProps(() => {
    const o = overArcValue.value;
    if (o >= seg.end) return { opacity: 1 };
    if (o <= seg.start) return { opacity: 0 };
    return { opacity: (o - seg.start) / (seg.end - seg.start) };
  });

  return (
    <AnimatedLine
      x1={seg.x1}
      y1={seg.y1}
      x2={seg.x2}
      y2={seg.y2}
      stroke={seg.color}
      strokeWidth={stroke}
      strokeLinecap="butt"
      animatedProps={animatedProps}
    />
  );
}

export function CalorieRing({ current, target, size = 180, mode = 'remaining' }: CalorieRingProps) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const scale = size / 180;
  const mainStroke = Math.round(14 * scale);
  const overStroke = Math.round(6 * scale);
  const gap = Math.round(3 * scale);
  const overR = (size - overStroke) / 2;
  const mainR = overR - overStroke / 2 - gap - mainStroke / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumferenceMain = 2 * Math.PI * mainR;
  const circumferenceOver = 2 * Math.PI * overR;

  const ratio = target > 0 ? current / target : 0;
  const isOver = target > 0 && current > target;
  const consumedPct = target > 0 ? Math.min(ratio, 1) : 0;
  const remainingPct = target > 0 ? Math.max(0, 1 - ratio) : 0;
  const greenPct = mode === 'consumed' ? consumedPct : remainingPct;
  const targetDash = circumferenceMain * greenPct;
  const overPct = isOver ? Math.min((current - target) / target, 1) : 0;
  const overDash = circumferenceOver * overPct;
  const remaining = Math.max(target - current, 0);
  const overage = isOver ? current - target : 0;

  const focusKey = useScreenFocusKey();
  const prevFocusKey = useRef(focusKey);
  const prevMode = useRef(mode);
  const mounted = useRef(false);
  const dashValue = useSharedValue(0);
  const overArcValue = useSharedValue(0);
  const remainingAnim = useSharedValue(0);
  const overageAnim = useSharedValue(0);
  const consumedAnim = useSharedValue(0);
  const overMode = useSharedValue(isOver ? 1 : 0);
  const viewMode = useSharedValue(mode === 'consumed' ? 1 : 0);
  const textOpacity = useSharedValue(0);
  const textScale = useSharedValue(0.8);

  const [displayMain, setDisplayMain] = useState(0);

  useAnimatedReaction(
    () => {
      if (viewMode.value === 1) return consumedAnim.value;
      return overMode.value === 1 ? overageAnim.value : remainingAnim.value;
    },
    (val) => {
      runOnJS(setDisplayMain)(Math.round(val));
    },
  );

  useLayoutEffect(() => {
    overMode.value = isOver ? 1 : 0;
    viewMode.value = mode === 'consumed' ? 1 : 0;
  }, [isOver, mode, overMode, viewMode]);

  useEffect(() => {
    const isNewFocus = prevFocusKey.current !== focusKey;
    const isNewMode = prevMode.current !== mode;
    prevFocusKey.current = focusKey;
    prevMode.current = mode;

    if (!mounted.current || isNewFocus || isNewMode) {
      mounted.current = true;
      dashValue.value = 0;
      overArcValue.value = 0;
      textOpacity.value = 0;
      textScale.value = 0.8;
      remainingAnim.value = 0;
      overageAnim.value = 0;
      consumedAnim.value = 0;
      dashValue.value = withTiming(targetDash, { duration: 1000, easing: Easing.out(Easing.cubic) });
      overArcValue.value = withTiming(overDash, { duration: 1000, easing: Easing.out(Easing.cubic) });
      remainingAnim.value = withTiming(remaining, { duration: 1000, easing: Easing.out(Easing.cubic) });
      overageAnim.value = withTiming(overage, { duration: 1000, easing: Easing.out(Easing.cubic) });
      consumedAnim.value = withTiming(current, { duration: 1000, easing: Easing.out(Easing.cubic) });
      textOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) });
      textScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
      return;
    }

    dashValue.value = withTiming(targetDash, { duration: 550, easing: Easing.out(Easing.cubic) });
    overArcValue.value = withTiming(overDash, { duration: 550, easing: Easing.out(Easing.cubic) });
    remainingAnim.value = withTiming(remaining, { duration: 550, easing: Easing.out(Easing.cubic) });
    overageAnim.value = withTiming(overage, { duration: 550, easing: Easing.out(Easing.cubic) });
    consumedAnim.value = withTiming(current, { duration: 550, easing: Easing.out(Easing.cubic) });
  }, [
    focusKey,
    mode,
    targetDash,
    overDash,
    remaining,
    overage,
    current,
    dashValue,
    overArcValue,
    remainingAnim,
    overageAnim,
    consumedAnim,
    textOpacity,
    textScale,
  ]);

  const animatedPropsGreen = useAnimatedProps(() => ({
    strokeDasharray: [dashValue.value, circumferenceMain],
  }));

  const segments = useMemo<SegmentDef[]>(() => {
    if (!isOver) return [];
    const segLen = circumferenceOver / OVER_SEGMENTS;
    const arr: SegmentDef[] = [];
    for (let i = 0; i < OVER_SEGMENTS; i++) {
      const start = i * segLen;
      const end = (i + 1) * segLen;
      const midArc = start + segLen / 2;
      const theta = -Math.PI / 2 + midArc / overR;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const tx = -sinT;
      const ty = cosT;
      const half = segLen / 2;
      const cxp = cx + overR * cosT;
      const cyp = cy + overR * sinT;
      const t = (i + 0.5) / OVER_SEGMENTS;
      arr.push({
        x1: cxp - half * tx,
        y1: cyp - half * ty,
        x2: cxp + half * tx,
        y2: cyp + half * ty,
        start,
        end,
        color: lerpColor(colors.warning, colors.error, t),
      });
    }
    return arr;
  }, [isOver, cx, cy, overR, circumferenceOver]);

  const textAnimStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ scale: textScale.value }],
  }));

  const isConsumed = mode === 'consumed';
  const subText = isConsumed
    ? 'kcal consumidas'
    : isOver
      ? 'kcal de más'
      : 'kcal restantes';
  const showOverColor = isOver && !isConsumed;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Defs>
          <SvgGradient id={`grad-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={colors.gradientStart} />
            <Stop offset="100%" stopColor={colors.gradientEnd} />
          </SvgGradient>
        </Defs>
        {isOver ? (
          <Circle
            cx={cx}
            cy={cy}
            r={overR}
            stroke={colors.ringTrack}
            strokeWidth={overStroke}
            fill="none"
          />
        ) : null}
        <Circle
          cx={cx}
          cy={cy}
          r={mainR}
          stroke={colors.ringTrack}
          strokeWidth={mainStroke}
          fill="none"
        />
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={mainR}
          stroke={`url(#grad-${gid})`}
          strokeWidth={mainStroke}
          fill="none"
          animatedProps={animatedPropsGreen}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {isOver
          ? segments.map((s, i) => (
            <OverSegment key={i} seg={s} stroke={overStroke} overArcValue={overArcValue} />
            ))
          : null}
      </Svg>
      <Animated.View style={[styles.center, { pointerEvents: 'none' }, textAnimStyle]}>
        <View style={styles.bigRow}>
          <Text
            style={[
              styles.big,
              { fontSize: Math.round(32 * scale), lineHeight: Math.round(38 * scale) },
              showOverColor && styles.bigOver,
            ]}
          >
            {displayMain}
          </Text>
          {isConsumed ? (
            <Text
              style={[
                styles.bigTarget,
                {
                  fontSize: Math.round(15 * scale),
                  lineHeight: Math.round(20 * scale),
                  marginLeft: Math.round(2 * scale),
                },
              ]}
            >
              /{Math.round(target)}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.sub, { fontSize: Math.round(13 * scale) }]}>
          {subText}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  svg: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xs },
  bigRow: { flexDirection: 'row', alignItems: 'baseline' },
  big: { ...typography.metricXl, color: colors.text },
  bigOver: { color: colors.warning },
  bigTarget: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
  sub: { ...typography.caption, color: colors.white, marginTop: 2 },
});
