import { Text, type TextProps, type TextStyle } from 'react-native';

import { typeScale, useTheme, type TypeVariant } from './theme';

interface Props extends TextProps {
  variant?: TypeVariant;
  muted?: boolean;
  color?: string;
  numeric?: boolean;
}

export function AppText({ variant = 'body', muted = false, color, numeric = false, style, ...rest }: Props) {
  const { colors } = useTheme();
  const base: TextStyle = {
    ...typeScale[variant],
    color: color ?? (muted ? colors.textMuted : colors.text),
    ...(numeric ? { fontVariant: ['tabular-nums'] } : null),
  };
  return <Text {...rest} style={[base, style]} />;
}
