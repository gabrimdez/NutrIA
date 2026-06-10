import React, { useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Pressable,
  Animated as RNAnimated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming, Easing as ReEasing } from 'react-native-reanimated';
import { Button, Surface, TideGradientFrame, MainTabBarClone, SearchActionBar, ScreenFocusProvider, useScreenFocusKey } from '../../src/components';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import {
  colors,
  spacing,
  typography,
  screenPaddingX,
  borderRadius,
  DOCK_H,
  DOCK_MARGIN_BOTTOM,
  SEARCH_ACTION_BAR_H,
  primaryCtaPressed,
  actionIntentStyles,
} from '../../src/theme';
import { roundMacroG } from '../../src/lib/mealItemMath';
import { invalidateMealRelatedQueries } from '../../src/lib/mealQueryInvalidation';
import { mealItemDisplayLineForUi } from '../../src/lib/mealDisplay';
import type { Recipe, SavedMeal, Profile } from '../../src/types';
import { isNonPremiumTier } from '../../src/lib/planAiPremiumGate';
import { showRecipeIaSuggestionsPremiumLock } from '../../src/lib/nutriCoachQuotaAlert';

function recipeSavedMealName(recipe: Recipe) {
  return `${recipe.icon ?? '🍲'} ${recipe.name}`;
}

function recipeToSavedMealPayload(recipe: Recipe) {
  return {
    name: recipeSavedMealName(recipe),
    items: recipe.items.map((i) => ({
      food_catalog_id: i.food_catalog_id ?? undefined,
      custom_name: i.custom_name ?? undefined,
      grams: i.grams,
      kcal: i.kcal,
      protein_g: i.protein_g,
      carbs_g: i.carbs_g,
      fat_g: i.fat_g,
    })),
  };
}

function savedMealForRecipe(saved: SavedMeal[] | undefined, recipe: Recipe): SavedMeal | undefined {
  if (!saved?.length || recipe.items.length === 0) return undefined;
  const targetName = recipeSavedMealName(recipe);
  return saved.find((s) => s.name === targetName);
}

function isRecipeInSavedMeals(saved: SavedMeal[] | undefined, recipe: Recipe) {
  return !!savedMealForRecipe(saved, recipe);
}

const RECIPES_ENTRADA_X = 40;
const INGREDIENT_GRAMS_FIELD_MIN_WIDTH = 62;
const INGREDIENT_GRAMS_FIELD_MAX_WIDTH = 104;

function getIngredientGramsFieldWidth(value: string) {
  const charCount = Math.max(2, value.trim().length);
  return Math.min(
    INGREDIENT_GRAMS_FIELD_MAX_WIDTH,
    Math.max(INGREDIENT_GRAMS_FIELD_MIN_WIDTH, 34 + charCount * 8),
  );
}

function RecipesEntradaSlide({ children }: { children: ReactNode }) {
  const focusKey = useScreenFocusKey();
  const tx = useSharedValue(-RECIPES_ENTRADA_X);

  useEffect(() => {
    tx.value = -RECIPES_ENTRADA_X;
    tx.value = withTiming(0, {
      duration: 320,
      easing: ReEasing.out(ReEasing.cubic),
    });
  }, [focusKey, tx]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  return (
    <Reanimated.View style={[{ flex: 1 }, animStyle]}>
      {children}
    </Reanimated.View>
  );
}

export default function RecipesListScreen() {
  const queryClient = useQueryClient();
  const { meal_type: mealType, date } = useLocalSearchParams<{
    meal_type?: string;
    date?: string;
  }>();

  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [portionsStr, setPortionsStr] = useState('1');
  const [itemGrams, setItemGrams] = useState<Record<string, string>>({});
  const [optimisticFavs, setOptimisticFavs] = useState<Record<string, boolean>>({});
  const favTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/api/v1/me/profile'),
    retry: 1,
  });
  const isFreeUser = isNonPremiumTier(profile?.subscription_tier);

  const { data: recipes, isLoading } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => api.get('/api/v1/meals/recipes') as Promise<Recipe[]>,
  });

  const { data: recommended, isError: recommendedError } = useQuery({
    queryKey: ['recipes-recommended', mealType, recipes?.length ?? 0],
    enabled: !isLoading && Array.isArray(recipes) && recipes.length > 0,
    queryFn: () => api.get<Array<{
      recipe_id: string;
      name: string;
      kcal_per_serving: number;
      protein_per_serving: number;
      score: number;
      reasons: string[];
      meal_type_suggestion: string;
    }>>(`/api/v1/meals/recipes/recommended${mealType ? `?meal_type=${mealType}` : ''}`),
    staleTime: 60_000,
  });

  const savedMealsQuery = useQuery({
    queryKey: ['savedMeals'],
    queryFn: () => api.get<SavedMeal[]>('/api/v1/meals/saved'),
    staleTime: 30_000,
  });

  const isFavorite = useCallback(
    (recipe: Recipe) => {
      if (recipe.id in optimisticFavs) return optimisticFavs[recipe.id];
      return isRecipeInSavedMeals(savedMealsQuery.data, recipe);
    },
    [savedMealsQuery.data, optimisticFavs],
  );

  const clearOptimistic = useCallback(
    (recipeId: string) => setOptimisticFavs((prev) => {
      const next = { ...prev };
      delete next[recipeId];
      return next;
    }),
    [],
  );

  const refetchSaved = useCallback(
    () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['savedMeals'] }),
      queryClient.invalidateQueries({ queryKey: ['saved-meals'] }),
    ]),
    [queryClient],
  );

  const commitFavorite = useCallback(
    async (recipe: Recipe) => {
      try {
        await api.post('/api/v1/meals/saved', recipeToSavedMealPayload(recipe));
        await refetchSaved();
        clearOptimistic(recipe.id);
      } catch (e: unknown) {
        clearOptimistic(recipe.id);
        Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo guardar en favoritos'));
      }
    },
    [refetchSaved, clearOptimistic],
  );

  const commitUnfavorite = useCallback(
    async (savedMealId: string, recipeId: string) => {
      try {
        await api.delete(`/api/v1/meals/saved/${savedMealId}`);
        await refetchSaved();
        clearOptimistic(recipeId);
      } catch (e: unknown) {
        clearOptimistic(recipeId);
        Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo quitar de favoritos'));
      }
    },
    [refetchSaved, clearOptimistic],
  );

  const toggleFavorite = useCallback(
    (recipe: Recipe) => {
      const willBeFav = !isFavorite(recipe);
      setOptimisticFavs((prev) => ({ ...prev, [recipe.id]: willBeFav }));

      if (favTimers.current[recipe.id]) {
        clearTimeout(favTimers.current[recipe.id]);
      }

      const serverFav = isRecipeInSavedMeals(savedMealsQuery.data, recipe);
      if (willBeFav === serverFav) {
        clearOptimistic(recipe.id);
        return;
      }

      favTimers.current[recipe.id] = setTimeout(() => {
        delete favTimers.current[recipe.id];
        if (willBeFav) {
          commitFavorite(recipe);
        } else {
          const sm = savedMealForRecipe(savedMealsQuery.data, recipe);
          if (sm) commitUnfavorite(sm.id, recipe.id);
          else clearOptimistic(recipe.id);
        }
      }, 400);
    },
    [isFavorite, savedMealsQuery.data, clearOptimistic, commitFavorite, commitUnfavorite],
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/meals/recipes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
    onError: (e: unknown) =>
      Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo eliminar la receta')),
  });

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return api.post('/api/v1/meals/confirm', body);
    },
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      setSelectedRecipe(null);
      Alert.alert('Listo', 'Receta añadida a tu comida', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (e: unknown) =>
      Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo registrar')),
  });

  const confirmDelete = (recipe: Recipe) => {
    Alert.alert('Eliminar receta', `¿Eliminar "${recipe.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => deleteMutation.mutate(recipe.id) },
    ]);
  };

  const openUseRecipe = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setPortionsStr('1');
    const servings = recipe.servings || 1;
    const initial: Record<string, string> = {};
    for (const it of recipe.items) {
      initial[it.id] = String(roundMacroG(it.grams / servings));
    }
    setItemGrams(initial);
  };

  const portions = Math.max(0.25, parseFloat(portionsStr.replace(',', '.')) || 1);

  const rescaleIngredients = useCallback(
    (recipe: Recipe, multiplier: number) => {
      const servings = recipe.servings || 1;
      const next: Record<string, string> = {};
      for (const it of recipe.items) {
        next[it.id] = String(roundMacroG((it.grams / servings) * multiplier));
      }
      setItemGrams(next);
    },
    [],
  );

  const changePortions = useCallback(
    (nextPortions: number) => {
      const clamped = Math.max(0.25, Number.isFinite(nextPortions) ? nextPortions : 1);
      setPortionsStr(String(clamped));
      if (selectedRecipe) rescaleIngredients(selectedRecipe, clamped);
    },
    [selectedRecipe, rescaleIngredients],
  );

  const onPortionsTextChange = useCallback(
    (text: string) => {
      setPortionsStr(text);
      const parsed = parseFloat(text.replace(',', '.'));
      if (!Number.isNaN(parsed) && parsed > 0 && selectedRecipe) {
        rescaleIngredients(selectedRecipe, parsed);
      }
    },
    [selectedRecipe, rescaleIngredients],
  );

  const getItemMacros = useCallback(
    (item: Recipe['items'][number]) => {
      const raw = itemGrams[item.id] ?? String(item.grams);
      const g = Math.max(0, parseFloat(String(raw).replace(',', '.')) || 0);
      const ratio = item.grams > 0 ? g / item.grams : 0;
      return {
        grams: roundMacroG(g),
        kcal: roundMacroG(item.kcal * ratio),
        protein: roundMacroG(item.protein_g * ratio),
        carbs: roundMacroG(item.carbs_g * ratio),
        fat: roundMacroG(item.fat_g * ratio),
      };
    },
    [itemGrams],
  );

  const portionMacros = useMemo(() => {
    if (!selectedRecipe) return { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0 };
    const acc = { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0 };
    for (const it of selectedRecipe.items) {
      const m = getItemMacros(it);
      acc.kcal += m.kcal;
      acc.protein += m.protein;
      acc.carbs += m.carbs;
      acc.fat += m.fat;
      acc.grams += m.grams;
    }
    return {
      kcal: roundMacroG(acc.kcal),
      protein: roundMacroG(acc.protein),
      carbs: roundMacroG(acc.carbs),
      fat: roundMacroG(acc.fat),
      grams: roundMacroG(acc.grams),
    };
  }, [selectedRecipe, getItemMacros]);

  const confirmUseRecipe = () => {
    if (!selectedRecipe || !mealType || !date) return;
    const items = selectedRecipe.items
      .map((it) => {
        const m = getItemMacros(it);
        return {
          food_catalog_id: it.food_catalog_id ?? undefined,
          custom_name: it.custom_name ?? undefined,
          grams: m.grams,
          kcal: m.kcal,
          protein_g: m.protein,
          carbs_g: m.carbs,
          fat_g: m.fat,
        };
      })
      .filter((i) => i.grams > 0);
    if (items.length === 0) {
      Alert.alert(
        'Sin ingredientes',
        'Añade al menos un ingrediente con peso mayor que cero.',
      );
      return;
    }
    saveMutation.mutate({
      date,
      meal_type: mealType,
      title: selectedRecipe.name,
      items,
    });
  };

  const hasMealContext = !!(mealType && date);

  const insets = useSafeAreaInsets();
  const bottomChromeH =
    SEARCH_ACTION_BAR_H + spacing.sm + DOCK_H + Math.max(insets.bottom, DOCK_MARGIN_BOTTOM);

  return (
    <ScreenFocusProvider>
      <View style={st.root}>
        <RecipesEntradaSlide>
          <ScrollView
            contentContainerStyle={[st.content, { paddingBottom: bottomChromeH + spacing.md }]}
            showsVerticalScrollIndicator={false}
          >
        <View style={st.headerRow}>
          <Text style={st.title}>Mis recetas</Text>
          <View style={st.headerActions}>
            <SuggestRecipesButton
              onPress={() => {
                if (isFreeUser) {
                  showRecipeIaSuggestionsPremiumLock();
                  return;
                }
                router.push({
                  pathname: '/add-meal/recipe-suggestions',
                  params: { meal_type: mealType ?? '', date: date ?? '' },
                });
              }}
            />
            <CreateRecipeTideButton
              onPress={() =>
                router.push({
                  pathname: '/add-meal/create-recipe',
                  params: { meal_type: mealType ?? '', date: date ?? '' },
                })
              }
            />
          </View>
        </View>

        {isLoading && (
          <View style={st.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {recommendedError ? (
          <Text style={st.recommendedError}>No se pudieron cargar recomendaciones.</Text>
        ) : null}

        {recommended && recommended.length > 0 && recipes && recipes.length > 0 && (
          <View style={st.recommendedSection}>
            <Text style={st.recommendedTitle}>Recomendadas para ti</Text>
            {recommended.slice(0, 3).map((rec) => {
              const recipeObj = recipes.find((r) => String(r.id) === String(rec.recipe_id));
              if (!recipeObj) return null;
              return (
                <TouchableOpacity
                  key={rec.recipe_id}
                  activeOpacity={hasMealContext ? 0.65 : 1}
                  onPress={() => hasMealContext && openUseRecipe(recipeObj)}
                >
                  <Surface variant="subtle" style={st.recipeCard} padding="md">
                    <View style={st.recipeHeader}>
                      <Text style={st.recipeIcon}>{recipeObj.icon ?? '🍲'}</Text>
                      <View style={st.recipeInfo}>
                        <Text style={st.recipeName} numberOfLines={1}>{recipeObj.name}</Text>
                        <Text style={st.recipeMeta}>
                          {rec.kcal_per_serving} kcal · P{rec.protein_per_serving}g por porción
                        </Text>
                        <Text style={st.recommendedReason}>{rec.reasons?.[0] ?? ''}</Text>
                      </View>
                      <Ionicons name="star" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                    </View>
                  </Surface>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!isLoading && (!recipes || recipes.length === 0) && (
          <View style={st.center}>
            <Ionicons name="book-outline" size={48} color={colors.textTertiary} />
            <Text style={st.emptyText}>No tienes recetas aún</Text>
            <Text style={st.emptySubtext}>
              Crea tu primera receta combinando ingredientes
            </Text>
            <Button
              title="Crear receta"
              onPress={() =>
                router.push({
                  pathname: '/add-meal/create-recipe',
                  params: { meal_type: mealType ?? '', date: date ?? '' },
                })
              }
              style={{ marginTop: spacing.lg }}
            />
          </View>
        )}

        {recipes?.map((recipe) => (
          <TouchableOpacity
            key={recipe.id}
            activeOpacity={hasMealContext ? 0.65 : 1}
            onPress={() => hasMealContext && openUseRecipe(recipe)}
          >
            <Surface variant="subtle" style={st.recipeCard} padding="md">
              <View style={st.recipeHeader}>
                <Text style={st.recipeIcon}>{recipe.icon ?? '🍲'}</Text>
                <View style={st.recipeInfo}>
                  <Text style={st.recipeName} numberOfLines={1}>{recipe.name}</Text>
                  <Text style={st.recipeMeta}>
                    {recipe.servings} {recipe.servings === 1 ? 'porción' : 'porciones'} ·{' '}
                    {Math.round(recipe.total_kcal / (recipe.servings || 1))} kcal/porción
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isFavorite(recipe)
                      ? 'Quitar receta de favoritos'
                      : 'Añadir receta a favoritos'
                  }
                  hitSlop={10}
                  disabled={recipe.items.length === 0}
                  style={({ pressed }) => [
                    st.favoriteBtn,
                    pressed && st.favoriteBtnPressed,
                    recipe.items.length === 0 && st.favoriteBtnDisabled,
                  ]}
                  onPress={() => toggleFavorite(recipe)}
                >
                  <AnimatedHeart
                    active={isFavorite(recipe)}
                    size={22}
                    activeColor={colors.primary}
                    inactiveColor={colors.textSecondary}
                  />
                </Pressable>
              </View>
              <View style={st.macroRow}>
                <MacroPill label="P" value={roundMacroG(recipe.total_protein_g / (recipe.servings || 1))} color={colors.protein} />
                <MacroPill label="C" value={roundMacroG(recipe.total_carbs_g / (recipe.servings || 1))} color={colors.carbs} />
                <MacroPill label="G" value={roundMacroG(recipe.total_fat_g / (recipe.servings || 1))} color={colors.fat} />
              </View>
              {recipe.items.length > 0 && (
                <Text style={st.ingredientsList} numberOfLines={2}>
                  {recipe.items.map((i) => mealItemDisplayLineForUi(i.custom_name || '')).filter(Boolean).join(', ')}
                </Text>
              )}
              <View style={st.cardActions}>
                <TouchableOpacity
                  style={st.cardActionBtn}
                  onPress={() =>
                    router.push({
                      pathname: '/add-meal/create-recipe',
                      params: { edit_id: recipe.id, meal_type: mealType ?? '', date: date ?? '' },
                    })
                  }
                  hitSlop={8}
                >
                  <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                  <Text style={st.cardActionText}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={st.cardActionBtn}
                  onPress={() => confirmDelete(recipe)}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                  <Text style={[st.cardActionText, { color: colors.error }]}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </Surface>
          </TouchableOpacity>
        ))}
          </ScrollView>
        </RecipesEntradaSlide>

      {/* Bottom sheet: use recipe in meal */}
      <BottomSheet
        visible={!!selectedRecipe}
        onDismiss={() => setSelectedRecipe(null)}
        expandToMaxHeight
      >
        {selectedRecipe && (
          <View style={st.useSheet}>
            <Text style={st.useTitle}>Usar receta</Text>

            <ScrollView
              style={st.useScroll}
              contentContainerStyle={st.useScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
            <Surface variant="subtle" style={st.useRecipeCard} padding="md">
              <View style={st.useRecipeRow}>
                <Text style={st.useRecipeIcon}>{selectedRecipe.icon ?? '🍲'}</Text>
                <View style={st.useRecipeInfo}>
                  <Text style={st.useName} numberOfLines={2}>{selectedRecipe.name}</Text>
                  <Text style={st.useMeta}>
                    {selectedRecipe.servings}{' '}
                    {selectedRecipe.servings === 1 ? 'porción definida' : 'porciones definidas'}
                    {' · '}
                    {Math.round(selectedRecipe.total_kcal)} kcal total
                  </Text>
                </View>
              </View>
            </Surface>

            <View style={st.portionsBlock}>
              <Text style={st.portionsLabel}>Porciones</Text>
              <View style={st.portionsControl}>
                <TouchableOpacity
                  onPress={() => changePortions(portions - 0.5)}
                  style={st.portionsStepBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Disminuir porciones"
                  hitSlop={6}
                >
                  <Ionicons name="remove" size={18} color={colors.text} />
                </TouchableOpacity>
                <TextInput
                  style={st.portionsInput}
                  value={portionsStr}
                  onChangeText={onPortionsTextChange}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  textAlign="center"
                />
                <TouchableOpacity
                  onPress={() => changePortions(portions + 0.5)}
                  style={st.portionsStepBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Aumentar porciones"
                  hitSlop={6}
                >
                  <Ionicons name="add" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {selectedRecipe.items.length > 0 && (
              <View style={st.ingredientsBlock}>
                <Text style={st.ingredientsLabel}>Ingredientes</Text>
                <View style={st.ingredientsEditList}>
                  {selectedRecipe.items.map((it, idx) => {
                    const m = getItemMacros(it);
                    const rawName = mealItemDisplayLineForUi(it.custom_name || '') || '';
                    const displayName = rawName.trim() || 'Ingrediente';
                    const gramsValue = itemGrams[it.id] ?? String(it.grams);
                    const isLast = idx === selectedRecipe.items.length - 1;
                    return (
                      <View
                        key={it.id}
                        style={[st.ingredientRow, isLast && st.ingredientRowLast]}
                      >
                        <View style={st.ingredientInfo}>
                          <Text style={st.ingredientName} numberOfLines={1}>
                            {displayName}
                          </Text>
                          <Text style={st.ingredientMeta}>{m.kcal} kcal</Text>
                        </View>
                        <View
                          style={[
                            st.ingredientGramsField,
                            { width: getIngredientGramsFieldWidth(gramsValue) },
                          ]}
                        >
                          <TextInput
                            style={st.ingredientGramsInput}
                            value={gramsValue}
                            onChangeText={(v) =>
                              setItemGrams((prev) => ({ ...prev, [it.id]: v }))
                            }
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            textAlign="right"
                          />
                          <Text style={st.ingredientGramsUnit}>g</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <Surface variant="subtle" style={st.summaryCard} padding="md">
              <View style={st.summaryHeroRow}>
                <View style={st.summaryHeroLeft}>
                  <Text style={st.summaryHeroLabel}>Total</Text>
                  <View style={st.summaryKcalRow}>
                    <Text style={st.summaryKcal}>{portionMacros.kcal}</Text>
                    <Text style={st.summaryKcalUnit}>kcal</Text>
                  </View>
                </View>
                <View style={st.summaryGramsChip}>
                  <Text style={st.summaryGramsText}>{portionMacros.grams} g</Text>
                </View>
              </View>
              <View style={st.summaryDivider} />
              <View style={st.macroRow}>
                <MacroPill label="P" value={portionMacros.protein} color={colors.protein} />
                <MacroPill label="C" value={portionMacros.carbs} color={colors.carbs} />
                <MacroPill label="G" value={portionMacros.fat} color={colors.fat} />
              </View>
            </Surface>
            </ScrollView>

            <View style={[actionIntentStyles.row, st.useActions]}>
              <Button
                variant="actionCancel"
                title="Cancelar"
                onPress={() => setSelectedRecipe(null)}
              />
              <Button
                variant="actionConfirm"
                title="Añadir a mi comida"
                onPress={confirmUseRecipe}
                disabled={saveMutation.isPending}
                loading={saveMutation.isPending}
              />
            </View>
          </View>
        )}
      </BottomSheet>

      <View
        style={[
          st.bottomStack,
          { paddingBottom: Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) },
        ]}
      >
        <SearchActionBar
          active="recipes"
          onSearch={() =>
            router.replace(
              `/add-meal/search?meal_type=${encodeURIComponent(mealType ?? '')}&date=${encodeURIComponent(date ?? '')}` as never,
            )
          }
          onScanner={() =>
            router.push(
              `/scanner?meal_type=${encodeURIComponent(mealType ?? '')}&date=${encodeURIComponent(date ?? '')}` as never,
            )
          }
        />
        <MainTabBarClone floating={false} activeTab="search" mealType={mealType} diaryDateStr={date} />
      </View>
      </View>
    </ScreenFocusProvider>
  );
}

function AnimatedHeart({ active, size, activeColor, inactiveColor }: {
  active: boolean;
  size: number;
  activeColor: string;
  inactiveColor: string;
}) {
  const scale = useRef(new RNAnimated.Value(1)).current;
  const rotate = useRef(new RNAnimated.Value(0)).current;
  const prevActive = useRef(active);

  React.useEffect(() => {
    if (prevActive.current === active) return;
    prevActive.current = active;

    if (active) {
      // Pop bounce: scale up → overshoot → settle
      scale.setValue(0.5);
      RNAnimated.spring(scale, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }).start();
    } else {
      // Shake + shrink → restore
      rotate.setValue(0);
      RNAnimated.sequence([
        RNAnimated.timing(rotate, {
          toValue: 1,
          duration: 300,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        RNAnimated.timing(scale, {
          toValue: 0.6,
          duration: 120,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        RNAnimated.spring(scale, {
          toValue: 1,
          friction: 4,
          tension: 160,
          useNativeDriver: true,
        }),
      ]).start(() => rotate.setValue(0));
    }
  }, [active, scale, rotate]);

  const animatedStyle = {
    transform: [
      { scale },
      {
        rotate: rotate.interpolate({
          inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
          outputRange: ['0deg', '-12deg', '12deg', '-8deg', '6deg', '0deg'],
        }),
      },
    ],
  };

  return (
    <RNAnimated.View style={animatedStyle}>
      <Ionicons
        name={active ? 'heart' : 'heart-outline'}
        size={size}
        color={active ? activeColor : inactiveColor}
      />
    </RNAnimated.View>
  );
}

function CreateRecipeTideButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [st.createBtnOuter, pressed && primaryCtaPressed]}
      accessibilityRole="button"
      accessibilityLabel="Crear nueva receta"
    >
      <TideGradientFrame borderRadius={9999} contentContainerStyle={st.createBtnInner}>
        <Ionicons name="add" size={17} color={colors.white} />
        <Text style={st.createBtnText}>Nueva</Text>
      </TideGradientFrame>
    </Pressable>
  );
}

function SuggestRecipesButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [st.suggestBtn, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityLabel="Ver recetas sugeridas por IA"
      hitSlop={6}
    >
      <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
      <Text style={st.suggestBtnText}>Sugeridas</Text>
    </Pressable>
  );
}

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[st.macroPill, { borderColor: color + '44' }]}>
      <Text style={[st.macroPillLabel, { color }]}>{label}</Text>
      <Text style={st.macroPillValue}>{value}g</Text>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bottomStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    overflow: 'visible',
    zIndex: 10,
    gap: spacing.sm,
  },
  content: {
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: { ...typography.h2, color: colors.text },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 7,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '14',
  },
  suggestBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  createBtnOuter: { borderRadius: 9999, overflow: 'hidden' },
  createBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  createBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },

  center: {
    alignItems: 'center',
    paddingTop: spacing.xxxl * 2,
    gap: spacing.sm,
  },
  emptyText: { ...typography.bodyBold, color: colors.textSecondary },
  emptySubtext: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },

  recommendedSection: { marginBottom: spacing.lg },
  recommendedTitle: { ...typography.sectionTitle, color: colors.primary, marginBottom: spacing.sm, fontSize: 15 },
  recommendedReason: { ...typography.caption, color: colors.primaryLight, marginTop: 2, fontStyle: 'italic' },
  recommendedError: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },

  recipeCard: { marginBottom: spacing.md },
  recipeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.sm },
  recipeIcon: { fontSize: 28 },
  recipeInfo: { flex: 1 },
  favoriteBtn: {
    padding: spacing.xs,
    marginTop: -spacing.xs,
    marginRight: -spacing.xs,
    borderRadius: borderRadius.sm,
  },
  favoriteBtnPressed: { opacity: 0.85 },
  favoriteBtnDisabled: { opacity: 0.45 },
  recipeName: { ...typography.bodyBold, color: colors.text },
  recipeMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  macroRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  macroPillLabel: { ...typography.captionBold, fontSize: 11 },
  macroPillValue: { ...typography.caption, color: colors.text, fontSize: 11 },

  ingredientsList: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },

  cardActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cardActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardActionText: { ...typography.caption, color: colors.textSecondary },

  // Use recipe sheet
  useSheet: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  useScroll: { flex: 1, minHeight: 0 },
  useScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  useActions: { paddingTop: spacing.md, width: '100%' },
  useTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  useRecipeCard: { marginBottom: 0 },
  useRecipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  useRecipeIcon: { fontSize: 30, lineHeight: 34 },
  useRecipeInfo: { flex: 1, minWidth: 0 },
  useName: { ...typography.bodyBold, color: colors.text },
  useMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  portionsBlock: { gap: spacing.sm },
  portionsLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  portionsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  portionsStepBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portionsInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },

  ingredientsBlock: { gap: spacing.sm },
  ingredientsLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  ingredientsEditList: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ingredientRowLast: { borderBottomWidth: 0 },
  ingredientInfo: { flex: 1, minWidth: 0 },
  ingredientName: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  ingredientMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  ingredientGramsField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
  },
  ingredientGramsInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    paddingVertical: 0,
  },
  ingredientGramsUnit: { ...typography.caption, color: colors.textSecondary },

  summaryCard: { marginBottom: 0 },
  summaryHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryHeroLeft: { flexShrink: 1 },
  summaryHeroLabel: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  summaryKcalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  summaryKcal: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 32,
  },
  summaryKcalUnit: { ...typography.caption, color: colors.textSecondary },
  summaryGramsChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary + '1F',
    borderWidth: 1,
    borderColor: colors.primary + '44',
  },
  summaryGramsText: { ...typography.captionBold, color: colors.primary },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
});
