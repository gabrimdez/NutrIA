import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { getBadgeCatalogQueryOptions } from '../../src/lib/badgeCatalog';
import { resolveBadgeImageUrl } from '../../src/lib/badgeImageUrl';
import { sortBadgesByRarityOnly } from '../../src/lib/badgeSort';
import { BadgeCatalogItem } from '../../src/types/badges';
import { BadgeDetailModal } from '../../src/components/BadgeDetailModal';
import { BadgeImage } from '../../src/components/BadgeImage';
import { colors, spacing, typography, borderRadius, hairlineWidth } from '../../src/theme';

type Tab = 'all' | 'unlocked' | 'locked';

export default function BadgesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { openBadgeId } = useLocalSearchParams<{ openBadgeId?: string | string[] }>();
  const [tab, setTab] = useState<Tab>('all');
  const [detail, setDetail] = useState<BadgeCatalogItem | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    ...getBadgeCatalogQueryOptions(tab),
  });

  const sorted = useMemo(() => sortBadgesByRarityOnly(data ?? []), [data]);

  const gap = spacing.sm;
  const pad = spacing.md;
  const cell = (width - pad * 2 - gap * 2) / 3;

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const closeDetail = useCallback(() => setDetail(null), []);

  useEffect(() => {
    const raw = openBadgeId;
    if (raw == null || raw === '') return;
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await api.get<BadgeCatalogItem[]>(`/api/v1/me/badges/catalog?status=all`);
        if (cancelled) return;
        const found = all.find((b) => b.badge_id === id);
        if (found) setDetail(found);
      } finally {
        if (!cancelled) {
          try {
            router.setParams({ openBadgeId: '' } as never);
          } catch {
            // expo-router puede rechazar setParams si se desmontó la pantalla
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openBadgeId, router]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.tabsRow}>
        <View style={styles.tabsContent}>
          {(
            [
              { id: 'all' as const, label: 'Todas' },
              { id: 'unlocked' as const, label: 'Desbloqueadas' },
              { id: 'locked' as const, label: 'Bloqueadas' },
            ] as const
          ).map((t) => (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[styles.tabChip, tab === t.id && styles.tabChipOn]}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabChipText, tab === t.id && styles.tabChipTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={styles.hint}>
        Ordenadas por rareza. Toca una insignia para ver su nombre, como conseguirla y su descripcion.
      </Text>

      <ScrollView
        contentContainerStyle={[styles.grid, { paddingHorizontal: pad, paddingBottom: spacing.xl * 2 }]}
        refreshControl={<RefreshControl refreshing={isLoading || isRefetching} onRefresh={onRefresh} />}
      >
        {!sorted.length && !isLoading ? (
          <Text style={styles.empty}>No hay insignias en esta vista.</Text>
        ) : (
          <View style={[styles.gridRow, { gap }]}>
            {sorted.map((b) => {
              const uri = resolveBadgeImageUrl(b.image_url);
              return (
                <Pressable
                  key={b.badge_id}
                  style={[styles.cell, { width: cell, height: cell }]}
                  onPress={() => setDetail(b)}
                  accessibilityRole="button"
                  accessibilityLabel="Ver detalle de insignia"
                >
                  <View style={styles.cellInner}>
                    {uri ? (
                      <BadgeImage uri={uri} style={styles.cellImage} />
                    ) : (
                      <Ionicons name="ribbon-outline" size={32} color={colors.textMuted} />
                    )}
                    {!b.unlocked ? (
                      <View style={styles.lockedOverlay}>
                        <Ionicons name="lock-closed" size={18} color={colors.white} />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <BadgeDetailModal visible={!!detail} badge={detail} onClose={closeDetail} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  tabsRow: { marginBottom: spacing.xs },
  tabsContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  tabChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  tabChipOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  tabChipText: { ...typography.caption, color: colors.textMuted },
  tabChipTextOn: { color: colors.text, fontWeight: '600' },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  grid: { paddingTop: spacing.xs },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cellInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  cellImage: { width: '85%', height: '85%' },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
});
