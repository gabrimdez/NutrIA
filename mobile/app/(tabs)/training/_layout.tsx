import React from 'react';
import { Pressable, StyleSheet, Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../src/theme';

export default function TrainingLayout() {
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        headerBackTitleVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        gestureEnabled: true,
        ...(Platform.OS === 'ios' ? { headerBackTitle: '', fullScreenGestureEnabled: true } : {}),
        headerLeft: (props) => {
          if (!props.canGoBack) return null;
          return (
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.backRound, pressed && { opacity: 0.85 }]}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Volver"
            >
              <Ionicons name="chevron-back" size={22} color={props.tintColor ?? colors.text} />
            </Pressable>
          );
        },
      })}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Entrenamiento',
          headerLeft: () => (
            <Pressable
              onPress={() => router.replace('/(tabs)' as never)}
              style={({ pressed }) => [styles.backRound, pressed && { opacity: 0.85 }]}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Volver al inicio"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="routines" options={{ title: 'Mis rutinas' }} />
      <Stack.Screen name="routine-editor" options={{ title: 'Editar rutina' }} />
      <Stack.Screen name="gym-session" options={{ title: 'Sesión de gym' }} />
      <Stack.Screen name="exercise-history" options={{ title: 'Historial' }} />
      <Stack.Screen name="session-history" options={{ title: 'Historial de sesiones' }} />
      <Stack.Screen name="progress" options={{ title: 'Progresión' }} />
      <Stack.Screen name="other-activities" options={{ title: 'Otros deportes' }} />
      <Stack.Screen name="other-session" options={{ title: 'Registrar sesión' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  backRound: {
    marginLeft: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
