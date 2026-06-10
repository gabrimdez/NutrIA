import React from 'react';
import { TouchableOpacity, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Sin márgenes externos: útil con `gap` en el contenedor padre. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, selected = false, onPress, compact = false, style }: ChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, compact && styles.chipCompact, selected && styles.selected, style]}
      activeOpacity={0.85}
    >
      <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.sm + 3,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipCompact: {
    marginRight: 0,
    marginBottom: 0,
  },
  selected: {
    backgroundColor: colors.primaryMuted,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  text: { ...typography.caption, color: colors.text },
  selectedText: { color: colors.primaryLight, fontWeight: '600' },
});
