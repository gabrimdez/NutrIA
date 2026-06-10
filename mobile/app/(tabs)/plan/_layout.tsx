import React from 'react';
import { Stack } from 'expo-router';

export default function PlanStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#0F1117' },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="weekly" />
    </Stack>
  );
}
