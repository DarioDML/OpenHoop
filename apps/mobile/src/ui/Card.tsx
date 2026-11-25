import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from './theme';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'accent' | 'warning';
}

export function Card({ children, style, tone = 'default' }: Props) {
  const { colors } = useTheme();
  const borderColor = tone === 'accent' ? colors.accent : tone === 'warning' ? colors.warning : colors.border;
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor,
          padding: spacing.lg,
        },
        style,
      ]}>
      {children}
    </View>
  );
}
