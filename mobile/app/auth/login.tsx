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
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
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
  authFotoGradientColors,
  authFotoGradientLocations,
} from '../../src/theme';

type TokenResponse = {
  access_token: string;
  refresh_token?: string | null;
  user: { id: string; email: string };
};

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberSession, setRememberSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  const googleClientId =
    Platform.select({
      ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    }) ||
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    '';

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    clientId: googleClientId || 'missing-google-client-id',
    scopes: ['openid', 'profile', 'email'],
  });

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

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const idToken = googleResponse.params?.id_token;
    if (!idToken) {
      Alert.alert('Google', 'No se pudo obtener la sesión de Google.');
      return;
    }
    void handleSocialLogin('google', idToken);
  }, [googleResponse]);

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

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Campos requeridos', 'Introduce tu email y contraseña para continuar.');
      return;
    }
    setLoading(true);
    try {
      const data = await authPost<TokenResponse>('/api/v1/auth/login', { email, password, remember_me: rememberSession });
      const sessionToken = Platform.OS === 'web' ? WEB_COOKIE_SESSION_TOKEN : data.access_token;
      await saveAuth(sessionToken, data.user, data.refresh_token ?? null);
      useAuthStore.getState().setAuth(sessionToken, data.user, data.refresh_token ?? null);
      blurActiveElementOnWeb();
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('No se pudo iniciar sesión', toUserFacingErrorMessage(e, 'Comprueba tu conexión e inténtalo de nuevo.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialLogin(provider: 'google' | 'apple', idToken: string, displayName?: string) {
    setSocialLoading(provider);
    try {
      const data = await authPost<TokenResponse>(`/api/v1/auth/oauth/${provider}`, {
        id_token: idToken,
        remember_me: rememberSession,
        display_name: displayName,
      });
      const sessionToken = Platform.OS === 'web' ? WEB_COOKIE_SESSION_TOKEN : data.access_token;
      await saveAuth(sessionToken, data.user, data.refresh_token ?? null);
      useAuthStore.getState().setAuth(sessionToken, data.user, data.refresh_token ?? null);
      blurActiveElementOnWeb();
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert(
        provider === 'google' ? 'Google' : 'Apple',
        toUserFacingErrorMessage(e, 'No se pudo iniciar sesión.'),
      );
    } finally {
      setSocialLoading(null);
    }
  }

  async function handleGoogleLogin() {
    if (!googleClientId) {
      Alert.alert('Google', 'Falta configurar el cliente de Google.');
      return;
    }
    await promptGoogleAsync();
  }

  async function handleAppleLogin() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        Alert.alert('Apple', 'No se pudo obtener la sesión de Apple.');
        return;
      }
      const displayName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      await handleSocialLogin('apple', credential.identityToken, displayName || undefined);
    } catch (e) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code?: string }).code) : '';
      if (code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple', toUserFacingErrorMessage(e, 'No se pudo iniciar sesión con Apple.'));
      }
    }
  }

  function goToRegister() {
    blurActiveElementOnWeb();
    router.replace('/auth/register');
  }

  function goToForgotPassword() {
    blurActiveElementOnWeb();
    router.push('/auth/forgot-password');
  }

  return (
    <View style={styles.bg}>
      <AuthBackgroundImage animatedStyle={bgAnimStyle} />

      <LinearGradient
        colors={[...authFotoGradientColors]}
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
              <Text style={styles.subtitle}>Tu nutrición inteligente, simplificada.</Text>
            </Animated.View>

            <Animated.View style={[styles.form, formAnimStyle]}>
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
                placeholder="Introduce tu contraseña"
                secureTextEntry
                hint="Mínimo 6 caracteres"
              />

              <Pressable onPress={goToForgotPassword} accessibilityRole="link" style={styles.forgotLink}>
                <Text style={styles.forgotText}>He olvidado mi contrasena</Text>
              </Pressable>

              <Pressable
                onPress={() => setRememberSession((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberSession }}
                style={styles.rememberRow}
              >
                <Ionicons
                  name={rememberSession ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={rememberSession ? colors.primaryLight : colors.textSecondary}
                />
                <Text style={styles.rememberText}>Mantener sesión iniciada</Text>
              </Pressable>

              <Button
                title="Iniciar sesión"
                onPress={handleLogin}
                loading={loading}
                showArrow
                size="lg"
              />

              <View style={styles.socialBlock}>
                <Pressable
                  onPress={handleGoogleLogin}
                  disabled={socialLoading !== null || !googleRequest}
                  style={({ pressed }) => [
                    styles.socialBtn,
                    pressed && styles.socialBtnPressed,
                    (socialLoading !== null || !googleRequest) && styles.socialBtnDisabled,
                  ]}
                >
                  <Ionicons name="logo-google" size={20} color={colors.text} />
                  <Text style={styles.socialBtnText}>
                    {socialLoading === 'google' ? 'Conectando…' : 'Continuar con Google'}
                  </Text>
                </Pressable>

                {appleAvailable ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={8}
                    style={styles.appleBtn}
                    onPress={() => {
                      void handleAppleLogin();
                    }}
                  />
                ) : null}
              </View>
            </Animated.View>

            <Animated.View style={[styles.footer, footerAnimStyle]}>
              <Pressable onPress={goToRegister} accessibilityRole="link" style={styles.link}>
                <Text style={styles.linkText}>
                  ¿No tienes cuenta?{' '}
                  <Text style={styles.linkBold}>Regístrate</Text>
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
  forgotLink: { alignSelf: 'flex-end', paddingVertical: spacing.xs, marginBottom: spacing.md },
  forgotText: { ...typography.caption, color: colors.primaryLight, fontWeight: '600' },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  rememberText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  socialBlock: { gap: spacing.sm, marginTop: spacing.md },
  socialBtn: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  socialBtnPressed: { opacity: 0.86 },
  socialBtnDisabled: { opacity: 0.55 },
  socialBtnText: { ...typography.bodyBold, color: colors.text },
  appleBtn: { width: '100%', height: 52 },
  link: { padding: spacing.sm },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkBold: { color: colors.primaryLight, fontWeight: '600' },
});
