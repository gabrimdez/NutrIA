import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, borderRadius } from '../../theme';

type Size = 'sm' | 'md';

type Props = {
  progress: number;
  color: string;
  size?: Size;
  trackColor?: string;
};

const heights: Record<Size, number> = { sm: 4, md: 6 };

export function ProgressTrack({
  progress,
  color,
  size = 'md',
  trackColor = colors.surfaceMuted,
}: Props) {
  const pct = Math.min(100, Math.max(0, progress));
  return (
    <View style={[styles.track, { height: heights[size], backgroundColor: trackColor }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
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
