import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, LoadingScreen, Surface } from '../../../src/components';
import { api } from '../../../src/lib/api';
import { normalizeAppSettings } from '../../../src/lib/appSettings';
import { toUserFacingErrorMessage } from '../../../src/lib/userFacingError';
import {
  openAndroidHealthConnectPermissionForThisApp,
  openAndroidHealthConnectSettings,
} from '../../../src/lib/healthSteps';
import { areWearableMocksEnabled, isRealActivitySnapshot, MSG_NO_ACTIVITY_DATA } from '../../../src/lib/wearableActivityPolicy';
import { loadWearableHubLocal } from '../../../src/lib/wearableLocalStore';
import type { WearableConnectionState } from '../../../src/lib/wearableActivityTypes';
import type { WearableProviderId } from '../../../src/lib/wearableHub';
import {
  connectProvider,
  disconnectProvider,
  getConnectionStatus,
  syncActivityData,
} from '../../../src/services/wearableActivityService';
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

const VALID_PROVIDERS: WearableProviderId[] = [
  'apple_health',
  'android_health_connect',
  'xiaomi_mi_fitness',
  'garmin',
  'other_device',
];

const TITLES: Record<WearableProviderId, string> = {
  apple_health: 'Apple Salud',
  android_health_connect: 'Health Connect',
  xiaomi_mi_fitness: 'Xiaomi / Mi Fitness',
  garmin: 'Garmin',
  other_device: 'Otro dispositivo',
};

function fmtNum(n: number | null | undefined, suffix = ''): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('es-ES')}${suffix}`;
}

function fmtDistanceMeters(m: number | null | undefined): string {
  if (m == null || Number.isNaN(m) || m <= 0) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

export default function WearableProviderDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ provider?: string }>();
  const raw = params.provider;
  const paramId = Array.isArray(raw) ? raw[0] : raw;
  const providerId = isProviderId(paramId) ? paramId : null;

  const [hubLocal, setHubLocal] = useState<Awaited<ReturnType<typeof loadWearableHubLocal>> | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => api.get<AppSettings>('/api/v1/me/settings'),
  });

  const normalized = useMemo(() => (data ? normalizeAppSettings(data) : null), [data]);

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

  useLayoutEffect(() => {
    if (providerId) {
      navigation.setOptions({ title: TITLES[providerId] });
    }
  }, [navigation, providerId]);

  const connection = useMemo((): WearableConnectionState => {
    if (!normalized || !hubLocal || !providerId) return 'not_connected';
    return getConnectionStatus(providerId, normalized, hubLocal);
  }, [normalized, hubLocal, providerId]);

  const snapshot = useMemo(() => {
    if (!hubLocal || !providerId) return null;
    return hubLocal.snapshots[providerId] ?? null;
  }, [hubLocal, providerId]);

  const runAfterMutation = useCallback(
    async (nextSettings: AppSettings) => {
      queryClient.setQueryData(['app-settings'], nextSettings);
      await queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['activity-day'] });
      await rehydrateLocal();
    },
    [queryClient, rehydrateLocal],
  );

  const onConnect = useCallback(async () => {
    if (!normalized || !providerId) return;
    setBusy(true);
    try {
      const res = await connectProvider(providerId, normalized);
      await runAfterMutation(res.settings);
      if (!res.ok) {
        if (res.code === 'unavailable' || res.code === 'native_module_unavailable') {
          Alert.alert(
            'No disponible',
            toUserFacingErrorMessage(res.message ?? '', 'Este proveedor no está disponible aquí.'),
          );
          return;
        }
        if (res.code === 'permission_denied' && providerId === 'android_health_connect') {
          Alert.alert('Health Connect', toUserFacingErrorMessage(res.message ?? '', 'Sin permiso de pasos.'), [
            { text: 'Cerrar', style: 'cancel' },
            { text: 'Abrir Health Connect', onPress: () => openAndroidHealthConnectSettings() },
            { text: 'Permisos de NutrIA', onPress: () => openAndroidHealthConnectPermissionForThisApp() },
          ]);
        } else {
          Alert.alert(
            'No se pudo conectar',
            toUserFacingErrorMessage(res.message ?? '', 'Inténtalo de nuevo.'),
          );
        }
        return;
      }
      Alert.alert('Conectado', toUserFacingErrorMessage(res.message ?? '', 'Listo.'));
    } catch (e) {
      Alert.alert('Error', toUserFacingErrorMessage(e, 'Algo salió mal.'));
    } finally {
      setBusy(false);
    }
  }, [normalized, providerId, runAfterMutation]);

  const onDisconnect = useCallback(async () => {
    if (!normalized || !providerId) return;
    setBusy(true);
    try {
      const { settings } = await disconnectProvider(providerId, normalized);
      await runAfterMutation(settings);
      Alert.alert('Desconectado', 'Se ha quitado la vinculación de este proveedor en la app.');
    } catch (e) {
      Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo desconectar.'));
    } finally {
      setBusy(false);
    }
  }, [normalized, providerId, runAfterMutation]);

  const onSync = useCallback(async () => {
    if (!normalized || !providerId) return;
    setBusy(true);
    try {
      const res = await syncActivityData(providerId, normalized);
      await rehydrateLocal();
      if (!res.ok) {
        Alert.alert(
          'Sincronización',
          toUserFacingErrorMessage(res.message ?? '', 'No se pudieron leer datos.'),
        );
        return;
      }
      if (!res.data) {
        Alert.alert('Sincronización', MSG_NO_ACTIVITY_DATA);
        return;
      }
      Alert.alert(
        'Sincronizado',
        res.data.steps != null
          ? `Pasos: ${res.data.steps.toLocaleString('es-ES')}. Los datos aparecen abajo y el inicio se actualizará si aplica.`
          : 'Lectura completada.',
      );
    } catch (e) {
      Alert.alert('Error', toUserFacingErrorMessage(e, 'Algo salió mal.'));
    } finally {
      setBusy(false);
    }
  }, [normalized, providerId, rehydrateLocal]);

  if (!providerId) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorTitle}>Proveedor no válido</Text>
        <Button title="Volver" onPress={() => router.back()} size="lg" style={styles.retryBtn} />
      </View>
    );
  }

  if (isLoading || hubLocal === undefined) return <LoadingScreen />;

  if (isError || !normalized) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.textMuted} />
        <Text style={styles.errorTitle}>No se pudo cargar la configuración</Text>
        <Button title="Reintentar" onPress={() => void refetch()} size="lg" style={styles.retryBtn} />
      </View>
    );
  }

  const canConnect =
    connection === 'not_connected' ||
    connection === 'permission_denied' ||
    connection === 'sync_error' ||
    connection === 'disconnected';

  const canSync = connection === 'connected';

  const canDisconnect =
    connection === 'connected' ||
    connection === 'permission_denied' ||
    connection === 'sync_error' ||
    connection === 'dev_mock';

  const hasRealSnapshot = !!(snapshot && isRealActivitySnapshot(snapshot.source));
  const hasDevSnapshot = !!(areWearableMocksEnabled() && snapshot?.source === 'dev_mock');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xl },
      ]}
    >
      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={colors.primaryLight} />
          <Text style={styles.busyText}>Trabajando…</Text>
        </View>
      ) : null}

      <Surface variant="subtle" padding="lg" style={styles.card}>
        <Text style={styles.kicker}>Estado</Text>
        <Text style={styles.statusLine}>{connectionLabel(connection)}</Text>
        {snapshot?.lastSyncAt && (hasRealSnapshot || hasDevSnapshot) ? (
          <Text style={styles.syncHint}>
            Última sincronización en app: {new Date(snapshot.lastSyncAt).toLocaleString('es-ES')}
          </Text>
        ) : (
          <Text style={styles.syncHint}>Sin sincronización con datos reales guardada en este dispositivo.</Text>
        )}
      </Surface>

      {hasDevSnapshot ? (
        <Surface variant="subtle" padding="lg" style={styles.devBanner}>
          <Text style={styles.devBannerText}>
            Datos simulados para desarrollo (EXPO_PUBLIC_ENABLE_WEARABLE_MOCKS=true). No son datos reales de salud.
          </Text>
        </Surface>
      ) : null}

      <Surface variant="subtle" padding="lg" style={styles.card}>
        <Text style={styles.kicker}>Resumen de datos</Text>
        {hasRealSnapshot || hasDevSnapshot ? (
          <>
            <MetricLine label="Pasos" value={fmtNum(snapshot?.steps ?? null)} />
            <MetricLine label="Calorías actividad" value={fmtNum(snapshot?.calories ?? null, ' kcal')} />
            <MetricLine label="Distancia" value={fmtDistanceMeters(snapshot?.distanceMeters ?? null)} />
            <MetricLine label="Min. activos" value={fmtNum(snapshot?.activeMinutes ?? null, ' min')} />
            <MetricLine label="Frecuencia cardíaca" value={snapshot?.heartRateBpm != null ? `${snapshot.heartRateBpm} lpm` : '—'} />
            <MetricLine label="Sueño" value={snapshot?.sleepHours != null ? `${snapshot.sleepHours} h` : '—'} />
            <MetricLine label="Entrenos" value={fmtNum(snapshot?.workouts ?? null)} />
            {snapshot?.workoutKcal != null && snapshot.workoutKcal > 0 ? (
              <MetricLine label="kcal entrenos" value={fmtNum(snapshot.workoutKcal, ' kcal')} />
            ) : null}
            {snapshot?.workoutDurationMin != null && snapshot.workoutDurationMin > 0 ? (
              <MetricLine label="Duración entrenos" value={fmtNum(snapshot.workoutDurationMin, ' min')} />
            ) : null}
          </>
        ) : (
          <Text style={styles.noData}>{MSG_NO_ACTIVITY_DATA}</Text>
        )}
      </Surface>

      <View style={styles.btnCol}>
        <Button
          title="Conectar"
          onPress={() => void onConnect()}
          disabled={busy || !canConnect}
          size="lg"
        />
        <Button
          title="Sincronizar datos"
          onPress={() => void onSync()}
          disabled={busy || !canSync}
          size="lg"
          variant="secondary"
        />
        <Button
          title="Desconectar"
          onPress={() => void onDisconnect()}
          disabled={busy || !canDisconnect}
          size="lg"
          variant="secondary"
        />
      </View>

      <Surface variant="subtle" padding="lg" style={styles.card}>
        <View style={styles.privacyHeader}>
          <Ionicons name="shield-checkmark-outline" size={iconSize.md} color={colors.primaryLight} />
          <Text style={styles.privacyTitle}>Privacidad</Text>
        </View>
        <Text style={styles.privacyBody}>
          Solo accederemos a tus datos de actividad con tu permiso explícito. Puedes desconectar tu dispositivo en
          cualquier momento. En Apple Salud y Health Connect también puedes revocar el acceso desde Ajustes del
          sistema.
        </Text>
      </Surface>
    </ScrollView>
  );
}

function isProviderId(s: string | undefined): s is WearableProviderId {
  return !!s && VALID_PROVIDERS.includes(s as WearableProviderId);
}

function connectionLabel(c: WearableConnectionState): string {
  switch (c) {
    case 'connected':
      return 'Conectado (integración real)';
    case 'not_connected':
      return 'No conectado';
    case 'unavailable':
      return 'Integración no disponible en esta plataforma';
    case 'permission_denied':
      return 'Permiso denegado o incompleto';
    case 'sync_error':
      return 'Error de sincronización';
    case 'disconnected':
      return 'Desconectado';
    case 'dev_mock':
      return 'Simulación solo desarrollo';
    default:
      return 'No conectado';
  }
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricLine}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md, gap: spacing.md },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  busyText: { ...typography.caption, color: colors.textSecondary },
  card: { gap: spacing.sm },
  kicker: { ...typography.small, fontWeight: '700', color: colors.textMuted },
  statusLine: { ...typography.bodyBold, color: colors.text },
  syncHint: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
  metricLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: hairlineWidth,
    borderBottomColor: colors.border,
  },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  metricValue: { ...typography.captionBold, color: colors.text },
  btnCol: { gap: spacing.sm },
  privacyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  privacyTitle: { ...typography.bodyBold, color: colors.text },
  privacyBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },
  noData: { ...typography.caption, color: colors.textMuted, lineHeight: 20 },
  devBanner: { borderColor: colors.primaryBorder, borderWidth: hairlineWidth },
  devBannerText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: screenPaddingX,
  },
  errorTitle: { ...typography.bodyBold, color: colors.text, marginBottom: spacing.md },
  retryBtn: { marginTop: spacing.sm },
});
