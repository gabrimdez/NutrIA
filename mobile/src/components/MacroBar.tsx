import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme';
import { ProgressTrack } from './ui/ProgressTrack';

interface MacroBarProps {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
}

export function MacroBar({ label, current, target, color, unit = 'g' }: MacroBarProps) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const isOver = current > target && target > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.lab}>{label}</Text>
        <Text style={[styles.val, isOver && { color: colors.warning }]}>
          {Math.round(current)}/{Math.round(target)}
          {unit}
        </Text>
      </View>
      <ProgressTrack progress={pct} color={color} size="md" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  lab: { ...typography.caption, color: colors.textSecondary },
  val: { ...typography.captionBold, color: colors.text },
});
