import type { ReactElement } from 'react';
import { View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { Icon, type IconName } from '@/ui/Icon';
import { spacing } from '@/ui/theme';

interface Props {
  icon: IconName;
  iconColor: string;
  iconBackground: string;
  heading: string;
  body: string;
  testID?: string;
}

export function CenteredIntro({ icon, iconColor, iconBackground, heading, body, testID }: Props): ReactElement {
  return (
    <View testID={testID} style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md }}>
      <View style={{ width: 88, height: 88, borderRadius: 26, backgroundColor: iconBackground, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }}>
        <Icon name={icon} color={iconColor} size={34} />
      </View>
      <AppText variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
        {heading}
      </AppText>
      <AppText variant="body" muted style={{ textAlign: 'center' }}>
        {body}
      </AppText>
    </View>
  );
}
