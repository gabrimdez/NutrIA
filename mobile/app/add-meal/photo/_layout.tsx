import React from 'react';
import { Pressable, StyleSheet, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../src/theme';
import { PhotoMealStateProvider } from './PhotoMealContext';

export default function PhotoStackLayout() {
  return (
    <PhotoMealStateProvider>
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
          animation: 'default',
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
        <Stack.Screen name="index" options={{ title: 'Comida analizada con IA', headerTitleAlign: 'center' }} />
        <Stack.Screen name="fix" options={{ title: 'Solucionar problema', headerTitleAlign: 'center' }} />
      </Stack>
    </PhotoMealStateProvider>
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
