import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, LoadingScreen, Surface } from '../../../src/components';
import { WearableStatusBadge } from '../../../src/components/WearableStatusBadge';
import { ListRow } from '../../../src/components/ui';
import { api } from '../../../src/lib/api';
import { normalizeAppSettings } from '../../../src/lib/appSettings';
import { loadWearableHubLocal } from '../../../src/lib/wearableLocalStore';
import {
  WEARABLE_METRIC_ORDER,
  WEARABLE_METRIC_LABELS,
  getWearableRowsMerged,
} from '../../../src/lib/wearableHub';
import type { AppSettings } from '../../../src/types';
import {
  borderRadius,
  colors,
  hairlineWidth,
  iconSize,
  screenPaddingX,
  spacing,
  typography,
} from '../../../src/theme';

export default function WearablesIndexScreen() {
  const insets = useSafeAreaInsets();
  const [hubLocal, setHubLocal] = useState<Awaited<ReturnType<typeof loadWearableHubLocal>> | undefined>(undefined);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => api.get<AppSettings>('/api/v1/me/settings'),
  });

  const rehydrateLocal = useCallback(async () => {
    setHubLocal(await loadWearableHubLocal());
  }, []);

  useEffect(() => {
    void rehydrateLocal();
  }, [rehydrateLocal]);

  useFocusEffect(
    useCallback(() => {
      void rehydrateLocal();
    }, [rehydrateLocal]),
  );

  const normalized = useMemo(() => (data ? normalizeAppSettings(data) : null), [data]);
  const rows = useMemo(() => {
    if (!normalized || !hubLocal) return [];
    return getWearableRowsMerged(normalized, hubLocal);
  }, [normalized, hubLocal]);

  if (isLoading || hubLocal === undefined) return <LoadingScreen />;

  if (isError || !normalized) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.textMuted} />
        <Text style={styles.errorTitle}>No se pudo cargar el estado</Text>
        <Text style={styles.errorBody}>Comprueba tu conexión e inténtalo de nuevo.</Text>
        <Button title="Reintentar" onPress={() => void refetch()} size="lg" style={styles.retryBtn} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.lead}>
        En iPhone usa Apple Salud; en Android, Health Connect: pasos, distancia y calorías activas con lectura real.
        Pulsa un proveedor para conectar, sincronizar o desconectar.
      </Text>

      <Surface variant="subtle" style={styles.listCard}>
        {rows.map((row, index) => (
          <View key={row.id}>
            <ListRow
              leading={
                <View style={styles.iconWrap}>
                  <Ionicons name={row.icon} size={20} color={colors.textSecondary} />
                </View>
              }
              title={row.title}
              subtitle={row.subtitle}
              trailing={<WearableStatusBadge kind={row.uiKind} />}
              onPress={() =>
                router.push({
                  pathname: '/profile/wearables/[provider]',
                  params: { provider: row.id },
                })
              }
              showSeparator={index < rows.length - 1}
              contentAlign="flex-start"
            />
          </View>
        ))}
      </Surface>

      <Text style={styles.sectionLabel}>Datos que podremos recoger</Text>
      <Surface variant="subtle" padding="lg" style={styles.metricsCard}>
        {WEARABLE_METRIC_ORDER.map((key) => (
          <View key={key} style={styles.metricRow}>
            <View style={styles.metricBullet} />
            <Text style={styles.metricText}>{WEARABLE_METRIC_LABELS[key]}</Text>
          </View>
        ))}
      </Surface>

      <Surface variant="subtle" padding="lg" style={styles.privacyCard}>
        <View style={styles.privacyHeader}>
          <Ionicons name="shield-checkmark-outline" size={iconSize.md} color={colors.primaryLight} />
          <Text style={styles.privacyTitle}>Privacidad y control</Text>
        </View>
        <Text style={styles.privacyBody}>
          Solo accederemos a tus datos de actividad con tu permiso explícito. Puedes desconectar tu dispositivo en
          cualquier momento desde esta pantalla, desde Configuración → Integraciones o desde los ajustes del sistema
          (Apple Salud, Health Connect, etc.).
        </Text>
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md, gap: spacing.md },
  lead: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  listCard: {
    overflow: 'hidden',
    padding: 0,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  metricsCard: { gap: spacing.sm },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metricBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primaryLight,
    marginTop: 7,
  },
  metricText: { ...typography.caption, color: colors.text, flex: 1, lineHeight: 20 },
  privacyCard: { gap: spacing.sm },
  privacyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  privacyTitle: { ...typography.bodyBold, color: colors.text },
  privacyBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: screenPaddingX,
    gap: spacing.sm,
  },
  errorTitle: { ...typography.bodyBold, color: colors.text, textAlign: 'center' },
  errorBody: { ...typography.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  retryBtn: { marginTop: spacing.md },
});
