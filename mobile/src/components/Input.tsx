import React from 'react';
import { type TextInputProps } from 'react-native';
import { TextField } from './ui/TextField';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  dense?: boolean;
  shrinkToWrap?: boolean;
}

/** Campo de texto; usa el sistema `TextField`. */
export function Input(props: InputProps) {
  return <TextField {...props} />;
}
