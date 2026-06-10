import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from '@tanstack/react-query';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { Button, Surface, Input, LoadingScreen } from '../../src/components';
import { colors, spacing, typography, borderRadius, screenPaddingX, actionIntentStyles } from '../../src/theme';
import { PhotoAnalysis, PhotoAnalysisItem } from '../../src/types';
import { scaleMacrosToGrams, roundMacroG, kcalFromMacros, formatMacroGForInput } from '../../src/lib/mealItemMath';
import { type FoodUnit, toGrams, fromGrams } from '../../src/lib/foodUnits';
import { UnitPicker } from '../../src/components';
import { MacroSummarySection, MacroEnergySplitBar } from '../../src/components/ui/MacroSummaryPreview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alertVisionQuotaExceeded, isVisionQuotaErrorMessage } from '../../src/lib/visionQuotaAlert';

type NutritionScaleBase = {
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type EditablePhotoAnalysisItem = PhotoAnalysisItem & {
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

function withNutritionBase(item: PhotoAnalysisItem): EditablePhotoAnalysisItem {
  return { ...item, _nutritionBase: nutritionBaseFromItem(item) };
}

function nutritionBaseForItem(item: EditablePhotoAnalysisItem): NutritionScaleBase {
  return item._nutritionBase ?? nutritionBaseFromItem(item);
}

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

// ---------------------------------------------------------------------------
// Item row — adapted from photo.tsx
// ---------------------------------------------------------------------------
type RecipePhotoItemRowProps = {
  item: PhotoAnalysisItem;
  index: number;
  unit: FoodUnit;
  onGrams: (i: number, g: number) => void;
  onUnitChange: (i: number, u: FoodUnit) => void;
  onRemove: (i: number) => void;
  onMacro: (i: number, field: 'protein_g' | 'carbs_g' | 'fat_g', value: number) => void;
};

function RecipePhotoItemRow({ item, index, unit, onGrams, onUnitChange, onRemove, onMacro }: RecipePhotoItemRowProps) {
  const displayQty = fromGrams(Math.max(0, item.estimated_grams), unit);

  const [qtyText, setQtyText] = React.useState(String(Math.round(displayQty * 100) / 100));
  const [protText, setProtText] = React.useState(formatMacroGForInput(item.protein_g));
  const [carbText, setCarbText] = React.useState(formatMacroGForInput(item.carbs_g));
  const [fatText, setFatText] = React.useState(formatMacroGForInput(item.fat_g));

  const qtyFocused = React.useRef(false);
  const protFocused = React.useRef(false);
  const carbFocused = React.useRef(false);
  const fatFocused = React.useRef(false);

  React.useEffect(() => {
    if (!qtyFocused.current) setQtyText(String(Math.round(displayQty * 100) / 100));
  }, [displayQty]);
  React.useEffect(() => {
    if (!protFocused.current) setProtText(formatMacroGForInput(item.protein_g));
  }, [item.protein_g]);
  React.useEffect(() => {
    if (!carbFocused.current) setCarbText(formatMacroGForInput(item.carbs_g));
  }, [item.carbs_g]);
  React.useEffect(() => {
    if (!fatFocused.current) setFatText(formatMacroGForInput(item.fat_g));
  }, [item.fat_g]);

  const parseNum = (v: string) => Math.max(0, parseFloat(v.replace(',', '.')) || 0);
  const commitQty = (text: string) => onGrams(index, toGrams(parseNum(text), unit));

  return (
    <Surface variant="subtle" style={s.itemCard} padding="md">
      <View style={s.itemHeader}>
        <Text style={s.itemName}>{item.normalized_name}</Text>
        <TouchableOpacity onPress={() => onRemove(index)} hitSlop={8}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={s.qtySection}>
        <Text style={s.qtySectionLabel}>CANTIDAD</Text>
        <View style={s.qtyControlsRow}>
          <View style={s.qtyInputWrap}>
            <Input
              dense
              value={qtyText}
              onChangeText={(text) => {
                setQtyText(text);
                commitQty(text);
              }}
              onFocus={() => { qtyFocused.current = true; }}
              onBlur={() => { qtyFocused.current = false; commitQty(qtyText); }}
              keyboardType="decimal-pad"
              style={s.qtyInputInner}
            />
          </View>
          <View style={s.unitCol}>
            <UnitPicker value={unit} onChange={(u) => onUnitChange(index, u)} />
          </View>
          <Text style={[s.itemKcal, { color: colors.calories }]}>{Math.round(item.kcal)} kcal</Text>
        </View>
      </View>

      <View style={s.macroLegendRow}>
        <View style={s.macroEditCell}>
          <Text style={[s.macroLegendLetter, { color: colors.protein }]}>P</Text>
          <TextInput
            style={[s.macroInput, { color: colors.protein }]}
            value={protText}
            onChangeText={setProtText}
            onFocus={() => { protFocused.current = true; }}
            onBlur={() => { protFocused.current = false; onMacro(index, 'protein_g', roundMacroG(parseNum(protText))); }}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <Text style={[s.macroInputUnit, { color: colors.protein }]}>g</Text>
        </View>
        <View style={s.macroEditCell}>
          <Text style={[s.macroLegendLetter, { color: colors.carbs }]}>C</Text>
          <TextInput
            style={[s.macroInput, { color: colors.carbs }]}
            value={carbText}
            onChangeText={setCarbText}
            onFocus={() => { carbFocused.current = true; }}
            onBlur={() => { carbFocused.current = false; onMacro(index, 'carbs_g', roundMacroG(parseNum(carbText))); }}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <Text style={[s.macroInputUnit, { color: colors.carbs }]}>g</Text>
        </View>
        <View style={s.macroEditCell}>
          <Text style={[s.macroLegendLetter, { color: colors.fat }]}>G</Text>
          <TextInput
            style={[s.macroInput, { color: colors.fat }]}
            value={fatText}
            onChangeText={setFatText}
            onFocus={() => { fatFocused.current = true; }}
            onBlur={() => { fatFocused.current = false; onMacro(index, 'fat_g', roundMacroG(parseNum(fatText))); }}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <Text style={[s.macroInputUnit, { color: colors.fat }]}>g</Text>
        </View>
      </View>
      <MacroEnergySplitBar proteinG={item.protein_g} carbsG={item.carbs_g} fatG={item.fat_g} />

      {item.confidence !== 'high' && (
        <Text style={s.itemConfidence}>Confianza: {item.confidence}</Text>
      )}
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function RecipeFromPhotoScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    meal_type?: string;
    date?: string;
  }>();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [items, setItems] = useState<EditablePhotoAnalysisItem[]>([]);
  const [itemUnits, setItemUnits] = useState<FoodUnit[]>([]);

  const [recipeName, setRecipeName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🍲');

  /** En web o sin historial, `router.back()` no tiene destino (GO_BACK no manejado). */
  const handleCancel = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({
      pathname: '/add-meal/create-recipe',
      params: { meal_type: params.meal_type, date: params.date },
    });
  };

  // ---- Mutation: analyze photo ----
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
      setRecipeName(data.meal_name ?? '');
    },
    onError: (e: any) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (isVisionQuotaErrorMessage(msg)) {
        alertVisionQuotaExceeded();
        return;
      }
      Alert.alert('Error', msg || 'No se pudo analizar la imagen');
    },
  });

  // ---- Image actions ----
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setImageUri(a.uri);
      setAnalysis(null);
      analyzeMutation.mutate({ uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg' });
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso', 'Se necesita acceso a la cámara');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setImageUri(a.uri);
      setAnalysis(null);
      analyzeMutation.mutate({ uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg' });
    }
  };

  // ---- Item mutations ----
  const updateItemGrams = (index: number, grams: number) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      const g = Math.max(0, Math.round(grams));
      const base = nutritionBaseForItem(item);
      const scaled = scaleMacrosToGrams(base.grams, g, base.kcal, base.protein_g, base.carbs_g, base.fat_g);
      updated[index] = { ...item, estimated_grams: Math.round(scaled.grams), kcal: scaled.kcal, protein_g: scaled.protein_g, carbs_g: scaled.carbs_g, fat_g: scaled.fat_g, _nutritionBase: base };
      return updated;
    });
  };

  const updateItemMacro = (index: number, field: 'protein_g' | 'carbs_g' | 'fat_g', value: number) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      item.kcal = kcalFromMacros(item.protein_g, item.carbs_g, item.fat_g);
      item._nutritionBase = nutritionBaseFromItem(item);
      updated[index] = item;
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setItemUnits((prev) => prev.filter((_, i) => i !== index));
  };

  const onItemUnitChange = (index: number, newUnit: FoodUnit) => {
    setItemUnits((prev) => {
      const next = [...prev];
      next[index] = newUnit;
      return next;
    });
  };

  // ---- Totals ----
  const totals = items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      protein: acc.protein + i.protein_g,
      carbs: acc.carbs + i.carbs_g,
      fat: acc.fat + i.fat_g,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  // ---- Navigate to create-recipe with prefill ----
  const onUseInRecipe = () => {
    if (items.length === 0) {
      Alert.alert('Sin ingredientes', 'Necesitas al menos un ingrediente para crear la receta.');
      return;
    }
    const payload = {
      name: recipeName.trim() || analysis?.meal_name || '',
      icon: selectedIcon,
      ingredients: items.map((i) => ({
        custom_name: i.normalized_name,
        food_catalog_id: i.matched_food_id,
        grams: i.estimated_grams,
        kcal: i.kcal,
        protein_g: i.protein_g,
        carbs_g: i.carbs_g,
        fat_g: i.fat_g,
      })),
    };
    router.replace({
      pathname: '/add-meal/create-recipe',
      params: {
        prefill: encodeURIComponent(JSON.stringify(payload)),
        meal_type: params.meal_type,
        date: params.date,
      },
    });
  };

  // ---- Loading state ----
  if (analyzeMutation.isPending) {
    return (
      <View style={s.loadingContainer}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={s.loadingImage} />
        ) : (
          <ActivityIndicator color={colors.primaryLight} style={{ marginVertical: 28 }} size="large" />
        )}
        <Text style={s.loadingText}>Analizando comida...</Text>
        <LoadingScreen />
      </View>
    );
  }

  // ---- No analysis yet: show capture options ----
  if (!analysis) {
    return (
      <View style={s.container}>
        <Ionicons name="camera-outline" size={64} color={colors.textTertiary} style={{ alignSelf: 'center', marginBottom: spacing.md }} />
        <Text style={s.title}>Receta desde foto</Text>
        <Text style={s.subtitle}>
          Toma o sube una foto de tu comida y la IA detectará los ingredientes automáticamente
        </Text>
        <Button title="Tomar foto" onPress={takePhoto} style={s.btn} />
        <Button title="Elegir de galería" variant="secondary" onPress={pickImage} style={s.btn} />
      </View>
    );
  }

  // ---- Results: review & edit detected items ----
  return (
    <View style={s.screenRoot}>
      <ScrollView
        style={s.resultsScroll}
        contentContainerStyle={s.resultsScrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {imageUri ? (
          <View style={s.heroWrap}>
            <Image source={{ uri: imageUri }} style={s.heroImage} resizeMode="cover" />
          </View>
        ) : null}

        {/* Recipe name */}
        <Text style={s.fieldLabel}>Nombre de la receta</Text>
        <TextInput
          style={s.nameInput}
          value={recipeName}
          onChangeText={setRecipeName}
          placeholder="Ej: Pollo al curry con arroz"
          placeholderTextColor={colors.textMuted}
          maxLength={200}
        />

        {/* Icon picker */}
        <Text style={s.fieldLabel}>Icono</Text>
        <FlatList
          horizontal
          data={FOOD_ICONS}
          keyExtractor={(item) => item.emoji}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.iconList}
          renderItem={({ item }) => {
            const selected = selectedIcon === item.emoji;
            return (
              <TouchableOpacity
                style={[s.iconBtn, selected && s.iconBtnSelected]}
                onPress={() => setSelectedIcon(item.emoji)}
                activeOpacity={0.85}
              >
                <Text style={s.iconEmoji}>{item.emoji}</Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* Macro summary */}
        <MacroSummarySection
          kcal={totals.kcal}
          proteinG={totals.protein}
          carbsG={totals.carbs}
          fatG={totals.fat}
        />

        {analysis.overall_confidence !== 'high' && (
          <Text style={s.confidenceWarn}>Confianza: {analysis.overall_confidence}. Revisa las cantidades.</Text>
        )}

        {/* Detected items */}
        <Text style={[s.sectionLabel, s.sectionLabelSpaced]}>
          Ingredientes detectados ({items.length})
        </Text>
        {items.map((item, i) => (
          <RecipePhotoItemRow
            key={`recipe-photo-item-${i}`}
            item={item}
            index={i}
            unit={itemUnits[i] ?? 'g'}
            onGrams={updateItemGrams}
            onUnitChange={onItemUnitChange}
            onRemove={removeItem}
            onMacro={updateItemMacro}
          />
        ))}

        {/* Retry / re-pick */}
        <View style={s.retryRow}>
          <TouchableOpacity style={s.retryBtn} onPress={takePhoto} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={18} color={colors.primary} />
            <Text style={s.retryBtnText}>Otra foto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.retryBtn} onPress={pickImage} activeOpacity={0.85}>
            <Ionicons name="images-outline" size={18} color={colors.primary} />
            <Text style={s.retryBtnText}>Galería</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={[actionIntentStyles.row, { width: '100%' }]}>
          <Button variant="actionCancel" title="Cancelar" onPress={handleCancel} />
          <Button
            variant="actionConfirm"
            title="Usar en receta"
            onPress={onUseInRecipe}
            disabled={items.length === 0}
          />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.xxl,
    justifyContent: 'center',
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  btn: { marginBottom: spacing.md },

  // Loading
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', paddingTop: 100 },
  loadingImage: { width: 200, height: 200, borderRadius: borderRadius.lg, marginBottom: spacing.lg },
  loadingText: { ...typography.bodyBold, color: colors.textSecondary },

  // Results layout
  screenRoot: { flex: 1, backgroundColor: colors.background },
  resultsScroll: { flex: 1 },
  resultsScrollContent: {
    flexGrow: 1,
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },

  // Hero
  heroWrap: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  heroImage: { width: '100%', height: '100%' },

  // Fields
  fieldLabel: {
    ...typography.captionBold,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  nameInput: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  iconList: { gap: 8, paddingVertical: spacing.sm, marginBottom: spacing.md },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '22',
  },
  iconEmoji: { fontSize: 24 },

  // Section labels
  sectionLabel: {
    ...typography.captionBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  sectionLabelSpaced: { marginTop: spacing.sm },

  // Confidence
  confidenceWarn: { ...typography.caption, color: colors.warning, marginBottom: spacing.md },

  // Item card (from photo.tsx)
  itemCard: { marginBottom: spacing.md },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  itemName: { ...typography.bodyBold, color: colors.text, flex: 1, marginRight: spacing.sm, textTransform: 'capitalize' },

  qtySection: { marginBottom: spacing.md },
  qtySectionLabel: {
    ...typography.label,
    color: colors.primaryLight,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  qtyControlsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyInputWrap: { flex: 1, minWidth: 0 },
  qtyInputInner: { minWidth: 0 },
  unitCol: { flexShrink: 0, minWidth: 100, alignItems: 'stretch' },
  itemKcal: { ...typography.bodyBold, fontSize: 15, flexShrink: 0 },
  itemConfidence: { ...typography.small, color: colors.warning, marginTop: spacing.sm },

  macroLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
    paddingHorizontal: 2,
  },
  macroEditCell: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  macroLegendLetter: { ...typography.captionBold, fontSize: 12 },
  macroInput: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minWidth: 38,
    maxWidth: 55,
    textAlign: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  macroInputUnit: { ...typography.caption, fontSize: 11 },

  // Retry row
  retryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  retryBtnText: { ...typography.captionBold, color: colors.primary },

  // Footer
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
  },
});
