import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Image,
  useWindowDimensions,
  TextInput,
  Alert,
  Modal,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  Animated,
  Easing,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { getApiBaseUrl } from '../../src/lib/appEnv';
import { scaleMacrosToGrams, roundMacroG, formatMacroGForInput } from '../../src/lib/mealItemMath';
import { invalidateMealRelatedQueries } from '../../src/lib/mealQueryInvalidation';
import { confirmTwoAction } from '../../src/lib/confirmTwoAction';
import { type FoodUnit, toGrams, fromGrams } from '../../src/lib/foodUnits';
import {
  CalorieRing,
  StepsRing,
  WaterIntakeRing,
  CompactMacroColumn,
  Button,
  LoadingScreen,
  Surface,
  ListRow,
  BottomSheet,
  MealFoodItemRows,
  MealTypeIcon,
  SlideUpView,
  StaggerItem,
  ScreenFocusProvider,
  PressableScale,
  DiaryWeekStrip,
  DiaryMonthGrid,
  UnitPicker,
  TideGradientFrame,
  MealSlotChevron,
  AnimatedCollapsible,
  StreakModal,
  StepsGoalFields,
} from '../../src/components';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  screenPaddingX,
  iconSize,
  elevation,
  DOCK_H,
  DOCK_MARGIN_BOTTOM,
  primaryCtaPressed,
  pressedOpacity,
  actionIntentStyles,
} from '../../src/theme';
import {
  DayDiary,
  ProgressSummary,
  MealEntry,
  MealItem,
  SavedMeal,
  DailyTarget,
  AppSettings,
  ActivityDayResponse,
  EstimateTrainingResponse,
  Profile,
} from '../../src/types';
import { estimateStepsKcal } from '../../src/lib/healthSteps';
import { WEARABLE_SYNC_ACTIVITY_TRAINING_TYPE } from '../../src/lib/wearableActivityTypes';
import { getActivityData, probeAndRepairWearableConnection } from '../../src/services/wearableActivityService';
import { isNonPremiumTier } from '../../src/lib/planAiPremiumGate';
import { showTrainingBurnPremiumLock } from '../../src/lib/nutriCoachQuotaAlert';
import {
  mealDisplayTitle,
  formatMealTime,
  MEAL_TYPES_ORDER,
  mealTypeLabel,
  mealLeadingVisual,
  mealItemVisualIconForLookupName,
  mealPreviewPrimaryFoodLabels,
  primaryMealItemIndex,
  combinedMealTitle,
  mealItemDisplayPartsForUi,
  type MealTypeOrderKey,
} from '../../src/lib/mealDisplay';
import { MealItemIconMedia } from '../../src/components/ui/MealItemIconMedia';
import { format } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { toLocalYmd, minDiarySelectableDate, isSameLocalDay } from '../../src/lib/diaryDate';
import { normalizeAppSettings } from '../../src/lib/appSettings';
import { parseStepsTargetInput } from '../../src/lib/stepsGoal';
import { updateWidget } from '../../src/lib/widgetUpdater';

/** Barra de macros (referencia visual tipo tracker oscuro). */
const PREVIEW_MACRO_BAR = {
  protein: colors.previewProtein,
  carbs: colors.previewCarbs,
  fat: colors.previewFat,
} as const;

/** Debe coincidir con maxHeightFraction / maxHeightCap del BottomSheet de vista previa. */
const PREVIEW_SHEET_FRAC = 0.92;
const PREVIEW_SHEET_CAP = 860;

function sumEatenGrams(items: MealItem[] | undefined): number {
  if (!items?.length) return 0;
  return Math.round(items.reduce((s, it) => s + (it.eaten === false ? 0 : it.grams), 0));
}

/** Porcentaje de kcal aportadas por cada macro (4·P + 4·C + 9·F). */
function macroKcalPercents(proteinG: number, carbsG: number, fatG: number) {
  const kp = Math.max(0, proteinG) * 4;
  const kc = Math.max(0, carbsG) * 4;
  const kf = Math.max(0, fatG) * 9;
  const sum = kp + kc + kf;
  if (sum <= 0) return { p: 0, c: 0, f: 0, hasData: false as const };
  const rp = Math.round((kp / sum) * 100);
  const rc = Math.round((kc / sum) * 100);
  const rf = Math.max(0, 100 - rp - rc);
  return { p: rp, c: rc, f: rf, hasData: true as const };
}

function recalcEntryTotals(meal: MealEntry, items: MealItem[]): MealEntry {
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const it of items) {
    if (it.eaten === false) continue;
    kcal += it.kcal;
    protein += it.protein_g;
    carbs += it.carbs_g;
    fat += it.fat_g;
  }
  return {
    ...meal,
    items,
    total_kcal: Math.round(kcal * 10) / 10,
    total_protein_g: Math.round(protein * 10) / 10,
    total_carbs_g: Math.round(carbs * 10) / 10,
    total_fat_g: Math.round(fat * 10) / 10,
  };
}

function parseDraftAmount(s: string): number {
  const t = s.replace(',', '.').trim();
  if (t === '') return 0;
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Firma del ítem principal en servidor (para reiniciar borradores al guardar o cambiar comida). */
function primaryItemFingerprint(meal: MealEntry): string {
  const idx = primaryMealItemIndex(meal);
  if (idx < 0) return '';
  const p = meal.items[idx];
  return `${meal.id}:${p.grams}:${p.kcal}:${p.protein_g}:${p.carbs_g}:${p.fat_g}`;
}

function mealWithPrimaryDrafts(
  meal: MealEntry,
  draftQtyStr: string,
  unit: FoodUnit,
  draftKcalStr: string,
  draftProteinStr: string,
  draftCarbsStr: string,
  draftFatStr: string,
): MealEntry {
  const idx = primaryMealItemIndex(meal);
  if (idx < 0) return meal;
  const items = meal.items.map((it) => ({ ...it }));
  const prim = items[idx];
  const g = Math.round(toGrams(parseDraftAmount(draftQtyStr), unit));
  const kcal = Math.round(parseDraftAmount(draftKcalStr) * 10) / 10;
  items[idx] = {
    ...prim,
    grams: g,
    kcal,
    protein_g: roundMacroG(parseDraftAmount(draftProteinStr)),
    carbs_g: roundMacroG(parseDraftAmount(draftCarbsStr)),
    fat_g: roundMacroG(parseDraftAmount(draftFatStr)),
  };
  return recalcEntryTotals(meal, items);
}

function itemsToPatchPayload(items: MealItem[]) {
  return items.map((rest) => ({
    food_catalog_id: rest.food_catalog_id || undefined,
    custom_name: rest.custom_name,
    grams: rest.grams,
    kcal: rest.kcal,
    protein_g: rest.protein_g,
    carbs_g: rest.carbs_g,
    fat_g: rest.fat_g,
    eaten: rest.eaten !== false,
  }));
}

function useSaveFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedMeals'] }),
  });
}

function useDeleteSavedFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (savedMealId: string) => api.delete(`/api/v1/meals/saved/${savedMealId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedMeals'] }),
  });
}

type MealPreviewSheetBodyProps = {
  previewMeal: MealEntry;
  dateStr: string;
  bottomInset: number;
  foodSectionOpen: boolean;
  onToggleFoodSection: () => void;
  onMealUpdated: (meal: MealEntry) => void;
  onCloseSheet: () => void;
  onOpenFullEdit: () => void;
  savedMeals: SavedMeal[];
};

function MealPreviewSheetBody({
  previewMeal,
  dateStr,
  bottomInset,
  foodSectionOpen,
  onToggleFoodSection,
  onMealUpdated,
  onCloseSheet,
  onOpenFullEdit,
  savedMeals,
}: MealPreviewSheetBodyProps) {
  const { height: windowHeight } = useWindowDimensions();
  const queryClient = useQueryClient();
  const sheetMaxH = Math.min(windowHeight * PREVIEW_SHEET_FRAC, PREVIEW_SHEET_CAP);
  /** Zona del asa + padding del `BottomSheet` (~72px). */
  const bodyHeight = Math.max(320, sheetMaxH - 72);

  const [draftUnit, setDraftUnit] = React.useState<FoodUnit>('g');
  const [draftQty, setDraftQty] = React.useState(() => {
    const idx = primaryMealItemIndex(previewMeal);
    if (idx < 0) return '';
    return String(Math.round(previewMeal.items[idx].grams));
  });
  const [draftKcal, setDraftKcal] = React.useState('');
  const [draftProtein, setDraftProtein] = React.useState('');
  const [draftCarbs, setDraftCarbs] = React.useState('');
  const [draftFat, setDraftFat] = React.useState('');
  const primaryFpRef = React.useRef<string>('');
  const serverPrimaryFp = React.useMemo(() => primaryItemFingerprint(previewMeal), [previewMeal]);

  /** Sincronizar borradores cuando cambia el ítem principal en servidor (otra comida o guardado). */
  React.useEffect(() => {
    const idx = primaryMealItemIndex(previewMeal);
    if (idx < 0) {
      setDraftQty('');
      setDraftUnit('g');
      setDraftKcal('');
      setDraftProtein('');
      setDraftCarbs('');
      setDraftFat('');
      primaryFpRef.current = '';
      return;
    }
    const fp = primaryItemFingerprint(previewMeal);
    if (fp === primaryFpRef.current) return;
    primaryFpRef.current = fp;
    const prim = previewMeal.items[idx];
    setDraftUnit('g');
    setDraftQty(String(Math.round(prim.grams)));
    setDraftKcal(String(Math.round(prim.kcal)));
    setDraftProtein(formatMacroGForInput(prim.protein_g));
    setDraftCarbs(formatMacroGForInput(prim.carbs_g));
    setDraftFat(formatMacroGForInput(prim.fat_g));
  }, [previewMeal]);

  /** Al cambiar solo cantidad/unidad, reescalar kcal y macros desde el ítem en servidor. */
  React.useEffect(() => {
    const idx = primaryMealItemIndex(previewMeal);
    if (idx < 0) return;
    if (serverPrimaryFp !== primaryFpRef.current) return;

    const prim = previewMeal.items[idx];
    const raw = parseDraftAmount(draftQty);
    const g = Math.round(toGrams(raw, draftUnit));
    const scaled = scaleMacrosToGrams(
      prim.grams,
      g,
      prim.kcal,
      prim.protein_g,
      prim.carbs_g,
      prim.fat_g,
    );
    setDraftKcal(String(Math.round(scaled.kcal)));
    setDraftProtein(formatMacroGForInput(scaled.protein_g));
    setDraftCarbs(formatMacroGForInput(scaled.carbs_g));
    setDraftFat(formatMacroGForInput(scaled.fat_g));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evita reescala al cambiar solo la referencia de previewMeal
  }, [draftQty, draftUnit, serverPrimaryFp]);

  const handleUnitChange = (newUnit: FoodUnit) => {
    const idx = primaryMealItemIndex(previewMeal);
    if (idx < 0) return;
    const currentGrams = toGrams(parseFloat(draftQty.replace(',', '.')) || 0, draftUnit);
    const converted = fromGrams(currentGrams, newUnit);
    setDraftUnit(newUnit);
    setDraftQty(String(Math.round(converted * 100) / 100));
  };

  const displayMeal = React.useMemo(
    () =>
      mealWithPrimaryDrafts(
        previewMeal,
        draftQty,
        draftUnit,
        draftKcal,
        draftProtein,
        draftCarbs,
        draftFat,
      ),
    [previewMeal, draftQty, draftUnit, draftKcal, draftProtein, draftCarbs, draftFat],
  );

  const totalG = sumEatenGrams(displayMeal.items);
  const macroPct = macroKcalPercents(
    displayMeal.total_protein_g,
    displayMeal.total_carbs_g,
    displayMeal.total_fat_g,
  );
  const hasItems = (previewMeal.items?.length ?? 0) > 0;
  const primaryIdx = primaryMealItemIndex(previewMeal);
  const canEditPrimary = primaryIdx >= 0;

  const { foodTitle, distributor } = mealPreviewPrimaryFoodLabels(previewMeal);

  const patchMutation = useMutation({
    mutationFn: (items: MealItem[]) =>
      api.patch<MealEntry>(`/api/v1/meals/${previewMeal.id}`, { items: itemsToPatchPayload(items) }),
    onSuccess: (entry) => {
      invalidateMealRelatedQueries(queryClient);
      onMealUpdated(entry);
    },
    onError: (e: unknown) =>
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const deleteMealMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/meals/${previewMeal.id}`),
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      onCloseSheet();
    },
    onError: (e: unknown) =>
      Alert.alert('No se pudo eliminar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const favMutation = useSaveFavorite();
  const deleteFavMutation = useDeleteSavedFavorite();
  const favName = foodTitle || 'Alimento';
  const savedFavorite = savedMeals.find((s) => s.name === favName);
  const isFav = Boolean(savedFavorite);

  const onFavPress = () => {
    if (savedFavorite) {
      Alert.alert('Quitar de favoritos', `¿Quitar «${favName}» de favoritos?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: () =>
            deleteFavMutation.mutate(savedFavorite.id, {
              onSuccess: () => Alert.alert('Hecho', `«${favName}» ya no está en favoritos.`),
              onError: (e: unknown) =>
                Alert.alert('No se pudo quitar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
            }),
        },
      ]);
      return;
    }
    favMutation.mutate(
      { name: favName, items: displayMeal.items },
      {
        onSuccess: () => Alert.alert('Guardado', `«${favName}» añadido a favoritos.`),
        onError: (e: unknown) => Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
      },
    );
  };

  const onActualizar = () => {
    if (!canEditPrimary) return;
    patchMutation.mutate(displayMeal.items);
  };

  const onTrashPress = () => {
    if (!canEditPrimary) return;
    const name =
      (previewMeal.items[primaryIdx].custom_name || 'Alimento').split(/\s*[—·|]\s*/)[0]?.trim() || 'Alimento';
    confirmTwoAction('Quitar alimento', `¿Eliminar «${name}» de esta comida?`, 'Quitar', () => {
      const next = previewMeal.items.filter((_, i) => i !== primaryIdx);
      if (next.length === 0) {
        confirmTwoAction(
          'Eliminar comida',
          'Era el único alimento. Se borrará la entrada del diario.',
          'Eliminar',
          () => deleteMealMutation.mutate(),
        );
      } else {
        patchMutation.mutate(recalcEntryTotals(previewMeal, next).items);
      }
    });
  };

  const onMoreChevron = () => {
    Alert.alert('Más opciones', undefined, [
      { text: 'Edición completa', onPress: onOpenFullEdit },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const saving = patchMutation.isPending || deleteMealMutation.isPending;
  const favBusy = favMutation.isPending || deleteFavMutation.isPending;

  return (
    <View style={[styles.mpSheetRoot, { height: bodyHeight }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.mpScroll}
        contentContainerStyle={styles.mealPreviewScrollContent}
      >
        <View style={styles.mpHero}>
          <View style={styles.mpEmojiWrap} accessibilityLabel="Icono de la comida" accessible>
            <MealItemIconMedia
              visual={mealLeadingVisual(previewMeal)}
              emojiStyle={styles.mpEmoji}
              imageSize={40}
              minSlotWidth={44}
            />
          </View>
          <Text style={styles.mpTitle} numberOfLines={3}>
            {foodTitle}
          </Text>
          <Text style={styles.mpSubtitle} numberOfLines={2}>
            {distributor}
          </Text>
          <Text style={styles.mpMetaTime}>
            {mealTypeLabel(previewMeal.meal_type)} · {formatMealTime(previewMeal.created_at)}
          </Text>
          <Text style={styles.mpServingHint}>
            {totalG > 0 ? `Datos por ${totalG} g` : 'Resumen del registro'}
          </Text>
        </View>

        <View style={styles.mpStatRow}>
          <View style={styles.mpStatCard}>
            <View style={styles.mpStatInputRow}>
              <TextInput
                style={styles.mpStatInput}
                value={draftKcal}
                onChangeText={setDraftKcal}
                keyboardType="decimal-pad"
                inputMode="decimal"
                editable={canEditPrimary && !saving}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Kilocalorías del alimento principal"
              />
              <Text style={styles.mpStatUnitSuffix}>kcal</Text>
            </View>
          </View>
          <View style={styles.mpStatCard}>
            <View style={styles.mpStatInputRow}>
              <TextInput
                style={styles.mpStatInput}
                value={draftProtein}
                onChangeText={setDraftProtein}
                keyboardType="decimal-pad"
                inputMode="decimal"
                editable={canEditPrimary && !saving}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Proteínas en gramos"
              />
              <Text style={styles.mpStatUnitSuffix}>g</Text>
            </View>
            <Text style={styles.mpStatLabel}>proteínas</Text>
          </View>
          <View style={styles.mpStatCard}>
            <View style={styles.mpStatInputRow}>
              <TextInput
                style={styles.mpStatInput}
                value={draftCarbs}
                onChangeText={setDraftCarbs}
                keyboardType="decimal-pad"
                inputMode="decimal"
                editable={canEditPrimary && !saving}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Carbohidratos en gramos"
              />
              <Text style={styles.mpStatUnitSuffix}>g</Text>
            </View>
            <Text style={styles.mpStatLabel}>carbos</Text>
          </View>
          <View style={styles.mpStatCard}>
            <View style={styles.mpStatInputRow}>
              <TextInput
                style={styles.mpStatInput}
                value={draftFat}
                onChangeText={setDraftFat}
                keyboardType="decimal-pad"
                inputMode="decimal"
                editable={canEditPrimary && !saving}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Grasas en gramos"
              />
              <Text style={styles.mpStatUnitSuffix}>g</Text>
            </View>
            <Text style={styles.mpStatLabel}>grasas</Text>
          </View>
        </View>

        <View style={styles.mpBarBlock}>
          <View style={styles.mpBarTrack}>
            {macroPct.hasData ? (
              <>
                {macroPct.p > 0 ? (
                  <View style={[styles.mpBarSeg, { flex: macroPct.p, backgroundColor: PREVIEW_MACRO_BAR.protein }]} />
                ) : null}
                {macroPct.c > 0 ? (
                  <View style={[styles.mpBarSeg, { flex: macroPct.c, backgroundColor: PREVIEW_MACRO_BAR.carbs }]} />
                ) : null}
                {macroPct.f > 0 ? (
                  <View style={[styles.mpBarSeg, { flex: macroPct.f, backgroundColor: PREVIEW_MACRO_BAR.fat }]} />
                ) : null}
              </>
            ) : (
              <View style={[styles.mpBarSeg, { flex: 1, backgroundColor: colors.textTertiary }]} />
            )}
          </View>
          <View style={styles.mpLegendRow}>
            <View style={styles.mpLegendItem}>
              <View style={[styles.mpLegendDot, { backgroundColor: PREVIEW_MACRO_BAR.protein }]} />
              <Text style={styles.mpLegendText}>
                Proteínas{macroPct.hasData ? ` ${macroPct.p}%` : ''}
              </Text>
            </View>
            <View style={styles.mpLegendItem}>
              <View style={[styles.mpLegendDot, { backgroundColor: PREVIEW_MACRO_BAR.carbs }]} />
              <Text style={styles.mpLegendText}>Carbos{macroPct.hasData ? ` ${macroPct.c}%` : ''}</Text>
            </View>
            <View style={styles.mpLegendItem}>
              <View style={[styles.mpLegendDot, { backgroundColor: PREVIEW_MACRO_BAR.fat }]} />
              <Text style={styles.mpLegendText}>Grasas{macroPct.hasData ? ` ${macroPct.f}%` : ''}</Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={onToggleFoodSection}
          accessibilityRole="button"
          accessibilityState={{ expanded: foodSectionOpen }}
          style={({ pressed }) => [styles.mpAccordion, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.mpAccordionTitle}>Información nutricional</Text>
          <Ionicons name={foodSectionOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
        </Pressable>

        {foodSectionOpen ? (
          hasItems ? (
            <MealFoodItemRows mealId={previewMeal.id} items={displayMeal.items!} variant="home" dateStr={dateStr} />
          ) : (
            <Text style={styles.mealPreviewEmpty}>Sin alimentos en este registro.</Text>
          )
        ) : null}
      </ScrollView>

      <View style={[styles.mpFooter, { paddingBottom: bottomInset }]}>
        <View style={styles.mpFooterLabelsRow}>
          <Text style={styles.mpFooterLabel}>Cantidad</Text>
          <Text style={[styles.mpFooterLabel, styles.mpFooterLabelPortion]}>Porción</Text>
        </View>
        <View style={styles.mpFooterInputsRow}>
          <TextInput
            style={styles.mpQtyInput}
            value={draftQty}
            onChangeText={setDraftQty}
            keyboardType="decimal-pad"
            inputMode="decimal"
            editable={canEditPrimary && !saving}
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Cantidad"
          />
          <UnitPicker value={draftUnit} onChange={handleUnitChange} />
        </View>
        <View style={styles.mpFooterActions}>
          <Pressable
            onPress={onTrashPress}
            disabled={!canEditPrimary || saving}
            style={({ pressed }) => [
              styles.mpTrashBtn,
              (!canEditPrimary || saving) && styles.mpTrashBtnDisabled,
              pressed && canEditPrimary && !saving && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Quitar alimento"
          >
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </Pressable>
          <Pressable
            onPress={onFavPress}
            disabled={favBusy || saving}
            style={({ pressed }) => [
              styles.mpFavBtn,
              (favBusy || saving) && { opacity: 0.4 },
              pressed && !favBusy && !saving && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          >
            <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={22} color={isFav ? colors.success : colors.primary} />
          </Pressable>
          <View style={styles.mpCtaUpdateSplit}>
            <TideGradientFrame
              borderRadius={9999}
              style={[StyleSheet.absoluteFillObject, { pointerEvents: 'none' }]}
              contentContainerStyle={styles.mpCtaTideFill}
            >
              <View style={styles.mpCtaTideSpacer} />
            </TideGradientFrame>
            <Pressable
              onPress={onActualizar}
              disabled={!canEditPrimary || saving}
              style={({ pressed }) => [
                styles.mpCtaUpdateMain,
                (!canEditPrimary || saving) && styles.mpCtaUpdateDisabled,
                pressed && canEditPrimary && !saving && primaryCtaPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Actualizar comida"
            >
              {patchMutation.isPending ? (
                <Text style={styles.mpCtaUpdateText}>Guardando…</Text>
              ) : (
                <Text style={styles.mpCtaUpdateText}>Actualizar</Text>
              )}
            </Pressable>
            <View style={styles.mpCtaUpdateDivider} />
            <Pressable
              onPress={onMoreChevron}
              disabled={saving}
              style={({ pressed }) => [
                styles.mpCtaUpdateChevron,
                pressed && !saving && primaryCtaPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Más opciones"
            >
              <Ionicons name="chevron-down" size={20} color={colors.white} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

type GroupEditState = { mealId: string; items: MealItem[] };

function parseNum(s: string): number {
  const t = s.replace(',', '.').trim();
  if (t === '') return 0;
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function GroupEditSheetBody({
  state,
  dateStr,
  bottomInset,
  onClose,
  savedMeals,
}: {
  state: GroupEditState;
  dateStr: string;
  bottomInset: number;
  onClose: () => void;
  savedMeals: SavedMeal[];
}) {
  const queryClient = useQueryClient();
  const title = combinedMealTitle(state.items);

  const [draftItems, setDraftItems] = React.useState<MealItem[]>(() =>
    state.items.map((it) => ({ ...it })),
  );

  const totals = React.useMemo(() => {
    let kcal = 0, p = 0, c = 0, f = 0;
    for (const it of draftItems) {
      kcal += it.kcal;
      p += it.protein_g;
      c += it.carbs_g;
      f += it.fat_g;
    }
    return {
      kcal: Math.round(kcal * 10) / 10,
      protein: Math.round(p * 10) / 10,
      carbs: Math.round(c * 10) / 10,
      fat: Math.round(f * 10) / 10,
    };
  }, [draftItems]);

  const [totalKcalStr, setTotalKcalStr] = React.useState(String(Math.round(totals.kcal)));
  const [totalPStr, setTotalPStr] = React.useState(formatMacroGForInput(totals.protein));
  const [totalCStr, setTotalCStr] = React.useState(formatMacroGForInput(totals.carbs));
  const [totalFStr, setTotalFStr] = React.useState(formatMacroGForInput(totals.fat));

  const applyProportional = (field: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g', newTotal: number) => {
    const oldTotal = draftItems.reduce((s, it) => s + it[field], 0);
    if (oldTotal <= 0) return;
    const ratio = newTotal / oldTotal;
    setDraftItems((prev) =>
      prev.map((it) => ({ ...it, [field]: roundMacroG(it[field] * ratio) })),
    );
  };

  const onTotalBlur = (field: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g', str: string) => {
    const val = parseNum(str);
    applyProportional(field, val);
  };

  React.useEffect(() => {
    setTotalKcalStr(String(Math.round(totals.kcal)));
    setTotalPStr(formatMacroGForInput(totals.protein));
    setTotalCStr(formatMacroGForInput(totals.carbs));
    setTotalFStr(formatMacroGForInput(totals.fat));
  }, [totals]);

  const updateItem = (idx: number, field: keyof Pick<MealItem, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'grams'>, value: number) => {
    setDraftItems((prev) => {
      const next = [...prev];
      const current = next[idx];
      if (!current) return prev;
      if (field === 'grams') {
        const grams = Math.max(0, Math.round(value));
        const scaled = scaleMacrosToGrams(
          current.grams,
          grams,
          current.kcal,
          current.protein_g,
          current.carbs_g,
          current.fat_g,
        );
        next[idx] = {
          ...current,
          grams: Math.round(scaled.grams),
          kcal: scaled.kcal,
          protein_g: scaled.protein_g,
          carbs_g: scaled.carbs_g,
          fat_g: scaled.fat_g,
        };
      } else {
        next[idx] = { ...current, [field]: roundMacroG(value) };
      }
      return next;
    });
  };

  const patchMutation = useMutation({
    mutationFn: (itemsOverride?: MealItem[]) =>
      api.patch<MealEntry>(`/api/v1/meals/${state.mealId}`, { items: itemsToPatchPayload(itemsOverride ?? draftItems) }),
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      onClose();
    },
    onError: (e: unknown) =>
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const removeItemMutation = useMutation({
    mutationFn: (items: MealItem[]) =>
      api.patch<MealEntry>(`/api/v1/meals/${state.mealId}`, { items: itemsToPatchPayload(items) }),
    onSuccess: () => invalidateMealRelatedQueries(queryClient),
    onError: (e: unknown) =>
      Alert.alert('No se pudo quitar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const deleteMealMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/meals/${state.mealId}`),
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      onClose();
    },
    onError: (e: unknown) =>
      Alert.alert('No se pudo eliminar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const favMutation = useSaveFavorite();
  const deleteFavMutation = useDeleteSavedFavorite();
  const savedFavoriteAll = savedMeals.find((s) => s.name === title);
  const isFavAll = Boolean(savedFavoriteAll);
  const isFavItem = (name: string) => savedMeals.some((s) => s.name === name);
  const favBusy = favMutation.isPending || deleteFavMutation.isPending;

  const onFavAll = () => {
    if (savedFavoriteAll) {
      Alert.alert('Quitar de favoritos', `¿Quitar «${title}» de favoritos?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: () =>
            deleteFavMutation.mutate(savedFavoriteAll.id, {
              onSuccess: () => Alert.alert('Hecho', `«${title}» ya no está en favoritos.`),
              onError: (e: unknown) =>
                Alert.alert('No se pudo quitar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
            }),
        },
      ]);
      return;
    }
    favMutation.mutate(
      { name: title, items: draftItems },
      {
        onSuccess: () => Alert.alert('Guardado', `«${title}» añadido a favoritos.`),
        onError: (e: unknown) => Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
      },
    );
  };

  const onFavItem = (item: MealItem) => {
    const n = (item.custom_name || 'Alimento').split(/\s*[—·|]\s*/)[0]?.trim() || 'Alimento';
    const existing = savedMeals.find((s) => s.name === n);
    if (existing) {
      Alert.alert('Quitar de favoritos', `¿Quitar «${n}» de favoritos?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: () =>
            deleteFavMutation.mutate(existing.id, {
              onSuccess: () => Alert.alert('Hecho', `«${n}» ya no está en favoritos.`),
              onError: (e: unknown) =>
                Alert.alert('No se pudo quitar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
            }),
        },
      ]);
      return;
    }
    favMutation.mutate(
      { name: n, items: [item] },
      {
        onSuccess: () => Alert.alert('Guardado', `«${n}» añadido a favoritos.`),
        onError: (e: unknown) => Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
      },
    );
  };

  const removeItem = (idx: number) => {
    const item = draftItems[idx];
    if (!item) return;
    const name = (item.custom_name || 'Alimento').split(/\s*[—·|]\s*/)[0]?.trim() || 'Alimento';
    if (draftItems.length <= 1) {
      confirmTwoAction(
        'Eliminar comida',
        `«${name}» es el último alimento. ¿Borrar esta comida del diario?`,
        'Eliminar',
        () => deleteMealMutation.mutate(),
      );
      return;
    }
    confirmTwoAction('Quitar alimento', `¿Eliminar «${name}» de esta comida?`, 'Quitar', () => {
      const next = draftItems.filter((_, i) => i !== idx);
      setDraftItems(next);
      removeItemMutation.mutate(next);
    });
  };

  const saving = patchMutation.isPending || removeItemMutation.isPending || deleteMealMutation.isPending;

  const mealEmoji = '🍽️';
  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxH = Math.min(windowHeight * PREVIEW_SHEET_FRAC, PREVIEW_SHEET_CAP);
  const bodyHeight = Math.max(320, sheetMaxH - 72);
  const totalG = sumEatenGrams(draftItems);
  const macroPct = macroKcalPercents(totals.protein, totals.carbs, totals.fat);

  return (
    <View style={[styles.mpSheetRoot, { height: bodyHeight }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.mpScroll}
        contentContainerStyle={styles.mealPreviewScrollContent}
      >
        <View style={styles.mpHero}>
          <View style={styles.mpEmojiWrap} accessibilityLabel="Icono de la comida" accessible>
            <Text style={styles.mpEmoji}>{mealEmoji}</Text>
          </View>
          <Text style={styles.mpTitle} numberOfLines={3}>
            {title}
          </Text>
          <Text style={styles.mpServingHint}>
            {totalG > 0 ? `Datos por ${totalG} g` : 'Resumen de la comida'}
          </Text>
        </View>

        <View style={styles.mpStatRow}>
          <View style={styles.mpStatCard}>
            <View style={styles.mpStatInputRow}>
              <TextInput
                style={styles.mpStatInput}
                value={totalKcalStr}
                onChangeText={setTotalKcalStr}
                onBlur={() => onTotalBlur('kcal', totalKcalStr)}
                keyboardType="decimal-pad"
                inputMode="decimal"
                editable={!saving}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Kilocalorías totales de la comida"
              />
              <Text style={styles.mpStatUnitSuffix}>kcal</Text>
            </View>
          </View>
          <View style={styles.mpStatCard}>
            <View style={styles.mpStatInputRow}>
              <TextInput
                style={styles.mpStatInput}
                value={totalPStr}
                onChangeText={setTotalPStr}
                onBlur={() => onTotalBlur('protein_g', totalPStr)}
                keyboardType="decimal-pad"
                inputMode="decimal"
                editable={!saving}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Proteínas en gramos (total)"
              />
              <Text style={styles.mpStatUnitSuffix}>g</Text>
            </View>
            <Text style={styles.mpStatLabel}>proteínas</Text>
          </View>
          <View style={styles.mpStatCard}>
            <View style={styles.mpStatInputRow}>
              <TextInput
                style={styles.mpStatInput}
                value={totalCStr}
                onChangeText={setTotalCStr}
                onBlur={() => onTotalBlur('carbs_g', totalCStr)}
                keyboardType="decimal-pad"
                inputMode="decimal"
                editable={!saving}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Carbohidratos en gramos (total)"
              />
              <Text style={styles.mpStatUnitSuffix}>g</Text>
            </View>
            <Text style={styles.mpStatLabel}>carbos</Text>
          </View>
          <View style={styles.mpStatCard}>
            <View style={styles.mpStatInputRow}>
              <TextInput
                style={styles.mpStatInput}
                value={totalFStr}
                onChangeText={setTotalFStr}
                onBlur={() => onTotalBlur('fat_g', totalFStr)}
                keyboardType="decimal-pad"
                inputMode="decimal"
                editable={!saving}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Grasas en gramos (total)"
              />
              <Text style={styles.mpStatUnitSuffix}>g</Text>
            </View>
            <Text style={styles.mpStatLabel}>grasas</Text>
          </View>
        </View>

        <View style={styles.mpBarBlock}>
          <View style={styles.mpBarTrack}>
            {macroPct.hasData ? (
              <>
                {macroPct.p > 0 ? (
                  <View style={[styles.mpBarSeg, { flex: macroPct.p, backgroundColor: PREVIEW_MACRO_BAR.protein }]} />
                ) : null}
                {macroPct.c > 0 ? (
                  <View style={[styles.mpBarSeg, { flex: macroPct.c, backgroundColor: PREVIEW_MACRO_BAR.carbs }]} />
                ) : null}
                {macroPct.f > 0 ? (
                  <View style={[styles.mpBarSeg, { flex: macroPct.f, backgroundColor: PREVIEW_MACRO_BAR.fat }]} />
                ) : null}
              </>
            ) : (
              <View style={[styles.mpBarSeg, { flex: 1, backgroundColor: colors.textTertiary }]} />
            )}
          </View>
          <View style={styles.mpLegendRow}>
            <View style={styles.mpLegendItem}>
              <View style={[styles.mpLegendDot, { backgroundColor: PREVIEW_MACRO_BAR.protein }]} />
              <Text style={styles.mpLegendText}>
                Proteínas{macroPct.hasData ? ` ${macroPct.p}%` : ''}
              </Text>
            </View>
            <View style={styles.mpLegendItem}>
              <View style={[styles.mpLegendDot, { backgroundColor: PREVIEW_MACRO_BAR.carbs }]} />
              <Text style={styles.mpLegendText}>Carbos{macroPct.hasData ? ` ${macroPct.c}%` : ''}</Text>
            </View>
            <View style={styles.mpLegendItem}>
              <View style={[styles.mpLegendDot, { backgroundColor: PREVIEW_MACRO_BAR.fat }]} />
              <Text style={styles.mpLegendText}>Grasas{macroPct.hasData ? ` ${macroPct.f}%` : ''}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.mpAccordion, { marginBottom: spacing.sm }]}>
          <Text style={styles.mpAccordionTitle}>Alimentos</Text>
          <View style={{ width: 20 }} />
        </View>

        {draftItems.map((it, idx) => {
          const n = (it.custom_name || 'Alimento').split(/\s*[—·|]\s*/)[0]?.trim() || 'Alimento';
          return (
            <GroupEditItemRow
              key={it.id ?? `ge-${idx}`}
              item={it}
              saving={saving}
              favBusy={favBusy}
              onUpdate={(field, val) => updateItem(idx, field, val)}
              onFavPress={() => onFavItem(it)}
              onRemove={() => removeItem(idx)}
              isFav={isFavItem(n)}
            />
          );
        })}
      </ScrollView>

      <View style={[styles.mpFooter, { paddingBottom: bottomInset }]}>
        <View style={geStyles.footerRow}>
          <Pressable
            onPress={onFavAll}
            disabled={favBusy || saving}
            style={({ pressed }) => [
              geStyles.favBtn,
              (favBusy || saving) && { opacity: 0.4 },
              pressed && !favBusy && !saving && { opacity: 0.85 },
            ]}
            accessibilityLabel={isFavAll ? 'Quitar comida de favoritos' : 'Guardar comida en favoritos'}
          >
            <Ionicons name={isFavAll ? 'heart' : 'heart-outline'} size={20} color={isFavAll ? colors.success : colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => patchMutation.mutate(undefined)}
            disabled={saving}
            style={({ pressed }) => [
              geStyles.saveBtnOuter,
              saving && { opacity: 0.5 },
              pressed && !saving && primaryCtaPressed,
            ]}
          >
            <TideGradientFrame
              borderRadius={9999}
              style={geStyles.saveBtnTide}
              contentContainerStyle={geStyles.saveBtnInner}
            >
              <Ionicons name="checkmark-circle" size={20} color={colors.white} style={{ marginRight: 8 }} />
              <Text style={geStyles.saveBtnText}>{saving ? 'Guardando…' : 'Guardar cambios'}</Text>
            </TideGradientFrame>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function FoodInfoSheetBody({
  mealId,
  item,
  dateStr,
  bottomInset,
  onClose,
}: {
  mealId: string;
  item: MealItem;
  dateStr: string;
  bottomInset: number;
  onClose: () => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxH = Math.min(windowHeight * PREVIEW_SHEET_FRAC, PREVIEW_SHEET_CAP);
  const bodyHeight = Math.max(320, sheetMaxH - 72);
  const queryClient = useQueryClient();
  const raw = (item.custom_name || 'Alimento').trim();
  const { title, subtitle } = mealItemDisplayPartsForUi(raw);

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<MealItem>(() => ({ ...item }));

  const [qtyUnit, setQtyUnit] = React.useState<FoodUnit>('g');
  const [qtyStr, setQtyStr] = React.useState(String(Math.round(item.grams)));
  const [kcalStr, setKcalStr] = React.useState(String(Math.round(item.kcal)));
  const [pStr, setPStr] = React.useState(formatMacroGForInput(item.protein_g));
  const [cStr, setCStr] = React.useState(formatMacroGForInput(item.carbs_g));
  const [fStr, setFStr] = React.useState(formatMacroGForInput(item.fat_g));

  React.useEffect(() => {
    setDraft({ ...item });
    setQtyUnit('g');
    setQtyStr(String(Math.round(item.grams)));
    setKcalStr(String(Math.round(item.kcal)));
    setPStr(formatMacroGForInput(item.protein_g));
    setCStr(formatMacroGForInput(item.carbs_g));
    setFStr(formatMacroGForInput(item.fat_g));
  }, [item]);

  const updateField = (field: 'grams' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g', value: number) => {
    setDraft((prev) => {
      if (field === 'grams') {
        const grams = Math.max(0, Math.round(value));
        const scaled = scaleMacrosToGrams(prev.grams, grams, prev.kcal, prev.protein_g, prev.carbs_g, prev.fat_g);
        return {
          ...prev,
          grams: Math.round(scaled.grams),
          kcal: scaled.kcal,
          protein_g: scaled.protein_g,
          carbs_g: scaled.carbs_g,
          fat_g: scaled.fat_g,
        };
      }
      return { ...prev, [field]: roundMacroG(value) };
    });
  };

  const onQtyBlur = () => {
    const grams = Math.round(toGrams(parseNum(qtyStr), qtyUnit));
    updateField('grams', grams);
  };
  const onKcalBlur = () => updateField('kcal', parseNum(kcalStr));
  const onPBlur = () => updateField('protein_g', parseNum(pStr));
  const onCBlur = () => updateField('carbs_g', parseNum(cStr));
  const onFBlur = () => updateField('fat_g', parseNum(fStr));

  const handleUnitChange = (newUnit: FoodUnit) => {
    const currentGrams = Math.round(toGrams(parseNum(qtyStr), qtyUnit));
    const converted = fromGrams(currentGrams, newUnit);
    setQtyUnit(newUnit);
    setQtyStr(String(Math.round(converted * 100) / 100));
  };

  const getMealItems = (): MealItem[] | null => {
    const data = queryClient.getQueryData<DayDiary>(['diary', dateStr]);
    const meal = data?.meals.find((m) => m.id === mealId);
    return meal ? meal.items.map((it) => ({ ...it })) : null;
  };

  const patchMutation = useMutation({
    mutationFn: (items: MealItem[]) =>
      api.patch<MealEntry>(`/api/v1/meals/${mealId}`, { items: itemsToPatchPayload(items) }),
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      onClose();
    },
    onError: (e: unknown) =>
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const deleteMealMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/meals/${mealId}`),
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      onClose();
    },
    onError: (e: unknown) =>
      Alert.alert('No se pudo eliminar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const saving = patchMutation.isPending || deleteMealMutation.isPending;

  const onSave = () => {
    const items = getMealItems();
    if (!items) {
      Alert.alert('No se pudo guardar', 'No se encontraron los datos de la comida.');
      return;
    }
    const idx = items.findIndex((it) => it.id === item.id);
    if (idx < 0) {
      Alert.alert('No se pudo guardar', 'No se encontró el alimento en la comida.');
      return;
    }
    items[idx] = { ...draft };
    patchMutation.mutate(items);
  };

  const onDelete = () => {
    const items = getMealItems();
    if (!items) {
      Alert.alert('No se pudo eliminar', 'No se encontraron los datos de la comida.');
      return;
    }
    const name = title || 'Alimento';
    if (items.length <= 1) {
      confirmTwoAction(
        'Eliminar comida',
        `«${name}» es el último alimento. ¿Borrar esta comida del diario?`,
        'Eliminar',
        () => deleteMealMutation.mutate(),
      );
      return;
    }
    confirmTwoAction('Quitar alimento', `¿Eliminar «${name}» de esta comida?`, 'Quitar', () => {
      const next = items.filter((it) => it.id !== item.id);
      patchMutation.mutate(next);
    });
  };

  const grams = Math.max(0, draft.grams);
  const kcal = Math.max(0, draft.kcal);
  const protein = Math.max(0, draft.protein_g);
  const carbs = Math.max(0, draft.carbs_g);
  const fat = Math.max(0, draft.fat_g);

  const per100 = (v: number) => (grams > 0 ? (v * 100) / grams : 0);

  const proteinKcal = protein * 4;
  const carbsKcal = carbs * 4;
  const fatKcal = fat * 9;
  const totalMacroKcal = proteinKcal + carbsKcal + fatKcal;
  const pPct = totalMacroKcal > 0 ? Math.round((proteinKcal / totalMacroKcal) * 100) : 0;
  const cPct = totalMacroKcal > 0 ? Math.round((carbsKcal / totalMacroKcal) * 100) : 0;
  const fPct = totalMacroKcal > 0 ? Math.max(0, 100 - pPct - cPct) : 0;

  return (
    <View style={[foodInfoStyles.root, { height: bodyHeight }]}>
      <ScrollView
        style={foodInfoStyles.scroll}
        contentContainerStyle={foodInfoStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={foodInfoStyles.titleRow}>
          <View style={foodInfoStyles.titleCol}>
            <Text style={foodInfoStyles.title} numberOfLines={3}>{title}</Text>
            {subtitle ? <Text style={foodInfoStyles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
          </View>
          <Pressable
            onPress={() => setEditing((p) => !p)}
            disabled={saving || !item.id}
            hitSlop={8}
            style={({ pressed }) => [
              foodInfoStyles.headerBtn,
              editing && foodInfoStyles.headerBtnActive,
              (saving || !item.id) && { opacity: 0.45 },
              pressed && !saving && item.id && { opacity: 0.75 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Cancelar edición' : 'Editar alimento'}
          >
            <Ionicons
              name={editing ? 'close' : 'create-outline'}
              size={18}
              color={editing ? colors.white : colors.primary}
            />
          </Pressable>
          <Pressable
            onPress={onDelete}
            disabled={saving || !item.id}
            hitSlop={8}
            style={({ pressed }) => [
              foodInfoStyles.headerBtnDanger,
              (saving || !item.id) && { opacity: 0.45 },
              pressed && !saving && item.id && { opacity: 0.75 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Eliminar alimento"
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </Pressable>
        </View>

        {editing ? (
          <View style={foodInfoStyles.editGrid}>
            <View style={foodInfoStyles.editRow}>
              <Text style={foodInfoStyles.editLabel}>Cantidad</Text>
              <View style={foodInfoStyles.editInputWrap}>
                <TextInput
                  style={foodInfoStyles.editInput}
                  value={qtyStr}
                  onChangeText={setQtyStr}
                  onBlur={onQtyBlur}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  editable={!saving}
                  placeholder="0"
                  placeholderTextColor={colors.textTertiary}
                />
                <UnitPicker
                  value={qtyUnit}
                  onChange={handleUnitChange}
                  triggerTextMode="abbr"
                  triggerStyle={foodInfoStyles.unitPickerTrigger}
                  triggerTextStyle={foodInfoStyles.unitPickerText}
                />
              </View>
            </View>
            {([
              { label: 'Calorías', unit: 'kcal', val: kcalStr, set: setKcalStr, onBlur: onKcalBlur },
              { label: 'Proteínas', unit: 'g', val: pStr, set: setPStr, onBlur: onPBlur },
              { label: 'Carbohidratos', unit: 'g', val: cStr, set: setCStr, onBlur: onCBlur },
              { label: 'Grasas', unit: 'g', val: fStr, set: setFStr, onBlur: onFBlur },
            ] as const).map((row) => (
              <View key={row.label} style={foodInfoStyles.editRow}>
                <Text style={foodInfoStyles.editLabel}>{row.label}</Text>
                <View style={foodInfoStyles.editInputWrap}>
                  <TextInput
                    style={foodInfoStyles.editInput}
                    value={row.val}
                    onChangeText={row.set}
                    onBlur={row.onBlur}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    editable={!saving}
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                  />
                  <Text style={foodInfoStyles.editUnit}>{row.unit}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <>
            <View style={foodInfoStyles.summaryRow}>
              <View style={foodInfoStyles.summaryCol}>
                <Text style={foodInfoStyles.summaryValue}>{Math.round(grams)} g</Text>
                <Text style={foodInfoStyles.summaryLabel}>Cantidad</Text>
              </View>
              <View style={foodInfoStyles.summaryDivider} />
              <View style={foodInfoStyles.summaryCol}>
                <Text style={foodInfoStyles.summaryValue}>{Math.round(kcal)} kcal</Text>
                <Text style={foodInfoStyles.summaryLabel}>Calorías</Text>
              </View>
            </View>

            <Text style={foodInfoStyles.sectionTitle}>Macronutrientes</Text>

            <View style={foodInfoStyles.macroRow}>
              <View style={[foodInfoStyles.macroDot, { backgroundColor: PREVIEW_MACRO_BAR.protein }]} />
              <Text style={foodInfoStyles.macroName}>Proteínas</Text>
              <Text style={foodInfoStyles.macroValue}>{protein.toFixed(1)} g</Text>
              <Text style={foodInfoStyles.macroPct}>{pPct}%</Text>
            </View>
            <View style={foodInfoStyles.macroRow}>
              <View style={[foodInfoStyles.macroDot, { backgroundColor: PREVIEW_MACRO_BAR.carbs }]} />
              <Text style={foodInfoStyles.macroName}>Carbohidratos</Text>
              <Text style={foodInfoStyles.macroValue}>{carbs.toFixed(1)} g</Text>
              <Text style={foodInfoStyles.macroPct}>{cPct}%</Text>
            </View>
            <View style={foodInfoStyles.macroRow}>
              <View style={[foodInfoStyles.macroDot, { backgroundColor: PREVIEW_MACRO_BAR.fat }]} />
              <Text style={foodInfoStyles.macroName}>Grasas</Text>
              <Text style={foodInfoStyles.macroValue}>{fat.toFixed(1)} g</Text>
              <Text style={foodInfoStyles.macroPct}>{fPct}%</Text>
            </View>

            {grams > 0 ? (
              <>
                <Text style={foodInfoStyles.sectionTitle}>Por 100 g</Text>
                <View style={foodInfoStyles.per100Row}>
                  <Text style={foodInfoStyles.per100Label}>Calorías</Text>
                  <Text style={foodInfoStyles.per100Value}>{Math.round(per100(kcal))} kcal</Text>
                </View>
                <View style={foodInfoStyles.per100Row}>
                  <Text style={foodInfoStyles.per100Label}>Proteínas</Text>
                  <Text style={foodInfoStyles.per100Value}>{per100(protein).toFixed(1)} g</Text>
                </View>
                <View style={foodInfoStyles.per100Row}>
                  <Text style={foodInfoStyles.per100Label}>Carbohidratos</Text>
                  <Text style={foodInfoStyles.per100Value}>{per100(carbs).toFixed(1)} g</Text>
                </View>
                <View style={foodInfoStyles.per100Row}>
                  <Text style={foodInfoStyles.per100Label}>Grasas</Text>
                  <Text style={foodInfoStyles.per100Value}>{per100(fat).toFixed(1)} g</Text>
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {editing ? (
        <View style={[foodInfoStyles.footer, { paddingBottom: bottomInset }]}>
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={({ pressed }) => [
              foodInfoStyles.saveBtnOuter,
              saving && { opacity: 0.5 },
              pressed && !saving && primaryCtaPressed,
            ]}
          >
            <TideGradientFrame
              borderRadius={9999}
              style={foodInfoStyles.saveBtnTide}
              contentContainerStyle={foodInfoStyles.saveBtnInner}
            >
              <Ionicons name="checkmark-circle" size={20} color={colors.white} style={{ marginRight: 8 }} />
              <Text style={foodInfoStyles.saveBtnText}>{saving ? 'Guardando…' : 'Guardar cambios'}</Text>
            </TideGradientFrame>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const foodInfoStyles = StyleSheet.create({
  root: { width: '100%', minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: {
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 26,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnActive: {
    backgroundColor: colors.primary,
  },
  headerBtnDanger: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.dangerMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editGrid: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  editLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  editInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editInput: {
    minWidth: 80,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  editUnit: {
    fontSize: 13,
    color: colors.textMuted,
    minWidth: 32,
  },
  unitPickerTrigger: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 56,
  },
  unitPickerText: {
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  saveBtnOuter: { width: '100%' },
  saveBtnTide: { width: '100%' },
  saveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  summaryCol: { flex: 1, alignItems: 'center' },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  macroDot: { width: 10, height: 10, borderRadius: 5 },
  macroName: { flex: 1, fontSize: 15, color: colors.text },
  macroValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    minWidth: 70,
    textAlign: 'right',
  },
  macroPct: {
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    minWidth: 38,
    textAlign: 'right',
  },
  per100Row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  per100Label: { fontSize: 14, color: colors.textSecondary },
  per100Value: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
});

function GroupEditItemRow({
  item,
  saving,
  favBusy,
  onUpdate,
  onFavPress,
  onRemove,
  isFav,
}: {
  item: MealItem;
  saving: boolean;
  favBusy?: boolean;
  onUpdate: (field: keyof Pick<MealItem, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'grams'>, val: number) => void;
  onFavPress?: () => void;
  onRemove?: () => void;
  isFav?: boolean;
}) {
  const raw = (item.custom_name || 'Alimento').trim();
  const { title } = mealItemDisplayPartsForUi(raw);
  const [expanded, setExpanded] = React.useState(false);

  const [gramsStr, setGramsStr] = React.useState(String(Math.round(item.grams)));
  const [kcalStr, setKcalStr] = React.useState(String(Math.round(item.kcal)));
  const [pStr, setPStr] = React.useState(formatMacroGForInput(item.protein_g));
  const [cStr, setCStr] = React.useState(formatMacroGForInput(item.carbs_g));
  const [fStr, setFStr] = React.useState(formatMacroGForInput(item.fat_g));

  React.useEffect(() => {
    setGramsStr(String(Math.round(item.grams)));
    setKcalStr(String(Math.round(item.kcal)));
    setPStr(formatMacroGForInput(item.protein_g));
    setCStr(formatMacroGForInput(item.carbs_g));
    setFStr(formatMacroGForInput(item.fat_g));
  }, [item.grams, item.kcal, item.protein_g, item.carbs_g, item.fat_g]);

  const itemVisual = React.useMemo(() => mealItemVisualIconForLookupName(title), [title]);

  return (
    <View style={[geStyles.itemBlock, expanded && geStyles.itemBlockExpanded]}>
      <View style={geStyles.itemHeader}>
        <Pressable
          style={({ pressed }) => [geStyles.itemMain, pressed && { opacity: 0.85 }]}
          onPress={() => setExpanded((p) => !p)}
        >
          <MealItemIconMedia visual={itemVisual} emojiStyle={geStyles.itemEmoji} imageSize={20} minSlotWidth={28} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={geStyles.itemName} numberOfLines={1}>{title}</Text>
            <View style={geStyles.itemChips}>
              <Text style={geStyles.itemChip}>{Math.round(item.grams)}g</Text>
              <Text style={[geStyles.itemChip, { color: colors.primary }]}>{Math.round(item.kcal)} kcal</Text>
            </View>
          </View>
          <View style={geStyles.chevronCircle}>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
          </View>
        </Pressable>
        {onFavPress ? (
          <Pressable
            onPress={onFavPress}
            disabled={Boolean(favBusy) || saving}
            style={({ pressed }) => [
              geStyles.itemFavBtn,
              (favBusy || saving) && { opacity: 0.45 },
              pressed && !favBusy && !saving && { opacity: 0.7 },
            ]}
            accessibilityLabel={isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          >
            <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={16} color={isFav ? colors.success : colors.primary} />
          </Pressable>
        ) : null}
        {onRemove ? (
          <Pressable
            onPress={onRemove}
            disabled={saving}
            hitSlop={8}
            style={({ pressed }) => [
              geStyles.itemRemoveBtn,
              saving && { opacity: 0.45 },
              pressed && !saving && { opacity: 0.7 },
            ]}
            accessibilityLabel="Quitar alimento"
          >
            <Ionicons name="trash-outline" size={16} color={colors.error} />
          </Pressable>
        ) : null}
      </View>

      {expanded && (
        <View style={geStyles.itemFields}>
          <View style={geStyles.fieldSep} />
          {([
            { label: 'Cantidad', unit: 'g', val: gramsStr, set: setGramsStr, field: 'grams' as const, color: colors.textSecondary },
            { label: 'Calorías', unit: 'kcal', val: kcalStr, set: setKcalStr, field: 'kcal' as const, color: colors.primary },
            { label: 'Proteínas', unit: 'g', val: pStr, set: setPStr, field: 'protein_g' as const, color: colors.protein },
            { label: 'Carbohidratos', unit: 'g', val: cStr, set: setCStr, field: 'carbs_g' as const, color: colors.carbs },
            { label: 'Grasas', unit: 'g', val: fStr, set: setFStr, field: 'fat_g' as const, color: colors.fat },
          ] as const).map((row) => (
            <View key={row.field} style={geStyles.fieldRow}>
              <View style={[geStyles.fieldDot, { backgroundColor: row.color }]} />
              <Text style={geStyles.fieldLabel}>{row.label}</Text>
              <View style={geStyles.fieldInputWrap}>
                <TextInput
                  style={geStyles.fieldInput}
                  value={row.val}
                  onChangeText={row.set}
                  onBlur={() => onUpdate(row.field, parseNum(row.val))}
                  keyboardType="decimal-pad"
                  editable={!saving}
                />
                <Text style={geStyles.fieldUnit}>{row.unit}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const geStyles = StyleSheet.create({
  itemBlock: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  itemBlockExpanded: {
    borderColor: colors.primary + '44',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    gap: 10,
  },
  itemMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemEmoji: { fontSize: 22, lineHeight: 26 },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 19,
  },
  itemChips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  itemChip: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  chevronCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border + '66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemFields: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: 10,
  },
  fieldSep: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  fieldLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  fieldInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    gap: 4,
  },
  fieldInput: {
    width: 56,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
    paddingVertical: 6,
    fontVariant: ['tabular-nums'],
  },
  fieldUnit: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  itemFavBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerMuted,
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 93, 0.28)',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: screenPaddingX,
  },
  favBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  saveBtnOuter: {
    flex: 1,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  saveBtnTide: {
    width: '100%',
  },
  saveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md + 2,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.2,
  },
});

/**
 * Cuerpo del Modal "Registrar peso" como sub-componente con estado local.
 *
 * Por qué es un componente aparte: en Android, mantener `weightInput` en el
 * state de `HomeScreen` provoca un re-render gigantesco en cada tecla (la
 * pantalla tiene varios `useQuery`/`useMutation`). Combinado con `Modal` +
 * `adjustResize`, ese trabajo extra hace que el IME se cierre y reabra entre
 * pulsaciones (problema reproducido en issues de RN/Gorhom). Aislando el
 * estado del input aquí, solo este sub-árbol se re-renderiza al teclear.
 */
type WeightLogModalContentProps = {
  onSave: (raw: string) => void;
  onClose: () => void;
  onOpenHistory: () => void;
  isPending: boolean;
};

const WeightLogModalContent = React.memo(function WeightLogModalContent({
  onSave,
  onClose,
  onOpenHistory,
  isPending,
}: WeightLogModalContentProps) {
  const [weightInput, setWeightInput] = React.useState('');
  const inputRef = React.useRef<TextInput | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 220);
    return () => clearTimeout(t);
  }, []);

  const trimmed = weightInput.trim();
  const canSave = trimmed.length > 0 && !isPending;
  const submit = React.useCallback(() => {
    if (canSave) onSave(weightInput);
  }, [canSave, onSave, weightInput]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.wsOverlay}
    >
      <Pressable style={styles.wsBackdrop} onPress={onClose} />
      <View style={styles.wsCard}>
        <Text style={styles.wsTitle}>Registrar peso</Text>
        <Text style={styles.wsSubtitle}>Se guarda con la fecha de hoy</Text>

        <View style={styles.wsInputWrap}>
          <TextInput
            ref={inputRef}
            style={styles.wsInput}
            value={weightInput}
            onChangeText={setWeightInput}
            placeholder="72.5"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            inputMode="decimal"
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
            maxLength={6}
            onSubmitEditing={submit}
          />
          <View style={styles.wsInputSpacer} />
          <Text style={styles.wsInputUnit}>kg</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.wsSaveBtn,
            !canSave && styles.wsSaveBtnDisabled,
            pressed && canSave && { opacity: 0.88, transform: [{ scale: 0.98 }] },
          ]}
          onPress={submit}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel="Guardar peso"
        >
          <Ionicons name="checkmark-circle" size={18} color={colors.white} />
          <Text style={styles.wsSaveBtnText}>
            {isPending ? 'Guardando…' : 'Guardar'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.wsHistoryLink, pressed && { opacity: 0.7 }]}
          onPress={onOpenHistory}
          accessibilityRole="link"
          accessibilityLabel="Ver historial de peso"
        >
          <Text style={styles.wsHistoryLinkText}>Ver historial completo</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
});

/**
 * Cuerpo del BottomSheet "Objetivo de pasos" con estado local.
 * Mismo motivo que `WeightLogModalContent`: aislar `stepsGoalInput` evita el
 * ciclo cierre/apertura del teclado en Android al teclear.
 */
type StepsGoalSheetContentProps = {
  initialSteps: string;
  onSave: (parsed: number) => void;
  onCancel: () => void;
  isPending: boolean;
};

const StepsGoalSheetContent = React.memo(function StepsGoalSheetContent({
  initialSteps,
  onSave,
  onCancel,
  isPending,
}: StepsGoalSheetContentProps) {
  const [stepsGoalInput, setStepsGoalInput] = React.useState(initialSteps);

  const stepsGoalDraftParsed = React.useMemo(
    () => parseStepsTargetInput(stepsGoalInput),
    [stepsGoalInput],
  );
  const stepsGoalInValidRange =
    stepsGoalDraftParsed != null &&
    stepsGoalDraftParsed >= 1000 &&
    stepsGoalDraftParsed <= 50_000;

  const handleSave = React.useCallback(() => {
    if (stepsGoalDraftParsed == null || !stepsGoalInValidRange) {
      Alert.alert('Meta inválida', 'Los pasos diarios deben estar entre 1.000 y 50.000.');
      return;
    }
    onSave(stepsGoalDraftParsed);
  }, [stepsGoalDraftParsed, stepsGoalInValidRange, onSave]);

  return (
    <ScrollView
      style={styles.stepsGoalScroll}
      contentContainerStyle={styles.stepsGoalScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.stepsGoalSheet}>
        <StepsGoalFields
          value={stepsGoalInput}
          onChangeText={setStepsGoalInput}
          subtitleHint="Elige tu meta diaria. También la podrás editar en Mis objetivos."
        />
        <View style={[actionIntentStyles.row, styles.stepsGoalSheetActions]}>
          <Button variant="actionCancel" title="Cancelar" onPress={onCancel} />
          <Button
            variant="actionConfirm"
            title={isPending ? 'Guardando...' : 'Guardar'}
            onPress={handleSave}
            loading={isPending}
            disabled={isPending || !stepsGoalInValidRange}
          />
        </View>
      </View>
    </ScrollView>
  );
});

/**
 * Modal "Analiza tu entrenamiento" con estado local.
 * Mismo patrón que `WeightLogModalContent`: el `TextInput` multilínea no debe vivir
 * en `HomeScreen` o cada tecla re-renderiza toda la pantalla y el IME parpadea
 * (Android + Modal + adjustResize).
 */
const TrainingAnalysisModalContent = React.memo(function TrainingAnalysisModalContent({
  windowHeight,
  dateStr,
  onClose,
  isFreeUser,
}: {
  windowHeight: number;
  dateStr: string;
  onClose: () => void;
  isFreeUser: boolean;
}) {
  const queryClient = useQueryClient();
  const [workoutText, setWorkoutText] = React.useState('');
  const [workoutEstimate, setWorkoutEstimate] = React.useState<EstimateTrainingResponse | null>(null);

  const estimateTrainingMutation = useMutation({
    mutationFn: (text: string) =>
      api.post<EstimateTrainingResponse>('/api/v1/progress/estimate-training', { text }),
    onSuccess: (data) => {
      setWorkoutEstimate(data);
    },
    onError: (e: unknown) => {
      Alert.alert('No se pudo analizar', toUserFacingErrorMessage(e, 'No se pudo analizar el entreno'));
    },
  });

  const logWorkoutMutation = useMutation({
    mutationFn: (payload: { duration_min?: number | null; estimated_kcal: number; notes: string }) =>
      api.post('/api/v1/progress/activity', {
        date: dateStr,
        training_duration_min: payload.duration_min ?? undefined,
        estimated_burn_kcal: payload.estimated_kcal,
        notes: payload.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-day', dateStr] });
      onClose();
    },
    onError: (e: unknown) => {
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'No se pudo guardar el entreno'));
    },
  });

  const dismiss = React.useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const busy = estimateTrainingMutation.isPending || logWorkoutMutation.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.wsOverlay, { pointerEvents: 'box-none' }]}
    >
      <Pressable style={styles.wsBackdrop} onPress={dismiss} />
      <View
        style={[
          styles.wsCard,
          { maxWidth: 380, maxHeight: windowHeight * 0.9 },
        ]}
      >
        <View style={styles.trainingModalTopRow}>
          <Text style={[styles.wsTitle, styles.trainingModalTitleFlex]}>Analiza tu entrenamiento</Text>
          <Pressable
            onPress={dismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          >
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={styles.trainingModalDescription}>
          Describe duración, ejercicios e intensidad. La IA estima kcal (orientativo).
        </Text>
        <ScrollView
          style={{ maxHeight: Math.min(windowHeight * 0.52, 400) }}
          contentContainerStyle={styles.trainingModalScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <TextInput
            style={styles.textFreeInput}
            value={workoutText}
            onChangeText={setWorkoutText}
            placeholder="Ej.: 50 min pierna, sentadillas y prensa, intensidad media…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
            editable={!busy}
            textAlignVertical="top"
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            autoCorrect={true}
            spellCheck={true}
          />
          {!workoutEstimate ? (
            <Button
              title={estimateTrainingMutation.isPending ? 'Analizando...' : 'Analizar con IA'}
              onPress={() => {
                const t = workoutText.trim();
                if (t.length < 3) {
                  Alert.alert('Analiza tu entrenamiento', 'Escribe al menos 3 caracteres.');
                  return;
                }
                if (isFreeUser) {
                  showTrainingBurnPremiumLock();
                  onClose();
                  return;
                }
                estimateTrainingMutation.mutate(t);
              }}
              loading={estimateTrainingMutation.isPending}
              disabled={workoutText.trim().length < 3}
              style={{ marginTop: spacing.sm }}
            />
          ) : (
            <>
              <View style={styles.workoutEstimateBox}>
                <Text style={styles.workoutEstimateKcal}>
                  ~{Math.round(workoutEstimate.estimated_kcal)} kcal
                </Text>
                {workoutEstimate.duration_min != null ? (
                  <Text style={styles.workoutEstimateMeta}>~{workoutEstimate.duration_min} min</Text>
                ) : null}
                <Text style={styles.workoutEstimateSummary}>{workoutEstimate.summary_es}</Text>
              </View>
              <Button
                title={logWorkoutMutation.isPending ? 'Guardando...' : 'Guardar en el diario'}
                onPress={() => {
                  if (!workoutEstimate) return;
                  const notes = `IA: ${workoutEstimate.summary_es}\nUsuario: ${workoutText.trim()}`;
                  logWorkoutMutation.mutate({
                    estimated_kcal: workoutEstimate.estimated_kcal,
                    duration_min: workoutEstimate.duration_min,
                    notes,
                  });
                }}
                loading={logWorkoutMutation.isPending}
                style={{ marginTop: spacing.sm }}
              />
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
});

/** Notas guardadas como `IA: …\\nUsuario: …` al registrar el entreno desde la estimación. */
function splitSavedWorkoutNotes(notes: string | null | undefined): { iaSummary: string; userText: string } {
  if (!notes?.trim()) return { iaSummary: '', userText: '' };
  const marker = '\nUsuario:';
  const idx = notes.indexOf(marker);
  if (idx >= 0) {
    const iaSummary = notes.slice(0, idx).replace(/^IA:\s*/i, '').trim();
    return { iaSummary, userText: notes.slice(idx + marker.length).trim() };
  }
  return { iaSummary: '', userText: notes.trim() };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [selectedDate, setSelectedDate] = React.useState(() => new Date());
  const [monthSheetOpen, setMonthSheetOpen] = React.useState(false);
  const [fabMenuOpen, setFabMenuOpen] = React.useState(false);
  const fabRotate = React.useRef(new Animated.Value(0)).current;
  const fabSpin = fabRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });
  const [visibleMonth, setVisibleMonth] = React.useState(() => new Date());

  React.useEffect(() => {
    Animated.timing(fabRotate, {
      toValue: fabMenuOpen ? 1 : 0,
      duration: 260,
      easing: fabMenuOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fabMenuOpen, fabRotate]);
  const dateStr = React.useMemo(() => toLocalYmd(selectedDate), [selectedDate]);
  const minSelectable = minDiarySelectableDate();
  const isToday = isSameLocalDay(selectedDate, new Date());

  const {
    data: diary,
    isPending: diaryPending,
    isError: diaryError,
    error: diaryErr,
    refetch: refetchDiary,
  } = useQuery({
    queryKey: ['diary', dateStr],
    queryFn: () => api.get<DayDiary>(`/api/v1/diary/day?date=${dateStr}`),
    retry: 1,
  });

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/api/v1/me/profile'),
    retry: 1,
  });
  const isFreeUser = isNonPremiumTier(profile?.subscription_tier);

  const { data: progress, refetch: refetchProgress } = useQuery({
    queryKey: ['progress'],
    queryFn: () => api.get<ProgressSummary>('/api/v1/progress/summary'),
    retry: 1,
    enabled: !diaryError,
  });

  const monthSummaryYear = visibleMonth.getFullYear();
  const monthSummaryMonth = visibleMonth.getMonth() + 1;
  const monthSummaryQuery = useQuery<{
    year: number;
    month: number;
    target_kcal: number | null;
    days: { date: string; kcal: number; status: 'done' | 'partial' | 'missed' }[];
  }>({
    queryKey: ['diary-month-summary', monthSummaryYear, monthSummaryMonth],
    queryFn: () =>
      api.get(`/api/v1/diary/month-summary?year=${monthSummaryYear}&month=${monthSummaryMonth}`),
    enabled: monthSheetOpen,
    staleTime: 30_000,
  });

  const dayStatusesMap = React.useMemo<Record<string, 'done' | 'partial' | 'missed'>>(() => {
    const map: Record<string, 'done' | 'partial' | 'missed'> = {};
    for (const d of monthSummaryQuery.data?.days ?? []) {
      map[d.date] = d.status;
    }
    return map;
  }, [monthSummaryQuery.data]);

  const savedMealsQuery = useQuery<SavedMeal[]>({
    queryKey: ['savedMeals'],
    queryFn: () => api.get<SavedMeal[]>('/api/v1/meals/saved'),
    staleTime: 30_000,
  });

  const [refreshing, setRefreshing] = React.useState(false);
  const [previewMeal, setPreviewMeal] = React.useState<MealEntry | null>(null);
  const [groupEdit, setGroupEdit] = React.useState<GroupEditState | null>(null);
  const [foodInfo, setFoodInfo] = React.useState<{ mealId: string; item: MealItem } | null>(null);
  const [mealPreviewFoodOpen, setMealPreviewFoodOpen] = React.useState(true);
  const [mealSlotExpanded, setMealSlotExpanded] = React.useState<Record<MealTypeOrderKey, boolean>>(() =>
    MEAL_TYPES_ORDER.reduce(
      (acc, k) => {
        acc[k] = false;
        return acc;
      },
      {} as Record<MealTypeOrderKey, boolean>,
    ),
  );

  const [streakModalOpen, setStreakModalOpen] = React.useState(false);
  const [weightSheetOpen, setWeightSheetOpen] = React.useState(false);
  const [stepsGoalSheetOpen, setStepsGoalSheetOpen] = React.useState(false);
  const weightQueryClient = useQueryClient();

  const { data: appSettingsRaw } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => api.get<AppSettings>('/api/v1/me/settings'),
    staleTime: 60_000,
    retry: 1,
  });
  const appSettings = React.useMemo(() => normalizeAppSettings(appSettingsRaw), [appSettingsRaw]);

  const { data: dailyTargets } = useQuery({
    queryKey: ['daily-targets'],
    queryFn: () => api.get<DailyTarget>('/api/v1/me/targets'),
    staleTime: 60_000,
    retry: 1,
  });

  const { data: activityDay } = useQuery<ActivityDayResponse>({
    queryKey: ['activity-day', dateStr],
    queryFn: () => api.get<ActivityDayResponse>(`/api/v1/progress/activity?date=${dateStr}`),
    retry: 1,
  });

  const { data: wearableSnapshot } = useQuery({
    queryKey: ['wearable-activity-snapshot'],
    queryFn: () => getActivityData(),
    staleTime: 45_000,
    retry: 0,
    enabled: Platform.OS !== 'web',
  });

  const [carouselTrackWidth, setCarouselTrackWidth] = React.useState(0);
  const [carouselIndex, setCarouselIndex] = React.useState(0);
  const [summaryViewMode, setSummaryViewMode] = React.useState<'consumed' | 'remaining'>('consumed');
  const toggleSummaryViewMode = React.useCallback(() => {
    setSummaryViewMode((m) => (m === 'remaining' ? 'consumed' : 'remaining'));
  }, []);
  const [carouselSummaryHeights, setCarouselSummaryHeights] = React.useState<Record<number, number>>({});
  const carouselPageWidth = React.useMemo(() => {
    const raw =
      carouselTrackWidth > 0 ? carouselTrackWidth : Math.max(1, windowWidth - screenPaddingX * 2);
    return Math.max(280, raw);
  }, [carouselTrackWidth, windowWidth]);
  const sharedCarouselSummaryHeight = React.useMemo(() => {
    const heights = Object.values(carouselSummaryHeights).filter((n) => n > 0);
    return heights.length ? Math.max(...heights) : 0;
  }, [carouselSummaryHeights]);
  const updateCarouselSummaryHeight = React.useCallback((idx: number, nextHeight: number) => {
    const rounded = Math.ceil(nextHeight);
    setCarouselSummaryHeights((prev) => (prev[idx] === rounded ? prev : { ...prev, [idx]: rounded }));
  }, []);

  const [quickActionsTrackWidth, setQuickActionsTrackWidth] = React.useState(0);
  const [quickActionsIndex, setQuickActionsIndex] = React.useState(0);
  const quickActionsPageWidth = React.useMemo(() => {
    const raw =
      quickActionsTrackWidth > 0 ? quickActionsTrackWidth : Math.max(1, windowWidth - screenPaddingX * 2);
    return Math.max(280, raw);
  }, [quickActionsTrackWidth, windowWidth]);

  const [trainingAnalysisModalOpen, setTrainingAnalysisModalOpen] = React.useState(false);
  const [trainingLoggedModalOpen, setTrainingLoggedModalOpen] = React.useState(false);
  const [trainingEditNotes, setTrainingEditNotes] = React.useState('');
  const [loggedIaPreview, setLoggedIaPreview] = React.useState('');

  const syncStepsMutation = useMutation({
    mutationFn: (args: { steps: number; activeEnergyKcal: number | null }) => {
      const payload: {
        date: string;
        steps: number;
        training_type: string;
        estimated_burn_kcal?: number;
      } = {
        date: dateStr,
        steps: Math.max(0, Math.min(100_000, Math.round(args.steps))),
        training_type: WEARABLE_SYNC_ACTIVITY_TRAINING_TYPE,
      };
      if (args.activeEnergyKcal != null) {
        payload.estimated_burn_kcal = Math.max(0, Math.min(20_000, Math.round(args.activeEnergyKcal)));
      }
      return api.post('/api/v1/progress/activity', payload);
    },
    onSuccess: () => {
      weightQueryClient.invalidateQueries({ queryKey: ['activity-day', dateStr] });
      weightQueryClient.invalidateQueries({ queryKey: ['wearable-activity-snapshot'] });
    },
  });

  const logWeightMutation = useMutation({
    mutationFn: async (raw: string) => {
      const kg = parseFloat(raw.replace(',', '.'));
      if (!Number.isFinite(kg) || kg < 30 || kg > 300) throw new Error('Peso inválido (30-300 kg)');
      await api.post('/api/v1/progress/weight', {
        weight_kg: kg,
        date: new Date().toISOString().split('T')[0],
      });
      await api.put('/api/v1/me/profile', { current_weight_kg: kg });
    },
    onSuccess: () => {
      weightQueryClient.invalidateQueries({ queryKey: ['weight-history'] });
      weightQueryClient.invalidateQueries({ queryKey: ['profile'] });
      weightQueryClient.invalidateQueries({ queryKey: ['progress'] });
      setWeightSheetOpen(false);
    },
    onError: (e: unknown) => {
      const msg = toUserFacingErrorMessage(e, 'No se pudo registrar el peso');
      Alert.alert('No se pudo registrar', msg);
    },
  });

  type WaterPending = {
    timer: ReturnType<typeof setTimeout> | null;
    sending: boolean;
    lastSent: number | null;
  };
  const waterPendingRef = React.useRef<Map<string, WaterPending>>(new Map());
  const waterPrevDateStrRef = React.useRef(dateStr);

  const getWaterPending = React.useCallback((logDate: string): WaterPending => {
    const map = waterPendingRef.current;
    let p = map.get(logDate);
    if (!p) {
      p = { timer: null, sending: false, lastSent: null };
      map.set(logDate, p);
    }
    return p;
  }, []);

  const hasPendingWaterWrites = React.useCallback(() => {
    for (const p of waterPendingRef.current.values()) {
      if (p.timer || p.sending) return true;
    }
    return false;
  }, []);

  const waterQuery = useQuery<{ date: string; glasses: number }>({
    queryKey: ['water', dateStr],
    queryFn: () => api.get(`/api/v1/progress/water?date=${dateStr}`),
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const waterGlasses = waterQuery.data?.glasses ?? 0;

  const sendWaterLoop = React.useCallback(
    async (logDate: string) => {
      const pending = getWaterPending(logDate);
      if (pending.sending) return;
      pending.sending = true;
      try {
        for (;;) {
          const data = weightQueryClient.getQueryData(['water', logDate]) as
            | { date?: string; glasses?: number }
            | undefined;
          const desired = Math.max(0, Math.min(30, data?.glasses ?? 0));
          if (pending.lastSent === desired) return;
          try {
            await api.put('/api/v1/progress/water', { date: logDate, glasses: desired });
            pending.lastSent = desired;
          } catch (e: unknown) {
            try {
              await weightQueryClient.invalidateQueries({ queryKey: ['water', logDate] });
            } catch {}
            Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'No se pudo guardar el agua'));
            return;
          }
        }
      } finally {
        pending.sending = false;
      }
    },
    [getWaterPending, weightQueryClient],
  );

  const scheduleWaterSync = React.useCallback(
    (logDate: string, immediate: boolean) => {
      const pending = getWaterPending(logDate);
      if (pending.timer) {
        clearTimeout(pending.timer);
        pending.timer = null;
      }
      if (immediate) {
        void sendWaterLoop(logDate);
        return;
      }
      pending.timer = setTimeout(() => {
        pending.timer = null;
        void sendWaterLoop(logDate);
      }, 350);
    },
    [getWaterPending, sendWaterLoop],
  );

  const adjustWaterGlasses = React.useCallback(
    (delta: number) => {
      const logDate = dateStr;
      const cur =
        (weightQueryClient.getQueryData(['water', logDate]) as { glasses?: number } | undefined)
          ?.glasses ?? 0;
      const next = Math.max(0, Math.min(30, cur + delta));
      if (next === cur) return;
      weightQueryClient.setQueryData(
        ['water', logDate],
        (old: { date?: string; glasses?: number } | undefined) => ({
          ...old,
          date: logDate,
          glasses: next,
        }),
      );
      scheduleWaterSync(logDate, false);
    },
    [dateStr, weightQueryClient, scheduleWaterSync],
  );

  React.useEffect(() => {
    const prev = waterPrevDateStrRef.current;
    if (prev === dateStr) return;
    scheduleWaterSync(prev, true);
    waterPrevDateStrRef.current = dateStr;
  }, [dateStr, scheduleWaterSync]);

  React.useEffect(() => {
    return () => {
      const map = waterPendingRef.current;
      for (const [logDate, pending] of map.entries()) {
        if (pending.timer) {
          clearTimeout(pending.timer);
          pending.timer = null;
          void sendWaterLoop(logDate);
        }
      }
    };
  }, [sendWaterLoop]);

  const updateStepsGoalMutation = useMutation({
    mutationFn: async (stepsTarget: number) => {
      if (!dailyTargets) throw new Error('No hay objetivos configurados');
      return api.put<DailyTarget>('/api/v1/me/targets', {
        calories_kcal: dailyTargets.calories_kcal,
        protein_g: dailyTargets.protein_g,
        carbs_g: dailyTargets.carbs_g,
        fat_g: dailyTargets.fat_g,
        steps_target: stepsTarget,
      });
    },
    onSuccess: (next) => {
      weightQueryClient.setQueryData(['daily-targets'], next);
      weightQueryClient.invalidateQueries({ queryKey: ['daily-targets'] });
      setStepsGoalSheetOpen(false);
    },
    onError: (e: unknown) => {
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.'));
    },
  });

  const stepsGoalInitialValue = React.useMemo(
    () =>
      dailyTargets?.steps_target != null && dailyTargets.steps_target > 0
        ? String(Math.round(dailyTargets.steps_target))
        : '10000',
    [dailyTargets?.steps_target],
  );

  const clearTrainingMutation = useMutation({
    mutationFn: () =>
      api.post('/api/v1/progress/activity', {
        date: dateStr,
        ...(activityDay?.steps != null ? { steps: Math.round(activityDay.steps) } : {}),
        training_duration_min: null,
        estimated_burn_kcal: 0,
        notes: null,
      }),
    onSuccess: () => {
      weightQueryClient.invalidateQueries({ queryKey: ['activity-day', dateStr] });
      setTrainingLoggedModalOpen(false);
    },
    onError: (e: unknown) => {
      Alert.alert('No se pudo quitar', toUserFacingErrorMessage(e, 'No se pudo quitar el entreno'));
    },
  });

  const saveEditedTrainingMutation = useMutation({
    mutationFn: async (text: string) => {
      const est = await api.post<EstimateTrainingResponse>('/api/v1/progress/estimate-training', { text });
      await api.post('/api/v1/progress/activity', {
        date: dateStr,
        training_duration_min: est.duration_min ?? undefined,
        estimated_burn_kcal: est.estimated_kcal,
        notes: `IA: ${est.summary_es}\nUsuario: ${text.trim()}`,
        ...(activityDay?.steps != null ? { steps: Math.round(activityDay.steps) } : {}),
      });
    },
    onSuccess: () => {
      weightQueryClient.invalidateQueries({ queryKey: ['activity-day', dateStr] });
      setTrainingLoggedModalOpen(false);
    },
    onError: (e: unknown) => {
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'No se pudo guardar los cambios'));
    },
  });

  // Sesión: solo pedimos permisos del sistema una vez por arranque de app.
  // Esto cubre el caso "reinstalo la app, el toggle viene en ON pero los permisos del
  // sistema se han borrado": la primera vez que entras a Inicio, lanzamos el cuadro
  // nativo. Si el usuario lo rechaza, no insistimos hasta que reabra la app.
  const wearablePermsAttemptedRef = React.useRef(false);

  useFocusEffect(
    React.useCallback(() => {
      if (!isToday || diaryError || !appSettings) return;
      const ints = appSettings.integration_preferences;
      const provider: 'apple_health' | 'android_health_connect' | null =
        Platform.OS === 'ios' && ints?.apple_health_enabled
          ? 'apple_health'
          : Platform.OS === 'android' && ints?.google_fit_enabled
            ? 'android_health_connect'
            : null;
      if (!provider) return;
      const shouldRequestPerms = !wearablePermsAttemptedRef.current;
      let cancelled = false;
      (async () => {
        if (shouldRequestPerms) wearablePermsAttemptedRef.current = true;
        const probe = await probeAndRepairWearableConnection(provider, appSettings, {
          requestPermissionsIfMissing: shouldRequestPerms,
        });
        if (cancelled) return;
        if (probe.settings) {
          weightQueryClient.setQueryData(['app-settings'], probe.settings);
        }
        if (!probe.data || probe.data.steps == null) return;
        const n = probe.data.steps;
        const nativeBurn = probe.rawActiveEnergyKcal;
        const cached = weightQueryClient.getQueryData(['activity-day', dateStr]) as ActivityDayResponse | undefined;
        const server = cached?.steps ?? 0;
        const serverBurn = cached?.estimated_burn_kcal;
        const burnMismatch =
          nativeBurn != null &&
          (serverBurn == null || Math.round(Number(serverBurn)) !== Math.round(nativeBurn));
        if (n !== server || burnMismatch) {
          syncStepsMutation.mutate({ steps: n, activeEnergyKcal: nativeBurn });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [isToday, diaryError, appSettings, dateStr, weightQueryClient, syncStepsMutation]),
  );

  React.useEffect(() => {
    if (previewMeal) setMealPreviewFoodOpen(true);
  }, [previewMeal?.id]);

  React.useEffect(() => {
    if (!isToday || !diary) return;
    const left = Math.max(0, (diary.target_kcal ?? 2200) - (diary.total_kcal ?? 0));
    updateWidget(left);
  }, [diary?.target_kcal, diary?.total_kcal, isToday]);
  const openMonthSheet = () => {
    setVisibleMonth(selectedDate);
    setMonthSheetOpen(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchDiary(),
      refetchProgress(),
      waterQuery.refetch(),
      weightQueryClient.invalidateQueries({ queryKey: ['wearable-activity-snapshot'] }),
    ]);
    setRefreshing(false);
  };

  const mealsByType = React.useMemo(() => {
    const map: Record<(typeof MEAL_TYPES_ORDER)[number], MealEntry[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    for (const m of diary?.meals ?? []) {
      map[m.meal_type].push(m);
    }
    MEAL_TYPES_ORDER.forEach((k) => {
      map[k].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
    return map;
  }, [diary?.meals]);

  /** Día y mes abreviados (p. ej. "13 abr") según la fecha seleccionada; declarado antes de returns por reglas de hooks. */
  const calendarMonthAnchorLabel = React.useMemo(() => {
    const raw = format(selectedDate, 'd MMM', { locale: esLocale });
    return raw.replace(/\./g, '').trim();
  }, [selectedDate]);

  const openStepsGoalSheet = React.useCallback(() => {
    if (!dailyTargets) {
      Alert.alert('Sin objetivos', 'Completa primero tus objetivos para ajustar los pasos diarios.');
      return;
    }
    setStepsGoalSheetOpen(true);
  }, [dailyTargets]);

  const handleSaveStepsGoal = React.useCallback(
    (parsed: number) => {
      updateStepsGoalMutation.mutate(parsed);
    },
    [updateStepsGoalMutation],
  );

  const handleCloseStepsGoal = React.useCallback(() => {
    setStepsGoalSheetOpen(false);
  }, []);

  const handleSaveWeight = React.useCallback(
    (raw: string) => {
      logWeightMutation.mutate(raw);
    },
    [logWeightMutation],
  );

  const handleCloseWeight = React.useCallback(() => {
    setWeightSheetOpen(false);
  }, []);

  const handleOpenWeightHistory = React.useCallback(() => {
    setWeightSheetOpen(false);
    router.push('/profile/weight-history');
  }, []);

  const stepsGoal = dailyTargets?.steps_target ?? 10000;
  const stepsCurrent = Math.max(0, activityDay?.steps ?? 0);
  const stepsKcalApprox = estimateStepsKcal(stepsCurrent);
  const trainingBurnKcal = activityDay?.estimated_burn_kcal != null ? activityDay.estimated_burn_kcal : 0;
  const isWearableActivityRow = activityDay?.training_type === WEARABLE_SYNC_ACTIVITY_TRAINING_TYPE;
  const totalMoveKcalApprox = Math.round(
    isWearableActivityRow
      ? trainingBurnKcal > 0
        ? trainingBurnKcal
        : stepsKcalApprox
      : stepsKcalApprox + trainingBurnKcal,
  );

  if (diaryPending) return <LoadingScreen />;

  if (diaryError) {
    const msg = diaryErr instanceof Error ? diaryErr.message : 'No se pudo cargar el inicio';
    return (
      <View style={[styles.container, styles.errorWrap]}>
        <Text style={styles.errorTitle}>Sin conexión al servidor</Text>
        <Text style={styles.errorBody}>{msg}</Text>
        {__DEV__ ? (
          <Text style={styles.errorDevHint} selectable>
            {`API: ${getApiBaseUrl()}`}
            {
              '\n\nPrueba en el navegador: http://localhost:8000/health (debe verse {"status":"ok",...}).\nSi falla, arranca el backend en /backend:\npython -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000'
            }
          </Text>
        ) : null}
        <Button title="Reintentar" onPress={() => refetchDiary()} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  const targetKcal = diary?.target_kcal || 2200;
  const currentKcal = diary?.total_kcal || 0;
  const consumedLabel = `${Math.round(currentKcal).toLocaleString('es-ES')} / ${Math.round(targetKcal).toLocaleString('es-ES')} kcal`;
  const inRange = targetKcal > 0 && currentKcal <= targetKcal * 1.08;

  const summaryDayLabel = isToday ? 'Hoy' : 'Este día';
  const mealsSectionTitle = isToday ? 'Comidas de hoy' : 'Comidas del día';

  const streakDays = Math.min(Math.max(0, progress?.nutrition_streak_days ?? 0), 30);

  const streakTier =
    streakDays >= 21 ? 'legendary' : streakDays >= 14 ? 'fire' : streakDays >= 7 ? 'hot' : streakDays >= 3 ? 'warm' : 'cold';

  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16;

  const appleHealthOn = !!appSettings?.integration_preferences?.apple_health_enabled;
  const googleHealthOn = !!appSettings?.integration_preferences?.google_fit_enabled;
  /** En móvil, la tarjeta de pasos no es fiable sin la integración nativa (Health Connect / Apple Salud). */
  const showActivityHealthOverlay =
    Platform.OS === 'ios' ? !appleHealthOn : Platform.OS === 'android' ? !googleHealthOn : false;
  const activityHealthOverlayTitle =
    Platform.OS === 'ios' ? 'Apple Salud desactivado' : 'Health Connect desactivado';
  const activityHealthOverlayBody =
    Platform.OS === 'ios'
      ? 'Actívalo en Ajustes para leer los pasos del día y estimar calorías de movimiento con precisión.'
      : 'Actívalo en Ajustes para sincronizar pasos y calorías. Sin Health Connect, los datos de actividad no serán fiables.';

  return (
    <ScreenFocusProvider>
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, spacing.md) + spacing.sm, paddingBottom: bottomPad },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <SlideUpView delay={0} duration={500} distance={20}>
          <View style={styles.brandHeader}>
            <View style={styles.brandLeft}>
              <Image
                source={require('../../assets/images/logo-nutria-header.png')}
                style={styles.brandLogo}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              <Text style={styles.brandName}>
                <Text style={styles.brandNameWhite}>Nutr</Text>
                <Text style={styles.brandNameGreen}>IA</Text>
              </Text>
            </View>
            <View style={styles.brandRight}>
              <Pressable
                onPress={() => setStreakModalOpen(true)}
                style={({ pressed }) => [styles.brandStreak, streakTierStyles[streakTier].chip, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                accessibilityLabel={`Racha de días completados: ${streakDays}. Pulsa para ver detalles.`}
              >
                {streakTier === 'legendary' ? (
                  <Text style={[styles.brandStreakEmoji, streakTierStyles[streakTier].emoji]}>
                    {streakTierStyles[streakTier].icon}
                  </Text>
                ) : (
                  <Image
                    source={require('../../assets/images/streak/racha-chip-flame.png')}
                    style={styles.brandStreakFlameImg}
                    resizeMode="contain"
                    accessibilityIgnoresInvertColors
                  />
                )}
                <Text style={[styles.brandStreakText, streakTierStyles[streakTier].text]}>
                  {streakDays}
                </Text>
              </Pressable>
              <Pressable
                onPress={openMonthSheet}
                style={({ pressed }) => [styles.brandCalendarBtn, pressed && styles.brandCalendarBtnPressed]}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Abrir calendario"
              >
                <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.brandCalendarText} numberOfLines={1} ellipsizeMode="tail">
                  {calendarMonthAnchorLabel}
                </Text>
              </Pressable>
            </View>
          </View>
          <Surface variant="subtle" padding="sm" style={styles.weekStripSurface}>
            <DiaryWeekStrip
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              minDate={minSelectable}
            />
          </Surface>
        </SlideUpView>

        <SlideUpView delay={120} duration={550} distance={30}>
          <View
            style={styles.carouselTrack}
            onLayout={(e) => setCarouselTrackWidth(e.nativeEvent.layout.width)}
          >
          <ScrollView
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            style={styles.carouselScroll}
            contentContainerStyle={{ width: carouselPageWidth * 2 }}
            onMomentumScrollEnd={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const idx = Math.round(x / Math.max(1, carouselPageWidth));
              setCarouselIndex(Math.max(0, Math.min(1, idx)));
            }}
          >
            <View style={[styles.carouselPage, { width: carouselPageWidth }]}>
              <View
                style={[styles.summaryBlock, sharedCarouselSummaryHeight > 0 && { height: sharedCarouselSummaryHeight }]}
                onLayout={(e) => updateCarouselSummaryHeight(0, e.nativeEvent.layout.height)}
              >
                <Surface variant="subtle" padding="md" style={[styles.summaryBlockSurface, { justifyContent: 'flex-start', paddingTop: 14 }]}>
                  <Pressable
                    onPress={toggleSummaryViewMode}
                    accessibilityRole="button"
                    accessibilityLabel={`Cambiar a vista de calorías ${summaryViewMode === 'remaining' ? 'consumidas' : 'restantes'}`}
                    style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
                  >
                    <View style={styles.ringWrap}>
                      <CalorieRing current={currentKcal} target={targetKcal} size={162} mode={summaryViewMode} />
                    </View>
                    <View style={styles.macroRow}>
                      <CompactMacroColumn
                        label={summaryViewMode === 'remaining' ? 'Proteína restante' : 'Proteínas'}
                        current={diary?.total_protein_g || 0}
                        target={diary?.target_protein_g || 150}
                        color={colors.protein}
                        icon={require('../../assets/images/macros/ring-protein.png')}
                        mode={summaryViewMode}
                        iconScale={1.28}
                      />
                      <CompactMacroColumn
                        label={summaryViewMode === 'remaining' ? 'Carbos restantes' : 'Carbos'}
                        current={diary?.total_carbs_g || 0}
                        target={diary?.target_carbs_g || 230}
                        color={colors.carbs}
                        icon={require('../../assets/images/macros/ring-carbs.png')}
                        mode={summaryViewMode}
                      />
                      <CompactMacroColumn
                        label={summaryViewMode === 'remaining' ? 'Grasa restante' : 'Grasas'}
                        current={diary?.total_fat_g || 0}
                        target={diary?.target_fat_g || 65}
                        color={colors.fat}
                        icon={require('../../assets/images/macros/ring-fat.png')}
                        mode={summaryViewMode}
                        iconScale={1.07}
                      />
                    </View>
                  </Pressable>
                </Surface>
              </View>
            </View>

            <View style={[styles.carouselPage, { width: carouselPageWidth }]}>
              <View
                style={[styles.summaryBlock, sharedCarouselSummaryHeight > 0 && { height: sharedCarouselSummaryHeight }]}
                onLayout={(e) => updateCarouselSummaryHeight(1, e.nativeEvent.layout.height)}
              >
                <Surface
                  variant="subtle"
                  padding="md"
                  style={[styles.summaryBlockSurface, styles.summaryBlockSurfaceActivity]}
                >
                <View style={styles.activityCardShell}>
                  <View style={{ pointerEvents: showActivityHealthOverlay ? 'none' : 'auto' }}>
                    <View style={styles.activityTopRow}>
                      <Pressable
                        onPress={openStepsGoalSheet}
                        style={({ pressed }) => [styles.activityStepsButton, pressed && styles.activityStepsButtonPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={`Editar objetivo de pasos. Meta actual ${Math.round(stepsGoal).toLocaleString('es-ES')} pasos`}
                        hitSlop={6}
                        disabled={showActivityHealthOverlay}
                      >
                        <StepsRing current={stepsCurrent} goal={stepsGoal} size={160} />
                      </Pressable>
                      <View style={styles.activityTopSeparator} importantForAccessibility="no" />
                      <View style={styles.activityBurnColumn}>
                        <Text style={styles.activityBurnLabel}>Calorías quemadas</Text>
                        <View style={styles.activityBurnValueRow}>
                          <Text style={styles.activityBurnValue}>{totalMoveKcalApprox}</Text>
                          <Text style={styles.activityBurnUnit}>kcal</Text>
                        </View>
                        {trainingBurnKcal > 0 ? (
                          <View style={styles.activityBurnChipsRow}>
                            <Pressable
                              onPress={() => {
                                const { iaSummary, userText } = splitSavedWorkoutNotes(activityDay?.notes);
                                setLoggedIaPreview(iaSummary);
                                setTrainingEditNotes(userText);
                                setTrainingLoggedModalOpen(true);
                              }}
                              disabled={showActivityHealthOverlay}
                              style={({ pressed }) => [
                                styles.activityBurnChip,
                                pressed && !showActivityHealthOverlay && { opacity: 0.88 },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel="Ver o editar descripción del entreno registrado"
                            >
                              <Ionicons name="barbell-outline" size={11} color={colors.primaryLight} />
                              <Text style={styles.activityBurnChipText}>
                                ~{Math.round(trainingBurnKcal)} entreno
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}
                        <View style={styles.activityBurnHintRow}>
                          <Ionicons name="information-circle-outline" size={11} color={colors.textMuted} />
                          <Text style={styles.activityBurnHint}>Estimación orientativa</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  {showActivityHealthOverlay ? (
                    <Pressable
                      onPress={() => router.push('/profile/settings')}
                      style={({ pressed }) => [styles.activityHealthOverlay, pressed && styles.activityHealthOverlayPressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`${activityHealthOverlayTitle}. ${activityHealthOverlayBody} Abrir ajustes.`}
                    >
                      <View style={styles.activityHealthOverlayIconWrap}>
                        <Ionicons
                          name={Platform.OS === 'ios' ? 'heart-outline' : 'fitness-outline'}
                          size={28}
                          color={colors.warning}
                        />
                      </View>
                      <Text style={styles.activityHealthOverlayTitle}>{activityHealthOverlayTitle}</Text>
                      <Text style={styles.activityHealthOverlayBody}>{activityHealthOverlayBody}</Text>
                      <View style={styles.activityHealthOverlayCta}>
                        <Text style={styles.activityHealthOverlayCtaText}>Abrir Ajustes</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.primaryLight} />
                      </View>
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.trainingTextFreeSection}>
                  <PressableScale
                    style={styles.trainingCtaRow}
                    scaleTo={0.985}
                    onPress={() => setTrainingAnalysisModalOpen(true)}
                  >
                    <View style={styles.trainingCtaIcon}>
                      <Ionicons name="barbell-outline" size={16} color={colors.primary} />
                    </View>
                    <View style={styles.trainingCtaCopy}>
                      <View style={styles.trainingCtaTitleRow}>
                        <Text
                          style={styles.trainingCtaTitle}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          Analiza tu entrenamiento
                        </Text>
                        <View style={styles.trainingCtaRoutineChip}>
                          <Text style={styles.trainingCtaRoutineChipText}>+ rutina</Text>
                        </View>
                      </View>
                      <Text
                        style={styles.trainingCtaSubtitle}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                      >
                        Añade tu rutina y calcula calorías
                      </Text>
                    </View>
                    <View style={styles.trainingCtaChevronWrap}>
                      <Ionicons name="chevron-forward" size={16} color={colors.primaryLight} />
                    </View>
                  </PressableScale>
                </View>
                </Surface>
              </View>
            </View>
          </ScrollView>
          </View>
          <View style={styles.carouselDots}>
            {[0, 1].map((i) => (
              <View key={String(i)} style={[styles.carouselDot, carouselIndex === i && styles.carouselDotActive]} />
            ))}
          </View>
        </SlideUpView>

        <SlideUpView delay={250} duration={500} distance={25}>
          <View style={styles.quickActionsSection}>
            <Text style={styles.quickActionsHeading}>Acciones rápidas</Text>

            <View style={styles.quickActionsTrack} onLayout={(e) => setQuickActionsTrackWidth(e.nativeEvent.layout.width)}>
              <ScrollView
                horizontal
                pagingEnabled
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                style={styles.quickActionsScroll}
                contentContainerStyle={{ width: quickActionsPageWidth * 2 }}
                onMomentumScrollEnd={(e) => {
                  const x = e.nativeEvent.contentOffset.x;
                  const idx = Math.round(x / Math.max(1, quickActionsPageWidth));
                  setQuickActionsIndex(Math.max(0, Math.min(1, idx)));
                }}
              >
                <View style={[styles.quickActionsPage, { width: quickActionsPageWidth }]}>
                  <View style={styles.quickActionsRow}>
                    <View style={styles.quickActionSlot}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.quickActionCard,
                          styles.quickActionCardWeight,
                          pressed && styles.quickActionCardPressed,
                        ]}
                        onPress={() => setWeightSheetOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Registrar peso"
                      >
                        <View style={[styles.quickActionIconWrap, styles.quickActionIconWeight]}>
                          <Image source={require('../../assets/images/quick-action-weight-otter.png')} style={{ width: 54, height: 54 }} resizeMode="contain" />
                        </View>
                        <View style={styles.quickActionCopy}>
                          <Text style={styles.quickActionTitle} numberOfLines={2} ellipsizeMode="tail">
                            Registrar peso
                          </Text>
                        </View>
                        <View style={styles.quickActionCtaRow}>
                          <View style={styles.quickActionCtaIconWrap}>
                            <Ionicons name="add-circle-outline" size={20} color={colors.primaryLight} />
                          </View>
                        </View>
                      </Pressable>
                    </View>

                    <View style={styles.quickActionSlot}>
                      <View
                        style={[styles.quickActionCard, styles.quickActionCardWater]}
                        accessible
                        accessibilityLabel="Agua, hidratación del día"
                      >
                        <View style={[styles.waterCornerIcon, { pointerEvents: 'none' }]}>
                          <Ionicons name="water" size={22} color="rgba(56, 189, 248, 0.92)" />
                        </View>
                        <View style={styles.waterRingWrap}>
                          <WaterIntakeRing glasses={waterGlasses} size={82} />
                        </View>
                        <View style={styles.waterCounterRow}>
                          <View style={[styles.waterCounterSide, styles.waterCounterSideLeft]}>
                            <Pressable
                              style={({ pressed }) => [
                                styles.waterBtn,
                                waterGlasses <= 0 && styles.waterBtnDisabled,
                                pressed && waterGlasses > 0 && styles.waterBtnPressed,
                              ]}
                              onPress={() => adjustWaterGlasses(-1)}
                              disabled={waterGlasses <= 0}
                              accessibilityRole="button"
                              accessibilityLabel="Quitar un vaso de agua"
                            >
                              <Ionicons
                                name="remove"
                                size={16}
                                color={waterGlasses > 0 ? colors.text : colors.textMuted}
                              />
                            </Pressable>
                          </View>
                          <View style={styles.waterCounterCenter}>
                            <Text style={styles.waterCount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                              {waterGlasses} {waterGlasses === 1 ? 'vaso' : 'vasos'}
                            </Text>
                          </View>
                          <View style={[styles.waterCounterSide, styles.waterCounterSideRight]}>
                            <Pressable
                              style={({ pressed }) => [
                                styles.waterBtn,
                                styles.waterBtnPlus,
                                pressed && styles.waterBtnPressed,
                              ]}
                              onPress={() => adjustWaterGlasses(1)}
                              disabled={waterGlasses >= 30}
                              accessibilityRole="button"
                              accessibilityLabel="Añadir un vaso de agua"
                            >
                              <Ionicons name="add" size={16} color={colors.white} />
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={[styles.quickActionsPage, { width: quickActionsPageWidth }]}>
                  <View style={styles.quickActionsRow}>
                    <View style={styles.quickActionSlot}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.quickActionCard,
                          styles.quickActionCardInjuries,
                          pressed && styles.quickActionCardPressed,
                        ]}
                        onPress={() => router.push('/profile/injuries')}
                        accessibilityRole="button"
                        accessibilityLabel="Gestionar lesiones"
                      >
                        <View style={[styles.quickActionIconWrap, styles.quickActionIconInjuries]}>
                          <Image source={require('../../assets/images/quick-action-injuries-otter.png')} style={{ width: 54, height: 54 }} resizeMode="contain" />
                        </View>
                        <View style={styles.quickActionCopy}>
                          <Text style={styles.quickActionTitle} numberOfLines={2} ellipsizeMode="tail">
                            Lesiones
                          </Text>
                          <Text style={styles.quickActionHint} numberOfLines={2} ellipsizeMode="tail">
                            Gestiona tus molestias
                          </Text>
                        </View>
                        <View style={styles.quickActionCtaRow}>
                          <View style={styles.quickActionCtaIconWrap}>
                            <Ionicons name="chevron-forward" size={20} color={colors.primaryLight} />
                          </View>
                        </View>
                      </Pressable>
                    </View>

                    <View style={styles.quickActionSlot}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.quickActionCard,
                          styles.quickActionCardBarcode,
                          pressed && styles.quickActionCardPressed,
                        ]}
                        onPress={() => router.push('/profile/edit-goals')}
                        accessibilityRole="button"
                        accessibilityLabel="Ver tu objetivo"
                      >
                        <View style={[styles.quickActionIconWrap, styles.quickActionIconBarcode]}>
                          <Image source={require('../../assets/images/quick-action-goals-otter.png')} style={{ width: 54, height: 54 }} resizeMode="contain" />
                        </View>
                        <View style={styles.quickActionCopy}>
                          <Text style={styles.quickActionTitle} numberOfLines={2} ellipsizeMode="tail">
                            Tu objetivo
                          </Text>
                          <Text style={styles.quickActionHint} numberOfLines={2} ellipsizeMode="tail">
                            Revisa tus metas
                          </Text>
                        </View>
                        <View style={styles.quickActionCtaRow}>
                          <View style={styles.quickActionCtaIconWrap}>
                            <Ionicons name="chevron-forward" size={20} color={colors.primaryLight} />
                          </View>
                        </View>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </ScrollView>
            </View>

            <View style={[styles.carouselDots, styles.quickActionsDots]}>
              {[0, 1].map((i) => (
                <View
                  key={String(i)}
                  style={[styles.carouselDot, quickActionsIndex === i && styles.carouselDotActive]}
                />
              ))}
            </View>
          </View>
        </SlideUpView>

        <SlideUpView delay={420} duration={450} distance={20}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{mealsSectionTitle}</Text>
        </View>
        </SlideUpView>

        {MEAL_TYPES_ORDER.map((mealType, typeIdx) => {
          const meals = mealsByType[mealType];
          const slotKcal = meals.reduce((s, m) => s + m.total_kcal, 0);
          const slotP = meals.reduce((s, m) => s + m.total_protein_g, 0);
          const slotC = meals.reduce((s, m) => s + m.total_carbs_g, 0);
          const slotG = meals.reduce((s, m) => s + m.total_fat_g, 0);

          return (
            <StaggerItem key={mealType} index={typeIdx} baseDelay={500} staggerMs={55}>
              <Surface
                variant="subtle"
                style={[styles.mealSection, typeIdx === MEAL_TYPES_ORDER.length - 1 && styles.mealSectionLast]}
              >
                <Pressable
                  onPress={() =>
                    setMealSlotExpanded((prev) => ({ ...prev, [mealType]: !prev[mealType] }))
                  }
                  style={({ pressed }) => [
                    styles.mealSlotHeaderPressable,
                    pressed && styles.mealSlotHeaderPressablePressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: mealSlotExpanded[mealType] }}
                  accessibilityLabel={
                    meals.length === 0
                      ? `${mealTypeLabel(mealType)}, sin comidas registradas. Añadir comida ahora. ${
                          mealSlotExpanded[mealType] ? 'Contraer lista' : 'Expandir lista'
                        }`
                      : `${mealTypeLabel(mealType)}, ${Math.round(slotKcal)} kilocalorías. ${
                          mealSlotExpanded[mealType] ? 'Contraer lista' : 'Expandir lista'
                        }`
                  }
                >
                  <View style={styles.mealCardHeader}>
                    <View style={styles.mealSlotTypeIconColumn}>
                      <MealTypeIcon mealType={mealType} size={52} />
                      {meals.length > 0 ? (
                        <View style={styles.mealSlotSideKcalBadge}>
                          <Text
                            style={styles.mealSlotSideKcalValue}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.62}
                          >
                            {Math.round(slotKcal).toLocaleString('es-ES')}
                          </Text>
                          <Text style={styles.mealSlotSideKcalUnit}>kcal</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.mealCardHeaderText}>
                      <Text style={styles.mealSlotTitle}>{mealTypeLabel(mealType)}</Text>
                      {meals.length === 0 ? (
                        <View style={styles.mealSlotEmptyRow}>
                          <Text style={styles.mealSlotEmptyLabel}>Sin registros</Text>
                          <View style={styles.mealSlotEmptyDot} />
                          <Text style={styles.mealSlotEmptyAction}>Añadir comida</Text>
                          <Ionicons name="add-circle" size={15} color={colors.primaryLight} style={{ marginBottom: -1 }} />
                        </View>
                      ) : (
                        <View style={styles.mealSlotNutritionCard}>
                          <View style={styles.mealSlotMacroGrid}>
                            <View style={styles.mealSlotMacroMetric}>
                              <Text style={[styles.mealSlotMacroInitial, { color: colors.protein }]}>P</Text>
                              <Text style={styles.mealSlotMacroValue}>{Math.round(slotP)}g</Text>
                            </View>
                            <View style={styles.mealSlotMacroDivider} />
                            <View style={styles.mealSlotMacroMetric}>
                              <Text style={[styles.mealSlotMacroInitial, { color: colors.carbs }]}>C</Text>
                              <Text style={styles.mealSlotMacroValue}>{Math.round(slotC)}g</Text>
                            </View>
                            <View style={styles.mealSlotMacroDivider} />
                            <View style={styles.mealSlotMacroMetric}>
                              <Text style={[styles.mealSlotMacroInitial, { color: colors.fat }]}>G</Text>
                              <Text style={styles.mealSlotMacroValue}>{Math.round(slotG)}g</Text>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                    <View style={styles.mealSlotChevronCorner} pointerEvents="none">
                      <MealSlotChevron expanded={mealSlotExpanded[mealType]} />
                    </View>
                  </View>
                </Pressable>

                <AnimatedCollapsible expanded={mealSlotExpanded[mealType]}>
                  <>
                    {meals.map((meal, idx) => (
                      <ListRow
                        key={meal.id}
                        contentAlign="flex-start"
                        leading={
                          <View style={styles.mealRowLeading} accessibilityElementsHidden>
                            <MealItemIconMedia
                              visual={mealLeadingVisual(meal)}
                              emojiStyle={styles.mealRowLeadingEmoji}
                              imageSize={30}
                              minSlotWidth={40}
                            />
                          </View>
                        }
                        detail={
                          (meal.items?.length ?? 0) > 0 ? (
                            <MealFoodItemRows mealId={meal.id} items={meal.items!} variant="home" dateStr={dateStr} onEditGroup={(mid, its) => setGroupEdit({ mealId: mid, items: its })} onPressFood={(it) => setFoodInfo({ mealId: meal.id, item: it })} />
                          ) : undefined
                        }
                        showSeparator={idx < meals.length - 1}
                        style={styles.listRowPad}
                      />
                    ))}

                    {meals.length === 0 ? (
                      <Text style={styles.mealEmptyHint}>Sin alimentos registrados en este momento.</Text>
                    ) : null}
                  </>
                </AnimatedCollapsible>

                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/search',
                      params: { meal_type: mealType, date: dateStr },
                    } as never)
                  }
                  style={({ pressed }) => [styles.addToMealBtn, pressed && styles.addToMealBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Añadir alimentos a ${mealTypeLabel(mealType)}`}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </Pressable>
              </Surface>
            </StaggerItem>
          );
        })}
      </ScrollView>

      {fabMenuOpen && (
        <Pressable style={styles.fabOverlay} onPress={() => setFabMenuOpen(false)} />
      )}

      {fabMenuOpen && (
        <View style={[styles.fabMenu, { bottom: bottomPad - 12 + 56 + spacing.sm }]}>
          <Pressable
            style={styles.fabMenuItem}
            onPress={() => {
              setFabMenuOpen(false);
              router.push({ pathname: '/(tabs)/search', params: { date: dateStr } } as never);
            }}
          >
            <Ionicons name="search-outline" size={18} color={colors.text} />
            <Text style={styles.fabMenuText}>Buscar</Text>
          </Pressable>
          <View style={styles.fabMenuDivider} />
          <Pressable
            style={styles.fabMenuItem}
            onPress={() => {
              setFabMenuOpen(false);
              router.push(`/scanner?date=${encodeURIComponent(dateStr)}` as never);
            }}
          >
            <Ionicons name="scan-outline" size={18} color={colors.text} />
            <Text style={styles.fabMenuText}>Escáner</Text>
          </Pressable>
          <View style={styles.fabMenuDivider} />
          <Pressable
            style={styles.fabMenuItem}
            onPress={() => {
              setFabMenuOpen(false);
              router.push(`/add-meal/barcode?date=${encodeURIComponent(dateStr)}` as never);
            }}
          >
            <Ionicons name="barcode-outline" size={18} color={colors.text} />
            <Text style={styles.fabMenuText}>Código de barras</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={() => setFabMenuOpen(!fabMenuOpen)}
        style={({ pressed }) => [
          styles.fab,
          { bottom: bottomPad - 12 },
          pressed && primaryCtaPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={fabMenuOpen ? 'Cerrar menú de añadir comida' : 'Añadir comida'}
      >
        <TideGradientFrame
          borderRadius={28}
          style={styles.fabTide}
          contentContainerStyle={styles.fabTideInner}
        >
          <Animated.View style={[styles.fabIconSpin, { transform: [{ rotate: fabSpin }] }]}>
            <Ionicons name="add" size={28} color={colors.white} />
          </Animated.View>
        </TideGradientFrame>
      </Pressable>

      <BottomSheet visible={monthSheetOpen} onDismiss={() => setMonthSheetOpen(false)} maxHeightFraction={0.72}>
        <DiaryMonthGrid
          visibleMonth={visibleMonth}
          selectedDate={selectedDate}
          minDate={minSelectable}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setMonthSheetOpen(false);
          }}
          onChangeVisibleMonth={setVisibleMonth}
          dayStatuses={dayStatusesMap}
        />
      </BottomSheet>

      <BottomSheet
        visible={stepsGoalSheetOpen}
        onDismiss={handleCloseStepsGoal}
        maxHeightFraction={0.62}
        maxHeightCap={600}
        expandToMaxHeight
      >
        {stepsGoalSheetOpen ? (
          <StepsGoalSheetContent
            key={stepsGoalInitialValue}
            initialSteps={stepsGoalInitialValue}
            onSave={handleSaveStepsGoal}
            onCancel={handleCloseStepsGoal}
            isPending={updateStepsGoalMutation.isPending}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={!!previewMeal}
        onDismiss={() => setPreviewMeal(null)}
        maxHeightFraction={PREVIEW_SHEET_FRAC}
        maxHeightCap={PREVIEW_SHEET_CAP}
      >
        {previewMeal ? (
          <MealPreviewSheetBody
            previewMeal={previewMeal}
            dateStr={dateStr}
            bottomInset={Math.max(insets.bottom, spacing.md)}
            foodSectionOpen={mealPreviewFoodOpen}
            onToggleFoodSection={() => setMealPreviewFoodOpen((o) => !o)}
            onMealUpdated={(m) => setPreviewMeal(m)}
            onCloseSheet={() => setPreviewMeal(null)}
            onOpenFullEdit={() => {
              const id = previewMeal.id;
              setPreviewMeal(null);
              router.push(`/meal/${id}`);
            }}
            savedMeals={savedMealsQuery.data ?? []}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={!!groupEdit}
        onDismiss={() => setGroupEdit(null)}
        maxHeightFraction={PREVIEW_SHEET_FRAC}
        maxHeightCap={PREVIEW_SHEET_CAP}
      >
        {groupEdit ? (
          <GroupEditSheetBody
            state={groupEdit}
            dateStr={dateStr}
            bottomInset={Math.max(insets.bottom, spacing.md)}
            onClose={() => setGroupEdit(null)}
            savedMeals={savedMealsQuery.data ?? []}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={!!foodInfo}
        onDismiss={() => setFoodInfo(null)}
        maxHeightFraction={PREVIEW_SHEET_FRAC}
        maxHeightCap={PREVIEW_SHEET_CAP}
      >
        {foodInfo ? (
          <FoodInfoSheetBody
            mealId={foodInfo.mealId}
            item={foodInfo.item}
            dateStr={dateStr}
            bottomInset={Math.max(insets.bottom, spacing.md)}
            onClose={() => setFoodInfo(null)}
          />
        ) : null}
      </BottomSheet>

      <Modal
        visible={weightSheetOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleCloseWeight}
      >
        {weightSheetOpen ? (
          <WeightLogModalContent
            onSave={handleSaveWeight}
            onClose={handleCloseWeight}
            onOpenHistory={handleOpenWeightHistory}
            isPending={logWeightMutation.isPending}
          />
        ) : null}
      </Modal>

      <Modal
        visible={trainingAnalysisModalOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          Keyboard.dismiss();
          setTrainingAnalysisModalOpen(false);
        }}
      >
        {trainingAnalysisModalOpen ? (
          <TrainingAnalysisModalContent
            windowHeight={windowHeight}
            dateStr={dateStr}
            isFreeUser={isFreeUser}
            onClose={() => {
              Keyboard.dismiss();
              setTrainingAnalysisModalOpen(false);
            }}
          />
        ) : null}
      </Modal>

      <Modal
        visible={trainingLoggedModalOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          Keyboard.dismiss();
          setTrainingLoggedModalOpen(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.wsOverlay, { pointerEvents: 'box-none' }]}
        >
          <Pressable
            style={styles.wsBackdrop}
            onPress={() => {
              Keyboard.dismiss();
              setTrainingLoggedModalOpen(false);
            }}
          />
          <View style={[styles.wsCard, styles.trainingLoggedCard, { maxWidth: 380 }]}>
            <View style={styles.trainingModalTopRow}>
              <Text style={[styles.wsTitle, styles.trainingModalTitleFlex]}>Tu descripción del entreno</Text>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setTrainingLoggedModalOpen(false);
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.trainingLoggedMeta}>
              ~{Math.round(trainingBurnKcal)} kcal
              {activityDay?.training_duration_min != null && activityDay.training_duration_min > 0
                ? ` · ~${activityDay.training_duration_min} min`
                : ''}
            </Text>
            {loggedIaPreview ? (
              <View style={styles.trainingLoggedIaBox}>
                <Text style={styles.trainingLoggedIaLabel}>Resumen IA (al guardar se recalcula)</Text>
                <Text style={styles.trainingLoggedIaText}>{loggedIaPreview}</Text>
              </View>
            ) : null}
            <TextInput
              style={[styles.textFreeInput, styles.trainingLoggedInput]}
              value={trainingEditNotes}
              onChangeText={setTrainingEditNotes}
              placeholder="Lo que le contaste a la IA…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={4000}
              editable={!clearTrainingMutation.isPending && !saveEditedTrainingMutation.isPending}
              textAlignVertical="top"
            />
            <View style={styles.trainingLoggedActions}>
              <Button
                title="Eliminar entreno"
                variant="dangerOutline"
                onPress={() => {
                  confirmTwoAction(
                    'Quitar entreno',
                    '¿Quitar las calorías de entreno de este día? Los pasos del día no se borran.',
                    'Eliminar',
                    () => clearTrainingMutation.mutate(),
                  );
                }}
                disabled={clearTrainingMutation.isPending || saveEditedTrainingMutation.isPending}
                style={styles.trainingLoggedBtn}
              />
              <Button
                title={saveEditedTrainingMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
                onPress={() => {
                  const t = trainingEditNotes.trim();
                  if (t.length < 3) {
                    Alert.alert('Texto corto', 'Escribe al menos 3 caracteres o elimina el entreno.');
                    return;
                  }
                  if (isFreeUser) {
                    showTrainingBurnPremiumLock();
                    Keyboard.dismiss();
                    setTrainingLoggedModalOpen(false);
                    return;
                  }
                  saveEditedTrainingMutation.mutate(t);
                }}
                loading={saveEditedTrainingMutation.isPending}
                disabled={clearTrainingMutation.isPending || saveEditedTrainingMutation.isPending}
                style={styles.trainingLoggedBtn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
    <StreakModal
      visible={streakModalOpen}
      onDismiss={() => setStreakModalOpen(false)}
      streakDays={streakDays}
      streakTier={streakTier}
    />
    </ScreenFocusProvider>
  );
}

type StreakTier = 'cold' | 'warm' | 'hot' | 'fire' | 'legendary';

/** Chip fecha como referencia (~80×40 en layout web): mismo ancho/alto en ambos botones. La llama = alto interior. */
const BRAND_HEADER_CHIP_PAD_V = spacing.xs + 1;
const BRAND_HEADER_CHIP_WIDTH_CALENDAR = 80;
/** Chip racha (llama): un poco más estrecho que el de fecha; misma altura. */
const BRAND_HEADER_CHIP_WIDTH_STREAK = 68;
const BRAND_HEADER_CHIP_HEIGHT = 40;
const BRAND_STREAK_FLAME_PX = BRAND_HEADER_CHIP_HEIGHT - 2 * BRAND_HEADER_CHIP_PAD_V;

const brandHeaderChipBase = {
  height: BRAND_HEADER_CHIP_HEIGHT,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  gap: 4,
  backgroundColor: colors.surfaceMuted,
  paddingHorizontal: spacing.sm + 2,
  paddingVertical: BRAND_HEADER_CHIP_PAD_V,
  borderRadius: borderRadius.full,
  borderWidth: 1,
  borderColor: colors.border,
};

const streakTierStyles: Record<
  StreakTier,
  { icon: string; chip: object; emoji: object; text: object }
> = {
  cold: {
    icon: '🔥',
    chip: {},
    emoji: {},
    text: { color: colors.textSecondary },
  },
  warm: {
    icon: '🔥',
    chip: { borderColor: 'rgba(245, 158, 11, 0.25)', backgroundColor: 'rgba(245, 158, 11, 0.08)' },
    emoji: { fontSize: 15 },
    text: { color: '#F59E0B' },
  },
  hot: {
    icon: '🔥',
    chip: { borderColor: 'rgba(249, 115, 22, 0.35)', backgroundColor: 'rgba(249, 115, 22, 0.12)' },
    emoji: { fontSize: 16 },
    text: { color: '#F97316', fontWeight: '700' as const },
  },
  fire: {
    icon: '🔥',
    chip: { borderColor: 'rgba(239, 68, 68, 0.40)', backgroundColor: 'rgba(239, 68, 68, 0.14)' },
    emoji: { fontSize: 17 },
    text: { color: '#EF4444', fontWeight: '800' as const },
  },
  legendary: {
    icon: '💥',
    chip: { borderColor: 'rgba(168, 85, 247, 0.45)', backgroundColor: 'rgba(168, 85, 247, 0.16)' },
    emoji: { fontSize: 22, lineHeight: BRAND_STREAK_FLAME_PX },
    text: { color: '#A855F7', fontWeight: '900' as const },
  },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 0,
  },
  brandLogo: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  brandNameWhite: { color: colors.white },
  brandNameGreen: { color: colors.primaryLight },
  brandRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandCalendarBtn: {
    ...brandHeaderChipBase,
    width: BRAND_HEADER_CHIP_WIDTH_CALENDAR,
  },
  brandCalendarBtnPressed: { opacity: 0.85 },
  brandCalendarText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  brandStreak: {
    ...brandHeaderChipBase,
    width: BRAND_HEADER_CHIP_WIDTH_STREAK,
  },
  brandStreakFlameImg: {
    width: BRAND_STREAK_FLAME_PX,
    height: BRAND_STREAK_FLAME_PX,
  },
  brandStreakEmoji: { fontSize: 14 },
  brandStreakText: {
    ...typography.captionBold,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
  },
  weekStripSurface: { marginBottom: spacing.sm },
  calendarMonthLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  calendarMonthLinkPressed: { opacity: 0.8 },
  calendarMonthLinkText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  summaryBlock: { marginBottom: spacing.md },
  summaryBlockSurface: { flex: 1 },
  /** Segunda página del carrusel (actividad): centra el bloque en la altura compartida del carrusel. */
  summaryBlockSurfaceActivity: {
    justifyContent: 'center',
    gap: spacing.md,
  },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  summaryTitles: { flex: 1 },
  summaryTitle: { ...typography.sectionTitle, color: colors.text },
  summarySub: { ...typography.caption, color: colors.textSecondary, marginTop: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  badgeOk: { backgroundColor: colors.successMuted },
  badgeWarn: { backgroundColor: colors.warningMuted },
  badgeText: { ...typography.small, fontWeight: '600' },
  badgeTextOk: { color: colors.success },
  badgeTextWarn: { color: colors.warning },
  ringWrap: { alignItems: 'center' },
  macroRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  /** Misma anchura útil que la franja de semana (hereda el padding del scroll padre). */
  carouselTrack: { width: '100%' },
  carouselScroll: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  carouselPage: {
    paddingBottom: spacing.xs,
  },
  carouselDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.md,
  },
  carouselDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
    opacity: 0.35,
  },
  carouselDotActive: {
    opacity: 1,
    backgroundColor: colors.text,
    width: 18,
  },
  /** Contenedor relativo para overlay cuando falta Health Connect / Apple Salud. */
  activityCardShell: {
    position: 'relative',
    marginBottom: 0,
  },
  activityHealthOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warningMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  activityHealthOverlayPressed: {
    opacity: pressedOpacity,
  },
  activityHealthOverlayIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.warningMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  activityHealthOverlayTitle: {
    ...typography.bodyBold,
    color: colors.text,
    textAlign: 'center',
  },
  activityHealthOverlayBody: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  activityHealthOverlayCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryGlowSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  activityHealthOverlayCtaText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.primaryLight,
  },
  activityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md + 2,
    minHeight: 160,
    width: '100%',
  },
  activityTopSeparator: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    minHeight: 140,
    backgroundColor: colors.border,
  },
  activityStepsButton: {
    borderRadius: borderRadius.lg,
    alignSelf: 'center',
    flexShrink: 0,
    marginTop: spacing.md,
  },
  activityStepsButtonPressed: { opacity: 0.86 },
  activityStepsCol: { flexShrink: 0, alignItems: 'center' },
  activitySectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  activityBurnColumn: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 200,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  activityBurnLabel: {
    ...typography.small,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  activityBurnValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
  },
  activityBurnValue: {
    ...typography.metricSm,
    color: colors.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  activityBurnUnit: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  activityBurnChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    justifyContent: 'center',
  },
  activityBurnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.primaryGlowSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  activityBurnChipText: {
    ...typography.small,
    color: colors.primaryLight,
    fontWeight: '600',
  },
  activityBurnHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
  },
  activityBurnHint: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
  /** flex + minHeight:0: altura acotada bajo el asa (ver BottomSheet expandToMaxHeight); evita scroll “atascado” en web. */
  stepsGoalScroll: { flex: 1, minHeight: 0, width: '100%' },
  stepsGoalScrollContent: { paddingBottom: spacing.lg, flexGrow: 0 },
  stepsGoalSheet: {
    paddingHorizontal: screenPaddingX,
    paddingBottom: 0,
  },
  stepsGoalSheetActions: { marginTop: spacing.lg, width: '100%' },
  trainingTextFreeSection: { marginTop: 0, width: '100%' },
  trainingModalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  trainingModalTitleFlex: { flex: 1, paddingRight: spacing.sm },
  trainingModalDescription: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  trainingModalScrollContent: { paddingBottom: spacing.sm, flexGrow: 1 },
  textFreeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textFreeToggleLabel: { ...typography.bodyBold, color: colors.primary, flex: 1 },
  trainingCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 56,
    backgroundColor: colors.primaryGlowSoft,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  trainingCtaIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryGlow,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  trainingCtaCopy: { flex: 1, minWidth: 0, justifyContent: 'center' },
  trainingCtaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    minWidth: 0,
    gap: 6,
  },
  trainingCtaTitle: {
    ...typography.captionBold,
    lineHeight: 18,
    color: colors.text,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  trainingCtaRoutineChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryGlow,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
    flexShrink: 0,
  },
  trainingCtaRoutineChipText: { ...typography.small, color: colors.primaryLight, fontWeight: '600', fontSize: 10, lineHeight: 13 },
  trainingCtaSubtitle: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 14,
    marginTop: 3,
  },
  trainingCtaChevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryGlow,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
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
  workoutEstimateBox: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryGlowFaint,
    marginTop: spacing.sm,
  },
  workoutEstimateKcal: { ...typography.metricSm, color: colors.primaryLight, fontSize: 22, fontWeight: '700' },
  workoutEstimateMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  workoutEstimateSummary: { ...typography.body, color: colors.text, marginTop: spacing.sm, lineHeight: 22 },
  trainingLoggedCard: { maxHeight: 520, paddingBottom: spacing.md },
  trainingLoggedMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  trainingLoggedIaBox: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  trainingLoggedIaLabel: { ...typography.small, color: colors.textMuted, marginBottom: 4, fontWeight: '600' },
  trainingLoggedIaText: { ...typography.small, color: colors.textSecondary, lineHeight: 18 },
  trainingLoggedInput: { minHeight: 100, marginBottom: spacing.md },
  trainingLoggedActions: { gap: spacing.sm },
  trainingLoggedBtn: { marginBottom: 0 },
  quickActionsSection: { marginBottom: spacing.xl },
  quickActionsHeading: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: spacing.md,
  },
  quickActionsTrack: {
    width: '100%',
  },
  quickActionsScroll: {
    width: '100%',
  },
  quickActionsPage: {
    paddingRight: spacing.md,
  },
  quickActionsDots: {
    marginTop: spacing.sm,
  },
  quickActionsRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  quickActionSlot: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  quickActionCard: {
    width: '100%',
    height: 154,
    borderRadius: borderRadius.xl,
    padding: spacing.md + 2,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  quickActionCardWeight: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryBorder,
  },
  quickActionCardWater: {
    position: 'relative',
    backgroundColor: colors.surface,
    borderColor: 'rgba(56, 189, 248, 0.28)',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
  },
  quickActionCardAddMeal: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(99, 102, 241, 0.28)',
  },
  quickActionCardInjuries: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(236, 72, 153, 0.26)',
  },
  quickActionCardBarcode: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(234, 179, 8, 0.28)',
  },
  waterCornerIcon: {
    position: 'absolute',
    top: spacing.sm + 2,
    right: spacing.sm + 2,
    zIndex: 2,
  },
  waterRingWrap: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
    marginBottom: 0,
  },
  quickActionCardPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  quickActionIconWrap: {
    width: 54,
    height: 54,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionIconWeight: {},
  quickActionIconWater: { backgroundColor: 'rgba(56, 189, 248, 0.14)' },
  quickActionIconAddMeal: { backgroundColor: 'rgba(99, 102, 241, 0.14)' },
  quickActionIconInjuries: {},
  quickActionIconBarcode: {},
  quickActionEmoji: { fontSize: 30 },
  quickActionCopy: { minWidth: 0, flexGrow: 1, paddingTop: spacing.sm },
  quickActionTitle: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
    flexShrink: 1,
  },
  quickActionHint: { ...typography.caption, color: colors.textMuted, marginTop: 2, lineHeight: 17, flexShrink: 1 },
  quickActionCtaRow: {
    position: 'absolute',
    right: spacing.md + 2,
    bottom: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  quickActionCtaIconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  waterCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    width: '100%',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  waterCounterSide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  waterCounterSideLeft: { justifyContent: 'flex-start' },
  waterCounterSideRight: { justifyContent: 'flex-end' },
  waterCounterCenter: {
    flex: 1,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  waterBtn: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  waterBtnPlus: {
    backgroundColor: 'rgba(56, 189, 248, 0.85)',
    borderColor: 'rgba(56, 189, 248, 0.5)',
    borderWidth: 1,
  },
  waterBtnDisabled: { opacity: 0.35 },
  waterBtnPressed: { opacity: 0.75, transform: [{ scale: 0.92 }] },
  waterCount: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 13,
    textAlign: 'center',
    width: '100%',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.sectionTitle, color: colors.text },
  seeAll: { ...typography.caption, color: colors.primaryLight, fontWeight: '600' },
  mealSection: { marginBottom: spacing.md, overflow: 'hidden' },
  mealSectionLast: { marginBottom: spacing.xl },
  mealSlotHeaderPressable: { borderRadius: borderRadius.lg },
  mealSlotHeaderPressablePressed: { opacity: 0.85 },
  mealCardHeader: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  mealSlotChevronCorner: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 2,
  },
  mealSlotTypeIconColumn: {
    width: 50,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  mealSlotSideKcalBadge: {
    width: 50,
    height: 42,
    marginTop: 11,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(16, 185, 129, 0.13)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(16, 185, 129, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealSlotSideKcalValue: {
    width: '100%',
    color: colors.text,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: -0.35,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  mealSlotSideKcalUnit: {
    color: colors.primaryLight,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
    marginTop: 1,
    includeFontPadding: false,
  },
  mealCardHeaderText: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.sm,
    paddingTop: 10,
  },
  mealSlotTitle: { ...typography.bodyBold, color: colors.text, fontSize: 17, paddingRight: 30 },
  mealSlotNutritionCard: {
    width: '100%',
    alignSelf: 'stretch',
    marginTop: 33,
    height: 42,
    paddingVertical: 0,
    paddingHorizontal: 10,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(15, 17, 23, 0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
  },
  mealSlotMacroGrid: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealSlotMacroMetric: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  mealSlotMacroInitial: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  mealSlotMacroValue: {
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: -0.15,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  mealSlotMacroDivider: {
    width: StyleSheet.hairlineWidth,
    height: 12,
    backgroundColor: colors.borderStrong,
  },
  mealSlotEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
  mealSlotEmptyLabel: {
    ...typography.small,
    color: colors.textTertiary,
  },
  mealSlotEmptyDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textTertiary,
    opacity: 0.6,
  },
  mealSlotEmptyAction: {
    ...typography.small,
    color: colors.primaryLight,
    fontWeight: '600',
  },
  mealEmptyHint: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addToMealBtn: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  addToMealBtnPressed: { opacity: 0.85 },
  listRowPad: { paddingHorizontal: spacing.md },
  mealRowLeading: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
  },
  mealRowLeadingEmoji: { fontSize: 38, lineHeight: 44 },
  fab: {
    position: 'absolute',
    right: screenPaddingX,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.fab,
  },
  fabTide: { width: 56, height: 56 },
  fabTideInner: { flex: 1 },
  fabIconSpin: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 90,
  },
  fabMenu: {
    position: 'absolute',
    right: screenPaddingX,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xs,
    minWidth: 180,
    zIndex: 95,
    ...elevation.fab,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  fabMenuText: { ...typography.body, color: colors.text },
  fabMenuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.md },
  errorWrap: { justifyContent: 'center', padding: spacing.xl, paddingTop: 100 },
  errorTitle: { ...typography.h2, color: colors.error, marginBottom: spacing.md, textAlign: 'center' },
  errorBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  errorDevHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 18,
  },
  mealPreviewScrollContent: { paddingHorizontal: screenPaddingX, paddingBottom: spacing.md },
  mpSheetRoot: { width: '100%', minHeight: 0 },
  mpScroll: { flex: 1, minHeight: 0 },
  mealPreviewEmpty: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  mpHero: { alignItems: 'center', marginBottom: spacing.lg, paddingTop: spacing.xs },
  mpEmojiWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  mpEmoji: { fontSize: 36, lineHeight: 42 },
  mpTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  mpSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    fontWeight: '500',
  },
  mpMetaTime: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  mpServingHint: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  mpStatRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  mpStatCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mpStatLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  mpStatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
    paddingHorizontal: 2,
  },
  mpStatInput: {
    flex: 1,
    minWidth: 0,
    maxWidth: '72%',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    fontVariant: ['tabular-nums'],
  },
  mpStatUnitSuffix: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    flexShrink: 0,
  },
  mpBarBlock: { marginBottom: spacing.lg },
  mpBarTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
  },
  mpBarSeg: { minWidth: 0 },
  mpLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  mpLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mpLegendDot: { width: 8, height: 8, borderRadius: 4 },
  mpLegendText: { ...typography.small, color: colors.textSecondary, fontWeight: '500' },
  mpAccordion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  mpAccordionTitle: { ...typography.bodyBold, color: colors.text, fontSize: 16, fontWeight: '600' },
  mpFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    paddingHorizontal: 0,
    backgroundColor: colors.surfaceElevated,
  },
  mpFooterLabelsRow: { flexDirection: 'row', marginBottom: spacing.xs, paddingHorizontal: screenPaddingX },
  mpFooterLabel: { ...typography.caption, color: colors.text, fontWeight: '600', flex: 1 },
  mpFooterLabelPortion: { flex: 1.35 },
  mpFooterInputsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: screenPaddingX,
  },
  mpQtyInput: {
    flex: 0.9,
    minWidth: 76,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  // UnitPicker replaces the old static portion box
  mpFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: screenPaddingX,
  },
  mpTrashBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  mpTrashBtnDisabled: { opacity: 0.38 },
  mpFavBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  mpCtaUpdateSplit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 42,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    position: 'relative',
  },
  mpCtaTideFill: {
    flex: 1,
    minHeight: 42,
    width: '100%',
  },
  mpCtaTideSpacer: {
    flex: 1,
    minHeight: 42,
  },
  mpCtaUpdateMain: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingLeft: spacing.md,
  },
  mpCtaUpdateDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  mpCtaUpdateChevron: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mpCtaUpdateDisabled: { opacity: 0.45 },
  mpCtaUpdateText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.2,
  },

  wsOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  wsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  wsCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...elevation.soft,
  },
  wsTitle: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 17,
  },
  wsSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.xl,
  },
  wsInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    height: 56,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  wsInput: {
    width: 220,
    height: 44,
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    paddingVertical: 0,
    backgroundColor: 'transparent',
  },
  wsInputSpacer: {
    flex: 1,
    alignSelf: 'stretch',
  },
  wsInputUnit: {
    ...typography.bodyBold,
    color: colors.textMuted,
    fontSize: 16,
  },
  wsSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    marginBottom: spacing.md,
  },
  wsSaveBtnDisabled: { opacity: 0.35 },
  wsSaveBtnText: {
    ...typography.bodyBold,
    color: colors.white,
    fontSize: 15,
  },
  wsHistoryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
  },
  wsHistoryLinkText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
