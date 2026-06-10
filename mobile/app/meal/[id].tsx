import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { Button, LoadingScreen, Surface, MacroChip, TextField } from '../../src/components';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  screenPaddingX,
  hairlineWidth,
  iconSize,
  actionIntentStyles,
} from '../../src/theme';
import { MealEntry, MealItem } from '../../src/types';
import {
  kcalFromMacros,
  scaleMacrosToGrams,
  roundMacroG,
  formatMacroGForInput,
} from '../../src/lib/mealItemMath';
import { invalidateMealRelatedQueries } from '../../src/lib/mealQueryInvalidation';
import { confirmTwoAction } from '../../src/lib/confirmTwoAction';
import { type FoodUnit, toGrams, fromGrams } from '../../src/lib/foodUnits';
import { UnitPicker } from '../../src/components';
import { mealItemDisplayLineForUi } from '../../src/lib/mealDisplay';

type Line = MealItem & { key: string };

function itemKey(i: MealItem, idx: number) {
  return i.id ?? `tmp-${idx}`;
}

export default function EditMealScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const queryClient = useQueryClient();

  const { data: meal, isLoading, isError, error } = useQuery({
    queryKey: ['meal', id],
    queryFn: () => api.get<MealEntry>(`/api/v1/meals/${id}`),
    enabled: !!id,
  });

  const [lines, setLines] = useState<Line[]>([]);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<MealItem | null>(null);
  const [draftGrams, setDraftGrams] = useState('');
  const [draftUnit, setDraftUnit] = useState<FoodUnit>('g');
  const [draftMacroStr, setDraftMacroStr] = useState({
    protein_g: '',
    carbs_g: '',
    fat_g: '',
  });

  useEffect(() => {
    if (!meal?.items) return;
    setLines(
      meal.items.map((it, idx) => ({
        ...it,
        key: itemKey(it, idx),
      })),
    );
  }, [meal?.id, meal?.items]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch<MealEntry>(`/api/v1/meals/${id}`, {
        items: lines.map(({ key: _k, ...rest }) => ({
          food_catalog_id: rest.food_catalog_id || undefined,
          custom_name: rest.custom_name,
          grams: rest.grams,
          kcal: rest.kcal,
          protein_g: rest.protein_g,
          carbs_g: rest.carbs_g,
          fat_g: rest.fat_g,
          eaten: rest.eaten !== false,
        })),
      }),
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['meal', id] });
      Alert.alert('Guardado', 'Comida actualizada');
      router.back();
    },
    onError: (e: unknown) =>
      Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo guardar')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/meals/${id}`),
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      router.back();
    },
    onError: (e: unknown) =>
      Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo eliminar')),
  });

  const openEdit = (line: Line) => {
    setEditKey(line.key);
    const grams = Math.max(0, Math.round(line.grams));
    setDraft({
      ...line,
      grams,
      protein_g: roundMacroG(line.protein_g),
      carbs_g: roundMacroG(line.carbs_g),
      fat_g: roundMacroG(line.fat_g),
      kcal: kcalFromMacros(
        roundMacroG(line.protein_g),
        roundMacroG(line.carbs_g),
        roundMacroG(line.fat_g),
      ),
    });
    setDraftUnit('g');
    setDraftGrams(String(grams));
    setDraftMacroStr({
      protein_g: formatMacroGForInput(line.protein_g),
      carbs_g: formatMacroGForInput(line.carbs_g),
      fat_g: formatMacroGForInput(line.fat_g),
    });
  };

  const closeEdit = () => {
    setEditKey(null);
    setDraft(null);
    setDraftUnit('g');
    setDraftMacroStr({ protein_g: '', carbs_g: '', fat_g: '' });
  };

  const applyDraft = () => {
    if (!draft || !editKey) return;
    const raw = parseFloat(draftGrams.replace(',', '.')) || 0;
    const grams = Math.max(0, Math.round(toGrams(raw, draftUnit) || draft.grams));
    const p = roundMacroG(draft.protein_g);
    const c = roundMacroG(draft.carbs_g);
    const f = roundMacroG(draft.fat_g);
    const kcal = kcalFromMacros(p, c, f);
    setLines((prev) =>
      prev.map((l) =>
        l.key === editKey ? { ...l, ...draft, grams, protein_g: p, carbs_g: c, fat_g: f, kcal } : l,
      ),
    );
    closeEdit();
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const confirmRemoveFood = (line: Line) => {
    const name = line.custom_name?.trim() || 'Alimento';
    confirmTwoAction('Quitar alimento', `¿Eliminar «${name}» de esta comida?`, 'Quitar', () =>
      removeLine(line.key),
    );
  };

  const totals = useMemo(
    () =>
      lines
        .filter((i) => i.eaten !== false)
        .reduce(
          (acc, i) => ({
            kcal: acc.kcal + i.kcal,
            p: acc.p + i.protein_g,
            c: acc.c + i.carbs_g,
            f: acc.f + i.fat_g,
          }),
          { kcal: 0, p: 0, c: 0, f: 0 },
        ),
    [lines],
  );

  const onDraftQtyChange = (text: string) => {
    setDraftGrams(text);
    const raw = Math.max(0, parseFloat(text.replace(',', '.')) || 0);
    const g = Math.round(toGrams(raw, draftUnit));
    if (!draft) return;
    const scaled = scaleMacrosToGrams(draft.grams, g, draft.kcal, draft.protein_g, draft.carbs_g, draft.fat_g);
    setDraft({
      ...draft,
      grams: scaled.grams,
      kcal: scaled.kcal,
      protein_g: scaled.protein_g,
      carbs_g: scaled.carbs_g,
      fat_g: scaled.fat_g,
    });
    setDraftMacroStr({
      protein_g: formatMacroGForInput(scaled.protein_g),
      carbs_g: formatMacroGForInput(scaled.carbs_g),
      fat_g: formatMacroGForInput(scaled.fat_g),
    });
  };

  const onDraftUnitChange = (newUnit: FoodUnit) => {
    const raw = parseFloat(draftGrams.replace(',', '.')) || 0;
    const currentGrams = toGrams(raw, draftUnit);
    const converted = fromGrams(currentGrams, newUnit);
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

  if (!id || isLoading) return <LoadingScreen />;
  if (isError || !meal) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{error instanceof Error ? error.message : 'No encontrada'}</Text>
        <Button title="Volver" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  if (lines.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="restaurant-outline" size={48} color={colors.textMuted} style={{ marginBottom: spacing.md }} />
        <Text style={styles.emptyTitle}>Sin alimentos</Text>
        <Text style={styles.emptySub}>
          Has quitado todos los ítems o la comida venía vacía. Puedes borrar la entrada del diario o volver.
        </Text>
        <Button
          title="Eliminar comida del diario"
          variant="dangerOutline"
          onPress={() =>
            confirmTwoAction(
              'Eliminar comida',
              '¿Borrar por completo esta entrada del diario?',
              'Eliminar',
              () => deleteMutation.mutate(),
            )
          }
          style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}
          loading={deleteMutation.isPending}
        />
        <Button title="Volver" onPress={() => router.back()} style={{ marginTop: spacing.md, alignSelf: 'stretch' }} />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Surface variant="elevated" padding="lg" style={styles.totalsBlock}>
          <Text style={styles.totalsLabel}>Resumen</Text>
          <Text style={styles.totalsKcal}>{Math.round(totals.kcal).toLocaleString('es-ES')}</Text>
          <Text style={styles.totalsKcalUnit}>kilocalorías</Text>
          <View style={styles.totalsMacroRow}>
            <MacroChip label="P" value={`${Math.round(totals.p)} g`} accentColor={colors.protein} compact />
            <MacroChip label="C" value={`${Math.round(totals.c)} g`} accentColor={colors.carbs} compact />
            <MacroChip label="G" value={`${Math.round(totals.f)} g`} accentColor={colors.fat} compact />
          </View>
        </Surface>

        <Text style={styles.hint}>
          Toca un alimento para editarlo. La papelera lo quita de la lista; pulsa «Guardar cambios» para aplicar. El
          resumen muestra solo lo marcado como comido en el día.
        </Text>

        {lines.map((line) => (
          <Surface key={line.key} variant="subtle" padding="md" style={styles.itemCard}>
            <View style={styles.itemOuter}>
              <View style={styles.itemTopRow}>
                <TouchableOpacity
                  style={styles.itemMain}
                  onPress={() => openEdit(line)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.itemName} numberOfLines={2}>
                    {mealItemDisplayLineForUi(line.custom_name || 'Alimento')}
                  </Text>
                  <Text style={styles.gramsLine}>{Math.round(line.grams)} g</Text>
                  <View style={styles.macroPillsRow}>
                    <MacroChip label="P" value={`${Math.round(line.protein_g)}`} accentColor={colors.protein} compact />
                    <MacroChip label="C" value={`${Math.round(line.carbs_g)}`} accentColor={colors.carbs} compact />
                    <MacroChip label="G" value={`${Math.round(line.fat_g)}`} accentColor={colors.fat} compact />
                  </View>
                  <Text style={styles.itemKcal}>{Math.round(line.kcal)} kcal</Text>
                </TouchableOpacity>
                <View style={styles.itemActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Quitar alimento"
                    onPress={() => confirmRemoveFood(line)}
                    style={({ pressed }) => [
                      styles.actionIconBtn,
                      styles.actionIconDanger,
                      pressed && styles.actionPressed,
                    ]}
                  >
                    <Ionicons name="trash-outline" size={iconSize.md} color={colors.error} />
                  </Pressable>
                </View>
              </View>
              <Pressable
                style={styles.countTowardRow}
                onPress={() =>
                  setLines((prev) =>
                    prev.map((l) =>
                      l.key === line.key ? { ...l, eaten: !(l.eaten !== false) } : l,
                    ),
                  )
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: line.eaten !== false }}
                accessibilityLabel="Contar este alimento en el total del día"
              >
                <Ionicons
                  name={line.eaten !== false ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={line.eaten !== false ? colors.success : colors.textMuted}
                />
                <Text style={styles.countTowardText}>Contar en el total del día</Text>
              </Pressable>
            </View>
          </Surface>
        ))}

        <Button
          variant="actionConfirm"
          title="Guardar cambios"
          onPress={() => {
            if (lines.length < 1) {
              Alert.alert('Comida vacía', 'Añade al menos un alimento o elimina la comida entera.');
              return;
            }
            saveMutation.mutate();
          }}
          disabled={saveMutation.isPending}
          loading={saveMutation.isPending}
          style={{ alignSelf: 'stretch', width: '100%' }}
        />

        <View style={styles.destructiveZone}>
          <Button
            title="Eliminar comida entera"
            variant="dangerOutline"
            onPress={() =>
              confirmTwoAction('Eliminar', '¿Borrar toda esta comida?', 'Eliminar', () => deleteMutation.mutate())
            }
          />
        </View>
      </ScrollView>

      <Modal visible={!!draft && !!editKey} animationType="slide" transparent onRequestClose={closeEdit}>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeEdit}
            accessibilityRole="button"
            accessibilityLabel="Cerrar editor"
          />
          <View style={styles.modalBox}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.modalTitle}>{mealItemDisplayLineForUi(draft?.custom_name || 'Alimento')}</Text>
              <Text style={styles.qtyLabel}>Cantidad</Text>
              <View style={styles.qtyRow}>
                <View style={styles.qtyInputWrap}>
                  <TextField
                    label=""
                    value={draftGrams}
                    onChangeText={onDraftQtyChange}
                    keyboardType="decimal-pad"
                    placeholder="100"
                  />
                </View>
                <UnitPicker value={draftUnit} onChange={onDraftUnitChange} />
              </View>
              <TextField
                label="Proteína (g)"
                value={draftMacroStr.protein_g}
                onChangeText={(t) => onDraftMacro('protein_g', t)}
                keyboardType="decimal-pad"
              />
              <TextField
                label="Carbohidratos (g)"
                value={draftMacroStr.carbs_g}
                onChangeText={(t) => onDraftMacro('carbs_g', t)}
                keyboardType="decimal-pad"
              />
              <TextField
                label="Grasas (g)"
                value={draftMacroStr.fat_g}
                onChangeText={(t) => onDraftMacro('fat_g', t)}
                keyboardType="decimal-pad"
              />
              <View style={styles.kcalBox}>
                <Text style={styles.kcalOut}>
                  ≈ {draft ? Math.round(kcalFromMacros(draft.protein_g, draft.carbs_g, draft.fat_g)) : 0} kcal
                  <Text style={styles.kcalOutHint}> (por macros)</Text>
                </Text>
              </View>
              <View style={[actionIntentStyles.row, { marginTop: spacing.lg }]}>
                <Button variant="actionCancel" title="Cancelar" onPress={closeEdit} />
                <Button variant="actionConfirm" title="Aplicar" onPress={applyDraft} />
              </View>
              {editKey ? (
                <Pressable
                  style={({ pressed }) => [styles.modalRemoveBtn, pressed && styles.modalRemoveBtnPressed]}
                  onPress={() =>
                    confirmTwoAction('Quitar alimento', '¿Eliminar este ítem de la comida?', 'Quitar', () => {
                      removeLine(editKey);
                      closeEdit();
                    })
                  }
                >
                  <Ionicons name="trash-outline" size={iconSize.sm} color={colors.error} />
                  <Text style={styles.modalRemoveText}>Quitar de la comida</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
    backgroundColor: colors.background,
  },
  err: { ...typography.body, color: colors.error, textAlign: 'center', marginBottom: spacing.md },
  emptyTitle: { ...typography.sectionTitle, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  emptySub: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  totalsBlock: { marginBottom: spacing.lg },
  totalsLabel: { ...typography.label, color: colors.textMuted },
  totalsKcal: { ...typography.metricLg, color: colors.text, marginTop: spacing.sm },
  totalsKcalUnit: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  totalsMacroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  hint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  itemCard: { marginBottom: spacing.md },
  itemOuter: { gap: spacing.sm },
  itemTopRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  itemMain: { flex: 1, minWidth: 0 },
  countTowardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  countTowardText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  itemName: { ...typography.bodyBold, color: colors.text, fontSize: 16, lineHeight: 22 },
  gramsLine: { ...typography.small, color: colors.textMuted, marginTop: spacing.xs },
  macroPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  itemKcal: { ...typography.metricSm, color: colors.textSecondary, marginTop: spacing.md },
  itemActions: { justifyContent: 'flex-start', gap: spacing.sm, paddingTop: 2 },
  actionIconBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionIconDanger: {
    backgroundColor: colors.dangerMuted,
    borderColor: 'rgba(232, 93, 93, 0.35)',
  },
  actionPressed: { opacity: 0.85 },
  destructiveZone: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  modalRemoveText: { ...typography.bodyBold, color: colors.error, marginLeft: spacing.sm },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '88%',
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  modalTitle: { ...typography.sectionTitle, color: colors.text, marginBottom: spacing.md },
  qtyLabel: { ...typography.captionBold, color: colors.textMuted, marginBottom: spacing.xs },
  qtyRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.sm },
  qtyInputWrap: { flex: 1, minWidth: 0 },
  kcalBox: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  kcalOut: { ...typography.bodyBold, color: colors.text },
  kcalOutHint: { ...typography.caption, color: colors.textMuted, fontWeight: '400' },
  modalRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.dangerMuted,
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 93, 0.25)',
  },
  modalRemoveBtnPressed: { opacity: 0.85 },
});
