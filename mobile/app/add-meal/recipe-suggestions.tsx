import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Pressable,
  Modal,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { ApiError, api, PLAN_API_TIMEOUT_MS } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { Button, Input, NutriaIdle, Surface, TideGradientFrame } from '../../src/components';
import {
  colors,
  spacing,
  typography,
  screenPaddingX,
  borderRadius,
  primaryCtaPressed,
  elevation,
} from '../../src/theme';
import { roundMacroG } from '../../src/lib/mealItemMath';
import type {
  CheckRestrictionsResponse,
  FoodRestrictionConflict,
  FoodRestrictions,
  Recipe,
  RecipeRecommendation,
  RecipeRecommendationMealType,
  RecipeRecommendationsRequest,
  RecipeRecommendationsResponse,
} from '../../src/types';

type RestrictionListItem = { term: string; severity: 'high' | 'medium'; reason: string };

type MealOption = {
  id: RecipeRecommendationMealType | 'any';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const MEAL_TYPE_OPTIONS: MealOption[] = [
  { id: 'any', label: 'Cualquiera', icon: 'apps-outline' },
  { id: 'breakfast', label: 'Desayuno', icon: 'sunny-outline' },
  { id: 'lunch', label: 'Almuerzo', icon: 'restaurant-outline' },
  { id: 'dinner', label: 'Cena', icon: 'moon-outline' },
  { id: 'snack', label: 'Snack', icon: 'cafe-outline' },
];

type TimeOption = { id: 'any' | number; label: string; icon: keyof typeof Ionicons.glyphMap };

const TIME_OPTIONS: TimeOption[] = [
  { id: 'any', label: 'Sin límite', icon: 'infinite-outline' },
  { id: 15, label: '15 min', icon: 'flash-outline' },
  { id: 30, label: '30 min', icon: 'time-outline' },
  { id: 45, label: '45 min', icon: 'hourglass-outline' },
];

const RECIPE_CARD_OPEN_MS = 260;
const RECIPE_CARD_CLOSE_MS = 180;

type TagOption = { label: string; icon: keyof typeof Ionicons.glyphMap };

const TAG_OPTIONS: TagOption[] = [
  { label: 'alto en proteína', icon: 'barbell-outline' },
  { label: 'bajo en calorías', icon: 'leaf-outline' },
  { label: 'bajo en carbohidratos', icon: 'analytics-outline' },
  { label: 'rica en fibra', icon: 'heart-outline' },
  { label: 'vegetariana', icon: 'flower-outline' },
  { label: 'vegana', icon: 'earth-outline' },
  { label: 'mediterránea', icon: 'fish-outline' },
  { label: 'sin gluten', icon: 'shield-checkmark-outline' },
  { label: 'sin lactosa', icon: 'medkit-outline' },
  { label: 'rápida', icon: 'rocket-outline' },
  { label: 'batch cooking', icon: 'archive-outline' },
];

function difficultyColor(difficulty?: string): string {
  if (!difficulty) return colors.textSecondary;
  const d = difficulty.toLowerCase();
  if (d.includes('fácil') || d.includes('facil')) return colors.success;
  if (d.includes('media')) return colors.warning;
  if (d.includes('avanzada') || d.includes('difícil')) return colors.error;
  return colors.textSecondary;
}

type RecipeRecommendationErrorCopy = {
  title: string;
  message: string;
  tips?: string[];
  icon: keyof typeof Ionicons.glyphMap;
};

function getRecipeRecommendationErrorCopy(error: unknown): RecipeRecommendationErrorCopy {
  const fallbackMessage =
    error instanceof Error ? error.message : 'No se pudieron generar recomendaciones.';
  const isUnprocessable =
    (error instanceof ApiError && error.status === 422) ||
    fallbackMessage.includes('No se generaron recomendaciones') ||
    fallbackMessage.includes('Error 422');

  if (isUnprocessable) {
    return {
      title: 'No encontré recetas con esos filtros',
      message:
        fallbackMessage && fallbackMessage !== 'Error 422'
          ? fallbackMessage
          : 'La combinación actual es demasiado restrictiva para crear recetas válidas.',
      tips: [
        'Quita alguna etiqueta restrictiva o combina menos filtros.',
        'Cambia el tiempo a “Sin límite” o prueba con 30/45 min.',
        'Simplifica tu petición y evita restricciones contradictorias.',
      ],
      icon: 'options-outline',
    };
  }

  return {
    title: 'Sugerencias no disponibles',
    message: fallbackMessage,
    icon: 'cloud-offline-outline',
  };
}

function formatRecipeRecommendationAlertMessage(copy: RecipeRecommendationErrorCopy): string {
  if (!copy.tips?.length) return copy.message;
  return `${copy.message}\n\nQué puedes hacer:\n${copy.tips.map((tip) => `• ${tip}`).join('\n')}`;
}

function restrictionTypePillLabel(t: FoodRestrictionConflict['restriction_type']): string {
  switch (t) {
    case 'allergy':
      return 'Alergia';
    case 'intolerance':
      return 'Intolerancia';
    case 'forbidden':
      return 'Prohibido';
    case 'disliked':
      return 'No deseado';
    default:
      return 'Restricción';
  }
}

function conflictAccentColor(t: FoodRestrictionConflict['restriction_type']): string {
  if (t === 'allergy' || t === 'intolerance') return colors.error;
  if (t === 'forbidden') return colors.warning;
  return colors.textMuted;
}

function RestrictionConfirmModal({
  visible,
  title,
  conflicts,
  onDismiss,
  onContinue,
}: {
  visible: boolean;
  title: string;
  conflicts: FoodRestrictionConflict[];
  onDismiss: () => void;
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const hasUrgent = conflicts.some(
    (c) => c.restriction_type === 'allergy' || c.restriction_type === 'intolerance',
  );
  /** Cap scroll para que cabecera + pie + botones no queden fuera de pantalla (especialmente en web). */
  const restrictionScrollMaxHeight = Math.max(140, Math.min(300, windowHeight * 0.34));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View
        style={[
          st.restrictionModalWrap,
          {
            paddingTop: Math.max(insets.top, spacing.md),
            paddingBottom: Math.max(insets.bottom, spacing.md),
          },
        ]}
      >
        <Pressable style={st.restrictionModalBackdrop} onPress={onDismiss} accessibilityLabel="Cerrar" />
        <View
          style={[
            st.restrictionModalCard,
            { maxHeight: Math.min(windowHeight * 0.88, 620) },
          ]}
        >
          <View
            style={[
              st.restrictionBanner,
              { backgroundColor: hasUrgent ? colors.error : colors.warning },
            ]}
          >
            <View style={st.restrictionBannerIconWrap}>
              <Ionicons
                name={hasUrgent ? 'medkit' : 'alert-circle'}
                size={26}
                color={colors.white}
              />
            </View>
            <Text style={st.restrictionBannerLabel}>
              {hasUrgent ? 'AVISO MÉDICO' : 'AVISO NUTRICIONAL'}
            </Text>
            <Text style={st.restrictionBannerTitle}>{title}</Text>
          </View>

          <View style={st.restrictionModalCardInner}>
            <Text style={st.restrictionModalLead}>
              Detectamos {conflicts.length} {conflicts.length === 1 ? 'conflicto' : 'conflictos'} con
              tus restricciones guardadas.
            </Text>

            <ScrollView
              style={[st.restrictionModalScroll, { maxHeight: restrictionScrollMaxHeight }]}
              contentContainerStyle={st.restrictionModalScrollContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {conflicts.map((c, idx) => {
                const accent = conflictAccentColor(c.restriction_type);
                const alts = c.alternatives?.filter(Boolean) ?? [];
                const sameTerm =
                  c.mentioned_food.trim().toLowerCase() ===
                  c.matched_restriction.trim().toLowerCase();
                return (
                  <View
                    key={`${c.mentioned_food}-${c.matched_restriction}-${idx}`}
                    style={[st.restrictionRow, { borderLeftColor: accent }]}
                  >
                    <View style={st.restrictionRowHeader}>
                      <Text style={[st.restrictionRowTypeText, { color: accent }]}>
                        {restrictionTypePillLabel(c.restriction_type).toUpperCase()}
                      </Text>
                      <View style={[st.restrictionRowDot, { backgroundColor: accent }]} />
                      <Text style={st.restrictionRowMention} selectable>
                        {c.mentioned_food}
                      </Text>
                    </View>

                    {!sameTerm ? (
                      <Text style={st.restrictionRowMatch} selectable>
                        Coincide con tu restricción: <Text style={st.restrictionRowMatchTerm}>{c.matched_restriction}</Text>
                      </Text>
                    ) : null}

                    <Text style={st.restrictionRowExplanation}>{c.explanation}</Text>

                    {alts.length > 0 ? (
                      <Text style={st.restrictionRowAlts} numberOfLines={2}>
                        <Ionicons name="leaf" size={12} color={colors.primary} />
                        <Text style={st.restrictionRowAltsLabel}>{'  Prueba: '}</Text>
                        <Text style={st.restrictionRowAltsList}>{alts.join('  ·  ')}</Text>
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>

            <View style={st.restrictionModalDivider} />

            <Pressable
              onPress={onDismiss}
              style={({ pressed }) => [
                st.restrictionModalCta,
                pressed && { opacity: 0.92 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Reformular petición"
            >
              <Ionicons name="create-outline" size={20} color={colors.white} style={{ marginRight: 8 }} />
              <Text style={st.restrictionModalCtaText}>Reformular petición</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                onDismiss();
                onContinue();
              }}
              style={({ pressed }) => [
                st.restrictionModalLink,
                pressed && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Continuar y generar recetas igualmente"
            >
              <Text style={st.restrictionModalLinkText}>Continuar igualmente</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function RecipeSuggestionsScreen() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { meal_type: mealTypeParam } = useLocalSearchParams<{
    meal_type?: string;
    date?: string;
  }>();

  const initialMealType: RecipeRecommendationMealType | 'any' = useMemo(() => {
    if (
      mealTypeParam === 'breakfast' ||
      mealTypeParam === 'lunch' ||
      mealTypeParam === 'dinner' ||
      mealTypeParam === 'snack'
    ) {
      return mealTypeParam;
    }
    return 'any';
  }, [mealTypeParam]);

  const [mealTypeFilter, setMealTypeFilter] = useState<RecipeRecommendationMealType | 'any'>(
    initialMealType,
  );
  const [timeFilter, setTimeFilter] = useState<'any' | number>('any');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [additionalRequest, setAdditionalRequest] = useState('');
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [savedNames, setSavedNames] = useState<Record<string, boolean>>({});
  const [restrictionDialog, setRestrictionDialog] = useState<{
    title: string;
    conflicts: FoodRestrictionConflict[];
  } | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  /** Restricciones del usuario para detectar conflictos en la petición libre. */
  const {
    data: restrictionsData,
    isLoading: restrictionsLoading,
    isError: restrictionsErrored,
  } = useQuery({
    queryKey: ['food-restrictions'],
    queryFn: () => api.get<FoodRestrictions>('/api/v1/me/food-restrictions'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const restrictedTerms = useMemo((): RestrictionListItem[] => {
    if (!restrictionsData) return [];
    const list: RestrictionListItem[] = [];
    (restrictionsData.allergies ?? []).forEach((t) =>
      list.push({ term: t, severity: 'high', reason: 'Alergia' }),
    );
    (restrictionsData.intolerances ?? []).forEach((t) =>
      list.push({ term: t, severity: 'high', reason: 'Intolerancia' }),
    );
    (restrictionsData.forbidden_foods ?? []).forEach((t) =>
      list.push({ term: t, severity: 'medium', reason: 'Prohibido' }),
    );
    return list;
  }, [restrictionsData]);

  const hasHardRestrictions = restrictedTerms.length > 0;

  const generateMutation = useMutation({
    mutationFn: (body: RecipeRecommendationsRequest) =>
      api.post('/api/v1/meals/recipes/recommendations', body, {
        timeoutMs: PLAN_API_TIMEOUT_MS,
      }) as Promise<RecipeRecommendationsResponse>,
    onError: (e: unknown) => {
      const copy = getRecipeRecommendationErrorCopy(e);
      Alert.alert(copy.title, formatRecipeRecommendationAlertMessage(copy));
    },
  });

  const checkRestrictionsMutation = useMutation({
    mutationFn: (text: string) =>
      api.post<CheckRestrictionsResponse>('/api/v1/meals/recipes/check-restrictions', {
        text,
      }),
  });

  const saveRecipeMutation = useMutation({
    mutationFn: (recipe: RecipeRecommendation) =>
      api.post('/api/v1/meals/recipes', {
        name: recipe.name,
        description: recipe.description,
        servings: recipe.servings,
        icon: recipe.icon,
        items: recipe.items.map((it) => ({
          custom_name: it.name,
          grams: it.grams,
          kcal: it.kcal,
          protein_g: it.protein_g,
          carbs_g: it.carbs_g,
          fat_g: it.fat_g,
        })),
      }) as Promise<Recipe>,
    onSuccess: (_data, recipe) => {
      setSavedNames((prev) => ({ ...prev, [recipe.name]: true }));
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
    onError: (e: unknown) =>
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'No se pudo guardar la receta.')),
  });

  const recommendations = generateMutation.data?.recommendations ?? [];

  /** Lleva el scroll al bloque de recetas al aparecer (tras generar; el scroll al inicio de handleGenerate se corrige aquí al medir). */
  const scrollToGeneratedRecipesSection = useCallback(
    (e: LayoutChangeEvent) => {
      const top = e.nativeEvent.layout.y;
      if (generateMutation.isPending) return;
      if (recommendations.length === 0) return;
      const y = Math.max(0, top - spacing.md);
      scrollRef.current?.scrollTo({ y, animated: true });
    },
    [generateMutation.isPending, recommendations.length],
  );

  /** Máx. 10 etiquetas (mismo límite que el API). */
  const toggleTag = useCallback((tag: string) => {
    setActiveTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 10) return prev;
      return [...prev, tag];
    });
  }, []);

  const proceedGenerate = useCallback(() => {
    setExpandedRecipe(null);
    const body: RecipeRecommendationsRequest = {
      count: 3,
      tags: activeTags,
    };
    if (mealTypeFilter !== 'any') body.meal_type = mealTypeFilter;
    if (timeFilter !== 'any') body.max_prep_time_min = timeFilter;
    const trimmedExtra = additionalRequest.trim();
    if (trimmedExtra) body.additional_request = trimmedExtra;
    // Al regenerar: limpia resultados previos para mostrar skeleton y feedback claro.
    generateMutation.reset();
    // Deferir mutate al siguiente tick: en web, reset+mutate en el mismo stack a veces
    // impide que se dispare la petición a /recipes/recommendations.
    queueMicrotask(() => {
      generateMutation.mutate(body, {
        onSuccess: () => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        },
      });
    });
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [activeTags, mealTypeFilter, timeFilter, additionalRequest, generateMutation]);

  const handleGenerate = useCallback(async () => {
    const trimmed = additionalRequest.trim();
    if (trimmed.length > 0 && hasHardRestrictions) {
      try {
        const res = await checkRestrictionsMutation.mutateAsync(trimmed);
        const conflicts = Array.isArray(res.conflicts) ? res.conflicts : [];
        const hasConflicts = Boolean(res.has_conflicts) && conflicts.length > 0;
        if (hasConflicts) {
          const hasUrgent = conflicts.some(
            (c) => c.restriction_type === 'allergy' || c.restriction_type === 'intolerance',
          );
          const title = hasUrgent
            ? '¿Seguro? La IA detectó alimentos peligrosos para ti'
            : '¿Seguro? Posible conflicto con tus restricciones';
          setRestrictionDialog({ title, conflicts });
          return;
        }
      } catch {
        // fail-open: continuar con la generación
      }
    }
    proceedGenerate();
  }, [
    additionalRequest,
    hasHardRestrictions,
    checkRestrictionsMutation,
    proceedGenerate,
  ]);

  const handleSave = useCallback(
    async (recipe: RecipeRecommendation) => {
      await saveRecipeMutation.mutateAsync(recipe);
    },
    [saveRecipeMutation],
  );

  const isGenerating = generateMutation.isPending;
  const isCheckingRestrictions = checkRestrictionsMutation.isPending;
  const isBusy =
    isGenerating || isCheckingRestrictions || restrictionDialog !== null;
  const hasResults = recommendations.length > 0;
  const stickyOffset = Math.max(insets.bottom, spacing.md);

  return (
    <View style={st.root}>
      <RestrictionConfirmModal
        visible={restrictionDialog !== null}
        title={restrictionDialog?.title ?? ''}
        conflicts={restrictionDialog?.conflicts ?? []}
        onDismiss={() => setRestrictionDialog(null)}
        onContinue={() => proceedGenerate()}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          st.content,
          { paddingBottom: stickyOffset + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <HeroSection />

        <FilterCard>
          <FilterSection
            label="Tipo de comida"
            iconName="restaurant"
            count={mealTypeFilter !== 'any' ? 1 : 0}
          >
            <View style={st.chipsRowObjectives}>
              {MEAL_TYPE_OPTIONS.map((opt) => (
                <FilterChip
                  key={opt.id}
                  label={opt.label}
                  icon={opt.icon}
                  active={mealTypeFilter === opt.id}
                  onPress={() => setMealTypeFilter(opt.id)}
                  accent
                />
              ))}
            </View>
          </FilterSection>

          <View style={st.divider} />

          <FilterSection
            label="Tiempo de preparación"
            iconName="time"
            count={timeFilter !== 'any' ? 1 : 0}
          >
            <View style={st.chipsRowObjectives}>
              {TIME_OPTIONS.map((opt) => (
                <FilterChip
                  key={String(opt.id)}
                  label={opt.label}
                  icon={opt.icon}
                  active={timeFilter === opt.id}
                  onPress={() => setTimeFilter(opt.id)}
                  accent
                />
              ))}
            </View>
          </FilterSection>

          <View style={st.divider} />

          <FilterSection label="Objetivos" iconName="sparkles" count={activeTags.length}>
            <View style={st.chipsRowObjectives}>
              {TAG_OPTIONS.map((opt) => (
                <FilterChip
                  key={opt.label}
                  label={opt.label}
                  icon={opt.icon}
                  active={activeTags.includes(opt.label)}
                  onPress={() => toggleTag(opt.label)}
                  accent
                />
              ))}
            </View>
          </FilterSection>

          <View style={st.divider} />

          <FilterSection
            label="Tu petición"
            iconName="chatbubble-ellipses-outline"
            count={additionalRequest.trim() ? 1 : 0}
          >
            <Input
              dense
              placeholder='Ej.: recetas con pechuga de pollo, poco picante, para tupper…'
              value={additionalRequest}
              onChangeText={setAdditionalRequest}
              multiline
              numberOfLines={4}
              maxLength={500}
              textAlignVertical="top"
              style={st.additionalRequestInput}
              hint={
                additionalRequest.trim()
                  ? `Prioridad sobre tipo de comida, tiempo y etiquetas (no sustituye alergias). Quedan ${Math.max(0, 500 - additionalRequest.length)} caracteres.`
                  : `Si escribes aquí, tendrá prioridad sobre el resto de filtros. Quedan ${Math.max(0, 500 - additionalRequest.length)} caracteres.`
              }
            />

            <RestrictionsStatusBar
              loading={restrictionsLoading}
              errored={restrictionsErrored}
              terms={restrictedTerms}
            />
          </FilterSection>
        </FilterCard>

        {isGenerating && <SkeletonRecipeList />}

        {!isGenerating && generateMutation.isError && (
          <ErrorState error={generateMutation.error} onRetry={handleGenerate} />
        )}

        {!isGenerating && hasResults && (
          <View onLayout={scrollToGeneratedRecipesSection} collapsable={false}>
            <View style={st.resultsHeader}>
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
              <Text style={st.resultsHeaderText}>
                {recommendations.length} recetas creadas para ti
              </Text>
            </View>
            {recommendations.map((recipe, idx) => (
              <RecipeSuggestionCard
                key={`${recipe.name}-${idx}`}
                recipe={recipe}
                expanded={expandedRecipe === recipe.name}
                onToggleExpand={() =>
                  setExpandedRecipe((prev) => (prev === recipe.name ? null : recipe.name))
                }
                saved={!!savedNames[recipe.name]}
                savePending={
                  saveRecipeMutation.isPending && saveRecipeMutation.variables?.name === recipe.name
                }
                onSave={() => handleSave(recipe)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[st.stickyCtaWrap, { paddingBottom: stickyOffset, pointerEvents: 'box-none' }]}>
        <LinearGradient
          colors={['rgba(15,17,23,0)', colors.background]}
          locations={[0, 0.55]}
          style={[st.stickyCtaScrim, { pointerEvents: 'none' }]}
        />
        <Pressable
          onPress={() => {
            void handleGenerate();
          }}
          disabled={isBusy}
          style={({ pressed }) => [
            st.generateBtnOuter,
            pressed && primaryCtaPressed,
            isBusy && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Generar sugerencias de recetas"
        >
          <TideGradientFrame
            borderRadius={borderRadius.lg}
            contentContainerStyle={st.generateBtnInner}
          >
            {isCheckingRestrictions ? (
              <>
                <ActivityIndicator color={colors.white} />
                <Text style={st.generateBtnText}>Revisando con IA…</Text>
              </>
            ) : isGenerating ? (
              <>
                <ActivityIndicator color={colors.white} />
                <Text style={st.generateBtnText}>Cocinando ideas…</Text>
              </>
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color={colors.white} />
                <Text style={st.generateBtnText}>
                  {hasResults ? 'Generar nuevas sugerencias' : 'Generar sugerencias'}
                </Text>
              </>
            )}
          </TideGradientFrame>
        </Pressable>
      </View>
    </View>
  );
}

function HeroSection() {
  return (
    <View style={st.heroOuter}>
      {/* Solo el degradado se recorta al radio; el contenido (nutria) puede sobresalir al animar scale. */}
      <View style={[st.heroGlowClip, { pointerEvents: 'none' }]}>
        <LinearGradient
          colors={['rgba(16,185,129,0.22)', 'rgba(16,185,129,0.04)', 'rgba(15,17,23,0)']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <View style={st.heroContent}>
        <View style={{ flex: 1 }}>
          <View style={st.aiBadge}>
            <Ionicons name="sparkles" size={11} color={colors.primary} />
            <Text style={st.aiBadgeText}>IA personalizada</Text>
          </View>
          <Text style={st.title}>Sugeridas para ti</Text>
          <Text style={st.subtitle}>
            Nutria crea recetas a medida según tus objetivos, alergias y preferencias.
          </Text>
        </View>
        <View style={st.heroMascotWrap}>
          <NutriaIdle size={86} />
        </View>
      </View>
    </View>
  );
}

function FilterCard({ children }: { children: React.ReactNode }) {
  return <Surface variant="subtle" style={st.filterCard} padding="md">{children}</Surface>;
}

function FilterSection({
  label,
  iconName,
  count,
  children,
}: {
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View style={st.filterSection}>
      <View style={st.filterLabelRow}>
        <Ionicons name={iconName} size={14} color={colors.primary} />
        <Text style={st.filterLabel}>{label}</Text>
        {count > 0 && (
          <View style={st.filterCountBadge}>
            <Text style={st.filterCountText}>{count}</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

function FilterChip({
  label,
  icon,
  active,
  onPress,
  accent,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  /** Estilo reforzado (sección Objetivos). */
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.chip,
        accent && st.chipObj,
        active && (accent ? st.chipObjActive : st.chipActive),
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon && (
        <View
          style={[
            st.chipIconRing,
            accent && st.chipIconRingObj,
            active && accent && st.chipIconRingObjActive,
          ]}
        >
          <Ionicons
            name={icon}
            size={accent ? 14 : 13}
            color={active ? colors.primaryLight : colors.textMuted}
          />
        </View>
      )}
      <Text
        style={[
          st.chipText,
          accent && st.chipObjText,
          active && st.chipTextActive,
          active && accent && st.chipObjTextActive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[st.macroPill, { borderColor: color + '44', backgroundColor: color + '0F' }]}>
      <Text style={[st.macroPillLabel, { color }]}>{label}</Text>
      <Text style={st.macroPillValue}>{value}g</Text>
    </View>
  );
}

function MetaBadge({
  icon,
  text,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  color?: string;
}) {
  return (
    <View
      style={[
        st.metaBadge,
        color ? { borderColor: color + '55', backgroundColor: color + '14' } : undefined,
      ]}
    >
      <Ionicons name={icon} size={11} color={color ?? colors.textSecondary} />
      <Text style={[st.metaBadgeText, color ? { color } : undefined]}>{text}</Text>
    </View>
  );
}

function RecipeReveal({
  expanded,
  children,
  contentStyle,
}: {
  expanded: boolean;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const [contentHeight, setContentHeight] = useState(0);
  const progress = useSharedValue(expanded ? 1 : 0);

  React.useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: expanded ? RECIPE_CARD_OPEN_MS : RECIPE_CARD_CLOSE_MS,
      easing: expanded ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [expanded, progress]);

  const revealAnimatedStyle = useAnimatedStyle(() => ({
    height: contentHeight * progress.value,
    opacity: progress.value,
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * -6 }],
  }));

  const handleContentLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setContentHeight((prevHeight) =>
      Math.abs(prevHeight - nextHeight) > 0.5 ? nextHeight : prevHeight,
    );
  }, []);

  return (
    <Animated.View
      style={[st.recipeRevealClip, revealAnimatedStyle]}
      pointerEvents={expanded ? 'auto' : 'none'}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View style={contentAnimatedStyle}>
        <View style={contentStyle} onLayout={handleContentLayout}>
          {children}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function RecipeSuggestionCard({
  recipe,
  expanded,
  onToggleExpand,
  saved,
  savePending,
  onSave,
}: {
  recipe: RecipeRecommendation;
  expanded: boolean;
  onToggleExpand: () => void;
  saved: boolean;
  savePending: boolean;
  onSave: () => void;
}) {
  const kcalTotal = Math.round(recipe.total_kcal);
  const proteinTotal = roundMacroG(recipe.total_protein_g);
  const carbsTotal = roundMacroG(recipe.total_carbs_g);
  const fatTotal = roundMacroG(recipe.total_fat_g);
  const diffColor = difficultyColor(recipe.difficulty);
  const expandProgress = useSharedValue(expanded ? 1 : 0);

  React.useEffect(() => {
    expandProgress.value = withTiming(expanded ? 1 : 0, {
      duration: expanded ? RECIPE_CARD_OPEN_MS : RECIPE_CARD_CLOSE_MS,
      easing: expanded ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [expanded, expandProgress]);

  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${expandProgress.value * 180}deg` }],
  }));

  return (
    <Surface variant="subtle" style={st.recipeCard}>
      <LinearGradient
        colors={['rgba(16,185,129,0.18)', 'rgba(16,185,129,0)']}
        locations={[0, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={st.recipeCardGradient}
      />
      <View style={st.recipeCardInner}>
        <TouchableOpacity activeOpacity={0.75} onPress={onToggleExpand}>
          <View style={st.recipeHeader}>
            <View style={st.recipeIconWrap}>
              <Text style={st.recipeIcon}>{recipe.icon ?? '🍲'}</Text>
            </View>
            <View style={st.recipeInfo}>
              <Text style={st.recipeName} numberOfLines={2}>
                {recipe.name}
              </Text>
              <View style={st.kcalRow}>
                <Text style={st.kcalNumber}>{kcalTotal}</Text>
                <Text style={st.kcalUnit}>kcal totales</Text>
              </View>
            </View>
            <Pressable
              onPress={onToggleExpand}
              hitSlop={10}
              style={({ pressed }) => [st.expandBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Contraer detalles' : 'Ver detalles'}
            >
              <Animated.View style={chevronAnimatedStyle}>
                <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
              </Animated.View>
            </Pressable>
          </View>

          <View style={st.recipeMainBlock}>
            {recipe.description ? (
              <RecipeReveal expanded={expanded} contentStyle={st.recipeDescriptionRevealContent}>
                <View style={st.recipeDescriptionQuote}>
                  <Text style={st.recipeDescription}>{recipe.description}</Text>
                </View>
              </RecipeReveal>
            ) : null}

            <View style={st.metaRow}>
              {recipe.prep_time_min ? (
                <MetaBadge icon="time-outline" text={`${recipe.prep_time_min} min`} />
              ) : null}
              <MetaBadge
                icon="people-outline"
                text={`${recipe.servings} porc.`}
              />
              {recipe.difficulty ? (
                <MetaBadge icon="speedometer-outline" text={recipe.difficulty} color={diffColor} />
              ) : null}
            </View>

            <View style={st.macroRow}>
              <MacroPill label="P" value={proteinTotal} color={colors.protein} />
              <MacroPill label="C" value={carbsTotal} color={colors.carbs} />
              <MacroPill label="G" value={fatTotal} color={colors.fat} />
            </View>

            {recipe.tags.length > 0 && (
              <View style={st.tagsRow}>
                {recipe.tags.map((tag, i) => (
                  <View key={`${tag}-${i}`} style={st.recipeTagPill}>
                    <View style={st.recipeTagIconRing}>
                      <Ionicons name="pricetag-outline" size={12} color={colors.primaryLight} />
                    </View>
                    <Text style={st.recipeTagText} numberOfLines={1}>
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </TouchableOpacity>

        <RecipeReveal expanded={expanded} contentStyle={st.expandedAreaRevealContent}>
          <View style={st.expandedArea}>
            <View style={st.sectionHeader}>
              <View style={st.sectionHeaderIcon}>
                <Ionicons name="list" size={12} color={colors.primary} />
              </View>
              <Text style={st.sectionHeaderText}>Ingredientes</Text>
            </View>
            {recipe.items.map((it, i) => (
              <View key={`${it.name}-${i}`} style={st.ingredientRow}>
                <View style={st.ingredientBullet} />
                <Text style={st.ingredientName} numberOfLines={1}>
                  {it.name}
                </Text>
                <Text style={st.ingredientGrams}>{Math.round(it.grams)}g</Text>
              </View>
            ))}

            {recipe.instructions.length > 0 && (
              <>
                <View style={[st.sectionHeader, { marginTop: spacing.lg }]}>
                  <View style={st.sectionHeaderIcon}>
                    <Ionicons name="reader" size={12} color={colors.primary} />
                  </View>
                  <Text style={st.sectionHeaderText}>Preparación</Text>
                </View>
                {recipe.instructions.map((step, i) => (
                  <View key={i} style={st.instructionRow}>
                    <View style={st.instructionNumber}>
                      <Text style={st.instructionNumberText}>{i + 1}</Text>
                    </View>
                    <Text style={st.instructionText}>{step}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        </RecipeReveal>

        <View style={st.cardActions}>
          <Button
            title={saved ? 'Guardada en mis recetas' : 'Guardar receta'}
            onPress={onSave}
            loading={savePending}
            disabled={saved}
            variant={saved ? 'secondary' : 'primary'}
            size="sm"
            icon={
              <Ionicons
                name={saved ? 'checkmark-circle' : 'bookmark-outline'}
                size={16}
                color={saved ? colors.primary : colors.white}
              />
            }
          />
        </View>
      </View>
    </Surface>
  );
}

function ErrorState({ error, onRetry }: { error?: unknown; onRetry: () => void }) {
  const copy = getRecipeRecommendationErrorCopy(error);

  return (
    <Surface variant="subtle" style={st.errorBox} padding="lg">
      <Ionicons name={copy.icon} size={40} color={colors.warning} />
      <Text style={st.errorTitle}>{copy.title}</Text>
      <Text style={st.errorSubtext}>{copy.message}</Text>
      {copy.tips?.length ? (
        <View style={st.errorTips}>
          {copy.tips.map((tip) => (
            <View key={tip} style={st.errorTipRow}>
              <View style={st.errorTipBullet} />
              <Text style={st.errorTipText}>{tip}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={st.errorSubtext}>Vuelve a intentarlo en unos segundos.</Text>
      )}
      <Button
        title="Reintentar"
        onPress={onRetry}
        variant="secondary"
        icon={<Ionicons name="refresh" size={16} color={colors.text} />}
        style={{ marginTop: spacing.md }}
      />
    </Surface>
  );
}

const RestrictionsStatusBar = React.memo(function RestrictionsStatusBar({
  loading,
  errored,
  terms,
}: {
  loading: boolean;
  errored: boolean;
  terms: RestrictionListItem[];
}) {
  if (loading) {
    return (
      <View style={st.statusBar}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={st.statusBarText}>Cargando tus restricciones…</Text>
      </View>
    );
  }
  if (errored) {
    return (
      <View style={[st.statusBar, { borderColor: colors.warning + '55' }]}>
        <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
        <Text style={[st.statusBarText, { color: colors.warning }]}>
          No se pudieron cargar tus restricciones. La revisión con IA al generar no estará
          disponible.
        </Text>
      </View>
    );
  }
  if (terms.length === 0) {
    return (
      <Pressable
        onPress={() => router.push('/profile/food-restrictions')}
        style={({ pressed }) => [
          st.statusBar,
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="link"
      >
        <Ionicons name="shield-outline" size={14} color={colors.textMuted} />
        <Text style={st.statusBarText}>
          No tienes alergias ni alimentos prohibidos configurados.
        </Text>
        <Text style={st.statusBarLink}>Configurar →</Text>
      </Pressable>
    );
  }
  const preview = terms.slice(0, 6).map((t) => t.term).join(', ');
  const extra = terms.length - 6;
  return (
    <Pressable
      onPress={() => router.push('/profile/food-restrictions')}
      style={({ pressed }) => [
        st.statusBar,
        { borderColor: colors.primaryBorder },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="link"
      accessibilityLabel={`Tienes ${terms.length} restricciones activas`}
    >
      <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
      <Text style={st.statusBarText} numberOfLines={2}>
        <Text style={[st.statusBarText, { color: colors.primary, fontWeight: '700' }]}>
          {terms.length} {terms.length === 1 ? 'restricción' : 'restricciones'} activas:
        </Text>{' '}
        {preview}
        {extra > 0 ? ` +${extra}` : ''}
      </Text>
    </Pressable>
  );
});

function SkeletonRecipeList() {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

function SkeletonCard() {
  const opacity = useSharedValue(0.4);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Surface variant="subtle" style={st.skeletonCard} padding="md">
      <View style={st.skeletonHeader}>
        <Animated.View style={[st.skeletonIcon, animatedStyle]} />
        <View style={{ flex: 1, gap: 6 }}>
          <Animated.View style={[st.skeletonLine, { width: '70%' }, animatedStyle]} />
          <Animated.View style={[st.skeletonLine, { width: '40%', height: 10 }, animatedStyle]} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
        <Animated.View style={[st.skeletonChip, animatedStyle]} />
        <Animated.View style={[st.skeletonChip, animatedStyle]} />
        <Animated.View style={[st.skeletonChip, animatedStyle]} />
      </View>
      <Animated.View style={[st.skeletonLine, { width: '100%', marginTop: spacing.md }, animatedStyle]} />
      <Animated.View style={[st.skeletonLine, { width: '85%', marginTop: 6 }, animatedStyle]} />
    </Surface>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.md,
  },

  // Hero
  heroOuter: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    overflow: 'visible',
  },
  heroGlowClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    paddingRight: spacing.sm,
    gap: spacing.sm,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginBottom: 8,
  },
  aiBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: { ...typography.h2, color: colors.text, marginBottom: 4 },
  subtitle: { ...typography.caption, color: colors.textSecondary, lineHeight: 16 },
  heroMascotWrap: {
    width: 86,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },

  // Filters
  filterCard: {
    marginBottom: spacing.lg,
    gap: 0,
  },
  filterSection: { paddingVertical: spacing.xs },
  filterLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  filterLabel: {
    ...typography.captionBold,
    color: colors.text,
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  filterCountBadge: {
    backgroundColor: colors.primary,
    borderRadius: 9999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  filterCountText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  /** Filtros en pastilla (tipo, tiempo, objetivos): mismo ritmo visual. */
  chipsRowObjectives: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    backgroundColor: colors.surfaceElevated,
  },
  /** Objetivos: pastilla más clara, icono en anillo. */
  chipObj: {
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    paddingLeft: 6,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    ...elevation.soft,
  },
  chipActive: {
    borderColor: colors.primaryBorderStrong,
    backgroundColor: colors.primaryMuted,
  },
  chipObjActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryGlow,
    borderWidth: 1,
  },
  chipIconRing: {
    marginRight: 5,
  },
  chipIconRingObj: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipIconRingObjActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryBorder,
  },
  chipText: { ...typography.caption, color: colors.textSecondary, fontSize: 12 },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  chipObjText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  chipObjTextActive: { color: colors.text, fontWeight: '600' },

  additionalRequestInput: {
    minHeight: 100,
    paddingTop: spacing.md,
  },

  // Restriction status bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  statusBarText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    flex: 1,
    flexShrink: 1,
    lineHeight: 16,
  },
  statusBarLink: {
    ...typography.captionBold,
    color: colors.primary,
    fontSize: 11,
  },

  // Modal restricciones — estilo "ficha clínica"
  restrictionModalWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: screenPaddingX,
  },
  restrictionModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,10,14,0.78)',
  },
  restrictionModalCard: {
    position: 'relative',
    zIndex: 1,
    flexDirection: 'column',
    borderRadius: borderRadius.lg + 4,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: colors.background,
    ...elevation.fab,
  },
  restrictionBanner: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restrictionBannerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  restrictionBannerLabel: {
    ...typography.captionBold,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  restrictionBannerTitle: {
    ...typography.h3,
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 26,
    textAlign: 'center',
  },
  restrictionModalCardInner: {
    flexDirection: 'column',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  restrictionModalLead: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  restrictionModalScroll: {
    marginHorizontal: -spacing.xs,
  },
  restrictionModalScrollContent: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  restrictionRow: {
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.textMuted,
  },
  restrictionRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  restrictionRowTypeText: {
    ...typography.captionBold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  restrictionRowDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  restrictionRowMention: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    flexShrink: 1,
  },
  restrictionRowMatch: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 4,
  },
  restrictionRowMatchTerm: {
    ...typography.captionBold,
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  restrictionRowExplanation: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  restrictionRowAlts: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  restrictionRowAltsLabel: {
    ...typography.captionBold,
    color: colors.primary,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  restrictionRowAltsList: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '600',
  },
  restrictionModalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.surfaceElevated,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  restrictionModalCta: {
    flexDirection: 'row',
    paddingVertical: 15,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  restrictionModalCtaText: {
    ...typography.bodyBold,
    color: colors.white,
    fontSize: 16,
    letterSpacing: 0.2,
  },
  restrictionModalLink: {
    paddingVertical: spacing.sm,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restrictionModalLinkText: {
    ...typography.caption,
    color: colors.error,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(239,68,68,0.4)',
  },

  // Sticky CTA
  stickyCtaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.lg,
  },
  regenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  regenBannerText: {
    ...typography.captionBold,
    color: colors.text,
    fontSize: 13,
  },
  stickyCtaScrim: {
    position: 'absolute',
    top: -spacing.xl,
    left: 0,
    right: 0,
    bottom: 0,
  },
  generateBtnOuter: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...elevation.fab,
  },
  generateBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
  },
  generateBtnText: { color: colors.white, fontSize: 15, fontWeight: '600' },

  // Results header
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  resultsHeaderText: {
    ...typography.captionBold,
    color: colors.textSecondary,
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  resultsListWrap: {
    marginBottom: spacing.sm,
  },
  resultsListWrapDimmed: {
    opacity: 0.48,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    borderColor: colors.warning + '44',
  },
  inlineErrorTitle: {
    ...typography.captionBold,
    color: colors.text,
  },
  inlineErrorText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  inlineErrorRetry: {
    ...typography.captionBold,
    color: colors.primary,
  },

  // Error
  errorBox: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  errorTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.sm,
  },
  errorSubtext: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  errorTips: {
    alignSelf: 'stretch',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  errorTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  errorTipBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.warning,
    marginTop: 7,
  },
  errorTipText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },

  // Recipe card
  recipeCard: {
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderRadius: borderRadius.lg,
  },
  recipeCardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  recipeCardInner: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  recipeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeIcon: { fontSize: 24 },
  recipeInfo: { flex: 1, minWidth: 0, paddingRight: spacing.xs },
  recipeName: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 15,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
  kcalNumber: { ...typography.bodyBold, color: colors.primary, fontSize: 16 },
  kcalUnit: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },
  expandBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recipeMainBlock: {
    marginTop: spacing.sm,
  },
  recipeRevealClip: {
    overflow: 'hidden',
  },
  recipeDescriptionRevealContent: {
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.md,
  },
  recipeDescriptionQuote: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primaryBorder,
    paddingLeft: spacing.sm,
  },
  recipeDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'left',
    fontStyle: 'italic',
  },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  metaBadgeText: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },

  macroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  macroPillLabel: { ...typography.captionBold, fontSize: 11 },
  macroPillValue: { ...typography.caption, color: colors.text, fontSize: 11 },

  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.sm,
  },
  /** Etiquetas de receta: icono + texto (sin # crudo) para leer más limpio. */
  recipeTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: 12,
    maxWidth: '100%',
    backgroundColor: colors.primaryGlowSoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    ...elevation.card,
  },
  recipeTagIconRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  recipeTagText: {
    ...typography.caption,
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
    letterSpacing: 0.15,
  },

  expandedAreaRevealContent: {
    paddingTop: spacing.sm,
  },
  expandedArea: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  sectionHeaderIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderText: {
    ...typography.captionBold,
    color: colors.text,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: spacing.xs,
  },
  ingredientBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  ingredientName: { ...typography.caption, color: colors.text, flex: 1, fontSize: 13 },
  ingredientGrams: { ...typography.captionBold, color: colors.textSecondary, fontSize: 12 },

  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  instructionNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionNumberText: {
    ...typography.captionBold,
    color: colors.white,
    fontSize: 11,
  },
  instructionText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
    lineHeight: 18,
    fontSize: 13,
  },

  cardActions: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  // Skeleton
  skeletonCard: {
    marginBottom: spacing.md,
  },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  skeletonIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 4,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonChip: {
    width: 60,
    height: 22,
    borderRadius: 9999,
    backgroundColor: colors.surfaceMuted,
  },
});
