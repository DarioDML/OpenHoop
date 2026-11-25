import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from './AppText';
import { spacing } from './theme';

interface Props {
  title: string;
  hint?: string;
  children: ReactNode;
}

export function Section({ title, hint, children }: Props) {
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: 2 }}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {hint ? (
          <AppText variant="label" muted>
            {hint}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}
