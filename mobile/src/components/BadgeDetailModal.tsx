import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BadgeCatalogItem } from '../types/badges';
import { formatUnlockDate } from '../lib/formatUnlockDate';
import { resolveBadgeImageUrl } from '../lib/badgeImageUrl';
import { getReadableBadgeCriteria, getReadableBadgeDescription } from '../lib/badgeText';
import { BADGE_RARITY_LABELS } from '../lib/badgeLabels';
import { colors, spacing, typography, borderRadius, hairlineWidth } from '../theme';
import { UIButton } from './ui';
import { BadgeImage } from './BadgeImage';

type Props = {
  visible: boolean;
  badge: BadgeCatalogItem | null;
  onClose: () => void;
};

export function BadgeDetailModal({ visible, badge, onClose }: Props) {
  const open = visible && !!badge;
  const uri = badge ? resolveBadgeImageUrl(badge.image_url) : null;
  const criteriaText = badge ? getReadableBadgeCriteria(badge) : '';
  const descriptionText = badge ? getReadableBadgeDescription(badge) : '';

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={styles.card}>
          {badge ? (
            <>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.imageWrap}>
                  {uri ? (
                    <BadgeImage uri={uri} style={styles.image} />
                  ) : (
                    <Ionicons name="ribbon-outline" size={48} color={colors.textMuted} />
                  )}
                  {!badge.unlocked ? (
                    <View style={styles.lockedOverlay}>
                      <Ionicons name="lock-closed" size={22} color={colors.white} />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.name}>{badge.name}</Text>
                <Text style={styles.rarity}>{BADGE_RARITY_LABELS[badge.rarity] ?? badge.rarity}</Text>
                {badge.unlocked && badge.unlocked_at ? (
                  <>
                    <Text style={styles.sectionLabel}>Desbloqueada</Text>
                    <Text style={styles.sectionBody}>{formatUnlockDate(badge.unlocked_at)}</Text>
                  </>
                ) : null}
                <Text style={styles.sectionLabel}>Cómo conseguirla</Text>
                <Text style={styles.sectionBody}>{criteriaText}</Text>
                <Text style={styles.sectionLabel}>Descripción</Text>
                <Text style={styles.sectionBody}>{descriptionText}</Text>
              </ScrollView>
              <UIButton variant="secondary" title="Cerrar" size="md" onPress={onClose} style={styles.closeBtn} />
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '88%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.xl,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    ...Platform.select({
      web: { boxShadow: '0 16px 48px rgba(0,0,0,0.45)' },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      android: { elevation: 14 },
      default: {},
    }),
  },
  scroll: { maxHeight: 420 },
  scrollContent: { paddingBottom: spacing.sm },
  imageWrap: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    borderRadius: borderRadius.lg,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  image: { width: '100%', height: '100%' },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.sectionTitle, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  rarity: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  sectionBody: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  closeBtn: { marginTop: spacing.sm },
});
