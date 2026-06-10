import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = {
  label: string;
  value: string | number;
  accentColor?: string;
  compact?: boolean;
};

export function MacroChip({ label, value, accentColor = colors.textSecondary, compact }: Props) {
  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        { borderColor: `${accentColor}35`, backgroundColor: `${accentColor}14` },
      ]}
    >
      <Text style={[styles.lab, { color: accentColor }]}>{label}</Text>
      <Text style={styles.val}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  wrapCompact: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  lab: { ...typography.small, fontWeight: '700', fontSize: 10, letterSpacing: 0.4 },
  val: { ...typography.captionBold, color: colors.text, fontSize: 12 },
});
