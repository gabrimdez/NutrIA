import React, { createContext, useContext, useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Alert, Keyboard, Platform } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { api } from '../../../src/lib/api';
import { PhotoAnalysis, PhotoAnalysisItem } from '../../../src/types';
import { scaleMacrosToGrams, kcalFromMacros, roundMacroG } from '../../../src/lib/mealItemMath';
import { invalidateMealRelatedQueries } from '../../../src/lib/mealQueryInvalidation';
import { parseMealTypeParam, type MealTypeOrderKey } from '../../../src/lib/mealDisplay';
import { resolvedDiaryYmd } from '../../../src/lib/diaryDate';
import { type FoodUnit } from '../../../src/lib/foodUnits';
import { alertVisionQuotaExceeded, isVisionQuotaErrorMessage } from '../../../src/lib/visionQuotaAlert';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';
import { finiteNumber, parseJsonRouteParam } from '../../../src/lib/routeParamJson';

type NutritionScaleBase = {
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type EditablePhotoAnalysisItem = PhotoAnalysisItem & {
  _nutritionBase?: NutritionScaleBase;
};

function nutritionBaseFromItem(item: PhotoAnalysisItem): NutritionScaleBase {
  return {
    grams: Math.max(0, item.estimated_grams),
    kcal: item.kcal,
    protein_g: item.protein_g,
    carbs_g: item.carbs_g,
    fat_g: item.fat_g,
  };
}

export function withNutritionBase(item: PhotoAnalysisItem): EditablePhotoAnalysisItem {
  return { ...item, _nutritionBase: nutritionBaseFromItem(item) };
}

function nutritionBaseForItem(item: EditablePhotoAnalysisItem): NutritionScaleBase {
  return item._nutritionBase ?? nutritionBaseFromItem(item);
}

function stringArray(value: unknown, maxItems: number): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string').slice(0, maxItems)
    : [];
}

function photoAnalysisFromParam(value: unknown): PhotoAnalysis | null {
  const parsed = parseJsonRouteParam<Record<string, unknown>>(value, 48_000);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return null;
  const items = parsed.items
    .slice(0, 80)
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      detected_name: typeof item.detected_name === 'string' ? item.detected_name : '',
      normalized_name: typeof item.normalized_name === 'string' ? item.normalized_name : '',
      matched_food_id: typeof item.matched_food_id === 'string' ? item.matched_food_id : undefined,
      provider: typeof item.provider === 'string' ? item.provider : undefined,
      estimated_grams: finiteNumber(item.estimated_grams, 0, 0, 5000),
      kcal: finiteNumber(item.kcal, 0, 0, 20000),
      protein_g: finiteNumber(item.protein_g, 0, 0, 2000),
      carbs_g: finiteNumber(item.carbs_g, 0, 0, 2000),
      fat_g: finiteNumber(item.fat_g, 0, 0, 2000),
      confidence: typeof item.confidence === 'string' ? item.confidence : 'low',
      assumptions: stringArray(item.assumptions, 10),
    }))
    .filter((item) => item.detected_name || item.normalized_name);
  if (!items.length) return null;
  return {
    meal_name: typeof parsed.meal_name === 'string' ? parsed.meal_name : 'Comida',
    items,
    total_kcal: finiteNumber(parsed.total_kcal),
    total_protein_g: finiteNumber(parsed.total_protein_g),
    total_carbs_g: finiteNumber(parsed.total_carbs_g),
    total_fat_g: finiteNumber(parsed.total_fat_g),
    overall_confidence: typeof parsed.overall_confidence === 'string' ? parsed.overall_confidence : 'low',
    notes: stringArray(parsed.notes, 20),
    photo_url: typeof parsed.photo_url === 'string' ? parsed.photo_url : undefined,
  };
}

export type PhotoMealContextValue = {
  insets: EdgeInsets;
  kbHeight: number;
  setKbHeight: (h: number) => void;
  mealType: MealTypeOrderKey;
  diaryDateStr: string;
  importUriParam: string | undefined;
  importAnalysisParam: string | undefined;
  imageUri: string | null;
  setImageUri: React.Dispatch<React.SetStateAction<string | null>>;
  analysis: PhotoAnalysis | null;
  setAnalysis: React.Dispatch<React.SetStateAction<PhotoAnalysis | null>>;
  items: EditablePhotoAnalysisItem[];
  setItems: React.Dispatch<React.SetStateAction<EditablePhotoAnalysisItem[]>>;
  itemUnits: FoodUnit[];
  setItemUnits: React.Dispatch<React.SetStateAction<FoodUnit[]>>;
  showMealPicker: boolean;
  setShowMealPicker: React.Dispatch<React.SetStateAction<boolean>>;
  selectedMealType: MealTypeOrderKey;
  setSelectedMealType: React.Dispatch<React.SetStateAction<MealTypeOrderKey>>;
  analyzeMutation: UseMutationResult<PhotoAnalysis, unknown, { uri: string; mimeType: string }>;
  saveMutation: UseMutationResult<unknown, unknown, MealTypeOrderKey>;
  pickImage: () => Promise<void>;
  takePhoto: () => Promise<void>;
  updateItemGrams: (index: number, grams: number) => void;
  updateItemMacro: (index: number, field: 'protein_g' | 'carbs_g' | 'fat_g', value: number) => void;
  removeItem: (index: number) => void;
  onItemUnitChange: (index: number, newUnit: FoodUnit) => void;
  setMealName: (name: string) => void;
  addManualItem: (item: { name: string; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number }) => void;
  duplicateItem: (index: number) => void;
  resetPhotoMeal: () => void;
  totals: { kcal: number; protein: number; carbs: number; fat: number };
};

const PhotoMealContext = createContext<PhotoMealContextValue | null>(null);

export function usePhotoMeal() {
  const v = useContext(PhotoMealContext);
  if (!v) throw new Error('usePhotoMeal debe usarse dentro de PhotoMealStateProvider');
  return v;
}

export function PhotoMealStateProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [kbHeight, setKbHeight] = useState(0);

  const { meal_type: mealTypeParam, date: dateParam, import_uri: importUriParam, import_analysis: importAnalysisParam } = useLocalSearchParams<{
    meal_type?: string;
    date?: string;
    import_uri?: string;
    import_analysis?: string;
  }>();
  const mealType = parseMealTypeParam(mealTypeParam);
  const diaryDateStr = useMemo(() => resolvedDiaryYmd(dateParam), [dateParam]);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [items, setItems] = useState<EditablePhotoAnalysisItem[]>([]);
  const [itemUnits, setItemUnits] = useState<FoodUnit[]>([]);

  const [showMealPicker, setShowMealPicker] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<MealTypeOrderKey>(mealType);

  const importHandledRef = useRef(false);
  const importAnalysisHandledRef = useRef(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const onHide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const prepareImageUri = useCallback(async (uri: string): Promise<string> => {
    try {
      const result = await manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.82, format: SaveFormat.JPEG },
      );
      return result.uri;
    } catch {
      return uri;
    }
  }, []);

  const analyzeMutation = useMutation({
    mutationFn: async ({ uri, mimeType }: { uri: string; mimeType: string }) => {
      const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
      const body = { image_base64: base64, mime_type: mimeType };
      try {
        return await api.post<PhotoAnalysis>('/api/v1/foods/analyze-photo', body);
      } catch {
        return await api.post<PhotoAnalysis>('/api/v1/foods/analyze-photo', body);
      }
    },
    onSuccess: (data) => {
      setAnalysis(data);
      setItems(data.items.map(withNutritionBase));
      setItemUnits(data.items.map(() => 'g' as FoodUnit));
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (isVisionQuotaErrorMessage(msg)) {
        alertVisionQuotaExceeded({ onDismiss: () => router.back() });
        return;
      }
      Alert.alert('Error', msg);
    },
  });

  useEffect(() => {
    if (!importUriParam || importHandledRef.current) return;
    importHandledRef.current = true;
    let uri = importUriParam;
    try {
      uri = decodeURIComponent(importUriParam);
    } catch {
      /* mantener tal cual */
    }
    prepareImageUri(uri).then((prepared) => {
      setImageUri(prepared);
      analyzeMutation.mutate({ uri: prepared, mimeType: 'image/jpeg' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al entrar con import_uri del escáner
  }, [importUriParam]);

  useEffect(() => {
    if (!importAnalysisParam || importAnalysisHandledRef.current) return;
    importAnalysisHandledRef.current = true;
    const parsed = photoAnalysisFromParam(importAnalysisParam);
    if (!parsed) {
      Alert.alert('Error', 'No se pudieron cargar los datos de la comida.');
      return;
    }
    setAnalysis(parsed);
    setItems(parsed.items.map(withNutritionBase));
    setItemUnits(parsed.items.map(() => 'g' as FoodUnit));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al entrar con import_analysis
  }, [importAnalysisParam]);

  const saveMutation = useMutation({
    mutationFn: (overrideMealType: MealTypeOrderKey) =>
      api.post('/api/v1/meals/confirm', {
        date: diaryDateStr,
        meal_type: overrideMealType,
        title: analysis?.meal_name,
        photo_url: analysis?.photo_url,
        items: items.map((i) => ({
          food_catalog_id: i.matched_food_id,
          custom_name: i.normalized_name,
          grams: i.estimated_grams,
          kcal: i.kcal,
          protein_g: i.protein_g,
          carbs_g: i.carbs_g,
          fat_g: i.fat_g,
        })),
        ai_confidence: analysis?.overall_confidence,
      }),
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      router.back();
    },
    onError: (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : String(e)),
  });

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      exif: false,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      const prepared = await prepareImageUri(a.uri);
      setImageUri(prepared);
      analyzeMutation.mutate({ uri: prepared, mimeType: 'image/jpeg' });
    }
  }, [analyzeMutation, prepareImageUri]);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso', 'Se necesita acceso a la cámara');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, exif: false });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      const prepared = await prepareImageUri(a.uri);
      setImageUri(prepared);
      analyzeMutation.mutate({ uri: prepared, mimeType: 'image/jpeg' });
    }
  }, [analyzeMutation, prepareImageUri]);

  const updateItemGrams = useCallback((index: number, grams: number) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      const g = Math.max(0, Math.round(grams));
      const base = nutritionBaseForItem(item);
      const scaled = scaleMacrosToGrams(base.grams, g, base.kcal, base.protein_g, base.carbs_g, base.fat_g);
      updated[index] = {
        ...item,
        estimated_grams: Math.round(scaled.grams),
        kcal: scaled.kcal,
        protein_g: scaled.protein_g,
        carbs_g: scaled.carbs_g,
        fat_g: scaled.fat_g,
        _nutritionBase: base,
      };
      return updated;
    });
  }, []);

  const updateItemMacro = useCallback((index: number, field: 'protein_g' | 'carbs_g' | 'fat_g', value: number) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      item.kcal = kcalFromMacros(item.protein_g, item.carbs_g, item.fat_g);
      item._nutritionBase = nutritionBaseFromItem(item);
      updated[index] = item;
      return updated;
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setItemUnits((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onItemUnitChange = useCallback((index: number, newUnit: FoodUnit) => {
    setItemUnits((prev) => {
      const next = [...prev];
      next[index] = newUnit;
      return next;
    });
  }, []);

  const setMealName = useCallback((name: string) => {
    const clean = name.trim() || 'Comida manual';
    setAnalysis((prev) => ({
      meal_name: clean,
      items: prev?.items ?? [],
      total_kcal: prev?.total_kcal ?? 0,
      total_protein_g: prev?.total_protein_g ?? 0,
      total_carbs_g: prev?.total_carbs_g ?? 0,
      total_fat_g: prev?.total_fat_g ?? 0,
      overall_confidence: prev?.overall_confidence ?? 'manual',
      notes: prev?.notes ?? ['Entrada manual'],
      photo_url: prev?.photo_url,
    }));
  }, []);

  const addManualItem = useCallback((manual: { name: string; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number }) => {
    const cleanName = manual.name.trim() || 'Alimento manual';
    const item = withNutritionBase({
      detected_name: cleanName,
      normalized_name: cleanName,
      estimated_grams: Math.max(0, Math.round(manual.grams)),
      kcal: Math.max(0, Math.round(manual.kcal)),
      protein_g: Math.max(0, roundMacroG(manual.protein_g)),
      carbs_g: Math.max(0, roundMacroG(manual.carbs_g)),
      fat_g: Math.max(0, roundMacroG(manual.fat_g)),
      confidence: 'manual',
      assumptions: ['A?adido manualmente'],
      provider: 'manual',
    } as PhotoAnalysisItem);

    setAnalysis((prev) =>
      prev ?? {
        meal_name: 'Comida manual',
        items: [],
        total_kcal: 0,
        total_protein_g: 0,
        total_carbs_g: 0,
        total_fat_g: 0,
        overall_confidence: 'manual',
        notes: ['Entrada manual'],
      },
    );
    setItems((prev) => [...prev, item]);
    setItemUnits((prev) => [...prev, 'g']);
  }, []);

  const duplicateItem = useCallback((index: number) => {
    setItems((prev) => {
      const item = prev[index];
      if (!item) return prev;
      return [...prev, withNutritionBase({ ...item, assumptions: [...(item.assumptions ?? []), 'Duplicado'] })];
    });
    setItemUnits((prev) => [...prev, prev[index] ?? 'g']);
  }, []);

  const resetPhotoMeal = useCallback(() => {
    setImageUri(null);
    setAnalysis(null);
    setItems([]);
    setItemUnits([]);
  }, []);

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, i) => ({
          kcal: acc.kcal + i.kcal,
          protein: acc.protein + i.protein_g,
          carbs: acc.carbs + i.carbs_g,
          fat: acc.fat + i.fat_g,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [items],
  );

  const value: PhotoMealContextValue = useMemo(
    () => ({
      insets,
      kbHeight,
      setKbHeight,
      mealType,
      diaryDateStr,
      importUriParam,
      importAnalysisParam,
      imageUri,
      setImageUri,
      analysis,
      setAnalysis,
      items,
      setItems,
      itemUnits,
      setItemUnits,
      showMealPicker,
      setShowMealPicker,
      selectedMealType,
      setSelectedMealType,
      analyzeMutation,
      saveMutation,
      pickImage,
      takePhoto,
      updateItemGrams,
      updateItemMacro,
      removeItem,
      onItemUnitChange,
      setMealName,
      addManualItem,
      duplicateItem,
      resetPhotoMeal,
      totals,
    }),
    [
      insets,
      kbHeight,
      mealType,
      diaryDateStr,
      importUriParam,
      importAnalysisParam,
      imageUri,
      analysis,
      items,
      itemUnits,
      showMealPicker,
      selectedMealType,
      analyzeMutation,
      saveMutation,
      pickImage,
      takePhoto,
      updateItemGrams,
      updateItemMacro,
      removeItem,
      onItemUnitChange,
      setMealName,
      addManualItem,
      duplicateItem,
      resetPhotoMeal,
      totals,
    ],
  );

  return <PhotoMealContext.Provider value={value}>{children}</PhotoMealContext.Provider>;
}

export default function PhotoMealContextRoute() {
  return <Redirect href="/add-meal/photo" />;
}
