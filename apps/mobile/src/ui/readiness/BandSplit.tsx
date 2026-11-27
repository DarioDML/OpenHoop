import type { ReactElement } from 'react';
import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { radius, spacing, useTheme } from '@/ui/theme';

interface Props {
  high: number;
  medium: number;
  low: number;
  testID?: string;
}

export function BandSplit({ high, medium, low, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const { t } = useT();
  const parts = [
    { id: 'high', count: high, color: colors.metric.readinessHigh, label: t('readinessTrends.legend.high', { count: high }) },
    { id: 'medium', count: medium, color: colors.metric.readinessMid, label: t('readinessTrends.legend.medium', { count: medium }) },
    { id: 'low', count: low, color: colors.metric.readinessLow, label: t('readinessTrends.legend.low', { count: low }) },
  ];
  const total = high + medium + low;
  return (
    <View style={{ gap: spacing.md }} testID={testID}>
      <View
        accessible
        accessibilityLabel={t('readinessTrends.splitA11y', { high, medium, low })}
        style={{ flexDirection: 'row', height: 18, borderRadius: radius.pill, overflow: 'hidden', gap: 2, backgroundColor: total === 0 ? colors.surfaceAlt : undefined }}>
        {parts
          .filter((part) => part.count > 0)
          .map((part) => (
            <View key={part.id} testID={testID === undefined ? undefined : `${testID}-${part.id}`} style={{ flex: part.count, backgroundColor: part.color }} />
          ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm }}>
        {parts.map((part) => (
          <View key={part.id} testID={`count-${part.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: part.color }} />
            <AppText variant="caption" muted>
              {part.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
