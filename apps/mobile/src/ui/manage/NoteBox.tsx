import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { Icon, type IconName } from '@/ui/Icon';
import { radius, spacing, useTheme } from '@/ui/theme';

interface Props {
  icon: IconName;
  title?: string;
  body?: string;
  tone?: 'warning' | 'neutral';
  children?: ReactNode;
  testID?: string;
}

export function NoteBox({ icon, title, body, tone = 'neutral', children, testID }: Props) {
  const { colors } = useTheme();
  const warning = tone === 'warning';
  return (
    <View
      accessible
      testID={testID}
      style={{ flexDirection: 'row', gap: spacing.md, padding: 14, borderRadius: radius.md, backgroundColor: warning ? colors.warningSoft : colors.surfaceAlt }}>
      <Icon name={icon} color={warning ? colors.warning : colors.textSoft} size={20} />
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        {title === undefined ? null : (
          <AppText variant="bodyStrong" color={warning ? colors.warning : colors.textSoft} style={{ fontSize: 14, lineHeight: 19 }}>
            {title}
          </AppText>
        )}
        {body ? (
          <AppText variant="label" color={colors.textSoft}>
            {body}
          </AppText>
        ) : null}
        {children}
      </View>
    </View>
  );
}
