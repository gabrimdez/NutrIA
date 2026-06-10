import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, LoadingScreen, MealTypePickerSheet, Surface, UnitPicker } from '../../../src/components';
import { MacroEnergySplitBar, MacroSummarySection } from '../../../src/components/ui/MacroSummaryPreview';
import { colors, spacing, typography, borderRadius, screenPaddingX, actionIntentStyles } from '../../../src/theme';
import { formatMacroGForInput, roundMacroG } from '../../../src/lib/mealItemMath';
import { type FoodUnit, fromGrams, toGrams } from '../../../src/lib/foodUnits';
import { usePhotoMeal, type EditablePhotoAnalysisItem } from './PhotoMealContext';

type MacroField = 'protein_g' | 'carbs_g' | 'fat_g';
type ManualDraft = { name: string; grams: string; kcal: string; protein: string; carbs: string; fat: string };

const emptyDraft: ManualDraft = { name: '', grams: '100', kcal: '', protein: '', carbs: '', fat: '' };

function parseNum(value: string) {
  return Math.max(0, Number.parseFloat(value.replace(',', '.')) || 0);
}

function ManualFoodModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { addManualItem } = usePhotoMeal();
  const [draft, setDraft] = useState<ManualDraft>(emptyDraft);
  const canSave = draft.name.trim().length > 1 && parseNum(draft.grams) > 0;

  const set = (key: keyof ManualDraft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  const save = () => {
    if (!canSave) {
      Alert.alert('Faltan datos', 'Escribe al menos el nombre y una cantidad mayor que 0 g.');
      return;
    }
    addManualItem({
      name: draft.name,
      grams: parseNum(draft.grams),
      kcal: parseNum(draft.kcal),
      protein_g: roundMacroG(parseNum(draft.protein)),
      carbs_g: roundMacroG(parseNum(draft.carbs)),
      fat_g: roundMacroG(parseNum(draft.fat)),
    });
    setDraft(emptyDraft);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <View style={s.modalHandle} />
          <View style={s.modalHeader}>
            <View>
              <Text style={s.modalEyebrow}>Entrada manual</Text>
              <Text style={s.modalTitle}>Añadir alimento</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={s.fieldLabel}>Nombre</Text>
          <Input value={draft.name} onChangeText={(v) => set('name', v)} placeholder="Ej. yogur griego con miel" />

          <View style={s.formGrid}>
            <View style={s.formCellWide}>
              <Text style={s.fieldLabel}>Cantidad (g)</Text>
              <Input value={draft.grams} onChangeText={(v) => set('grams', v)} keyboardType="decimal-pad" />
            </View>
            <View style={s.formCellWide}>
              <Text style={s.fieldLabel}>Calorías</Text>
              <Input value={draft.kcal} onChangeText={(v) => set('kcal', v)} keyboardType="decimal-pad" placeholder="kcal" />
            </View>
            <View style={s.formCell}>
              <Text style={[s.fieldLabel, { color: colors.protein }]}>Proteína</Text>
              <Input value={draft.protein} onChangeText={(v) => set('protein', v)} keyboardType="decimal-pad" placeholder="g" />
            </View>
            <View style={s.formCell}>
              <Text style={[s.fieldLabel, { color: colors.carbs }]}>Carbos</Text>
              <Input value={draft.carbs} onChangeText={(v) => set('carbs', v)} keyboardType="decimal-pad" placeholder="g" />
            </View>
            <View style={s.formCell}>
              <Text style={[s.fieldLabel, { color: colors.fat }]}>Grasas</Text>
              <Input value={draft.fat} onChangeText={(v) => set('fat', v)} keyboardType="decimal-pad" placeholder="g" />
            </View>
          </View>

          <View style={[actionIntentStyles.row, s.modalActions]}>
            <Button variant="actionCancel" title="Cancelar" onPress={onClose} />
            <Button variant="actionConfirm" title="Añadir" onPress={save} disabled={!canSave} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function QuickAction({ icon, title, subtitle, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.86} onPress={onPress} style={s.quickAction}>
      <View style={s.quickIcon}><Ionicons name={icon} size={22} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.quickTitle}>{title}</Text>
        <Text style={s.quickSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function PhotoItemRow({
  item,
  index,
  unit,
  onGrams,
  onUnitChange,
  onRemove,
  onDuplicate,
  onMacro,
}: {
  item: EditablePhotoAnalysisItem;
  index: number;
  unit: FoodUnit;
  onGrams: (i: number, g: number) => void;
  onUnitChange: (i: number, u: FoodUnit) => void;
  onRemove: (i: number) => void;
  onDuplicate: (i: number) => void;
  onMacro: (i: number, field: MacroField, value: number) => void;
}) {
  const displayQty = fromGrams(Math.max(0, item.estimated_grams), unit);
  const [qtyText, setQtyText] = useState(String(Math.round(displayQty * 100) / 100));
  const [protText, setProtText] = useState(formatMacroGForInput(item.protein_g));
  const [carbText, setCarbText] = useState(formatMacroGForInput(item.carbs_g));
  const [fatText, setFatText] = useState(formatMacroGForInput(item.fat_g));
  const qtyFocused = React.useRef(false);
  const protFocused = React.useRef(false);
  const carbFocused = React.useRef(false);
  const fatFocused = React.useRef(false);

  React.useEffect(() => { if (!qtyFocused.current) setQtyText(String(Math.round(displayQty * 100) / 100)); }, [displayQty]);
  React.useEffect(() => { if (!protFocused.current) setProtText(formatMacroGForInput(item.protein_g)); }, [item.protein_g]);
  React.useEffect(() => { if (!carbFocused.current) setCarbText(formatMacroGForInput(item.carbs_g)); }, [item.carbs_g]);
  React.useEffect(() => { if (!fatFocused.current) setFatText(formatMacroGForInput(item.fat_g)); }, [item.fat_g]);

  const commitQty = (text: string) => onGrams(index, toGrams(parseNum(text), unit));

  return (
    <Surface variant="subtle" style={s.itemCard} padding="md">
      <View style={s.itemHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.itemName}>{item.normalized_name}</Text>
          <Text style={s.itemMeta}>{item.confidence === 'manual' ? 'Añadido manualmente' : `Detectado: ${item.detected_name}`}</Text>
        </View>
        <TouchableOpacity onPress={() => onDuplicate(index)} style={s.iconBtn} hitSlop={8}><Ionicons name="copy-outline" size={18} color={colors.primary} /></TouchableOpacity>
        <TouchableOpacity onPress={() => onRemove(index)} style={s.iconBtn} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.error} /></TouchableOpacity>
      </View>

      <View style={s.qtyControlsRow}>
        <View style={s.qtyInputWrap}>
          <Text style={s.fieldLabel}>Cantidad</Text>
          <Input dense value={qtyText} onChangeText={(t) => { setQtyText(t); commitQty(t); }} onFocus={() => { qtyFocused.current = true; }} onBlur={() => { qtyFocused.current = false; commitQty(qtyText); }} keyboardType="decimal-pad" />
        </View>
        <View style={s.unitCol}><Text style={s.fieldLabel}>Unidad</Text><UnitPicker value={unit} onChange={(u) => onUnitChange(index, u)} /></View>
        <View style={s.kcalPill}><Text style={s.kcalText}>{Math.round(item.kcal)} kcal</Text></View>
      </View>

      <View style={s.macroEditRow}>
        <MacroInput label="P" color={colors.protein} value={protText} onValue={setProtText} onFocus={() => { protFocused.current = true; }} onBlur={() => { protFocused.current = false; onMacro(index, 'protein_g', roundMacroG(parseNum(protText))); }} />
        <MacroInput label="C" color={colors.carbs} value={carbText} onValue={setCarbText} onFocus={() => { carbFocused.current = true; }} onBlur={() => { carbFocused.current = false; onMacro(index, 'carbs_g', roundMacroG(parseNum(carbText))); }} />
        <MacroInput label="G" color={colors.fat} value={fatText} onValue={setFatText} onFocus={() => { fatFocused.current = true; }} onBlur={() => { fatFocused.current = false; onMacro(index, 'fat_g', roundMacroG(parseNum(fatText))); }} />
      </View>
      <MacroEnergySplitBar proteinG={item.protein_g} carbsG={item.carbs_g} fatG={item.fat_g} />
    </Surface>
  );
}

function MacroInput({ label, color, value, onValue, onFocus, onBlur }: { label: string; color: string; value: string; onValue: (v: string) => void; onFocus: () => void; onBlur: () => void }) {
  return (
    <View style={s.macroInputWrap}>
      <Text style={[s.macroLetter, { color }]}>{label}</Text>
      <TextInput style={[s.macroInput, { color }]} value={value} onChangeText={onValue} onFocus={onFocus} onBlur={onBlur} keyboardType="decimal-pad" selectTextOnFocus />
      <Text style={[s.macroUnit, { color }]}>g</Text>
    </View>
  );
}

export default function PhotoMealIndexScreen() {
  const {
    kbHeight,
    importUriParam,
    imageUri,
    analysis,
    items,
    itemUnits,
    showMealPicker,
    setShowMealPicker,
    selectedMealType,
    setSelectedMealType,
    setMealName,
    analyzeMutation,
    saveMutation,
    pickImage,
    takePhoto,
    updateItemGrams,
    updateItemMacro,
    removeItem,
    duplicateItem,
    onItemUnitChange,
    resetPhotoMeal,
    totals,
    insets,
  } = usePhotoMeal();
  const [manualOpen, setManualOpen] = useState(false);
  const [mealNameDraft, setMealNameDraft] = useState(analysis?.meal_name ?? '');

  React.useEffect(() => setMealNameDraft(analysis?.meal_name ?? ''), [analysis?.meal_name]);

  const hasItems = items.length > 0;
  const footerDisabled = !hasItems || saveMutation.isPending;
  const summaryLabel = useMemo(() => `${items.length} alimento${items.length === 1 ? '' : 's'} · ${Math.round(totals.kcal)} kcal`, [items.length, totals.kcal]);

  if (analyzeMutation.isPending || (Boolean(importUriParam) && !analysis && !analyzeMutation.isError)) {
    return (
      <View style={s.loadingContainer}>
        {imageUri ? <Image source={{ uri: imageUri }} style={s.loadingImage} /> : <ActivityIndicator color={colors.primaryLight} style={{ marginVertical: 28 }} size="large" />}
        <Text style={s.loadingTitle}>Analizando tu plato</Text>
        <Text style={s.loadingText}>Estamos identificando alimentos, raciones y macros. Podrás corregirlo todo antes de guardar.</Text>
        <LoadingScreen />
      </View>
    );
  }

  return (
    <>
      <View style={[s.screenRoot, kbHeight > 0 && { paddingBottom: kbHeight }]}> 
        <ScrollView style={s.resultsScroll} contentContainerStyle={[s.resultsScrollContent, { paddingBottom: 150 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          <View style={s.heroCard}>
            {imageUri ? <Image source={{ uri: imageUri }} style={s.heroImage} resizeMode="cover" /> : <View style={s.heroPlaceholder}><Ionicons name="restaurant-outline" size={34} color={colors.primary} /></View>}
            <View style={s.heroOverlay}>
              <Text style={s.heroEyebrow}>Registro de comida</Text>
              <Text style={s.heroTitle}>{analysis ? 'Revisa y completa tu comida' : 'Añade comida con foto o manualmente'}</Text>
              <Text style={s.heroSubtitle}>{analysis ? summaryLabel : 'Elige una foto, toma una nueva o crea alimentos a mano con sus macros.'}</Text>
            </View>
          </View>

          <View style={s.quickGrid}>
            <QuickAction icon="camera-outline" title="Tomar foto" subtitle="Analizar plato con IA" onPress={takePhoto} />
            <QuickAction icon="images-outline" title="Galería" subtitle="Importar una imagen" onPress={pickImage} />
            <QuickAction icon="create-outline" title="Manual" subtitle="Añadir alimento y macros" onPress={() => setManualOpen(true)} />
          </View>

          {analysis || hasItems ? (
            <>
              <Text style={s.sectionLabel}>Nombre de la comida</Text>
              <Input value={mealNameDraft} onChangeText={(v) => { setMealNameDraft(v); setMealName(v); }} placeholder="Ej. comida post-entreno" />

              <MacroSummarySection style={{ marginTop: spacing.lg }} kcal={totals.kcal} proteinG={totals.protein} carbsG={totals.carbs} fatG={totals.fat} />

              {analysis?.overall_confidence && analysis.overall_confidence !== 'high' && analysis.overall_confidence !== 'manual' ? (
                <Surface variant="subtle" style={s.warningCard} padding="md">
                  <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
                  <Text style={s.warningText}>Confianza {analysis.overall_confidence}. Revisa cantidades o usa “Solucionar”.</Text>
                </Surface>
              ) : null}

              <View style={s.sectionHeaderRow}>
                <Text style={s.sectionLabel}>Alimentos</Text>
                <TouchableOpacity onPress={() => setManualOpen(true)} style={s.addInlineBtn}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={s.addInlineText}>Manual</Text>
                </TouchableOpacity>
              </View>

              {items.map((item, i) => (
                <PhotoItemRow key={`meal-item-${i}-${item.normalized_name}`} item={item} index={i} unit={itemUnits[i] ?? 'g'} onGrams={updateItemGrams} onUnitChange={onItemUnitChange} onRemove={removeItem} onDuplicate={duplicateItem} onMacro={updateItemMacro} />
              ))}
            </>
          ) : (
            <Surface variant="subtle" padding="lg" style={s.emptyCard}>
              <Ionicons name="sparkles-outline" size={28} color={colors.primary} />
              <Text style={s.emptyTitle}>Empieza tu registro</Text>
              <Text style={s.emptyText}>Puedes combinar IA y edición manual: analiza una foto y luego añade o corrige alimentos sin salir de esta pantalla.</Text>
            </Surface>
          )}
        </ScrollView>

        <View style={[s.resultsFooter, { paddingBottom: (kbHeight > 0 ? spacing.sm : insets.bottom + spacing.md) }]}> 
          <View style={s.footerTop}>
            <Text style={s.footerSummary}>{summaryLabel}</Text>
            {(analysis || hasItems) && <TouchableOpacity onPress={resetPhotoMeal}><Text style={s.resetText}>Reiniciar</Text></TouchableOpacity>}
          </View>
          <View style={s.actionsRow}>
            <Button title="Guardar" size="sm" onPress={() => setShowMealPicker(true)} loading={saveMutation.isPending} disabled={footerDisabled} style={s.actionBtn} />
            <Button title="Solucionar" size="sm" variant="secondary" icon={<Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />} onPress={() => router.push('/add-meal/photo/fix')} disabled={!analysis && !hasItems} style={s.actionBtn} />
          </View>
        </View>
      </View>

      <ManualFoodModal visible={manualOpen} onClose={() => setManualOpen(false)} />
      <MealTypePickerSheet visible={showMealPicker} title="Guardar como..." selectedMealType={selectedMealType} onDismiss={() => setShowMealPicker(false)} onSelect={(mealTypeToSave) => { setSelectedMealType(mealTypeToSave); setShowMealPicker(false); saveMutation.mutate(mealTypeToSave); }} />
    </>
  );
}

const s = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: colors.background },
  resultsScroll: { flex: 1 },
  resultsScrollContent: { flexGrow: 1, paddingHorizontal: screenPaddingX, paddingTop: spacing.md },
  heroCard: { minHeight: 210, borderRadius: borderRadius.xxl, overflow: 'hidden', backgroundColor: colors.surface, marginBottom: spacing.md },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  heroOverlay: { flex: 1, justifyContent: 'flex-end', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.18)' },
  heroEyebrow: { ...typography.captionBold, color: colors.primaryLight, textTransform: 'uppercase', letterSpacing: 1 },
  heroTitle: { ...typography.h1, color: colors.text, marginTop: spacing.xs },
  heroSubtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  quickGrid: { gap: spacing.sm, marginBottom: spacing.lg },
  quickAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: borderRadius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  quickIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryMuted },
  quickTitle: { ...typography.bodyBold, color: colors.text },
  quickSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  sectionLabel: { ...typography.captionBold, fontSize: 11, letterSpacing: 1.1, color: colors.textMuted, marginBottom: spacing.sm, textTransform: 'uppercase' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  addInlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full, backgroundColor: colors.primaryMuted },
  addInlineText: { ...typography.captionBold, color: colors.primary },
  warningCard: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.md },
  warningText: { ...typography.caption, color: colors.warning, flex: 1 },
  itemCard: { marginBottom: spacing.md },
  itemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  itemName: { ...typography.bodyBold, color: colors.text, textTransform: 'capitalize' },
  itemMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, marginLeft: spacing.xs },
  qtyControlsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginBottom: spacing.md },
  qtyInputWrap: { flex: 1, minWidth: 0 },
  unitCol: { width: 110 },
  kcalPill: { borderRadius: borderRadius.full, backgroundColor: colors.surfaceElevated, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, marginBottom: 2 },
  kcalText: { ...typography.captionBold, color: colors.calories },
  fieldLabel: { ...typography.label, color: colors.textMuted, marginBottom: spacing.xs },
  macroEditRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: spacing.xs },
  macroInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  macroLetter: { ...typography.captionBold, fontSize: 12 },
  macroInput: { ...typography.caption, fontSize: 14, fontWeight: '700', borderBottomWidth: 1, borderBottomColor: colors.border, minWidth: 42, maxWidth: 58, textAlign: 'center', paddingVertical: 2 },
  macroUnit: { ...typography.caption, fontSize: 11 },
  emptyCard: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  emptyTitle: { ...typography.h3, color: colors.text, textAlign: 'center' },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  resultsFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: screenPaddingX, paddingTop: spacing.sm, backgroundColor: colors.background },
  footerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  footerSummary: { ...typography.captionBold, color: colors.textSecondary },
  resetText: { ...typography.captionBold, color: colors.error },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1 },
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', paddingHorizontal: screenPaddingX, paddingTop: 80 },
  loadingImage: { width: 210, height: 210, borderRadius: borderRadius.xl, marginBottom: spacing.lg },
  loadingTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  loadingText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: { maxHeight: '88%', paddingHorizontal: screenPaddingX, paddingTop: spacing.sm, paddingBottom: spacing.lg, borderTopLeftRadius: borderRadius.xxl, borderTopRightRadius: borderRadius.xxl, backgroundColor: colors.background },
  modalHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 99, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalEyebrow: { ...typography.captionBold, color: colors.primary, textTransform: 'uppercase', letterSpacing: 1 },
  modalTitle: { ...typography.h2, color: colors.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm },
  formCellWide: { width: '48%' },
  formCell: { flex: 1, minWidth: 95 },
  modalActions: { marginTop: spacing.lg, width: '100%' },
});

