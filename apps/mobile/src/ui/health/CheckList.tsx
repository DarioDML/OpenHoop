import type { ReactElement } from 'react';
import { View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { Icon } from '@/ui/Icon';
import { spacing, useTheme } from '@/ui/theme';

interface Props {
  items: readonly string[];
  tone?: 'positive' | 'muted';
}

export function CheckList({ items, tone = 'positive' }: Props): ReactElement {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      {items.map((item) => (
        <View key={item} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <View style={{ marginTop: 3 }}>
            <Icon name="check" color={tone === 'positive' ? colors.positive : colors.textMuted} size={18} strokeWidth={2.2} />
          </View>
          <AppText variant="body" soft style={{ flex: 1 }}>
            {item}
          </AppText>
        </View>
      ))}
    </View>
  );
}
