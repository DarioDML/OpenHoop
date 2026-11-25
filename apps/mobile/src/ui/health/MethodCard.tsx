import { View } from 'react-native';

import type { ParityLevel } from '@/data/types';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { ParityBadge } from '@/ui/ParityBadge';
import { spacing, useTheme } from '@/ui/theme';

interface Props {
  title: string;
  lines: readonly string[];
  level: ParityLevel;
  testID?: string;
}

export function MethodCard({ title, lines, level, testID }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <Card testID={testID}>
      <AppText variant="capLarge" muted>
        {title}
      </AppText>
      {lines.map((line) => (
        <View key={line} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <View style={{ marginTop: 3 }}>
            <Icon name="info" color={colors.textMuted} size={16} />
          </View>
          <AppText variant="label" soft style={{ flex: 1 }}>
            {line}
          </AppText>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <ParityBadge level={level} />
        <AppText variant="caption" muted style={{ flex: 1 }} testID={testID ? `${testID}-level` : undefined}>
          {t('health.healthspan.levelNote')}
        </AppText>
      </View>
    </Card>
  );
}
