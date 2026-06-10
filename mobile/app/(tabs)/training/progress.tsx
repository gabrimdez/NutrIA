import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/lib/api';
import { colors, spacing, typography, borderRadius, screenPaddingX, DOCK_H, DOCK_MARGIN_BOTTOM } from '../../../src/theme';
import { Surface } from '../../../src/components';

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16;
  const [search, setSearch] = useState('');

  const { data: exercises = [], isLoading, refetch } = useQuery<string[]>({
    queryKey: ['workout-exercises'],
    queryFn: () => api.get('/api/v1/workouts/exercises'),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter((e) => e.toLowerCase().includes(q));
  }, [exercises, search]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primaryLight} />
      }
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>PROGRESIÓN</Text>
        <Text style={styles.title}>Por ejercicio</Text>
        <Text style={styles.subtitle}>Selecciona uno para ver su evolución</Text>
      </View>

      {exercises.length > 0 && (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar ejercicio..."
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}

      {exercises.length === 0 && !isLoading && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="trending-up-outline" size={32} color={colors.primaryLight} />
          </View>
          <Text style={styles.emptyText}>Sin datos todavía</Text>
          <Text style={styles.emptyHint}>
            Registra sesiones de gym para visualizar tu progreso por ejercicio
          </Text>
        </View>
      )}

      {filtered.length > 0 && (
        <Text style={styles.listLabel}>
          {filtered.length} {filtered.length === 1 ? 'ejercicio' : 'ejercicios'}
        </Text>
      )}

      {filtered.length === 0 && exercises.length > 0 && (
        <Text style={styles.noResults}>Sin resultados para "{search}"</Text>
      )}

      {filtered.map((name) => (
        <Pressable
          key={name}
          onPress={() =>
            router.push({ pathname: '/training/exercise-history', params: { name } })
          }
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Surface style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="barbell-outline" size={18} color={colors.primaryLight} />
            </View>
            <Text style={styles.cardName} numberOfLines={1}>
              {name}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Surface>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md },

  header: { marginBottom: spacing.lg },
  eyebrow: { ...typography.label, color: colors.primaryLight, marginBottom: 4 },
  title: { ...typography.screenTitle, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
  },

  listLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  noResults: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: { ...typography.bodyBold, color: colors.text, flex: 1 },

  empty: {
    alignItems: 'center',
    marginTop: spacing.xxxl + 20,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyText: { ...typography.h3, color: colors.text },
  emptyHint: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },

  pressed: { opacity: 0.85 },
});
