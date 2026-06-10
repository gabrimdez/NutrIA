import React, { useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Platform, ScrollView } from 'react-native';
import { Redirect } from 'expo-router';
import { useKeyboardScreenDebug } from '../../src/lib/keyboardDebug';
import { KEYBOARD_REPRO_CHECKLIST } from '../../src/lib/keyboardRepro';
import { colors, spacing, screenPaddingX, typography } from '../../src/theme';

/**
 * Ruta: /dev/keyboard-test
 * Compara un TextInput aislado con el resto de la app. Solo __DEV__.
 */
export default function DevKeyboardTestScreen() {
  useEffect(() => {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(KEYBOARD_REPRO_CHECKLIST);
    }
  }, []);
  useKeyboardScreenDebug('DevKeyboardTest');

  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Prueba mínima de teclado (Android)</Text>
      <Text style={styles.body}>
        Si aquí el teclado no parpadea, el fallo está en el layout de una pantalla concreta, no en el dispositivo/IME
        (salvo pruebas sin depuración USB).
      </Text>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>Campo 1</Text>
        <TextInput
          style={styles.input}
          placeholder="Escribe…"
          placeholderTextColor={colors.textMuted}
          multiline
          {...(Platform.OS === 'android'
            ? { textAlignVertical: 'top', includeFontPadding: false }
            : {})}
        />
        <Text style={styles.label}>Campo 2</Text>
        <TextInput style={styles.input} placeholder="Otro" placeholderTextColor={colors.textMuted} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.lg, paddingHorizontal: screenPaddingX },
  title: { ...typography.sectionTitle, color: colors.text, marginBottom: spacing.sm },
  body: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  scroll: { paddingBottom: 120 },
  label: { ...typography.caption, color: colors.text, marginTop: spacing.sm, marginBottom: 4 },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    color: colors.text,
  },
});
