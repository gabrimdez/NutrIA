import React from 'react';
import { Pressable, StyleSheet, Platform } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';

export default function AddMealLayout() {
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        headerBackTitleVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        ...(Platform.OS === 'ios' ? { headerBackTitle: '' } : {}),
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="photo" options={{ headerShown: false }} />
      <Stack.Screen name="scanner" options={{ title: 'Escáner', headerShown: false }} />
      <Stack.Screen name="saved" options={{ title: 'Comidas guardadas' }} />
      <Stack.Screen name="barcode" options={{ title: 'Código de barras' }} />
      <Stack.Screen name="create-food" options={{ title: 'Crear alimento', headerShown: false }} />
      <Stack.Screen name="create-recipe" options={{ title: 'Crear receta' }} />
      <Stack.Screen name="recipe-from-photo" options={{ title: 'Receta desde foto' }} />
      <Stack.Screen name="recipes" options={{ title: 'Recetas' }} />
      <Stack.Screen
        name="recipe-suggestions"
        options={({ navigation }) => ({
          title: 'Recetas sugeridas',
          // Siempre flecha atrás (p. ej. web o historial raro: si no hay stack, vuelve a recetas).
          headerLeft: (props) => (
            <Pressable
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  router.replace('/add-meal/recipes');
                }
              }}
              style={({ pressed }) => [styles.backRound, pressed && { opacity: 0.85 }]}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Volver"
            >
              <Ionicons name="chevron-back" size={22} color={props.tintColor ?? colors.text} />
            </Pressable>
          ),
        })}
      />
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
