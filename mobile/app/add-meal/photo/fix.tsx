import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/lib/api';
import { roundMacroG } from '../../../src/lib/mealItemMath';
import { colors, spacing, typography, borderRadius, screenPaddingX } from '../../../src/theme';
import { Surface } from '../../../src/components';
import { useChatInputKeyboardOffset } from '../../../src/hooks/useChatInputKeyboardOffset';
import { PhotoAnalysisItem } from '../../../src/types';
import { usePhotoMeal, withNutritionBase } from './PhotoMealContext';

type FixMsg = { role: 'user' | 'assistant'; content: string };
const CHAT_COMPOSER_SLOT = 124;
const QUICK_PROMPTS = ['Cambia la cantidad a 200g', 'Ese alimento no es correcto', 'Añade una salsa o bebida', 'Recalcula los macros'];

export default function PhotoFixScreen() {
  const { keyboardOffset, safeBottom } = useChatInputKeyboardOffset();
  const { analysis, items, setItems, setItemUnits, totals } = usePhotoMeal();
  const [fixMessages, setFixMessages] = useState<FixMsg[]>([]);
  const [fixInput, setFixInput] = useState('');
  const [fixSessionId, setFixSessionId] = useState<string | null>(null);
  const [fixSending, setFixSending] = useState(false);
  const fixListRef = useRef<FlatList>(null);

  const inputBarBottom = useMemo(() => (keyboardOffset > 0 ? keyboardOffset + spacing.xs : Math.max(safeBottom, spacing.xs) + spacing.xs), [keyboardOffset, safeBottom]);

  useEffect(() => {
    if (!analysis) router.back();
  }, [analysis]);

  const sendFixMessage = useCallback(async (override?: string) => {
    const text = (override ?? fixInput).trim();
    if (!text || fixSending) return;
    setFixInput('');
    setFixMessages((prev) => [...prev, { role: 'user', content: text }]);
    setFixSending(true);

    try {
      const photoContext = {
        meal_name: analysis?.meal_name ?? 'Comida',
        items: items.map((i) => ({
          name: i.normalized_name,
          grams: i.estimated_grams,
          kcal: Math.round(i.kcal),
          protein_g: roundMacroG(i.protein_g),
          carbs_g: roundMacroG(i.carbs_g),
          fat_g: roundMacroG(i.fat_g),
        })),
      };

      const res = await api.post<{
        message: { content: string };
        session_id: string;
        corrected_items?: { name: string; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number }[];
      }>('/api/v1/chat/message', { message: text, session_id: fixSessionId, photo_context: photoContext });

      setFixSessionId(res.session_id);
      setFixMessages((prev) => [...prev, { role: 'assistant', content: res.message.content }]);

      if (res.corrected_items?.length) {
        setItems((prev) => res.corrected_items!.map((ci, idx) => withNutritionBase({
          detected_name: prev[idx]?.detected_name ?? ci.name,
          normalized_name: ci.name,
          estimated_grams: ci.grams,
          kcal: ci.kcal,
          protein_g: ci.protein_g,
          carbs_g: ci.carbs_g,
          fat_g: ci.fat_g,
          confidence: 'medium',
          matched_food_id: prev[idx]?.matched_food_id,
          provider: prev[idx]?.provider,
          assumptions: prev[idx]?.assumptions ?? ['Corregido con asistente'],
        } as PhotoAnalysisItem)));
        setItemUnits((prev) => {
          const next = [...prev];
          while (next.length < res.corrected_items!.length) next.push('g');
          return next.slice(0, res.corrected_items!.length);
        });
      }
    } catch (e: unknown) {
      setFixMessages((prev) => [...prev, { role: 'assistant', content: `No pude aplicar el cambio: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setFixSending(false);
      setTimeout(() => fixListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [fixInput, fixSending, fixSessionId, analysis, items, setItems, setItemUnits]);

  if (!analysis) return null;

  return (
    <View style={s.root}>
      <FlatList
        ref={fixListRef}
        data={fixMessages}
        keyExtractor={(_, i) => String(i)}
        style={s.chatList}
        contentContainerStyle={[s.chatListContent, { paddingBottom: CHAT_COMPOSER_SLOT + spacing.md }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <Surface variant="subtle" padding="md" style={s.summaryCard}>
              <View style={s.summaryIcon}><Ionicons name="sparkles-outline" size={20} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.summaryTitle}>Corrige con lenguaje natural</Text>
                <Text style={s.summaryText}>{items.length} alimentos · {Math.round(totals.kcal)} kcal · P {roundMacroG(totals.protein)}g / C {roundMacroG(totals.carbs)}g / G {roundMacroG(totals.fat)}g</Text>
              </View>
            </Surface>
            <View style={s.promptRow}>
              {QUICK_PROMPTS.map((p) => (
                <TouchableOpacity key={p} style={s.promptChip} onPress={() => setFixInput(p)} activeOpacity={0.85}>
                  <Text style={s.promptText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        }
        renderItem={({ item: msg }) => (
          <View style={[s.bubble, msg.role === 'user' ? s.bubbleUser : s.bubbleAssistant]}>
            <Text style={s.bubbleText}>{msg.content}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={s.chatHint}>Ejemplos: “eso no es plátano, es mango”, “la cantidad real son 180g” o “añade 1 cucharada de aceite”.</Text>}
      />

      <View
        style={[
          s.inputBar,
          {
            bottom: inputBarBottom,
            paddingBottom: keyboardOffset > 0 ? spacing.sm : Math.max(safeBottom, spacing.sm),
            pointerEvents: 'box-none',
          },
        ]}
      >
        <View style={s.chatInputRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.doneBtn} activeOpacity={0.85}>
            <Ionicons name="checkmark" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TextInput
            style={s.chatInput}
            value={fixInput}
            onChangeText={setFixInput}
            onFocus={() => setTimeout(() => fixListRef.current?.scrollToEnd({ animated: true }), 100)}
            placeholder="Describe qué hay que corregir..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            editable={!fixSending}
            textAlignVertical="center"
          />
          <TouchableOpacity onPress={() => sendFixMessage()} disabled={fixSending || !fixInput.trim()} style={s.chatSendBtn}>
            {fixSending ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="send" size={22} color={fixInput.trim() ? colors.primary : colors.textMuted} />}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, width: '100%' },
  chatList: { flex: 1 },
  chatListContent: { flexGrow: 1, paddingHorizontal: screenPaddingX, paddingTop: spacing.sm },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  summaryIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryMuted },
  summaryTitle: { ...typography.bodyBold, color: colors.text },
  summaryText: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  promptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  promptChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  promptText: { ...typography.captionBold, color: colors.textSecondary },
  chatHint: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md, paddingHorizontal: spacing.lg },
  bubble: { maxWidth: '86%', padding: spacing.md, borderRadius: borderRadius.lg, marginBottom: spacing.sm },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.primaryMuted, borderBottomRightRadius: borderRadius.sm },
  bubbleAssistant: { alignSelf: 'flex-start', backgroundColor: colors.surfaceElevated, borderBottomLeftRadius: borderRadius.sm },
  bubbleText: { ...typography.body, color: colors.text },
  inputBar: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.background, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, zIndex: 20, elevation: 8 },
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: screenPaddingX, gap: spacing.sm },
  doneBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryMuted, marginBottom: 2 },
  chatInput: { flex: 1, ...typography.body, color: colors.text, backgroundColor: colors.surface, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxHeight: 110 },
  chatSendBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});
