import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, type TextProps, type TextStyle } from 'react-native';

import { breaksMidWord, fitFontSize } from './layout';
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
}

interface Fit {
  key: string;
  shrink: number;
  wrap: boolean;
}

const SHRINK_STEP = 0.9;

export function WordFitText({ children, variant = 'body', fontSize, maxFontSizeMultiplier, numberOfLines, style, onTextLayout, ...rest }: WordFitProps) {
  const { fontScale, width } = useWindowDimensions();
  const key = `${children}|${fontScale}|${width}`;
  const [fit, setFit] = useState<Fit>({ key, shrink: 1, wrap: false });
  const current: Fit = fit.key === key ? fit : { key, shrink: 1, wrap: false };
  const scale = typeScale[variant];
  const styled = StyleSheet.flatten(style)?.fontSize;
  const base = fontSize ?? (typeof styled === 'number' ? styled : scale.fontSize);
  const cap = maxFontSizeMultiplier ?? maxFontScale[variant];
  const size = fitFontSize(base, fontScale, cap, current.shrink);
  const atFloor = size <= fitFontSize(base, fontScale, cap, 0);
  const sized: TextStyle = { fontSize: size, lineHeight: Math.round((scale.lineHeight / scale.fontSize) * size) };
  return (
    <AppText
      variant={variant}
      allowFontScaling={false}
      numberOfLines={current.wrap ? undefined : numberOfLines}
      android_hyphenationFrequency={current.wrap ? 'normal' : 'none'}
      {...rest}
      style={[style, sized]}
      onTextLayout={(event) => {
        onTextLayout?.(event);
        if (current.wrap || !breaksMidWord(children, event.nativeEvent.lines.map((line) => line.text))) return;
        setFit(atFloor ? { key, shrink: current.shrink, wrap: true } : { key, shrink: current.shrink * SHRINK_STEP, wrap: false });
      }}>
      {children}
    </AppText>
  );
}
