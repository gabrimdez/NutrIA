import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, Pressable, type TextInputProps, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  /** Sin margen inferior del contenedor y paddings más bajos; útil en filas (p. ej. cantidad + unidad). */
  dense?: boolean;
  /**
   * Evita `flex:1` en el TextInput para que el área clicable coincida con el recuadro (borde),
   * p. ej. en web al poner el campo junto a un sufijo "kg".
   */
  shrinkToWrap?: boolean;
};

/**
 * Teclados numéricos: si dejamos `autoCorrect/autoCapitalize/spellCheck` activos,
 * el IME (Android nativo y navegadores móviles en RN-Web) alterna entre el modo
 * de texto con sugerencias y el numérico en cada tecla, lo que provoca que el
 * teclado virtual desaparezca y vuelva a aparecer tras escribir cada dígito.
 */
const NUMERIC_KEYBOARD_TYPES = new Set([
  'numeric',
  'number-pad',
  'decimal-pad',
  'phone-pad',
]);
const NUMERIC_INPUT_MODES = new Set(['numeric', 'decimal', 'tel']);

export function TextField({
  label,
  error,
  hint,
  style,
  onFocus,
  onBlur,
  secureTextEntry,
  dense,
  shrinkToWrap,
  keyboardType,
  inputMode,
  autoCorrect,
  autoCapitalize,
  spellCheck,
  autoComplete,
  ...props
}: Props) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isSecure = secureTextEntry && !showPassword;

  const isNumericKeyboard =
    (keyboardType != null && NUMERIC_KEYBOARD_TYPES.has(keyboardType)) ||
    (inputMode != null && NUMERIC_INPUT_MODES.has(inputMode));

  const resolvedAutoCorrect = autoCorrect ?? (isNumericKeyboard ? false : undefined);
  const resolvedAutoCapitalize =
    autoCapitalize ?? (isNumericKeyboard ? 'none' : undefined);
  const resolvedSpellCheck = spellCheck ?? (isNumericKeyboard ? false : undefined);
  const resolvedAutoComplete = autoComplete ?? (isNumericKeyboard ? 'off' : undefined);

  const inputWrapShrink: ViewStyle = shrinkToWrap
    ? { overflow: 'hidden', width: '100%', maxWidth: '100%', alignSelf: 'stretch' }
    : {};

  return (
    <View
      style={[
        styles.container,
        dense && styles.containerDense,
        shrinkToWrap && styles.containerShrink,
      ]}
    >
      {label ? <Text style={[styles.label, dense && styles.labelDense]}>{label}</Text> : null}
      <View style={[
        styles.inputWrap,
        focused && styles.inputWrapFocused,
        error && styles.inputWrapError,
        inputWrapShrink,
      ]}>
        <TextInput
          style={[
            styles.inputBase,
            dense ? styles.inputDense : styles.inputPadded,
            shrinkToWrap ? styles.inputShrink : styles.inputFlex,
            style,
          ]}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isSecure}
          keyboardType={keyboardType}
          inputMode={inputMode}
          autoCorrect={resolvedAutoCorrect}
          autoCapitalize={resolvedAutoCapitalize}
          spellCheck={resolvedSpellCheck}
          autoComplete={resolvedAutoComplete}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {secureTextEntry && (
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            hitSlop={8}
            style={styles.eyeBtn}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  containerDense: { marginBottom: 0 },
  containerShrink: { width: '100%', maxWidth: '100%', alignSelf: 'stretch' },
  label: {
    ...typography.label,
    color: colors.primaryLight,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  labelDense: { marginBottom: spacing.xs },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputWrapFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceElevated,
  },
  inputWrapError: { borderColor: colors.error },
  inputBase: {
    color: colors.text,
    ...typography.body,
    minWidth: 0,
  },
  inputPadded: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  inputDense: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2,
  },
  inputFlex: { flex: 1, minWidth: 0 },
  inputShrink: {
    flexGrow: 0,
    flexShrink: 1,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  eyeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  error: { ...typography.small, color: colors.error, marginTop: spacing.xs },
  hint: { ...typography.small, color: colors.textMuted, marginTop: spacing.xs },
});
