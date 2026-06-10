import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { getBadgeCatalogQueryOptions } from '../../src/lib/badgeCatalog';
import { resolveBadgeImageUrl } from '../../src/lib/badgeImageUrl';
import { sortBadgesByRarityOnly } from '../../src/lib/badgeSort';
import { BadgeCatalogItem, FeaturedBadgeSlot } from '../../src/types/badges';
import { BadgeDetailModal } from '../../src/components/BadgeDetailModal';
import { BadgeImage } from '../../src/components/BadgeImage';
import { UIButton } from '../../src/components';
import { colors, spacing, typography, borderRadius, hairlineWidth } from '../../src/theme';

export default function BadgesFeaturedScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const qc = useQueryClient();
  const [order, setOrder] = useState<string[]>([]);
  const [detail, setDetail] = useState<BadgeCatalogItem | null>(null);

  const { data: catalog, isLoading: catalogLoading } = useQuery({
    ...getBadgeCatalogQueryOptions('all'),
  });

  const { data: featured } = useQuery({
    queryKey: ['badges-featured'],
    queryFn: () => api.get<FeaturedBadgeSlot[]>('/api/v1/me/badges/featured'),
  });

  const sorted = useMemo(() => sortBadgesByRarityOnly(catalog ?? []), [catalog]);

  useEffect(() => {
    if (!featured) return;
    const ids = featured.map((s) => s.badge_id).filter((x): x is string => !!x);
    setOrder(ids);
  }, [featured]);

  const saveMut = useMutation({
    mutationFn: (ids: string[]) => api.put<FeaturedBadgeSlot[]>('/api/v1/me/badges/featured', { badge_ids: ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['badges-featured'] });
      void qc.invalidateQueries({ queryKey: ['badges-catalog'] });
      router.back();
    },
    onError: (e: unknown) => Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'No se pudo guardar las insignias.')),
  });

  const toggle = useCallback((id: string) => {
    setOrder((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        Alert.alert('Límite', 'Solo puedes elegir 3 insignias destacadas.');
        return prev;
      }
      return [...prev, id];
    });
  }, []);

  const move = (idx: number, dir: -1 | 1) => {
    setOrder((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const n = [...prev];
      [n[idx], n[j]] = [n[j], n[idx]];
      return n;
    });
  };

  const byId = useMemo(() => {
    const m = new Map<string, BadgeCatalogItem>();
    for (const b of sorted) m.set(b.badge_id, b);
    return m;
  }, [sorted]);

  const gap = spacing.sm;
  const pad = spacing.md;
  const cell = (width - pad * 2 - gap * 2) / 3;

  const closeDetail = useCallback(() => setDetail(null), []);

  return (
    <View style={[styles.root, { paddingTop: spacing.md + insets.top }]}>
      <Text style={styles.hint}>
        Catálogo por rareza. Imagen: detalle. Círculo: elegir hasta 3 (solo desbloqueadas). Flechas: orden en perfil.
      </Text>

      <Text style={styles.subheading}>Destacadas en perfil</Text>
      <View style={styles.selectedRow}>
        {order.length === 0 ? (
          <Text style={styles.selectedEmpty}>Ninguna seleccionada</Text>
        ) : (
          order.map((id, idx) => {
            const b = byId.get(id);
            const uri = b ? resolveBadgeImageUrl(b.image_url) : null;
            return (
              <View key={`${id}-${idx}`} style={styles.selectedSlot}>
                <View style={styles.selectedThumb}>
                  {uri ? (
                    <BadgeImage uri={uri} style={styles.selectedImg} />
                  ) : (
                    <Ionicons name="ribbon-outline" size={22} color={colors.textMuted} />
                  )}
                </View>
                <View style={styles.selectedReorder}>
                  <TouchableOpacity onPress={() => move(idx, -1)} hitSlop={8} disabled={idx === 0}>
                    <Ionicons name="chevron-up" size={20} color={idx === 0 ? colors.textMuted : colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => move(idx, 1)} hitSlop={8} disabled={idx === order.length - 1}>
                    <Ionicons
                      name="chevron-down"
                      size={20}
                      color={idx === order.length - 1 ? colors.textMuted : colors.text}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      <ScrollView contentContainerStyle={[styles.grid, { paddingHorizontal: pad, paddingBottom: spacing.xl }]}>
        {catalogLoading ? (
          <Text style={styles.empty}>Cargando insignias…</Text>
        ) : sorted.length === 0 ? (
          <Text style={styles.empty}>No hay insignias en el catálogo.</Text>
        ) : (
          <View style={[styles.gridRow, { gap }]}>
            {sorted.map((b) => {
              const uri = resolveBadgeImageUrl(b.image_url);
              const sel = order.includes(b.badge_id);
              return (
                <View key={b.badge_id} style={[styles.cell, { width: cell, height: cell }]}>
                  <Pressable
                    style={StyleSheet.absoluteFillObject}
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
                  {b.unlocked ? (
                    <TouchableOpacity
                      style={styles.pickHit}
                      onPress={() => toggle(b.badge_id)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: sel }}
                    >
                      <Ionicons
                        name={sel ? 'checkmark-circle' : 'ellipse-outline'}
                        size={26}
                        color={sel ? colors.primary : colors.textMuted}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <UIButton
          title={saveMut.isPending ? 'Guardando…' : 'Guardar'}
          variant="primary"
          size="lg"
          disabled={saveMut.isPending}
          onPress={() => saveMut.mutate(order)}
        />
      </View>

      <BadgeDetailModal visible={!!detail} badge={detail} onClose={closeDetail} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  subheading: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  selectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  selectedEmpty: { ...typography.caption, color: colors.textMuted },
  selectedSlot: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  selectedThumb: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedImg: { width: '88%', height: '88%' },
  selectedReorder: { justifyContent: 'center', gap: 2 },
  grid: { paddingTop: spacing.xs },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    position: 'relative',
  },
  cellInner: {
    flex: 1,
    minHeight: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  cellImage: { width: '85%', height: '85%' },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickHit: {
    position: 'absolute',
    right: 4,
    top: 4,
    zIndex: 2,
    backgroundColor: `${colors.background}E6`,
    borderRadius: 14,
  },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
  footer: { paddingHorizontal: spacing.md },
});
