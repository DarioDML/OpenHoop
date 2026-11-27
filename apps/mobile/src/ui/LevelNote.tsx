import type { ReactElement } from 'react';
import { View } from 'react-native';

import type { ParityLevel } from '@/data/types';

import { AppText } from './AppText';
import { ParityBadge } from './ParityBadge';
import { radius, spacing, useTheme } from './theme';

interface Props {
  level: ParityLevel;
  text: string;
  testID?: string;
}

export function LevelNote({ level, text, testID }: Props): ReactElement {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingVertical: spacing.md,
        paddingHorizontal: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
      <ParityBadge level={level} />
      <AppText variant="label" muted style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}
