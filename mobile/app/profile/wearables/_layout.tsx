import { Stack, router } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../../src/theme';

function BackButton() {
  return (
    <TouchableOpacity
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/profile/settings');
        }
      }}
      style={{ marginLeft: spacing.sm, marginRight: spacing.sm }}
    >
      <Ionicons name="arrow-back" size={24} color={colors.text} />
    </TouchableOpacity>
  );
}

export default function WearablesStackLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Smartwatch y salud' }} />
      <Stack.Screen name="[provider]" options={{ title: 'Dispositivo' }} />
    </Stack>
  );
}
