import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  FlatList,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { Button, Input, Surface, UnitPicker } from '../../src/components';
import { colors, spacing, typography, screenPaddingX, borderRadius, actionIntentStyles } from '../../src/theme';
import { type FoodUnit, toGrams, unitAbbr } from '../../src/lib/foodUnits';

type MacroEstimateResponse = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence?: 'high' | 'medium' | 'low' | null;
  notes?: string;
};

const CONFIDENCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'alta',
  medium: 'media',
  low: 'baja',
};

const FOOD_ICONS = [
  { emoji: '🍳', label: 'Desayuno' },
  { emoji: '🥐', label: 'Croissant' },
  { emoji: '🥣', label: 'Cereales' },
  { emoji: '🥞', label: 'Tortitas' },
  { emoji: '☕', label: 'Café' },
  { emoji: '🥗', label: 'Ensalada' },
  { emoji: '🍗', label: 'Pollo' },
  { emoji: '🥩', label: 'Carne' },
  { emoji: '🐟', label: 'Pescado' },
  { emoji: '🍚', label: 'Arroz' },
  { emoji: '🍝', label: 'Pasta' },
  { emoji: '🥪', label: 'Sándwich' },
  { emoji: '🌮', label: 'Taco' },
  { emoji: '🍕', label: 'Pizza' },
  { emoji: '🥑', label: 'Aguacate' },
  { emoji: '🍌', label: 'Fruta' },
  { emoji: '🥜', label: 'Frutos secos' },
  { emoji: '🧀', label: 'Queso' },
  { emoji: '🥛', label: 'Leche' },
  { emoji: '🍫', label: 'Chocolate' },
  { emoji: '🍪', label: 'Galleta' },
  { emoji: '🥤', label: 'Batido' },
  { emoji: '🍎', label: 'Manzana' },
  { emoji: '🥦', label: 'Verdura' },
  { emoji: '🥚', label: 'Huevo' },
  { emoji: '🍞', label: 'Pan' },
  { emoji: '🧁', label: 'Dulce' },
  { emoji: '🍰', label: 'Tarta' },
  { emoji: '🥙', label: 'Wrap' },
  { emoji: '🍜', label: 'Sopa' },
];

const FOOD_BASE_UNITS: FoodUnit[] = ['g', 'ml', 'oz', 'lb', 'cup', 'tbsp', 'tsp'];

function parseNutritionValue(value: string) {
  return parseFloat(value.replace(',', '.')) || 0;
}

function formatNumber(value: number, decimals = 1) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Number(value.toFixed(decimals));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

export default function CreateFoodScreen() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    meal_type?: string;
    date?: string;
    edit_id?: string;
    edit_name?: string;
    edit_kcal?: string;
    edit_protein?: string;
    edit_carbs?: string;
    edit_fat?: string;
    edit_icon?: string;
  }>();

  const isEdit = !!params.edit_id;

  const [name, setName] = useState(params.edit_name ?? '');
  const [kcal, setKcal] = useState(params.edit_kcal ?? '');
  const [protein, setProtein] = useState(params.edit_protein ?? '');
  const [carbs, setCarbs] = useState(params.edit_carbs ?? '');
  const [fat, setFat] = useState(params.edit_fat ?? '');
  const [icon, setIcon] = useState(params.edit_icon ?? '🍳');
  const [quantity, setQuantity] = useState('100');
  const [quantityUnit, setQuantityUnit] = useState<FoodUnit>('g');
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // El aviso se refiere a la combinación nombre+cantidad+unidad estimada;
  // si el usuario cambia cualquiera de esos, el texto deja de aplicar.
  useEffect(() => {
    setAiNotice(null);
  }, [name, quantity, quantityUnit]);

  const nutrition = useMemo(
    () => ({
      kcal: parseNutritionValue(kcal),
      protein: parseNutritionValue(protein),
      carbs: parseNutritionValue(carbs),
      fat: parseNutritionValue(fat),
    }),
    [carbs, fat, kcal, protein],
  );
  const baseQuantity = useMemo(() => parseNutritionValue(quantity), [quantity]);
  const baseQuantityInGrams = useMemo(
    () => (baseQuantity > 0 ? toGrams(baseQuantity, quantityUnit) : 0),
    [baseQuantity, quantityUnit],
  );
  const per100Nutrition = useMemo(() => {
    const factor = baseQuantityInGrams > 0 ? 100 / baseQuantityInGrams : 0;
    return {
      kcal: nutrition.kcal * factor,
      protein: nutrition.protein * factor,
      carbs: nutrition.carbs * factor,
      fat: nutrition.fat * factor,
    };
  }, [baseQuantityInGrams, nutrition]);

  const completedFields = useMemo(
    () => [name, quantity, kcal, protein, carbs, fat].filter((value) => value.trim().length > 0).length,
    [carbs, fat, kcal, name, protein, quantity],
  );
  const progressPercent = `${Math.round((completedFields / 6) * 100)}%` as `${number}%`;
  const macroDerivedKcal = Math.round((nutrition.protein * 4) + (nutrition.carbs * 4) + (nutrition.fat * 9));

  const body = () => ({
    name: name.trim(),
    kcal_per_100g: per100Nutrition.kcal,
    protein_per_100g: per100Nutrition.protein,
    carbs_per_100g: per100Nutrition.carbs,
    fat_per_100g: per100Nutrition.fat,
    icon,
  });

  /** En web o sin historial, `router.back()` puede no tener destino. */
  const exitCreateFood = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({
      pathname: '/(tabs)/search',
      params: {
        meal_type: params.meal_type,
        date: params.date,
        section: 'created',
      },
    });
  }, [params.date, params.meal_type]);

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/v1/meals/custom-foods', body()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customFoods'] });
      exitCreateFood();
    },
    onError: (e: unknown) =>
      Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo crear el alimento')),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/api/v1/meals/custom-foods/${params.edit_id}`, body()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customFoods'] });
      exitCreateFood();
    },
    onError: (e: unknown) =>
      Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo actualizar el alimento')),
  });

  const applyEstimate = useCallback((data: MacroEstimateResponse) => {
    setKcal(formatNumber(data.kcal, 0));
    setProtein(formatNumber(data.protein_g));
    setCarbs(formatNumber(data.carbs_g));
    setFat(formatNumber(data.fat_g));
    const conf = data.confidence ? CONFIDENCE_LABEL[data.confidence] : null;
    const parts: string[] = [];
    if (conf) parts.push(`Confianza ${conf}`);
    if (data.notes && data.notes.trim().length > 0) parts.push(data.notes.trim());
    setAiNotice(parts.length > 0 ? parts.join(' · ') : 'Estimación aplicada');
  }, []);

  const estimateMutation = useMutation({
    mutationFn: () =>
      api.post<MacroEstimateResponse>('/api/v1/foods/estimate-macros', {
        name: name.trim(),
        quantity: baseQuantity,
        unit: quantityUnit,
      }),
    onSuccess: (data) => {
      const hasExisting = [kcal, protein, carbs, fat].some((v) => v.trim().length > 0);
      if (!hasExisting) {
        applyEstimate(data);
        return;
      }
      Alert.alert(
        '¿Reemplazar valores actuales?',
        'Ya has introducido macros. La estimación de la IA sustituirá los valores existentes.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Reemplazar', style: 'destructive', onPress: () => applyEstimate(data) },
        ],
      );
    },
    onError: (e: unknown) =>
      Alert.alert('Sin estimación', toUserFacingErrorMessage(e, 'No se pudo estimar los macros')),
  });

  const saving = createMutation.isPending || updateMutation.isPending;
  const canSave = name.trim().length > 0 && kcal.trim().length > 0 && baseQuantityInGrams > 0;
  const canEstimate = name.trim().length >= 2 && baseQuantity > 0 && !estimateMutation.isPending;

  const onSave = () => {
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <View style={st.root}>
      <KeyboardAvoidingView
        style={st.kavFill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[st.content, { paddingTop: insets.top + spacing.md }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={st.topBar}>
            <TouchableOpacity
              onPress={exitCreateFood}
              style={st.backButton}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Volver"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={st.topTitleWrap}>
              <Text style={st.eyebrow}>Alimento personalizado</Text>
              <Text style={st.title}>{isEdit ? 'Editar alimento' : 'Nuevo alimento'}</Text>
            </View>
            <View style={st.topRightSpacer} />
          </View>

          <Surface variant="subtle" style={st.heroCard} padding="md">
            <View pointerEvents="none" style={st.heroGlow} />
            <View style={st.heroHeader}>
              <View style={st.heroIconWrap}>
                <Text style={st.heroIcon}>{icon}</Text>
              </View>
              <View style={st.heroCopy}>
                <Text style={st.heroKicker}>
                  {baseQuantity > 0 ? `Cantidad base: ${formatNumber(baseQuantity, 0)} ${unitAbbr(quantityUnit)}` : 'Cantidad pendiente'}
                </Text>
                <Text style={st.heroName} numberOfLines={2}>
                  {name.trim() || 'Alimento sin nombre'}
                </Text>
                <Text style={st.heroMeta} numberOfLines={1}>
                  {canSave ? 'Se guardará convertido a valores por 100 g' : 'Añade nombre, cantidad, unidad y calorías'}
                </Text>
              </View>
              <View style={st.kcalBadge}>
                <Text style={st.kcalBadgeValue}>{Math.round(nutrition.kcal)}</Text>
                <Text style={st.kcalBadgeLabel}>kcal</Text>
              </View>
            </View>

            <View style={st.progressHeader}>
              <Text style={st.progressLabel}>Ficha nutricional</Text>
              <Text style={st.progressValue}>{completedFields}/6</Text>
            </View>
            <View style={st.progressTrack}>
              <View style={[st.progressFill, { width: progressPercent }]} />
            </View>

            <Text style={st.heroIconLabel}>Icono del alimento</Text>
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
                    accessibilityState={{ selected }}
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
              icon="restaurant-outline"
              title="Identidad"
              subtitle="Así se verá en tus búsquedas, comidas y favoritos."
            />
            <Input
              label="Nombre del alimento"
              value={name}
              onChangeText={setName}
              placeholder="Ej: Tortitas de arroz"
              maxLength={200}
            />
          </View>

          <View style={st.sectionCard}>
            <SectionTitle
              icon="analytics-outline"
              title="Valores nutricionales"
              subtitle="Elige la cantidad de referencia y escribe los valores de esa cantidad."
            />

            <Button
              variant="actionConfirm"
              title={estimateMutation.isPending ? 'Estimando…' : 'Estimar con IA'}
              onPress={() => estimateMutation.mutate()}
              disabled={!canEstimate}
              loading={estimateMutation.isPending}
              icon={<Ionicons name="sparkles-outline" size={16} color={colors.text} />}
            />
            {!canEstimate && !estimateMutation.isPending && (
              <Text style={st.aiHint}>Añade nombre y cantidad para estimar.</Text>
            )}
            {aiNotice && (
              <View style={st.aiNotice}>
                <Ionicons name="sparkles-outline" size={15} color={colors.primaryLight} />
                <Text style={st.aiNoticeText} numberOfLines={3}>{aiNotice}</Text>
                <TouchableOpacity
                  onPress={() => setAiNotice(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar aviso"
                  hitSlop={8}
                >
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            <View style={st.quantityBlock}>
              <View style={st.quantityCopy}>
                <Text style={st.quantityLabel}>Cantidad base</Text>
                <Text style={st.quantityHint}>Los macros de abajo corresponden a esta cantidad</Text>
              </View>
              <View style={st.quantityControlRow}>
                <View style={st.quantityInputWrap}>
                  <TextInput
                    style={st.quantityInput}
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    placeholder="100"
                    placeholderTextColor={colors.textMuted}
                    autoCorrect={false}
                    autoCapitalize="none"
                    spellCheck={false}
                    autoComplete="off"
                    selectTextOnFocus
                  />
                </View>
                <UnitPicker
                  value={quantityUnit}
                  onChange={setQuantityUnit}
                  availableUnits={FOOD_BASE_UNITS}
                  triggerTextMode="abbr"
                  triggerStyle={st.quantityUnitTrigger}
                  triggerTextStyle={st.quantityUnitTriggerText}
                  chevronColor={colors.primaryLight}
                  chevronSize={13}
                />
              </View>
            </View>

            <View style={st.nutritionGrid}>
              <NutritionInput
                icon="flame-outline"
                label="Calorías"
                unit="kcal"
                value={kcal}
                color={colors.calories}
                placeholder="0"
                onChangeText={setKcal}
              />
              <NutritionInput
                icon="barbell-outline"
                label="Proteínas"
                unit="g"
                value={protein}
                color={colors.protein}
                placeholder="0"
                onChangeText={setProtein}
              />
              <NutritionInput
                icon="leaf-outline"
                label="Carbohidratos"
                unit="g"
                value={carbs}
                color={colors.carbs}
                placeholder="0"
                onChangeText={setCarbs}
              />
              <NutritionInput
                icon="water-outline"
                label="Grasas"
                unit="g"
                value={fat}
                color={colors.fat}
                placeholder="0"
                onChangeText={setFat}
              />
            </View>

            <View style={st.summaryPanel}>
              <View style={st.summaryHeader}>
                <View>
                  <Text style={st.summaryOverline}>Resumen</Text>
                  <Text style={st.summaryTitle}>Equivalente por 100 g</Text>
                </View>
                <View style={st.summaryKcal}>
                  <Text style={st.summaryKcalValue}>{Math.round(per100Nutrition.kcal)}</Text>
                  <Text style={st.summaryKcalLabel}>kcal</Text>
                </View>
              </View>

              <View style={st.macroRow}>
                <MacroPill label="Proteína" value={per100Nutrition.protein} color={colors.protein} />
                <MacroPill label="Carbos" value={per100Nutrition.carbs} color={colors.carbs} />
                <MacroPill label="Grasas" value={per100Nutrition.fat} color={colors.fat} />
              </View>

              <View style={st.calculatedRow}>
                <Ionicons name="calculator-outline" size={15} color={colors.textMuted} />
                <Text style={st.calculatedText}>
                  {macroDerivedKcal} kcal estimadas para {baseQuantity > 0 ? `${formatNumber(baseQuantity, 0)} ${unitAbbr(quantityUnit)}` : 'la cantidad elegida'}
                </Text>
              </View>
            </View>
          </View>

          <View style={st.noteCard}>
            <View style={st.noteIcon}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primaryLight} />
            </View>
            <Text style={st.noteText}>
              Puedes copiar los datos de una etiqueta tal cual: indica primero la cantidad de referencia y la app los normaliza a 100 g.
            </Text>
          </View>

          <View style={[actionIntentStyles.row, st.actions]}>
            <Button variant="actionCancel" title="Cancelar" onPress={exitCreateFood} />
            <Button
              variant="actionConfirm"
              title={isEdit ? 'Guardar cambios' : 'Guardar alimento'}
              onPress={onSave}
              disabled={!canSave || saving}
              loading={saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={st.sectionTitleRow}>
      <View style={st.sectionIconBubble}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={st.sectionTitleCopy}>
        <Text style={st.sectionTitle}>{title}</Text>
        <Text style={st.sectionSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function NutritionInput({
  icon,
  label,
  unit,
  value,
  color,
  placeholder,
  onChangeText,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  unit: string;
  value: string;
  color: string;
  placeholder: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={st.nutritionCard}>
      <View style={st.nutritionHeader}>
        <View style={[st.nutritionIcon, { backgroundColor: `${color}1F`, borderColor: `${color}55` }]}>
          <Ionicons name={icon} size={15} color={color} />
        </View>
        <Text style={st.nutritionLabel} numberOfLines={1}>{label}</Text>
      </View>
      <View style={st.nutritionValueRow}>
        <TextInput
          style={st.nutritionInput}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          selectTextOnFocus
        />
        <Text style={st.nutritionUnit}>{unit}</Text>
      </View>
    </View>
  );
}

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[st.macroPill, { borderColor: `${color}55` }]}>
      <Text style={[st.macroPillLabel, { color }]}>{label}</Text>
      <Text style={st.macroPillValue}>{formatNumber(value)}g</Text>
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
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -60,
    top: -76,
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
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  progressLabel: { ...typography.captionBold, color: colors.textSecondary },
  progressValue: { ...typography.captionBold, color: colors.primaryLight },
  progressTrack: {
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.ringTrack,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
  },
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
    borderRadius: borderRadius.full,
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
  sectionTitleCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { ...typography.bodyBold, color: colors.text },
  sectionSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },

  quantityBlock: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quantityCopy: { width: '100%' },
  quantityLabel: { ...typography.bodyBold, color: colors.text },
  quantityHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  quantityControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  quantityInputWrap: {
    flex: 1,
    minWidth: 0,
    height: 50,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  quantityInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  quantityUnitTrigger: {
    height: 50,
    minWidth: 86,
    borderRadius: borderRadius.full,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    gap: spacing.xs,
  },
  quantityUnitTriggerText: {
    ...typography.bodyBold,
    color: colors.primaryLight,
    fontSize: 15,
  },

  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  nutritionCard: {
    width: '48%',
    minWidth: 142,
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nutritionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  nutritionIcon: {
    width: 26,
    height: 26,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nutritionLabel: { ...typography.captionBold, color: colors.textSecondary, flex: 1 },
  nutritionValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  nutritionInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  nutritionUnit: { ...typography.captionBold, color: colors.textMuted },

  summaryPanel: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryOverline: { ...typography.captionBold, color: colors.primary, textTransform: 'uppercase' },
  summaryTitle: { ...typography.bodyBold, color: colors.text, marginTop: 2 },
  summaryKcal: {
    minWidth: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
  },
  summaryKcalValue: { fontSize: 22, fontWeight: '900', color: colors.text, lineHeight: 26 },
  summaryKcalLabel: { ...typography.caption, color: colors.primaryLight, fontSize: 11 },
  macroRow: { flexDirection: 'row', gap: spacing.sm },
  macroPill: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
  },
  macroPillLabel: { ...typography.captionBold, fontSize: 11, marginBottom: 3 },
  macroPillValue: { ...typography.bodyBold, color: colors.text, fontSize: 13 },
  calculatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  calculatedText: { ...typography.caption, color: colors.textMuted, flex: 1 },

  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryGlowSoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  noteIcon: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: { ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 19 },
  aiHint: { ...typography.caption, color: colors.textMuted, marginTop: -spacing.xs / 2 },
  aiNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryGlowSoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  aiNoticeText: { ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 18 },
  actions: { marginTop: spacing.xs, width: '100%' },
});
