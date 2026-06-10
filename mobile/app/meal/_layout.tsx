import { Stack } from 'expo-router';
import { colors } from '../../src/theme';

export default function MealLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: 'Comida',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="[id]" options={{ title: 'Editar comida' }} />
    </Stack>
  );
}
