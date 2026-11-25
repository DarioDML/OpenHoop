import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, useTheme } from './theme';

interface Props {
  children: ReactNode;
}

export function Screen({ children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.lg,
        paddingBottom: insets.bottom + spacing.xxl,
        gap: spacing.xl,
      }}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}
