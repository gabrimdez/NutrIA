import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Alert, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, FlatList, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, PLAN_API_TIMEOUT_MS } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { Button, Input, Surface } from '../../src/components';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { colors, spacing, typography, screenPaddingX, borderRadius, actionIntentStyles } from '../../src/theme';
import { roundMacroG } from '../../src/lib/mealItemMath';
import { mealItemDisplayLineForUi } from '../../src/lib/mealDisplay';
import type {
  Profile,
  Recipe,
  NutritionSearchResponse,
  NutritionFoodItem,
  RecipeRecommendation,
  RecipeRecommendationsResponse,
} from '../../src/types';
import { isNonPremiumTier } from '../../src/lib/planAiPremiumGate';
import {
  showImagineRecipeIaPremiumLock,
  showRecipeFromPhotoIaPremiumLock,
} from '../../src/lib/nutriCoachQuotaAlert';
import { finiteNumber, parseJsonRouteParam } from '../../src/lib/routeParamJson';

const FOOD_ICONS = [
  { emoji: '🍲', label: 'Guiso' },
  { emoji: '🥗', label: 'Ensalada' },
  { emoji: '🍝', label: 'Pasta' },
  { emoji: '🍛', label: 'Curry' },
  { emoji: '🥘', label: 'Cazuela' },
  { emoji: '🍜', label: 'Sopa' },
  { emoji: '🌮', label: 'Taco' },
  { emoji: '🍕', label: 'Pizza' },
  { emoji: '🥪', label: 'Sándwich' },
  { emoji: '🍔', label: 'Burger' },
  { emoji: '🥙', label: 'Wrap' },
  { emoji: '🍳', label: 'Huevos' },
  { emoji: '🥞', label: 'Tortitas' },
  { emoji: '🍚', label: 'Arroz' },
  { emoji: '🐟', label: 'Pescado' },
  { emoji: '🍗', label: 'Pollo' },
  { emoji: '🥩', label: 'Carne' },
  { emoji: '🧁', label: 'Dulce' },
  { emoji: '🍰', label: 'Tarta' },
  { emoji: '🥤', label: 'Batido' },
];

type IngredientLine = {
  key: string;
  custom_name: string;
  food_catalog_id?: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  per100?: { kcal: number; protein: number; carbs: number; fat: number };
};

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function truncateText(value: string | null | undefined, max: number) {
  const trimmed = (value ?? '').trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

type RecipePrefillParam = {
  name?: unknown;
  icon?: unknown;
  ingredients?: unknown;
};

function recipePrefillFromParam(value: unknown) {
  const data = parseJsonRouteParam<RecipePrefillParam>(value, 24_000);
  if (!data || typeof data !== 'object') return null;
  const ingredients = Array.isArray(data.ingredients) ? data.ingredients.slice(0, 80) : [];
  return {
    name: typeof data.name === 'string' ? truncateText(data.name, 200) : '',
    icon: typeof data.icon === 'string' ? truncateText(data.icon, 32) : '',
    ingredients: ingredients
      .filter((ing): ing is Record<string, unknown> => Boolean(ing) && typeof ing === 'object')
      .map((ing) => ({
        custom_name: typeof ing.custom_name === 'string' ? truncateText(ing.custom_name, 200) : '',
        food_catalog_id: typeof ing.food_catalog_id === 'string' ? ing.food_catalog_id : undefined,
        grams: finiteNumber(ing.grams, 0, 0, 5000),
        kcal: finiteNumber(ing.kcal, 0, 0, 20000),
        protein_g: finiteNumber(ing.protein_g, 0, 0, 2000),
        carbs_g: finiteNumber(ing.carbs_g, 0, 0, 2000),
        fat_g: finiteNumber(ing.fat_g, 0, 0, 2000),
      }))
      .filter((ing) => ing.custom_name.length > 0),
  };
}

export default function CreateRecipeScreen() {
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    meal_type?: string;
    date?: string;
    edit_id?: string;
    prefill?: string;
  }>();

  const isEdit = !!params.edit_id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [servingsStr, setServingsStr] = useState('1');
  const [icon, setIcon] = useState('🍲');
  const [ingredients, setIngredients] = useState<IngredientLine[]>([]);
  const [loaded, setLoaded] = useState(!isEdit);

  // --- Search bottom sheet ---
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NutritionFoodItem[]>([]);
  const [selectedFood, setSelectedFood] = useState<NutritionFoodItem | null>(null);
  const [gramsInput, setGramsInput] = useState('100');
  /** Texto con el que se ejecutó la última búsqueda (para “Sin resultados” vs “Pulsa buscar” en web). */
  const lastSubmittedSearchRef = useRef('');

  // --- Imagine recipe with AI ---
  const [imagineVisible, setImagineVisible] = useState(false);
  const [imaginePrompt, setImaginePrompt] = useState('');

  // --- Load recipe for editing ---
  useQuery({
    queryKey: ['recipe', params.edit_id],
    queryFn: async () => {
      const recipe: Recipe = await api.get(`/api/v1/meals/recipes/${params.edit_id}`);
      setName(recipe.name);
      setDescription(recipe.description ?? '');
      setServingsStr(String(recipe.servings));
      setIcon(recipe.icon ?? '🍲');
      setIngredients(
        recipe.items.map((it) => ({
          key: newKey(),
          custom_name: it.custom_name ?? '',
          food_catalog_id: it.food_catalog_id,
          grams: it.grams,
          kcal: it.kcal,
          protein_g: it.protein_g,
          carbs_g: it.carbs_g,
          fat_g: it.fat_g,
        })),
      );
      setLoaded(true);
      return recipe;
    },
    enabled: isEdit,
  });

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/api/v1/me/profile'),
    retry: 1,
  });
  const isFreeUser = isNonPremiumTier(profile?.subscription_tier);

  // --- Prefill from photo analysis ---
  const prefillHandledRef = useRef(false);
  useEffect(() => {
    if (!params.prefill || prefillHandledRef.current || isEdit) return;
    prefillHandledRef.current = true;
    const data = recipePrefillFromParam(params.prefill);
    if (!data) {
      return;
    }
    if (data.name) setName(data.name);
    if (data.icon) setIcon(data.icon);
    if (data.ingredients.length) {
      setIngredients(
        data.ingredients.map((ing) => ({
          key: newKey(),
          custom_name: ing.custom_name,
          food_catalog_id: ing.food_catalog_id,
          grams: ing.grams,
          kcal: ing.kcal,
          protein_g: ing.protein_g,
          carbs_g: ing.carbs_g,
          fat_g: ing.fat_g,
        })),
      );
    }
    setServingsStr('1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.prefill]);

  const servings = Math.max(1, parseInt(servingsStr, 10) || 1);

  const totals = useMemo(() => {
    const t = { weight: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 };
    for (const i of ingredients) {
      t.weight += i.grams;
      t.kcal += i.kcal;
      t.protein += i.protein_g;
      t.carbs += i.carbs_g;
      t.fat += i.fat_g;
    }
    return t;
  }, [ingredients]);

  const perServing = useMemo(() => ({
    kcal: roundMacroG(totals.kcal / servings),
    protein: roundMacroG(totals.protein / servings),
    carbs: roundMacroG(totals.carbs / servings),
    fat: roundMacroG(totals.fat / servings),
  }), [totals, servings]);

  const buildBody = useCallback(() => ({
    name: truncateText(name, 200),
    description: truncateText(description, 2000) || null,
    servings,
    icon: truncateText(icon, 32) || null,
    items: ingredients.map((i) => ({
      food_catalog_id: i.food_catalog_id ?? null,
      custom_name: truncateText(i.custom_name, 200),
      grams: i.grams,
      kcal: i.kcal,
      protein_g: i.protein_g,
      carbs_g: i.carbs_g,
      fat_g: i.fat_g,
    })),
  }), [name, description, servings, icon, ingredients]);

  /** En web o sin historial, `router.back()` no tiene destino (GO_BACK no manejado). */
  const exitCreateRecipe = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({
      pathname: '/add-meal/recipes',
      params: {
        meal_type: params.meal_type,
        date: params.date,
      },
    });
  }, [params.meal_type, params.date]);

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/v1/meals/recipes', buildBody()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      exitCreateRecipe();
    },
    onError: (e: unknown) =>
      Alert.alert('No se pudo crear', toUserFacingErrorMessage(e, 'No se pudo crear la receta')),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/api/v1/meals/recipes/${params.edit_id}`, buildBody()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipe', params.edit_id] });
      exitCreateRecipe();
    },
    onError: (e: unknown) =>
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'No se pudo actualizar la receta')),
  });

  const searchMutation = useMutation({
    mutationFn: async (q: string) => {
      const res: NutritionSearchResponse = await api.get(
        `/api/v1/nutrition/search?q=${encodeURIComponent(q)}`,
      );
      return res.results;
    },
    onSuccess: (data, q) => {
      lastSubmittedSearchRef.current = q.trim();
      setSearchResults(data);
    },
  });

  const applyImaginedRecipe = useCallback((recipe: RecipeRecommendation) => {
    setName(recipe.name);
    setDescription(
      [
        recipe.description?.trim(),
        recipe.instructions?.length
          ? `Preparación:\n${recipe.instructions.map((step, idx) => `${idx + 1}. ${step}`).join('\n')}`
          : undefined,
      ].filter(Boolean).join('\n\n'),
    );
    setServingsStr(String(Math.max(1, recipe.servings || 1)));
    if (recipe.icon) setIcon(recipe.icon);
    setIngredients(
      recipe.items.map((it) => ({
        key: newKey(),
        custom_name: it.name,
        grams: roundMacroG(it.grams),
        kcal: roundMacroG(it.kcal),
        protein_g: roundMacroG(it.protein_g),
        carbs_g: roundMacroG(it.carbs_g),
        fat_g: roundMacroG(it.fat_g),
      })),
    );
    setImagineVisible(false);
    setImaginePrompt('');
  }, []);

  const imagineMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await api.post<RecipeRecommendationsResponse>(
        '/api/v1/meals/recipes/recommendations',
        { count: 1, additional_request: prompt },
        { timeoutMs: PLAN_API_TIMEOUT_MS },
      );
      return res.recommendations[0];
    },
    onSuccess: (recipe) => {
      if (!recipe) {
        Alert.alert('Sin receta', 'La IA no pudo generar una receta válida. Prueba con otra descripción.');
        return;
      }
      applyImaginedRecipe(recipe);
    },
    onError: (e: unknown) =>
      Alert.alert(
        'IA no disponible',
        toUserFacingErrorMessage(e, 'No se pudo imaginar la receta. Inténtalo de nuevo.'),
      ),
  });

  const saving = createMutation.isPending || updateMutation.isPending;
  const canSave = name.trim().length > 0 && ingredients.length > 0;

  const onSave = () => {
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  const removeIngredient = (key: string) => {
    setIngredients((prev) => prev.filter((i) => i.key !== key));
  };

  const navigateToPhotoRecipe = () => {
    if (isFreeUser) {
      showRecipeFromPhotoIaPremiumLock();
      return;
    }
    router.push({
      pathname: '/add-meal/recipe-from-photo' as any,
      params: { meal_type: params.meal_type, date: params.date },
    });
  };

  const openImagineRecipe = () => {
    if (isFreeUser) {
      showImagineRecipeIaPremiumLock();
      return;
    }
    imagineMutation.reset();
    setImagineVisible(true);
  };

  const submitImagineRecipe = () => {
    const prompt = imaginePrompt.trim();
    if (prompt.length < 8) {
      Alert.alert('Descripción breve', 'Describe un poco más la receta que quieres imaginar.');
      return;
    }

    const run = () => imagineMutation.mutate(prompt);
    if (name.trim() || ingredients.length > 0 || description.trim()) {
      Alert.alert(
        'Reemplazar receta actual',
        'La receta imaginada sustituirá el nombre, descripción e ingredientes actuales.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Imaginar', onPress: run },
        ],
      );
      return;
    }
    run();
  };

  const openSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedFood(null);
    setGramsInput('100');
    lastSubmittedSearchRef.current = '';
    searchMutation.reset();
    setSearchVisible(true);
  };

  const selectFood = (food: NutritionFoodItem) => {
    setSelectedFood(food);
    const servG = food.serving?.grams;
    setGramsInput(servG ? String(Math.round(servG)) : '100');
  };

  const confirmIngredient = () => {
    if (!selectedFood) return;
    const g = parseFloat(gramsInput.replace(',', '.')) || 100;
    const p100 = selectedFood.per_100g;
    const factor = g / 100;
    const line: IngredientLine = {
      key: newKey(),
      custom_name: selectedFood.name,
      food_catalog_id: selectedFood.id,
      grams: g,
      kcal: roundMacroG((p100?.calories ?? 0) * factor),
      protein_g: roundMacroG((p100?.protein ?? 0) * factor),
      carbs_g: roundMacroG((p100?.carbs ?? 0) * factor),
      fat_g: roundMacroG((p100?.fat ?? 0) * factor),
    };
    setIngredients((prev) => [...prev, line]);
    setSelectedFood(null);
    setSearchVisible(false);
  };

  if (!loaded) {
    return (
      <View style={[st.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={st.root}>
      <KeyboardAvoidingView
        style={st.kavFill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={st.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={st.topBar}>
            <TouchableOpacity
              onPress={exitCreateRecipe}
              style={st.backButton}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Volver"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={st.topTitleWrap}>
              <Text style={st.eyebrow}>Recetario</Text>
              <Text style={st.title}>{isEdit ? 'Editar receta' : 'Nueva receta'}</Text>
            </View>
            <View style={st.topRightSpacer} />
          </View>

          <Surface variant="subtle" style={st.heroCard} padding="md">
            <View style={[st.heroGlow, { pointerEvents: 'none' }]} />
            <View style={st.heroHeader}>
              <View style={st.heroIconWrap}>
                <Text style={st.heroIcon}>{icon}</Text>
              </View>
              <View style={st.heroCopy}>
                <Text style={st.heroKicker}>{ingredients.length} ingredientes</Text>
                <Text style={st.heroName} numberOfLines={2}>
                  {name.trim() || 'Ponle nombre a tu receta'}
                </Text>
                <Text style={st.heroMeta} numberOfLines={1}>
                  {servings} {servings === 1 ? 'porción' : 'porciones'} · {Math.round(perServing.kcal || 0)} kcal/porción
                </Text>
              </View>
              <View style={st.kcalBadge}>
                <Text style={st.kcalBadgeValue}>{Math.round(totals.kcal || 0)}</Text>
                <Text style={st.kcalBadgeLabel}>kcal</Text>
              </View>
            </View>

            <Text style={st.heroIconLabel}>Elige un estilo</Text>
            <FlatList
              horizontal
              data={FOOD_ICONS}
              keyExtractor={(item) => item.emoji}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.iconList}
              renderItem={({ item }) => {
                const selected = icon === item.emoji;
                return (
                  <TouchableOpacity
                    style={[st.iconBtn, selected && st.iconBtnSelected]}
                    onPress={() => setIcon(item.emoji)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`Icono ${item.label}`}
                  >
                    <Text style={st.iconEmoji}>{item.emoji}</Text>
                    {selected && <View style={st.iconSelectedDot} />}
                  </TouchableOpacity>
                );
              }}
            />
          </Surface>

          <View style={st.sectionCard}>
            <SectionTitle
              icon="create-outline"
              title="Detalles"
              subtitle="Nombre, notas y raciones de la preparación"
            />
            <Input
              label="Nombre de la receta"
              value={name}
              onChangeText={setName}
              placeholder="Ej: Pollo al curry con arroz"
              maxLength={200}
            />

            <Input
              label="Descripción (opcional)"
              value={description}
              onChangeText={setDescription}
              placeholder="Notas, instrucciones breves..."
              maxLength={500}
              multiline
              numberOfLines={2}
            />

            <View style={st.servingsBlock}>
              <View style={st.servingsCopy}>
                <Text style={st.servingsLabel}>Porciones</Text>
                <Text style={st.servingsHint}>Divide los macros automáticamente</Text>
              </View>
              <View style={st.servingsControl}>
                <TouchableOpacity
                  onPress={() => setServingsStr(String(Math.max(1, servings - 1)))}
                  style={st.servingsStep}
                  activeOpacity={0.8}
                >
                  <Ionicons name="remove" size={18} color={colors.text} />
                </TouchableOpacity>
                <TextInput
                  style={st.servingsInput}
                  value={servingsStr}
                  onChangeText={setServingsStr}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <TouchableOpacity
                  onPress={() => setServingsStr(String(servings + 1))}
                  style={st.servingsStep}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={[st.sectionCard, st.ingredientsSectionCard]}>
            <Text style={st.countPillCorner} accessibilityLabel={`${ingredients.length} ingredientes`}>
              {ingredients.length}
            </Text>
            <View style={st.ingredientsTitleWrap}>
              <SectionTitle
                icon="basket-outline"
                title="Ingredientes"
                subtitle="Construye la receta desde la base de alimentos"
              />
            </View>

            <View style={st.addMethodGrid}>
              <AddMethodButton
                icon="camera"
                title="Desde foto"
                subtitle="IA visual"
                onPress={navigateToPhotoRecipe}
              />
              <AddMethodButton
                icon="search"
                title="Buscar alimento"
                subtitle="Base nutricional"
                onPress={openSearch}
              />
              <AddMethodButton
                icon="sparkles"
                title="Imaginar con IA"
                subtitle="Desde descripción"
                onPress={openImagineRecipe}
              />
            </View>

            {ingredients.length === 0 ? (
              <View style={st.emptyIngredients}>
                <View style={st.emptyIconBubble}>
                  <Ionicons name="restaurant-outline" size={30} color={colors.primary} />
                </View>
                <Text style={st.emptyTitle}>Tu receta aún está vacía</Text>
                <Text style={st.emptyText}>
                  Añade ingredientes manualmente o usa una foto para completar los macros.
                </Text>
              </View>
            ) : (
              <View style={st.ingredientsListWrap}>
                {ingredients.map((ing, idx) => (
                  <View key={ing.key} style={st.ingredientCard}>
                    <View style={st.ingredientIndex}>
                      <Text style={st.ingredientIndexText}>{idx + 1}</Text>
                    </View>
                    <View style={st.ingredientInfo}>
                      <Text style={st.ingredientName} numberOfLines={1}>
                        {mealItemDisplayLineForUi(ing.custom_name || 'Alimento')}
                      </Text>
                      <Text style={st.ingredientDetail} numberOfLines={1}>
                        {roundMacroG(ing.grams)} g · P {roundMacroG(ing.protein_g)}g · C {roundMacroG(ing.carbs_g)}g · G {roundMacroG(ing.fat_g)}g
                      </Text>
                    </View>
                    <View style={st.ingredientRight}>
                      <Text style={st.ingredientKcal}>{Math.round(ing.kcal)}</Text>
                      <Text style={st.ingredientKcalLabel}>kcal</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeIngredient(ing.key)}
                      hitSlop={12}
                      style={st.removeBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Eliminar ingrediente"
                    >
                      <Ionicons name="close" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {ingredients.length > 0 && (
            <Surface variant="subtle" style={st.summaryCard} padding="md">
              <View style={st.summaryTopRow}>
                <View>
                  <Text style={st.summaryOverline}>Resumen nutricional</Text>
                  <Text style={st.summaryTitle}>Por porción</Text>
                </View>
                <View style={st.summaryKcalChip}>
                  <Text style={st.summaryKcalValue}>{perServing.kcal}</Text>
                  <Text style={st.summaryKcalLabel}>kcal</Text>
                </View>
              </View>

              <View style={st.statGrid}>
                <StatCard label="Peso total" value={Math.round(totals.weight)} unit="g" icon="scale-outline" />
                <StatCard label="Total receta" value={Math.round(totals.kcal)} unit="kcal" icon="flame-outline" />
              </View>

              <View style={st.macroSummaryRow}>
                <MacroPill label="Proteína" value={perServing.protein} color={colors.protein} />
                <MacroPill label="Carbos" value={perServing.carbs} color={colors.carbs} />
                <MacroPill label="Grasa" value={perServing.fat} color={colors.fat} />
              </View>
            </Surface>
          )}

          <View style={[actionIntentStyles.row, st.actions]}>
            <Button variant="actionCancel" title="Cancelar" onPress={exitCreateRecipe} />
            <Button
              variant="actionConfirm"
              title={isEdit ? 'Guardar cambios' : 'Guardar receta'}
              onPress={onSave}
              disabled={!canSave || saving}
              loading={saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fuera del KAV: en iOS el Modal + teclado dentro de KeyboardAvoidingView deja el panel aplastado o bajo capas de blur. */}
      <BottomSheet
        visible={searchVisible}
        onDismiss={() => setSearchVisible(false)}
        expandToMaxHeight
        maxHeightFraction={0.85}
      >
        <View style={st.sheetContent}>
          {!selectedFood ? (
            <View style={st.sheetSearchColumn}>
              <Text style={st.sheetTitle}>Buscar ingrediente</Text>
              <View style={st.searchBar}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  style={st.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Buscar alimento..."
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="search"
                  onSubmitEditing={() => {
                    if (searchQuery.trim().length > 1) searchMutation.mutate(searchQuery.trim());
                  }}
                  autoFocus
                />
                {searchMutation.isPending && (
                  <ActivityIndicator size="small" color={colors.primary} />
                )}
              </View>
              <ScrollView
                style={st.resultsList}
                contentContainerStyle={st.resultsListContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {searchResults.map((food, idx) => (
                  <TouchableOpacity
                    key={food.id ?? `sr-${idx}`}
                    style={st.resultRow}
                    activeOpacity={0.85}
                    onPress={() => selectFood(food)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={st.resultName} numberOfLines={1}>{food.name}</Text>
                      <Text style={st.resultMeta}>
                        {food.per_100g?.calories ?? '?'} kcal/100g
                        {food.brand ? ` · ${food.brand}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                  </TouchableOpacity>
                ))}
                {searchResults.length === 0 && !searchMutation.isPending && searchQuery.trim().length < 2 && (
                  <Text style={st.searchHint}>
                    Escribe al menos 2 caracteres y pulsa buscar en el teclado.
                  </Text>
                )}
                {searchResults.length === 0 && !searchMutation.isPending && searchQuery.trim().length > 1 && searchQuery.trim() === lastSubmittedSearchRef.current && (
                  <Text style={st.noResults}>Sin resultados</Text>
                )}
                {searchResults.length === 0 && !searchMutation.isPending && searchQuery.trim().length > 1 && searchQuery.trim() !== lastSubmittedSearchRef.current && (
                  <Text style={st.searchHint}>
                    Pulsa buscar en el teclado para ver resultados.
                  </Text>
                )}
              </ScrollView>
            </View>
          ) : (
            <>
              <Text style={st.sheetTitle}>Añadir ingrediente</Text>
              <Surface variant="subtle" style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }} padding="md">
                <Text style={st.selectedName}>{selectedFood.name}</Text>
                <Text style={st.selectedMeta}>
                  {selectedFood.per_100g?.calories ?? '?'} kcal · P:{selectedFood.per_100g?.protein ?? 0} C:{selectedFood.per_100g?.carbs ?? 0} G:{selectedFood.per_100g?.fat ?? 0} /100g
                </Text>
              </Surface>
              <View style={st.gramsRow}>
                <Text style={st.gramsLabel}>Gramos:</Text>
                <TextInput
                  style={st.gramsInput}
                  value={gramsInput}
                  onChangeText={setGramsInput}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  autoFocus
                />
                <Text style={st.gramsUnit}>g</Text>
              </View>
              <View style={[actionIntentStyles.row, st.sheetActions]}>
                <Button
                  variant="actionCancel"
                  title="Volver"
                  onPress={() => setSelectedFood(null)}
                  showCloseIcon={false}
                />
                <Button
                  variant="actionConfirm"
                  title="Añadir ingrediente"
                  onPress={confirmIngredient}
                  disabled={!gramsInput || parseFloat(gramsInput) <= 0}
                />
              </View>
            </>
          )}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={imagineVisible}
        onDismiss={() => {
          if (!imagineMutation.isPending) setImagineVisible(false);
        }}
        maxHeightFraction={0.72}
      >
        <View style={st.imagineSheet}>
          <View style={st.imagineHero}>
            <View style={st.imagineIconBubble}>
              <Ionicons name="sparkles" size={24} color={colors.white} />
            </View>
            <Text style={st.sheetTitle}>Imaginar receta con IA</Text>
            <Text style={st.imagineSubtitle}>
              Describe qué te apetece, ingredientes, objetivo o estilo. Nutria creará una receta editable con macros aproximados.
            </Text>
          </View>

          <TextInput
            style={st.imagineInput}
            value={imaginePrompt}
            onChangeText={setImaginePrompt}
            placeholder="Ej: cena alta en proteína con pollo, arroz, curry suave y verduras, para 2 porciones"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={5}
            maxLength={500}
            textAlignVertical="top"
            editable={!imagineMutation.isPending}
            autoFocus
          />
          <Text style={st.imagineHint}>
            {Math.max(0, 500 - imaginePrompt.length)} caracteres restantes
          </Text>

          <View style={[actionIntentStyles.row, st.sheetActions]}>
            <Button
              variant="actionCancel"
              title="Cancelar"
              onPress={() => setImagineVisible(false)}
              disabled={imagineMutation.isPending}
            />
            <Button
              variant="actionConfirm"
              title={imagineMutation.isPending ? 'Imaginando receta...' : 'Imaginar receta'}
              onPress={submitImagineRecipe}
              disabled={imaginePrompt.trim().length < 8 || imagineMutation.isPending}
              loading={imagineMutation.isPending}
            />
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}


function SectionTitle({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) {
  return (
    <View style={st.sectionTitleRow}>
      <View style={st.sectionIconBubble}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.sectionTitle}>{title}</Text>
        <Text style={st.sectionSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function AddMethodButton({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={st.addMethodButton} onPress={onPress} activeOpacity={0.85}>
      <View style={st.addMethodIcon}>
        <Ionicons name={icon} size={20} color={colors.white} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.addMethodTitle} numberOfLines={1}>{title}</Text>
        <Text style={st.addMethodSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function StatCard({ label, value, unit, icon }: { label: string; value: number; unit: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={st.statCard}>
      <Ionicons name={icon} size={16} color={colors.primaryLight} />
      <Text style={st.statLabel}>{label}</Text>
      <View style={st.statValueRow}>
        <Text style={st.statValue}>{value}</Text>
        <Text style={st.statUnit}>{unit}</Text>
      </View>
    </View>
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
  kavFill: { flex: 1 },
  content: {
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.lg,
    paddingBottom: 120,
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitleWrap: { alignItems: 'center', flex: 1 },
  topRightSpacer: { width: 42 },
  eyebrow: {
    ...typography.captionBold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: { ...typography.h2, color: colors.text, marginTop: 2 },

  heroCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceFloating,
  },
  heroGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -58,
    top: -70,
    backgroundColor: colors.primaryGlowStrong,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 26,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: { fontSize: 38, lineHeight: 46 },
  heroCopy: { flex: 1, minWidth: 0 },
  heroKicker: { ...typography.captionBold, color: colors.primaryLight, marginBottom: 2 },
  heroName: { ...typography.h3, color: colors.text },
  heroMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
  kcalBadge: {
    minWidth: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceGlassStrong,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
  },
  kcalBadgeValue: { fontSize: 18, fontWeight: '800', color: colors.text, lineHeight: 22 },
  kcalBadgeLabel: { ...typography.caption, color: colors.textMuted, fontSize: 10 },
  heroIconLabel: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  iconList: { gap: 10, paddingVertical: spacing.xs, paddingRight: spacing.md },
  iconBtn: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
    transform: [{ translateY: -2 }],
  },
  iconEmoji: { fontSize: 25 },
  iconSelectedDot: {
    position: 'absolute',
    bottom: 5,
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
  },

  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionIconBubble: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { ...typography.bodyBold, color: colors.text },
  sectionSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },

  servingsBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  servingsCopy: { flex: 1, minWidth: 0 },
  servingsLabel: { ...typography.bodyBold, color: colors.text },
  servingsHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  servingsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: borderRadius.full,
    padding: 4,
  },
  servingsStep: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servingsInput: {
    width: 42,
    textAlign: 'center',
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    paddingVertical: 0,
  },

  ingredientsSectionCard: {
    position: 'relative',
    overflow: 'hidden',
  },
  ingredientsTitleWrap: {
    paddingRight: 44,
  },
  countPillCorner: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 1,
    ...typography.captionBold,
    color: colors.primaryLight,
    minWidth: 30,
    textAlign: 'center',
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    overflow: 'hidden',
  },
  addMethodGrid: { gap: spacing.sm },
  addMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addMethodIcon: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMethodTitle: { ...typography.bodyBold, color: colors.text },
  addMethodSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 1 },

  emptyIngredients: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryGlowSoft,
  },
  emptyIconBubble: {
    width: 58,
    height: 58,
    borderRadius: 24,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...typography.bodyBold, color: colors.text, textAlign: 'center' },
  emptyText: { ...typography.body, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.xs },
  ingredientsListWrap: { gap: spacing.sm },
  ingredientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ingredientIndex: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingredientIndexText: { ...typography.captionBold, color: colors.textSecondary },
  ingredientInfo: { flex: 1, minWidth: 0 },
  ingredientName: { ...typography.bodyBold, color: colors.text },
  ingredientDetail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  ingredientRight: { alignItems: 'flex-end', minWidth: 48 },
  ingredientKcal: { fontSize: 15, fontWeight: '800', color: colors.text },
  ingredientKcalLabel: { ...typography.caption, color: colors.textMuted, fontSize: 10 },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.errorMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceFloating,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  summaryOverline: { ...typography.captionBold, color: colors.primary, textTransform: 'uppercase' },
  summaryTitle: { ...typography.h3, color: colors.text, marginTop: 2 },
  summaryKcalChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
  },
  summaryKcalValue: { fontSize: 24, fontWeight: '900', color: colors.text, lineHeight: 28 },
  summaryKcalLabel: { ...typography.caption, color: colors.primaryLight },
  statGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  statUnit: { ...typography.caption, color: colors.textMuted },
  macroSummaryRow: { flexDirection: 'row', gap: spacing.sm },
  macroPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
  },
  macroPillLabel: { ...typography.captionBold, fontSize: 11, marginBottom: 3 },
  macroPillValue: { ...typography.bodyBold, color: colors.text, fontSize: 13 },
  actions: { marginTop: spacing.xs, width: '100%' },

  // Bottom sheet
  sheetContent: { flex: 1, minHeight: 0 },
  sheetSearchColumn: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  },
  sheetTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 48,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  resultsList: { flex: 1, minHeight: 0, paddingHorizontal: spacing.lg },
  resultsListContent: { flexGrow: 1, paddingBottom: spacing.xl },
  searchHint: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  resultName: { ...typography.bodyBold, color: colors.text },
  resultMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  noResults: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },

  selectedName: { ...typography.bodyBold, color: colors.text },
  selectedMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  gramsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  gramsLabel: { ...typography.body, color: colors.text },
  gramsInput: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  gramsUnit: { ...typography.body, color: colors.textMuted },
  imagineScroll: { flex: 1, minHeight: 0 },
  imagineSheet: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  imagineHero: { alignItems: 'center', marginBottom: spacing.md },
  imagineIconBubble: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  imagineSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  imagineInput: {
    minHeight: 112,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: spacing.xs,
  },
  imagineHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'right',
    marginBottom: spacing.md,
  },
  sheetActions: { paddingHorizontal: spacing.lg, width: '100%' },
});
