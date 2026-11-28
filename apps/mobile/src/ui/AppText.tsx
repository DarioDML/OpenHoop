import { useState } from 'react';
import { Text, useWindowDimensions, type TextProps, type TextStyle } from 'react-native';

import { breaksMidWord } from './layout';
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

const SHRINK_STEP = 0.9;

export function WordFitText({ children, variant = 'body', fontSize, minScale = 0.7, maxFontSizeMultiplier, style, onTextLayout, ...rest }: WordFitProps) {
  const { fontScale } = useWindowDimensions();
  const [fit, setFit] = useState({ text: children, shrink: 1 });
  const shrink = fit.text === children ? fit.shrink : 1;
  const scale = typeScale[variant];
  const size = fontSize ?? scale.fontSize;
  const wanted = Math.min(Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1, maxFontSizeMultiplier ?? maxFontScale[variant]);
  const multiplier = Math.max(minScale, wanted * shrink);
  const sized: TextStyle = { fontSize: size * multiplier, lineHeight: Math.round((scale.lineHeight / scale.fontSize) * size * multiplier) };
  return (
    <AppText
      variant={variant}
      allowFontScaling={false}
      {...rest}
      style={[style, sized]}
      onTextLayout={(event) => {
        onTextLayout?.(event);
        if (multiplier > minScale && breaksMidWord(event.nativeEvent.lines.map((line) => line.text))) setFit({ text: children, shrink: shrink * SHRINK_STEP });
      }}>
      {children}
    </AppText>
  );
}
