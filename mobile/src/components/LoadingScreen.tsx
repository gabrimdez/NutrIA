import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../theme';

interface Props {
  message?: string;
}

export function LoadingScreen({ message }: Props = {}) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primaryLight} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
});
