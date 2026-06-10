import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { authPost, WEB_COOKIE_SESSION_TOKEN } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { saveAuth } from '../../src/lib/authStorage';
import { blurActiveElementOnWeb } from '../../src/lib/webFocus';
import { useAuthStore } from '../../src/store/authStore';
import { Button, Input } from '../../src/components';
import { AuthBackgroundImage } from '../../src/components/AuthBackgroundImage';
import {
  colors,
  spacing,
  typography,
  screenPaddingX,
  authFotoGradientLocations,
  authRegisterFotoGradientColors,
} from '../../src/theme';

type TokenResponse = {
  access_token: string;
  refresh_token?: string | null;
  user: { id: string; email: string };
};

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const bgY = useSharedValue(20);
  const bgScale = useSharedValue(1.08);
  const logoOpacity = useSharedValue(0);
  const logoY = useSharedValue(20);
  const formOpacity = useSharedValue(0);
  const formY = useSharedValue(40);
  const footerOpacity = useSharedValue(0);

  useEffect(() => {
    bgY.value = withTiming(0, { duration: 1200, easing: Easing.out(Easing.cubic) });
    bgScale.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) });

    const t1 = setTimeout(() => {
      logoOpacity.value = withTiming(1, { duration: 600 });
      logoY.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) });
    }, 300);

    const t2 = setTimeout(() => {
      formOpacity.value = withTiming(1, { duration: 500 });
      formY.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) });
    }, 550);

    const t3 = setTimeout(() => {
      footerOpacity.value = withTiming(1, { duration: 400 });
    }, 800);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [bgY, bgScale, logoOpacity, logoY, formOpacity, formY, footerOpacity]);

  const bgAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bgY.value }, { scale: bgScale.value }],
  }));

  const logoAnimStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ translateY: logoY.value }],
  }));

  const formAnimStyle = useAnimatedStyle(() => ({
    opacity: formOpacity.value,
    transform: [{ translateY: formY.value }],
  }));

  const footerAnimStyle = useAnimatedStyle(() => ({
    opacity: footerOpacity.value,
  }));

  async function handleRegister() {
    if (!email || !password) {
      Alert.alert('Campos requeridos', 'Introduce tu email y contraseña para continuar.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Contraseña corta', 'Usa al menos 6 caracteres para mayor seguridad.');
      return;
    }
    setLoading(true);
    try {
      const data = await authPost<TokenResponse>('/api/v1/auth/register', {
        email,
        password,
        display_name: name.trim() || null,
      });
      const sessionToken = Platform.OS === 'web' ? WEB_COOKIE_SESSION_TOKEN : data.access_token;
      await saveAuth(sessionToken, data.user, data.refresh_token ?? null);
      useAuthStore.getState().setAuth(sessionToken, data.user, data.refresh_token ?? null);
      blurActiveElementOnWeb();
      router.replace('/onboarding');
    } catch (e) {
      Alert.alert('No se pudo crear la cuenta', toUserFacingErrorMessage(e, 'Comprueba tu conexión e inténtalo de nuevo.'));
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
      <AuthBackgroundImage animatedStyle={bgAnimStyle} />

      <LinearGradient
        colors={[...authRegisterFotoGradientColors]}
        locations={[...authFotoGradientLocations]}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.spacer} />

            <Animated.View style={[styles.header, logoAnimStyle]}>
              <Text style={styles.logo}>
                <Text style={styles.logoWhite}>Nutr</Text>
                <Text style={styles.logoGreen}>IA</Text>
              </Text>
              <Text style={styles.subtitle}>Crea tu cuenta y comienza hoy.</Text>
            </Animated.View>

            <Animated.View style={[styles.form, formAnimStyle]}>
              <Input
                label="Nombre"
                value={name}
                onChangeText={setName}
                placeholder="Tu nombre"
              />
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="tu@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Input
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                placeholder="Crea una contraseña"
                secureTextEntry
                hint="Mínimo 6 caracteres"
              />

              <Button
                title="Crear cuenta"
                onPress={handleRegister}
                loading={loading}
                showArrow
                size="lg"
              />
            </Animated.View>

            <Animated.View style={[styles.footer, footerAnimStyle]}>
              <Pressable onPress={goToLogin} accessibilityRole="link" style={styles.link}>
                <Text style={styles.linkText}>
                  ¿Ya tienes cuenta?{' '}
                  <Text style={styles.linkBold}>Inicia sesión</Text>
                </Text>
              </Pressable>
            </Animated.View>
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
  spacer: { flex: 1, minHeight: 60 },
  header: { marginBottom: spacing.xxxl },
  logo: { fontSize: 38, fontWeight: '700', letterSpacing: -1 },
  logoWhite: { color: colors.white },
  logoGreen: { color: colors.primaryLight },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  form: { marginBottom: spacing.xxl },
  footer: { alignItems: 'center' },
  link: { padding: spacing.sm },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkBold: { color: colors.primaryLight, fontWeight: '600' },
});
