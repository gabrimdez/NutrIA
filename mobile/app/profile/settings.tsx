import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, LoadingScreen, Surface } from '../../src/components';
import { persistAppSettingsIntegration } from '../../src/lib/appSettingsIntegration';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_MEAL_REMINDER_TIMES,
  HYDRATION_INTERVAL_OPTIONS,
  WEEKDAY_OPTIONS,
  WEEKLY_REMINDER_TIME_OPTIONS,
  dateToTimeString,
  normalizeAppSettings,
  normalizeTimeInput,
  timeStringToTodayDate,
} from '../../src/lib/appSettings';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import {
  connectAndroidHealthConnectAndReadStepsToday,
  connectAppleHealthAndReadStepsToday,
  openAndroidHealthConnectPermissionForThisApp,
  openAndroidHealthConnectSettings,
} from '../../src/lib/healthSteps';
import {
  exportPlanToCalendar,
  removeCalendarEvents,
  requestCalendarPermission,
} from '../../src/lib/calendarSync';
import { syncLocalNotificationPreferences } from '../../src/lib/notificationSettings';
import type {
  AppSettings,
  DietPlan,
  IntegrationPreferences,
  IntegrationStatus,
  IntegrationStatusValue,
  MealReminderTimes,
  NotificationPreferences,
  ReminderWeekday,
} from '../../src/types';
import {
  borderRadius,
  colors,
  hairlineWidth,
  iconSize,
  screenPaddingX,
  spacing,
  typography,
} from '../../src/theme';

const MEAL_REMINDER_SLOTS: { key: keyof MealReminderTimes; label: string }[] = [
  { key: 'breakfast', label: 'Desayuno' },
  { key: 'lunch', label: 'Comida' },
  { key: 'snack', label: 'Merienda' },
  { key: 'dinner', label: 'Cena' },
];

const MEAL_REMINDER_GRID_ROWS = [
  [MEAL_REMINDER_SLOTS[0], MEAL_REMINDER_SLOTS[1]],
  [MEAL_REMINDER_SLOTS[2], MEAL_REMINDER_SLOTS[3]],
] as const;

function WebMealTimeField({
  value,
  fallback,
  onCommit,
}: {
  value: string;
  fallback: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <TextInput
      style={s.mealTimeInput}
      value={local}
      onChangeText={setLocal}
      onBlur={() => {
        const n = normalizeTimeInput(local);
        if (n) onCommit(n);
        else setLocal(value || fallback);
      }}
      placeholder="HH:mm"
      placeholderTextColor={colors.textMuted}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
    />
  );
}

type SwitchRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  desc: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  trailing?: React.ReactNode;
};

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.sectionHint}>{hint}</Text>
    </View>
  );
}

function SwitchRow({ icon, label, desc, value, onValueChange, trailing }: SwitchRowProps) {
  return (
    <View style={s.switchRow}>
      <View style={s.switchIconWrap}>
        <Ionicons name={icon} size={iconSize.md} color={colors.textSecondary} />
      </View>
      <View style={s.switchCopy}>
        <Text style={s.switchLabel}>{label}</Text>
        <Text style={s.switchDesc}>{desc}</Text>
        {trailing ? <View style={s.switchTrailing}>{trailing}</View> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceMuted, true: colors.primaryBorderStrong }}
        thumbColor={value ? colors.primaryLight : colors.textMuted}
      />
    </View>
  );
}

function ChoiceChip({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.choiceChip, selected && s.choiceChipActive]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <Text style={[s.choiceChipLabel, selected && s.choiceChipLabelActive]}>{label}</Text>
      {hint ? <Text style={[s.choiceChipHint, selected && s.choiceChipHintActive]}>{hint}</Text> : null}
    </TouchableOpacity>
  );
}

function InlineBadge({ label }: { label: string }) {
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>{label}</Text>
    </View>
  );
}

const STATUS_LABELS: Record<string, string> = {
  disabled: 'Desactivado',
  enabled_pending: 'Próximamente',
  available_not_connected: 'Disponible',
  permission_denied: 'Sin permisos',
  connected: 'Conectado',
  sync_error: 'Error',
};

function IntegrationRow({
  icon,
  label,
  desc,
  value,
  onValueChange,
  platformLabel,
  status,
  switchDisabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  desc: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  platformLabel?: string;
  status?: IntegrationStatusValue;
  switchDisabled?: boolean;
}) {
  const badgeLabel = status && status !== 'disabled'
    ? STATUS_LABELS[status] || status
    : 'No conectado';

  return (
    <View style={s.integrationRow}>
      <View style={s.integrationIconWrap}>
        <Ionicons name={icon} size={18} color={colors.textSecondary} />
      </View>
      <View style={s.integrationCopy}>
        <View style={s.integrationTitleRow}>
          <Text style={s.integrationLabel}>{label}</Text>
          <InlineBadge label={badgeLabel} />
          {platformLabel ? <InlineBadge label={platformLabel} /> : null}
        </View>
        <Text style={s.integrationDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={switchDisabled}
        trackColor={{ false: colors.surfaceMuted, true: colors.primaryBorderStrong }}
        thumbColor={value ? colors.primaryLight : colors.textMuted}
      />
    </View>
  );
}

async function persistIntegrationFromDraft(
  draft: AppSettings,
  integrationPatch: Partial<AppSettings['integration_preferences']>,
  statusPatch: Partial<IntegrationStatus>,
): Promise<AppSettings> {
  return persistAppSettingsIntegration(draft, integrationPatch, statusPatch);
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [initialized, setInitialized] = useState(false);
  const [calendarWorking, setCalendarWorking] = useState(false);
  const [healthConnectWorking, setHealthConnectWorking] = useState(false);
  const [appleHealthWorking, setAppleHealthWorking] = useState(false);
  const [mealTimePicker, setMealTimePicker] = useState<null | { slot: keyof MealReminderTimes; date: Date }>(
    null,
  );

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => api.get<AppSettings>('/api/v1/me/settings'),
  });

  const serverSettings = useMemo(() => normalizeAppSettings(data), [data]);

  useEffect(() => {
    if (initialized || !data) return;
    setDraft(serverSettings);
    setInitialized(true);
  }, [data, initialized, serverSettings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const saved = normalizeAppSettings(await api.put<AppSettings>('/api/v1/me/settings', draft));
      const notificationsReady = await syncLocalNotificationPreferences(saved.notification_preferences).catch(() => false);
      return { saved, notificationsReady };
    },
    onSuccess: ({ saved, notificationsReady }) => {
      setDraft(saved);
      queryClient.setQueryData(['app-settings'], saved);
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });

      const wantsNotifications =
        saved.notification_preferences.meal_reminders_enabled ||
        saved.notification_preferences.hydration_reminders_enabled ||
        saved.notification_preferences.weekly_plan_reminder_enabled;

      if (wantsNotifications && Platform.OS === 'web') {
        Alert.alert('Ajustes guardados', 'Las preferencias se guardaron. Los recordatorios locales solo funcionan en iOS y Android.');
        return;
      }
      if (wantsNotifications && !notificationsReady) {
        Alert.alert('Ajustes guardados', 'Las preferencias se guardaron, pero faltan permisos para activar los recordatorios.');
        return;
      }
      Alert.alert('Ajustes guardados', 'Configuración actualizada.');
    },
    onError: (e: unknown) => {
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.'));
    },
  });

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(serverSettings),
    [draft, serverSettings],
  );

  const healthConnectDesc = useMemo(
    () =>
      Platform.OS === 'android'
        ? 'Lee pasos del día vía Health Connect (Google Fit, Samsung Health u otras apps que escriban ahí). En Samsung: activa compartir con Health Connect en Ajustes de Samsung Health (conexiones / Health Connect) y concede a NutrIA lectura de pasos en la app Health Connect.'
        : 'Solo en la app NutrIA para Android: al activar se pide el permiso de pasos en el sistema. En web o en iPhone no se puede conectar; si la preferencia ya estaba activa, puedes desactivarla aquí.',
    [],
  );

  const healthConnectSwitchDisabled = useMemo(
    () =>
      healthConnectWorking ||
      saveMutation.isPending ||
      ((Platform.OS === 'web' || Platform.OS === 'ios') && !draft.integration_preferences.google_fit_enabled),
    [healthConnectWorking, saveMutation.isPending, draft.integration_preferences.google_fit_enabled],
  );

  const applyCalendarSync = useCallback(
    async (enabled: boolean) => {
      setCalendarWorking(true);
      try {
        if (!enabled) {
          try {
            const plan = await api.get<DietPlan | null>('/api/v1/plans/current', { nullOn404: true });
            if (plan?.id && Platform.OS !== 'web') {
              await removeCalendarEvents(plan.id);
            }
          } catch {
            /* ignore */
          }
          const saved = await persistIntegrationFromDraft(draft, { calendar_sync_enabled: false }, {
            calendar: 'disabled',
            last_error: undefined,
            last_sync_at: undefined,
          });
          setDraft(saved);
          queryClient.setQueryData(['app-settings'], saved);
          return;
        }

        if (Platform.OS === 'web') {
          const saved = await persistIntegrationFromDraft(draft, { calendar_sync_enabled: true }, {
            calendar: 'enabled_pending',
            last_error: 'La exportación al calendario del sistema no está disponible en el navegador.',
          });
          setDraft(saved);
          queryClient.setQueryData(['app-settings'], saved);
          Alert.alert(
            'Calendario',
            'En la web no hay acceso al calendario del dispositivo. Instala la app en iOS o Android para exportar el plan.',
          );
          return;
        }

        const granted = await requestCalendarPermission();
        if (!granted) {
          const saved = await persistIntegrationFromDraft(draft, { calendar_sync_enabled: true }, {
            calendar: 'permission_denied',
            last_error: 'Permisos de calendario denegados',
          });
          setDraft(saved);
          queryClient.setQueryData(['app-settings'], saved);
          Alert.alert(
            'Calendario',
            'Sin permiso no podemos crear eventos. Activa el calendario en Ajustes del sistema.',
          );
          return;
        }

        const plan = await api.get<DietPlan | null>('/api/v1/plans/current', { nullOn404: true });
        if (!plan?.days?.length) {
          const saved = await persistIntegrationFromDraft(draft, { calendar_sync_enabled: true }, {
            calendar: 'connected',
            last_sync_at: new Date().toISOString(),
            last_error: 'No hay plan con comidas para exportar',
          });
          setDraft(saved);
          queryClient.setQueryData(['app-settings'], saved);
          Alert.alert(
            'Calendario',
            'No tienes un plan activo con comidas. Ve a Plan, genera o activa un plan y vuelve a activar esta opción.',
          );
          return;
        }

        try {
          await removeCalendarEvents(plan.id);
        } catch {
          /* ignore */
        }

        const result = await exportPlanToCalendar(plan);
        const now = new Date().toISOString();
        if (!result.success) {
          const saved = await persistIntegrationFromDraft(draft, { calendar_sync_enabled: true }, {
            calendar: 'sync_error',
            last_sync_at: now,
            last_error: result.error ?? 'Error al exportar',
          });
          setDraft(saved);
          queryClient.setQueryData(['app-settings'], saved);
          Alert.alert(
            'Calendario',
            toUserFacingErrorMessage(result.error ?? '', 'No se pudo exportar.'),
          );
          return;
        }

        const saved = await persistIntegrationFromDraft(draft, { calendar_sync_enabled: true }, {
          calendar: 'connected',
          last_sync_at: now,
          last_error: undefined,
        });
        setDraft(saved);
        queryClient.setQueryData(['app-settings'], saved);
        Alert.alert(
          'Calendario',
          `Listo: se añadieron ${result.eventsCreated} eventos a tu calendario «NutrIA - Plan semanal».`,
        );
      } catch (e) {
        Alert.alert('Calendario', toUserFacingErrorMessage(e, 'Algo salió mal.'));
      } finally {
        setCalendarWorking(false);
      }
    },
    [draft, queryClient],
  );

  const applyHealthConnect = useCallback(
    async (enabled: boolean) => {
      if (Platform.OS !== 'android') {
        if (enabled) {
          Alert.alert(
            'Health Connect',
            'La conexión con Health Connect y el permiso de pasos del sistema solo están disponibles en la app NutrIA para Android. Abre o instala la app en un móvil Android y actívalo en Integraciones.',
          );
          return;
        }
        setIntegrationPref('google_fit_enabled', false);
        return;
      }

      if (!enabled) {
        setHealthConnectWorking(true);
        try {
          const saved = await persistIntegrationFromDraft(draft, { google_fit_enabled: false }, {
            google_fit: 'disabled',
          });
          setDraft(saved);
          queryClient.setQueryData(['app-settings'], saved);
        } catch (e) {
          Alert.alert('Health Connect', toUserFacingErrorMessage(e, 'No se pudo actualizar.'));
        } finally {
          setHealthConnectWorking(false);
        }
        return;
      }

      setHealthConnectWorking(true);
      try {
        const result = await connectAndroidHealthConnectAndReadStepsToday();
        const now = new Date().toISOString();

        if (!result.ok) {
          if (result.code === 'native_module_unavailable') {
            const saved = await persistIntegrationFromDraft(draft, { google_fit_enabled: false }, {
              google_fit: 'disabled',
              last_error: result.message,
            });
            setDraft(saved);
            queryClient.setQueryData(['app-settings'], saved);
            Alert.alert(
              'Health Connect',
              toUserFacingErrorMessage(result.message ?? '', 'Módulo no disponible en este entorno.'),
            );
            return;
          }
          if (result.code === 'init_failed') {
            const saved = await persistIntegrationFromDraft(draft, { google_fit_enabled: true }, {
              google_fit: 'sync_error',
              last_sync_at: now,
              last_error: result.message ?? 'Health Connect no disponible',
            });
            setDraft(saved);
            queryClient.setQueryData(['app-settings'], saved);
            Alert.alert(
              'Health Connect',
              result.message ??
                'No se pudo abrir Health Connect. Comprueba que esté instalado o actualizado en el dispositivo.',
            );
            return;
          }
          if (result.code === 'permission_denied') {
            const saved = await persistIntegrationFromDraft(draft, { google_fit_enabled: true }, {
              google_fit: 'permission_denied',
              last_error: 'Permiso de pasos denegado',
            });
            setDraft(saved);
            queryClient.setQueryData(['app-settings'], saved);
            Alert.alert(
              'Health Connect',
              'Sin permiso de «Pasos» no podemos leer tu actividad.\n\n• «Permisos de NutrIA»: abre directamente la pantalla de permisos de esta app (Android 14+).\n• «Abrir Health Connect»: ajustes generales → «Permisos y datos de la app» → busca NutrIA.',
              [
                { text: 'Cerrar', style: 'cancel' },
                {
                  text: 'Abrir Health Connect',
                  onPress: () => openAndroidHealthConnectSettings(),
                },
                {
                  text: 'Permisos de NutrIA',
                  onPress: () => openAndroidHealthConnectPermissionForThisApp(),
                },
              ],
            );
            return;
          }
          const saved = await persistIntegrationFromDraft(draft, { google_fit_enabled: true }, {
            google_fit: 'sync_error',
            last_sync_at: now,
            last_error: result.message ?? 'Error al leer pasos',
          });
          setDraft(saved);
          queryClient.setQueryData(['app-settings'], saved);
          Alert.alert(
            'Health Connect',
            toUserFacingErrorMessage(result.message ?? '', 'No se pudieron leer los pasos.'),
          );
          return;
        }

        const saved = await persistIntegrationFromDraft(draft, { google_fit_enabled: true }, {
          google_fit: 'connected',
          last_sync_at: now,
          last_error: undefined,
        });
        setDraft(saved);
        queryClient.setQueryData(['app-settings'], saved);
        Alert.alert(
          'Health Connect',
          `Conectado. Pasos de hoy en Health Connect: ${result.steps.toLocaleString('es-ES')}. En el inicio se sincronizarán al abrir «Hoy».`,
        );
      } catch (e) {
        Alert.alert('Health Connect', toUserFacingErrorMessage(e, 'Algo salió mal.'));
      } finally {
        setHealthConnectWorking(false);
      }
    },
    [draft, queryClient],
  );

  const applyAppleHealth = useCallback(
    async (enabled: boolean) => {
      if (Platform.OS !== 'ios') {
        setIntegrationPref('apple_health_enabled', enabled);
        return;
      }

      if (!enabled) {
        const draftOff = {
          ...draft,
          integration_preferences: { ...draft.integration_preferences, apple_health_enabled: false },
          integration_status: { ...draft.integration_status, apple_health: 'disabled' as const },
        };
        setDraft(draftOff);
        queryClient.setQueryData(['app-settings'], normalizeAppSettings(draftOff));
        setAppleHealthWorking(true);
        try {
          const saved = await persistIntegrationFromDraft(draftOff, { apple_health_enabled: false }, {
            apple_health: 'disabled',
          });
          setDraft(saved);
          queryClient.setQueryData(['app-settings'], saved);
        } catch (e) {
          setDraft(draft);
          queryClient.setQueryData(['app-settings'], draft);
          Alert.alert('Apple Salud', toUserFacingErrorMessage(e, 'No se pudo actualizar.'));
        } finally {
          setAppleHealthWorking(false);
        }
        return;
      }

      setAppleHealthWorking(true);
      try {
        const result = await connectAppleHealthAndReadStepsToday();
        const now = new Date().toISOString();

        if (!result.ok) {
          if (result.code === 'native_module_unavailable') {
            const saved = await persistIntegrationFromDraft(draft, { apple_health_enabled: false }, {
              apple_health: 'disabled',
              last_error: result.message,
            });
            setDraft(saved);
            queryClient.setQueryData(['app-settings'], saved);
            Alert.alert(
              'Apple Salud',
              toUserFacingErrorMessage(
                result.message ?? '',
                'Esta app no incluye el módulo de Salud en este entorno.',
              ),
            );
            return;
          }
          if (result.code === 'init_failed') {
            const saved = await persistIntegrationFromDraft(draft, { apple_health_enabled: true }, {
              apple_health: 'sync_error',
              last_sync_at: now,
              last_error: result.message ?? 'No se pudo abrir Apple Salud',
            });
            setDraft(saved);
            queryClient.setQueryData(['app-settings'], saved);
            Alert.alert(
              'Apple Salud',
              result.message ??
                'No se pudo abrir Apple Salud. Comprueba que el permiso está concedido en Ajustes → Salud → Acceso y dispositivos → NutrIA.',
            );
            return;
          }
          if (result.code === 'read_failed') {
            // En iOS no se distingue claramente "denegado" de "sin datos". Marcamos sync_error
            // y guiamos al usuario para revisar Ajustes → Salud → Acceso y dispositivos → NutrIA.
            const saved = await persistIntegrationFromDraft(draft, { apple_health_enabled: true }, {
              apple_health: 'permission_denied',
              last_error: 'No se pudieron leer pasos de Apple Salud',
            });
            setDraft(saved);
            queryClient.setQueryData(['app-settings'], saved);
            Alert.alert(
              'Apple Salud',
              'No se pudieron leer tus pasos. Revisa Ajustes → Salud → Acceso y dispositivos → NutrIA y concede lectura de Pasos.',
            );
            return;
          }
          const saved = await persistIntegrationFromDraft(draft, { apple_health_enabled: true }, {
            apple_health: 'sync_error',
            last_sync_at: now,
            last_error: result.message ?? 'Error al leer pasos',
          });
          setDraft(saved);
          queryClient.setQueryData(['app-settings'], saved);
          Alert.alert(
            'Apple Salud',
            toUserFacingErrorMessage(result.message ?? '', 'No se pudieron leer los pasos.'),
          );
          return;
        }

        const saved = await persistIntegrationFromDraft(draft, { apple_health_enabled: true }, {
          apple_health: 'connected',
          last_sync_at: now,
          last_error: undefined,
        });
        setDraft(saved);
        queryClient.setQueryData(['app-settings'], saved);
        Alert.alert(
          'Apple Salud',
          `Conectado. Pasos de hoy en Apple Salud: ${result.steps.toLocaleString('es-ES')}. En el inicio se sincronizarán al abrir «Hoy».`,
        );
      } catch (e) {
        Alert.alert('Apple Salud', toUserFacingErrorMessage(e, 'Algo salió mal.'));
      } finally {
        setAppleHealthWorking(false);
      }
    },
    [draft, queryClient],
  );

  function setPlanPref<K extends keyof AppSettings['plan_preferences']>(
    key: K,
    value: AppSettings['plan_preferences'][K],
  ) {
    setDraft((prev) => ({
      ...prev,
      plan_preferences: {
        ...prev.plan_preferences,
        [key]: value,
      },
    }));
  }

  function setNotificationPref<K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) {
    setDraft((prev) => ({
      ...prev,
      notification_preferences: {
        ...prev.notification_preferences,
        [key]: value,
      },
    }));
  }

  function setMealReminderTime(slot: keyof MealReminderTimes, time: string) {
    setDraft((prev) => ({
      ...prev,
      notification_preferences: {
        ...prev.notification_preferences,
        meal_reminder_times: {
          ...prev.notification_preferences.meal_reminder_times,
          [slot]: time,
        },
      },
    }));
  }

  function setIntegrationPref<K extends keyof IntegrationPreferences>(key: K, value: IntegrationPreferences[K]) {
    setDraft((prev) => ({
      ...prev,
      integration_preferences: {
        ...prev.integration_preferences,
        [key]: value,
      },
    }));
  }

  if (isLoading && !initialized) return <LoadingScreen />;

  if (isError && !initialized) {
    return (
      <View style={[s.container, s.centered]}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.textMuted} />
        <Text style={s.errorTitle}>No se pudo cargar la configuración</Text>
        <Text style={s.errorBody}>Comprueba tu conexión y vuelve a intentarlo.</Text>
        <Button title="Reintentar" onPress={() => void refetch()} size="lg" style={s.retryBtn} />
      </View>
    );
  }

  return (
    <>
    <ScrollView
      style={s.container}
      contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 24) + 32 }]}
    >
      <SectionTitle
        title="Preferencias de planes"
        hint="Controla cómo se muestran y qué tono deben seguir los planes nuevos."
      />
      <Surface variant="subtle" padding="lg" style={s.section}>
        <SwitchRow
          icon="chevron-collapse-outline"
          label="Comidas cerradas al abrir"
          desc="Al entrar al plan semanal, las comidas aparecerán plegadas."
          value={draft.plan_preferences.meals_collapsed_by_default}
          onValueChange={(value) => setPlanPref('meals_collapsed_by_default', value)}
        />
        <View style={s.divider} />
        <SwitchRow
          icon="archive-outline"
          label="Ocultar versiones archivadas"
          desc="En la biblioteca de planes se prioriza la versión activa."
          value={draft.plan_preferences.hide_archived_plans}
          onValueChange={(value) => setPlanPref('hide_archived_plans', value)}
        />
      </Surface>

      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => router.push('/(tabs)/premium' as never)}
        accessibilityRole="button"
        accessibilityLabel="Ver NutrIA Premium"
      >
        <Surface variant="subtle" padding="lg" style={s.premiumLink}>
          <View style={s.premiumLinkRow}>
            <View style={s.premiumLinkIcon}>
              <Ionicons name="sparkles" size={iconSize.md} color={colors.primaryLight} />
            </View>
            <View style={s.premiumLinkCopy}>
              <Text style={s.premiumLinkTitle}>NutrIA Premium</Text>
              <Text style={s.premiumLinkDesc}>Uso ilimitado: chat, visión, plan IA completo, recetas y regeneración.</Text>
            </View>
            <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
          </View>
        </Surface>
      </TouchableOpacity>

      <SectionTitle
        title="Notificaciones"
        hint="Recordatorios locales: una alerta por desayuno, comida, merienda y cena; también agua y repaso semanal."
      />
      <Surface variant="subtle" padding="lg" style={s.section}>
        <SwitchRow
          icon="restaurant-outline"
          label="Recordatorios por comida"
          desc="Cuatro avisos al día. Toca la hora de cada comida para elegir cualquier minuto."
          value={draft.notification_preferences.meal_reminders_enabled}
          onValueChange={(value) => setNotificationPref('meal_reminders_enabled', value)}
          trailing={
            <InlineBadge
              label={[
                draft.notification_preferences.meal_reminder_times.breakfast,
                draft.notification_preferences.meal_reminder_times.lunch,
                draft.notification_preferences.meal_reminder_times.snack,
                draft.notification_preferences.meal_reminder_times.dinner,
              ].join(' · ')}
            />
          }
        />
        {draft.notification_preferences.meal_reminders_enabled ? (
          <View style={s.mealSlotsGrid}>
            {MEAL_REMINDER_GRID_ROWS.map((row, rowIdx) => (
              <View key={rowIdx} style={s.mealSlotsRow}>
                {row.map(({ key, label }) => (
                  <View key={key} style={s.mealSlotCell}>
                    <Text style={s.mealSlotTitle} numberOfLines={1}>
                      {label}
                    </Text>
                    {Platform.OS === 'web' ? (
                      <WebMealTimeField
                        value={draft.notification_preferences.meal_reminder_times[key]}
                        fallback={DEFAULT_MEAL_REMINDER_TIMES[key]}
                        onCommit={(v) => setMealReminderTime(key, v)}
                      />
                    ) : (
                      <TouchableOpacity
                        style={s.mealTimePickBtn}
                        onPress={() =>
                          setMealTimePicker({
                            slot: key,
                            date: timeStringToTodayDate(draft.notification_preferences.meal_reminder_times[key]),
                          })
                        }
                        activeOpacity={0.85}
                      >
                        <Text style={s.mealTimePickBtnText}>
                          {draft.notification_preferences.meal_reminder_times[key]}
                        </Text>
                        <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.divider} />

        <SwitchRow
          icon="water-outline"
          label="Recordatorio de agua"
          desc="Repite una notificación durante el día para no olvidarte de beber."
          value={draft.notification_preferences.hydration_reminders_enabled}
          onValueChange={(value) => setNotificationPref('hydration_reminders_enabled', value)}
          trailing={<InlineBadge label={`${draft.notification_preferences.hydration_interval_minutes} min`} />}
        />
        {draft.notification_preferences.hydration_reminders_enabled ? (
          <View style={s.inlineChoices}>
            {HYDRATION_INTERVAL_OPTIONS.map((minutes) => (
              <ChoiceChip
                key={minutes}
                label={`${minutes} min`}
                selected={draft.notification_preferences.hydration_interval_minutes === minutes}
                onPress={() => setNotificationPref('hydration_interval_minutes', minutes)}
              />
            ))}
          </View>
        ) : null}

        <View style={s.divider} />

        <SwitchRow
          icon="calendar-outline"
          label="Repaso semanal del plan"
          desc="Ideal para revisar la compra, mover comidas o regenerar la semana."
          value={draft.notification_preferences.weekly_plan_reminder_enabled}
          onValueChange={(value) => setNotificationPref('weekly_plan_reminder_enabled', value)}
          trailing={
            <InlineBadge
              label={`${WEEKDAY_OPTIONS.find((d) => d.value === draft.notification_preferences.weekly_plan_reminder_day)?.label ?? 'Dom'} · ${draft.notification_preferences.weekly_plan_reminder_time}`}
            />
          }
        />
        {draft.notification_preferences.weekly_plan_reminder_enabled ? (
          <>
            <View style={s.inlineChoices}>
              {WEEKDAY_OPTIONS.map((day) => (
                <ChoiceChip
                  key={day.value}
                  label={day.label}
                  selected={draft.notification_preferences.weekly_plan_reminder_day === day.value}
                  onPress={() => setNotificationPref('weekly_plan_reminder_day', day.value as ReminderWeekday)}
                />
              ))}
            </View>
            <View style={s.inlineChoices}>
              {WEEKLY_REMINDER_TIME_OPTIONS.map((time) => (
                <ChoiceChip
                  key={time}
                  label={time}
                  selected={draft.notification_preferences.weekly_plan_reminder_time === time}
                  onPress={() => setNotificationPref('weekly_plan_reminder_time', time)}
                />
              ))}
            </View>
          </>
        ) : null}

        <Text style={s.microHint}>
          {Platform.OS === 'web'
            ? 'En web guardamos la preferencia, pero los recordatorios locales solo se programan en iOS y Android.'
            : 'Al guardar, la app pedirá permisos si activas algún recordatorio.'}
        </Text>
      </Surface>

      <SectionTitle
        title="Integraciones"
        hint="Preferencias guardadas en la cuenta; la conexión real depende del sistema (Health, calendario, etc.)."
      />
      <Surface variant="subtle" padding="lg" style={s.section}>
        <IntegrationRow
          icon="heart-outline"
          label="Apple Health"
          desc="Lee pasos del día desde Apple Salud para mostrarlos en el inicio. Tras activar, concede lectura de Pasos en el diálogo del sistema."
          value={draft.integration_preferences.apple_health_enabled}
          onValueChange={(value) => {
            void applyAppleHealth(value);
          }}
          platformLabel="iOS"
          status={draft.integration_status?.apple_health}
          switchDisabled={appleHealthWorking || saveMutation.isPending}
        />
        <View style={s.divider} />
        <IntegrationRow
          icon="fitness-outline"
          label="Health Connect"
          desc={healthConnectDesc}
          value={draft.integration_preferences.google_fit_enabled}
          onValueChange={(value) => {
            void applyHealthConnect(value);
          }}
          platformLabel="Android"
          status={draft.integration_status?.google_fit}
          switchDisabled={healthConnectSwitchDisabled}
        />
        <View style={s.divider} />
        <IntegrationRow
          icon="calendar-clear-outline"
          label="Calendario"
          desc="Exporta tu plan semanal al calendario del dispositivo."
          value={draft.integration_preferences.calendar_sync_enabled}
          onValueChange={(value) => {
            void applyCalendarSync(value);
          }}
          status={draft.integration_status?.calendar}
          switchDisabled={calendarWorking || saveMutation.isPending}
        />
        <Text style={s.microHint}>
          {Platform.OS === 'web'
            ? 'En web solo guardamos la preferencia. Exportar eventos: app iOS/Android.'
            : 'Al activar, pedimos permiso y creamos o usamos el calendario «NutrIA - Plan semanal». Un evento por comida (lunes–domingo): en el título, nombre del plato con kcal y macros; hora orientativa por tipo de comida; en notas, lista de alimentos. Sin recordatorios del sistema. Antes de volver a exportar, borramos los eventos previos de ese plan. Al desactivar, intentamos borrar esos eventos. Si cambias mucho el plan, vuelve a sincronizar.'}
        </Text>
      </Surface>

      <Button
        title={saveMutation.isPending ? 'Guardando...' : 'Guardar ajustes'}
        onPress={() => saveMutation.mutate()}
        disabled={!isDirty || saveMutation.isPending || isFetching}
        loading={saveMutation.isPending}
        size="lg"
        style={s.saveBtn}
      />

      {isFetching && !saveMutation.isPending ? (
        <View style={s.fetchingRow}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={s.fetchingText}>Sincronizando ajustes…</Text>
        </View>
      ) : null}
    </ScrollView>

    {mealTimePicker && Platform.OS === 'ios' ? (
      <Modal transparent visible animationType="slide" onRequestClose={() => setMealTimePicker(null)}>
        <View style={s.mealPickerRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setMealTimePicker(null)}
          />
          <View style={[s.mealPickerSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={s.mealPickerHeader}>
              <TouchableOpacity onPress={() => setMealTimePicker(null)} hitSlop={12}>
                <Text style={s.mealPickerHeaderBtn}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (mealTimePicker) {
                    setMealReminderTime(mealTimePicker.slot, dateToTimeString(mealTimePicker.date));
                    setMealTimePicker(null);
                  }
                }}
                hitSlop={12}
              >
                <Text style={s.mealPickerHeaderBtnPrimary}>Listo</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={mealTimePicker.date}
              mode="time"
              display="spinner"
              minuteInterval={1}
              locale="es_ES"
              onChange={(_, date) => {
                if (date) {
                  setMealTimePicker((p) => (p ? { ...p, date } : p));
                }
              }}
            />
          </View>
        </View>
      </Modal>
    ) : null}

    {mealTimePicker && Platform.OS === 'android' ? (
      <DateTimePicker
        value={mealTimePicker.date}
        mode="time"
        display="default"
        is24Hour
        minuteInterval={1}
        onChange={(event, date) => {
          const slot = mealTimePicker.slot;
          setMealTimePicker(null);
          if (event.type === 'dismissed') return;
          if (date) {
            setMealReminderTime(slot, dateToTimeString(date));
          }
        }}
      />
    ) : null}
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md, gap: spacing.md },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: screenPaddingX,
  },
  sectionHead: { gap: 4, marginTop: spacing.xs },
  sectionTitle: { ...typography.sectionTitle, color: colors.text },
  sectionHint: { ...typography.small, color: colors.textSecondary, lineHeight: 20 },
  section: { gap: spacing.md },
  premiumLink: {
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  premiumLinkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  premiumLinkIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumLinkCopy: { flex: 1, minWidth: 0, gap: 2 },
  premiumLinkTitle: { ...typography.bodyBold, color: colors.text },
  premiumLinkDesc: { ...typography.caption, color: colors.textMuted },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
  },
  switchTrailing: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  switchIconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  switchCopy: { flex: 1, gap: 2 },
  switchLabel: { ...typography.body, color: colors.text },
  switchDesc: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
  divider: { height: hairlineWidth, backgroundColor: colors.border },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  inlineChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  mealSlotsGrid: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  mealSlotsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    /* Separación entre columna izquierda (Desayuno/Merienda + hora) y derecha (Comida/Cena + hora) */
    gap: spacing.xl,
  },
  mealSlotCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mealSlotTitle: {
    ...typography.small,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 14,
    width: 76,
    flexShrink: 0,
    textAlign: 'left',
    paddingRight: spacing.xs,
  },
  mealTimePickBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  mealTimePickBtnText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  mealTimeInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  mealPickerRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  mealPickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.sm,
  },
  mealPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  mealPickerHeaderBtn: { ...typography.body, color: colors.textSecondary },
  mealPickerHeaderBtnPrimary: { ...typography.body, color: colors.primaryLight, fontWeight: '600' },
  choiceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    gap: 2,
    minWidth: 92,
  },
  choiceChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryBorderStrong,
  },
  choiceChipLabel: { ...typography.captionBold, color: colors.textSecondary },
  choiceChipLabelActive: { color: colors.text },
  choiceChipHint: { ...typography.caption, color: colors.textMuted, lineHeight: 16 },
  choiceChipHintActive: { color: colors.textSecondary },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  badgeText: { ...typography.micro, color: colors.textMuted, fontWeight: '700' },
  microHint: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },
  integrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  integrationIconWrap: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  integrationCopy: { flex: 1, gap: 4 },
  integrationTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  integrationLabel: { ...typography.body, color: colors.text },
  integrationDesc: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
  saveBtn: { marginTop: spacing.sm },
  fetchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  fetchingText: { ...typography.caption, color: colors.textMuted },
  errorTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginTop: spacing.md,
  },
  errorBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 340,
  },
  retryBtn: { marginTop: spacing.lg, minWidth: 180 },
});
