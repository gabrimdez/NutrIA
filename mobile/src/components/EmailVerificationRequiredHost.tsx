import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { authPost } from '../lib/api';
import {
  hideEmailVerificationRequired,
  useEmailVerificationRequiredState,
} from '../lib/emailVerificationRequired';
import { useAuthStore } from '../store/authStore';
import { borderRadius, colors, spacing, typography } from '../theme';

type MessageResponse = { message: string };

export function EmailVerificationRequiredHost() {
  const { visible, message } = useEmailVerificationRequiredState();
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    if (!user?.email || status === 'sending') return;
    setStatus('sending');
    setError(null);
    try {
      await authPost<MessageResponse>('/api/v1/auth/email/resend-verification', { email: user.email });
      setStatus('sent');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'No se pudo enviar el email.');
    }
  }

  function close() {
    setStatus('idle');
    setError(null);
    hideEmailVerificationRequired();
  }

  function goToLogin() {
    close();
    router.replace('/auth/login' as never);
  }

  const resendLabel =
    status === 'sending' ? 'Enviando...' : status === 'sent' ? 'Email enviado' : 'Reenviar email';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.iconWrap}>
            <Ionicons name="mail-unread-outline" size={30} color={colors.primaryLight} />
          </View>
          <Text style={styles.title}>Verifica tu email</Text>
          <Text style={styles.message}>
            {message} Te hemos enviado un enlace de verificación a {user?.email ?? 'tu email'}.
          </Text>
          {status === 'sent' ? (
            <Text style={styles.success}>Revisa tu bandeja de entrada y la carpeta de spam.</Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={resend}
            disabled={!user?.email || status === 'sending'}
            accessibilityRole="button"
            accessibilityLabel={resendLabel}
            style={({ pressed }) => [
              styles.primaryBtn,
              (!user?.email || status === 'sending') && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="send" size={16} color={colors.white} />
            <Text style={styles.primaryText}>{resendLabel}</Text>
          </Pressable>

          <Pressable
            onPress={goToLogin}
            accessibilityRole="button"
            accessibilityLabel="Ir a iniciar sesión"
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>Ya lo verifiqué</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 10, 14, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.4,
        shadowRadius: 28,
      },
      android: { elevation: 14 },
      default: {},
    }),
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  success: {
    ...typography.caption,
    color: colors.primaryLight,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  primaryText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  secondaryBtn: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  secondaryText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.75 },
});
