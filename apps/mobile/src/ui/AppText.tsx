import { useState } from 'react';
import { Text, View, useWindowDimensions, type TextProps, type TextStyle } from 'react-native';

import { wordFitScale } from './layout';
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

interface WordFitProps extends Omit<Props, 'children'> {
  children: string;
  fontSize?: number;
  minScale?: number;
}

export function wordFitMultiplier(text: string, width: number | null, variant: TypeVariant, fontScale: number, fontSize?: number, cap?: number, minScale?: number): number {
  const style = typeScale[variant];
  const size = fontSize ?? style.fontSize;
  const wanted = Math.min(Math.max(1, fontScale), cap ?? maxFontScale[variant]);
  if (width === null) return wanted;
  const fit = wordFitScale(
    text,
    width,
    { fontSize: size, letterSpacing: 'letterSpacing' in style ? style.letterSpacing : 0, uppercase: 'textTransform' in style, bold: Number(style.fontWeight) >= 600 },
    minScale,
  );
  return Math.min(wanted, fit);
}

export function WordFitText({ children, variant = 'body', fontSize, minScale, maxFontSizeMultiplier, style, ...rest }: WordFitProps) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState<number | null>(null);
  const scale = typeScale[variant];
  const size = fontSize ?? scale.fontSize;
  const multiplier = wordFitMultiplier(children, width, variant, fontScale, size, maxFontSizeMultiplier, minScale);
  const sized: TextStyle = { fontSize: size * multiplier, lineHeight: Math.round((scale.lineHeight / scale.fontSize) * size * multiplier) };
  return (
    <View
      style={{ alignSelf: 'stretch' }}
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width);
        if (next > 0 && next !== width) setWidth(next);
      }}>
      <AppText variant={variant} allowFontScaling={false} {...rest} style={[style, sized]}>
        {children}
      </AppText>
    </View>
  );
}
