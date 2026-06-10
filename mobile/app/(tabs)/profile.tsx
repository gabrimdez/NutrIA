import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  Image,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WEB_COOKIE_SESSION_TOKEN, api, getCsrfHeaders } from '../../src/lib/api';
import { getApiBaseUrl, normalizeBackendAssetUrl } from '../../src/lib/appEnv';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { clearAuth, refreshAuth } from '../../src/lib/authStorage';
import { prefetchBadgeCatalogs } from '../../src/lib/badgeCatalog';
import { queryClient } from '../../src/lib/queryClient';
import { useAuthStore } from '../../src/store/authStore';
import { LoadingScreen, Surface, SlideUpView, StaggerItem, ScreenFocusProvider, UIButton } from '../../src/components';
import { colors, spacing, typography, screenPaddingX, hairlineWidth, iconSize, borderRadius, DOCK_H, DOCK_MARGIN_BOTTOM } from '../../src/theme';
import { Profile, DayDiary, ActiveGoal, ActivityLevel } from '../../src/types';
import { FeaturedBadgeSlot } from '../../src/types/badges';
import { resolveBadgeImageUrl } from '../../src/lib/badgeImageUrl';
import { BadgeImage } from '../../src/components/BadgeImage';

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentario',
  light: 'Ligero',
  moderate: 'Moderado',
  active: 'Activo',
  very_active: 'Muy activo',
};

const GOAL_TYPE_LABELS: Record<string, string> = {
  lose_fat: 'Perder grasa',
  maintain: 'Mantener',
  gain_muscle: 'Ganar músculo',
  recomposition: 'Recomposición',
};

function initials(name: string, email?: string): string {
  const n = name.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

function buildAvatarFullUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('http')) return normalizeBackendAssetUrl(avatarUrl);
  const path = avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`;
  return normalizeBackendAssetUrl(`${getApiBaseUrl()}${path}`);
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { user, signOut } = useAuthStore();
  const today = new Date().toISOString().split('T')[0];
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);
  const [avatarImageLoaded, setAvatarImageLoaded] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const avatarScale = useSharedValue(0.6);
  const avatarOpacity = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      avatarScale.value = 0.6;
      avatarOpacity.value = 0;
      setAvatarImageFailed(false);
      void queryClient.invalidateQueries({ queryKey: ['badges-featured'] });
      const t = setTimeout(() => {
        avatarScale.value = withSpring(1, {
          damping: 28,
          stiffness: 220,
          mass: 0.85,
          overshootClamping: true,
        });
        avatarOpacity.value = withTiming(1, { duration: 400 });
      }, 200);
      return () => clearTimeout(t);
    }, [avatarScale, avatarOpacity, queryClient]),
  );

  const avatarAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
    opacity: avatarOpacity.value,
  }));

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/api/v1/me/profile'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (profile === undefined) return;
    setAvatarImageFailed(false);
    setAvatarImageLoaded(false);
    setAvatarUri(profile.avatar_url ? buildAvatarFullUrl(profile.avatar_url) : null);
  }, [profile]);

  const { data: activeGoal } = useQuery({
    queryKey: ['active-goal'],
    queryFn: () => api.get<ActiveGoal>('/api/v1/me/goal'),
    enabled: !!profile,
  });

  const { data: featuredBadges } = useQuery({
    queryKey: ['badges-featured'],
    queryFn: () => api.get<FeaturedBadgeSlot[]>('/api/v1/me/badges/featured'),
    enabled: !!profile,
  });

  const { data: diaryToday } = useQuery({
    queryKey: ['diary', today],
    queryFn: () => api.get<DayDiary>(`/api/v1/diary/day?date=${today}`),
    enabled: !!profile,
  });

  const warmBadges = useCallback(() => {
    void prefetchBadgeCatalogs(queryClient);
  }, []);

  useEffect(() => {
    if (!profile) return;
    warmBadges();
  }, [profile, warmBadges]);

  const performSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);

    try {
      queryClient.clear();
      await clearAuth();
      signOut();
      // `dismissAll` encola POP_TO_TOP; en el raíz/tabs a menudo no hay quien lo maneje (warning en dev).
      if (router.canDismiss()) {
        router.dismissAll();
      }
      router.replace('/auth/login');
    } catch {
      setSigningOut(false);
      Alert.alert('Error', 'No se pudo cerrar sesión. Inténtalo de nuevo.');
    }
  };

  const closeAvatarModal = () => setAvatarModalOpen(false);

  const pickNewAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permiso de galería',
        'Para cambiar tu foto de perfil, permite acceso a tus fotos en el dispositivo.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const token = useAuthStore.getState().session?.access_token;
      if (!token) throw new Error('Sin sesión');

      const form = new FormData();
      const fileName = asset.fileName || 'avatar.jpg';
      const mimeType = asset.mimeType || 'image/jpeg';

      if (Platform.OS === 'web') {
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        form.append('file', blob, fileName);
      } else {
        form.append('file', {
          uri: asset.uri,
          name: fileName,
          type: mimeType,
        } as unknown as Blob);
      }

      const buildUploadOptions = (accessToken: string): RequestInit => {
        const uploadOptions: RequestInit = {
          method: 'POST',
          body: form,
          credentials: Platform.OS === 'web' ? 'include' : 'same-origin',
        };
        if (!(Platform.OS === 'web' && accessToken === WEB_COOKIE_SESSION_TOKEN)) {
          uploadOptions.headers = { Authorization: `Bearer ${accessToken}` };
        } else {
          uploadOptions.headers = getCsrfHeaders();
        }
        return uploadOptions;
      };

      let uploadResp = await fetch(`${getApiBaseUrl()}/api/v1/me/avatar`, buildUploadOptions(token));
      if (uploadResp.status === 401) {
        const refreshed = await refreshAuth();
        if (refreshed) {
          useAuthStore.getState().setAuth(refreshed.token, refreshed.user, refreshed.refreshToken);
          uploadResp = await fetch(`${getApiBaseUrl()}/api/v1/me/avatar`, buildUploadOptions(refreshed.token));
        } else {
          useAuthStore.getState().signOut();
          throw new Error('Tu sesión ha expirado. Inicia sesión de nuevo.');
        }
      }

      if (!uploadResp.ok) {
        const err = await uploadResp.json().catch(() => ({ detail: 'Error al subir' }));
        throw new Error(typeof err.detail === 'string' ? err.detail : 'Error al subir la imagen');
      }

      const { avatar_url } = (await uploadResp.json()) as { avatar_url: string };
      setAvatarImageFailed(false);
      setAvatarUri(buildAvatarFullUrl(avatar_url));
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch (e: unknown) {
      Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo subir la imagen.'));
    } finally {
      setUploading(false);
    }
  };

  const clearAvatar = async () => {
    setUploading(true);
    try {
      await api.delete('/api/v1/me/avatar');
      setAvatarUri(null);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch {
      Alert.alert('Error', 'No se pudo eliminar la foto.');
    } finally {
      setUploading(false);
      closeAvatarModal();
    }
  };

  const handleSignOut = () => {
    if (signingOut) return;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('¿Seguro que quieres cerrar sesión?')) {
        void performSignOut();
      }
      return;
    }
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => {
          void performSignOut();
        },
      },
    ]);
  };

  const handleOpenFeaturedBadges = useCallback(() => {
    warmBadges();
    router.push('/profile/badges-featured');
  }, [warmBadges]);

  const handleOpenBadges = useCallback(() => {
    warmBadges();
    router.push('/profile/badges');
  }, [warmBadges]);

  if (isLoading) return <LoadingScreen />;

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Usuario';
  const email = user?.email || '';
  const year = new Date().getFullYear();
  const age =
    profile?.birth_year != null && profile.birth_year > 1900 ? `${year - profile.birth_year} años` : '—';

  const activityLabel = activeGoal?.activity_level
    ? ACTIVITY_LABELS[activeGoal.activity_level] ?? activeGoal.activity_level
    : '—';

  const targetKcalNum = diaryToday?.target_kcal != null ? Math.round(diaryToday.target_kcal) : null;

  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16;
  const modalCardWidth = Math.min(360, windowWidth * 0.88);
  const previewSize = Math.min(240, modalCardWidth - spacing.lg * 2);

  const menuItems = [
    { icon: 'create-outline' as const, label: 'Editar perfil', onPress: () => router.push('/profile/edit') },
    { icon: 'card-outline' as const, label: 'Mi suscripción', onPress: () => router.push('/profile/subscription') },
    { icon: 'analytics-outline' as const, label: 'Historial de peso', onPress: () => router.push('/profile/weight-history') },
    { icon: 'settings-outline' as const, label: 'Configuración', onPress: () => router.push('/profile/settings') },
  ];

  return (
    <ScreenFocusProvider>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top, spacing.md) + spacing.sm, paddingBottom: bottomPad },
      ]}
    >
      <SlideUpView delay={80} duration={480} distance={20}>
        <View style={styles.hero}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setAvatarModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Ver o cambiar foto de perfil"
          >
            <Animated.View style={[styles.avatarWrap, avatarAnimStyle]}>
              <View style={styles.avatar}>
                {/* Iniciales siempre presentes como fallback; la imagen las cubre al cargar */}
                <Text style={styles.avatarText}>{initials(displayName, email)}</Text>
                {avatarUri && !avatarImageFailed ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={[styles.avatarImage, { position: 'absolute', top: 0, left: 0, opacity: avatarImageLoaded ? 1 : 0 }]}
                    onLoad={() => setAvatarImageLoaded(true)}
                    onError={() => setAvatarImageFailed(true)}
                  />
                ) : null}
              </View>
              <View style={styles.avatarStatusDot} />
            </Animated.View>
          </TouchableOpacity>
          <Text style={styles.nameHero}>{displayName}</Text>
          <View style={styles.heroBadgesRow}>
            {[1, 2, 3].map((pos) => {
              const slot = featuredBadges?.find((s) => s.position === pos);
              const uri = resolveBadgeImageUrl(slot?.image_url ?? null);
              return (
                <Pressable
                  key={pos}
                  style={({ pressed }) => [styles.heroBadgeSlot, pressed && { opacity: 0.88 }]}
                  onPress={() => router.push('/profile/badges-featured')}
                  accessibilityRole="button"
                  accessibilityLabel={
                    uri
                      ? `Insignia destacada en posición ${pos}, tocar para cambiar`
                      : `Elegir insignia destacada ${pos} de 3`
                  }
                >
                  {uri ? (
                    <BadgeImage uri={uri} style={styles.heroBadgeSlotImg} />
                  ) : (
                    <Ionicons name="add" size={24} color={colors.textMuted} />
                  )}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.heroBadgeLinks}>
            <TouchableOpacity onPress={handleOpenFeaturedBadges} hitSlop={8}>
              <Text style={styles.heroBadgeLink}>Elegir insignias</Text>
            </TouchableOpacity>
            <Text style={styles.heroBadgeLinkSep}>·</Text>
            <TouchableOpacity onPress={handleOpenBadges} hitSlop={8}>
              <Text style={styles.heroBadgeLink}>Ver todas</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SlideUpView>

      <SlideUpView delay={180} duration={500} distance={22}>
        <View style={styles.statRow}>
          {[
            {
              icon: 'person-outline' as const,
              label: 'Edad',
              value: age,
              href: '/profile/edit' as const,
              a11y: 'Editar perfil',
            },
            {
              icon: 'resize-outline' as const,
              label: 'Altura',
              value: profile?.height_cm != null ? `${Math.round(profile.height_cm)} cm` : '—',
              href: '/profile/edit' as const,
              a11y: 'Editar perfil',
            },
            {
              icon: 'barbell-outline' as const,
              label: 'Peso',
              value: profile?.current_weight_kg != null ? `${profile.current_weight_kg} kg` : '—',
              href: '/profile/weight-history' as const,
              a11y: 'Ver historial de peso',
            },
          ].map((item, idx) => {
            const body = (
              <Surface variant="elevated" padding="md" style={styles.statCard}>
                <View style={styles.statIconCircle}>
                  <Ionicons name={item.icon} size={18} color={colors.primaryLight} />
                </View>
                <Text style={styles.statValue}>{item.value}</Text>
                <Text style={styles.statCaption}>{item.label}</Text>
              </Surface>
            );
            return (
              <StaggerItem key={item.label} index={idx} baseDelay={280} staggerMs={60} distance={14} style={styles.statCardWrap}>
                <Pressable
                  onPress={() => router.push(item.href)}
                  style={({ pressed }) => [styles.statCardPressable, pressed && styles.statCardPressablePressed]}
                  accessibilityRole="button"
                  accessibilityLabel={item.a11y}
                >
                  {body}
                </Pressable>
              </StaggerItem>
            );
          })}
        </View>
      </SlideUpView>

      <SlideUpView delay={260} duration={500} distance={20}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/profile/edit-goals')}
          accessibilityRole="button"
          accessibilityLabel="Editar mis objetivos nutricionales"
        >
          <Surface variant="elevated" padding="lg" style={styles.goalSummaryCard}>
            <View style={styles.goalSummaryHeader}>
              <View style={styles.goalSummaryHeaderLeft}>
                <View style={styles.goalSummaryIcon}>
                  <Ionicons name="flag-outline" size={18} color={colors.primaryLight} />
                </View>
                <Text style={styles.goalSummaryEyebrow}>Mi objetivo</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>

            <View style={styles.goalSummaryPill}>
              <Text style={styles.goalSummaryPillText}>
                {activeGoal?.goal_type ? (GOAL_TYPE_LABELS[activeGoal.goal_type] ?? activeGoal.goal_type) : 'Sin definir'}
              </Text>
            </View>

            <View style={styles.goalSummaryHero}>
              <Text
                style={styles.goalSummaryHeroValue}
                numberOfLines={1}
                allowFontScaling={false}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {targetKcalNum != null ? targetKcalNum.toLocaleString('es-ES') : '—'}
              </Text>
              <Text style={styles.goalSummaryHeroUnit} numberOfLines={1}>
                kcal diarias
              </Text>
            </View>

            <View style={styles.goalSummaryDivider} />

            <View style={styles.goalSummaryRow}>
              <Text style={styles.goalSummaryRowLabel}>Actividad</Text>
              <Text style={styles.goalSummaryRowValue}>{activityLabel}</Text>
            </View>
          </Surface>
        </TouchableOpacity>
      </SlideUpView>

      <SlideUpView delay={300} duration={480} distance={16}>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => router.push('/(tabs)/premium' as never)}
          accessibilityRole="button"
          accessibilityLabel="NutrIA Premium, uso ilimitado de IA y plan"
        >
          <Surface
            variant="elevated"
            padding="lg"
            style={styles.premiumCard}
          >
            <View style={styles.premiumCardRow}>
              <View style={styles.premiumIconWrap}>
                <Ionicons name="sparkles" size={22} color={colors.primaryLight} />
              </View>
              <View style={styles.premiumCardCopy}>
                <Text style={styles.premiumCardKicker}>NutrIA Premium</Text>
                <Text style={styles.premiumCardTitle}>IA ilimitada para tu nutrición</Text>
                <Text style={styles.premiumCardHint}>
                  Chat, visión, planes, recetas y edición avanzada con IA sin cupos para usuarios Premium.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
            </View>
          </Surface>
        </TouchableOpacity>
      </SlideUpView>

      <SlideUpView delay={340} duration={500} distance={18}>
        <Surface variant="subtle" style={styles.menuSurface}>
          {menuItems.map((item, idx) => (
            <React.Fragment key={item.label}>
              {idx > 0 && <View style={styles.menuDivider} />}
              <StaggerItem index={idx} baseDelay={400} staggerMs={45} distance={10}>
                <TouchableOpacity style={styles.menuRow} onPress={item.onPress} activeOpacity={0.85}>
                  <Ionicons name={item.icon} size={iconSize.md} color={colors.text} />
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
                </TouchableOpacity>
              </StaggerItem>
            </React.Fragment>
          ))}
        </Surface>
      </SlideUpView>

      <SlideUpView delay={420} duration={460} distance={12}>
        <Pressable
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          style={({ pressed }) => [
            styles.signOutCard,
            pressed && !signingOut && styles.signOutCardPressed,
            signingOut && styles.signOutCardDisabled,
          ]}
        >
          <View style={styles.signOutIconWrap}>
            {signingOut ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
            )}
          </View>
          <Text style={styles.signOutTitle}>{signingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}</Text>
        </Pressable>
      </SlideUpView>
    </ScrollView>

    <Modal
      visible={avatarModalOpen}
      transparent
      animationType="fade"
      onRequestClose={closeAvatarModal}
    >
      <View style={styles.avatarModalRoot}>
        <Pressable style={styles.avatarModalBackdrop} onPress={closeAvatarModal} />
        <View style={[styles.avatarModalCard, { width: modalCardWidth }]}>
          <Text style={styles.avatarModalTitle}>Foto de perfil</Text>
          <View style={[styles.avatarPreviewWrap, { width: previewSize, height: previewSize }]}>
            <Text style={styles.avatarPreviewInitials}>{initials(displayName, email)}</Text>
            {avatarUri && !avatarImageFailed ? (
              <Image
                source={{ uri: avatarUri }}
                style={[styles.avatarPreviewImage, { position: 'absolute', top: 0, left: 0, opacity: avatarImageLoaded ? 1 : 0 }]}
                onLoad={() => setAvatarImageLoaded(true)}
                onError={() => setAvatarImageFailed(true)}
              />
            ) : null}
          </View>
          <View style={styles.avatarModalDivider} />
          <View style={styles.avatarModalActions}>
            <UIButton
              variant="primary"
              title={uploading ? "Subiendo…" : "Elegir imagen"}
              size="lg"
              disabled={uploading}
              onPress={() => {
                void pickNewAvatar();
              }}
              style={styles.avatarModalBtnFull}
              icon={<Ionicons name="images-outline" size={22} color={colors.white} />}
            />
            {avatarUri ? (
              <UIButton
                variant="dangerOutline"
                title={uploading ? "Eliminando…" : "Quitar foto"}
                size="md"
                disabled={uploading}
                onPress={() => {
                  void clearAvatar();
                }}
                style={styles.avatarModalBtnFull}
                icon={<Ionicons name="trash-outline" size={20} color={colors.error} />}
              />
            ) : null}
            <UIButton
              variant="secondary"
              title="Cerrar"
              size="md"
              onPress={closeAvatarModal}
              style={styles.avatarModalBtnFull}
              icon={<Ionicons name="close-outline" size={22} color={colors.textSecondary} />}
            />
          </View>
        </View>
      </View>
    </Modal>
    </ScreenFocusProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX },

  hero: { alignItems: 'center', marginBottom: spacing.xl, paddingTop: spacing.sm },
  avatarWrap: { alignSelf: 'center', marginBottom: spacing.md, position: 'relative' },
  heroBadgesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    width: '100%',
    maxWidth: 288,
    alignSelf: 'center',
  },
  heroBadgeSlot: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 72,
    borderRadius: borderRadius.md,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroBadgeSlotImg: { width: '88%', height: '88%' },
  heroBadgeLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  heroBadgeLink: { ...typography.caption, color: colors.primaryLight, fontWeight: '600' },
  heroBadgeLinkSep: { ...typography.caption, color: colors.textMuted },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: 'hidden',
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.primaryBorderStrong,
  },
  avatarStatusDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.background,
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: colors.white, letterSpacing: -0.5 },
  avatarImage: { width: 92, height: 92, borderRadius: 46 },
  nameHero: {
    ...Platform.select({
      ios: { fontFamily: 'Georgia' },
      android: { fontFamily: 'serif' },
      default: {},
    }),
    fontSize: 26,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
  },

  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCardWrap: { flex: 1, minWidth: 0 },
  /** Edad/Altura → editar perfil; Peso → historial. El Pressable rellena la columna. */
  statCardPressable: { flex: 1, minWidth: 0 },
  statCardPressablePressed: { opacity: 0.88 },
  statCard: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 112,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  statCaption: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: colors.primaryLight,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  goalSummaryCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  goalSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  goalSummaryHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  goalSummaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalSummaryEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.primaryLight,
    textTransform: 'uppercase',
  },
  goalSummaryPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
    marginBottom: spacing.md,
  },
  goalSummaryPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryLight,
    letterSpacing: 0.2,
  },
  goalSummaryHero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  goalSummaryHeroValue: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.6,
    lineHeight: 38,
    includeFontPadding: false,
    flexShrink: 0,
  },
  goalSummaryHeroUnit: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  goalSummaryDivider: {
    height: hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  goalSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalSummaryRowLabel: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
  goalSummaryRowValue: {
    ...typography.bodyBold,
    fontSize: 13,
    color: colors.text,
  },

  premiumCard: {
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  premiumCardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  premiumIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumCardCopy: { flex: 1, minWidth: 0 },
  premiumCardKicker: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: colors.primaryLight,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  premiumCardTitle: { ...typography.bodyBold, fontSize: 17, color: colors.text, marginBottom: 4 },
  premiumCardHint: { ...typography.caption, color: colors.textSecondary, fontSize: 13 },

  avatarModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  avatarModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
  },
  avatarModalCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...Platform.select({
      web: { boxShadow: '0 16px 48px rgba(0,0,0,0.5)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 24 },
      android: { elevation: 12 },
      default: { boxShadow: '0 16px 48px rgba(0,0,0,0.5)' },
    }),
  },
  avatarModalTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: spacing.lg,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  avatarPreviewWrap: {
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 0,
    borderWidth: 3,
    borderColor: colors.primaryMuted,
  },
  avatarPreviewImage: { width: '100%', height: '100%' },
  avatarPreviewInitials: {
    fontSize: Math.min(72, 240 * 0.28),
    fontWeight: '700',
    color: colors.white,
  },
  avatarModalDivider: {
    alignSelf: 'stretch',
    height: hairlineWidth,
    backgroundColor: colors.border,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  avatarModalActions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  avatarModalBtnFull: {
    width: '100%',
  },
  menuSurface: {
    marginBottom: spacing.xl,
    overflow: 'hidden',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
    minHeight: 62,
  },
  menuLabel: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    flex: 1,
  },
  menuDivider: {
    height: hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: 0,
  },
  signOutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  signOutCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  signOutCardDisabled: {
    opacity: 0.72,
  },
  signOutIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorMuted,
  },
  signOutTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.error,
  },
});
