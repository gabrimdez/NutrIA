import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WearableListBadge } from '../lib/wearableHub';
import { WEARABLE_UI_LABELS } from '../lib/wearableHub';
import { borderRadius, colors, hairlineWidth, typography } from '../theme';

type Props = {
  kind: WearableListBadge;
};

export function WearableStatusBadge({ kind }: Props) {
  const isConnected = kind === 'connected';
  const isUnavailable = kind === 'unavailable';
  const isConnecting = kind === 'connecting';
  const isPerm = kind === 'permission_denied';
  const isSyncErr = kind === 'sync_error';
  const isDevMock = kind === 'dev_mock';
  return (
    <View
      style={[
        styles.badge,
        isConnected && styles.badgeConnected,
        isUnavailable && styles.badgeMuted,
        isConnecting && styles.badgeConnecting,
        (isPerm || isSyncErr) && styles.badgeWarn,
        isDevMock && styles.badgeDev,
      ]}
    >
      <Text
        style={[
          styles.text,
          isConnected && styles.textConnected,
          isUnavailable && styles.textMuted,
          isConnecting && styles.textConnecting,
          (isPerm || isSyncErr) && styles.textWarn,
          isDevMock && styles.textDev,
        ]}
      >
        {WEARABLE_UI_LABELS[kind]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  badgeConnected: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryBorder,
  },
  badgeMuted: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  badgeConnecting: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primaryBorder,
  },
  badgeWarn: {
    backgroundColor: colors.errorMuted,
    borderColor: colors.errorBorder,
  },
  badgeDev: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primaryBorder,
  },
  text: {
    ...typography.micro,
    color: colors.textMuted,
    fontWeight: '700',
  },
  textConnected: {
    color: colors.textSecondary,
  },
  textMuted: {
    color: colors.textMuted,
  },
  textConnecting: {
    color: colors.textSecondary,
  },
  textWarn: {
    color: colors.error,
  },
  textDev: {
    color: colors.textSecondary,
  },
});
