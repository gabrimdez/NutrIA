import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { Surface, UIButton } from '../../src/components';
import type { InjuriesData } from '../../src/types';
import { colors, screenPaddingX, spacing, typography } from '../../src/theme';
import {
  EMPTY_DRAFT_INJURY,
  InjuryForm,
  draftFromInjury,
  draftToPayload,
  newId,
  normalizeDraft,
  normalizeInjury,
  snapshotDrafts,
  validateDraftInjury,
} from './injuries';
import type { DraftInjury } from './injuries';
import { useKeyboardAwareScrollView } from '../../src/hooks/useKeyboardAwareScrollView';

function buildSnapshot(injury: DraftInjury | null): string {
  return snapshotDrafts(injury ? [injury] : []);
}

export default function InjuryDetailScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string; index?: string }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const rawIndex = Array.isArray(params.index) ? params.index[0] : params.index;
  const injuryIndex = rawIndex !== undefined ? Number(rawIndex) : NaN;
  const isNew = rawId === 'new' || (!rawId && rawIndex === undefined);
  const allowLeaveRef = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isNew ? 'Nueva lesión' : 'Editar lesión',
    });
  }, [navigation, isNew]);
  const [draft, setDraft] = useState<DraftInjury | null>(null);
  const [baseSnapshot, setBaseSnapshot] = useState<string | null>(null);

  const { data, isError, error } = useQuery({
    queryKey: ['injuries'],
    queryFn: () => api.get<InjuriesData>('/api/v1/me/injuries'),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const draftSnapshot = useMemo(() => buildSnapshot(draft), [draft]);
  const isDirty = baseSnapshot === null ? !!draft : draftSnapshot !== baseSnapshot;
  const errors = useMemo(() => (draft ? validateDraftInjury(draft) : {}), [draft]);
  const hasValidationErrors = Object.keys(errors).length > 0;

  useEffect(() => {
    if (!data || draft) return;

    if (isNew) {
      const next = normalizeDraft({ ...EMPTY_DRAFT_INJURY, id: newId(), isNew: true });
      setDraft(next);
      setBaseSnapshot(buildSnapshot(null));
      return;
    }

    const items = data.active_injuries || [];
    const existing = rawId
      ? items.find((item) => item.id === rawId)
      : Number.isInteger(injuryIndex)
        ? items[injuryIndex]
        : undefined;
    if (!existing) {
      Alert.alert('No encontrada', 'No se encontró esta lesión o limitación.', [
        { text: 'Volver', onPress: () => router.back() },
      ]);
      return;
    }

    const next = normalizeDraft({
      ...draftFromInjury(normalizeInjury(existing)),
      id: existing.id ?? newId(),
      isNew: false,
    });
    setDraft(next);
    setBaseSnapshot(buildSnapshot(next));
  }, [data, draft, isNew, rawId, injuryIndex]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('No hay datos para guardar.');
      const payload = draftToPayload(draft);
      if (!payload) throw new Error('Completa la zona antes de guardar.');

      const current = (data?.active_injuries || []).map(normalizeInjury);
      const active_injuries = isNew
        ? [...current, payload]
        : current.map((item, index) => {
            if (rawId) return item.id === rawId ? payload : item;
            return index === injuryIndex ? payload : item;
          });

      return api.put<InjuriesData>('/api/v1/me/injuries', { active_injuries });
    },
    onSuccess: (saved) => {
      if (!isNew) {
        queryClient.setQueryData(['injuries'], saved);
        queryClient.invalidateQueries({ queryKey: ['injuries'] });
      }
      allowLeaveRef.current = true;
      Alert.alert('Guardado', 'Lesión o limitación actualizada.');
      router.back();
    },
    onError: (e: unknown) => {
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'No se pudo guardar.'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => {
      if (isNew) {
        return Promise.resolve({ active_injuries: data?.active_injuries || [] } as InjuriesData);
      }
      const current = (data?.active_injuries || []).map(normalizeInjury);
      const targetId = rawId || draft?.id;
      let active_injuries = targetId
        ? current.filter((item) => item.id !== targetId)
        : current.filter((_item, index) => index !== injuryIndex);
      if (active_injuries.length === current.length && Number.isInteger(injuryIndex)) {
        active_injuries = current.filter((_item, index) => index !== injuryIndex);
      }
      return api.put<InjuriesData>('/api/v1/me/injuries', { active_injuries });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['injuries'], saved);
      queryClient.invalidateQueries({ queryKey: ['injuries'] });
      allowLeaveRef.current = true;
      router.back();
    },
    onError: (e: unknown) => {
      Alert.alert('No se pudo eliminar', toUserFacingErrorMessage(e, 'No se pudo eliminar.'));
    },
  });

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!isDirty || allowLeaveRef.current || saveMutation.isPending || removeMutation.isPending) return;
      e.preventDefault();
      Alert.alert('Cambios sin guardar', '¿Quieres salir sin guardar los cambios?', [
        { text: 'Seguir editando', style: 'cancel' },
        {
          text: 'Salir sin guardar',
          style: 'destructive',
          onPress: () => {
            allowLeaveRef.current = true;
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
    return unsubscribe;
  }, [navigation, isDirty, saveMutation.isPending, removeMutation.isPending]);

  const handleUpdate = useCallback((_idx: number, patch: Partial<DraftInjury>) => {
    setDraft((prev) => (prev ? normalizeDraft({ ...prev, ...patch }) : prev));
  }, []);

  const handleRemove = useCallback(() => {
    if (removeMutation.isPending) return;
    if (Platform.OS === 'web') {
      const ok =
        typeof window !== 'undefined'
          ? window.confirm('¿Seguro que quieres eliminar esta lesión o limitación?')
          : true;
      if (ok) removeMutation.mutate();
      return;
    }
    Alert.alert('Eliminar lesión o limitación', '¿Seguro que quieres eliminar este registro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => removeMutation.mutate() },
    ]);
  }, [removeMutation]);

  const handleSave = useCallback(() => {
    if (hasValidationErrors) {
      Alert.alert('Revisa los datos', 'Hay campos pendientes o con formato inválido antes de guardar.');
      return;
    }
    saveMutation.mutate();
  }, [hasValidationErrors, saveMutation]);

  const bottomPad = Math.max(insets.bottom, 24) + 24;
  const isIos = Platform.OS === 'ios';
  const keyboardAware = useKeyboardAwareScrollView(true);
  // Android + web: padding al contenedor (IME / visualViewport). iOS: KeyboardAvoidingView.
  const frameKeyboardPad = isIos ? 0 : keyboardAware.keyboardHeight + spacing.md;

  // Evitar paddingBottom en content al abrir el teclado (Android). En web, visualViewport
  // rellena keyboardHeight; el padding en el contenedor deja hueco y scrollIntoView sube el input.
  const Container: React.ComponentType<any> = isIos ? KeyboardAvoidingView : View;
  const containerProps = isIos
    ? {
        style: s.container,
        behavior: 'padding' as const,
        keyboardVerticalOffset: headerHeight,
      }
    : { style: [s.container, { paddingBottom: frameKeyboardPad }] };

  return (
    <Container {...containerProps}>
      <ScrollView
        ref={keyboardAware.scrollViewRef}
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        onScroll={keyboardAware.onScroll}
        scrollEventThrottle={keyboardAware.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
      >
        <Surface variant="floating" padding="lg" style={s.headerCard}>
          <Text style={s.kicker}>Información real</Text>
          <Text style={s.title}>{draft?.diagnosisLabel?.trim() || 'Lesión o limitación'}</Text>
          <Text style={s.subtitle}>Edita todos los detalles de este registro. Volverás al listado al guardar.</Text>
        </Surface>

        {isError ? (
          <Text style={s.errorText}>
            {error instanceof Error ? error.message : 'No se pudo cargar esta lesión.'}
          </Text>
        ) : null}

        {draft ? (
          <InjuryForm
            injury={draft}
            index={0}
            errors={errors}
            stackPainInputs={width < 380}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            onInputFocus={keyboardAware.onTextInputFocus}
          />
        ) : (
          <Surface variant="subtle" padding="lg" style={s.loadingCard}>
            <Ionicons name="hourglass-outline" size={24} color={colors.textMuted} />
            <Text style={s.subtitle}>Cargando información...</Text>
          </Surface>
        )}

        <UIButton
          variant="primary"
          title={saveMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          onPress={handleSave}
          disabled={!draft || saveMutation.isPending || removeMutation.isPending || hasValidationErrors || !isDirty}
          size="lg"
          style={s.fullBtn}
          icon={<Ionicons name="checkmark-outline" size={20} color={colors.white} />}
        />
      </ScrollView>
    </Container>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md, gap: spacing.md },
  headerCard: { gap: spacing.xs },
  kicker: { ...typography.micro, color: colors.primaryLight, textTransform: 'uppercase', letterSpacing: 1.1 },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textMuted, lineHeight: 19 },
  errorText: { ...typography.caption, color: colors.error, lineHeight: 18 },
  loadingCard: { alignItems: 'center', gap: spacing.sm },
  fullBtn: { width: '100%' },
});
