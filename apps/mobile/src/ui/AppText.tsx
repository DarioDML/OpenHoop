import { Text, type TextProps, type TextStyle } from 'react-native';

import { fontForWeight, maxFontScale, typeScale, useTheme, type TypeVariant } from './theme';

interface Props extends TextProps {
  variant?: TypeVariant;
  muted?: boolean;
  soft?: boolean;
  color?: string;
  numeric?: boolean;
}

export function AppText({ variant = 'body', muted = false, soft = false, color, numeric = false, style, maxFontSizeMultiplier, ...rest }: Props) {
  const { colors } = useTheme();
  const scale = typeScale[variant];
  const base: TextStyle = {
    ...scale,
    fontFamily: fontForWeight(scale.fontWeight),
    color: color ?? (muted ? colors.textMuted : soft ? colors.textSoft : colors.text),
    ...(numeric ? { fontVariant: ['tabular-nums'] } : null),
  };
  return <Text maxFontSizeMultiplier={maxFontSizeMultiplier ?? maxFontScale[variant]} {...rest} style={[base, style]} />;
}
