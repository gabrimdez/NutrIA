import { Stack, router } from 'expo-router';
import { Platform, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../src/theme';

function goBackFromProfile() {
  // En web, el historial del navegador a veces sí tiene paso atrás aunque `canGoBack()` falle, o
  // `router.back()` no dispare (GO_BACK); priorizamos `history` cuando haya pila.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history.length > 1) {
    window.history.back();
    return;
  }
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/(tabs)/profile' as never);
}

function BackButton() {
  const size = 24;
  // En web, un carácter evita el icono como texto (fuentes) que a veces no dispara onPress o intercepta clics.
  const label =
    Platform.OS === 'web' ? (
      <Text
        style={{
          color: colors.text,
          fontSize: size,
          lineHeight: size,
          fontWeight: '600',
          fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
          userSelect: 'none',
        }}
        selectable={false}
      >
        ←
      </Text>
    ) : (
      <Ionicons name="arrow-back" size={size} color={colors.text} />
    );

  return (
    <Pressable
      onPress={goBackFromProfile}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={({ pressed }) => [
        {
          marginLeft: spacing.sm,
          marginRight: spacing.sm,
          minWidth: 44,
          minHeight: 44,
          justifyContent: 'center',
          alignItems: 'center',
        },
        Platform.OS === 'web' && { cursor: 'pointer' as const, zIndex: 1 },
        pressed && Platform.OS === 'web' && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Volver"
    >
      {label}
    </Pressable>
  );
}

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text, fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        headerLeft: () => <BackButton />,
      }}
    >
      <Stack.Screen name="edit" options={{ title: 'Editar perfil' }} />
      <Stack.Screen name="edit-goals" options={{ title: 'Mis objetivos' }} />
      <Stack.Screen name="weight-history" options={{ title: 'Historial de peso' }} />
      <Stack.Screen name="settings" options={{ title: 'Configuración' }} />
      <Stack.Screen name="subscription" options={{ title: 'Mi suscripción' }} />
      <Stack.Screen name="wearables" options={{ headerShown: false }} />
      <Stack.Screen name="premium" options={{ title: 'Premium' }} />
      <Stack.Screen name="food-restrictions" options={{ title: 'Restricciones alimentarias' }} />
      <Stack.Screen name="injuries" options={{ title: 'Lesiones y limitaciones' }} />
      <Stack.Screen
        name="injury-detail"
        options={{ title: 'Detalle' }}
      />
      <Stack.Screen name="badges" options={{ title: 'Insignias' }} />
      <Stack.Screen name="badges-featured" options={{ title: 'Elegir insignias' }} />
    </Stack>
  );
}
