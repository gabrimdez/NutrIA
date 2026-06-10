import React, { useMemo, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { colors, spacing, typography, borderRadius, screenPaddingX } from '../theme';
import { Surface } from './ui/Surface';
import type { ExerciseHistoryPoint } from '../types/workout';

const CHART_H = 180;
const PAD_TOP = 16;
const PAD_BOT = 28;
const DAY_W = 50;
const Y_AXIS_W = 44;
const DOT_R = 4;

interface Props {
  data: ExerciseHistoryPoint[];
  metric?: 'weight' | 'volume';
}

export function ExerciseProgressChart({ data, metric = 'weight' }: Props) {
  const { width: screenW } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

  const sorted = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);

  if (sorted.length < 2) {
    return (
      <Surface style={s.card}>
        <Text style={s.emptyText}>Registra al menos 2 sesiones para ver el gráfico</Text>
      </Surface>
    );
  }

  const totalW = Math.max(sorted.length * DAY_W, screenW - screenPaddingX * 2 - Y_AXIS_W);
  const plotH = CHART_H - PAD_TOP - PAD_BOT;

  const values = sorted.map((p) => (metric === 'volume' ? p.total_volume ?? 0 : p.max_weight_kg ?? 0));
  let minV = Math.min(...values);
  let maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const pad = range * 0.15;
  minV -= pad;
  maxV += pad;

  const points = sorted.map((p, i) => {
    const val = values[i];
    const x = i * DAY_W + DAY_W / 2;
    const y = PAD_TOP + plotH - ((val - minV) / (maxV - minV)) * plotH;
    return { x, y, val, date: p.date };
  });

  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  const gridLines = 4;
  const gridVals: number[] = [];
  for (let i = 0; i <= gridLines; i++) {
    gridVals.push(minV + (maxV - minV) * (i / gridLines));
  }

  const unit = metric === 'volume' ? 'vol' : 'kg';

  return (
    <Surface style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.title}>{metric === 'volume' ? 'Volumen total' : 'Peso máximo'}</Text>
      </View>
      <View style={s.body}>
        <View style={s.yAxis}>
          <Svg width={Y_AXIS_W} height={CHART_H}>
            {gridVals.map((val, i) => {
              const gy = PAD_TOP + plotH - ((val - minV) / (maxV - minV)) * plotH;
              const label = range >= 4 ? Math.round(val).toString() : val.toFixed(1);
              return (
                <SvgText
                  key={i}
                  x={Y_AXIS_W / 2}
                  y={gy + 4}
                  fill={colors.textMuted}
                  fontSize={9}
                  fontWeight="400"
                  textAnchor="middle"
                >
                  {label}
                </SvgText>
              );
            })}
          </Svg>
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={(w) => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <Svg width={totalW} height={CHART_H}>
            {gridVals.map((val, i) => {
              const gy = PAD_TOP + plotH - ((val - minV) / (maxV - minV)) * plotH;
              return (
                <Line
                  key={i}
                  x1={0} y1={gy} x2={totalW} y2={gy}
                  stroke={colors.border} strokeWidth={1} strokeDasharray="4,4"
                />
              );
            })}
            <Polyline
              points={polyPoints}
              fill="none"
              stroke={colors.primaryLight}
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {points.map((p, i) => (
              <React.Fragment key={i}>
                <Circle cx={p.x} cy={p.y} r={DOT_R} fill={colors.primaryLight} />
                <SvgText
                  x={p.x}
                  y={CHART_H - 6}
                  fill={colors.textMuted}
                  fontSize={8}
                  textAnchor="middle"
                >
                  {p.date.slice(5)}
                </SvgText>
              </React.Fragment>
            ))}
          </Svg>
        </ScrollView>
      </View>
    </Surface>
  );
}

const s = StyleSheet.create({
  card: { padding: spacing.md, marginBottom: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  title: { ...typography.captionBold, color: colors.text },
  emptyText: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
  body: { flexDirection: 'row' },
  yAxis: { width: Y_AXIS_W },
});
