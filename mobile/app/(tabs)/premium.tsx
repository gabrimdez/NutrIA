import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
  Platform,
  Linking,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api } from '../../src/lib/api';
import { isNonPremiumTier } from '../../src/lib/planAiPremiumGate';
import { GradientButton, ScreenFocusProvider, SlideUpView } from '../../src/components';
import {
  PREMIUM_ANNUAL_PRICE,
  PREMIUM_ANNUAL_SUBTITLE,
  PREMIUM_MONTHLY_PRICE,
  PREMIUM_MONTHLY_SUBTITLE,
  PREMIUM_PRODUCT_NAME,
} from '../../src/constants/premiumMarketing';
import {
  borderRadius,
  colors,
  DOCK_H,
  DOCK_MARGIN_BOTTOM,
  screenPaddingX,
  spacing,
  typography,
} from '../../src/theme';
import { Profile } from '../../src/types';

const SUB_MANAGE_URL = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
  default: 'https://play.google.com/store/account/subscriptions',
});

const FEATURES = [
  {
    n: '01',
    title: 'Coach con memoria',
    body: 'Sabe lo que comiste, lo que entrenas y cómo te sientes. Te responde como un nutricionista, no como una FAQ.',
  },
  {
    n: '02',
    title: 'Escáner sin contar',
    body: 'Foto a tu plato o un código de barras. Sin "te quedan 2 escaneos este mes".',
  },
  {
    n: '03',
    title: 'Plan que se adapta',
    body: 'Si te sales del plan un día, se rehace solo.',
  },
] as const;

type BillingPlan = 'annual' | 'monthly';

export default function PremiumPaywallTab() {
  const insets = useSafeAreaInsets();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>('annual');

  const { data: profile, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/api/v1/me/profile'),
  });

  const isFree = isNonPremiumTier(profile?.subscription_tier);

  const openManage = useCallback(() => {
    router.push('/profile/subscription' as never);
  }, []);

  const tryOpenStore = useCallback(() => {
    void Linking.openURL(SUB_MANAGE_URL).catch(() => {});
  }, []);

  const selectedPrice = selectedPlan === 'annual' ? PREMIUM_ANNUAL_PRICE : PREMIUM_MONTHLY_PRICE;
  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 18;

  return (
    <ScreenFocusProvider>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, spacing.lg), paddingBottom: bottomPad },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.65 }]}
            accessibilityRole="button"
            accessibilityLabel="Cerrar Premium"
          >
            <Ionicons name="close" size={20} color={colors.whiteOverlay} />
          </Pressable>
          <Pressable
            onPress={openManage}
            style={({ pressed }) => [styles.restoreButton, pressed && { opacity: 0.65 }]}
            accessibilityRole="button"
            accessibilityLabel="Restaurar suscripción"
          >
            <Text style={styles.restoreText}>Restaurar</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.kicker}>{PREMIUM_PRODUCT_NAME}</Text>
          <Text style={styles.h1}>
            Tu nutrición,{'\n'}sin <Text style={styles.h1Accent}>límites.</Text>
          </Text>
          <Text style={styles.lead}>
            IA que conoce tu plan, escáner sin límites, recetas que sí encajan con tu objetivo. Una sola app, todo
            sin límites.
          </Text>
        </View>

        <SlideUpView delay={50} duration={420} distance={12}>
          <View style={styles.featureList}>
            {FEATURES.map((feature, index) => (
              <View
                key={feature.n}
                style={[styles.featureRow, index === FEATURES.length - 1 && styles.featureRowLast]}
              >
                <Text style={styles.featureNumber}>{feature.n}</Text>
                <View style={styles.featureCopy}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureBody}>{feature.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </SlideUpView>

        {isFree ? (
          <SlideUpView delay={110} duration={400} distance={10}>
            <View style={styles.planStack}>
              <PlanOption
                selected={selectedPlan === 'annual'}
                title="Anual"
                subtitle={PREMIUM_ANNUAL_SUBTITLE}
                price={PREMIUM_ANNUAL_PRICE}
                badge="MEJOR VALOR"
                onPress={() => setSelectedPlan('annual')}
              />
              <PlanOption
                selected={selectedPlan === 'monthly'}
                title="Mensual"
                subtitle={PREMIUM_MONTHLY_SUBTITLE}
                price={PREMIUM_MONTHLY_PRICE}
                onPress={() => setSelectedPlan('monthly')}
              />
            </View>

            <GradientButton
              title={`Empezar ahora por ${selectedPrice}`}
              onPress={() => setCheckoutOpen(true)}
              icon={<Ionicons name="checkmark" size={18} color={colors.white} />}
            />

            <Pressable
              onPress={() => router.push('/profile/premium' as never)}
              style={({ pressed }) => [styles.compareLink, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Text style={styles.compareLinkText}>Comparar Gratis y Premium en detalle</Text>
            </Pressable>
          </SlideUpView>
        ) : (
          <SlideUpView delay={110} duration={400} distance={10}>
            <View style={styles.activeCard}>
              <View style={styles.activeIcon}>
                <Ionicons name="checkmark" size={18} color={colors.black} />
              </View>
              <View style={styles.activeCopy}>
                <Text style={styles.activeTitle}>Premium activo</Text>
                <Text style={styles.activeBody}>
                  Tu cuenta ya tiene uso ilimitado. Puedes revisar renovación, facturas o cancelación desde la tienda.
                </Text>
              </View>
            </View>
            <GradientButton title="Gestionar mi suscripción" onPress={openManage} />
            <Pressable
              onPress={tryOpenStore}
              style={({ pressed }) => [styles.compareLink, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Text style={styles.compareLinkText}>
                Abrir suscripciones en {Platform.OS === 'ios' ? 'App Store' : 'Google Play'}
              </Text>
            </Pressable>
          </SlideUpView>
        )}
      </ScrollView>

      <Modal
        visible={checkoutOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCheckoutOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCheckoutOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Cobro in-app</Text>
            <Text style={styles.modalBody}>
              La suscripción se formalizará con Apple o Google en los términos de la tienda. Estamos cerrando el enlace
              a los productos in-app; mientras tanto puedes preparar el alta en el dispositivo o revisar tu plan actual.
            </Text>
            <GradientButton
              title="Gestionar suscripción"
              onPress={() => {
                setCheckoutOpen(false);
                openManage();
              }}
            />
            <Pressable
              onPress={tryOpenStore}
              style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="storefront-outline" size={16} color={colors.primaryLight} />
              <Text style={styles.ghostBtnText}>Ir a la tienda de suscripciones</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setCheckoutOpen(false);
                void refetch();
              }}
              style={({ pressed }) => [styles.dismiss, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.dismissText}>Cerrar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenFocusProvider>
  );
}

function PlanOption({
  selected,
  title,
  subtitle,
  price,
  badge,
  onPress,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  price: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.planOption,
        selected && styles.planOptionSelected,
        pressed && { opacity: 0.82 },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <Ionicons name="checkmark" size={14} color={colors.black} /> : null}
      </View>
      <View style={styles.planCopy}>
        <View style={styles.planTitleRow}>
          <Text style={styles.planTitle}>{title}</Text>
          {badge ? (
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.planSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.planPrice}>{price}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020806' },
  content: { paddingHorizontal: screenPaddingX + 4 },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xxxl,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  restoreButton: { paddingVertical: spacing.sm, paddingLeft: spacing.md },
  restoreText: { ...typography.captionBold, color: colors.textMuted },
  hero: { marginBottom: spacing.xxxl },
  kicker: { ...typography.captionBold, color: colors.primary, marginBottom: spacing.sm },
  h1: {
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '800',
    color: colors.white,
    marginBottom: spacing.md,
  },
  h1Accent: { color: colors.primary },
  lead: {
    ...typography.body,
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 22,
    maxWidth: 360,
  },
  featureList: { marginBottom: spacing.xxl },
  featureRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  featureRowLast: { borderBottomWidth: 0 },
  featureNumber: {
    ...typography.captionBold,
    width: 28,
    color: colors.primary,
    fontWeight: '800',
  },
  featureCopy: { flex: 1, minWidth: 0 },
  featureTitle: { ...typography.bodyBold, color: colors.white, fontSize: 16, marginBottom: 4 },
  featureBody: { ...typography.caption, color: 'rgba(255,255,255,0.56)', lineHeight: 19 },
  planStack: { gap: spacing.sm, marginBottom: spacing.xl },
  planOption: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  planOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(16,185,129,0.14)',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  planCopy: { flex: 1, minWidth: 0 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  planTitle: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
  planBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  planBadgeText: { ...typography.micro, color: colors.black, fontWeight: '900' },
  planSubtitle: { ...typography.small, color: 'rgba(255,255,255,0.52)', marginTop: 2 },
  planPrice: { ...typography.bodyBold, color: colors.white, fontSize: 17, textAlign: 'right' },
  compareLink: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.sm },
  compareLinkText: { ...typography.captionBold, color: colors.primaryLight, textAlign: 'center' },
  activeCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: 'rgba(16,185,129,0.12)',
    marginBottom: spacing.xl,
  },
  activeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCopy: { flex: 1, minWidth: 0 },
  activeTitle: { ...typography.bodyBold, color: colors.white, marginBottom: 4 },
  activeBody: { ...typography.caption, color: 'rgba(255,255,255,0.68)', lineHeight: 20 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    backgroundColor: '#07100D',
    borderRadius: borderRadius.xxl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  modalTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  modalBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
    textAlign: 'center',
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  ghostBtnText: { ...typography.captionBold, color: colors.primaryLight, textAlign: 'center' },
  dismiss: { alignSelf: 'center', marginTop: spacing.xs, padding: spacing.sm },
  dismissText: { ...typography.captionBold, color: colors.textMuted },
});
