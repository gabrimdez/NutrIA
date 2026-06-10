import React from 'react';
import { type ViewStyle } from 'react-native';
import { UIButton } from './ui/Button';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?:
    | 'primary'
    | 'secondary'
    | 'ghost'
    | 'dangerOutline'
    | 'actionCancel'
    | 'actionConfirm'
    | 'actionDestructive';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: React.ReactNode;
  showArrow?: boolean;
  showCloseIcon?: boolean;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  icon,
  showArrow,
  showCloseIcon,
}: ButtonProps) {
  return (
    <UIButton
      title={title}
      onPress={onPress}
      variant={variant}
      size={size}
      loading={loading}
      disabled={disabled}
      style={style}
      icon={icon}
      showArrow={showArrow}
      showCloseIcon={showCloseIcon}
    />
  );
}
