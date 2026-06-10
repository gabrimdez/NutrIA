import React, { useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, platformBoxShadow } from '../../theme';
import { type FoodUnit, FOOD_UNITS, unitLabel, unitAbbr, type FoodUnitMeta } from '../../lib/foodUnits';

const MENU_WIDTH = 268;
const ROW_MIN_H = 48;
const GAP = 8;

export interface UnitPickerMenuFooter {
  label: string;
  onPress: () => void;
}

interface UnitPickerProps {
  value: FoodUnit;
  onChange: (unit: FoodUnit) => void;
  /** Units to show. Defaults to all except 'unit'. */
  availableUnits?: FoodUnit[];
  /** Estilos extra del botón disparador. */
  triggerStyle?: StyleProp<ViewStyle>;
  triggerTextStyle?: StyleProp<TextStyle>;
  chevronColor?: string;
  chevronSize?: number;
  /** Acción al pie del menú (separador + fila), estilo menú contextual iOS. */
  menuFooter?: UnitPickerMenuFooter;
  /**
   * Texto en el botón: nombre largo (p. ej. «Gramos») o abreviatura (p. ej. «g»).
   * @default 'label'
   */
  triggerTextMode?: 'label' | 'abbr';
}

function useUnits(availableUnits?: FoodUnit[]): FoodUnitMeta[] {
  return React.useMemo(() => {
    if (availableUnits) return FOOD_UNITS.filter((u) => availableUnits.includes(u.key));
    return FOOD_UNITS.filter((u) => u.key !== 'unit');
  }, [availableUnits]);
}

function clampMenuPosition(
  anchor: { x: number; y: number; width: number; height: number },
  menuHeight: number,
): { left: number; top: number } {
  const { width: winW, height: winH } = Dimensions.get('window');
  const pad = 10;
  let left = anchor.x + anchor.width - MENU_WIDTH;
  if (left < pad) left = pad;
  if (left + MENU_WIDTH > winW - pad) left = winW - MENU_WIDTH - pad;

  let top = anchor.y + anchor.height + GAP;
  if (top + menuHeight > winH - pad) {
    top = anchor.y - menuHeight - GAP;
  }
  if (top < pad) top = pad;

  return { left, top };
}

const MAX_MENU_BODY_H = Math.round(Dimensions.get('window').height * 0.42);

export function UnitPicker({
  value,
  onChange,
  availableUnits,
  triggerStyle,
  triggerTextStyle,
  chevronColor,
  chevronSize = 12,
  menuFooter,
  triggerTextMode = 'label',
}: UnitPickerProps) {
  const units = useUnits(availableUnits);
  const [open, setOpen] = React.useState(false);
  const [anchor, setAnchor] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const triggerWrapRef = React.useRef<View>(null);

  const bodyHeight = Math.min(units.length * ROW_MIN_H, MAX_MENU_BODY_H);
  const menuHeight = React.useMemo(() => {
    const foot = menuFooter ? ROW_MIN_H + 10 : 0;
    return bodyHeight + foot + 8;
  }, [bodyHeight, menuFooter]);

  const openMenu = () => {
    triggerWrapRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  const closeMenu = () => {
    setOpen(false);
    setAnchor(null);
  };

  useEffect(() => {
    if (!open) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }, [open]);

  const handleSelect = (unit: FoodUnit) => {
    onChange(unit);
    closeMenu();
  };

  const pos = anchor ? clampMenuPosition(anchor, menuHeight) : null;

  return (
    <>
      <View ref={triggerWrapRef} collapsable={false}>
        <Pressable
          onPress={openMenu}
          style={({ pressed }) => [styles.trigger, triggerStyle, pressed && styles.triggerPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Unidad: ${unitLabel(value)}. Pulsa para elegir.`}
        >
          <Text style={[styles.triggerText, triggerTextStyle]}>
            {triggerTextMode === 'abbr' ? unitAbbr(value) : unitLabel(value)}
          </Text>
          <Ionicons name="chevron-down" size={chevronSize} color={chevronColor ?? colors.textSecondary} />
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={[styles.modalRoot, { pointerEvents: 'box-none' }]}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.backdropDim]}
            onPress={closeMenu}
            accessibilityLabel="Cerrar menú"
          />
          {pos ? (
            <View
              style={[
                styles.menuShell,
                { left: pos.left, top: pos.top, width: MENU_WIDTH, pointerEvents: 'box-none' },
              ]}
            >
              <View style={styles.menuCard}>
                <ScrollView
                  style={styles.menuBodyScroll}
                  keyboardShouldPersistTaps="handled"
                  bounces={false}
                  showsVerticalScrollIndicator={units.length * ROW_MIN_H > MAX_MENU_BODY_H}
                >
                  {units.map((item) => {
                    const selected = item.key === value;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => handleSelect(item.key)}
                        style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                      >
                        <View style={styles.checkCol}>
                          {selected ? (
                            <Ionicons name="checkmark" size={20} color={colors.white} />
                          ) : null}
                        </View>
                        <Text style={[styles.menuLabel, selected && styles.menuLabelSelected]} numberOfLines={1}>
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {menuFooter ? (
                  <>
                    <View style={styles.menuSeparator} />
                    <Pressable
                      onPress={() => {
                        menuFooter.onPress();
                        closeMenu();
                      }}
                      style={({ pressed }) => [styles.menuRow, styles.menuFooterRow, pressed && styles.menuRowPressed]}
                    >
                      <View style={styles.checkCol} />
                      <Text style={styles.menuFooterLabel}>{menuFooter.label}</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdropDim: {
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  triggerPressed: { opacity: 0.88 },
  triggerText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  menuShell: {
    position: 'absolute',
    zIndex: 2,
    ...platformBoxShadow(
      '0 12px 36px rgba(0,0,0,0.5)',
      {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.45,
        shadowRadius: 24,
      },
      16,
    ),
  },
  menuCard: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(34, 37, 48, 0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  menuBodyScroll: {
    maxHeight: MAX_MENU_BODY_H,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_MIN_H,
    paddingRight: spacing.md,
    paddingVertical: 4,
  },
  menuRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  checkCol: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    ...typography.body,
    fontSize: 17,
    fontWeight: '400',
    color: colors.text,
    letterSpacing: -0.2,
  },
  menuLabelSelected: {
    fontWeight: '500',
  },
  menuSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: spacing.sm,
  },
  menuFooterRow: {
    minHeight: ROW_MIN_H - 4,
  },
  menuFooterLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: colors.text,
    letterSpacing: -0.2,
  },
});
