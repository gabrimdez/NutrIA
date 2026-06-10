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
  KeyboardAvoidingView,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { Button, Surface, UnitPicker, MainTabBarClone, SearchActionBar, PressableScale, ScreenFocusProvider, SlideUpView, TideGradientFrame, MealTypePickerSheet } from '../../src/components';
import { AnimatedFavoriteButton } from '../../src/components/ui/AnimatedFavoriteButton';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  screenPaddingX,
  hairlineWidth,
  DOCK_MARGIN_BOTTOM,
  primaryCtaPressed,
  actionIntentStyles,
} from '../../src/theme';
import { FoodItem, MealItem, MealEntry, DayDiary, NutritionSearchResponse, PhotoAnalysis, SavedMeal, CustomFood, Profile } from '../../src/types';
import {
  kcalFromMacros,
  macrosFromPer100g,
  Per100g,
  scaleMacrosToGrams,
  roundMacroG,
  formatMacroGForInput,
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
} from '../../src/lib/mealDisplay';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { MacroSummarySection } from '../../src/components/ui/MacroSummaryPreview';
import { FoodPreviewHero } from '../../src/components/ui/FoodPreviewHero';
import { MealItemIconMedia } from '../../src/components/ui/MealItemIconMedia';
import { parseLocalYmd, resolvedDiaryYmd, toLocalYmd } from '../../src/lib/diaryDate';
import { type FoodUnit, toGrams, fromGrams, availableUnitsForFood } from '../../src/lib/foodUnits';
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

type SelectedLine = {
  key: string;
  mealItem: MealItem;
  per100?: Per100g;
  servingSizeG?: number;
};

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type TabKey = 'database' | 'favorites' | 'created';

type FoodPreviewSheet =
  | { mode: 'diary_food'; mealItem: MealItem }
  | { mode: 'diary_meal'; meal: MealEntry }
  | { mode: 'catalog'; food: FoodItem }
  | { mode: 'saved_meal'; saved: SavedMeal };

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
  const queryClient = useQueryClient();
  const { meal_type: mealTypeParam, date: dateParam, section: sectionParam } = useLocalSearchParams<{
    meal_type?: string;
    date?: string;
    section?: string;
  }>();
  const diaryDateStr = useMemo(() => resolvedDiaryYmd(dateParam), [dateParam]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [lines, setLines] = useState<SelectedLine[]>([]);
  const [mealType, setMealType] = useState<MealTypeOrderKey>(() => parseMealTypeParam(mealTypeParam));
  const [activeTab, setActiveTab] = useState<TabKey>('database');
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const optionsBtnRef = useRef<View>(null);
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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

  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<MealItem | null>(null);
  const [draftPer100, setDraftPer100] = useState<Per100g | undefined>(undefined);
  const [draftGrams, setDraftGrams] = useState('');
  const [draftUnit, setDraftUnit] = useState<FoodUnit>('g');
  const [draftServingSizeG, setDraftServingSizeG] = useState<number | undefined>(undefined);
  const [draftMacroStr, setDraftMacroStr] = useState({
    protein_g: '',
    carbs_g: '',
    fat_g: '',
  });

  // Text-free meal description
  const [showTextFree, setShowTextFree] = useState(false);
  const [textFreeInput, setTextFreeInput] = useState('');

  // Meal type picker (unified)
  const [showMealPicker, setShowMealPicker] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<MealTypeOrderKey>(mealType);
  const [foodPreview, setFoodPreview] = useState<FoodPreviewSheet | null>(null);
  const [previewItems, setPreviewItems] = useState<MealItem[]>([]);
  const [previewGrams, setPreviewGrams] = useState('100');
  const [previewUnit, setPreviewUnit] = useState<FoodUnit>('g');
  const [previewServingSizeG, setPreviewServingSizeG] = useState<number | undefined>(undefined);
  const [previewPer100, setPreviewPer100] = useState<Per100g | undefined>(undefined);
  const [previewMealItem, setPreviewMealItem] = useState<MealItem | null>(null);
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

  const addLineFromRecentItem = useCallback((mealItem: MealItem) => {
    setLines((prev) => [...prev, { key: newKey(), mealItem }]);
  }, []);

  const addLinesFromRecentMeal = useCallback((meal: MealEntry) => {
    const newLines: SelectedLine[] = meal.items.map((si) => ({
      key: newKey(),
      mealItem: lineMealItemFromDiaryItem(si),
    }));
    setLines((prev) => [...prev, ...newLines]);
  }, []);

  const onPreviewQtyChange = useCallback(
    (text: string) => {
      setPreviewGrams(text);
      const raw = Math.max(0, parseFloat(text.replace(',', '.')) || 0);
      const g = Math.round(toGrams(raw, previewUnit, previewServingSizeG));
      if (!previewMealItem || !previewPer100) return;
      const m = macrosFromPer100g(g, previewPer100);
      setPreviewMealItem({ ...previewMealItem, ...m });
    },
    [previewMealItem, previewPer100, previewUnit, previewServingSizeG],
  );

  const onPreviewUnitChange = useCallback(
    (newUnit: FoodUnit) => {
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
    },
    [previewGrams, previewUnit, previewServingSizeG, previewMealItem, previewPer100],
  );

  const openDiaryFoodPreview = useCallback(
    (mi: MealItem) => {
      rehydrateSingleItemPreview(mi);
      setFoodPreview({ mode: 'diary_food', mealItem: mi });
    },
    [rehydrateSingleItemPreview],
  );

  const openSavedMealPreview = useCallback((saved: SavedMeal) => {
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
  }, [rehydrateSingleItemPreview]);

  const openCatalogFoodPreview = useCallback((food: FoodItem) => {
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
  }, []);

  const clearPreviewPortionState = useCallback(() => {
    setPreviewMealItem(null);
    setPreviewPer100(undefined);
  }, []);

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
    mutationFn: (overrideMealType: MealTypeOrderKey) =>
      api.post('/api/v1/meals/confirm', {
        date: diaryDateStr,
        meal_type: overrideMealType,
        items: lines.map((l) => l.mealItem),
      }),
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      router.back();
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

  const addFood = (food: FoodItem, grams: number = 100) => {
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
    setLines((prev) => [...prev, { key: newKey(), mealItem: item, per100, servingSizeG: food.serving_size_g }]);
  };

  const useSavedMeal = (saved: SavedMeal) => {
    const newLines: SelectedLine[] = saved.items.map((si) => ({
      key: newKey(),
      mealItem: {
        food_catalog_id: si.food_catalog_id,
        custom_name: si.custom_name ?? 'Alimento',
        grams: si.grams,
        kcal: si.kcal,
        protein_g: si.protein_g,
        carbs_g: si.carbs_g,
        fat_g: si.fat_g,
      },
    }));
    setLines((prev) => [...prev, ...newLines]);
    setActiveTab('database');
  };

  const addCustomFood = (cf: CustomFood, grams: number = 100) => {
    const per100: Per100g = {
      kcal_per_100g: cf.kcal_per_100g,
      protein_per_100g: cf.protein_per_100g,
      carbs_per_100g: cf.carbs_per_100g,
      fat_per_100g: cf.fat_per_100g,
    };
    const m = macrosFromPer100g(grams, per100);
    const item: MealItem = {
      custom_name: mealItemCustomNameWithLeadingIcon(cf.name, cf.icon ?? null),
      grams: m.grams,
      kcal: m.kcal,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
    };
    setLines((prev) => [...prev, { key: newKey(), mealItem: item, per100 }]);
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const openEdit = (line: SelectedLine) => {
    setEditKey(line.key);
    const mi = line.mealItem;
    const grams = Math.max(0, Math.round(mi.grams));
    setDraft({
      ...mi,
      grams,
      protein_g: roundMacroG(mi.protein_g),
      carbs_g: roundMacroG(mi.carbs_g),
      fat_g: roundMacroG(mi.fat_g),
      kcal: kcalFromMacros(
        roundMacroG(mi.protein_g),
        roundMacroG(mi.carbs_g),
        roundMacroG(mi.fat_g),
      ),
    });
    setDraftPer100(line.per100);
    setDraftUnit('g');
    setDraftServingSizeG(line.servingSizeG);
    setDraftGrams(String(grams));
    setDraftMacroStr({
      protein_g: formatMacroGForInput(mi.protein_g),
      carbs_g: formatMacroGForInput(mi.carbs_g),
      fat_g: formatMacroGForInput(mi.fat_g),
    });
  };

  const closeEdit = () => {
    setEditKey(null);
    setDraft(null);
    setDraftPer100(undefined);
    setDraftUnit('g');
    setDraftServingSizeG(undefined);
    setDraftMacroStr({ protein_g: '', carbs_g: '', fat_g: '' });
  };

  const onDraftQtyChange = (text: string) => {
    setDraftGrams(text);
    const raw = Math.max(0, parseFloat(text.replace(',', '.')) || 0);
    const g = Math.round(toGrams(raw, draftUnit, draftServingSizeG));
    if (!draft) return;
    if (draftPer100) {
      const m = macrosFromPer100g(g, draftPer100);
      setDraft({ ...draft, ...m });
      setDraftMacroStr({
        protein_g: formatMacroGForInput(m.protein_g),
        carbs_g: formatMacroGForInput(m.carbs_g),
        fat_g: formatMacroGForInput(m.fat_g),
      });
    } else {
      const s = scaleMacrosToGrams(draft.grams, g, draft.kcal, draft.protein_g, draft.carbs_g, draft.fat_g);
      setDraft({ ...draft, ...s });
      setDraftMacroStr({
        protein_g: formatMacroGForInput(s.protein_g),
        carbs_g: formatMacroGForInput(s.carbs_g),
        fat_g: formatMacroGForInput(s.fat_g),
      });
    }
  };

  const onDraftUnitChange = (newUnit: FoodUnit) => {
    const raw = parseFloat(draftGrams.replace(',', '.')) || 0;
    const currentGrams = toGrams(raw, draftUnit, draftServingSizeG);
    const converted = fromGrams(currentGrams, newUnit, draftServingSizeG);
    setDraftUnit(newUnit);
    setDraftGrams(String(Math.round(converted * 100) / 100));
  };

  const onDraftMacro = (field: 'protein_g' | 'carbs_g' | 'fat_g', text: string) => {
    setDraftMacroStr((prev) => ({ ...prev, [field]: text }));
    const v = parseFloat(text.replace(',', '.'));
    const num = text.trim() === '' || Number.isNaN(v) ? 0 : roundMacroG(v);
    if (!draft) return;
    const next = { ...draft, [field]: num };
    next.kcal = kcalFromMacros(next.protein_g, next.carbs_g, next.fat_g);
    setDraft(next);
  };

  const applyDraft = () => {
    if (!draft || !editKey) return;
    const raw = parseFloat(draftGrams.replace(',', '.')) || 0;
    const grams = Math.max(0, Math.round(toGrams(raw, draftUnit, draftServingSizeG) || draft.grams));
    const p = roundMacroG(draft.protein_g);
    const c = roundMacroG(draft.carbs_g);
    const f = roundMacroG(draft.fat_g);
    const kcal = kcalFromMacros(p, c, f);
    setLines((prev) =>
      prev.map((l) =>
        l.key === editKey
          ? {
              ...l,
              mealItem: { ...draft, grams, protein_g: p, carbs_g: c, fat_g: f, kcal },
              per100: draftPer100,
            }
          : l,
      ),
    );
    closeEdit();
  };

  const totals = useMemo(
    () =>
      lines.reduce(
        (acc, l) => ({
          kcal: acc.kcal + l.mealItem.kcal,
          p: acc.p + l.mealItem.protein_g,
          c: acc.c + l.mealItem.carbs_g,
          f: acc.f + l.mealItem.fat_g,
        }),
        { kcal: 0, p: 0, c: 0, f: 0 },
      ),
    [lines],
  );

  const tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'database', label: 'Base de Datos', icon: 'library-outline' },
    { key: 'favorites', label: 'Favoritos', icon: 'heart' },
    { key: 'created', label: 'Creados', icon: 'star' },
  ];

  const goRecipes = useCallback(() =>
    router.push(
      `/add-meal/recipes?meal_type=${encodeURIComponent(mealType)}&date=${encodeURIComponent(diaryDateStr)}` as never,
    ), [mealType, diaryDateStr]);

  const goScanner = useCallback(() =>
    router.push(
      `/scanner?meal_type=${encodeURIComponent(mealType)}&date=${encodeURIComponent(diaryDateStr)}` as never,
    ), [mealType, diaryDateStr]);

  const showResults = hasSearched && results.length > 0;
  const showEmptySearch = hasSearched && !searchMutation.isPending && !searchMutation.isError && results.length === 0;

  return (
    <ScreenFocusProvider>
      <SlideUpView style={s.root} duration={580} distance={28}>
      {/* ── Search bar ── */}
      <View style={s.searchBarWrap}>
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

      {/* ── Tab bar ── */}
      <View style={s.tabBar}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[s.tab, active && s.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={active ? colors.text : colors.textMuted}
                style={{ marginRight: 5 }}
              />
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Main scrollable area ── */}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Analiza tu comida (IA) — debajo de pestañas, pestaña Base de datos */}
        {activeTab === 'database' && !showResults && (
          <View style={s.section}>
            <PressableScale
              style={s.textFreeToggle}
              scaleTo={0.985}
              onPress={() => setShowTextFree((p) => !p)}
            >
              <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
              <Text style={s.textFreeToggleLabel}>Analiza tu comida</Text>
              <Ionicons
                name={showTextFree ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textMuted}
              />
            </PressableScale>
            {showTextFree && (
              <Animated.View
                entering={FadeInDown.duration(280)}
                style={s.textFreeBody}
              >
                <Text style={s.textFreeHint}>
                  Escribe lo que comiste y la IA calculará calorías y macros por ti.
                </Text>
                <TextInput
                  style={s.textFreeInput}
                  value={textFreeInput}
                  onChangeText={setTextFreeInput}
                  placeholder='Ej: "100g de arroz en crudo y 200g de pollo a la plancha"'
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={500}
                  editable={!textFreeMutation.isPending}
                />
                <Button
                  title={textFreeMutation.isPending ? 'Analizando...' : 'Analizar con IA'}
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
                  style={{ marginTop: spacing.sm }}
                />
              </Animated.View>
            )}
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
                  Cuando guardes comidas en tu diario, verás aquí atajos para repetirlas. También puedes buscar en la base de datos arriba.
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
                        : mealItemVisualIconForLookupName(strippedName);
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
                            <Text style={s.foodBrand} numberOfLines={1}>Del diario</Text>
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
                        onPress={() => setFoodPreview({ mode: 'diary_meal', meal: row.entry })}
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
                        onPress={() => setFoodPreview({ mode: 'diary_meal', meal: row.entry })}
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

        {/* Selected lines ("Tu comida") — always visible regardless of tab */}
        {lines.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Tu comida</Text>
            <Text style={s.sectionSubtitle}>
              {lines.length} alimento{lines.length !== 1 ? 's' : ''} · {Math.round(totals.kcal)} kcal · P:
              {Math.round(totals.p)} C:{Math.round(totals.c)} G:{Math.round(totals.f)}
            </Text>
            {lines.map((line) => (
              <Surface key={line.key} variant="subtle" style={s.lineCard} padding="sm">
                <TouchableOpacity onPress={() => openEdit(line)} activeOpacity={0.85}>
                  <Text style={s.lineName}>{mealItemDisplayLineForUi(line.mealItem.custom_name || 'Alimento')}</Text>
                  <Text style={s.lineDetail}>
                    {line.mealItem.grams} g · P:{Math.round(line.mealItem.protein_g)} C:
                    {Math.round(line.mealItem.carbs_g)} G:{Math.round(line.mealItem.fat_g)}
                  </Text>
                  <Text style={s.lineKcal}>{Math.round(line.mealItem.kcal)} kcal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.lineRemove} onPress={() => removeLine(line.key)} hitSlop={12}>
                  <Ionicons name="close-circle" size={22} color={colors.error} />
                </TouchableOpacity>
              </Surface>
            ))}
          </View>
        )}

        {/* ── TAB: Database ── */}
        {activeTab === 'database' && (
          <>
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
                  <TouchableOpacity
                    key={item.id ?? `${item.provider}-${item.external_id ?? item.barcode ?? item.name}-${index}`}
                    style={s.foodRow}
                    onPress={() => openCatalogFoodPreview(item)}
                    activeOpacity={0.85}
                  >
                    <MealItemIconMedia
                      visual={mealItemVisualIconForLookupName(item.name_es || item.name)}
                      emojiStyle={s.foodEmoji}
                      imageSize={26}
                    />
                    <View style={s.foodInfo}>
                      <Text style={s.foodName} numberOfLines={1}>{capitalizeFirstChar(item.name_es || item.name || '')}</Text>
                      <Text style={s.foodBrand} numberOfLines={1}>{item.provider || 'Alimento general'}</Text>
                    </View>
                    <View style={s.foodRight}>
                      <Text style={s.foodServing}>{formatServingDisplay(item)}</Text>
                      <Text style={s.foodKcal}>{Math.round(item.kcal_per_100g)} kcal</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {/* ── TAB: Favorites (saved meals) ── */}
        {activeTab === 'favorites' && (
          <View style={s.section}>
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
                onPress={() => openSavedMealPreview(saved)}
                activeOpacity={0.85}
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
          </View>
        )}

        {/* ── TAB: Created (custom foods) ── */}
        {activeTab === 'created' && (
          <View style={s.section}>
            <TouchableOpacity
              style={s.createFoodBtn}
              onPress={() =>
                router.push({
                  pathname: '/add-meal/create-food',
                  params: { meal_type: mealType, date: diaryDateStr },
                })
              }
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              <Text style={s.createFoodBtnText}>Crear nuevo alimento</Text>
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
              <View key={cf.id} style={s.foodRow}>
                <MealItemIconMedia
                  visual={
                    cf.icon?.trim()
                      ? { kind: 'emoji' as const, emoji: cf.icon.trim() }
                      : mealItemVisualIconForLookupName(cf.name)
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
                <View style={s.cfActions}>
                  <Text style={s.foodKcal}>{Math.round(cf.kcal_per_100g)} kcal</Text>
                  <View style={s.cfBtnRow}>
                    <TouchableOpacity
                      style={s.cfBtn}
                      onPress={() =>
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
                        })
                      }
                      activeOpacity={0.85}
                      hitSlop={6}
                    >
                      <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <Pressable
                      style={({ pressed }) => [s.cfBtnTideOuter, pressed && primaryCtaPressed]}
                      onPress={() => addCustomFood(cf)}
                      hitSlop={6}
                    >
                      <TideGradientFrame
                        borderRadius={15}
                        style={s.cfBtnTide}
                        contentContainerStyle={s.cfBtnTideInner}
                      >
                        <Ionicons name="add" size={18} color="#fff" />
                      </TideGradientFrame>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Footer: save button when items selected ── */}
      {lines.length > 0 && (
        <View style={s.saveFooter}>
          <Button title="Guardar comida" onPress={() => setShowMealPicker(true)} loading={saveMutation.isPending} />
        </View>
      )}

      {/* ── Bottom bars stack ── */}
      <View
        style={[
          s.bottomStack,
          { paddingBottom: Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) },
        ]}
      >
        <SearchActionBar active="search" onRecipes={goRecipes} onScanner={goScanner} />
        <MainTabBarClone floating={false} activeTab="search" mealType={mealType} diaryDateStr={diaryDateStr} />
      </View>

      {/* ── Edit modal (unchanged logic) ── */}
      <Modal visible={!!draft && !!editKey} animationType="slide" transparent>
        <Pressable style={s.modalBackdrop} onPress={closeEdit}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <View style={s.modalTitleRow}>
              <Text style={[s.modalTitle, { flex: 1 }]}>{mealItemDisplayLineForUi(draft?.custom_name || 'Alimento')}</Text>
              {(() => {
                const draftFavName = draft ? (draft.custom_name || 'Alimento').split(/\s*[—·|]\s*/)[0]?.trim() || 'Alimento' : '';
                const draftIsFav = savedMealsQuery.data?.some((s) => s.name === draftFavName) ?? false;
                return (
                  <Pressable
                    onPress={() => {
                      if (!draft || draftIsFav) return;
                      const name = draftFavName;
                      const item: Record<string, unknown> = {
                        custom_name: draft.custom_name,
                        grams: Math.max(0, draft.grams),
                        kcal: Math.max(0, Math.round(kcalFromMacros(draft.protein_g, draft.carbs_g, draft.fat_g))),
                        protein_g: Math.max(0, draft.protein_g),
                        carbs_g: Math.max(0, draft.carbs_g),
                        fat_g: Math.max(0, draft.fat_g),
                      };
                      if (draft.food_catalog_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draft.food_catalog_id)) {
                        item.food_catalog_id = draft.food_catalog_id;
                      }
                      api.post('/api/v1/meals/saved', { name, items: [item] }).then(() => {
                        queryClient.invalidateQueries({ queryKey: ['savedMeals'] });
                        Alert.alert('Guardado', `«${name}» añadido a favoritos`);
                      }).catch((e: unknown) => {
                        Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo guardar'));
                      });
                    }}
                    disabled={draftIsFav}
                    style={({ pressed }) => [s.modalFavBtn, pressed && !draftIsFav && { opacity: 0.7 }]}
                    accessibilityLabel="Guardar en favoritos"
                  >
                    <Ionicons name={draftIsFav ? 'heart' : 'heart-outline'} size={22} color={draftIsFav ? '#22C55E' : colors.primary} />
                  </Pressable>
                );
              })()}
            </View>
            <Text style={s.modalLabel}>Cantidad</Text>
            <View style={s.modalQtyRow}>
              <TextInput
                style={[s.modalInput, s.modalQtyInput]}
                value={draftGrams}
                onChangeText={onDraftQtyChange}
                keyboardType="decimal-pad"
              />
              <UnitPicker
                value={draftUnit}
                onChange={onDraftUnitChange}
                availableUnits={availableUnitsForFood(draftServingSizeG)}
              />
            </View>
            <Text style={s.modalLabel}>Proteína (g)</Text>
            <TextInput
              style={s.modalInput}
              value={draftMacroStr.protein_g}
              onChangeText={(t) => onDraftMacro('protein_g', t)}
              keyboardType="decimal-pad"
            />
            <Text style={s.modalLabel}>Carbohidratos (g)</Text>
            <TextInput
              style={s.modalInput}
              value={draftMacroStr.carbs_g}
              onChangeText={(t) => onDraftMacro('carbs_g', t)}
              keyboardType="decimal-pad"
            />
            <Text style={s.modalLabel}>Grasas (g)</Text>
            <TextInput
              style={s.modalInput}
              value={draftMacroStr.fat_g}
              onChangeText={(t) => onDraftMacro('fat_g', t)}
              keyboardType="decimal-pad"
            />
            <Text style={s.modalKcal}>
              ≈{' '}
              {draft
                ? Math.round(kcalFromMacros(draft.protein_g, draft.carbs_g, draft.fat_g))
                : 0}{' '}
              kcal
            </Text>
            <View style={[actionIntentStyles.row, { marginTop: spacing.lg }]}>
              <Button variant="actionCancel" title="Cancelar" onPress={closeEdit} />
              <Button variant="actionConfirm" title="Listo" onPress={applyDraft} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Vista previa (recientes / resultados) ── */}
      <BottomSheet
        visible={!!foodPreview}
        onDismiss={() => {
          setFoodPreview(null);
          clearPreviewPortionState();
        }}
        maxHeightFraction={0.78}
      >
        {foodPreview?.mode === 'diary_food' && (() => {
          const base = foodPreview.mealItem;
          const mi = previewMealItem ?? base;
          const rawQty = parseFloat(previewGrams.replace(',', '.')) || 0;
          const displayGrams = Math.round(toGrams(rawQty, previewUnit, previewServingSizeG));
          const itemFavName = (base.custom_name || 'Alimento').split(/\s*[—·|]\s*/)[0]?.trim() || 'Alimento';
          const savedItemFav = savedMealsQuery.data?.find((sm) => sm.name === itemFavName);
          const isItemFav = Boolean(savedItemFav);
          const itemFavBusy = saveMealFavMutation.isPending || deleteMealFavMutation.isPending;
          const onItemFavPress = () => {
            if (savedItemFav) {
              deleteMealFavMutation.mutate(savedItemFav.id);
              return;
            }
            const src = previewMealItem ?? base;
            const toSave: MealItem = {
              custom_name: src.custom_name ?? 'Alimento',
              grams: Math.max(0, Math.round(src.grams)),
              kcal: Math.max(0, Math.round(kcalFromMacros(src.protein_g, src.carbs_g, src.fat_g))),
              protein_g: Math.max(0, src.protein_g),
              carbs_g: Math.max(0, src.carbs_g),
              fat_g: Math.max(0, src.fat_g),
            };
            if (
              src.food_catalog_id &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(src.food_catalog_id)
            ) {
              toSave.food_catalog_id = src.food_catalog_id;
            }
            saveMealFavMutation.mutate({ name: itemFavName, items: [toSave] });
          };
          return (
            <View style={s.pvBody}>
              <View style={s.pvMealHeaderWrap}>
                <FoodPreviewHero
                  variant="diary_food"
                  nameRaw={base.custom_name || 'Alimento'}
                  compact
                  overline="Del diario"
                  title={mealItemDisplayLineForUi(base.custom_name || 'Alimento')}
                  subtitleElement={
                    <View style={s.pvQtyRow}>
                      <TextInput
                        style={s.pvQtyInput}
                        value={previewGrams}
                        onChangeText={onPreviewQtyChange}
                        keyboardType="decimal-pad"
                      />
                      <View style={s.pvQtyUnitWrap}>
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
                  onPress={() => {
                    addLineFromRecentItem(previewMealItem ?? base);
                    setFoodPreview(null);
                    clearPreviewPortionState();
                  }}
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
                    addLinesFromRecentMeal(fakeEntry);
                    setFoodPreview(null);
                    clearPreviewPortionState();
                  }}
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
                        <View style={s.pvQtyUnitWrap}>
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
                        : previewItems.map((mi) => lineMealItemFromDiaryItem(mi));
                    const newLines: SelectedLine[] = items.map((mi) => ({
                      key: newKey(),
                      mealItem: { ...mi },
                    }));
                    setLines((prev) => [...prev, ...newLines]);
                    setActiveTab('database');
                    setFoodPreview(null);
                    clearPreviewPortionState();
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
                  subtitle={previewPer100 ? undefined : `${food.provider || 'Alimento general'} · ${formatServingDisplay(food)}`}
                  subtitleElement={
                    previewPer100 ? (
                      <View style={s.pvQtyRow}>
                        <TextInput
                          style={s.pvQtyInput}
                          value={previewGrams}
                          onChangeText={onPreviewQtyChange}
                          keyboardType="decimal-pad"
                        />
                        <View style={s.pvQtyUnitWrap}>
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
                      </View>
                    ) : undefined
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
                  onPress={() => {
                    if (!previewMealItem || !previewPer100) {
                      setFoodPreview(null);
                      clearPreviewPortionState();
                      return;
                    }
                    setLines((prev) => [
                      ...prev,
                      {
                        key: newKey(),
                        mealItem: lineMealItemFromDiaryItem(previewMealItem),
                        per100: previewPer100,
                        servingSizeG: previewServingSizeG,
                      },
                    ]);
                    setActiveTab('database');
                    setFoodPreview(null);
                    clearPreviewPortionState();
                  }}
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
        onDismiss={() => setShowMealPicker(false)}
        onSelect={(mealTypeToSave) => {
          setSelectedMealType(mealTypeToSave);
          setShowMealPicker(false);
          saveMutation.mutate(mealTypeToSave);
        }}
      />
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

  /* Bottom bars wrapper */
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

  /* Search bar */
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenPaddingX,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
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
    backgroundColor: 'rgba(0,0,0,0.45)',
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
  scrollContent: { paddingBottom: 240 },

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

  /* Selected lines */
  lineCard: { marginBottom: spacing.sm, position: 'relative' },
  lineName: { ...typography.bodyBold, color: colors.text, paddingRight: 36 },
  lineDetail: { ...typography.small, color: colors.textMuted, marginTop: 4 },
  lineKcal: { ...typography.captionBold, color: colors.calories, marginTop: 4 },
  lineRemove: { position: 'absolute', right: spacing.sm, top: spacing.sm },

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

  /* Save footer */
  saveFooter: {
    padding: spacing.lg,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },


  /* Modal */
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  modalTitle: { ...typography.h3, color: colors.text },
  modalFavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.28)',
  },
  modalLabel: { ...typography.captionBold, color: colors.textMuted, marginTop: spacing.sm },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    color: colors.text,
    marginTop: 4,
  },
  modalQtyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
    marginTop: 4,
  },
  modalQtyInput: {
    flex: 1,
    marginTop: 0,
  },
  modalKcal: { ...typography.bodyBold, color: colors.calories, marginTop: spacing.md },

  /* Text-free AI */
  textFreeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textFreeToggleLabel: { ...typography.bodyBold, color: colors.primary, flex: 1 },
  textFreeBody: { marginTop: spacing.sm },
  textFreeHint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  textFreeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    color: colors.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },

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
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  pvName: { ...typography.h2, color: colors.text, textAlign: 'center' as const, marginBottom: 2 },
  pvServing: { ...typography.body, color: colors.textSecondary, textAlign: 'center' as const, marginBottom: spacing.lg },
  pvSubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' as const, marginBottom: spacing.md },
  pvHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' as const, marginBottom: spacing.sm },
  pvQtyRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'nowrap' as const,
    width: '100%' as unknown as number,
    gap: 6,
  },
  pvQtyUnitWrap: {
    flexShrink: 0 as const,
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
    minHeight: 22,
    flexShrink: 1,
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

  /* Create food button */
  createFoodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    marginBottom: spacing.md,
  },
  createFoodBtnText: { ...typography.bodyBold, color: colors.primary },

  /* Custom food row actions */
  cfActions: { alignItems: 'flex-end', gap: 4 },
  cfBtnRow: { flexDirection: 'row', gap: 8 },
  cfBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cfBtnTideOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
  },
  cfBtnTide: {
    width: 30,
    height: 30,
  },
  cfBtnTideInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

