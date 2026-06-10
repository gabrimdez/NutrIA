import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getVisiblePlanHistory,
  normalizeAppSettings,
  PLAN_PRIORITY_OPTIONS,
  PLAN_VARIETY_OPTIONS,
} from '../../../src/lib/appSettings';
import { api, PLAN_API_TIMEOUT_MS } from '../../../src/lib/api';
import { toUserFacingErrorMessage } from '../../../src/lib/userFacingError';
import type { FoodRestrictions } from '../../../src/types';
import {
  Button,
  LoadingScreen,
  Chip,
  MealTypeIcon,
  SlideUpView,
  StaggerItem,
  ScreenFocusProvider,
  UnitPicker,
  BottomSheet,
  ListRow,
  MealSlotChevron,
  AnimatedCollapsible,
  DraggableMealList,
} from '../../../src/components';
import { FoodPreviewHero } from '../../../src/components/ui/FoodPreviewHero';
import { MacroSummarySection, MacroEnergySplitBar } from '../../../src/components/ui/MacroSummaryPreview';
import { Surface } from '../../../src/components/ui/Surface';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  screenPaddingX,
  iconSize,
  hairlineWidth,
  DOCK_H,
  DOCK_MARGIN_BOTTOM,
  elevation,
  platformBoxShadow,
  actionIntentStyles,
} from '../../../src/theme';
import {
  AppSettings,
  DietPlan,
  PlanFood,
  PlanGenerationPriority,
  PlanMeal,
  PlanSummary,
  PlanVarietyLevel,
  Profile,
} from '../../../src/types';
import { type FoodUnit, toGrams, fromGrams } from '../../../src/lib/foodUnits';
import { capitalizeFirstChar, parseMealTypeParam } from '../../../src/lib/mealDisplay';
import { formatPlanForExport, MEAL_LABELS_FOR_PLAN as MEAL_LABELS } from '../../../src/lib/planExport';
import { toLocalYmd } from '../../../src/lib/diaryDate';
import { invalidateMealRelatedQueries } from '../../../src/lib/mealQueryInvalidation';
import {
  isNonPremiumTier,
  isPlanGenerationPremiumRequiredMessage,
  navigateToPremiumUpgrade,
} from '../../../src/lib/planAiPremiumGate';
import {
  showPlanRegenerateMealIaPremiumLock,
  showPlanSubstituteFoodIaPremiumLock,
  showRegenerateFullWeekPlanIaPremiumLock,
} from '../../../src/lib/nutriCoachQuotaAlert';

const EMPTY_PLAN_HISTORY: PlanSummary[] = [];

/** Solo dígitos y un separador decimal (. o ,) para campos de macros. */
function sanitizeDecimalTextInput(value: string, maxLength: number): string {
  const cleaned = value.replace(/[^\d.,]/g, '');
  let hasSep = false;
  let out = '';
  for (const c of cleaned) {
    if (c >= '0' && c <= '9') {
      out += c;
    } else if ((c === '.' || c === ',') && !hasSep) {
      hasSep = true;
      out += c;
    }
    if (out.length >= maxLength) break;
  }
  return out.slice(0, maxLength);
}

const MEALS_OPTIONS = [3, 4, 5];
function sumDayFromPlan(day: { meals: PlanMeal[] }) {
  return day.meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + (m.total_kcal || 0),
      p: acc.p + (m.total_protein_g || 0),
      c: acc.c + (m.total_carbs_g || 0),
      f: acc.f + (m.total_fat_g || 0),
    }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
}

function safePlanNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function planFoodToDiaryItem(food: PlanFood) {
  return {
    custom_name: food.name?.trim() || 'Alimento',
    grams: safePlanNumber(food.grams),
    kcal: safePlanNumber(food.kcal),
    protein_g: safePlanNumber(food.protein_g),
    carbs_g: safePlanNumber(food.carbs_g),
    fat_g: safePlanNumber(food.fat_g),
  };
}

const PREF_OPTIONS = [
  'Vegetariano',
  'Sin lactosa',
  'Sin gluten',
  'Alto en proteína',
  'Bajo en grasa',
  'Ninguna',
];

type WizardState = {
  mealsPerDay: number;
  preferences: string[];
  varietyLevel: PlanVarietyLevel;
  generationPriority: PlanGenerationPriority;
  dislikes: string;
  extraContext: string;
};

const CONTEXT_MAX_LEN = 400;

function IaPlanWizardLayout({
  wizard,
  setWizard,
  togglePref,
  onGenerate,
  generating,
  heroTitle,
  heroSubtitle,
  ctaTitle,
  showBadge = true,
  foodRestrictions,
}: {
  wizard: WizardState;
  setWizard: React.Dispatch<React.SetStateAction<WizardState>>;
  togglePref: (p: string) => void;
  onGenerate: () => void;
  generating: boolean;
  heroTitle: string;
  heroSubtitle: string;
  ctaTitle: string;
  showBadge?: boolean;
  foodRestrictions?: FoodRestrictions | null;
}) {
  const allRestrictions = [
    ...(foodRestrictions?.allergies || []).map((a) => `🚫 ${a}`),
    ...(foodRestrictions?.intolerances || []).map((i) => `⚠️ ${i}`),
    ...(foodRestrictions?.forbidden_foods || []).map((f) => `✕ ${f}`),
  ];
  return (
    <>
      <View style={styles.iaWizardHeroCard}>
        <View style={styles.iaWizardHeroInner}>
          {showBadge ? (
            <View style={styles.iaWizardBadge}>
              <Ionicons name="sparkles" size={15} color={colors.primaryLight} />
              <Text style={styles.iaWizardBadgeText}>Asistente IA</Text>
            </View>
          ) : null}
          <Text style={styles.iaWizardHeroTitle}>{heroTitle}</Text>
          <Text style={styles.iaWizardHeroSub}>{heroSubtitle}</Text>
        </View>
      </View>

      <View style={styles.iaWizardFormCard}>
        <View style={[styles.iaWizardSection, styles.iaWizardSectionFlushTop]}>
          <Text style={styles.iaWizardFieldLabel}>Comidas al día</Text>
          <Text style={styles.iaWizardFieldHint}>
            Número de tomas principales (desayuno, comidas, cenas y colaciones).
          </Text>
          <View style={styles.iaWizardMealsRow}>
            {MEALS_OPTIONS.map((n) => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.iaWizardMealChip,
                  wizard.mealsPerDay === n && styles.iaWizardMealChipActive,
                ]}
                onPress={() => setWizard((p) => ({ ...p, mealsPerDay: n }))}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.iaWizardMealChipText,
                    wizard.mealsPerDay === n && styles.iaWizardMealChipTextActive,
                  ]}
                >
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.iaWizardDivider} />

        <View style={styles.iaWizardSection}>
          <Text style={styles.iaWizardFieldLabel}>Preferencias</Text>
          <Text style={styles.iaWizardFieldHint}>
            Puedes combinar varias. «Ninguna» desmarca el resto.
          </Text>
          <View style={styles.iaWizardChipGrid}>
            {PREF_OPTIONS.map((p) => (
              <Chip
                key={p}
                label={p}
                compact
                selected={wizard.preferences.includes(p)}
                onPress={() => togglePref(p)}
              />
            ))}
          </View>
        </View>

        <View style={styles.iaWizardDivider} />

        <View style={styles.iaWizardSection}>
          <Text style={styles.iaWizardFieldLabel}>Variedad al generar</Text>
          <Text style={styles.iaWizardFieldHint}>
            Afecta a cómo la IA reparte repeticiones entre días y comidas.
          </Text>
          <View style={styles.iaWizardOptionGrid}>
            {PLAN_VARIETY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.iaWizardOptionCard,
                  wizard.varietyLevel === option.value && styles.iaWizardOptionCardActive,
                ]}
                onPress={() => setWizard((prev) => ({ ...prev, varietyLevel: option.value }))}
                activeOpacity={0.86}
              >
                <Text
                  style={[
                    styles.iaWizardOptionTitle,
                    wizard.varietyLevel === option.value && styles.iaWizardOptionTitleActive,
                  ]}
                >
                  {option.label}
                </Text>
                <Text
                  style={[
                    styles.iaWizardOptionHint,
                    wizard.varietyLevel === option.value && styles.iaWizardOptionHintActive,
                  ]}
                >
                  {option.hint}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.iaWizardDivider} />

        <View style={styles.iaWizardSection}>
          <Text style={styles.iaWizardFieldLabel}>Prioridad de generación</Text>
          <Text style={styles.iaWizardFieldHint}>
            Se añade como guía estable cuando creas este plan con IA.
          </Text>
          <View style={styles.iaWizardOptionGrid}>
            {PLAN_PRIORITY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.iaWizardOptionCard,
                  wizard.generationPriority === option.value && styles.iaWizardOptionCardActive,
                ]}
                onPress={() => setWizard((prev) => ({ ...prev, generationPriority: option.value }))}
                activeOpacity={0.86}
              >
                <Text
                  style={[
                    styles.iaWizardOptionTitle,
                    wizard.generationPriority === option.value && styles.iaWizardOptionTitleActive,
                  ]}
                >
                  {option.label}
                </Text>
                <Text
                  style={[
                    styles.iaWizardOptionHint,
                    wizard.generationPriority === option.value && styles.iaWizardOptionHintActive,
                  ]}
                >
                  {option.hint}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {allRestrictions.length > 0 && (
          <>
            <View style={styles.iaWizardDivider} />
            <View style={styles.iaWizardSection}>
              <Text style={styles.iaWizardFieldLabel}>Restricciones activas</Text>
              <Text style={styles.iaWizardFieldHint}>
                Se aplicarán automáticamente. Edítalas desde tu perfil.
              </Text>
              <View style={styles.iaWizardChipGrid}>
                {allRestrictions.map((r, i) => (
                  <View key={i} style={styles.iaWizardRestrictionPill}>
                    <Text style={styles.iaWizardRestrictionText}>{r}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={styles.iaWizardEditLink}
                onPress={() => router.push('/profile/food-restrictions')}
                activeOpacity={0.7}
              >
                <Ionicons name="pencil-outline" size={14} color={colors.primaryLight} />
                <Text style={styles.iaWizardEditLinkText}>Editar restricciones</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.iaWizardDivider} />

        <View style={styles.iaWizardSection}>
          <Text style={styles.iaWizardFieldLabel}>No te gusta</Text>
          <Text style={styles.iaWizardFieldHint}>Opcional. Ingredientes o platos a evitar.</Text>
          <TextInput
            style={styles.iaWizardInput}
            placeholder="Ej: zanahoria, coliflor…"
            placeholderTextColor={colors.textMuted}
            value={wizard.dislikes}
            onChangeText={(t) => setWizard((prev) => ({ ...prev, dislikes: t }))}
            maxLength={200}
          />
        </View>

        <View style={styles.iaWizardDivider} />

        <View style={styles.iaWizardSection}>
          <Text style={styles.iaWizardFieldLabel}>Contexto</Text>
          <Text style={styles.iaWizardFieldHint}>
            Horarios, meal prep, presupuesto, cocina disponible…
          </Text>
          <TextInput
            style={[styles.iaWizardInput, styles.iaWizardInputMultiline]}
            placeholder="Ej: ceno tarde los martes; poco tiempo al mediodía…"
            placeholderTextColor={colors.textMuted}
            value={wizard.extraContext}
            onChangeText={(t) => setWizard((prev) => ({ ...prev, extraContext: t }))}
            maxLength={CONTEXT_MAX_LEN}
            multiline
            textAlignVertical="top"
          />
        </View>

        <Button
          title={ctaTitle}
          onPress={onGenerate}
          loading={generating}
          size="lg"
          style={styles.iaWizardCta}
        />
      </View>
    </>
  );
}

function syncPlanDetailCaches(queryClient: ReturnType<typeof useQueryClient>, data: DietPlan) {
  if (data.is_active) {
    queryClient.setQueryData<DietPlan>(['plan', 'current'], data);
  }
  queryClient.setQueryData<DietPlan>(['plan', String(data.id)], data);
}

/** Mantiene alineado el listado con el detalle tras renombrar (sin esperar al refetch). */
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

function formatPlanDate(iso: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

function getPlanSummaryTimestamp(item: Pick<PlanSummary, 'created_at' | 'version'>) {
  const ts = new Date(item.created_at).getTime();
  if (Number.isFinite(ts)) return ts;
  return typeof item.version === 'number' ? item.version : 0;
}

function sortPlanHistoryEntries(plans: PlanSummary[]) {
  return [...plans].sort((a, b) => {
    const activeDiff = Number(b.is_active) - Number(a.is_active);
    if (activeDiff !== 0) return activeDiff;
    const dateDiff = getPlanSummaryTimestamp(b) - getPlanSummaryTimestamp(a);
    if (dateDiff !== 0) return dateDiff;
    return b.version - a.version;
  });
}

function getPlanSummaryPreview(item: Pick<PlanSummary, 'rationale_preview'>) {
  const preview = item.rationale_preview?.trim().replace(/\s+/g, ' ');
  return preview || 'Abrí este plan para revisar comidas, ajustes y notas.';
}

/** Lunes = inicio de semana (ISO) */
function startOfWeekMonday(from: Date): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(base: Date, days: number): Date {
  const x = new Date(base);
  x.setDate(x.getDate() + days);
  return x;
}

function formatWeekRangeLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const m0 = weekStart.toLocaleDateString('es-ES', { month: 'short' });
  const m1 = end.toLocaleDateString('es-ES', { month: 'short' });
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const d0 = weekStart.getDate();
  const d1 = end.getDate();
  if (m0.replace(/\.$/, '') === m1.replace(/\.$/, '')) {
    return `Semana del ${d0} — ${d1} ${cap(m0.replace(/\.$/, ''))}`;
  }
  return `Semana del ${d0} ${cap(m0.replace(/\.$/, ''))} — ${d1} ${cap(m1.replace(/\.$/, ''))}`;
}

/** Etiqueta corta del día (es-ES), sin punto final — más legible que una sola letra. */
function shortWeekdayEs(date: Date): string {
  const raw = date.toLocaleDateString('es-ES', { weekday: 'short' });
  return raw.replace(/\.$/, '').replace(/^./, (c) => c.toUpperCase());
}

const DAY_STRIP_CHIP_GAP = 10;
const DAY_STRIP_CHIP_MIN_W = 54;

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    planId?: string | string[];
    autoRegen?: string | string[];
    mode?: string | string[];
  }>();
  const paramPlanId = useMemo(() => {
    const p = params.planId;
    if (p == null || p === '') return null;
    return Array.isArray(p) ? (p[0] ?? null) : String(p);
  }, [params.planId]);

  const paramModeIa = useMemo(() => {
    const m = params.mode;
    if (m == null || m === '') return false;
    const s = Array.isArray(m) ? m[0] : m;
    return s === 'ia';
  }, [params.mode]);

  const [selectedDay, setSelectedDay] = useState(0);
  const [focusedPlanId, setFocusedPlanId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const dayStripRef = useRef<ScrollView>(null);
  const regenFromHubRef = useRef(false);

  useEffect(() => {
    if (paramPlanId) setFocusedPlanId(paramPlanId);
  }, [paramPlanId]);

  const [wizard, setWizard] = useState<WizardState>({
    mealsPerDay: 4,
    preferences: [],
    varietyLevel: 'balanced',
    generationPriority: 'performance',
    dislikes: '',
    extraContext: '',
  });

  const { data: foodRestrictions } = useQuery({
    queryKey: ['food-restrictions'],
    queryFn: () => api.get<FoodRestrictions>('/api/v1/me/food-restrictions'),
    staleTime: 60_000,
  });

  const { data: profile, isFetched: profileFetched } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/api/v1/me/profile'),
    staleTime: 60_000,
  });
  const todayDateStr = useMemo(() => toLocalYmd(new Date()), []);

  const [regenModalOpen, setRegenModalOpen] = useState(false);
  const [regenContextDraft, setRegenContextDraft] = useState('');
  /** Asistente IA para nuevo plan cuando ya existe uno activo (desde gestión de planes). */
  const [iaWizardOverlayOpen, setIaWizardOverlayOpen] = useState(false);
  const [expandedMeals, setExpandedMeals] = useState<Record<string, boolean>>({});
  const [editMealOpen, setEditMealOpen] = useState<{ mealId: string; title: string } | null>(null);
  const [editMealTitleDraft, setEditMealTitleDraft] = useState('');
  const [editFoodOpen, setEditFoodOpen] = useState<{
    mealId: string;
    index: number;
    name: string;
    grams: string;
    unit: FoodUnit;
    kcal: string;
    protein_g: string;
    carbs_g: string;
    fat_g: string;
  } | null>(null);
  /** En web, `Alert.alert` no muestra diálogo; usamos modal como el resto de flujos del plan. */
  const [substituteFoodModal, setSubstituteFoodModal] = useState<{
    mealId: string;
    foodIndex: number;
    foodName: string;
    mealTitle: string;
  } | null>(null);
  const [substituteReasonDraft, setSubstituteReasonDraft] = useState('');
  /** Rehacer comida entera: Alert en web no sirve; nota opcional va al backend (max 500). */
  const [regenerateMealModal, setRegenerateMealModal] = useState<{
    mealId: string;
    mealTitle: string;
    slotLabel: string;
  } | null>(null);
  const [regenerateMealNoteDraft, setRegenerateMealNoteDraft] = useState('');
  /** Confirmar borrado de plan (Alert en web no sirve). */
  const [deletePlanModal, setDeletePlanModal] = useState<PlanSummary | null>(null);
  /** Quitar alimento del plan: puede dejar la comida vacía para rellenarla después. */
  const [removeFoodModal, setRemoveFoodModal] = useState<
    null | { mode: 'confirm'; mealId: string; foodIndex: number; foodName: string }
  >(null);
  const [addFoodOpen, setAddFoodOpen] = useState<{
    mealId: string;
    mealTitle: string;
    name: string;
    grams: string;
    unit: FoodUnit;
    kcal: string;
    protein_g: string;
    carbs_g: string;
    fat_g: string;
  } | null>(null);
  const [managementSheetOpen, setManagementSheetOpen] = useState(false);
  const [editLabelDraft, setEditLabelDraft] = useState('');
  const [editNotesDraft, setEditNotesDraft] = useState('');
  const [editLabelModalOpen, setEditLabelModalOpen] = useState(false);
  const [editNotesModalOpen, setEditNotesModalOpen] = useState(false);

  /** Valores al abrir el modal: al cambiar gramos se reescalan kcal y macros proporcionalmente. */
  const editFoodBaselineRef = useRef<{
    grams: number;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  } | null>(null);

  const weekStartMonday = useMemo(() => startOfWeekMonday(new Date()), []);

  const planQueryKey = ['plan', focusedPlanId ?? 'current'] as const;

  const {
    data: plan,
    isLoading: planIsLoading,
    isFetching: planIsFetching,
    isFetched: planFetched,
  } = useQuery({
    queryKey: planQueryKey,
    queryFn: async () => {
      if (!focusedPlanId) {
        return await api.get<DietPlan | null>('/api/v1/plans/current', { nullOn404: true });
      }
      return await api.get<DietPlan>(`/api/v1/plans/${focusedPlanId}`);
    },
    placeholderData: keepPreviousData,
    retry: (failureCount, err) => {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('401') || msg.includes('sesión') || msg.includes('Inicia sesión')) return false;
      return failureCount < 3;
    },
    retryDelay: (i) => Math.min(1500 * 2 ** i, 10_000),
  });

  useEffect(() => {
    if (regenFromHubRef.current) return;
    const ar = params.autoRegen;
    const on = ar === '1' || ar === 'true' || (Array.isArray(ar) && ar[0] === '1');
    if (!on || !plan?.id) return;
    regenFromHubRef.current = true;
    setRegenModalOpen(true);
  }, [plan?.id, params.autoRegen, plan]);

  useEffect(() => {
    if (!paramModeIa || !plan?.id) return;
    setIaWizardOverlayOpen(true);
    router.setParams({ mode: undefined } as never);
  }, [paramModeIa, plan?.id]);

  const {
    data: planHistoryData,
    isFetched: planHistoryFetched,
    isPending: planHistoryPending,
    isError: planHistoryError,
    refetch: refetchPlanHistory,
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

  const { data: settingsData } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => api.get<AppSettings>('/api/v1/me/settings'),
  });
  const settings = useMemo(() => normalizeAppSettings(settingsData), [settingsData]);
  const mealsCollapsedByDefault = settings.plan_preferences.meals_collapsed_by_default;

  const rawPlanHistory = Array.isArray(planHistoryData) ? planHistoryData : EMPTY_PLAN_HISTORY;

  /**
   * Incluye: sin plan aún pero historial ya trajo versiones → esperar al useEffect que fija focusedPlanId
   * y al GET del detalle (evita mostrar el asistente «Generar plan» por error).
   */
  const stillResolvingCurrentVsHistory =
    focusedPlanId === null &&
    (!planFetched ||
      (plan == null && !planHistoryFetched) ||
      (plan == null && planHistoryFetched && rawPlanHistory.length > 0));

  const displayPlanHistory = useMemo((): PlanSummary[] => {
    if (rawPlanHistory.length > 0) return sortPlanHistoryEntries(rawPlanHistory);
    if (planHistoryError && plan) {
      const prev = plan.rationale?.trim();
      return sortPlanHistoryEntries([
        {
          id: plan.id,
          version: plan.version,
          is_active: plan.is_active,
          target_kcal: plan.target_kcal,
          created_at: plan.created_at,
          rationale_preview: prev && prev.length > 140 ? `${prev.slice(0, 139)}…` : prev || null,
        },
      ]);
    }
    return rawPlanHistory;
  }, [rawPlanHistory, planHistoryError, plan]);

  const visiblePlanHistory = useMemo(
    () => getVisiblePlanHistory(displayPlanHistory, settings.plan_preferences.hide_archived_plans),
    [displayPlanHistory, settings.plan_preferences.hide_archived_plans],
  );

  /** Si el detalle en caché aún no trae `label`, el historial (o el PATCH) suele tenerlo antes. */
  const weekPlanDisplayTitle = useMemo(() => {
    const fromPlan = plan?.label?.trim();
    if (fromPlan) return fromPlan;
    if (!plan?.id) return 'Plan semanal';
    const fromHistory = displayPlanHistory.find((p) => String(p.id) === String(plan.id))?.label?.trim();
    return fromHistory || 'Plan semanal';
  }, [plan?.label, plan?.id, displayPlanHistory]);

  /** Tras F5 no hay caché: si no hay plan activo pero sí historial, cargar el más reciente (o el marcado activo). */
  useEffect(() => {
    if (focusedPlanId !== null) return;
    // `plan` puede ser undefined (error de red / query fallida), no solo null (sin activo).
    if (!planFetched || plan != null) return;
    if (!planHistoryFetched || displayPlanHistory.length === 0) return;
    const next = displayPlanHistory.find((p) => p.is_active) ?? displayPlanHistory[0];
    if (next?.id) setFocusedPlanId(next.id);
  }, [focusedPlanId, plan, planFetched, planHistoryFetched, displayPlanHistory]);

  const featuredPlanHistoryItem = useMemo(
    () => visiblePlanHistory.find((item) => item.is_active) ?? visiblePlanHistory[0] ?? null,
    [visiblePlanHistory],
  );

  const secondaryPlanHistory = useMemo(
    () =>
      visiblePlanHistory.filter((item) =>
        featuredPlanHistoryItem ? String(item.id) !== String(featuredPlanHistoryItem.id) : true,
      ),
    [visiblePlanHistory, featuredPlanHistoryItem],
  );

  const isPlanFocused = useCallback(
    (item: PlanSummary) => focusedPlanId === item.id || (focusedPlanId === null && item.is_active),
    [focusedPlanId],
  );

  const openPlanFromLibrary = useCallback((item: PlanSummary) => {
    setSelectedDay(0);
    setFocusedPlanId(item.is_active ? null : item.id);
    setManagementSheetOpen(false);
  }, []);

  const confirmDeletePlanFromLibrary = useCallback((item: PlanSummary) => {
    setManagementSheetOpen(false);
    setTimeout(() => setDeletePlanModal(item), 350);
  }, []);

  const totalPlansLabel = `${visiblePlanHistory.length} ${visiblePlanHistory.length === 1 ? 'plan' : 'planes'}`;

  const planMatchesFocus =
    plan != null &&
    typeof plan === 'object' &&
    (focusedPlanId === null || String(plan.id) === String(focusedPlanId));

  useEffect(() => {
    if (!plan?.days?.length) return;
    const chipStride = DAY_STRIP_CHIP_MIN_W + DAY_STRIP_CHIP_GAP;
    const targetX = Math.max(0, selectedDay * chipStride - 72);
    const id = requestAnimationFrame(() => {
      dayStripRef.current?.scrollTo({ x: targetX, animated: true });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedDay, plan?.id, plan?.days?.length]);

  /** Con keepPreviousData, al pasar de «current» null a un id concreto puede quedar null de placeholder hasta que llegue el GET. */
  const loadingPlanDetail =
    stillResolvingCurrentVsHistory ||
    (focusedPlanId !== null && !planMatchesFocus && planIsLoading);

  const generateMutation = useMutation({
    mutationFn: (payload: {
      additional_preferences?: string | null;
      meals_per_day?: number;
    }) =>
      api.post<DietPlan>(
        '/api/v1/plans/generate',
        {
          additional_preferences: payload.additional_preferences ?? null,
          meals_per_day: payload.meals_per_day,
        },
        { timeoutMs: PLAN_API_TIMEOUT_MS },
      ),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      setFocusedPlanId(data.is_active ? null : String(data.id));
      setIaWizardOverlayOpen(false);
    },
    onError: (e: Error & { message?: string }) => {
      const msg = toUserFacingErrorMessage(e, '');
      if (isPlanGenerationPremiumRequiredMessage(msg)) {
        navigateToPremiumUpgrade();
        return;
      }
      Alert.alert('No se pudo generar el plan', msg || 'Comprueba tu conexión e inténtalo de nuevo.');
    },
  });

  const activatePlanMutation = useMutation({
    mutationFn: (planId: string) =>
      api.post<DietPlan>(`/api/v1/plans/${planId}/activate`, {}, { timeoutMs: PLAN_API_TIMEOUT_MS }),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      setFocusedPlanId(null);
      setSelectedDay(0);
    },
    onError: (e: Error & { message?: string }) =>
      Alert.alert('No se pudo activar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const activatePlanFromLibrary = useCallback(
    (planId: string) => {
      setManagementSheetOpen(false);
      setTimeout(() => activatePlanMutation.mutate(planId), 350);
    },
    [activatePlanMutation],
  );

  const substituteFoodMutation = useMutation({
    mutationFn: ({
      mealId,
      foodIndex,
      reason,
    }: {
      mealId: string;
      foodIndex: number;
      reason?: string | null;
    }) =>
      api.post<DietPlan>(
        `/api/v1/plans/meals/${mealId}/substitute-food`,
        { food_index: foodIndex, reason: reason ?? null },
        { timeoutMs: PLAN_API_TIMEOUT_MS },
      ),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      setSubstituteFoodModal(null);
      setSubstituteReasonDraft('');
    },
    onError: (e: Error) =>
      Alert.alert('No se pudo sustituir', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const regenerateMealMutation = useMutation({
    mutationFn: ({ mealId, note }: { mealId: string; note?: string | null }) =>
      api.post<DietPlan>(
        `/api/v1/plans/meals/${mealId}/regenerate-meal`,
        { note: note ?? null },
        { timeoutMs: PLAN_API_TIMEOUT_MS },
      ),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      setRegenerateMealModal(null);
      setRegenerateMealNoteDraft('');
    },
    onError: (e: Error) =>
      Alert.alert('No se pudo rehacer', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const reorderDayMealsMutation = useMutation({
    mutationFn: ({ dayId, mealIds }: { dayId: string; mealIds: string[] }) =>
      api.patch<DietPlan>(`/api/v1/plans/days/${dayId}/meals-order`, {
        meal_ids: mealIds,
      }),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
    },
    onError: (e: Error) =>
      Alert.alert('No se pudo reordenar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const updateMealTitleMutation = useMutation({
    mutationFn: ({ mealId, title }: { mealId: string; title: string }) =>
      api.patch<DietPlan>(`/api/v1/plans/meals/${mealId}`, { title }),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
    },
    onError: (e: Error) =>
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const updateFoodMutation = useMutation({
    mutationFn: (payload: {
      mealId: string;
      foodIndex: number;
      name: string;
      grams: number;
      kcal: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    }) =>
      api.patch<DietPlan>(`/api/v1/plans/meals/${payload.mealId}/foods/${payload.foodIndex}`, {
        name: payload.name,
        grams: payload.grams,
        kcal: payload.kcal,
        protein_g: payload.protein_g,
        carbs_g: payload.carbs_g,
        fat_g: payload.fat_g,
      }),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
    },
    onError: (e: Error) =>
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const addFoodMutation = useMutation({
    mutationFn: (payload: {
      mealId: string;
      name: string;
      grams: number;
      kcal: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    }) =>
      api.post<DietPlan>(`/api/v1/plans/meals/${payload.mealId}/foods`, {
        name: payload.name,
        grams: payload.grams,
        kcal: payload.kcal,
        protein_g: payload.protein_g,
        carbs_g: payload.carbs_g,
        fat_g: payload.fat_g,
      }),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      setAddFoodOpen(null);
    },
    onError: (e: Error) =>
      Alert.alert('No se pudo añadir', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const addPlanMealToDiaryMutation = useMutation({
    mutationFn: (payload: {
      mealKey: string;
      mealType: string;
      mealTitle: string;
      items: ReturnType<typeof planFoodToDiaryItem>[];
    }) =>
      api.post('/api/v1/meals/confirm', {
        date: todayDateStr,
        meal_type: parseMealTypeParam(payload.mealType),
        title: payload.mealTitle,
        items: payload.items,
      }),
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      router.replace('/(tabs)' as never);
    },
    onError: (e: Error) =>
      Alert.alert('No se pudo añadir', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const addPlanMealToDiary = useCallback(
    (mealKey: string, meal: PlanMeal, mealTitle: string) => {
      if (addPlanMealToDiaryMutation.isPending) return;
      const items = meal.foods.map(planFoodToDiaryItem);
      if (items.length === 0) {
        Alert.alert('No se pudo añadir', 'Esta comida del plan no tiene alimentos.');
        return;
      }
      addPlanMealToDiaryMutation.mutate({
        mealKey,
        mealType: meal.meal_type,
        mealTitle,
        items,
      });
    },
    [addPlanMealToDiaryMutation],
  );

  const removeFoodMutation = useMutation({
    mutationFn: ({ mealId, foodIndex }: { mealId: string; foodIndex: number }) =>
      api.delete<DietPlan>(`/api/v1/plans/meals/${mealId}/foods/${foodIndex}`, {
        timeoutMs: PLAN_API_TIMEOUT_MS,
      }),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      setRemoveFoodModal(null);
    },
    onError: (e: Error) =>
      Alert.alert('No se pudo eliminar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const deletePlanMutation = useMutation({
    mutationFn: (planId: string) => api.delete(`/api/v1/plans/${planId}`),
    onSuccess: (_, planId) => {
      const pid = String(planId);
      // Sin quitar la caché, keepPreviousData del plan sigue mostrando el plan ya borrado.
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
      setDeletePlanModal(null);
      setFocusedPlanId((prev) => (prev != null && String(prev) === pid ? null : prev));
      setSelectedDay(0);
    },
    onError: (e: Error) =>
      Alert.alert('No se pudo eliminar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const duplicatePlanMutation = useMutation({
    mutationFn: (planId: string) =>
      api.post<DietPlan>(`/api/v1/plans/${planId}/duplicate`, {}, { timeoutMs: PLAN_API_TIMEOUT_MS }),
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      setManagementSheetOpen(false);
      Alert.alert('Plan duplicado', `Se creó la versión v${data.version} como copia.`);
    },
    onError: (e: Error) =>
      Alert.alert('No se pudo duplicar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const updatePlanMetaMutation = useMutation({
    mutationFn: (payload: { planId: string; label?: string; user_notes?: string }) => {
      if (payload.label !== undefined) {
        return api.patch<DietPlan>(
          `/api/v1/plans/${payload.planId}/label`,
          { label: payload.label },
          { timeoutMs: PLAN_API_TIMEOUT_MS },
        );
      }
      if (payload.user_notes !== undefined) {
        return Promise.reject(
          Object.assign(new Error('USER_NOTES_UNSUPPORTED'), { code: 'USER_NOTES_UNSUPPORTED' as const }),
        );
      }
      return Promise.reject(new Error('Solicitud vacía'));
    },
    onSuccess: (data) => {
      syncPlanDetailCaches(queryClient, data);
      patchPlanHistoryLabelInCache(queryClient, data.id, data.label);
      queryClient.invalidateQueries({ queryKey: ['planHistory'] });
    },
    onError: (e: Error & { code?: string }) => {
      if (e.code === 'USER_NOTES_UNSUPPORTED') {
        Alert.alert(
          'Notas no guardadas',
          'El servidor aún no guarda notas personales del plan. Solo el nombre se puede sincronizar por ahora.',
        );
        return;
      }
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.'));
    },
  });

  const closeDeletePlanModal = useCallback(() => {
    if (!deletePlanMutation.isPending) setDeletePlanModal(null);
  }, [deletePlanMutation.isPending]);

  const confirmDeletePlanExecution = useCallback(() => {
    if (!deletePlanModal) return;
    deletePlanMutation.mutate(deletePlanModal.id);
  }, [deletePlanModal, deletePlanMutation]);

  const closeRemoveFoodModal = useCallback(() => {
    if (!removeFoodMutation.isPending) setRemoveFoodModal(null);
  }, [removeFoodMutation.isPending]);

  const confirmRemoveFoodExecution = useCallback(() => {
    if (!removeFoodModal || removeFoodModal.mode !== 'confirm') return;
    removeFoodMutation.mutate({
      mealId: removeFoodModal.mealId,
      foodIndex: removeFoodModal.foodIndex,
    });
  }, [removeFoodModal, removeFoodMutation]);

  const handleGenerate = useCallback(() => {
    if (profileFetched && isNonPremiumTier(profile?.subscription_tier)) {
      navigateToPremiumUpgrade();
      return;
    }
    const parts: string[] = [];
    parts.push(`Comidas al día: ${wizard.mealsPerDay}`);
    {
      const variety = PLAN_VARIETY_OPTIONS.find((option) => option.value === wizard.varietyLevel);
      if (variety) {
        parts.push(`Variedad al generar: ${variety.label}. ${variety.hint}`);
      }
    }
    {
      const priority = PLAN_PRIORITY_OPTIONS.find((option) => option.value === wizard.generationPriority);
      if (priority) {
        parts.push(`Prioridad de generación: ${priority.label}. ${priority.hint}`);
      }
    }
    if (wizard.preferences.length > 0 && !wizard.preferences.includes('Ninguna')) {
      parts.push(`Preferencias: ${wizard.preferences.join(', ')}`);
    }
    if (wizard.dislikes.trim()) {
      parts.push(`No me gusta: ${wizard.dislikes.trim()}`);
    }
    const ctx = wizard.extraContext.trim();
    if (ctx) {
      parts.push(`Contexto: ${ctx}`);
    }
    generateMutation.mutate({
      additional_preferences: parts.length ? parts.join('. ') : null,
      meals_per_day: wizard.mealsPerDay,
    });
  }, [wizard, generateMutation, profileFetched, profile?.subscription_tier]);

  const closeIaWizardOverlay = useCallback(() => {
    setIaWizardOverlayOpen(false);
    router.replace('/(tabs)/plan' as never);
  }, []);

  const openRegenModal = useCallback(() => {
    setRegenContextDraft('');
    setRegenModalOpen(true);
  }, []);

  const confirmRegenerateFull = useCallback(() => {
    if (profileFetched && isNonPremiumTier(profile?.subscription_tier)) {
      setRegenModalOpen(false);
      navigateToPremiumUpgrade();
      return;
    }
    const ctx = regenContextDraft.trim();
    setRegenModalOpen(false);
    generateMutation.mutate({
      additional_preferences: ctx ? `Contexto: ${ctx}` : null,
    });
  }, [regenContextDraft, generateMutation, profileFetched, profile?.subscription_tier]);

  const togglePref = (p: string) => {
    setWizard((prev) => {
      if (p === 'Ninguna') return { ...prev, preferences: ['Ninguna'] };
      const without = prev.preferences.filter((x) => x !== 'Ninguna');
      const has = without.includes(p);
      return {
        ...prev,
        preferences: has ? without.filter((x) => x !== p) : [...without, p],
      };
    });
  };

  const openEditMeal = useCallback((mealId: string, title: string) => {
    setEditMealTitleDraft(title);
    setEditMealOpen({ mealId, title });
  }, []);

  const confirmEditMealTitle = useCallback(() => {
    if (!editMealOpen) return;
    const t = editMealTitleDraft.trim();
    if (!t) {
      Alert.alert('Título vacío', 'Escribe un nombre para la comida.');
      return;
    }
    updateMealTitleMutation.mutate(
      { mealId: editMealOpen.mealId, title: t },
      { onSuccess: () => setEditMealOpen(null) },
    );
  }, [editMealOpen, editMealTitleDraft, updateMealTitleMutation]);

  const openEditFood = useCallback((mealId: string, index: number, food: PlanFood) => {
    const g0 = Number(food.grams);
    const baseG = Number.isFinite(g0) && g0 > 0 ? g0 : 1;
    editFoodBaselineRef.current = {
      grams: baseG,
      kcal: Math.max(0, Number(food.kcal) || 0),
      protein_g: Math.max(0, Number(food.protein_g) || 0),
      carbs_g: Math.max(0, Number(food.carbs_g) || 0),
      fat_g: Math.max(0, Number(food.fat_g) || 0),
    };
    setEditFoodOpen({
      mealId,
      index,
      name: food.name,
      grams: String(Math.round(food.grams)),
      unit: 'g' as FoodUnit,
      kcal: String(Math.round(food.kcal)),
      protein_g: String(Math.round(food.protein_g)),
      carbs_g: String(Math.round(food.carbs_g)),
      fat_g: String(Math.round(food.fat_g)),
    });
  }, []);

  const onEditFoodGramsTextChange = useCallback((t: string) => {
    const s = sanitizeDecimalTextInput(t, 10);
    setEditFoodOpen((p) => {
      if (!p) return p;
      const base = editFoodBaselineRef.current;
      if (!base || base.grams <= 0) return { ...p, grams: s };
      const rawQty = parseFloat(String(s).replace(',', '.'));
      if (!Number.isFinite(rawQty) || rawQty < 0) return { ...p, grams: s };
      const newG = toGrams(rawQty, p.unit);
      const ratio = newG / base.grams;
      const r1 = (n: number) => Math.round(n * ratio * 10) / 10;
      return {
        ...p,
        grams: s,
        kcal: String(Math.max(0, Math.round(base.kcal * ratio))),
        protein_g: String(r1(base.protein_g)),
        carbs_g: String(r1(base.carbs_g)),
        fat_g: String(r1(base.fat_g)),
      };
    });
  }, []);

  const onEditFoodUnitChange = useCallback((newUnit: FoodUnit) => {
    setEditFoodOpen((p) => {
      if (!p) return p;
      const rawQty = parseFloat(p.grams.replace(',', '.')) || 0;
      const currentGrams = toGrams(rawQty, p.unit);
      const converted = fromGrams(currentGrams, newUnit);
      return {
        ...p,
        unit: newUnit,
        grams: String(Math.round(converted * 100) / 100),
      };
    });
  }, []);

  const confirmEditFood = useCallback(() => {
    if (!editFoodOpen) return;
    const parseNum = (s: string) => {
      const n = parseFloat(String(s).replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };
    const name = editFoodOpen.name.trim();
    if (!name) {
      Alert.alert('Nombre vacío', 'Indica el nombre del alimento.');
      return;
    }
    const rawQty = parseNum(editFoodOpen.grams);
    const gramsConverted = toGrams(rawQty, editFoodOpen.unit);
    updateFoodMutation.mutate(
      {
        mealId: editFoodOpen.mealId,
        foodIndex: editFoodOpen.index,
        name,
        grams: gramsConverted,
        kcal: parseNum(editFoodOpen.kcal),
        protein_g: parseNum(editFoodOpen.protein_g),
        carbs_g: parseNum(editFoodOpen.carbs_g),
        fat_g: parseNum(editFoodOpen.fat_g),
      },
      { onSuccess: () => setEditFoodOpen(null) },
    );
  }, [editFoodOpen, updateFoodMutation]);

  const openAddFood = useCallback((mealId: string, mealTitle: string) => {
    setAddFoodOpen({
      mealId,
      mealTitle,
      name: '',
      grams: '100',
      unit: 'g' as FoodUnit,
      kcal: '0',
      protein_g: '0',
      carbs_g: '0',
      fat_g: '0',
    });
  }, []);

  const closeAddFood = useCallback(() => {
    if (!addFoodMutation.isPending) setAddFoodOpen(null);
  }, [addFoodMutation.isPending]);

  const confirmAddFood = useCallback(() => {
    if (!addFoodOpen) return;
    const parseNum = (s: string) => {
      const n = parseFloat(String(s).replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };
    const name = addFoodOpen.name.trim();
    if (!name) {
      Alert.alert('Nombre vacío', 'Indica el nombre del alimento.');
      return;
    }
    addFoodMutation.mutate({
      mealId: addFoodOpen.mealId,
      name,
      grams: toGrams(parseNum(addFoodOpen.grams), addFoodOpen.unit),
      kcal: parseNum(addFoodOpen.kcal),
      protein_g: parseNum(addFoodOpen.protein_g),
      carbs_g: parseNum(addFoodOpen.carbs_g),
      fat_g: parseNum(addFoodOpen.fat_g),
    });
  }, [addFoodOpen, addFoodMutation]);

  const openSubstituteFoodModal = useCallback(
    (mealId: string, foodIndex: number, foodName: string, mealTitle: string) => {
      if (profileFetched && isNonPremiumTier(profile?.subscription_tier)) {
        showPlanSubstituteFoodIaPremiumLock();
        return;
      }
      setSubstituteReasonDraft('');
      setSubstituteFoodModal({ mealId, foodIndex, foodName, mealTitle });
    },
    [profileFetched, profile?.subscription_tier],
  );

  const closeSubstituteFoodModal = useCallback(() => {
    setSubstituteFoodModal(null);
    setSubstituteReasonDraft('');
  }, []);

  const confirmSubstituteFood = useCallback(() => {
    if (!substituteFoodModal) return;
    if (profileFetched && isNonPremiumTier(profile?.subscription_tier)) {
      closeSubstituteFoodModal();
      showPlanSubstituteFoodIaPremiumLock();
      return;
    }
    const base =
      'Rehacer: otra opción culinaria distinta, coherente con el plato y con los demás alimentos de la misma comida; macros similares al ítem actual.';
    const note = substituteReasonDraft.trim();
    const reason = note ? `${base} Preferencia del usuario: ${note}` : base;
    substituteFoodMutation.mutate({
      mealId: substituteFoodModal.mealId,
      foodIndex: substituteFoodModal.foodIndex,
      reason,
    });
  }, [
    substituteFoodModal,
    substituteReasonDraft,
    substituteFoodMutation,
    profileFetched,
    profile?.subscription_tier,
    closeSubstituteFoodModal,
  ]);

  const openRegenerateMealModal = useCallback(
    (mealId: string, mealTitle: string, slotLabel: string) => {
      if (profileFetched && isNonPremiumTier(profile?.subscription_tier)) {
        showPlanRegenerateMealIaPremiumLock();
        return;
      }
      setRegenerateMealNoteDraft('');
      setRegenerateMealModal({ mealId, mealTitle, slotLabel });
    },
    [profileFetched, profile?.subscription_tier],
  );

  const closeRegenerateMealModal = useCallback(() => {
    if (regenerateMealMutation.isPending) return;
    setRegenerateMealModal(null);
    setRegenerateMealNoteDraft('');
  }, [regenerateMealMutation.isPending]);

  const confirmRegenerateMeal = useCallback(() => {
    if (!regenerateMealModal) return;
    if (profileFetched && isNonPremiumTier(profile?.subscription_tier)) {
      closeRegenerateMealModal();
      showPlanRegenerateMealIaPremiumLock();
      return;
    }
    const note = regenerateMealNoteDraft.trim();
    regenerateMealMutation.mutate({
      mealId: regenerateMealModal.mealId,
      note: note.length > 0 ? note : null,
    });
  }, [
    regenerateMealModal,
    regenerateMealNoteDraft,
    regenerateMealMutation,
    profileFetched,
    profile?.subscription_tier,
    closeRegenerateMealModal,
  ]);

  const moveMealInDay = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!plan?.days?.length) return;
      const d = plan.days[selectedDay];
      if (!d?.id) return;
      const meals = d.meals;
      if (fromIndex < 0 || fromIndex >= meals.length || toIndex < 0 || toIndex >= meals.length) return;
      if (fromIndex === toIndex) return;
      const ids = meals.map((m) => m.id).filter((id): id is string => id != null && id !== '');
      if (ids.length !== meals.length) return;
      const next = [...ids];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      reorderDayMealsMutation.mutate({ dayId: d.id, mealIds: next });
    },
    [plan, selectedDay, reorderDayMealsMutation],
  );

  const handleSharePlan = useCallback(async () => {
    if (!plan) return;
    try {
      const text = formatPlanForExport(plan);
      await Share.share({ message: text, title: `Plan semanal v${plan.version}` });
    } catch {
      // user cancelled
    }
  }, [plan]);

  const openEditLabel = useCallback(() => {
    if (!plan) return;
    setEditLabelDraft(plan.label || '');
    setEditLabelModalOpen(true);
  }, [plan]);

  const confirmEditLabel = useCallback(() => {
    if (!plan) return;
    updatePlanMetaMutation.mutate(
      { planId: plan.id, label: editLabelDraft.trim() },
      { onSuccess: () => setEditLabelModalOpen(false) },
    );
  }, [plan, editLabelDraft, updatePlanMetaMutation]);

  const openEditNotes = useCallback(() => {
    if (!plan) return;
    setEditNotesDraft(plan.user_notes || '');
    setEditNotesModalOpen(true);
  }, [plan]);

  const confirmEditNotes = useCallback(() => {
    if (!plan) return;
    updatePlanMetaMutation.mutate(
      { planId: plan.id, user_notes: editNotesDraft.trim() },
      { onSuccess: () => setEditNotesModalOpen(false) },
    );
  }, [plan, editNotesDraft, updatePlanMetaMutation]);

  useEffect(() => {
    setExpandedMeals({});
  }, [plan?.id, mealsCollapsedByDefault]);

  const toggleMealExpanded = useCallback((key: string) => {
    setExpandedMeals((prev) => {
      const cur = prev[key] ?? !mealsCollapsedByDefault;
      return { ...prev, [key]: !cur };
    });
  }, [mealsCollapsedByDefault]);

  const isMealExpanded = useCallback(
    (key: string) => expandedMeals[key] ?? !mealsCollapsedByDefault,
    [expandedMeals, mealsCollapsedByDefault],
  );

  const dayActual = useMemo(() => {
    if (!plan?.days?.length) return null;
    const d = plan.days[selectedDay];
    if (!d?.meals) return null;
    return sumDayFromPlan(d);
  }, [plan, selectedDay]);

  const isActivePlan = plan?.is_active === true;
  const canEditPlan =
    !generateMutation.isPending &&
    !activatePlanMutation.isPending &&
    !substituteFoodMutation.isPending &&
    !removeFoodMutation.isPending &&
    !addFoodMutation.isPending &&
    !regenerateMealMutation.isPending &&
    !reorderDayMealsMutation.isPending &&
    !updateMealTitleMutation.isPending &&
    !updateFoodMutation.isPending;

  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16;

  if (loadingPlanDetail) return <LoadingScreen />;

  if (!plan) {
    if (planHistoryFetched && planHistoryError && rawPlanHistory.length === 0) {
      return (
        <ScreenFocusProvider>
          <View
            style={[
              styles.container,
              styles.content,
              {
                paddingTop: Math.max(insets.top, spacing.md) + spacing.sm,
                paddingBottom: bottomPad,
                justifyContent: 'center',
                minHeight: 320,
              },
            ]}
          >
            <Text style={styles.heroTitle}>Tu plan</Text>
            <Text style={[styles.heroSub, { marginBottom: spacing.lg }]}>
              No se pudo cargar tu listado de planes.
            </Text>
            <Button title="Reintentar" onPress={() => refetchPlanHistory()} size="lg" />
          </View>
        </ScreenFocusProvider>
      );
    }

    return (
      <ScreenFocusProvider>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, spacing.md) + spacing.sm, paddingBottom: bottomPad },
        ]}
      >
        <TouchableOpacity
          style={styles.backToHubRow}
          onPress={() => router.replace('/(tabs)/plan' as never)}
          accessibilityRole="button"
          accessibilityLabel="Volver a gestión de planes"
        >
          <Ionicons name="chevron-back" size={22} color={colors.primaryLight} />
          <Text style={styles.backToHubText}>Gestión de planes</Text>
        </TouchableOpacity>

        <IaPlanWizardLayout
          wizard={wizard}
          setWizard={setWizard}
          togglePref={togglePref}
          onGenerate={handleGenerate}
          generating={generateMutation.isPending}
          heroTitle="Tu plan semanal"
          heroSubtitle="Personalizamos la semana con tus objetivos del perfil y lo que indiques aquí."
          ctaTitle="Generar plan"
          foodRestrictions={foodRestrictions}
        />
      </ScrollView>
      </ScreenFocusProvider>
    );
  }

  const day = plan.days[selectedDay];

  const kcalDelta =
    dayActual && plan.target_kcal > 0 ? dayActual.kcal - plan.target_kcal : 0;
  const kcalProgressPct =
    plan.target_kcal > 0 && dayActual
      ? Math.min(100, (dayActual.kcal / plan.target_kcal) * 100)
      : 0;
  const macroPct = (cur: number, tgt: number) =>
    tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;

  return (
    <ScreenFocusProvider>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top, spacing.md) + spacing.lg, paddingBottom: bottomPad },
      ]}
    >
      <TouchableOpacity
        style={styles.backToHubRow}
        onPress={() => router.replace('/(tabs)/plan' as never)}
        accessibilityRole="button"
        accessibilityLabel="Volver a gestión de planes"
      >
        <Ionicons name="chevron-back" size={22} color={colors.primaryLight} />
        <Text style={styles.backToHubText}>Gestión de planes</Text>
      </TouchableOpacity>
      {/* ── Header compacto + selector de día integrado ── */}
      <SlideUpView delay={0} duration={450} distance={18}>
        <View style={styles.weekHeaderCard}>
          <View style={styles.weekHeaderInner}>
            <View style={styles.weekHeaderTop}>
              <View style={styles.weekHeaderLeft}>
                <Text style={styles.weekTitleMain} numberOfLines={2}>
                  {weekPlanDisplayTitle}
                </Text>
                <View style={styles.weekMetaRow}>
                  <View style={styles.versionBadge}>
                    <Text style={styles.versionBadgeText}>v{plan.version}</Text>
                  </View>
                  {planIsFetching && !planIsLoading ? (
                    <ActivityIndicator size="small" color={colors.primaryLight} style={{ marginLeft: spacing.xs }} />
                  ) : null}
                {isActivePlan ? (
                  <View style={styles.activePillInline}>
                    <View style={styles.activePillDot} />
                    <Text style={styles.activePillTextInline}>Activo</Text>
                  </View>
                ) : null}
              </View>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() =>
                    router.push({ pathname: '/shopping-list', params: { planId: plan.id } })
                  }
                  activeOpacity={0.88}
                  style={styles.compraBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Lista de la compra"
                >
                  <Ionicons name="cart-outline" size={18} color={colors.white} />
                  <Text style={styles.compraBtnLabel}>Compra</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setManagementSheetOpen(true)}
                  activeOpacity={0.7}
                  style={styles.overflowBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Más opciones del plan"
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.weekDateRow}>
              <View style={styles.weekDateIconWrap}>
                <Ionicons name="calendar-outline" size={iconSize.sm} color={colors.primaryLight} />
              </View>
              <Text style={styles.weekRange} numberOfLines={2}>
                {formatWeekRangeLabel(weekStartMonday)}
              </Text>
            </View>

            <View style={styles.dayStripSection}>
              <ScrollView
                ref={dayStripRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.dayStripScroll}
                contentContainerStyle={styles.dayStripScrollContent}
              >
                {plan.days.map((d, i) => {
                  const dn = d.day_number ?? i + 1;
                  const dateForDay = addDays(weekStartMonday, dn - 1);
                  const wk = shortWeekdayEs(dateForDay);
                  const dayNum = dateForDay.getDate();
                  const sel = selectedDay === i;
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setSelectedDay(i)}
                      style={[styles.dayStripChip, sel && styles.dayStripChipActive]}
                      activeOpacity={0.82}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      accessibilityLabel={dateForDay.toLocaleDateString('es-ES', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    >
                      <Text style={[styles.dayStripChipNum, sel && styles.dayStripChipNumActive]}>{dayNum}</Text>
                      <Text
                        style={[styles.dayStripChipWk, sel && styles.dayStripChipWkActive]}
                        numberOfLines={1}
                      >
                        {wk}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </View>
      </SlideUpView>

      {/* ── Inactive banner ── */}
      {!isActivePlan ? (
        <View style={styles.inactiveBanner}>
          <Text style={styles.inactiveBannerText}>
            Plan guardado — puedes editarlo o activarlo cuando quieras.
          </Text>
          <View style={styles.inactiveBannerActions}>
            <TouchableOpacity
              onPress={() => {
                setFocusedPlanId(null);
                setSelectedDay(0);
                router.replace('/(tabs)/plan/weekly' as never);
              }}
              hitSlop={8}
            >
              <Text style={styles.inactiveLink}>Ver activo</Text>
            </TouchableOpacity>
            <Button
              title="Activar"
              onPress={() => activatePlanMutation.mutate(plan.id)}
              loading={activatePlanMutation.isPending}
              size="sm"
            />
          </View>
        </View>
      ) : null}

      {/* ── Day summary ── */}
      <SlideUpView delay={120} duration={450} distance={20}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryCardHeader}>
            <View>
              <Text style={styles.summaryCardLabel}>Calorías del día</Text>
              {dayActual ? (
                <Text style={styles.summaryKcalLine}>
                  <Text style={styles.summaryKcalCurrent}>{Math.round(dayActual.kcal)}</Text>
                  <Text style={styles.summaryKcalSlash}> / {Math.round(plan.target_kcal)}</Text>
                </Text>
              ) : null}
            </View>
            {dayActual ? (
              <View
                style={[
                  styles.deltaBadge,
                  kcalDelta > 0 ? styles.deltaBadgeOver : styles.deltaBadgeUnder,
                ]}
              >
                <Text
                  style={[
                    styles.deltaBadgeText,
                    { color: kcalDelta > 0 ? colors.error : colors.primaryLight },
                  ]}
                >
                  {kcalDelta >= 0 ? '+' : ''}{Math.round(kcalDelta)}
                </Text>
              </View>
            ) : null}
          </View>
          {dayActual ? (
            <>
              <View style={styles.kcalBarTrack}>
                <View style={[styles.kcalBarFill, { width: `${kcalProgressPct}%` }]} />
              </View>
              <View style={styles.summaryMacroRow}>
                {([
                  { label: 'Proteína', cur: dayActual.p, tgt: plan.target_protein_g, color: colors.protein, mutedColor: colors.proteinMuted },
                  { label: 'Carbos', cur: dayActual.c, tgt: plan.target_carbs_g, color: colors.carbs, mutedColor: colors.carbsMuted },
                  { label: 'Grasas', cur: dayActual.f, tgt: plan.target_fat_g, color: colors.fat, mutedColor: colors.fatMuted },
                ] as const).map((macro) => (
                  <View key={macro.label} style={styles.summaryMacroCol}>
                    <Text style={[styles.summaryMacroLabel, { color: macro.color }]}>
                      {macro.label.toUpperCase()}
                    </Text>
                    <Text style={styles.summaryMacroValues}>
                      {Math.round(macro.cur)}<Text style={styles.summaryMacroTarget}>/{Math.round(macro.tgt)}g</Text>
                    </Text>
                    <View style={[styles.summaryMacroBarTrack, { backgroundColor: macro.mutedColor }]}>
                      <View
                        style={[
                          styles.summaryMacroBarFill,
                          {
                            width: `${macroPct(macro.cur, macro.tgt)}%`,
                            backgroundColor: macro.color,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.summaryEmpty}>Sin datos para este día</Text>
          )}
        </View>
      </SlideUpView>

      {/* ── Meals (drag-to-reorder con long press) ── */}
      {day ? (
        <DraggableMealList
          enabled={canEditPlan && !!day.id && day.meals.length > 1 && !reorderDayMealsMutation.isPending}
          onReorder={moveMealInDay}
          meals={day.meals.map((meal, i) => {
            const mealId = meal.id != null && meal.id !== '' ? String(meal.id) : '';
            const expandKey = mealId || `d${day.day_number}-m${i}`;
            const expanded = isMealExpanded(expandKey);
            const mealTitle = capitalizeFirstChar((meal.title || MEAL_LABELS[meal.meal_type] || meal.meal_type).trim());
            const addToDiaryPending =
              addPlanMealToDiaryMutation.isPending &&
              addPlanMealToDiaryMutation.variables?.mealKey === expandKey;
            return {
              key: expandKey,
              node: (
                <StaggerItem index={i} baseDelay={300} staggerMs={80}>
                  <View style={styles.mealCard}>
                    <View style={styles.mealCardHeader}>
                      <Pressable
                        onPress={() => toggleMealExpanded(expandKey)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        accessibilityLabel={`${mealTitle}, ${Math.round(meal.total_kcal)} kilocalorías. ${expanded ? 'Contraer' : 'Expandir'} lista de alimentos`}
                        style={({ pressed }) => [
                          styles.mealCardHeaderMain,
                          pressed && styles.mealCardHeaderPressablePressed,
                        ]}
                      >
                        <MealTypeIcon mealType={meal.meal_type} size={48} animated={false} />
                        <View style={styles.mealCardHeaderText}>
                          <Text style={styles.mealCardType} numberOfLines={2}>{mealTitle}</Text>
                          <View style={styles.mealCardMacroInline}>
                            <Text style={[styles.mealCardMacroChip, { color: colors.calories }]}>
                              {Math.round(meal.total_kcal)} kcal
                            </Text>
                            <Text style={[styles.mealCardMacroChip, { color: colors.protein }]}>
                              Prote {Math.round(meal.total_protein_g)}g
                            </Text>
                            <Text style={[styles.mealCardMacroChip, { color: colors.carbs }]}>
                              Carbos {Math.round(meal.total_carbs_g)}g
                            </Text>
                            <Text style={[styles.mealCardMacroChip, { color: colors.fat }]}>
                              Grasas {Math.round(meal.total_fat_g)}g
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                      <TouchableOpacity
                        onPress={() => addPlanMealToDiary(expandKey, meal, mealTitle)}
                        accessibilityRole="button"
                        accessibilityLabel={`Añadir ${mealTitle} a lo comido hoy`}
                        hitSlop={8}
                        disabled={addToDiaryPending || meal.foods.length === 0}
                        activeOpacity={0.82}
                        style={[
                          styles.mealCardAddTodayBtn,
                          (addToDiaryPending || meal.foods.length === 0) && styles.mealCardAddTodayBtnDisabled,
                        ]}
                      >
                        {addToDiaryPending ? (
                          <ActivityIndicator size="small" color={colors.primaryLight} />
                        ) : (
                          <Ionicons name="add" size={21} color={colors.primaryLight} />
                        )}
                      </TouchableOpacity>
                      <Pressable
                        onPress={() => toggleMealExpanded(expandKey)}
                        accessibilityRole="button"
                        accessibilityLabel={expanded ? 'Contraer' : 'Expandir'}
                        hitSlop={8}
                      >
                        <MealSlotChevron expanded={expanded} />
                      </Pressable>
                    </View>

                    <AnimatedCollapsible expanded={expanded}>
                      <>
                        {meal.foods.map((food, j) => (
                          <View key={j} style={styles.foodRow}>
                            <TouchableOpacity
                              style={styles.foodRowMain}
                              onPress={() => {
                                if (mealId && canEditPlan) openEditFood(mealId, j, food);
                              }}
                              disabled={
                                !mealId ||
                                !canEditPlan ||
                                substituteFoodMutation.isPending ||
                                removeFoodMutation.isPending ||
                                addFoodMutation.isPending ||
                                updateFoodMutation.isPending
                              }
                              activeOpacity={0.65}
                              accessibilityRole="button"
                              accessibilityLabel={`Editar ${food.name}`}
                            >
                              <Text style={styles.foodName}>{food.name}</Text>
                              <Text style={styles.foodMeta}>
                                {Math.round(food.grams)}g · {Math.round(food.kcal)} kcal
                              </Text>
                            </TouchableOpacity>
                            {mealId ? (
                              <View style={styles.foodActions}>
                                <TouchableOpacity
                                  onPress={() => openSubstituteFoodModal(mealId, j, food.name, meal.title)}
                                  hitSlop={6}
                                  disabled={
                                    !canEditPlan ||
                                    substituteFoodMutation.isPending ||
                                    removeFoodMutation.isPending ||
                                    addFoodMutation.isPending
                                  }
                                  style={[styles.foodActionBtn, styles.foodActionAI]}
                                  accessibilityLabel="Rehacer alimento con IA"
                                >
                                  <Ionicons
                                    name="sparkles-outline"
                                    size={15}
                                    color={canEditPlan ? colors.primaryLight : colors.textMuted}
                                  />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => {
                                    setRemoveFoodModal({
                                      mode: 'confirm',
                                      mealId,
                                      foodIndex: j,
                                      foodName: food.name,
                                    });
                                  }}
                                  hitSlop={6}
                                  disabled={
                                    !canEditPlan ||
                                    substituteFoodMutation.isPending ||
                                    removeFoodMutation.isPending ||
                                    addFoodMutation.isPending
                                  }
                                  style={[styles.foodActionBtn, styles.foodActionDanger]}
                                >
                                  <Ionicons
                                    name="trash-outline"
                                    size={15}
                                    color={canEditPlan ? colors.error : colors.textMuted}
                                  />
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <Text style={styles.noMealIdHint}>Regenera para editar</Text>
                            )}
                          </View>
                        ))}

                        <View style={styles.mealCardFooter}>
                          <TouchableOpacity
                            style={[styles.mealFooterBtn, (!canEditPlan || !mealId) && styles.footerBtnDisabled]}
                            onPress={() => {
                              if (!canEditPlan || !mealId) return;
                              openAddFood(mealId, meal.title);
                            }}
                            hitSlop={8}
                            disabled={!canEditPlan || !mealId}
                          >
                            <Ionicons name="add" size={16} color={canEditPlan && mealId ? colors.primaryLight : colors.textMuted} />
                            <Text style={[styles.mealFooterBtnText, (!canEditPlan || !mealId) && { color: colors.textMuted }]}>Añadir</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.mealFooterBtn, !canEditPlan && styles.footerBtnDisabled]}
                            onPress={() => {
                              if (!canEditPlan || !mealId) return;
                              openEditMeal(mealId, meal.title);
                            }}
                            hitSlop={8}
                            disabled={!canEditPlan || !mealId}
                          >
                            <Ionicons name="pencil-outline" size={14} color={canEditPlan ? colors.textSecondary : colors.textMuted} />
                            <Text style={[styles.mealFooterBtnText, !canEditPlan && { color: colors.textMuted }]}>Editar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.mealFooterBtn, !canEditPlan && styles.footerBtnDisabled]}
                            onPress={() => {
                              if (!mealId) {
                                Alert.alert(
                                  'No se puede rehacer',
                                  'Esta comida no tiene identificador. Regenera el plan completo para habilitar acciones.',
                                );
                                return;
                              }
                              if (!canEditPlan) {
                                Alert.alert(
                                  'Proceso en curso',
                                  'Espera a que termine la operación actual y vuelve a intentarlo.',
                                );
                                return;
                              }
                              openRegenerateMealModal(
                                mealId,
                                meal.title || MEAL_LABELS[meal.meal_type] || meal.meal_type,
                                MEAL_LABELS[meal.meal_type] || meal.meal_type,
                              );
                            }}
                            hitSlop={8}
                            disabled={!canEditPlan || !mealId || regenerateMealMutation.isPending}
                          >
                            <Ionicons
                              name="sparkles-outline"
                              size={14}
                              color={
                                canEditPlan && !regenerateMealMutation.isPending
                                  ? colors.primaryLight
                                  : colors.textMuted
                              }
                            />
                            <Text
                              style={[
                                styles.mealFooterBtnText,
                                (!canEditPlan || regenerateMealMutation.isPending) && { color: colors.textMuted },
                              ]}
                            >
                              {regenerateMealMutation.isPending &&
                              regenerateMealMutation.variables?.mealId === mealId
                                ? 'Rehaciendo…'
                                : 'Rehacer'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    </AnimatedCollapsible>
                  </View>
                </StaggerItem>
              ),
            };
          })}
        />
      ) : null}

      {/* ── Plan Management BottomSheet ── */}
      <BottomSheet
        visible={managementSheetOpen}
        onDismiss={() => setManagementSheetOpen(false)}
        expandToMaxHeight
        maxHeightFraction={0.85}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetContent}
        >
          {/* Section: header */}
          <Text style={styles.sheetTitle}>Gestionar plan</Text>
          <Text style={styles.sheetSubtitle}>
            v{plan.version}{plan.label ? ` — ${plan.label}` : ''} · {formatPlanDate(plan.created_at)}
          </Text>

          {/* Section 1: Quick actions */}
          <View style={styles.sheetSection}>
            <Text style={styles.sheetSectionLabel}>Acciones</Text>
            <View style={styles.sheetCard}>
              <ListRow
                leading={<Ionicons name="copy-outline" size={20} color={colors.textSecondary} />}
                title="Duplicar plan"
                subtitle="Copia como nueva versión inactiva"
                trailing={
                  duplicatePlanMutation.isPending
                    ? <ActivityIndicator size="small" color={colors.primaryLight} />
                    : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                }
                onPress={() => {
                  if (duplicatePlanMutation.isPending) return;
                  duplicatePlanMutation.mutate(plan.id);
                }}
                showSeparator
              />
              <ListRow
                leading={<Ionicons name="share-outline" size={20} color={colors.textSecondary} />}
                title="Compartir plan"
                subtitle="Envía el plan como texto"
                trailing={<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                onPress={handleSharePlan}
                showSeparator
              />
              <ListRow
                leading={<Ionicons name="sparkles" size={20} color={colors.textMuted} />}
                title="Regenerar plan (IA)"
                subtitle="Sustituye la semana completa; opcional con notas"
                trailing={<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                onPress={() => {
                  if (generateMutation.isPending) {
                    Alert.alert(
                      'Generación en curso',
                      'Ya hay una regeneración en marcha. Espera a que termine.',
                    );
                    return;
                  }
                  if (profileFetched && isNonPremiumTier(profile?.subscription_tier)) {
                    setManagementSheetOpen(false);
                    setTimeout(() => showRegenerateFullWeekPlanIaPremiumLock(), 350);
                    return;
                  }
                  setManagementSheetOpen(false);
                  setTimeout(() => openRegenModal(), 350);
                }}
              />
            </View>
          </View>

          {/* Section 2: Plan details */}
          <View style={styles.sheetSection}>
            <Text style={styles.sheetSectionLabel}>Detalles</Text>
            <View style={styles.sheetCard}>
              <ListRow
                leading={<Ionicons name="pricetag-outline" size={20} color={colors.textSecondary} />}
                title="Etiqueta"
                subtitle={plan.label || 'Sin etiqueta'}
                trailing={<Ionicons name="pencil-outline" size={16} color={colors.textMuted} />}
                onPress={() => {
                  setManagementSheetOpen(false);
                  setTimeout(openEditLabel, 350);
                }}
                showSeparator
              />
              <ListRow
                leading={<Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />}
                title="Mis notas"
                subtitle={plan.user_notes || 'Sin notas personales'}
                trailing={<Ionicons name="pencil-outline" size={16} color={colors.textMuted} />}
                onPress={() => {
                  setManagementSheetOpen(false);
                  setTimeout(openEditNotes, 350);
                }}
                showSeparator
              />
              <View style={styles.sheetInfoRow}>
                <View style={styles.sheetInfoCol}>
                  <Text style={styles.sheetInfoValue}>~{Math.round(plan.target_kcal).toLocaleString('es-ES')}</Text>
                  <Text style={styles.sheetInfoUnit}>kcal/día</Text>
                </View>
                <View style={styles.sheetInfoCol}>
                  <Text style={styles.sheetInfoValue}>{Math.round(plan.target_protein_g)}g</Text>
                  <Text style={styles.sheetInfoUnit}>proteína</Text>
                </View>
                <View style={styles.sheetInfoCol}>
                  <Text style={styles.sheetInfoValue}>{Math.round(plan.target_carbs_g)}g</Text>
                  <Text style={styles.sheetInfoUnit}>carbos</Text>
                </View>
                <View style={styles.sheetInfoCol}>
                  <Text style={styles.sheetInfoValue}>{Math.round(plan.target_fat_g)}g</Text>
                  <Text style={styles.sheetInfoUnit}>grasas</Text>
                </View>
              </View>
              {plan.rationale ? (
                <View style={styles.sheetRationale}>
                  <Text style={styles.sheetRationaleLabel}>Notas del plan (IA)</Text>
                  <Text style={styles.sheetRationaleText}>{plan.rationale}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Section 3: Plan library */}
          {visiblePlanHistory.length > 0 || planHistoryPending || planHistoryError ? (
            <View style={styles.sheetSection}>
              <View style={styles.sheetSectionHeader}>
                <View style={styles.librarySectionHeaderMain}>
                  <Text style={styles.librarySectionTitle}>Biblioteca de planes</Text>
                  <Text style={styles.librarySectionSubtitle}>
                    Supervisá, activá y revisá cada versión desde un solo lugar.
                  </Text>
                </View>
                <View style={styles.libraryCountBadge}>
                  {planHistoryPending && visiblePlanHistory.length === 0 ? (
                    <ActivityIndicator size="small" color={colors.primaryLight} />
                  ) : (
                    <Text style={styles.libraryCountBadgeText}>{totalPlansLabel}</Text>
                  )}
                </View>
              </View>
              {planHistoryError && rawPlanHistory.length === 0 ? (
                <View style={styles.sheetCard}>
                  <Text style={styles.sheetHistoryHint}>No se pudo cargar la biblioteca de planes.</Text>
                  <TouchableOpacity onPress={() => refetchPlanHistory()} style={styles.planListRetry}>
                    <Text style={styles.planListRetryText}>Reintentar</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

{featuredPlanHistoryItem ? (
  <View style={styles.libraryGroup}>
    <View style={styles.libraryGroupHeader}>
      <Text style={styles.libraryGroupTitle}>
        {featuredPlanHistoryItem.is_active ? 'Plan activo ahora' : '?ltimo plan disponible'}
      </Text>
      <Text style={styles.libraryGroupHint}>
        {featuredPlanHistoryItem.is_active
          ? 'Siempre arriba para que no haya dudas.'
          : 'No recibimos un activo marcado; mostramos el m?s reciente.'}
      </Text>
    </View>
    <Pressable
      style={({ pressed }) => [
        styles.libraryFeaturedCard,
        isPlanFocused(featuredPlanHistoryItem) && styles.libraryFeaturedCardFocused,
        featuredPlanHistoryItem.is_active
          ? styles.libraryFeaturedCardActive
          : styles.libraryFeaturedCardArchived,
        pressed && { opacity: 0.96 },
      ]}
      onPress={() => openPlanFromLibrary(featuredPlanHistoryItem)}
    >
      <View style={styles.libraryFeaturedTopRow}>
        <View style={styles.libraryFeaturedBadgeRow}>
          <View style={styles.libraryVersionChip}>
            <Text style={styles.libraryVersionChipText}>v{featuredPlanHistoryItem.version}</Text>
          </View>
          <View
            style={[
              styles.libraryStatusChip,
              featuredPlanHistoryItem.is_active
                ? styles.libraryStatusChipActive
                : styles.libraryStatusChipArchived,
            ]}
          >
            <View
              style={[
                styles.libraryStatusDot,
                featuredPlanHistoryItem.is_active
                  ? styles.libraryStatusDotActive
                  : styles.libraryStatusDotArchived,
              ]}
            />
            <Text
              style={[
                styles.libraryStatusText,
                featuredPlanHistoryItem.is_active
                  ? styles.libraryStatusTextActive
                  : styles.libraryStatusTextArchived,
              ]}
            >
              {featuredPlanHistoryItem.is_active ? 'Activo' : 'Archivado'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={(event) => {
            event.stopPropagation();
            confirmDeletePlanFromLibrary(featuredPlanHistoryItem);
          }}
          hitSlop={8}
          disabled={deletePlanMutation.isPending}
          style={styles.libraryFeaturedUtilityBtn}
        >
          <Ionicons
            name="trash-outline"
            size={17}
            color={deletePlanMutation.isPending ? colors.textMuted : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.libraryFeaturedTitle} numberOfLines={2}>
        {featuredPlanHistoryItem.label?.trim() || 'Plan semanal'}
      </Text>

      <View style={styles.libraryFeaturedMetricRow}>
        <View style={styles.libraryMetricChip}>
          <Ionicons name="flame-outline" size={14} color={colors.calories} />
          <Text style={styles.libraryMetricChipText}>
            ~{Math.round(featuredPlanHistoryItem.target_kcal).toLocaleString('es-ES')} kcal/d?a
          </Text>
        </View>
        {featuredPlanHistoryItem.target_protein_g ? (
          <View style={styles.libraryMetricChip}>
            <Ionicons name="barbell-outline" size={14} color={colors.primaryLight} />
            <Text style={styles.libraryMetricChipText}>
              {Math.round(featuredPlanHistoryItem.target_protein_g).toLocaleString('es-ES')} g prote?na
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.libraryDateChip}>
        <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
        <Text style={styles.libraryDateChipText}>
          {formatPlanDate(featuredPlanHistoryItem.created_at)}
        </Text>
      </View>

      <View style={styles.libraryFeaturedSummaryCard}>
        <Text style={styles.libraryFeaturedSummaryLabel}>Resumen</Text>
        <Text style={styles.libraryPreview} numberOfLines={3}>
          {getPlanSummaryPreview(featuredPlanHistoryItem)}
        </Text>
      </View>

      <TouchableOpacity
        onPress={(event) => {
          event.stopPropagation();
          openPlanFromLibrary(featuredPlanHistoryItem);
        }}
        style={[
          styles.libraryFeaturedCta,
          isPlanFocused(featuredPlanHistoryItem) && styles.libraryFeaturedCtaDisabled,
        ]}
        disabled={isPlanFocused(featuredPlanHistoryItem)}
      >
        <Text
          style={[
            styles.libraryFeaturedCtaText,
            isPlanFocused(featuredPlanHistoryItem) && styles.libraryFeaturedCtaTextDisabled,
          ]}
        >
          {isPlanFocused(featuredPlanHistoryItem)
            ? 'Plan en pantalla'
            : featuredPlanHistoryItem.is_active
              ? 'Ver comidas de la semana'
              : 'Abrir plan archivado'}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={isPlanFocused(featuredPlanHistoryItem) ? colors.textMuted : colors.textSecondary}
        />
      </TouchableOpacity>
    </Pressable>
  </View>
) : null}

{secondaryPlanHistory.length > 0 ? (
  <View style={styles.libraryGroup}>
    <View style={styles.libraryGroupHeaderRow}>
      <Text style={styles.libraryGroupTitle}>Otros planes</Text>
      <Text style={styles.libraryGroupCount}>{secondaryPlanHistory.length}</Text>
    </View>
    <Text style={styles.libraryGroupHint}>
      Abr? cualquier versi?n para supervisarla o activarla cuando haga falta.
    </Text>
    <View style={styles.sheetCard}>
      {secondaryPlanHistory.map((item, idx) => {
        const isFocused = isPlanFocused(item);
        return (
          <View key={item.id}>
            <Pressable
              style={({ pressed }) => [
                styles.libraryRow,
                isFocused && styles.libraryRowFocused,
                item.is_active ? styles.libraryRowActivePlan : styles.libraryRowArchivedPlan,
                pressed && { opacity: 0.94 },
              ]}
              onPress={() => openPlanFromLibrary(item)}
            >
              <View style={styles.libraryRowTop}>
                <View style={styles.libraryRowBadgeRow}>
                  <View style={styles.libraryVersionChip}>
                    <Text style={styles.libraryVersionChipText}>v{item.version}</Text>
                  </View>
                  <View
                    style={[
                      styles.libraryStatusChip,
                      item.is_active ? styles.libraryStatusChipActive : styles.libraryStatusChipArchived,
                    ]}
                  >
                    <View
                      style={[
                        styles.libraryStatusDot,
                        item.is_active ? styles.libraryStatusDotActive : styles.libraryStatusDotArchived,
                      ]}
                    />
                    <Text
                      style={[
                        styles.libraryStatusText,
                        item.is_active ? styles.libraryStatusTextActive : styles.libraryStatusTextArchived,
                      ]}
                    >
                      {item.is_active ? 'Activo' : 'Archivado'}
                    </Text>
                  </View>
                  {isFocused ? (
                    <View style={styles.libraryFocusPill}>
                      <Text style={styles.libraryFocusPillText}>Abierto</Text>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={(event) => {
                    event.stopPropagation();
                    confirmDeletePlanFromLibrary(item);
                  }}
                  hitSlop={8}
                  disabled={deletePlanMutation.isPending}
                  style={styles.libraryRowIconBtn}
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={deletePlanMutation.isPending ? colors.textMuted : colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.libraryRowTitle} numberOfLines={1}>
                {item.label?.trim() || 'Plan semanal'}
              </Text>

              <View style={styles.libraryRowMetaWrap}>
                <View style={styles.libraryMetricChip}>
                  <Ionicons name="flame-outline" size={13} color={colors.calories} />
                  <Text style={styles.libraryMetricChipText}>
                    ~{Math.round(item.target_kcal).toLocaleString('es-ES')} kcal
                  </Text>
                </View>
                {item.target_protein_g ? (
                  <View style={styles.libraryMetricChip}>
                    <Ionicons name="barbell-outline" size={13} color={colors.primaryLight} />
                    <Text style={styles.libraryMetricChipText}>
                      {Math.round(item.target_protein_g).toLocaleString('es-ES')} g prote?na
                    </Text>
                  </View>
                ) : null}
                <View style={styles.libraryDateChip}>
                  <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                  <Text style={styles.libraryDateChipText}>{formatPlanDate(item.created_at)}</Text>
                </View>
              </View>

              <Text style={styles.libraryRowPreview} numberOfLines={2}>
                {getPlanSummaryPreview(item)}
              </Text>

              <View style={styles.libraryRowFooter}>
                <Text
                  style={[
                    styles.libraryRowFooterText,
                    isFocused && styles.libraryRowFooterTextDisabled,
                  ]}
                >
                  {isFocused ? 'Plan en pantalla' : 'Ver detalle del plan'}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color={isFocused ? colors.textMuted : colors.textSecondary}
                />
              </View>
            </Pressable>
            {idx < secondaryPlanHistory.length - 1 ? <View style={styles.historySeparator} /> : null}
          </View>
        );
      })}
    </View>
  </View>
              ) : featuredPlanHistoryItem ? (
                <Text style={styles.libraryEmptyState}>Todavía no hay más versiones para supervisar.</Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </BottomSheet>

      {/* ── Edit Label Modal ── */}
      <Modal transparent visible={editLabelModalOpen} animationType="fade" onRequestClose={() => setEditLabelModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setEditLabelModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Etiqueta del plan</Text>
            <Text style={styles.modalDesc}>
              Dale un nombre descriptivo a esta versión del plan.
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="Ej: Definición verano, Volumen…"
              placeholderTextColor={colors.textMuted}
              value={editLabelDraft}
              onChangeText={setEditLabelDraft}
              maxLength={60}
              autoFocus
            />
            <View style={actionIntentStyles.rowModal}>
              <Button
                variant="actionCancel"
                title="Cancelar"
                onPress={() => setEditLabelModalOpen(false)}
              />
              <Button
                variant="actionConfirm"
                title={updatePlanMetaMutation.isPending ? 'Guardando…' : 'Guardar'}
                onPress={confirmEditLabel}
                disabled={updatePlanMetaMutation.isPending}
                loading={updatePlanMetaMutation.isPending}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit Notes Modal ── */}
      <Modal transparent visible={editNotesModalOpen} animationType="fade" onRequestClose={() => setEditNotesModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setEditNotesModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mis notas</Text>
            <Text style={styles.modalDesc}>
              Añade notas personales sobre este plan.
            </Text>
            <TextInput
              style={[styles.textInput, styles.textInputMultiline]}
              placeholder="Ej: Funciona bien para días de entreno; ajustar snack…"
              placeholderTextColor={colors.textMuted}
              value={editNotesDraft}
              onChangeText={setEditNotesDraft}
              maxLength={CONTEXT_MAX_LEN}
              multiline
              textAlignVertical="top"
              autoFocus
            />
            <View style={actionIntentStyles.rowModal}>
              <Button
                variant="actionCancel"
                title="Cancelar"
                onPress={() => setEditNotesModalOpen(false)}
              />
              <Button
                variant="actionConfirm"
                title={updatePlanMetaMutation.isPending ? 'Guardando…' : 'Guardar'}
                onPress={confirmEditNotes}
                disabled={updatePlanMetaMutation.isPending}
                loading={updatePlanMetaMutation.isPending}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modals ── */}
      <Modal transparent visible={regenModalOpen} animationType="fade" onRequestClose={() => setRegenModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setRegenModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Regenerar plan</Text>
            <Text style={styles.modalDesc}>
              Añade contexto para afinar el nuevo plan (opcional).
            </Text>
            <TextInput
              style={[styles.textInput, styles.textInputMultiline]}
              placeholder="Ej: más legumbres; desayunos sin lacteos…"
              placeholderTextColor={colors.textMuted}
              value={regenContextDraft}
              onChangeText={setRegenContextDraft}
              maxLength={CONTEXT_MAX_LEN}
              multiline
              textAlignVertical="top"
            />
            <View style={actionIntentStyles.rowModal}>
              <Button
                variant="actionCancel"
                title="Cancelar"
                onPress={() => setRegenModalOpen(false)}
              />
              <Button variant="actionConfirm" title="Generar" onPress={confirmRegenerateFull} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={!!editMealOpen}
        animationType="fade"
        onRequestClose={() => setEditMealOpen(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setEditMealOpen(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar comida</Text>
            <Text style={styles.modalDesc}>Nombre del plato visible en el plan.</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Ej: Merluza al horno con guarnición"
              placeholderTextColor={colors.textMuted}
              value={editMealTitleDraft}
              onChangeText={setEditMealTitleDraft}
              maxLength={200}
            />
            <View style={actionIntentStyles.rowModal}>
              <Button
                variant="actionCancel"
                title="Cancelar"
                onPress={() => setEditMealOpen(null)}
              />
              <Button
                variant="actionConfirm"
                title={updateMealTitleMutation.isPending ? 'Guardando…' : 'Guardar'}
                onPress={confirmEditMealTitle}
                disabled={updateMealTitleMutation.isPending}
                loading={updateMealTitleMutation.isPending}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={!!editFoodOpen}
        animationType="fade"
        onRequestClose={() => setEditFoodOpen(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setEditFoodOpen(null)} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalScrollContent}
          >
            <View style={[styles.modalCard, styles.editFoodCard]}>
              {editFoodOpen ? (
                <>
                  <View style={styles.editFoodHeader}>
                    <FoodPreviewHero
                      variant="diary_food"
                      nameRaw={editFoodOpen.name || 'Alimento'}
                      compact
                      tightLayout
                      overline="Editar alimento"
                      titleElement={
                        <TextInput
                          style={styles.editFoodHeaderTitleInput}
                          placeholder="Alimento"
                          placeholderTextColor={colors.textMuted}
                          value={editFoodOpen.name}
                          onChangeText={(t) => setEditFoodOpen((p) => (p ? { ...p, name: t } : p))}
                          maxLength={200}
                          selectTextOnFocus
                          accessibilityLabel="Editar nombre del alimento"
                        />
                      }
                      subtitleElement={
                        <View style={styles.editFoodHeroQtyRow}>
                          <TextInput
                            style={[styles.editFoodHeroSubtitleInput, styles.editFoodHeroEditableHint]}
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="decimal-pad"
                            value={editFoodOpen.grams}
                            onChangeText={onEditFoodGramsTextChange}
                            selectTextOnFocus
                            accessibilityLabel="Editar cantidad: número"
                          />
                          <UnitPicker
                            value={editFoodOpen.unit}
                            onChange={onEditFoodUnitChange}
                            triggerTextMode="abbr"
                            chevronSize={12}
                            chevronColor={colors.primary}
                            triggerStyle={[styles.editFoodHeroUnitTrigger, styles.editFoodHeroUnitTriggerHighlight]}
                            triggerTextStyle={[styles.editFoodHeroUnitTriggerText, styles.editFoodHeroUnitTriggerTextHighlight]}
                          />
                        </View>
                      }
                    />
                    <TouchableOpacity
                      onPress={() => setEditFoodOpen(null)}
                      hitSlop={10}
                      style={styles.editFoodCloseBtn}
                      accessibilityLabel="Cerrar"
                    >
                      <Ionicons name="close" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.editFoodSummary}>
                    <Text style={styles.editFoodSummaryLabel}>Resumen</Text>
                    
                    <View style={styles.editFoodSummaryRow}>
                      <Surface variant="elevated" style={styles.editFoodSummaryCard} padding="xs">
                        <View style={styles.editFoodSummaryCardInner}>
                          <TextInput
                            style={[styles.editFoodSummaryValue, { color: colors.calories }]}
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="decimal-pad"
                            value={editFoodOpen.kcal}
                            onChangeText={(t) =>
                              setEditFoodOpen((p) =>
                                p ? { ...p, kcal: sanitizeDecimalTextInput(t, 6) } : p,
                              )
                            }
                            maxLength={6}
                          />
                          <Text style={styles.editFoodSummaryCardLabel} numberOfLines={1}>
                            KCAL
                          </Text>
                        </View>
                      </Surface>
                      <Surface variant="elevated" style={styles.editFoodSummaryCard} padding="xs">
                        <View style={styles.editFoodSummaryCardInner}>
                          <View style={styles.editFoodSummaryMacroValueRowCentered}>
                            <TextInput
                              style={[
                                styles.editFoodSummaryValue,
                                styles.editFoodSummaryValueMacroDuo,
                                { color: colors.protein },
                              ]}
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              keyboardType="decimal-pad"
                              value={editFoodOpen.protein_g}
                              onChangeText={(t) =>
                                setEditFoodOpen((p) =>
                                  p ? { ...p, protein_g: sanitizeDecimalTextInput(t, 6) } : p,
                                )
                              }
                              maxLength={6}
                            />
                            <Text
                              style={[styles.editFoodSummaryUnitInline, { color: colors.protein }]}
                            >
                              g
                            </Text>
                          </View>
                          <Text style={styles.editFoodSummaryCardLabel} numberOfLines={1}>
                            PROT
                          </Text>
                        </View>
                      </Surface>
                      <Surface variant="elevated" style={styles.editFoodSummaryCard} padding="xs">
                        <View style={styles.editFoodSummaryCardInner}>
                          <View style={styles.editFoodSummaryMacroValueRowCentered}>
                            <TextInput
                              style={[
                                styles.editFoodSummaryValue,
                                styles.editFoodSummaryValueMacroDuo,
                                { color: colors.carbs },
                              ]}
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              keyboardType="decimal-pad"
                              value={editFoodOpen.carbs_g}
                              onChangeText={(t) =>
                                setEditFoodOpen((p) =>
                                  p ? { ...p, carbs_g: sanitizeDecimalTextInput(t, 6) } : p,
                                )
                              }
                              maxLength={6}
                            />
                            <Text
                              style={[styles.editFoodSummaryUnitInline, { color: colors.carbs }]}
                            >
                              g
                            </Text>
                          </View>
                          <Text style={styles.editFoodSummaryCardLabel} numberOfLines={1}>
                            CARBS
                          </Text>
                        </View>
                      </Surface>
                      <Surface variant="elevated" style={styles.editFoodSummaryCard} padding="xs">
                        <View style={styles.editFoodSummaryCardInner}>
                          <View style={styles.editFoodSummaryMacroValueRowCentered}>
                            <TextInput
                              style={[
                                styles.editFoodSummaryValue,
                                styles.editFoodSummaryValueMacroDuo,
                                { color: colors.fat },
                              ]}
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              keyboardType="decimal-pad"
                              value={editFoodOpen.fat_g}
                              onChangeText={(t) =>
                                setEditFoodOpen((p) =>
                                  p ? { ...p, fat_g: sanitizeDecimalTextInput(t, 6) } : p,
                                )
                              }
                              maxLength={6}
                            />
                            <Text
                              style={[styles.editFoodSummaryUnitInline, { color: colors.fat }]}
                            >
                              g
                            </Text>
                          </View>
                          <Text style={styles.editFoodSummaryCardLabel} numberOfLines={1}>
                            GRASA
                          </Text>
                        </View>
                      </Surface>
                    </View>
                    <MacroEnergySplitBar
                      proteinG={parseFloat(editFoodOpen.protein_g.replace(',', '.')) || 0}
                      carbsG={parseFloat(editFoodOpen.carbs_g.replace(',', '.')) || 0}
                      fatG={parseFloat(editFoodOpen.fat_g.replace(',', '.')) || 0}
                      showLegend
                      compact
                    />
                  </View>

                  <View style={[actionIntentStyles.row, styles.editFoodFooter]}>
                    <Button
                      variant="actionCancel"
                      title="Cancelar"
                      onPress={() => setEditFoodOpen(null)}
                    />
                    <Button
                      variant="actionConfirm"
                      title={updateFoodMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
                      onPress={confirmEditFood}
                      disabled={updateFoodMutation.isPending}
                      loading={updateFoodMutation.isPending}
                    />
                  </View>
                </>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={!!addFoodOpen}
        animationType="fade"
        onRequestClose={closeAddFood}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeAddFood} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalScrollContent}
          >
            <View style={[styles.modalCard, styles.editFoodCard]}>
              {addFoodOpen ? (
                <>
                  <View style={styles.editFoodHeader}>
                    <FoodPreviewHero
                      variant="diary_food"
                      nameRaw={addFoodOpen.name || 'Nuevo alimento'}
                      compact
                      tightLayout
                      overline={`Añadir a «${addFoodOpen.mealTitle}»`}
                      titleElement={
                        <TextInput
                          style={styles.editFoodHeaderTitleInput}
                          placeholder="Nuevo alimento"
                          placeholderTextColor={colors.textMuted}
                          value={addFoodOpen.name}
                          onChangeText={(t) => setAddFoodOpen((p) => (p ? { ...p, name: t } : p))}
                          maxLength={200}
                          selectTextOnFocus
                          accessibilityLabel="Editar nombre del alimento"
                        />
                      }
                      subtitleElement={
                        <View style={styles.editFoodHeroQtyRow}>
                          <TextInput
                            style={[styles.editFoodHeroSubtitleInput, styles.editFoodHeroEditableHint]}
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="decimal-pad"
                            value={addFoodOpen.grams}
                            onChangeText={(t) =>
                              setAddFoodOpen((p) =>
                                p ? { ...p, grams: sanitizeDecimalTextInput(t, 10) } : p,
                              )
                            }
                            selectTextOnFocus
                            accessibilityLabel="Editar cantidad: número"
                          />
                          <UnitPicker
                            value={addFoodOpen.unit}
                            triggerTextMode="abbr"
                            chevronSize={12}
                            chevronColor={colors.primary}
                            triggerStyle={[styles.editFoodHeroUnitTrigger, styles.editFoodHeroUnitTriggerHighlight]}
                            triggerTextStyle={[styles.editFoodHeroUnitTriggerText, styles.editFoodHeroUnitTriggerTextHighlight]}
                            onChange={(newUnit) =>
                              setAddFoodOpen((p) => {
                                if (!p) return p;
                                const rawQty = parseFloat(p.grams.replace(',', '.')) || 0;
                                const currentGrams = toGrams(rawQty, p.unit);
                                const converted = fromGrams(currentGrams, newUnit);
                                return {
                                  ...p,
                                  unit: newUnit,
                                  grams: String(Math.round(converted * 100) / 100),
                                };
                              })
                            }
                          />
                        </View>
                      }
                    />
                    <TouchableOpacity
                      onPress={closeAddFood}
                      hitSlop={10}
                      style={styles.editFoodCloseBtn}
                      accessibilityLabel="Cerrar"
                    >
                      <Ionicons name="close" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.editFoodSummary}>
                    <Text style={styles.editFoodSummaryLabel}>Resumen</Text>

                    <View style={styles.editFoodSummaryRow}>
                      <Surface variant="elevated" style={styles.editFoodSummaryCard} padding="xs">
                        <View style={styles.editFoodSummaryCardInner}>
                          <TextInput
                            style={[styles.editFoodSummaryValue, { color: colors.calories }]}
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="decimal-pad"
                            value={addFoodOpen.kcal}
                            onChangeText={(t) =>
                              setAddFoodOpen((p) =>
                                p ? { ...p, kcal: sanitizeDecimalTextInput(t, 6) } : p,
                              )
                            }
                            maxLength={6}
                          />
                          <Text style={styles.editFoodSummaryCardLabel} numberOfLines={1}>
                            KCAL
                          </Text>
                        </View>
                      </Surface>
                      <Surface variant="elevated" style={styles.editFoodSummaryCard} padding="xs">
                        <View style={styles.editFoodSummaryCardInner}>
                          <View style={styles.editFoodSummaryMacroValueRowCentered}>
                            <TextInput
                              style={[
                                styles.editFoodSummaryValue,
                                styles.editFoodSummaryValueMacroDuo,
                                { color: colors.protein },
                              ]}
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              keyboardType="decimal-pad"
                              value={addFoodOpen.protein_g}
                              onChangeText={(t) =>
                                setAddFoodOpen((p) =>
                                  p ? { ...p, protein_g: sanitizeDecimalTextInput(t, 6) } : p,
                                )
                              }
                              maxLength={6}
                            />
                            <Text
                              style={[styles.editFoodSummaryUnitInline, { color: colors.protein }]}
                            >
                              g
                            </Text>
                          </View>
                          <Text style={styles.editFoodSummaryCardLabel} numberOfLines={1}>
                            PROT
                          </Text>
                        </View>
                      </Surface>
                      <Surface variant="elevated" style={styles.editFoodSummaryCard} padding="xs">
                        <View style={styles.editFoodSummaryCardInner}>
                          <View style={styles.editFoodSummaryMacroValueRowCentered}>
                            <TextInput
                              style={[
                                styles.editFoodSummaryValue,
                                styles.editFoodSummaryValueMacroDuo,
                                { color: colors.carbs },
                              ]}
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              keyboardType="decimal-pad"
                              value={addFoodOpen.carbs_g}
                              onChangeText={(t) =>
                                setAddFoodOpen((p) =>
                                  p ? { ...p, carbs_g: sanitizeDecimalTextInput(t, 6) } : p,
                                )
                              }
                              maxLength={6}
                            />
                            <Text
                              style={[styles.editFoodSummaryUnitInline, { color: colors.carbs }]}
                            >
                              g
                            </Text>
                          </View>
                          <Text style={styles.editFoodSummaryCardLabel} numberOfLines={1}>
                            CARBS
                          </Text>
                        </View>
                      </Surface>
                      <Surface variant="elevated" style={styles.editFoodSummaryCard} padding="xs">
                        <View style={styles.editFoodSummaryCardInner}>
                          <View style={styles.editFoodSummaryMacroValueRowCentered}>
                            <TextInput
                              style={[
                                styles.editFoodSummaryValue,
                                styles.editFoodSummaryValueMacroDuo,
                                { color: colors.fat },
                              ]}
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              keyboardType="decimal-pad"
                              value={addFoodOpen.fat_g}
                              onChangeText={(t) =>
                                setAddFoodOpen((p) =>
                                  p ? { ...p, fat_g: sanitizeDecimalTextInput(t, 6) } : p,
                                )
                              }
                              maxLength={6}
                            />
                            <Text
                              style={[styles.editFoodSummaryUnitInline, { color: colors.fat }]}
                            >
                              g
                            </Text>
                          </View>
                          <Text style={styles.editFoodSummaryCardLabel} numberOfLines={1}>
                            GRASA
                          </Text>
                        </View>
                      </Surface>
                    </View>
                    <MacroEnergySplitBar
                      proteinG={parseFloat(addFoodOpen.protein_g.replace(',', '.')) || 0}
                      carbsG={parseFloat(addFoodOpen.carbs_g.replace(',', '.')) || 0}
                      fatG={parseFloat(addFoodOpen.fat_g.replace(',', '.')) || 0}
                      showLegend
                      compact
                    />
                  </View>

                  <View style={[actionIntentStyles.row, styles.editFoodFooter]}>
                    <Button
                      variant="actionCancel"
                      title="Cancelar"
                      onPress={closeAddFood}
                      disabled={addFoodMutation.isPending}
                    />
                    <Button
                      variant="actionConfirm"
                      title={addFoodMutation.isPending ? 'Añadiendo…' : 'Añadir alimento'}
                      onPress={confirmAddFood}
                      disabled={addFoodMutation.isPending}
                      loading={addFoodMutation.isPending}
                      icon={
                        <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                      }
                    />
                  </View>
                </>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={!!substituteFoodModal}
        animationType="fade"
        onRequestClose={closeSubstituteFoodModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeSubstituteFoodModal} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sustituir alimento</Text>
            {substituteFoodModal ? (
              <>
                <Text style={styles.modalDesc}>
                  La IA cambiará «{substituteFoodModal.foodName}» por otra opción compatible.
                </Text>
                <Text style={styles.fieldLabel}>¿Qué prefieres o evitas? (opcional)</Text>
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  placeholder="Ej: sin pescado; algo más saciante…"
                  placeholderTextColor={colors.textMuted}
                  value={substituteReasonDraft}
                  onChangeText={setSubstituteReasonDraft}
                  maxLength={500}
                  multiline
                  textAlignVertical="top"
                />
              </>
            ) : null}
            <View style={actionIntentStyles.rowModal}>
              <Button
                variant="actionCancel"
                title="Cancelar"
                onPress={closeSubstituteFoodModal}
              />
              <Button
                variant="actionConfirm"
                title={substituteFoodMutation.isPending ? 'Sustituyendo…' : 'Sustituir'}
                onPress={confirmSubstituteFood}
                disabled={substituteFoodMutation.isPending}
                loading={substituteFoodMutation.isPending}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={!!regenerateMealModal}
        animationType="fade"
        onRequestClose={closeRegenerateMealModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeRegenerateMealModal} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rehacer comida con IA</Text>
            {regenerateMealModal ? (
              <>
                <Text style={styles.modalDesc}>
                  Se regenerarán todos los alimentos de «{regenerateMealModal.mealTitle}» (
                  {regenerateMealModal.slotLabel}). El resto del día y el plan no cambian.
                </Text>
                <Text style={styles.fieldLabel}>Qué no te gusta o qué quieres (opcional)</Text>
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  placeholder="Ej: menos pasta; sin cerdo; algo más saciante o más rápido…"
                  placeholderTextColor={colors.textMuted}
                  value={regenerateMealNoteDraft}
                  onChangeText={setRegenerateMealNoteDraft}
                  maxLength={500}
                  multiline
                  textAlignVertical="top"
                />
              </>
            ) : null}
            <View style={actionIntentStyles.rowModal}>
              <Button
                variant="actionCancel"
                title="Cancelar"
                onPress={closeRegenerateMealModal}
              />
              <Button
                variant="actionConfirm"
                title={regenerateMealMutation.isPending ? 'Rehaciendo…' : 'Rehacer comida'}
                onPress={confirmRegenerateMeal}
                disabled={regenerateMealMutation.isPending}
                loading={regenerateMealMutation.isPending}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={!!removeFoodModal}
        animationType="fade"
        onRequestClose={closeRemoveFoodModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeRemoveFoodModal} />
          <View style={styles.modalCard}>
            {removeFoodModal?.mode === 'confirm' ? (
              <>
                <Text style={styles.modalTitle}>Quitar alimento</Text>
                <Text style={styles.modalDesc}>
                  ¿Eliminar «{removeFoodModal.foodName}»? El resto del plan no cambia.
                </Text>
                <View style={actionIntentStyles.rowModal}>
                  <Button
                    variant="actionCancel"
                    title="Cancelar"
                    onPress={closeRemoveFoodModal}
                    disabled={removeFoodMutation.isPending}
                  />
                  <Button
                    variant="actionDestructive"
                    title={removeFoodMutation.isPending ? 'Quitando…' : 'Quitar'}
                    onPress={confirmRemoveFoodExecution}
                    disabled={removeFoodMutation.isPending}
                    loading={removeFoodMutation.isPending}
                  />
                </View>
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={!!deletePlanModal}
        animationType="fade"
        onRequestClose={closeDeletePlanModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeDeletePlanModal} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Eliminar plan</Text>
            {deletePlanModal ? (
              <Text style={styles.modalDesc}>
                ¿Borrar v{deletePlanModal.version} ({formatPlanDate(deletePlanModal.created_at)})? No se puede deshacer.
                {deletePlanModal.is_active
                  ? '\n\nEl plan más reciente pasará a ser el activo.'
                  : ''}
              </Text>
            ) : null}
            <View style={actionIntentStyles.rowModal}>
              <Button
                variant="actionCancel"
                title="Cancelar"
                onPress={closeDeletePlanModal}
                disabled={deletePlanMutation.isPending}
              />
              <Button
                variant="actionDestructive"
                title={deletePlanMutation.isPending ? 'Eliminando…' : 'Eliminar'}
                onPress={confirmDeletePlanExecution}
                disabled={deletePlanMutation.isPending}
                loading={deletePlanMutation.isPending}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>

      <Modal
        visible={iaWizardOverlayOpen && !!plan}
        animationType="slide"
        {...(Platform.OS === 'ios' ? { presentationStyle: 'fullScreen' as const } : {})}
        onRequestClose={closeIaWizardOverlay}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.iaWizardRoot}
        >
          <ScrollView
            style={styles.container}
            contentContainerStyle={[
              styles.content,
              {
                paddingTop: Math.max(insets.top, spacing.md) + spacing.sm,
                paddingBottom: bottomPad,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity
              style={styles.backToHubRow}
              onPress={closeIaWizardOverlay}
              accessibilityRole="button"
              accessibilityLabel="Cerrar asistente y volver a gestión de planes"
            >
              <Ionicons name="chevron-back" size={22} color={colors.primaryLight} />
              <Text style={styles.backToHubText}>Gestión de planes</Text>
            </TouchableOpacity>

            <IaPlanWizardLayout
              wizard={wizard}
              setWizard={setWizard}
              togglePref={togglePref}
              onGenerate={handleGenerate}
              generating={generateMutation.isPending}
              heroTitle="Nuevo plan con IA"
              heroSubtitle="Usamos tus objetivos del perfil. Ajusta preferencias y contexto solo para esta nueva versión."
              ctaTitle="Generar plan con IA"
              foodRestrictions={foodRestrictions}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenFocusProvider>
  );
}

const styles = StyleSheet.create({
  /* ── Layout ── */
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX },

  backToHubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
  },
  backToHubText: {
    ...typography.captionBold,
    color: colors.primaryLight,
    fontSize: 15,
  },

  iaWizardRoot: { flex: 1, backgroundColor: colors.background },

  /* ── Wizard (no-plan) ── */
  heroTitle: { ...typography.h1, color: colors.text, letterSpacing: -0.4 },
  heroSub: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.xxl,
  },

  iaWizardHeroCard: {
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
    overflow: 'hidden',
    ...elevation.card,
  },
  iaWizardHeroInner: {
    paddingHorizontal: spacing.lg + 2,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg + 4,
  },
  iaWizardBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
    marginBottom: spacing.md,
  },
  iaWizardBadgeText: {
    ...typography.captionBold,
    color: colors.primaryLight,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  iaWizardHeroTitle: {
    ...typography.h1,
    color: colors.text,
    letterSpacing: -0.45,
    marginBottom: spacing.xs,
  },
  iaWizardHeroSub: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 22,
  },
  iaWizardFormCard: {
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md + 2,
    paddingBottom: spacing.lg + 2,
    ...elevation.soft,
  },
  iaWizardSection: {
    paddingVertical: spacing.md,
  },
  iaWizardSectionFlushTop: {
    paddingTop: spacing.sm,
  },
  iaWizardDivider: {
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.border,
    opacity: 0.9,
  },
  iaWizardFieldLabel: {
    ...typography.sectionTitle,
    fontSize: 16,
    color: colors.text,
    letterSpacing: -0.28,
    marginBottom: 4,
  },
  iaWizardFieldHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  iaWizardMealsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iaWizardMealChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  iaWizardMealChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryLight,
    borderWidth: 1,
  },
  iaWizardMealChipText: {
    ...typography.metricSm,
    color: colors.textSecondary,
  },
  iaWizardMealChipTextActive: {
    color: colors.primaryLight,
  },
  iaWizardChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iaWizardOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iaWizardOptionCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 130,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 78,
  },
  iaWizardOptionCardActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryLight,
    borderWidth: 1,
  },
  iaWizardOptionTitle: {
    ...typography.captionBold,
    color: colors.text,
    marginBottom: 4,
  },
  iaWizardOptionTitleActive: {
    color: colors.text,
  },
  iaWizardOptionHint: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 17,
  },
  iaWizardOptionHintActive: {
    color: colors.textSecondary,
  },
  iaWizardInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iaWizardInputMultiline: { minHeight: 96, paddingTop: spacing.md },
  iaWizardCta: { marginTop: spacing.md },

  textInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textInputMultiline: { minHeight: 80, paddingTop: spacing.md },

  /* ── Header (with plan) ── */
  weekHeaderCard: {
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    overflow: 'hidden',
    ...elevation.card,
  },
  weekHeaderAccentStrip: {
    height: 3,
    width: '100%',
    opacity: 0.95,
  },
  weekHeaderInner: {
    paddingHorizontal: spacing.lg + 2,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md + 2,
  },
  weekHeaderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md + 2,
  },
  weekHeaderLeft: { flex: 1, minWidth: 0 },
  weekTitleMain: {
    ...typography.sectionTitle,
    color: colors.text,
    letterSpacing: -0.28,
    marginBottom: spacing.xs,
  },
  weekMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm + 2,
  },
  versionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
  },
  versionBadgeText: {
    ...typography.micro,
    color: colors.textSecondary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.35,
  },
  activePillInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.successMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  activePillTextInline: {
    ...typography.micro,
    color: colors.primaryLight,
    fontWeight: '700',
    letterSpacing: 0.25,
  },
  weekDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  weekDateIconWrap: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRange: {
    ...typography.bodyBold,
    flex: 1,
    color: colors.textSecondary,
    letterSpacing: -0.15,
    lineHeight: 22,
  },
  dayStripSection: {
    paddingTop: spacing.md + 4,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(16, 185, 129, 0.12)',
  },
  dayStripScroll: {
    marginHorizontal: -(spacing.lg + 2),
  },
  dayStripScrollContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: spacing.lg + 2,
    gap: DAY_STRIP_CHIP_GAP,
    paddingVertical: 2,
  },
  compraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: spacing.md + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primaryBorderStrong,
    ...platformBoxShadow(
      '0 4px 14px rgba(16, 185, 129, 0.45)',
      {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      4,
    ),
  },
  compraBtnLabel: {
    ...typography.captionBold,
    color: colors.white,
    letterSpacing: 0.15,
  },

  /* ── Plan versions ── */
  planListSection: { marginBottom: spacing.md },
  planListTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  planListTitleCol: { flex: 1, minWidth: 0 },
  planListTitle: {
    ...typography.label,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 2,
  },
  planListSubtitle: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 16,
    maxWidth: 220,
  },
  planListHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  planListRetry: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  planListRetryText: {
    ...typography.captionBold,
    color: colors.primaryLight,
  },
  planListRow: { flexDirection: 'row', gap: spacing.md, paddingRight: spacing.md, paddingBottom: 2 },
  planCard: {
    position: 'relative',
    minWidth: 152,
    maxWidth: 188,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.md + 2,
    paddingTop: spacing.md + 6,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  planCardAccent: {
    position: 'absolute',
    left: 0,
    top: spacing.sm,
    bottom: spacing.sm,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.primaryLight,
  },
  planCardBody: { flex: 1, minWidth: 0, paddingRight: spacing.lg + 2 },
  planCardDelete: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  planCardDeletePressed: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
  },
  planCardSelected: {
    borderColor: colors.primaryBorder,
    borderWidth: 1,
    backgroundColor: colors.surfaceElevated,
    ...elevation.card,
  },
  planCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm + 2,
  },
  planCardVersion: {
    ...typography.captionBold,
    color: colors.textSecondary,
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  activePillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primaryLight,
  },
  activePillText: {
    ...typography.micro,
    color: colors.primaryLight,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  planCardKcalLine: {
    marginBottom: spacing.sm,
  },
  planCardKcalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  planCardKcalUnit: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
  },
  planCardDate: { ...typography.small, color: colors.textTertiary, fontWeight: '500' },

  /* ── Inactive banner ── */
  inactiveBanner: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: hairlineWidth,
    borderColor: colors.warningMuted,
  },
  inactiveBannerText: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  inactiveBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  inactiveLink: { ...typography.captionBold, color: colors.primaryLight },

  /* ── Day summary ── */
  summaryCard: {
    marginBottom: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: spacing.lg + 2,
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
    ...elevation.soft,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  summaryCardLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  deltaBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  deltaBadgeOver: { backgroundColor: colors.errorMuted },
  deltaBadgeUnder: { backgroundColor: colors.successMuted },
  deltaBadgeText: { ...typography.captionBold, fontSize: 12, fontVariant: ['tabular-nums'] },
  summaryKcalLine: { marginBottom: spacing.sm },
  summaryKcalCurrent: { ...typography.metricLg, color: colors.text, fontVariant: ['tabular-nums'] },
  summaryKcalSlash: { ...typography.body, color: colors.textTertiary },
  kcalBarTrack: {
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  kcalBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
  },
  summaryMacroRow: { flexDirection: 'row', gap: spacing.md },
  summaryMacroCol: { flex: 1, minWidth: 0 },
  summaryMacroLabel: { ...typography.micro, fontWeight: '700', marginBottom: 3, letterSpacing: 0.5 },
  summaryMacroValues: {
    ...typography.captionBold,
    color: colors.text,
    marginBottom: 6,
    fontVariant: ['tabular-nums'],
  },
  summaryMacroTarget: { color: colors.textTertiary, fontWeight: '400' },
  summaryMacroBarTrack: {
    height: 3,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  summaryMacroBarFill: { height: '100%', borderRadius: borderRadius.full },
  summaryEmpty: { ...typography.caption, color: colors.textMuted },

  /* ── Header actions row ── */
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
    alignSelf: 'flex-start',
    paddingTop: 2,
  },
  overflowBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Días: franja horizontal (chips con fecha legible, sin apretar 7 columnas) ── */
  dayStripChip: {
    minWidth: DAY_STRIP_CHIP_MIN_W,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayStripChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryBorderStrong,
    borderWidth: 2,
    ...elevation.soft,
  },
  dayStripChipNum: {
    ...typography.bodyBold,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    color: colors.text,
    letterSpacing: -0.35,
    marginBottom: 2,
  },
  dayStripChipNumActive: { color: colors.text },
  dayStripChipWk: {
    ...typography.micro,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.15,
    maxWidth: 80,
  },
  dayStripChipWkActive: { color: colors.primaryLight },

  /* ── Meal cards ── */
  mealCard: {
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
    ...elevation.card,
  },
  mealCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  mealCardHeaderMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  mealCardHeaderPressable: { borderRadius: borderRadius.lg },
  mealCardHeaderPressablePressed: { opacity: 0.85 },
  mealCardHeaderText: { flex: 1, minWidth: 0 },
  mealCardType: { ...typography.bodyBold, color: colors.text, flex: 1, minWidth: 0 },
  mealCardMacroInline: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 6 },
  mealCardMacroChip: {
    ...typography.micro,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  mealCardAddTodayBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  mealCardAddTodayBtnDisabled: {
    opacity: 0.55,
  },

  /* ── Food rows ── */
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  foodRowMain: { flex: 1, minWidth: 0, marginRight: spacing.sm },
  foodName: { ...typography.body, color: colors.text },
  foodMeta: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  foodActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  foodActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodActionAI: {
    backgroundColor: colors.primaryGlow,
  },
  foodActionDanger: {
    backgroundColor: colors.errorMuted,
  },
  noMealIdHint: {
    ...typography.small,
    color: colors.textMuted,
    maxWidth: 90,
    textAlign: 'right',
  },
  mealCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  mealFooterBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.xs },
  mealFooterBtnText: { ...typography.captionBold, color: colors.primaryLight },
  footerBtnDisabled: { opacity: 0.45 },

  /* ── Management BottomSheet ── */
  sheetContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sheetTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: 2,
  },
  sheetSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  sheetSection: {
    marginBottom: spacing.lg,
  },
  sheetSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetSectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  sheetCard: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sheetInfoRow: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  sheetInfoCol: {
    flex: 1,
    alignItems: 'center',
  },
  sheetInfoValue: {
    ...typography.bodyBold,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    fontSize: 15,
  },
  sheetInfoUnit: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: 1,
  },
  sheetRationale: {
    padding: spacing.md,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  sheetRationaleLabel: {
    ...typography.micro,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  sheetRationaleText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 19,
  },

sheetHistoryHint: {
  ...typography.caption,
  color: colors.textMuted,
  padding: spacing.md,
},
librarySectionHeaderMain: {
  flex: 1,
  minWidth: 0,
  paddingRight: spacing.md,
},
librarySectionTitle: {
  ...typography.bodyBold,
  color: colors.text,
  marginBottom: 4,
},
librarySectionSubtitle: {
  ...typography.caption,
  color: colors.textMuted,
  lineHeight: 18,
  maxWidth: 260,
},
libraryCountBadge: {
  minWidth: 78,
  paddingHorizontal: spacing.sm + 2,
  paddingVertical: spacing.xs + 2,
  borderRadius: borderRadius.full,
  backgroundColor: colors.surfaceMuted,
  borderWidth: hairlineWidth,
  borderColor: colors.border,
  alignItems: 'center',
  justifyContent: 'center',
},
libraryCountBadgeText: {
  ...typography.micro,
  color: colors.textSecondary,
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
},
libraryGroup: {
  marginTop: spacing.md,
},
libraryGroupHeader: {
  marginBottom: spacing.sm,
},
libraryGroupHeaderRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 4,
},
libraryGroupTitle: {
  ...typography.captionBold,
  color: colors.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: 0.7,
},
libraryGroupHint: {
  ...typography.caption,
  color: colors.textMuted,
  lineHeight: 18,
},
libraryGroupCount: {
  ...typography.captionBold,
  color: colors.textMuted,
  fontVariant: ['tabular-nums'],
},
libraryFeaturedCard: {
  borderRadius: borderRadius.xl,
  backgroundColor: colors.surfaceElevated,
  borderWidth: 1,
  borderColor: colors.borderStrong,
  padding: spacing.lg,
  overflow: 'hidden',
},
libraryFeaturedCardFocused: {
  ...elevation.card,
},
libraryFeaturedCardActive: {
  borderColor: colors.primaryBorderStrong,
  ...platformBoxShadow(
    '0 12px 28px rgba(16, 185, 129, 0.14)',
    {
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.16,
      shadowRadius: 18,
    },
    6,
  ),
},
libraryFeaturedCardArchived: {
  borderColor: colors.border,
},
libraryFeaturedTopRow: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: spacing.sm,
  marginBottom: spacing.md,
},
libraryFeaturedBadgeRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.xs,
  flexWrap: 'wrap',
  flex: 1,
  minWidth: 0,
},
libraryVersionChip: {
  paddingHorizontal: spacing.sm,
  paddingVertical: 5,
  borderRadius: borderRadius.full,
  backgroundColor: colors.surfaceMuted,
  borderWidth: hairlineWidth,
  borderColor: colors.border,
},
libraryVersionChipText: {
  ...typography.micro,
  color: colors.textSecondary,
  fontWeight: '700',
  fontVariant: ['tabular-nums'],
  letterSpacing: 0.3,
},
libraryStatusChip: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingHorizontal: spacing.sm,
  paddingVertical: 5,
  borderRadius: borderRadius.full,
  borderWidth: hairlineWidth,
},
libraryStatusChipActive: {
  backgroundColor: colors.successMuted,
  borderColor: colors.primaryBorder,
},
libraryStatusChipArchived: {
  backgroundColor: colors.surfaceMuted,
  borderColor: colors.border,
},
libraryStatusDot: {
  width: 6,
  height: 6,
  borderRadius: 3,
},
libraryStatusDotActive: {
  backgroundColor: colors.primaryLight,
},
libraryStatusDotArchived: {
  backgroundColor: colors.textMuted,
},
libraryStatusText: {
  ...typography.micro,
  fontWeight: '700',
  letterSpacing: 0.25,
},
libraryStatusTextActive: {
  color: colors.primaryLight,
},
libraryStatusTextArchived: {
  color: colors.textSecondary,
},
libraryFeaturedUtilityBtn: {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: colors.surfaceMuted,
  borderWidth: hairlineWidth,
  borderColor: colors.border,
  alignItems: 'center',
  justifyContent: 'center',
},
libraryFeaturedTitle: {
  ...typography.sectionTitle,
  color: colors.text,
  letterSpacing: -0.3,
  marginBottom: spacing.md,
},
libraryFeaturedMetricRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: spacing.sm,
  marginBottom: spacing.sm,
},
libraryMetricChip: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingHorizontal: spacing.sm + 2,
  paddingVertical: spacing.xs + 3,
  borderRadius: borderRadius.full,
  backgroundColor: colors.surfaceMuted,
  borderWidth: hairlineWidth,
  borderColor: colors.border,
},
libraryMetricChipText: {
  ...typography.micro,
  color: colors.textSecondary,
  fontWeight: '700',
  letterSpacing: 0.2,
},
libraryDateChip: {
  alignSelf: 'flex-start',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingHorizontal: spacing.sm + 2,
  paddingVertical: spacing.xs + 3,
  borderRadius: borderRadius.full,
  backgroundColor: colors.surface,
  borderWidth: hairlineWidth,
  borderColor: colors.border,
  marginBottom: 0,
},
libraryDateChipText: {
  ...typography.micro,
  color: colors.textSecondary,
  fontWeight: '700',
  letterSpacing: 0.2,
},
libraryFeaturedSummaryCard: {
  borderRadius: borderRadius.lg,
  backgroundColor: colors.surface,
  borderWidth: hairlineWidth,
  borderColor: colors.border,
  paddingHorizontal: spacing.md,
  paddingTop: spacing.xs,
  paddingBottom: spacing.md + 2,
  marginBottom: spacing.md,
},
libraryFeaturedSummaryLabel: {
  ...typography.micro,
  color: colors.textMuted,
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  marginBottom: 2,
},
libraryPreview: {
  ...typography.caption,
  color: colors.textSecondary,
  lineHeight: 20,
},
libraryFeaturedCta: {
  minHeight: 46,
  borderTopWidth: hairlineWidth,
  borderTopColor: colors.border,
  paddingTop: spacing.md,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing.sm,
},
libraryFeaturedCtaDisabled: {
  opacity: 0.6,
},
libraryFeaturedCtaText: {
  ...typography.bodyBold,
  color: colors.textSecondary,
  flex: 1,
  minWidth: 0,
},
libraryFeaturedCtaTextDisabled: {
  color: colors.textMuted,
},
libraryRow: {
  paddingVertical: spacing.md + 2,
  paddingHorizontal: spacing.md,
  backgroundColor: colors.surface,
},
libraryRowFocused: {
  backgroundColor: colors.surfaceMuted,
},
libraryRowActivePlan: {
  borderLeftWidth: 3,
  borderLeftColor: colors.primaryLight,
},
libraryRowArchivedPlan: {
  borderLeftWidth: 3,
  borderLeftColor: colors.border,
},
libraryRowTop: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: spacing.sm,
  marginBottom: spacing.sm,
},
libraryRowBadgeRow: {
  flexDirection: 'row',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: spacing.xs,
  flex: 1,
  minWidth: 0,
},
libraryRowIconBtn: {
  width: 32,
  height: 32,
  borderRadius: 16,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: colors.surfaceMuted,
  borderWidth: hairlineWidth,
  borderColor: colors.border,
},
libraryRowTitle: {
  ...typography.bodyBold,
  color: colors.text,
  marginBottom: spacing.sm,
},
libraryRowMetaWrap: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: spacing.xs,
  marginBottom: spacing.sm,
},
libraryRowPreview: {
  ...typography.caption,
  color: colors.textMuted,
  lineHeight: 19,
},
libraryRowFooter: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing.sm,
  marginTop: spacing.md,
  paddingTop: spacing.sm,
  borderTopWidth: hairlineWidth,
  borderTopColor: colors.border,
},
libraryRowFooterText: {
  ...typography.captionBold,
  color: colors.textSecondary,
  flex: 1,
  minWidth: 0,
},
libraryRowFooterTextDisabled: {
  color: colors.textMuted,
},
libraryFocusPill: {
  paddingHorizontal: 8,
  paddingVertical: 2,
  borderRadius: borderRadius.full,
  backgroundColor: colors.surfaceMuted,
  borderWidth: hairlineWidth,
  borderColor: colors.border,
},
libraryFocusPillText: {
  ...typography.micro,
  color: colors.textSecondary,
  fontWeight: '700',
  letterSpacing: 0.3,
},
libraryEmptyState: {
  ...typography.caption,
  color: colors.textMuted,
  marginTop: spacing.md,
},

  /* ── History rows (vertical in sheet) ── */
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  historyRowActive: {
    backgroundColor: colors.primaryMuted,
  },
  historyRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  historyAccent: {
    width: 3,
    height: 28,
    borderRadius: 2,
    backgroundColor: colors.primaryLight,
  },
  historyRowMeta: {
    flex: 1,
    minWidth: 0,
  },
  historyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  historyVersion: {
    ...typography.captionBold,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  historyVersionActive: {
    color: colors.primaryLight,
  },
  historyLabel: {
    ...typography.caption,
    color: colors.textMuted,
    maxWidth: 120,
  },
  historyDetail: {
    ...typography.small,
    color: colors.textTertiary,
  },
  historyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: spacing.sm,
  },
  historyActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historySeparator: {
    height: hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },

  /* ── Rationale ── */
  rationaleBlock: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  rationaleLabel: { ...typography.label, color: colors.textMuted, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  rationaleText: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },

  /* ── Modals ── */
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
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xl },
  modalTitle: { ...typography.sectionTitle, color: colors.text, marginBottom: spacing.sm },
  modalDesc: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 },
  fieldLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
    letterSpacing: 0.4,
  },
  editFoodHeroEditableHint: {
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '55',
  },
  editFoodHeroUnitTriggerHighlight: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '10',
  },
  editFoodHeroUnitTriggerTextHighlight: {
    color: colors.primary,
    fontWeight: '700',
  },
  macroFieldGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroFieldCol: {
    flex: 1,
    minWidth: 0,
  },
  editFoodCard: {
    padding: spacing.lg,
  },
  editFoodHeader: {
    position: 'relative',
    width: '100%',
    minHeight: 68,
    marginBottom: spacing.xs,
    paddingRight: 38,
  },
  editFoodHeaderTitleInput: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    minHeight: 28,
    includeFontPadding: false,
  },
  editFoodHeroQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    width: '100%' as unknown as number,
    gap: 4,
  },
  editFoodHeroUnitTrigger: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 0,
    gap: 1,
  },
  editFoodHeroUnitTriggerText: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  editFoodHeroSubtitleInput: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    flex: 1,
    minWidth: 56,
    includeFontPadding: false,
  },
  editFoodCloseBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  editFoodHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontStyle: 'italic',
  },
  editFoodMacroGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  editFoodMacroCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editFoodMacroKcal: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryMuted,
  },
  editFoodMacroProtein: {
    borderColor: 'rgba(167, 139, 250, 0.35)',
    backgroundColor: colors.proteinMuted,
  },
  editFoodMacroCarbs: {
    borderColor: 'rgba(59, 130, 246, 0.35)',
    backgroundColor: colors.carbsMuted,
  },
  editFoodMacroFat: {
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: colors.fatMuted,
  },
  editFoodMacroLabel: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  editFoodMacroInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  editFoodMacroInput: {
    flex: 1,
    minWidth: 0,
    ...typography.bodyBold,
    fontSize: 18,
    color: colors.text,
    paddingVertical: 0,
  },
  editFoodMacroUnit: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  editFoodSummary: {
    alignSelf: 'stretch',
    width: '100%',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  editFoodSummaryLabel: {
    ...typography.captionBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  editFoodSummaryCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16,
  },
  editFoodSummaryRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  editFoodSummaryCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    alignSelf: 'stretch',
  },
  editFoodSummaryCardInner: {
    flex: 1,
    minWidth: 0,
    width: '100%' as unknown as number,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** PROT/CARBS/GRASA: fila [número][g] centrada en la tarjeta. */
  editFoodSummaryMacroValueRowCentered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%' as unknown as number,
    minHeight: 20,
    marginBottom: 2,
    gap: 2,
  },
  editFoodSummaryValueMacroDuo: {
    width: 52,
    minWidth: 40,
    maxWidth: 56,
    textAlign: 'center' as const,
    marginBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    alignSelf: 'center' as const,
  },
  editFoodSummaryUnitInline: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    includeFontPadding: false,
    pointerEvents: 'none' as const,
  },
  editFoodSummaryValue: {
    ...typography.bodyBold,
    fontSize: 14,
    lineHeight: 18,
    minHeight: 20,
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 2,
    margin: 0,
    marginBottom: 2,
    minWidth: 0,
    alignSelf: 'stretch' as const,
    width: '100%' as unknown as number,
    maxWidth: '100%' as unknown as number,
    includeFontPadding: false,
  },
  editFoodSummaryCardLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  editFoodFooter: { marginTop: spacing.lg },
  iaWizardRestrictionPill: {
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  iaWizardRestrictionText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  iaWizardEditLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  iaWizardEditLinkText: {
    ...typography.caption,
    color: colors.primaryLight,
  },
});
