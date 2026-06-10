import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { authPost } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { blurActiveElementOnWeb } from '../../src/lib/webFocus';
import { Button } from '../../src/components';
import { AuthBackgroundImage } from '../../src/components/AuthBackgroundImage';
import {
  authFotoGradientColors,
  authFotoGradientLocations,
  colors,
  screenPaddingX,
  spacing,
  typography,
} from '../../src/theme';

type MessageResponse = { message: string };

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = useMemo(() => {
    const raw = params.token;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.token]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleVerify() {
    if (!token) {
      Alert.alert('Enlace no válido', 'Solicita un nuevo enlace de verificación.');
      return;
    }
    setLoading(true);
    try {
      await authPost<MessageResponse>('/api/v1/auth/email/verify', { token });
      setDone(true);
      blurActiveElementOnWeb();
    } catch (e) {
      Alert.alert('No se pudo verificar', toUserFacingErrorMessage(e, 'Solicita un nuevo enlace.'));
    } finally {
      setLoading(false);
    }
  }

  function goToLogin() {
    blurActiveElementOnWeb();
    router.replace('/auth/login');
  }

  return (
    <View style={styles.bg}>
      <AuthBackgroundImage />
      <LinearGradient
        colors={[...authFotoGradientColors]}
        locations={[...authFotoGradientLocations]}
        style={styles.gradient}
      >
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.spacer} />
            <View style={styles.header}>
              <Text style={styles.title}>Verificar email</Text>
              <Text style={styles.subtitle}>
                Confirma tu cuenta para activar las funciones de NutrIA.
              </Text>
            </View>

            <View style={styles.form}>
              {done ? (
                <Text style={styles.success}>Tu email se ha verificado correctamente.</Text>
              ) : (
                <Button title="Verificar email" onPress={handleVerify} loading={loading} showArrow size="lg" />
              )}
            </View>

            <Pressable onPress={goToLogin} accessibilityRole="link" style={styles.link}>
              <Text style={styles.linkText}>Ir a iniciar sesion</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.background },
  gradient: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: screenPaddingX,
    paddingBottom: spacing.xxxl,
  },
  spacer: { flex: 1, minHeight: 80 },
  header: { marginBottom: spacing.xxl },
  title: { ...typography.h1, color: colors.white },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  form: { marginBottom: spacing.xxl },
  success: { ...typography.body, color: colors.white, lineHeight: 24 },
  link: { alignSelf: 'center', padding: spacing.sm },
  linkText: { ...typography.body, color: colors.primaryLight, fontWeight: '600' },
});
