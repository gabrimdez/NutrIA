import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { Button, TideGradientFrame, PressableScale, ScreenFocusProvider, SlideUpView, MealTypePickerSheet } from '../../src/components';
import { AnimatedFavoriteButton } from '../../src/components/ui/AnimatedFavoriteButton';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  screenPaddingX,
  hairlineWidth,
  DOCK_H,
  DOCK_MARGIN_BOTTOM,
  actionIntentStyles,
} from '../../src/theme';
import { FoodItem, MealItem, MealEntry, DayDiary, NutritionSearchResponse, PhotoAnalysis, SavedMeal, CustomFood, Profile } from '../../src/types';
import {
  kcalFromMacros,
  macrosFromPer100g,
  Per100g,
  roundMacroG,
} from '../../src/lib/mealItemMath';
import { invalidateMealRelatedQueries } from '../../src/lib/mealQueryInvalidation';
import {
  parseMealTypeParam,
  mealTypeLabel,
  MEAL_TYPES_ORDER,
  mealItemVisualIconForLookupName,
  mealItemCustomNameWithLeadingIcon,
  capitalizeFirstChar,
  mealItemDisplayLineForUi,
  stripLeadingMealIconFromTitle,
  mealPreviewPrimaryFoodLabels,
  type MealTypeOrderKey,
  type MealItemVisualIcon,
} from '../../src/lib/mealDisplay';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { MacroSummarySection } from '../../src/components/ui/MacroSummaryPreview';
import { FoodPreviewHero } from '../../src/components/ui/FoodPreviewHero';
import { MealItemIconMedia } from '../../src/components/ui/MealItemIconMedia';
import { parseLocalYmd, resolvedDiaryYmd, toLocalYmd } from '../../src/lib/diaryDate';
import { type FoodUnit, toGrams, fromGrams, availableUnitsForFood } from '../../src/lib/foodUnits';
import { UnitPicker } from '../../src/components';
import { mapNutritionFoodToFoodItem } from '../../src/lib/foodSearchShared';
import { useSearchSectionStore, type SearchSection } from '../../src/store/searchSectionStore';
import { isNonPremiumTier } from '../../src/lib/planAiPremiumGate';
import {
  isNutriCoachDailyLimitErrorMessage,
  isNutriCoachTurnLimitErrorMessage,
  showParseTextPremiumLock,
} from '../../src/lib/nutriCoachQuotaAlert';

/* ─── helpers ─────────────────────────────────── */

function searchErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Algo salió mal. Inténtalo de nuevo.';
}

type TabKey = 'database' | 'favorites' | 'created';

type FoodPreviewSheet =
  | { mode: 'diary_food'; mealItem: MealItem }
  | { mode: 'diary_meal'; meal: MealEntry }
  | { mode: 'saved_meal'; saved: SavedMeal }
  | { mode: 'catalog'; food: FoodItem };

const FOOD_EMOJI: Record<string, string> = {
  leche: '\uD83E\uDD5B',
  patata: '\uD83E\uDD54',
  yogur: '\uD83E\uDED8',
  pechuga: '\uD83C\uDF57',
  pollo: '\uD83C\uDF57',
  arroz: '\uD83C\uDF5A',
  pan: '\uD83C\uDF5E',
  huevo: '\uD83E\uDD5A',
  manzana: '\uD83C\uDF4E',
  plátano: '\uD83C\uDF4C',
  banana: '\uD83C\uDF4C',
  ensalada: '\uD83E\uDD57',
  pasta: '\uD83C\uDF5D',
  carne: '\uD83E\uDD69',
  pescado: '\uD83D\uDC1F',
  salmón: '\uD83E\uDE7B',
  atún: '\uD83D\uDC1F',
  queso: '\uD83E\uDDC0',
  fruta: '\uD83C\uDF53',
  fresa: '\uD83C\uDF53',
  tomate: '\uD83C\uDF45',
  aguacate: '\uD83E\uDD51',
  default: '\uD83C\uDF7D\uFE0F',
};

function foodRowVisual(name: string): MealItemVisualIcon {
  const v = mealItemVisualIconForLookupName(name);
  if (v.kind === 'image') return v;
  if (v.kind === 'emoji' && v.emoji !== '🍽️') return v;
  const lower = name.toLowerCase();
  for (const [keyword, emoji] of Object.entries(FOOD_EMOJI)) {
    if (keyword !== 'default' && lower.includes(keyword)) return { kind: 'emoji', emoji };
  }
  return { kind: 'emoji', emoji: FOOD_EMOJI.default };
}

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  dinner: 'Cena',
  snack: 'Snack',
};

function formatServingDisplay(food: FoodItem): string {
  if (food.serving_size_g) {
    return `1 ración (${food.serving_size_g} g)`;
  }
  return '100 g';
}

function lineMealItemFromDiaryItem(si: MealItem): MealItem {
  const grams = Math.max(0, Math.round(si.grams));
  const p = roundMacroG(si.protein_g);
  const c = roundMacroG(si.carbs_g);
  const f = roundMacroG(si.fat_g);
  return {
    ...(si.food_catalog_id ? { food_catalog_id: si.food_catalog_id } : {}),
    custom_name: si.custom_name ?? 'Alimento',
    grams,
    kcal: kcalFromMacros(p, c, f),
    protein_g: p,
    carbs_g: c,
    fat_g: f,
  };
}

/* ─── component ───────────────────────────────── */

export default function SearchMealScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = DOCK_H + Math.max(insets.bottom, DOCK_MARGIN_BOTTOM);

  const queryClient = useQueryClient();
  const { meal_type: mealTypeParam, date: dateParam, section: sectionParam } = useLocalSearchParams<{
    meal_type?: string;
    date?: string;
    section?: string;
  }>();
  const diaryDateStr = useMemo(() => resolvedDiaryYmd(dateParam), [dateParam]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [mealType, setMealType] = useState<MealTypeOrderKey>(() => parseMealTypeParam(mealTypeParam));
  const [activeTab, setActiveTab] = useState<TabKey>('database');
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const optionsBtnRef = useRef<View>(null);
  const { width: windowWidth } = useWindowDimensions();
  const MENU_WIDTH = 232;

  const setLastSection = useSearchSectionStore((s) => s.setLastSection);
  const [activeAction, setActiveAction] = useState<SearchSection>(() => {
    const valid: SearchSection[] = ['search', 'recipes', 'list', 'scanner', 'voice'];
    if (sectionParam && valid.includes(sectionParam as SearchSection)) {
      return sectionParam as SearchSection;
    }
    return 'search';
  });

  useEffect(() => {
    setLastSection(activeAction);
    if (activeAction === 'scanner') {
      router.push(
        `/scanner?meal_type=${encodeURIComponent(mealType)}&date=${encodeURIComponent(diaryDateStr)}` as never,
      );
    }
  }, []);

  const openOptionsMenu = useCallback(() => {
    optionsBtnRef.current?.measureInWindow((x, _y, btnW, btnH) => {
      const top = _y + btnH + 6;
      let left = x + btnW - MENU_WIDTH;
      if (left < screenPaddingX) left = screenPaddingX;
      if (left + MENU_WIDTH > windowWidth - screenPaddingX) {
        left = windowWidth - screenPaddingX - MENU_WIDTH;
      }
      setMenuAnchor({ top, left });
      setOptionsMenuVisible(true);
    });
  }, [windowWidth]);

  React.useEffect(() => {
    setMealType(parseMealTypeParam(mealTypeParam));
  }, [mealTypeParam]);
  const [hasSearched, setHasSearched] = useState(false);

  const [previewGrams, setPreviewGrams] = useState('100');
  const [previewUnit, setPreviewUnit] = useState<FoodUnit>('g');
  const [previewServingSizeG, setPreviewServingSizeG] = useState<number | undefined>(undefined);
  const [previewPer100, setPreviewPer100] = useState<Per100g | undefined>(undefined);
  const [previewMealItem, setPreviewMealItem] = useState<MealItem | null>(null);

  const [showTextFree, setShowTextFree] = useState(false);
  const [textFreeInput, setTextFreeInput] = useState('');
  const aiBodyMeasured = useSharedValue(0);
  const aiProgress = useSharedValue(0);
  useEffect(() => {
    aiProgress.value = withTiming(showTextFree ? 1 : 0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [showTextFree, aiProgress]);
  const aiBodyStyle = useAnimatedStyle(() => ({
    height: aiBodyMeasured.value * aiProgress.value,
    opacity: aiProgress.value,
  }));
  const aiChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(aiProgress.value, [0, 1], [0, 180])}deg` }],
  }));

  const [showMealPicker, setShowMealPicker] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<MealTypeOrderKey>(mealType);
  const [foodPreview, setFoodPreview] = useState<FoodPreviewSheet | null>(null);
  const [previewItems, setPreviewItems] = useState<MealItem[]>([]);
  const [customFoodMenu, setCustomFoodMenu] = useState<CustomFood | null>(null);
  const foodPreviewRef = useRef(foodPreview);
  useEffect(() => {
    foodPreviewRef.current = foodPreview;
  }, [foodPreview]);

  useEffect(() => {
    if (foodPreview?.mode === 'diary_meal') {
      setPreviewItems([...foodPreview.meal.items]);
    } else if (foodPreview?.mode === 'saved_meal') {
      setPreviewItems(
        foodPreview.saved.items.map((si) => ({
          food_catalog_id: si.food_catalog_id,
          custom_name: si.custom_name ?? 'Alimento',
          grams: si.grams,
          kcal: si.kcal,
          protein_g: si.protein_g,
          carbs_g: si.carbs_g,
          fat_g: si.fat_g,
        })),
      );
    } else {
      setPreviewItems([]);
    }
  }, [foodPreview]);

  const previewTotals = useMemo(() => {
    const kcal = previewItems.reduce((s, i) => s + i.kcal, 0);
    const p = previewItems.reduce((s, i) => s + i.protein_g, 0);
    const c = previewItems.reduce((s, i) => s + i.carbs_g, 0);
    const f = previewItems.reduce((s, i) => s + i.fat_g, 0);
    return { kcal, p, c, f };
  }, [previewItems]);

  const rehydrateSingleItemPreview = useCallback((mi: MealItem) => {
    const per100: Per100g | undefined =
      mi.grams > 0
        ? {
            kcal_per_100g: (mi.kcal / mi.grams) * 100,
            protein_per_100g: (mi.protein_g / mi.grams) * 100,
            carbs_per_100g: (mi.carbs_g / mi.grams) * 100,
            fat_per_100g: (mi.fat_g / mi.grams) * 100,
          }
        : undefined;
    setPreviewPer100(per100);
    setPreviewGrams(String(Math.round(mi.grams)));
    setPreviewUnit('g');
    setPreviewServingSizeG(undefined);
    setPreviewMealItem({ ...mi });
  }, []);

  const removePreviewItem = useCallback(
    (ix: number) => {
      setPreviewItems((prev) => {
        const next = prev.filter((_, i) => i !== ix);
        if (next.length === 0) {
          setFoodPreview(null);
        } else if (next.length === 1) {
          if (foodPreviewRef.current?.mode === 'saved_meal') {
            rehydrateSingleItemPreview(next[0]);
          } else {
            setPreviewMealItem(null);
            setPreviewPer100(undefined);
          }
        } else {
          setPreviewMealItem(null);
          setPreviewPer100(undefined);
        }
        return next;
      });
    },
    [rehydrateSingleItemPreview],
  );

  const [quickAddFood, setQuickAddFood] = useState<FoodItem | null>(null);

  const savedMealsQuery = useQuery<SavedMeal[]>({
    queryKey: ['savedMeals'],
    queryFn: () => api.get<SavedMeal[]>('/api/v1/meals/saved'),
    staleTime: 30_000,
  });

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/api/v1/me/profile'),
    retry: 1,
  });
  const isFreeUser = isNonPremiumTier(profile?.subscription_tier);

  const saveMealFavMutation = useMutation({
    mutationFn: ({ name, items }: { name: string; items: MealItem[] }) =>
      api.post('/api/v1/meals/saved', {
        name,
        items: items.map((it) => ({
          food_catalog_id: it.food_catalog_id || undefined,
          custom_name: it.custom_name,
          grams: it.grams,
          kcal: it.kcal,
          protein_g: it.protein_g,
          carbs_g: it.carbs_g,
          fat_g: it.fat_g,
        })),
      }),
    onMutate: async ({ name, items }) => {
      await queryClient.cancelQueries({ queryKey: ['savedMeals'] });
      const previous = queryClient.getQueryData<SavedMeal[]>(['savedMeals']);
      const optimistic: SavedMeal = {
        id: `optimistic-${Date.now()}`,
        name,
        total_kcal: items.reduce((s, i) => s + i.kcal, 0),
        total_protein_g: items.reduce((s, i) => s + i.protein_g, 0),
        total_carbs_g: items.reduce((s, i) => s + i.carbs_g, 0),
        total_fat_g: items.reduce((s, i) => s + i.fat_g, 0),
        items: items.map((i) => ({
          id: `optimistic-item-${Math.random().toString(36).slice(2, 9)}`,
          food_catalog_id: i.food_catalog_id,
          custom_name: i.custom_name,
          grams: i.grams,
          kcal: i.kcal,
          protein_g: i.protein_g,
          carbs_g: i.carbs_g,
          fat_g: i.fat_g,
        })),
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<SavedMeal[]>(['savedMeals'], (prev) => [...(prev ?? []), optimistic]);
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(['savedMeals'], ctx.previous);
      Alert.alert(
        'No se pudo añadir',
        toUserFacingErrorMessage(e, 'No se pudo añadir a favoritos. Inténtalo de nuevo.'),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['savedMeals'] }),
  });
  const deleteMealFavMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/meals/saved/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['savedMeals'] });
      const previous = queryClient.getQueryData<SavedMeal[]>(['savedMeals']);
      queryClient.setQueryData<SavedMeal[]>(['savedMeals'], (prev) => (prev ?? []).filter((sm) => sm.id !== id));
      return { previous };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(['savedMeals'], ctx.previous);
      Alert.alert(
        'No se pudo quitar',
        toUserFacingErrorMessage(e, 'No se pudo quitar de favoritos. Inténtalo de nuevo.'),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['savedMeals'] }),
  });

  const customFoodsQuery = useQuery<CustomFood[]>({
    queryKey: ['customFoods'],
    queryFn: () => api.get<CustomFood[]>('/api/v1/meals/custom-foods'),
    staleTime: 30_000,
    enabled: activeTab === 'created',
  });

  const deleteCustomFoodMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/meals/custom-foods/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['customFoods'] });
      const previous = queryClient.getQueryData<CustomFood[]>(['customFoods']);
      queryClient.setQueryData<CustomFood[]>(['customFoods'], (prev) => (prev ?? []).filter((cf) => cf.id !== id));
      return { previous };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(['customFoods'], ctx.previous);
      Alert.alert(
        'No se pudo eliminar',
        toUserFacingErrorMessage(e, 'No se pudo eliminar el alimento. Inténtalo de nuevo.'),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['customFoods'] }),
  });

  const handleCustomFoodLongPress = (cf: CustomFood) => {
    setCustomFoodMenu(cf);
  };

  const closeCustomFoodMenu = () => setCustomFoodMenu(null);

  const onEditCustomFood = () => {
    const cf = customFoodMenu;
    if (!cf) return;
    setCustomFoodMenu(null);
    router.push({
      pathname: '/add-meal/create-food',
      params: {
        meal_type: mealType,
        date: diaryDateStr,
        edit_id: cf.id,
        edit_name: cf.name,
        edit_kcal: String(cf.kcal_per_100g),
        edit_protein: String(cf.protein_per_100g),
        edit_carbs: String(cf.carbs_per_100g),
        edit_fat: String(cf.fat_per_100g),
        edit_icon: cf.icon ?? '',
      },
    });
  };

  const onDeleteCustomFood = () => {
    const cf = customFoodMenu;
    if (!cf) return;
    Alert.alert(
      'Eliminar alimento',
      `¿Seguro que quieres eliminar "${cf.name}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            deleteCustomFoodMutation.mutate(cf.id);
            setCustomFoodMenu(null);
          },
        },
      ],
    );
  };

  const recentMealsQuery = useQuery<MealEntry[]>({
    queryKey: ['recentMeals'],
    queryFn: () => api.get<MealEntry[]>('/api/v1/diary/recent-meals?limit=40'),
    staleTime: 30_000,
  });

  const recentFoods = useMemo(() => {
    const meals = recentMealsQuery.data ?? [];
    const items: { mealItem: MealItem; serving: string; kcal: number }[] = [];
    const seen = new Set<string>();
    for (const meal of meals) {
      for (const item of meal.items) {
        const key = `${item.food_catalog_id ?? ''}|${(item.custom_name ?? '').toLowerCase().trim()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const mealItem = lineMealItemFromDiaryItem(item);
        items.push({
          mealItem,
          serving: `${mealItem.grams} g`,
          kcal: Math.round(mealItem.kcal),
        });
      }
    }
    return items.slice(0, 8);
  }, [recentMealsQuery.data]);

  const recentMealsSummary = useMemo(() => {
    const meals = recentMealsQuery.data ?? [];
    const grouped = new Map<string, MealEntry[]>();
    for (const meal of meals) {
      const key = `${meal.date}|${meal.meal_type}`;
      const arr = grouped.get(key);
      if (arr) arr.push(meal);
      else grouped.set(key, [meal]);
    }
    const dayNames = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const rows: { id: string; entry: MealEntry; title: string; description: string; kcal: number }[] = [];
    for (const [, group] of grouped) {
      const first = group[0];
      const allItems = group.flatMap((m) => m.items);
      const totalKcal = group.reduce((s, m) => s + m.total_kcal, 0);
      const merged: MealEntry = {
        ...first,
        items: allItems,
        total_kcal: totalKcal,
        total_protein_g: group.reduce((s, m) => s + m.total_protein_g, 0),
        total_carbs_g: group.reduce((s, m) => s + m.total_carbs_g, 0),
        total_fat_g: group.reduce((s, m) => s + m.total_fat_g, 0),
      };
      const dateObj = parseLocalYmd(first.date);
      const dayLabel = `${dayNames[dateObj.getDay()]} ${dateObj.getDate()} ${monthNames[dateObj.getMonth()]}`;
      const label = MEAL_TYPE_LABELS[first.meal_type] || first.meal_type;
      const desc = allItems
        .map((i) => `${i.custom_name ?? 'Alimento'} - ${Math.round(i.grams)} g`)
        .join(', ');
      rows.push({
        id: group.map((m) => m.id).join('+'),
        entry: merged,
        title: `${label} (${dayLabel})`,
        description: desc.length > 45 ? desc.slice(0, 42) + '...' : desc,
        kcal: Math.round(totalKcal),
      });
      if (rows.length >= 5) break;
    }
    return rows;
  }, [recentMealsQuery.data]);

  const yesterdayDateStr = useMemo(() => {
    const today = parseLocalYmd(diaryDateStr);
    today.setDate(today.getDate() - 1);
    return toLocalYmd(today);
  }, [diaryDateStr]);

  const yesterdayDiaryQuery = useQuery<DayDiary>({
    queryKey: ['diary', yesterdayDateStr],
    queryFn: () => api.get<DayDiary>(`/api/v1/diary/day?date=${yesterdayDateStr}`),
    staleTime: 60_000,
  });

  const yesterdayMealsSummary = useMemo(() => {
    const meals = yesterdayDiaryQuery.data?.meals ?? [];
    if (meals.length === 0) return [];
    const grouped = new Map<string, MealEntry[]>();
    for (const meal of meals) {
      const arr = grouped.get(meal.meal_type);
      if (arr) arr.push(meal);
      else grouped.set(meal.meal_type, [meal]);
    }
    const rows: { id: string; entry: MealEntry; title: string; description: string; kcal: number }[] = [];
    for (const [, group] of grouped) {
      const first = group[0];
      const allItems = group.flatMap((m) => m.items);
      const totalKcal = group.reduce((s, m) => s + m.total_kcal, 0);
      const merged: MealEntry = {
        ...first,
        items: allItems,
        total_kcal: totalKcal,
        total_protein_g: group.reduce((s, m) => s + m.total_protein_g, 0),
        total_carbs_g: group.reduce((s, m) => s + m.total_carbs_g, 0),
        total_fat_g: group.reduce((s, m) => s + m.total_fat_g, 0),
      };
      const label = MEAL_TYPE_LABELS[first.meal_type] || first.meal_type;
      const desc = allItems
        .map((i) => `${i.custom_name ?? 'Alimento'} - ${Math.round(i.grams)} g`)
        .join(', ');
      rows.push({
        id: group.map((m) => m.id).join('+'),
        entry: merged,
        title: label,
        description: desc.length > 45 ? desc.slice(0, 42) + '...' : desc,
        kcal: Math.round(totalKcal),
      });
    }
    return rows;
  }, [yesterdayDiaryQuery.data]);

  const searchMutation = useMutation({
    mutationFn: async (q: string) => {
      const nutritionRes = await api.get<NutritionSearchResponse>(
        `/api/v1/nutrition/search?q=${encodeURIComponent(q)}&lang=es&limit=20`,
      );
      const mapped: FoodItem[] = nutritionRes.results.map((item) => mapNutritionFoodToFoodItem(item));
      return { results: mapped, total: nutritionRes.total };
    },
    onSuccess: (data) => {
      setResults(data.results);
      setHasSearched(true);
    },
    onError: () => {
      setResults([]);
      setHasSearched(true);
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ mealTypeToSave, items }: { mealTypeToSave: MealTypeOrderKey; items: MealItem[] }) =>
      api.post('/api/v1/meals/confirm', {
        date: diaryDateStr,
        meal_type: mealTypeToSave,
        items,
      }),
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      setFoodPreview(null);
      setShowMealPicker(false);
      setPendingSavedMealItems(null);
      router.back();
    },
    onError: (e: unknown) =>
      Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo guardar')),
  });

  const quickAddMutation = useMutation({
    mutationFn: ({ food, mt }: { food: FoodItem; mt: MealTypeOrderKey }) => {
      const grams = food.serving_size_g ?? 100;
      const per100: Per100g = {
        kcal_per_100g: food.kcal_per_100g,
        protein_per_100g: food.protein_per_100g,
        carbs_per_100g: food.carbs_per_100g,
        fat_per_100g: food.fat_per_100g,
      };
      const m = macrosFromPer100g(grams, per100);
      const item: MealItem = {
        ...(food.id ? { food_catalog_id: food.id } : {}),
        custom_name: food.name_es || food.name,
        grams: m.grams,
        kcal: m.kcal,
        protein_g: m.protein_g,
        carbs_g: m.carbs_g,
        fat_g: m.fat_g,
      };
      return api.post('/api/v1/meals/confirm', {
        date: diaryDateStr,
        meal_type: mt,
        items: [item],
      });
    },
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      setQuickAddFood(null);
      Alert.alert('Añadido', 'Registrado correctamente.');
    },
    onError: (e: unknown) =>
      Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo guardar')),
  });

  const textFreeMutation = useMutation({
    mutationFn: (text: string) =>
      api.post<PhotoAnalysis>('/api/v1/meals/parse-text', { text }),
    onSuccess: (data) => {
      const encoded = encodeURIComponent(JSON.stringify(data));
      router.push({
        pathname: '/add-meal/photo',
        params: { meal_type: mealType, date: diaryDateStr, import_analysis: encoded },
      });
    },
    onError: (e: unknown) => {
      const msg = toUserFacingErrorMessage(e, 'No se pudo analizar la descripción');
      if (isNutriCoachTurnLimitErrorMessage(msg)) {
        if (isNutriCoachDailyLimitErrorMessage(msg)) {
          Alert.alert('Límite alcanzado', msg);
          return;
        }
        showParseTextPremiumLock();
        return;
      }
      Alert.alert('Error', msg || 'No se pudo analizar la descripción');
    },
  });

  const runSearch = useCallback(() => {
    const q = query.trim();
    if (q.length < 2) {
      Alert.alert('Búsqueda', 'Escribe al menos 2 caracteres.');
      return;
    }
    searchMutation.mutate(q);
  }, [query, searchMutation]);

  const openFoodPreviewFromCatalog = (food: FoodItem) => {
    const per100: Per100g = {
      kcal_per_100g: food.kcal_per_100g,
      protein_per_100g: food.protein_per_100g,
      carbs_per_100g: food.carbs_per_100g,
      fat_per_100g: food.fat_per_100g,
    };
    const grams = food.serving_size_g ?? 100;
    const m = macrosFromPer100g(grams, per100);
    const item: MealItem = {
      ...(food.id ? { food_catalog_id: food.id } : {}),
      custom_name: food.name_es || food.name,
      grams: m.grams,
      kcal: m.kcal,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
    };
    setPreviewPer100(per100);
    setPreviewGrams(String(grams));
    setPreviewUnit('g');
    setPreviewServingSizeG(food.serving_size_g);
    setPreviewMealItem(item);
    setFoodPreview({ mode: 'catalog', food });
  };

  const [pendingSavedMealItems, setPendingSavedMealItems] = useState<MealItem[] | null>(null);

  const openCustomFoodPreview = (cf: CustomFood) => {
    const per100: Per100g = {
      kcal_per_100g: cf.kcal_per_100g,
      protein_per_100g: cf.protein_per_100g,
      carbs_per_100g: cf.carbs_per_100g,
      fat_per_100g: cf.fat_per_100g,
    };
    const grams = 100;
    const m = macrosFromPer100g(grams, per100);
    const item: MealItem = {
      custom_name: mealItemCustomNameWithLeadingIcon(cf.name, cf.icon ?? null),
      grams: m.grams,
      kcal: m.kcal,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
    };
    setPreviewPer100(per100);
    setPreviewGrams(String(grams));
    setPreviewUnit('g');
    setPreviewServingSizeG(undefined);
    setPreviewMealItem(item);
    setFoodPreview({
      mode: 'catalog',
      food: {
        id: cf.id,
        name: cf.name,
        name_es: cf.name,
        kcal_per_100g: cf.kcal_per_100g,
        protein_per_100g: cf.protein_per_100g,
        carbs_per_100g: cf.carbs_per_100g,
        fat_per_100g: cf.fat_per_100g,
      } as FoodItem,
    });
  };

  const onPreviewQtyChange = (text: string) => {
    setPreviewGrams(text);
    const raw = Math.max(0, parseFloat(text.replace(',', '.')) || 0);
    const g = Math.round(toGrams(raw, previewUnit, previewServingSizeG));
    if (!previewMealItem || !previewPer100) return;
    const m = macrosFromPer100g(g, previewPer100);
    setPreviewMealItem({
      ...previewMealItem,
      ...m,
    });
  };

  const onPreviewUnitChange = (newUnit: FoodUnit) => {
    const raw = parseFloat(previewGrams.replace(',', '.')) || 0;
    const currentGrams = toGrams(raw, previewUnit, previewServingSizeG);
    const converted = fromGrams(currentGrams, newUnit, previewServingSizeG);
    setPreviewUnit(newUnit);
    setPreviewGrams(String(Math.round(converted * 100) / 100));
    const g = Math.round(currentGrams);
    if (previewMealItem && previewPer100) {
      const m = macrosFromPer100g(g, previewPer100);
      setPreviewMealItem({ ...previewMealItem, ...m });
    }
  };

  const openDiaryFoodPreview = (mi: MealItem) => {
    rehydrateSingleItemPreview(mi);
    setFoodPreview({ mode: 'diary_food', mealItem: mi });
  };

  const openSavedMealPreview = (saved: SavedMeal) => {
    if (saved.items.length === 1) {
      const si = saved.items[0];
      const mi: MealItem = {
        ...(si.food_catalog_id ? { food_catalog_id: si.food_catalog_id } : {}),
        custom_name: si.custom_name ?? 'Alimento',
        grams: si.grams,
        kcal: si.kcal,
        protein_g: si.protein_g,
        carbs_g: si.carbs_g,
        fat_g: si.fat_g,
      };
      rehydrateSingleItemPreview(mi);
    } else {
      setPreviewPer100(undefined);
      setPreviewMealItem(null);
    }
    setFoodPreview({ mode: 'saved_meal', saved });
  };

  const clearPreviewPortionState = useCallback(() => {
    setPreviewMealItem(null);
    setPreviewPer100(undefined);
  }, []);

  const openDiaryMealPreview = (meal: MealEntry) => {
    setFoodPreview({ mode: 'diary_meal', meal });
  };

  const handleAddSingleItem = () => {
    if (!previewMealItem) return;
    setPendingSavedMealItems([previewMealItem]);
    setFoodPreview(null);
    clearPreviewPortionState();
    setShowMealPicker(true);
  };

  const handleAddMealItems = (meal: MealEntry) => {
    const items: MealItem[] = meal.items.map((si) => lineMealItemFromDiaryItem(si));
    setPendingSavedMealItems(items);
    setFoodPreview(null);
    clearPreviewPortionState();
    setShowMealPicker(true);
  };

  const tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'database', label: 'Explorar', icon: 'compass-outline' },
    { key: 'favorites', label: 'Favoritos', icon: 'heart' },
    { key: 'created', label: 'Creados', icon: 'star' },
  ];

  const actionBar: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; active?: boolean; onPress?: () => void }[] = [
    {
      key: 'recipes',
      label: 'Recetas',
      icon: 'book-outline',
      onPress: () =>
        router.push(
          `/add-meal/recipes?meal_type=${encodeURIComponent(mealType)}&date=${encodeURIComponent(diaryDateStr)}` as never,
        ),
    },
    { key: 'search', label: 'Buscar', icon: 'search', active: true },
    {
      key: 'scanner',
      label: 'Escáner',
      icon: 'scan-outline',
      onPress: () =>
        router.push(
          `/scanner?meal_type=${encodeURIComponent(mealType)}&date=${encodeURIComponent(diaryDateStr)}` as never,
        ),
    },
  ];

  const showResults = hasSearched && results.length > 0;
  const showEmptySearch = hasSearched && !searchMutation.isPending && !searchMutation.isError && results.length === 0;

  const searchHeaderPaddingTop = Math.max(insets.top, spacing.md) + spacing.sm;

  return (
    <ScreenFocusProvider>
      <SlideUpView style={s.root} duration={580} distance={28}>
      {/* ── Search bar ── */}
      <View style={[s.searchBarWrap, { paddingTop: searchHeaderPaddingTop }]}>
        <View style={s.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar alimentos"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={runSearch}
          />
          {searchMutation.isPending && (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
          )}
        </View>
        <View ref={optionsBtnRef} collapsable={false}>
          <TouchableOpacity
            style={s.optionsBtn}
            activeOpacity={0.85}
            onPress={openOptionsMenu}
            accessibilityLabel="Más opciones"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={optionsMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionsMenuVisible(false)}
      >
        <View style={s.menuOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOptionsMenuVisible(false)} />
          <View
            style={[
              s.menuPanelWrap,
              { top: menuAnchor.top, left: menuAnchor.left, width: MENU_WIDTH, pointerEvents: 'box-none' },
            ]}
          >
            <View style={s.menuPanel}>
              <Pressable
                style={({ pressed }) => [s.menuRow, pressed && s.menuRowPressed]}
                onPress={() => {
                  setOptionsMenuVisible(false);
                  router.push({
                    pathname: '/add-meal/create-food',
                    params: { meal_type: mealType, date: diaryDateStr },
                  });
                }}
              >
                <Ionicons name="add-circle-outline" size={22} color={colors.text} />
                <Text style={s.menuRowText}>Crear alimento</Text>
              </Pressable>
              <View style={s.menuDivider} />
              <Pressable
                style={({ pressed }) => [s.menuRow, pressed && s.menuRowPressed]}
                onPress={() => {
                  setOptionsMenuVisible(false);
                  router.push({
                    pathname: '/add-meal/create-recipe',
                    params: { meal_type: mealType, date: diaryDateStr },
                  });
                }}
              >
                <Ionicons name="book-outline" size={22} color={colors.text} />
                <Text style={s.menuRowText}>Crear receta</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Content tab bar (Base de datos / Favoritos / Creados) ── */}
      <View style={s.tabBar}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <PressableScale
              key={tab.key}
              style={[s.tab, active && s.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              scaleTo={0.93}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={active ? colors.text : colors.textMuted}
                style={{ marginRight: 5 }}
              />
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab.label}</Text>
            </PressableScale>
          );
        })}
      </View>

      {/* ── Main scrollable area ── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: tabBarHeight + 80 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Analiza tu comida (IA) — debajo de pestañas, pestaña Base de datos */}
        {activeTab === 'database' && !showResults && (
          <View style={s.section}>
            <View style={[s.aiCard, showTextFree && s.aiCardOpen]}>
              <PressableScale
                style={s.aiCardHeader}
                scaleTo={0.99}
                onPress={() => setShowTextFree((p) => !p)}
              >
                <View style={s.aiCardIcon}>
                  <Ionicons name="sparkles" size={16} color={colors.primary} />
                </View>
                <View style={s.aiCardHeaderText}>
                  <Text style={s.aiCardTitle}>Analiza tu comida</Text>
                  <Text style={s.aiCardSubtitle}>Estima kcal y macros con IA</Text>
                </View>
                <Animated.View style={aiChevronStyle}>
                  <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                </Animated.View>
              </PressableScale>

              <Animated.View style={[s.aiCardClip, aiBodyStyle]} pointerEvents={showTextFree ? 'auto' : 'none'}>
                <View
                  style={s.aiCardBodyAbsolute}
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    if (h > 0) {
                      aiBodyMeasured.value = h;
                    }
                  }}
                >
                  <View style={s.aiInputWrap}>
                    <TextInput
                      style={s.aiInput}
                      value={textFreeInput}
                      onChangeText={setTextFreeInput}
                      placeholder='Ej: "100g de arroz en crudo y 200g de pollo a la plancha"'
                      placeholderTextColor={colors.textMuted}
                      multiline
                      maxLength={500}
                      editable={!textFreeMutation.isPending}
                    />
                    <Text style={s.aiInputCounter}>{textFreeInput.length}/500</Text>
                  </View>
                  <Button
                    title={textFreeMutation.isPending ? 'Analizando…' : 'Analizar con IA'}
                    onPress={() => {
                      const t = textFreeInput.trim();
                      if (t.length < 3) {
                        Alert.alert('Analiza tu comida', 'Escribe al menos 3 caracteres.');
                        return;
                      }
                      if (isFreeUser) {
                        showParseTextPremiumLock();
                        return;
                      }
                      textFreeMutation.mutate(t);
                    }}
                    loading={textFreeMutation.isPending}
                    disabled={textFreeInput.trim().length < 3}
                    style={s.aiSubmit}
                  />
                </View>
              </Animated.View>
            </View>
          </View>
        )}

        {/* Recientes — siempre visible en Base de datos cuando no hay resultados de búsqueda */}
        {activeTab === 'database' && !showResults && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Recientes</Text>
            {recentMealsQuery.isLoading ? (
              <View style={s.recentStatusBox}>
                <ActivityIndicator color={colors.primary} />
                <Text style={s.hintText}>Cargando tu historial…</Text>
              </View>
            ) : recentMealsQuery.isError ? (
              <View style={s.hintBox}>
                <Text style={s.errorText}>{searchErrorMessage(recentMealsQuery.error)}</Text>
                <Text style={s.hintText}>
                  No se pudo cargar el historial. Comprueba tu conexión e inténtalo de nuevo.
                </Text>
                <Button
                  title="Reintentar"
                  variant="secondary"
                  onPress={() => recentMealsQuery.refetch()}
                  style={{ marginTop: spacing.sm }}
                />
              </View>
            ) : recentFoods.length === 0 && recentMealsSummary.length === 0 && yesterdayMealsSummary.length === 0 ? (
              <View style={s.recentStatusBox}>
                <Text style={s.hintText}>
                  Tus alimentos recientes aparecerán aquí para añadirlos rápidamente.
                </Text>
              </View>
            ) : (
              <>
                {recentFoods.length > 0 && (
                  <>
                    <Text style={s.sectionSubtitle}>Alimentos del diario (toca para ver detalles)</Text>
                    {recentFoods.map((row, index) => {
                      const name = row.mealItem.custom_name ?? 'Alimento';
                      const { icon: embeddedIcon, title: strippedName } = stripLeadingMealIconFromTitle(name);
                      const rowVisual = embeddedIcon
                        ? ({ kind: 'emoji' as const, emoji: embeddedIcon })
                        : foodRowVisual(strippedName);
                      return (
                        <TouchableOpacity
                          key={`rf-${row.mealItem.food_catalog_id ?? 'x'}-${name}-${index}`}
                          style={s.foodRow}
                          activeOpacity={0.85}
                          onPress={() => openDiaryFoodPreview(row.mealItem)}
                        >
                          <MealItemIconMedia visual={rowVisual} emojiStyle={s.foodEmoji} imageSize={26} />
                          <View style={s.foodInfo}>
                            <Text style={s.foodName} numberOfLines={1}>{mealItemDisplayLineForUi(name)}</Text>
                          </View>
                          <View style={s.foodRight}>
                            <Text style={s.foodServing}>{row.serving}</Text>
                            <Text style={s.foodKcal}>{row.kcal} kcal</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
                {yesterdayMealsSummary.length > 0 && (
                  <>
                    <Text style={[s.sectionSubtitle, recentFoods.length > 0 && { marginTop: spacing.md }]}>
                      Comidas de ayer (toca para repetir)
                    </Text>
                    {yesterdayMealsSummary.map((row) => (
                      <TouchableOpacity
                        key={`y-${row.id}`}
                        style={s.foodRow}
                        activeOpacity={0.85}
                        onPress={() => openDiaryMealPreview(row.entry)}
                      >
                        <Text style={s.foodEmoji}>{'\uD83D\uDD01'}</Text>
                        <View style={s.foodInfo}>
                          <Text style={s.foodName} numberOfLines={1}>{capitalizeFirstChar(row.title || '')}</Text>
                          <Text style={s.foodBrand} numberOfLines={1}>{row.description}</Text>
                        </View>
                        <View style={s.foodRight}>
                          <Text style={s.foodKcal}>{row.kcal} kcal</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
                {recentMealsSummary.length > 0 && (
                  <>
                    <Text style={[s.sectionSubtitle, (recentFoods.length > 0 || yesterdayMealsSummary.length > 0) && { marginTop: spacing.md }]}>
                      Comidas completas (toca para ver detalles)
                    </Text>
                    {recentMealsSummary.map((row) => (
                      <TouchableOpacity
                        key={row.id}
                        style={s.foodRow}
                        activeOpacity={0.85}
                        onPress={() => openDiaryMealPreview(row.entry)}
                      >
                        <Text style={s.foodEmoji}>{'\uD83C\uDF7D\uFE0F'}</Text>
                        <View style={s.foodInfo}>
                          <Text style={s.foodName} numberOfLines={1}>{capitalizeFirstChar(row.title || '')}</Text>
                          <Text style={s.foodBrand} numberOfLines={1}>{row.description}</Text>
                        </View>
                        <View style={s.foodRight}>
                          <Text style={s.foodKcal}>{row.kcal} kcal</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </>
            )}
          </View>
        )}


        {/* ── TAB: Database ── */}
        {activeTab === 'database' && (
          <Animated.View entering={FadeIn.duration(220)}>
            {searchMutation.isError && (
              <View style={s.hintBox}>
                <Text style={s.errorText}>{searchErrorMessage(searchMutation.error)}</Text>
                <Text style={s.hintText}>
                  Comprueba tu conexión a internet e inténtalo de nuevo.
                </Text>
              </View>
            )}

            {showEmptySearch && (
              <View style={s.hintBox}>
                <Text style={s.hintText}>Sin resultados. Prueba otro término.</Text>
              </View>
            )}

            {showResults && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Resultados</Text>
                {results.map((item, index) => (
                  <View
                    key={item.id ?? `${item.provider}-${item.external_id ?? item.barcode ?? item.name}-${index}`}
                    style={s.foodRow}
                  >
                    <TouchableOpacity
                      style={s.foodRowContent}
                      activeOpacity={0.85}
                      onPress={() => openFoodPreviewFromCatalog(item)}
                    >
                      <MealItemIconMedia
                        visual={foodRowVisual(item.name_es || item.name)}
                        emojiStyle={s.foodEmoji}
                        imageSize={26}
                      />
                      <View style={s.foodInfo}>
                        <Text style={s.foodName} numberOfLines={1}>
                          {capitalizeFirstChar(item.name_es || item.name || '')}
                        </Text>
                        <Text style={s.foodBrand} numberOfLines={1}>{item.provider || 'Alimento general'}</Text>
                      </View>
                      <View style={s.foodRight}>
                        <Text style={s.foodServing}>{formatServingDisplay(item)}</Text>
                        <Text style={s.foodKcal}>{Math.round(item.kcal_per_100g)} kcal</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.quickAddBtn}
                      activeOpacity={0.85}
                      onPress={() => setQuickAddFood(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Añadir rápido"
                    >
                      <Ionicons name="add-circle" size={28} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* ── TAB: Favorites (saved meals) ── */}
        {activeTab === 'favorites' && (
          <Animated.View entering={FadeIn.duration(220)} style={s.section}>
            {savedMealsQuery.isPending && (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            )}
            {savedMealsQuery.data && savedMealsQuery.data.length === 0 && (
              <View style={s.emptyHero}>
                <Ionicons name="heart-outline" size={48} color={colors.textTertiary} />
                <Text style={s.emptyText}>No tienes comidas guardadas</Text>
              </View>
            )}
            {(savedMealsQuery.data ?? []).map((saved) => (
              <TouchableOpacity
                key={saved.id}
                style={s.foodRow}
                activeOpacity={0.85}
                onPress={() => openSavedMealPreview(saved)}
              >
                <MealItemIconMedia
                  visual={mealItemVisualIconForLookupName(saved.name)}
                  emojiStyle={s.foodEmoji}
                  imageSize={26}
                />
                <View style={s.foodInfo}>
                  <Text style={s.foodName} numberOfLines={1}>{saved.name}</Text>
                  <Text style={s.foodBrand} numberOfLines={1}>
                    {saved.items.length} alimento{saved.items.length !== 1 ? 's' : ''} · P:{Math.round(saved.total_protein_g)} C:{Math.round(saved.total_carbs_g)} G:{Math.round(saved.total_fat_g)}
                  </Text>
                </View>
                <View style={s.foodRight}>
                  <Text style={s.foodKcal}>{Math.round(saved.total_kcal)} kcal</Text>
                </View>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}

        {/* ── TAB: Created (custom foods) ── */}
        {activeTab === 'created' && (
          <Animated.View entering={FadeIn.duration(220)} style={s.section}>
            <TouchableOpacity
              style={s.createFoodBtn}
              activeOpacity={0.9}
              onPress={() =>
                router.push({
                  pathname: '/add-meal/create-food',
                  params: { meal_type: mealType, date: diaryDateStr },
                })
              }
            >
              <View style={s.createFoodIconWrap}>
                <Ionicons name="add" size={22} color={colors.primary} />
              </View>
              <View style={s.createFoodTextWrap}>
                <Text style={s.createFoodBtnTitle}>Crear nuevo alimento</Text>
                <Text style={s.createFoodBtnSubtitle}>Añade un alimento personalizado a tu base</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            {customFoodsQuery.isPending && (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            )}
            {customFoodsQuery.data && customFoodsQuery.data.length === 0 && (
              <View style={s.emptyHero}>
                <Ionicons name="star-outline" size={48} color={colors.textTertiary} />
                <Text style={s.emptyText}>No tienes alimentos creados</Text>
              </View>
            )}
            {(customFoodsQuery.data ?? []).map((cf) => (
              <TouchableOpacity
                key={cf.id}
                style={s.foodRow}
                activeOpacity={0.85}
                onPress={() => openCustomFoodPreview(cf)}
                onLongPress={() => handleCustomFoodLongPress(cf)}
                delayLongPress={350}
              >
                <MealItemIconMedia
                  visual={
                    cf.icon?.trim()
                      ? { kind: 'emoji' as const, emoji: cf.icon.trim() }
                      : foodRowVisual(cf.name)
                  }
                  emojiStyle={s.foodEmoji}
                  imageSize={26}
                />
                <View style={s.foodInfo}>
                  <Text style={s.foodName} numberOfLines={1}>{cf.name}</Text>
                  <Text style={s.foodBrand} numberOfLines={1}>
                    P:{Math.round(cf.protein_per_100g)} C:{Math.round(cf.carbs_per_100g)} G:{Math.round(cf.fat_per_100g)} /100g
                  </Text>
                </View>
                <View style={s.foodRight}>
                  <Text style={s.foodKcal}>{Math.round(cf.kcal_per_100g)} kcal</Text>
                  <Text style={s.foodServing}>por 100g</Text>
                </View>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}
      </ScrollView>


      {/* ── Action bar (Recetas / Buscar / Escáner) — above the tab bar ── */}
      <View style={[s.actionBar, { bottom: tabBarHeight + 10 }]}>
        {actionBar.map((action) => (
          <Pressable
            key={action.key}
            style={({ pressed }) => [
              s.actionItem,
              action.active && s.actionItemActive,
              pressed && (action.active ? s.actionActivePressed : s.actionItemPressed),
            ]}
            onPress={action.onPress}
          >
            {action.active ? (
              <TideGradientFrame
                borderRadius={20}
                style={s.actionActiveTide}
                contentContainerStyle={s.actionActiveTideInner}
              >
                <Ionicons name={action.icon} size={20} color={colors.white} />
              </TideGradientFrame>
            ) : (
              <Ionicons name={action.icon} size={20} color={colors.tabInactive} />
            )}
            <Text style={[s.actionLabel, action.active && s.actionLabelActive]}>{action.label}</Text>
          </Pressable>
        ))}
      </View>


      {/* ── Vista previa (recientes / resultados) ── */}
      <BottomSheet
        visible={!!foodPreview}
        onDismiss={() => {
          setFoodPreview(null);
          clearPreviewPortionState();
        }}
        maxHeightFraction={0.88}
        liftOnKeyboard
      >
        {foodPreview?.mode === 'diary_food' && (() => {
          const mi = previewMealItem ?? foodPreview.mealItem;
          const rawQty = parseFloat(previewGrams.replace(',', '.')) || 0;
          const displayGrams = Math.round(toGrams(rawQty, previewUnit, previewServingSizeG));
          const itemFavName = (mi.custom_name || 'Alimento').split(/\s*[—·|]\s*/)[0]?.trim() || 'Alimento';
          const savedItemFav = savedMealsQuery.data?.find((sm) => sm.name === itemFavName);
          const isItemFav = Boolean(savedItemFav);
          const itemFavBusy = saveMealFavMutation.isPending || deleteMealFavMutation.isPending;
          const onItemFavPress = () => {
            if (savedItemFav) {
              deleteMealFavMutation.mutate(savedItemFav.id);
              return;
            }
            const toSave: MealItem = {
              custom_name: mi.custom_name ?? 'Alimento',
              grams: Math.max(0, Math.round(mi.grams)),
              kcal: Math.max(0, Math.round(kcalFromMacros(mi.protein_g, mi.carbs_g, mi.fat_g))),
              protein_g: Math.max(0, mi.protein_g),
              carbs_g: Math.max(0, mi.carbs_g),
              fat_g: Math.max(0, mi.fat_g),
            };
            if (
              mi.food_catalog_id &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mi.food_catalog_id)
            ) {
              toSave.food_catalog_id = mi.food_catalog_id;
            }
            saveMealFavMutation.mutate({ name: itemFavName, items: [toSave] });
          };
          return (
            <View style={s.pvBody}>
              <View style={s.pvMealHeaderWrap}>
                <FoodPreviewHero
                  variant="diary_food"
                  nameRaw={mi.custom_name || 'Alimento'}
                  compact
                  overline="Mis Comidas"
                  title={mealItemDisplayLineForUi(mi.custom_name || 'Alimento')}
                  subtitleElement={
                    <View style={s.pvQtyRow}>
                      <TextInput
                        style={s.pvQtyInput}
                        value={previewGrams}
                        onChangeText={onPreviewQtyChange}
                        keyboardType="decimal-pad"
                      />
                      <UnitPicker
                        value={previewUnit}
                        onChange={onPreviewUnitChange}
                        availableUnits={availableUnitsForFood(previewServingSizeG)}
                        triggerStyle={s.pvUnitTrigger}
                        triggerTextStyle={s.pvUnitTriggerText}
                        chevronColor={colors.primary}
                        chevronSize={12}
                        triggerTextMode="abbr"
                      />
                    </View>
                  }
                />
                <AnimatedFavoriteButton
                  isFav={isItemFav}
                  onPress={onItemFavPress}
                  disabled={itemFavBusy}
                  style={s.pvMealFavBtn}
                  accessibilityLabel={isItemFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                />
              </View>

              <MacroSummarySection
                kcal={mi.kcal}
                proteinG={mi.protein_g}
                carbsG={mi.carbs_g}
                fatG={mi.fat_g}
                compact
              />

              <View style={[actionIntentStyles.row, s.pvFooterRow]}>
                <Button
                  variant="actionCancel"
                  title="Cancelar"
                  onPress={() => {
                    setFoodPreview(null);
                    clearPreviewPortionState();
                  }}
                />
                <Button
                  variant="actionConfirm"
                  title="Añadir a mi comida"
                  onPress={handleAddSingleItem}
                  disabled={saveMutation.isPending}
                  loading={saveMutation.isPending}
                />
              </View>
            </View>
          );
        })()}

        {foodPreview?.mode === 'diary_meal' && (() => {
          const meal = foodPreview.meal;
          const count = previewItems.length;
          const displayEntry: MealEntry = { ...meal, items: previewItems };
          const { foodTitle: mealFavName } = mealPreviewPrimaryFoodLabels(displayEntry);
          const savedMealFav = savedMealsQuery.data?.find((sm) => sm.name === mealFavName);
          const isMealFav = Boolean(savedMealFav);
          const mealFavBusy = saveMealFavMutation.isPending || deleteMealFavMutation.isPending;
          const onMealFavPress = () => {
            if (savedMealFav) {
              deleteMealFavMutation.mutate(savedMealFav.id);
              return;
            }
            saveMealFavMutation.mutate({ name: mealFavName, items: previewItems });
          };
          return (
            <View style={s.pvBody}>
              <View style={s.pvMealHeaderWrap}>
                <FoodPreviewHero
                  variant="diary_meal"
                  meal={meal}
                  compact
                  overline="Comida del diario"
                  title={`${MEAL_TYPE_LABELS[meal.meal_type] ?? meal.meal_type} · ${count} alimento${count !== 1 ? 's' : ''}`}
                />
                <AnimatedFavoriteButton
                  isFav={isMealFav}
                  onPress={onMealFavPress}
                  disabled={mealFavBusy}
                  style={s.pvMealFavBtn}
                  accessibilityLabel={isMealFav ? 'Quitar comida de favoritos' : 'Guardar comida en favoritos'}
                />
              </View>

              <ScrollView style={s.pvScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {previewItems.map((it, ix) => {
                  const name = it.custom_name || 'Alimento';
                  const { icon: embeddedIcon, title: strippedName } = stripLeadingMealIconFromTitle(name);
                  const visual = embeddedIcon
                    ? ({ kind: 'emoji' as const, emoji: embeddedIcon })
                    : mealItemVisualIconForLookupName(strippedName);
                  return (
                    <View key={`${it.food_catalog_id ?? ''}-${name}-${ix}`} style={s.pvMealItemRow}>
                      <MealItemIconMedia visual={visual} emojiStyle={s.pvMealItemEmoji} imageSize={24} />
                      <View style={s.pvMealItemInfo}>
                        <Text style={s.pvMealItemName} numberOfLines={1}>
                          {mealItemDisplayLineForUi(name)}
                        </Text>
                        <Text style={s.pvMealItemMeta}>
                          {Math.round(it.grams)} g · P:{Math.round(it.protein_g)} C:{Math.round(it.carbs_g)} G:{Math.round(it.fat_g)} · {Math.round(it.kcal)} kcal
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => removePreviewItem(ix)}
                        hitSlop={10}
                        style={s.pvMealItemRemove}
                        accessibilityLabel="Eliminar alimento"
                      >
                        <Ionicons name="close-circle" size={22} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={s.pvDivider} />

              <MacroSummarySection
                kcal={previewTotals.kcal}
                proteinG={previewTotals.p}
                carbsG={previewTotals.c}
                fatG={previewTotals.f}
                caption="Suma de todos los ítems"
                compact
              />

              <View style={[actionIntentStyles.row, s.pvFooterRow]}>
                <Button
                  variant="actionCancel"
                  title="Cancelar"
                  onPress={() => {
                    setFoodPreview(null);
                    clearPreviewPortionState();
                  }}
                />
                <Button
                  variant="actionConfirm"
                  title={`Añadir ${count} alimento${count !== 1 ? 's' : ''}`}
                  onPress={() => {
                    const fakeEntry: MealEntry = { ...meal, items: previewItems };
                    handleAddMealItems(fakeEntry);
                  }}
                  disabled={saveMutation.isPending}
                  loading={saveMutation.isPending}
                />
              </View>
            </View>
          );
        })()}

        {foodPreview?.mode === 'saved_meal' && (() => {
          const saved = foodPreview.saved;
          const count = previewItems.length;
          const totalGrams = previewItems.reduce((s, i) => s + (i.grams || 0), 0);
          const rawQty = parseFloat(previewGrams.replace(',', '.')) || 0;
          const displayGrams =
            count === 1
              ? Math.round(toGrams(rawQty, previewUnit, previewServingSizeG))
              : Math.round(previewItems[0]?.grams ?? 0);
          const subtitle =
            count === 1
              ? `${displayGrams} gramos`
              : `${count} alimento${count !== 1 ? 's' : ''} · ${Math.round(totalGrams)} g`;
          const favBusy = deleteMealFavMutation.isPending;
          const onUnfav = () => {
            deleteMealFavMutation.mutate(saved.id, {
              onSuccess: () => {
                setFoodPreview(null);
                clearPreviewPortionState();
              },
            });
          };
          const single = previewMealItem;
          const kcalSum = count === 1 && single ? single.kcal : previewTotals.kcal;
          const pSum = count === 1 && single ? single.protein_g : previewTotals.p;
          const cSum = count === 1 && single ? single.carbs_g : previewTotals.c;
          const fSum = count === 1 && single ? single.fat_g : previewTotals.f;
          return (
            <View style={s.pvBody}>
              <View style={s.pvMealHeaderWrap}>
                <FoodPreviewHero
                  variant="diary_food"
                  nameRaw={saved.name}
                  compact
                  overline="Mis comidas"
                  title={capitalizeFirstChar(saved.name || '')}
                  subtitle={count === 1 && previewPer100 ? undefined : subtitle}
                  subtitleElement={
                    count === 1 && previewPer100 ? (
                      <View style={s.pvQtyRow}>
                        <TextInput
                          style={s.pvQtyInput}
                          value={previewGrams}
                          onChangeText={onPreviewQtyChange}
                          keyboardType="decimal-pad"
                        />
                        <UnitPicker
                          value={previewUnit}
                          onChange={onPreviewUnitChange}
                          availableUnits={availableUnitsForFood(previewServingSizeG)}
                          triggerStyle={s.pvUnitTrigger}
                          triggerTextStyle={s.pvUnitTriggerText}
                          chevronColor={colors.primary}
                          chevronSize={12}
                          triggerTextMode="abbr"
                        />
                      </View>
                    ) : undefined
                  }
                />
                <AnimatedFavoriteButton
                  isFav
                  onPress={onUnfav}
                  disabled={favBusy}
                  style={s.pvMealFavBtn}
                  accessibilityLabel="Quitar de favoritos"
                />
              </View>

              {count > 1 && (
                <ScrollView style={s.pvScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {previewItems.map((it, ix) => {
                    const name = it.custom_name || 'Alimento';
                    const { icon: embeddedIcon, title: strippedName } = stripLeadingMealIconFromTitle(name);
                    const visual = embeddedIcon
                      ? ({ kind: 'emoji' as const, emoji: embeddedIcon })
                      : mealItemVisualIconForLookupName(strippedName);
                    return (
                      <View key={`${it.food_catalog_id ?? ''}-${name}-${ix}`} style={s.pvMealItemRow}>
                        <MealItemIconMedia visual={visual} emojiStyle={s.pvMealItemEmoji} imageSize={24} />
                        <View style={s.pvMealItemInfo}>
                          <Text style={s.pvMealItemName} numberOfLines={1}>
                            {mealItemDisplayLineForUi(name)}
                          </Text>
                          <Text style={s.pvMealItemMeta}>
                            {Math.round(it.grams)} g · P:{Math.round(it.protein_g)} C:{Math.round(it.carbs_g)} G:{Math.round(it.fat_g)} · {Math.round(it.kcal)} kcal
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => removePreviewItem(ix)}
                          hitSlop={10}
                          style={s.pvMealItemRemove}
                          accessibilityLabel="Eliminar alimento"
                        >
                          <Ionicons name="close-circle" size={22} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              )}

              <MacroSummarySection
                kcal={kcalSum}
                proteinG={pSum}
                carbsG={cSum}
                fatG={fSum}
                compact
              />

              <View style={[actionIntentStyles.row, s.pvFooterRow]}>
                <Button
                  variant="actionCancel"
                  title="Cancelar"
                  onPress={() => {
                    setFoodPreview(null);
                    clearPreviewPortionState();
                  }}
                />
                <Button
                  variant="actionConfirm"
                  title="Añadir a mi comida"
                  onPress={() => {
                    const items: MealItem[] =
                      count === 1 && previewMealItem
                        ? [lineMealItemFromDiaryItem(previewMealItem)]
                        : previewItems.map((si) => lineMealItemFromDiaryItem(si));
                    setPendingSavedMealItems(items);
                    setFoodPreview(null);
                    clearPreviewPortionState();
                    setShowMealPicker(true);
                  }}
                />
              </View>
            </View>
          );
        })()}

        {foodPreview?.mode === 'catalog' && (() => {
          const food = foodPreview.food;
          const mi = previewMealItem;
          const imgUrl = food._imageUrl;
          const itemFavName =
            (food.name_es || food.name || 'Alimento').split(/\s*[—·|]\s*/)[0]?.trim() || 'Alimento';
          const savedItemFav = savedMealsQuery.data?.find((sm) => sm.name === itemFavName);
          const isItemFav = Boolean(savedItemFav);
          const itemFavBusy = saveMealFavMutation.isPending || deleteMealFavMutation.isPending;
          const onItemFavPress = () => {
            if (savedItemFav) {
              deleteMealFavMutation.mutate(savedItemFav.id);
              return;
            }
            const per100: Per100g = {
              kcal_per_100g: food.kcal_per_100g,
              protein_per_100g: food.protein_per_100g,
              carbs_per_100g: food.carbs_per_100g,
              fat_per_100g: food.fat_per_100g,
            };
            const m = macrosFromPer100g(100, per100);
            const toSave: MealItem = {
              custom_name: food.name_es || food.name,
              grams: m.grams,
              kcal: m.kcal,
              protein_g: m.protein_g,
              carbs_g: m.carbs_g,
              fat_g: m.fat_g,
            };
            if (food.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(food.id)) {
              toSave.food_catalog_id = food.id;
            }
            saveMealFavMutation.mutate({ name: itemFavName, items: [toSave] });
          };
          return (
            <View style={s.pvBody}>
              <View style={s.pvMealHeaderWrap}>
                <FoodPreviewHero
                  variant="catalog"
                  imageUri={imgUrl}
                  nameRaw={food.name_es || food.name || 'Alimento'}
                  compact
                  overline="Base de datos"
                  title={capitalizeFirstChar(food.name_es || food.name || '')}
                  subtitleElement={
                    <View style={s.pvQtyRow}>
                      <TextInput
                        style={s.pvQtyInput}
                        value={previewGrams}
                        onChangeText={onPreviewQtyChange}
                        keyboardType="decimal-pad"
                      />
                      <UnitPicker
                        value={previewUnit}
                        onChange={onPreviewUnitChange}
                        availableUnits={availableUnitsForFood(previewServingSizeG)}
                        triggerStyle={s.pvUnitTrigger}
                        triggerTextStyle={s.pvUnitTriggerText}
                        chevronColor={colors.primary}
                        chevronSize={12}
                        triggerTextMode="abbr"
                      />
                    </View>
                  }
                />
                <AnimatedFavoriteButton
                  isFav={isItemFav}
                  onPress={onItemFavPress}
                  disabled={itemFavBusy}
                  style={s.pvMealFavBtn}
                  accessibilityLabel={isItemFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                />
              </View>

              <MacroSummarySection
                kcal={mi ? mi.kcal : food.kcal_per_100g}
                proteinG={mi ? mi.protein_g : food.protein_per_100g}
                carbsG={mi ? mi.carbs_g : food.carbs_per_100g}
                fatG={mi ? mi.fat_g : food.fat_per_100g}
                compact
              />

              <View style={[actionIntentStyles.row, s.pvFooterRow]}>
                <Button
                  variant="actionCancel"
                  title="Cancelar"
                  onPress={() => {
                    setFoodPreview(null);
                    clearPreviewPortionState();
                  }}
                />
                <Button
                  variant="actionConfirm"
                  title="Añadir a mi comida"
                  onPress={handleAddSingleItem}
                  disabled={saveMutation.isPending}
                  loading={saveMutation.isPending}
                />
              </View>
            </View>
          );
        })()}
      </BottomSheet>

      {/* ── Meal type picker BottomSheet ── */}
      <MealTypePickerSheet
        visible={showMealPicker}
        title="Guardar como..."
        selectedMealType={selectedMealType}
        onDismiss={() => {
          setShowMealPicker(false);
          setPendingSavedMealItems(null);
        }}
        onSelect={(mealTypeToSave) => {
          if (!pendingSavedMealItems || pendingSavedMealItems.length === 0) return;
          setSelectedMealType(mealTypeToSave);
          saveMutation.mutate({ mealTypeToSave, items: pendingSavedMealItems });
        }}
      />

      {/* ── Quick-add meal picker ── */}
      <MealTypePickerSheet
        visible={!!quickAddFood}
        title="Anadir a..."
        subtitle={quickAddFood?.name_es || quickAddFood?.name}
        onDismiss={() => setQuickAddFood(null)}
        onSelect={(mealTypeToSave) => {
          if (quickAddFood && !quickAddMutation.isPending) quickAddMutation.mutate({ food: quickAddFood, mt: mealTypeToSave });
        }}
      />

      {/* ── Custom food actions sheet (long-press en pestaña Creados) ── */}
      <BottomSheet
        visible={!!customFoodMenu}
        onDismiss={closeCustomFoodMenu}
        maxHeightFraction={0.6}
      >
        {customFoodMenu && (
          <View style={s.cfMenuBody}>
            <View style={s.cfMenuHeader}>
              <View style={s.cfMenuIconWrap}>
                <Text style={s.cfMenuIcon}>
                  {customFoodMenu.icon?.trim() ? customFoodMenu.icon.trim() : '🍽️'}
                </Text>
              </View>
              <View style={s.cfMenuHeaderText}>
                <Text style={s.cfMenuOverline}>Alimento creado</Text>
                <Text style={s.cfMenuTitle} numberOfLines={2}>{customFoodMenu.name}</Text>
                <Text style={s.cfMenuSubtitle} numberOfLines={1}>
                  {Math.round(customFoodMenu.kcal_per_100g)} kcal · P:{Math.round(customFoodMenu.protein_per_100g)} C:{Math.round(customFoodMenu.carbs_per_100g)} G:{Math.round(customFoodMenu.fat_per_100g)} /100g
                </Text>
              </View>
            </View>

            <View style={s.cfMenuActions}>
              <Pressable
                style={({ pressed }) => [s.cfMenuAction, pressed && s.cfMenuActionPressed]}
                onPress={onEditCustomFood}
                accessibilityRole="button"
                accessibilityLabel="Editar alimento"
              >
                <View style={[s.cfMenuActionIcon, s.cfMenuActionIconEdit]}>
                  <Ionicons name="create-outline" size={22} color={colors.primary} />
                </View>
                <View style={s.cfMenuActionText}>
                  <Text style={s.cfMenuActionTitle}>Editar</Text>
                  <Text style={s.cfMenuActionDesc}>Modifica el nombre, icono o macros</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [s.cfMenuAction, pressed && s.cfMenuActionPressed]}
                onPress={onDeleteCustomFood}
                accessibilityRole="button"
                accessibilityLabel="Eliminar alimento"
              >
                <View style={[s.cfMenuActionIcon, s.cfMenuActionIconDelete]}>
                  <Ionicons name="trash-outline" size={22} color={colors.error} />
                </View>
                <View style={s.cfMenuActionText}>
                  <Text style={[s.cfMenuActionTitle, s.cfMenuActionTitleDanger]}>Eliminar</Text>
                  <Text style={s.cfMenuActionDesc}>Quita este alimento de tu base</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [s.cfMenuCancel, pressed && s.cfMenuCancelPressed]}
              onPress={closeCustomFoodMenu}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
            >
              <Text style={s.cfMenuCancelText}>Cancelar</Text>
            </Pressable>
          </View>
        )}
      </BottomSheet>
      </SlideUpView>
    </ScreenFocusProvider>
  );
}

/* ─── styles ──────────────────────────────────── */

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* Search bar */
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenPaddingX,
    paddingBottom: 10,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    height: 42,
    paddingHorizontal: 14,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  optionsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  menuOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
  },
  menuPanelWrap: {
    position: 'absolute',
  },
  menuPanel: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 28px rgba(0,0,0,0.45)' },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
      default: { boxShadow: '0 8px 28px rgba(0,0,0,0.45)' },
    }),
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  menuRowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  menuDivider: {
    height: hairlineWidth,
    backgroundColor: colors.border,
  },
  menuRowText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },

  /* Tab bar */
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: screenPaddingX,
    borderBottomWidth: hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.text,
  },
  tabLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.text,
    fontWeight: '600',
  },

  /* Scroll */
  scroll: { flex: 1 },
  scrollContent: {},

  /* Section */
  section: {
    paddingHorizontal: screenPaddingX,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  recentStatusBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },

  /* Food rows */
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: hairlineWidth,
    borderBottomColor: colors.border,
  },
  foodEmoji: {
    fontSize: 28,
    width: 38,
    textAlign: 'center',
  },
  foodInfo: {
    flex: 1,
    marginLeft: 10,
  },
  foodName: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 15,
  },
  foodBrand: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  foodRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  foodServing: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 13,
  },
  foodKcal: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginTop: 1,
  },

  /* Empty hero */
  emptyHero: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
  },

  /* Hints */
  hintBox: {
    marginHorizontal: screenPaddingX,
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: { ...typography.bodyBold, color: colors.error, marginBottom: spacing.sm },
  hintText: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },

  /* Bottom action bar — dock flotante above the tab bar */
  actionBar: {
    position: 'absolute',
    left: screenPaddingX,
    right: screenPaddingX,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 52,
    borderRadius: borderRadius.xxl,
    borderWidth: 1,
    borderColor: colors.dockBorder,
    backgroundColor: colors.dockBackground,
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(0,0,0,0.35)' },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: { boxShadow: '0 4px 16px rgba(0,0,0,0.35)' },
    }),
  },
  actionItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    minWidth: 52,
  },
  actionItemActive: {},
  actionActiveTide: {
    width: 40,
    height: 40,
    borderRadius: 20,
    ...Platform.select({
      web: { boxShadow: '0 3px 14px rgba(16, 185, 129, 0.4)' },
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
      default: { boxShadow: '0 3px 14px rgba(16, 185, 129, 0.4)' },
    }),
  },
  actionActiveTideInner: { flex: 1 },
  actionActivePressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
  actionItemPressed: { opacity: 0.85 },
  actionLabel: {
    ...typography.small,
    color: colors.tabInactive,
    marginTop: 2,
    fontSize: 11,
  },
  actionLabelActive: {
    color: colors.primary,
    fontWeight: '600',
  },

  /* Text-free AI */
  aiCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  aiCardOpen: {
    borderColor: colors.primaryBorder,
  },
  aiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  aiCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiCardHeaderText: { flex: 1 },
  aiCardTitle: { ...typography.bodyBold, color: colors.text },
  aiCardSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  aiCardClip: {
    overflow: 'hidden',
  },
  aiCardBodyAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  aiInputWrap: {
    position: 'relative',
    marginTop: spacing.md,
  },
  aiInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg + spacing.xs,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  aiInputCounter: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.xs,
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  aiSubmit: { marginTop: spacing.md },

  /* Meal type picker */
  pickerBody: { paddingHorizontal: screenPaddingX },
  pickerTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.lg, textAlign: 'center' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerEmoji: { fontSize: 24, marginRight: spacing.md },
  pickerLabel: { ...typography.bodyBold, color: colors.text, flex: 1 },

  /* Vista previa alimento / comida */
  pvBody: { alignItems: 'center' as const, paddingHorizontal: screenPaddingX, paddingBottom: spacing.md },
  pvMealHeaderWrap: {
    position: 'relative' as const,
    width: '100%' as unknown as number,
    alignSelf: 'stretch' as const,
  },
  pvMealFavBtn: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    zIndex: 2,
    padding: 4,
  },
  pvFooterRow: {
    width: '100%' as unknown as number,
    marginTop: spacing.xs,
  },
  pvLabel: {
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 2,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  pvQtyLabel: {
    ...typography.captionBold,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: spacing.sm,
    width: '100%' as unknown as number,
  },
  pvName: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' as const, marginBottom: 4 },
  pvGramsSubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center' as const, marginBottom: spacing.lg },
  pvServing: { ...typography.body, color: colors.textSecondary, textAlign: 'center' as const, marginBottom: spacing.lg },
  pvSubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' as const, marginBottom: spacing.md },
  pvHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' as const, marginBottom: spacing.sm },
  pvQtyRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'nowrap' as const,
    width: '100%' as unknown as number,
    gap: 4,
  },
  pvQtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1F222A',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pvQtyInput: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: Platform.OS === 'android' ? 2 : 0,
    paddingHorizontal: 0,
    margin: 0,
    flex: 1,
    minWidth: 56,
    includeFontPadding: false,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '55',
  },
  pvUnitTrigger: {
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '10',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    minHeight: 0,
    gap: 1,
  },
  pvUnitTriggerText: {
    ...typography.body,
    color: colors.primary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700' as const,
  },
  pvScroll: { maxHeight: 240, width: '100%' as unknown as number, marginBottom: spacing.sm },
  pvDivider: { width: 40, height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  pvMealItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: hairlineWidth,
    borderBottomColor: colors.border,
    width: '100%' as unknown as number,
    gap: spacing.sm,
  },
  pvMealItemEmoji: { fontSize: 24, width: 32, textAlign: 'center' as const },
  pvMealItemInfo: { flex: 1, minWidth: 0 },
  pvMealItemName: { ...typography.bodyBold, color: colors.text },
  pvMealItemMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  pvMealItemRemove: { padding: 4 },

  /* Food row with actions (resultados) */
  foodRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickAddBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  /* Quick-add food name in picker */
  quickAddFoodName: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },

  /* Create food button */
  createFoodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  createFoodIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createFoodTextWrap: { flex: 1 },
  createFoodBtnTitle: { ...typography.bodyBold, color: colors.text },
  createFoodBtnSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  /* Custom food long-press action sheet */
  cfMenuBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  cfMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    borderBottomWidth: hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.lg,
  },
  cfMenuIconWrap: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cfMenuIcon: {
    fontSize: 30,
    lineHeight: 34,
  },
  cfMenuHeaderText: {
    flex: 1,
  },
  cfMenuOverline: {
    ...typography.caption,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
    marginBottom: 2,
  },
  cfMenuTitle: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 18,
    lineHeight: 22,
  },
  cfMenuSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  cfMenuActions: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  cfMenuAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  cfMenuActionPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  cfMenuActionIcon: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cfMenuActionIconEdit: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  cfMenuActionIconDelete: {
    backgroundColor: colors.dangerMuted,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  cfMenuActionText: {
    flex: 1,
  },
  cfMenuActionTitle: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 16,
  },
  cfMenuActionTitleDanger: {
    color: colors.error,
  },
  cfMenuActionDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cfMenuCancel: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cfMenuCancelPressed: {
    opacity: 0.7,
  },
  cfMenuCancelText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    fontSize: 15,
  },
});

