import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { spacing, borderRadius } from './spacing';
import { typography } from './typography';
import { platformBoxShadow } from './tokens';

/** Mismo gradiente que el pie de edición en `plan/weekly` (Guardar cambios). */
export const ACTION_INTENT_GRADIENT_COLORS = [colors.primaryLight, colors.primary, colors.primaryDark] as const;
export const ACTION_INTENT_GRADIENT_START = { x: 0, y: 0 } as const;
export const ACTION_INTENT_GRADIENT_END = { x: 1, y: 1 } as const;

/**
 * Pares “Cancelar + acción” (Aceptar / Guardar / Listo / Aplicar…):
 * fila a ancho completo, cancel con borde, confirmación con gradiente y sombra.
 */
export const actionIntentStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    gap: spacing.sm,
  },
  rowTight: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  rowWithTopMargin: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  rowModal: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 50,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    flexShrink: 0,
  },
  cancelText: {
    ...typography.caption,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  confirmPressable: {
    flex: 1,
    minWidth: 0,
    borderRadius: borderRadius.xxl,
  },
  confirmShadowWrap: {
    flex: 1,
    minWidth: 0,
    borderRadius: borderRadius.xxl,
    ...platformBoxShadow(
      `0 6px 14px ${colors.primary}59`,
      { shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14 },
      8,
    ),
  },
  confirmInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 50,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.xxl,
  },
  confirmInnerDisabled: {
    opacity: 0.6,
  },
  confirmText: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  destructivePressable: {
    flex: 1,
    minWidth: 0,
    borderRadius: borderRadius.xxl,
  },
  destructiveShadowWrap: {
    flex: 1,
    minWidth: 0,
    borderRadius: borderRadius.xxl,
    ...platformBoxShadow(
      `0 4px 10px ${colors.error}4D`,
      { shadowColor: colors.error, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
      6,
    ),
  },
  destructiveInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.xxl,
    backgroundColor: colors.errorMuted,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  destructiveInnerDisabled: {
    opacity: 0.6,
  },
  destructiveText: {
    ...typography.captionBold,
    fontSize: 15,
    color: colors.error,
    letterSpacing: 0.2,
  },
});
