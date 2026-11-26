import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { fonts, useTheme } from './theme';

interface Props {
  children: ReactNode;
  size?: number;
  color?: string;
  unit?: string;
  unitSize?: number;
  unitColor?: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
  maxFontSizeMultiplier?: number;
  adjustsFontSizeToFit?: boolean;
}

export function Num({ children, size = 44, color, unit, unitSize, unitColor, style, testID, accessibilityLabel, maxFontSizeMultiplier = 1.3, adjustsFontSizeToFit = false }: Props) {
  const { colors } = useTheme();
  const base: TextStyle = {
    fontFamily: fonts.numeric,
    fontSize: size,
    lineHeight: Math.round(size * 1.05),
    fontWeight: '700',
    color: color ?? colors.text,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  };
  return (
    <Text
      style={[base, style]}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      numberOfLines={adjustsFontSizeToFit ? 1 : undefined}
      adjustsFontSizeToFit={adjustsFontSizeToFit}>
      {children}
      {unit ? (
        <Text style={{ fontSize: unitSize ?? Math.round(size * 0.42), color: unitColor ?? color ?? colors.text }}>
          {unit.startsWith('%') ? unit : ` ${unit}`}
        </Text>
      ) : null}
    </Text>
  );
}
