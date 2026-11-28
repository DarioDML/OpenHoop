import type { ReactElement } from 'react';
import { View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { Icon, type IconName } from '@/ui/Icon';
import { radius, spacing, useTheme } from '@/ui/theme';

interface Props {
  icon: IconName;
  title: string;
  body: string;
  tone?: 'pink' | 'neutral';
  testID?: string;
}

export function Callout({ icon, title, body, tone = 'pink', testID }: Props): ReactElement {
  const { colors } = useTheme();
  const pink = tone === 'pink';
  return (
    <View
      testID={testID}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: pink ? colors.pinkSoft : colors.surfaceAlt }}>
      <View style={{ paddingTop: 3 }}>
        <Icon name={icon} color={pink ? colors.pink : colors.textSoft} size={14} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="bodyStrong" color={pink ? colors.pink : colors.text}>
          {title}
        </AppText>
        <AppText variant="body" soft>
          {body}
        </AppText>
      </View>
    </View>
  );
}
