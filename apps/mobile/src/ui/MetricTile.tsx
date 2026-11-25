import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { ParityLevel } from '@/data/types';
import { formatNumber } from '@/lib/format';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Card } from './Card';
import { ParityBadge } from './ParityBadge';
import { spacing } from './theme';

interface Props {
  label: string;
  value: number | null;
  level: ParityLevel;
  unit?: string;
  reason?: string | null;
  decimals?: number;
  format?: (value: number) => string;
  caption?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function MetricTile({ label, value, level, unit, reason = null, decimals = 0, format, caption, style, testID }: Props) {
  const { language, reason: reasonLabel } = useT();
  const hasValue = value !== null;
  return (
    <Card style={[{ gap: spacing.sm, padding: spacing.md }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="label" muted numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </AppText>
        <ParityBadge level={level} />
      </View>
      {hasValue ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <AppText variant="value" numeric testID={testID ? `${testID}-value` : undefined}>
            {format ? format(value) : formatNumber(value, decimals, language)}
          </AppText>
          {unit ? (
            <AppText variant="label" muted>
              {unit}
            </AppText>
          ) : null}
        </View>
      ) : (
        <AppText variant="bodyStrong" muted testID={testID ? `${testID}-reason` : undefined} style={{ minHeight: 32 }}>
          {reasonLabel(reason)}
        </AppText>
      )}
      {caption ? (
        <AppText variant="caption" muted>
          {caption}
        </AppText>
      ) : null}
    </Card>
  );
}
