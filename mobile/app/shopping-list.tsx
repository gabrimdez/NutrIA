import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/lib/api';
import { toUserFacingErrorMessage } from '../src/lib/userFacingError';
import { LoadingScreen, EmptyState, Surface } from '../src/components';
import { colors, spacing, typography, screenPaddingX, hairlineWidth, borderRadius } from '../src/theme';
import { ShoppingList, ShoppingListItem } from '../src/types';
import {
  loadShoppingLocalChecks,
  saveShoppingLocalChecks,
  shoppingItemLocalKey,
} from '../src/lib/shoppingListLocalChecks';

function effectiveChecked(item: ShoppingListItem, local: Record<string, boolean>): boolean {
  if (item.id) return item.checked;
  return local[shoppingItemLocalKey(item)] ?? false;
}

function applyItemChecked(list: ShoppingList, itemId: string, checked: boolean): ShoppingList {
  return {
    ...list,
    items: list.items.map((it) => (it.id === itemId ? { ...it, checked } : it)),
  };
}

export default function ShoppingListScreen() {
  const insets = useSafeAreaInsets();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const queryClient = useQueryClient();
  const [localChecked, setLocalChecked] = useState<Record<string, boolean>>({});

  const { data: list, isLoading } = useQuery({
    queryKey: ['shopping-list', planId],
    queryFn: () => api.get<ShoppingList>(`/api/v1/plans/${planId}/shopping-list`),
    enabled: !!planId,
  });

  useEffect(() => {
    if (!planId) return;
    void loadShoppingLocalChecks(planId).then(setLocalChecked);
  }, [planId]);

  const patchMutation = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      api.patch<ShoppingList>(`/api/v1/plans/${planId}/shopping-list/items/${itemId}`, { checked }),
    onMutate: async ({ itemId, checked }) => {
      await queryClient.cancelQueries({ queryKey: ['shopping-list', planId] });
      const previous = queryClient.getQueryData<ShoppingList>(['shopping-list', planId]);
      if (previous) {
        queryClient.setQueryData(['shopping-list', planId], applyItemChecked(previous, itemId, checked));
      }
      return { previous };
    },
    onError: (e: Error, _v, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['shopping-list', planId], context.previous);
      }
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.'));
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['shopping-list', planId], data);
    },
  });

  const toggleItem = useCallback(
    (item: ShoppingListItem) => {
      if (!planId) return;
      const next = !effectiveChecked(item, localChecked);
      if (item.id) {
        patchMutation.mutate({ itemId: item.id, checked: next });
        return;
      }
      const key = shoppingItemLocalKey(item);
      setLocalChecked((prev) => {
        const n = { ...prev, [key]: next };
        void saveShoppingLocalChecks(planId, n);
        return n;
      });
    },
    [planId, localChecked, patchMutation],
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/plan' as never);
  }, []);

  if (isLoading) return <LoadingScreen />;

  if (!list?.items?.length) {
    return (
      <View style={[styles.container, { paddingTop: Math.max(insets.top, spacing.md) }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Ionicons name="chevron-back" size={24} color={colors.primaryLight} />
          </Pressable>
          <Text style={styles.titleInline}>Lista de la compra</Text>
        </View>
        <EmptyState
          title="Lista vacía"
          description="Genera un plan para obtener la lista agregada."
        />
      </View>
    );
  }

  const grouped = list.items.reduce<Record<string, typeof list.items>>((acc, item) => {
    const cat = item.category || 'Otros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, spacing.md) }]}>
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="chevron-back" size={24} color={colors.primaryLight} />
        </Pressable>
        <Text style={styles.titleInline}>Lista de la compra</Text>
      </View>
      <FlatList
        data={Object.entries(grouped)}
        keyExtractor={([cat]) => cat}
        renderItem={({ item: [category, items] }) => (
          <View style={styles.categorySection}>
            <Text style={styles.categoryLabel}>{category}</Text>
            <Surface variant="subtle" style={styles.group}>
              {items.map((item, i) => {
                const checked = effectiveChecked(item, localChecked);
                const rowKey = item.id ?? `${category}-${shoppingItemLocalKey(item)}`;
                return (
                  <Pressable
                    key={rowKey}
                    onPress={() => toggleItem(item)}
                    style={({ pressed }) => [
                      styles.itemRow,
                      i > 0 && styles.itemRowBorder,
                      pressed && styles.itemRowPressed,
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                    </View>
                    <Text style={[styles.itemName, checked && styles.itemChecked]}>{item.food_name}</Text>
                    <Text style={styles.itemQty}>{item.quantity}</Text>
                  </Pressable>
                );
              })}
            </Surface>
          </View>
        )}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenPaddingX,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  backBtn: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.xs,
  },
  titleInline: {
    ...typography.screenTitle,
    color: colors.text,
    flex: 1,
  },
  list: { paddingHorizontal: screenPaddingX },
  categorySection: { marginBottom: spacing.xl },
  categoryLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  group: { overflow: 'hidden', borderRadius: borderRadius.lg },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  itemRowPressed: { opacity: 0.85 },
  itemRowBorder: {
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  itemName: { ...typography.body, color: colors.text, flex: 1 },
  itemChecked: { textDecorationLine: 'line-through', color: colors.textMuted },
  itemQty: { ...typography.caption, color: colors.textSecondary, maxWidth: '42%' },
});
