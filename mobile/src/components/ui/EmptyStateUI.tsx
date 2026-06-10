import React, { type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { UIButton } from './Button';

type Props = {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyStateUI({ icon, title, description, actionLabel, onAction }: Props) {
  return (
    <View style={styles.container}>
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction ? (
        <UIButton title={actionLabel} onPress={onAction} size="sm" style={styles.button} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  iconWrap: { marginBottom: spacing.md, opacity: 0.9 },
  title: { ...typography.sectionTitle, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  button: { marginTop: spacing.lg, minWidth: 200 },
});
