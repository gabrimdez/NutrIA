import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Share,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getVisiblePlanHistory, normalizeAppSettings } from '../../../src/lib/appSettings';
import { api, PLAN_API_TIMEOUT_MS } from '../../../src/lib/api';
import { Button, LoadingScreen, ScreenFocusProvider, SlideUpView, StaggerItem } from '../../../src/components';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  screenPaddingX,
  hairlineWidth,
  DOCK_H,
  DOCK_MARGIN_BOTTOM,
  elevation,
  actionIntentStyles,
  iconSize,
} from '../../../src/theme';
import { AppSettings, DietPlan, PlanSummary, Profile } from '../../../src/types';
import { formatPlanForExport } from '../../../src/lib/planExport';
import { isNonPremiumTier, navigateToPremiumUpgrade } from '../../../src/lib/planAiPremiumGate';
import { PLAN_SCREEN_HERO_ICON } from '../../../src/assets/planTabIcon';

const EMPTY: PlanSummary[] = [];
const MAX_PLAN_LABEL_LEN = 200;
const PLAN_LIST_PAGE_SIZE = 5;

function formatPlanDate(iso: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

function syncPlanDetailCaches(queryClient: ReturnType<typeof useQueryClient>, data: DietPlan) {
  if (data.is_active) {
    queryClient.setQueryData<DietPlan>(['plan', 'current'], data);
  }
  queryClient.setQueryData<DietPlan>(['plan', String(data.id)], data);
}

function patchPlanHistoryLabelInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  planId: string,
  label: string | null | undefined,
) {
  queryClient.setQueryData<PlanSummary[]>(['planHistory'], (old) => {
    if (!Array.isArray(old)) return old;
    const pid = String(planId);
    const next = label?.trim() ? label.trim() : undefined;
    return old.map((p) => (String(p.id) === pid ? { ...p, label: next } : p));
  });
}

export default function PlanManagementScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<PlanSummary | null>(null);
  const [exportingPlanId, setExportingPlanId] = useState<string | null>(null);
  const [creationChoiceOpen, setCreationChoiceOpen] = useState(false);
  /** Menú de acciones del plan (modal en todas las plataformas: Alert es no-op en web). */
  const [planActionsItem, setPlanActionsItem] = useState<PlanSummary | null>(null);
  const [planSheetPane, setPlanSheetPane] = useState<'menu' | 'rename'>('menu');
  const [renameDraft, setRenameDraft] = useState('');
  const [planListPage, setPlanListPage] = useState(1);

  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 20;

  const { data: profile, isFetched: profileFetched } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/api/v1/me/profile'),
    staleTime: 60_000,
  });

  const {
    data: planHistoryData,
    isFetched,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['planHistory'],
    queryFn: () => api.get<PlanSummary[]>('/api/v1/plans/history'),
    placeholderData: keepPreviousData,
    retry: (failureCount, err) => {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('401') || msg.includes('sesión') || msg.includes('Inicia sesión')) return false;
      return failureCount < 2;
    },
  });

  useFocusEffect(
    useCallback(() => {
      const state = queryClient.getQueryState(['planHistory']);
      const isStale = !state?.dataUpdatedAt || Date.now() - state.dataUpdatedAt > 2 * 60_000;
      if (isStale) void refetch();
    }, [refetch, queryClient]),
  );

  const rawList = Array.isArray(planHistoryData) ? planHistoryData : EMPTY;
  const { data: settingsData } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => api.get<AppSettings>('/api/v1/me/settings'),
    staleTime: 10 * 60_000,
  });
  const settings = useMemo(() => normalizeAppSettings(settingsData), [settingsData]);

  const sortedPlans = useMemo(() => {
    return [...rawList].sort((a, b) => {
      if (b.version !== a.version) return b.version - a.version;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [rawList]);

  const visiblePlans = useMemo(
    () => getVisiblePlanHistory(sortedPlans, settings.plan_preferences.hide_archived_plans),
    [sortedPlans, settings.plan_preferences.hide_archived_plans],
  );

  const planPageCount = Math.max(1, Math.ceil(visiblePlans.length / PLAN_LIST_PAGE_SIZE));
  const currentPlanPage = Math.min(planListPage, planPageCount);

  useEffect(() => {
    if (planListPage !== currentPlanPage) {
      setPlanListPage(currentPlanPage);
    }
  }, [currentPlanPage, planListPage]);

  const paginatedPlans = useMemo(() => {
    const start = (currentPlanPage - 1) * PLAN_LIST_PAGE_SIZE;
    return visiblePlans.slice(start, start + PLAN_LIST_PAGE_SIZE);
  }, [currentPlanPage, visiblePlans]);

  const pageRangeLabel = useMemo(() => {
    if (visiblePlans.length === 0) return '0-0';
    const start = (currentPlanPage - 1) * PLAN_LIST_PAGE_SIZE + 1;
    const end = Math.min(currentPlanPage * PLAN_LIST_PAGE_SIZE, visiblePlans.length);
    return `${start}-${end}`;
  }, [currentPlanPage, visiblePlans.length]);

  const activePlan = useMemo(() => {
    const byFlag = sortedPlans.find((p) => p.is_active);
    return byFlag ?? sortedPlans[0] ?? null;
  }, [sortedPlans]);

  const activateMutation = useMutation({
    mutationFn: (planId: string) =>
      api.post<DietPlan>(`/api/v1/plans/${planId}/activate`, {}, { timeoutMs: PLAN_API_TIMEOUT_MS }),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
    },
    onError: (e: Error & { message?: string }) =>
      Alert.alert('No se pudo activar', e.message || 'Inténtalo de nuevo.'),
  });

  const createManualMutation = useMutation({
    mutationFn: () =>
      api.post<DietPlan>('/api/v1/plans/manual', {}, { timeoutMs: PLAN_API_TIMEOUT_MS }),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      setCreationChoiceOpen(false);
      router.push({ pathname: '/(tabs)/plan/weekly', params: { planId: data.id } } as never);
    },
    onError: (e: Error) => Alert.alert('No se pudo crear el plan', e.message || 'Inténtalo de nuevo.'),
  });

  const duplicateMutation = useMutation({
    mutationFn: (planId: string) =>
      api.post<DietPlan>(`/api/v1/plans/${planId}/duplicate`, {}, { timeoutMs: PLAN_API_TIMEOUT_MS }),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      if (Platform.OS !== 'web') {
        Alert.alert('Plan duplicado', `Se creó la versión v${data.version} como copia.`);
      }
    },
    onError: (e: Error) => Alert.alert('No se pudo duplicar', e.message || 'Inténtalo de nuevo.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (planId: string) => api.delete(`/api/v1/plans/${planId}`),
    onSuccess: (_, planId) => {
      const pid = String(planId);
      queryClient.removeQueries({ queryKey: ['plan', 'current'] });
      queryClient.removeQueries({ queryKey: ['plan', planId] });
      queryClient.removeQueries({
        predicate: (q) => {
          const k = q.queryKey;
          if (!Array.isArray(k) || k[0] !== 'plan' || k.length < 2) return false;
          const data = q.state.data as DietPlan | null | undefined;
          if (data && typeof data === 'object' && data.id != null && String(data.id) === pid) return true;
          return String(k[1]) === pid;
        },
      });
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => Alert.alert('No se pudo eliminar', e.message || 'Inténtalo de nuevo.'),
  });

  const closeDelete = useCallback(() => {
    if (!deleteMutation.isPending) setDeleteTarget(null);
  }, [deleteMutation.isPending]);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  }, [deleteTarget, deleteMutation]);

  const openWeeklyCurrent = useCallback(() => {
    router.push('/(tabs)/plan/weekly' as never);
  }, []);

  const openCreationChoice = useCallback(() => setCreationChoiceOpen(true), []);

  const closeCreationChoice = useCallback(() => {
    if (!createManualMutation.isPending) setCreationChoiceOpen(false);
  }, [createManualMutation.isPending]);

  const chooseIaPlan = useCallback(() => {
    setCreationChoiceOpen(false);
    if (profileFetched && isNonPremiumTier(profile?.subscription_tier)) {
      navigateToPremiumUpgrade();
      return;
    }
    if (sortedPlans.length > 0) {
      router.push({ pathname: '/(tabs)/plan/weekly', params: { mode: 'ia' } } as never);
    } else {
      router.push('/(tabs)/plan/weekly' as never);
    }
  }, [sortedPlans.length, profileFetched, profile?.subscription_tier]);

  const openWeeklyVersion = useCallback((planId: string) => {
    router.push({ pathname: '/(tabs)/plan/weekly', params: { planId } } as never);
  }, []);

  const exportPlanById = useCallback(async (planId: string) => {
    setExportingPlanId(planId);
    try {
      const p = await api.get<DietPlan>(`/api/v1/plans/${planId}`);
      const text = formatPlanForExport(p);
      await Share.share({ message: text, title: `Plan semanal v${p.version}` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Inténtalo de nuevo.';
      Alert.alert('No se pudo exportar', msg);
    } finally {
      setExportingPlanId(null);
    }
  }, []);

  const closePlanActionsModal = useCallback(() => {
    setPlanActionsItem(null);
    setPlanSheetPane('menu');
    setRenameDraft('');
  }, []);

  const openPlanRowMenu = useCallback((item: PlanSummary) => {
    setPlanActionsItem(item);
    setPlanSheetPane('menu');
    setRenameDraft(item.label?.trim() ?? '');
  }, []);

  const patchPlanLabelMutation = useMutation({
    mutationFn: ({ planId, label }: { planId: string; label: string }) =>
      api.patch<DietPlan>(`/api/v1/plans/${planId}/label`, { label }, { timeoutMs: PLAN_API_TIMEOUT_MS }),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      patchPlanHistoryLabelInCache(queryClient, data.id, data.label);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      closePlanActionsModal();
    },
    onError: (e: Error) => Alert.alert('No se pudo guardar el nombre', e.message || 'Inténtalo de nuevo.'),
  });

  const openShopping = useCallback((planId: string) => {
    router.push({ pathname: '/shopping-list', params: { planId } } as never);
  }, []);

  if (!isFetched && isPending) {
    return <LoadingScreen />;
  }

  if (isError && rawList.length === 0) {
    return (
      <ScreenFocusProvider>
        <View
          style={[
            styles.centered,
            {
              paddingTop: Math.max(insets.top, spacing.md) + spacing.lg,
              paddingBottom: bottomPad,
              paddingHorizontal: screenPaddingX,
            },
          ]}
        >
          <View style={styles.errorIconWrap}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          </View>
          <Text style={styles.errorTitle}>No se pudo cargar</Text>
          <Text style={styles.errorSub}>Revisa la conexión e inténtalo de nuevo.</Text>
          <Button title="Reintentar" onPress={() => refetch()} size="lg" />
        </View>
      </ScreenFocusProvider>
    );
  }

  const hasPlans = sortedPlans.length > 0;
  const activePlanTitle = activePlan?.label?.trim()
    ? activePlan.label.trim()
    : `Versión v${activePlan?.version ?? '—'}`;
  const activePlanDate = activePlan ? formatPlanDate(activePlan.created_at) : '';
  const hasActivePlan = activePlan?.is_active === true;
  const activeOverviewValue = hasActivePlan ? activePlanTitle : '—';

  return (
    <ScreenFocusProvider>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.scrollInner,
          {
            paddingTop: Math.max(insets.top, spacing.md) + spacing.sm,
            paddingBottom: bottomPad,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SlideUpView delay={0} duration={420} distance={18}>
          <View style={styles.pageHeader}>
            <View style={styles.pageHeaderCopy}>
              <Text style={styles.pageKicker}>Planificación</Text>
              <Text style={styles.pageTitle}>Planes</Text>
              <Text style={styles.pageSubtitle}>
                {hasPlans
                  ? 'Tu plan semanal, versiones y acciones clave en una vista ordenada.'
                  : 'Crea una semana base manual o genera una propuesta con IA.'}
              </Text>
            </View>
            {hasPlans ? (
              <TouchableOpacity style={styles.headerCreateBtn} onPress={openCreationChoice} activeOpacity={0.88}>
                <Ionicons name="add" size={20} color={colors.white} />
                <Text style={styles.headerCreateBtnText}>Nuevo</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </SlideUpView>

        {hasPlans ? (
          <SlideUpView delay={80} duration={430} distance={18}>
            <View style={styles.overviewGrid}>
              <View style={styles.overviewCard}>
                <Text style={styles.overviewValue} numberOfLines={1}>
                  {activeOverviewValue}
                </Text>
                <Text style={styles.overviewLabel}>Activo</Text>
              </View>
              <View style={styles.overviewCard}>
                <Text style={styles.overviewValue}>{sortedPlans.length}</Text>
                <Text style={styles.overviewLabel}>Planes creados</Text>
              </View>
              <View style={styles.overviewCard}>
                <Text style={styles.overviewValue}>
                  {activePlan ? Math.round(activePlan.target_kcal).toLocaleString('es-ES') : '—'}
                </Text>
                <Text style={styles.overviewLabel}>kcal/día</Text>
              </View>
            </View>
          </SlideUpView>
        ) : null}

        {!hasPlans ? (
          <SlideUpView delay={100} duration={440} distance={20}>
            <View style={styles.creationSection}>
              <TouchableOpacity style={styles.creationHeroCard} onPress={openCreationChoice} activeOpacity={0.9}>
                <View style={styles.creationHeroInner}>
                  <View style={styles.creationHeroIconWrap}>
                    <Ionicons name="sparkles" size={26} color={colors.primaryLight} />
                  </View>
                  <View style={styles.creationHeroTextCol}>
                    <Text style={styles.creationHeroTitle}>Crear tu primer plan</Text>
                    <Text style={styles.creationHeroSub}>
                      Manual o IA, con tus objetivos como punto de partida.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            </View>
          </SlideUpView>
        ) : null}

        {!hasPlans ? (
          <SlideUpView delay={180} duration={460} distance={22}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyInner}>
                <View style={styles.emptyIconFrame}>
                  <Ionicons name="restaurant-outline" size={30} color={colors.primaryLight} />
                </View>
                <Text style={styles.emptyTitle}>Todo listo para empezar</Text>
                <Text style={styles.emptyBody}>
                  Crea tu primera semana y mantén tus versiones organizadas desde aquí.
                </Text>
              </View>
            </View>
          </SlideUpView>
        ) : (
          <>
            <SlideUpView delay={150} duration={480} distance={22}>
              <View style={styles.heroCard}>
                <View style={styles.heroBody}>
                  <View style={styles.heroHeaderBar}>
                    <Text style={styles.heroLabel}>{hasActivePlan ? 'Plan activo' : 'Último plan'}</Text>
                    {activePlan?.is_active ? (
                      <View style={styles.pillActive}>
                        <View style={styles.pillActiveDot} />
                        <Text style={styles.pillActiveText}>Activo</Text>
                      </View>
                    ) : (
                      <View style={styles.pillWarn}>
                        <Text style={styles.pillWarnText}>Sin activo</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.heroTop}>
                    <View style={styles.heroIconFrame}>
                      <Image
                        source={PLAN_SCREEN_HERO_ICON}
                        style={styles.heroPlanIconImg}
                        contentFit="contain"
                        accessibilityIgnoresInvertColors
                      />
                    </View>
                    <View style={styles.heroTitles}>
                      <Text style={styles.heroName} numberOfLines={2}>
                        {activePlanTitle}
                      </Text>
                      <View style={styles.heroInfoLine}>
                        <Ionicons name="calendar-clear-outline" size={14} color={colors.textMuted} />
                        <Text style={styles.heroDate}>{activePlanDate}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.macroGrid}>
                    <View style={styles.macroCell}>
                      <View style={styles.macroCellHead}>
                        <View style={[styles.macroIcon, styles.macroIconKcal]}>
                          <Ionicons name="flame-outline" size={14} color={colors.calories} />
                        </View>
                        <Text style={styles.macroLabel}>Objetivo</Text>
                      </View>
                      <Text style={styles.macroValue}>
                        {activePlan ? `${Math.round(activePlan.target_kcal).toLocaleString('es-ES')} kcal` : '—'}
                      </Text>
                      <Text style={styles.macroUnit}>por día</Text>
                    </View>
                    <View style={styles.macroCell}>
                      <View style={styles.macroCellHead}>
                        <View style={[styles.macroIcon, styles.macroIconProtein]}>
                          <Ionicons name="barbell-outline" size={14} color={colors.protein} />
                        </View>
                        <Text style={styles.macroLabel}>Proteína</Text>
                      </View>
                      <Text style={styles.macroValue}>
                        {activePlan?.target_protein_g != null ? `${Math.round(activePlan.target_protein_g)} g` : '—'}
                      </Text>
                      <Text style={styles.macroUnit}>por día</Text>
                    </View>
                  </View>

                  <View style={styles.heroActions}>
                    <TouchableOpacity style={styles.primaryCta} onPress={openWeeklyCurrent} activeOpacity={0.9}>
                      <Ionicons name="calendar-outline" size={iconSize.md} color={colors.white} />
                      <Text style={styles.primaryCtaText}>Abrir semana</Text>
                    </TouchableOpacity>
                    {activePlan ? (
                      <TouchableOpacity
                        style={styles.secondaryCta}
                        onPress={() => openShopping(activePlan.id)}
                        activeOpacity={0.88}
                        accessibilityRole="button"
                        accessibilityLabel="Abrir lista de compra"
                      >
                        <Ionicons name="cart-outline" size={18} color={colors.primaryLight} />
                        <Text style={styles.secondaryCtaText}>Compra</Text>
                      </TouchableOpacity>
                    ) : null}
                    {activePlan ? (
                      <TouchableOpacity
                        style={styles.tertiaryRow}
                        onPress={() => void exportPlanById(activePlan.id)}
                        disabled={exportingPlanId === activePlan.id}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Exportar plan como texto"
                      >
                        {exportingPlanId === activePlan.id ? (
                          <ActivityIndicator size="small" color={colors.textSecondary} />
                        ) : (
                          <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
                        )}
                        <Text style={styles.tertiaryRowText}>Exportar</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            </SlideUpView>

            <SlideUpView delay={230} duration={440} distance={18}>
              <View style={styles.toolsRow}>
                <TouchableOpacity style={styles.toolCard} onPress={openCreationChoice} activeOpacity={0.88}>
                  <View style={styles.toolIcon}>
                    <Ionicons name="sparkles-outline" size={19} color={colors.primaryLight} />
                  </View>
                  <View style={styles.toolCopy}>
                    <Text style={styles.toolTitle}>Crear</Text>
                    <Text style={styles.toolSub}>Manual o IA</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toolCard, (!activePlan || duplicateMutation.isPending) && styles.creationHalfDisabled]}
                  onPress={() => {
                    if (activePlan) duplicateMutation.mutate(activePlan.id);
                  }}
                  disabled={!activePlan || duplicateMutation.isPending}
                  activeOpacity={0.88}
                >
                  <View style={styles.toolIcon}>
                    {duplicateMutation.isPending ? (
                      <ActivityIndicator size="small" color={colors.primaryLight} />
                    ) : (
                      <Ionicons name="copy-outline" size={19} color={colors.primaryLight} />
                    )}
                  </View>
                  <View style={styles.toolCopy}>
                    <Text style={styles.toolTitle}>Duplicar</Text>
                    <Text style={styles.toolSub}>Editar copia</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </SlideUpView>

            <SlideUpView delay={300} duration={420} distance={16}>
              <View style={styles.toolbar}>
                <Text style={styles.sectionTitle}>Historial</Text>
                <Text style={styles.sectionHint}>
                  {visiblePlans.length} {visiblePlans.length === 1 ? 'versión' : 'versiones'}
                </Text>
              </View>
            </SlideUpView>
            <View style={styles.planList}>
              {paginatedPlans.map((item, idx) => {
                const isActiveRow = item.is_active;
                const title = item.label?.trim() ? item.label.trim() : 'Plan semanal';
                return (
                  <StaggerItem key={item.id} index={idx} baseDelay={340} staggerMs={55} distance={18}>
                    <View style={[styles.planCard, isActiveRow ? styles.planCardActive : styles.planCardIdle]}>
                    <View style={styles.planCardRow}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.planCardPress,
                          styles.planCardPressMain,
                          pressed && { opacity: 0.96 },
                        ]}
                        onPress={() => openWeeklyVersion(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Abrir ${title}, versión ${item.version}`}
                      >
                        <View style={styles.planCardHeader}>
                          <View style={styles.planCardHeaderTopRow}>
                            <View style={styles.planCardHeaderLeft}>
                              <View style={[styles.planVersionOrb, isActiveRow && styles.planVersionOrbOn]}>
                                <Text style={[styles.planVersionOrbText, isActiveRow && styles.planVersionOrbTextOn]}>
                                  v{item.version}
                                </Text>
                              </View>
                              {isActiveRow ? (
                                <View style={styles.planStatusOn}>
                                  <Ionicons name="checkmark-circle" size={15} color={colors.primaryLight} />
                                  <Text style={styles.planStatusOnText}>Activo</Text>
                                </View>
                              ) : (
                                <View style={styles.planStatusOff}>
                                  <Text style={styles.planStatusOffText}>Guardado</Text>
                                </View>
                              )}
                            </View>
                          </View>
                          <Text style={styles.planCardEyebrow}>
                            {isActiveRow ? 'En uso ahora' : formatPlanDate(item.created_at)}
                          </Text>
                          <Text style={styles.planCardTitle} numberOfLines={1}>
                            {title}
                          </Text>
                          <View style={styles.planMetaRow}>
                            <View style={[styles.planMetaChip, isActiveRow && styles.planMetaChipActive]}>
                              <Ionicons name="flame-outline" size={13} color={colors.primaryLight} />
                              <Text style={styles.planMetaChipText}>
                                ~{Math.round(item.target_kcal).toLocaleString('es-ES')} kcal/día
                              </Text>
                            </View>
                            {item.target_protein_g != null ? (
                              <View style={[styles.planMetaChip, isActiveRow && styles.planMetaChipActive]}>
                                <Ionicons name="barbell-outline" size={13} color={colors.textSecondary} />
                                <Text style={styles.planMetaChipText}>
                                  {Math.round(item.target_protein_g)} g proteína
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                        <View style={styles.planCardFooter}>
                          <View style={styles.planCardFooterCopy}>
                            <Text style={styles.planCardFooterHint}>
                              {isActiveRow ? 'Ver semana actual' : 'Abrir versión'}
                            </Text>
                            <Text style={styles.planCardFooterSubhint}>
                              {isActiveRow ? 'Entrá y ajustá la semana actual.' : 'Revisá esta versión cuando quieras.'}
                            </Text>
                          </View>
                          {exportingPlanId === item.id ? (
                            <ActivityIndicator size="small" color={colors.textMuted} />
                          ) : (
                            <View style={styles.planCardFooterArrow}>
                              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                            </View>
                          )}
                        </View>
                      </Pressable>
                      <View style={[styles.planCardMenuDock, isActiveRow && styles.planCardMenuDockActive]}>
                        <TouchableOpacity
                          style={styles.planMenuBtn}
                          onPress={() => openPlanRowMenu(item)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Más acciones, plan versión ${item.version}`}
                        >
                          {duplicateMutation.isPending && duplicateMutation.variables === item.id ? (
                            <ActivityIndicator size="small" color={colors.textSecondary} />
                          ) : activateMutation.isPending && activateMutation.variables === item.id ? (
                            <ActivityIndicator size="small" color={colors.textSecondary} />
                          ) : (
                            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  </StaggerItem>
                );
              })}
            </View>

            {planPageCount > 1 ? (
              <View style={styles.paginationWrap}>
                <Text style={styles.paginationSummary}>
                  Mostrando {pageRangeLabel} de {visiblePlans.length} planes
                </Text>
                <View style={styles.paginationRow}>
                  <TouchableOpacity
                    style={[styles.paginationBtn, currentPlanPage === 1 && styles.paginationBtnDisabled]}
                    onPress={() => setPlanListPage((page) => Math.max(1, page - 1))}
                    disabled={currentPlanPage === 1}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
                    <Text style={styles.paginationBtnText}>Anterior</Text>
                  </TouchableOpacity>

                  <View style={styles.paginationBadge}>
                    <Text style={styles.paginationBadgeText}>
                      {currentPlanPage}/{planPageCount}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.paginationBtn, currentPlanPage === planPageCount && styles.paginationBtnDisabled]}
                    onPress={() => setPlanListPage((page) => Math.min(planPageCount, page + 1))}
                    disabled={currentPlanPage === planPageCount}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.paginationBtnText}>Siguiente</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </>
        )}

        {isPending && hasPlans ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator color={colors.primaryLight} />
            <Text style={styles.inlineLoadingText}>Actualizando…</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal transparent visible={!!planActionsItem} animationType="fade" onRequestClose={closePlanActionsModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={closePlanActionsModal} />
          {planActionsItem ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.planSheetScroll}
              contentContainerStyle={styles.planSheetScrollContent}
            >
              <View style={styles.planSheetCard}>
                {planSheetPane === 'menu' ? (
                  <>
                    <View style={styles.planSheetHero}>
                      <View style={styles.planSheetHeroIconWrap}>
                        <Ionicons name="calendar-outline" size={40} color={colors.primaryLight} />
                      </View>
                      <View style={styles.planSheetHeroTextCol}>
                        <Text style={styles.planSheetHeroKicker}>Tu plan</Text>
                        <Text style={styles.planSheetHeroTitle} numberOfLines={2}>
                          {planActionsItem.label?.trim()
                            ? planActionsItem.label.trim()
                            : `Versión v${planActionsItem.version}`}
                        </Text>
                        <Text style={styles.planSheetHeroSub}>
                          {formatPlanDate(planActionsItem.created_at)} · ~
                          {Math.round(planActionsItem.target_kcal).toLocaleString('es-ES')} kcal/día
                          {planActionsItem.is_active ? ' · Activo en cocina' : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.planSheetDivider} />

                    <Text style={styles.planSheetSectionLabel}>Acciones</Text>

                    <TouchableOpacity
                      style={styles.planSheetActionRow}
                      onPress={() => {
                        const it = planActionsItem;
                        closePlanActionsModal();
                        void exportPlanById(it.id);
                      }}
                      activeOpacity={0.88}
                    >
                      <View style={styles.planSheetActionIcon}>
                        <Ionicons name="share-outline" size={20} color={colors.primaryLight} />
                      </View>
                      <View style={styles.planSheetActionTexts}>
                        <Text style={styles.planSheetActionTitle}>Exportar como texto</Text>
                        <Text style={styles.planSheetActionSub}>Ideal para WhatsApp o tus notas</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.planSheetActionRow}
                      onPress={() => {
                        const it = planActionsItem;
                        closePlanActionsModal();
                        duplicateMutation.mutate(it.id);
                      }}
                      disabled={duplicateMutation.isPending}
                      activeOpacity={0.88}
                    >
                      <View style={styles.planSheetActionIcon}>
                        <Ionicons name="copy-outline" size={20} color={colors.primaryLight} />
                      </View>
                      <View style={styles.planSheetActionTexts}>
                        <Text style={styles.planSheetActionTitle}>Duplicar versión</Text>
                        <Text style={styles.planSheetActionSub}>Copia para editar sin tocar el original</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.planSheetActionRow}
                      onPress={() => {
                        setRenameDraft(planActionsItem.label?.trim() ?? '');
                        setPlanSheetPane('rename');
                      }}
                      activeOpacity={0.88}
                    >
                      <View style={styles.planSheetActionIcon}>
                        <Ionicons name="pencil-outline" size={20} color={colors.primaryLight} />
                      </View>
                      <View style={styles.planSheetActionTexts}>
                        <Text style={styles.planSheetActionTitle}>Cambiar nombre</Text>
                        <Text style={styles.planSheetActionSub}>Cómo lo verás en la lista de planes</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </TouchableOpacity>

                    {!planActionsItem.is_active ? (
                      <TouchableOpacity
                        style={styles.planSheetActionRow}
                        onPress={() => {
                          const it = planActionsItem;
                          closePlanActionsModal();
                          activateMutation.mutate(it.id);
                        }}
                        disabled={activateMutation.isPending}
                        activeOpacity={0.88}
                      >
                        <View style={styles.planSheetActionIcon}>
                          <Ionicons name="checkmark-circle-outline" size={22} color={colors.primaryLight} />
                        </View>
                        <View style={styles.planSheetActionTexts}>
                          <Text style={styles.planSheetActionTitle}>Marcar como plan activo</Text>
                          <Text style={styles.planSheetActionSub}>El que sigues en el día a día</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={[styles.planSheetActionRow, styles.planSheetActionRowDanger]}
                      onPress={() => {
                        const it = planActionsItem;
                        closePlanActionsModal();
                        setDeleteTarget(it);
                      }}
                      activeOpacity={0.88}
                    >
                      <View style={[styles.planSheetActionIcon, styles.planSheetActionIconDanger]}>
                        <Ionicons name="trash-outline" size={20} color={colors.error} />
                      </View>
                      <View style={styles.planSheetActionTexts}>
                        <Text style={[styles.planSheetActionTitle, styles.planSheetActionTitleDanger]}>
                          Eliminar versión
                        </Text>
                        <Text style={styles.planSheetActionSub}>No se puede deshacer</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.error} />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.planSheetDismiss} onPress={closePlanActionsModal} activeOpacity={0.88}>
                      <Text style={styles.planSheetDismissText}>Cerrar</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.planSheetBackRow}
                      onPress={() => setPlanSheetPane('menu')}
                      activeOpacity={0.88}
                    >
                      <Ionicons name="chevron-back" size={22} color={colors.primaryLight} />
                      <Text style={styles.planSheetBackText}>Volver al menú</Text>
                    </TouchableOpacity>

                    <Text style={styles.planSheetRenameTitle}>Nombre del plan</Text>
                    <Text style={styles.planSheetRenameHint}>
                      Opcional. Si lo dejas vacío y guardas, se mostrará solo «Plan semanal» y la versión.
                    </Text>
                    <TextInput
                      value={renameDraft}
                      onChangeText={(t) => setRenameDraft(t.slice(0, MAX_PLAN_LABEL_LEN))}
                      placeholder="Ej. Definición abril, Volumen oficina…"
                      placeholderTextColor={colors.textMuted}
                      style={styles.planSheetRenameInput}
                      maxLength={MAX_PLAN_LABEL_LEN}
                      editable={!patchPlanLabelMutation.isPending}
                    />
                    <Text style={styles.planSheetRenameCounter}>
                      {renameDraft.length}/{MAX_PLAN_LABEL_LEN}
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.planSheetPrimaryBtn,
                        patchPlanLabelMutation.isPending && styles.planSheetPrimaryBtnDisabled,
                      ]}
                      onPress={() => {
                        const it = planActionsItem;
                        patchPlanLabelMutation.mutate({ planId: it.id, label: renameDraft.trim() });
                      }}
                      disabled={patchPlanLabelMutation.isPending}
                      activeOpacity={0.9}
                    >
                      {patchPlanLabelMutation.isPending ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.planSheetPrimaryBtnText}>Guardar nombre</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </ScrollView>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>

      <Modal transparent visible={creationChoiceOpen} animationType="fade" onRequestClose={closeCreationChoice}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeCreationChoice} />
          <View style={[styles.modalCard, styles.choiceModalCard]}>
            <Text style={styles.modalTitle}>¿Cómo quieres crear el plan?</Text>
            <Text style={styles.modalDesc}>
              Manual: semana vacía con tus objetivos del perfil para que añadas cada comida. IA: menús propuestos según
              preferencias y contexto que indiques.
            </Text>

            <TouchableOpacity
              style={[styles.choiceRow, createManualMutation.isPending && styles.choiceRowDisabled]}
              onPress={() => createManualMutation.mutate()}
              disabled={createManualMutation.isPending}
              activeOpacity={0.88}
            >
              <View style={styles.choiceLead}>
                <Ionicons name="create-outline" size={24} color={colors.primaryLight} />
              </View>
              <View style={styles.choiceTexts}>
                <Text style={styles.choiceRowTitle}>Manual</Text>
                <Text style={styles.choiceRowSub}>Plantilla de 7 días; tú eliges cada alimento.</Text>
              </View>
              {createManualMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.primaryLight} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.choiceRow, createManualMutation.isPending && styles.choiceRowDisabled]}
              onPress={chooseIaPlan}
              disabled={createManualMutation.isPending}
              activeOpacity={0.88}
            >
              <View style={styles.choiceLead}>
                <Ionicons name="sparkles-outline" size={24} color={colors.primaryLight} />
              </View>
              <View style={styles.choiceTexts}>
                <Text style={styles.choiceRowTitle}>Con IA</Text>
                <Text style={styles.choiceRowSub}>
                  Objetivos del perfil + preferencias y contexto que especifiques.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.choiceCancel}
              onPress={closeCreationChoice}
              disabled={createManualMutation.isPending}
            >
              <Text style={styles.choiceCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal transparent visible={!!deleteTarget} animationType="fade" onRequestClose={closeDelete}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeDelete} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Eliminar plan</Text>
            {deleteTarget ? (
              <Text style={styles.modalDesc}>
                ¿Borrar v{deleteTarget.version} ({formatPlanDate(deleteTarget.created_at)})? No se puede deshacer.
                {deleteTarget.is_active ? '\n\nEl plan más reciente pasará a ser el activo.' : ''}
              </Text>
            ) : null}
            <View style={actionIntentStyles.rowModal}>
              <Button
                variant="actionCancel"
                title="Cancelar"
                onPress={closeDelete}
                disabled={deleteMutation.isPending}
              />
              <Button
                variant="actionDestructive"
                title={deleteMutation.isPending ? 'Eliminando…' : 'Eliminar'}
                onPress={confirmDelete}
                disabled={deleteMutation.isPending}
                loading={deleteMutation.isPending}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenFocusProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollInner: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: screenPaddingX,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  errorTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  errorSub: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
    maxWidth: 300,
    lineHeight: 22,
  },

  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  pageHeaderCopy: { flex: 1, minWidth: 0 },
  pageKicker: {
    ...typography.micro,
    color: colors.primaryLight,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  pageTitle: {
    ...typography.screenTitle,
    color: colors.text,
    letterSpacing: -0.8,
    marginBottom: spacing.xs,
  },
  pageSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 19,
    maxWidth: 320,
  },
  headerCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryDark,
    borderWidth: 1,
    borderColor: colors.primaryBorderStrong,
  },
  headerCreateBtnText: {
    ...typography.captionBold,
    color: colors.white,
  },
  overviewGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  overviewCard: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  overviewValue: {
    ...typography.metricSm,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginBottom: 2,
  },
  overviewLabel: {
    ...typography.micro,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },

  creationSection: {
    marginBottom: spacing.lg,
  },
  creationSectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.85,
    marginBottom: spacing.sm,
  },
  creationHeroCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  creationHeroInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  creationHeroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creationHeroTextCol: { flex: 1, minWidth: 0 },
  creationHeroTitle: { ...typography.h3, color: colors.text, marginBottom: 2 },
  creationHeroSub: { ...typography.small, color: colors.textSecondary, lineHeight: 19 },
  creationRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  creationHalf: {
    flex: 1,
    minWidth: 0,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  creationHalfDisabled: { opacity: 0.45 },
  creationTileIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  creationTileTitle: { ...typography.captionBold, color: colors.text, marginBottom: 4, fontSize: 14 },
  creationTileSub: { ...typography.micro, color: colors.textMuted, lineHeight: 17 },

  emptyCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
    ...elevation.card,
  },
  emptyInner: {
    padding: spacing.xl,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'flex-start',
  },
  emptyIconFrame: {
    width: 54,
    height: 54,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...typography.h2, color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  emptyBody: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

  heroCard: {
    position: 'relative',
    borderRadius: borderRadius.lg + 6,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    ...elevation.card,
  },
  heroBody: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  heroHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginBottom: spacing.md,
    overflow: 'visible',
  },
  heroIconFrame: {
    width: 58,
    height: 58,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroPlanIconImg: {
    width: 58,
    height: 58,
    backgroundColor: 'transparent',
    transform: [{ scale: 1.8 }],
  },
  heroTitles: { flex: 1, minWidth: 0 },
  heroLabel: {
    ...typography.micro,
    color: colors.primaryLight,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroName: {
    ...typography.h1,
    fontSize: 25,
    lineHeight: 30,
    color: colors.text,
    letterSpacing: -0.45,
  },
  heroInfoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
  pillMuted: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  pillMutedText: { ...typography.micro, color: colors.textSecondary, fontWeight: '600' },
  pillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  pillActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primaryLight },
  pillActiveText: { ...typography.micro, color: colors.primaryLight, fontWeight: '700' },
  pillWarn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.warningMuted,
    borderWidth: hairlineWidth,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  pillWarnText: { ...typography.micro, color: colors.warning, fontWeight: '700' },
  heroDate: { ...typography.caption, color: colors.textSecondary },

  macroGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  macroCell: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
  },
  macroCellHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: spacing.xs,
  },
  macroIcon: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroIconKcal: {
    backgroundColor: colors.primaryMuted,
  },
  macroIconProtein: {
    backgroundColor: colors.proteinMuted,
  },
  macroLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.55,
  },
  macroValue: {
    ...typography.metricSm,
    fontSize: 17,
    lineHeight: 22,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  macroUnit: {
    ...typography.micro,
    color: colors.textTertiary,
    marginTop: 1,
  },

  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  primaryCta: {
    flexBasis: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.lg + 2,
    backgroundColor: colors.primaryDark,
    borderWidth: 1,
    borderColor: colors.primaryBorderStrong,
  },
  primaryCtaText: { ...typography.captionBold, color: colors.white, fontSize: 16, letterSpacing: 0.2 },
  secondaryCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg + 2,
    backgroundColor: colors.background,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  secondaryCtaText: { ...typography.captionBold, color: colors.primaryLight },
  tertiaryRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg + 2,
    backgroundColor: colors.background,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  tertiaryRowText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  toolsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  toolCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  toolIcon: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolCopy: { flex: 1, minWidth: 0 },
  toolTitle: { ...typography.captionBold, color: colors.text },
  toolSub: { ...typography.micro, color: colors.textMuted, marginTop: 1 },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.sectionTitle, color: colors.text },
  sectionHint: { ...typography.small, color: colors.textMuted },
  sectionSub: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
    maxWidth: 440,
  },

  planList: { gap: spacing.sm, marginBottom: spacing.md },
  planCard: {
    position: 'relative',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: hairlineWidth,
    backgroundColor: colors.surface,
  },
  planCardIdle: {
    borderColor: colors.border,
  },
  planCardActive: {
    borderWidth: 2,
    borderColor: colors.primaryBorderStrong,
    backgroundColor: colors.surfaceElevated,
  },
  planCardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  planCardPress: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  planCardPressMain: {
    flex: 1,
    minWidth: 0,
  },
  planCardMenuDock: {
    alignSelf: 'flex-start',
    borderRadius: borderRadius.full,
    backgroundColor: 'transparent',
    borderWidth: 0,
    marginTop: spacing.sm,
    marginRight: spacing.sm,
  },
  planCardMenuDockActive: {
    backgroundColor: 'transparent',
  },
  planMenuBtn: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  planCardHeader: { marginBottom: spacing.sm },
  planCardHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  planCardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  planVersionOrb: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
  },
  planVersionOrbOn: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.primaryBorder,
  },
  planVersionOrbText: {
    ...typography.captionBold,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
  },
  planVersionOrbTextOn: { color: colors.primaryLight },
  planStatusOn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  planStatusOnText: { ...typography.micro, color: colors.primaryLight, fontWeight: '700' },
  planStatusOff: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  planStatusOffText: { ...typography.micro, color: colors.textSecondary, fontWeight: '700' },
  planCardEyebrow: {
    ...typography.micro,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  planCardTitle: {
    ...typography.h3,
    fontSize: 17,
    lineHeight: 21,
    color: colors.text,
    letterSpacing: -0.35,
    marginBottom: spacing.sm,
  },
  planMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: 0 },
  planMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  planMetaChipActive: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryBorder,
  },
  planMetaChipText: {
    ...typography.micro,
    color: colors.textSecondary,
    fontWeight: '700',
    flexShrink: 1,
  },
  planCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  planCardFooterCopy: {
    flex: 1,
    minWidth: 0,
  },
  planCardFooterHint: { ...typography.captionBold, color: colors.textSecondary },
  planCardFooterSubhint: {
    ...typography.micro,
    color: colors.textMuted,
    display: 'none',
  },
  planCardFooterArrow: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  paginationWrap: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  paginationSummary: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: 'center',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  paginationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  paginationBtnDisabled: {
    opacity: 0.42,
  },
  paginationBtnText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  paginationBadge: {
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  paginationBadgeText: {
    ...typography.captionBold,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },

  planSheetScroll: {
    maxHeight: '88%',
    width: '100%',
    alignSelf: 'center',
  },
  planSheetScrollContent: {
    paddingHorizontal: screenPaddingX,
    paddingVertical: spacing.lg,
    flexGrow: 1,
    justifyContent: 'center',
  },
  planSheetCard: {
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
    ...elevation.floating,
  },
  planSheetHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  planSheetHeroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planSheetHeroTextCol: { flex: 1, minWidth: 0 },
  planSheetHeroKicker: {
    ...typography.micro,
    color: colors.primaryLight,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  planSheetHeroTitle: {
    ...typography.h2,
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
    letterSpacing: -0.35,
    marginBottom: 6,
  },
  planSheetHeroSub: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  planSheetDivider: {
    height: hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  planSheetSectionLabel: {
    ...typography.micro,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.85,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  planSheetActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  planSheetActionRowDanger: {
    backgroundColor: colors.errorMuted,
    borderColor: colors.errorBorder,
  },
  planSheetActionIcon: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planSheetActionIconDanger: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairlineWidth,
    borderColor: colors.errorBorder,
  },
  planSheetActionTexts: { flex: 1, minWidth: 0 },
  planSheetActionTitle: { ...typography.captionBold, color: colors.text, fontSize: 15, marginBottom: 2 },
  planSheetActionTitleDanger: { color: colors.error },
  planSheetActionSub: { ...typography.micro, color: colors.textMuted, lineHeight: 17 },
  planSheetDismiss: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  planSheetDismissText: { ...typography.captionBold, color: colors.textSecondary },
  planSheetBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  planSheetBackText: { ...typography.captionBold, color: colors.primaryLight, fontSize: 15 },
  planSheetRenameTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  planSheetRenameHint: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 20,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  planSheetRenameInput: {
    ...typography.body,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  planSheetRenameCounter: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: 'right',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  planSheetPrimaryBtn: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryDark,
    borderWidth: 1,
    borderColor: colors.primaryBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planSheetPrimaryBtnDisabled: { opacity: 0.55 },
  planSheetPrimaryBtnText: { ...typography.captionBold, color: colors.white, fontSize: 16 },

  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  inlineLoadingText: { ...typography.small, color: colors.textMuted },

  modalRoot: { flex: 1, justifyContent: 'center' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  modalCard: {
    marginHorizontal: screenPaddingX,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceModalCard: {
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
  },
  choiceRowDisabled: { opacity: 0.45 },
  choiceLead: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTexts: { flex: 1, minWidth: 0 },
  choiceRowTitle: { ...typography.captionBold, color: colors.text, marginBottom: 2 },
  choiceRowSub: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  choiceCancel: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  choiceCancelText: { ...typography.captionBold, color: colors.textSecondary },
  modalTitle: { ...typography.sectionTitle, color: colors.text, marginBottom: spacing.sm },
  modalDesc: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 },
});
