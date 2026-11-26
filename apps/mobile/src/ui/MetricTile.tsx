import type { Href } from 'expo-router';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { ParityLevel } from '@/data/types';
import { formatNumber } from '@/lib/format';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Card } from './Card';
import { Chip, type ChipTone } from './Chip';
import { Num } from './Num';
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
  chip?: { label: string; tone: ChipTone } | null;
  href?: Href;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function MetricTile({ label, value, level, unit, reason = null, decimals = 0, format, caption, chip, href, size = 44, style, testID }: Props) {
  const { language, reason: reasonLabel } = useT();
  const hasValue = value !== null;
  return (
    <Card href={href} style={[{ gap: 10 }, style]} testID={testID} accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="capSmall" muted numberOfLines={1} style={{ flexShrink: 1 }}>
          {href ? `${label} ›` : label}
        </AppText>
        <ParityBadge level={level} />
      </View>
      {hasValue ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Num size={size} testID={testID ? `${testID}-value` : undefined} adjustsFontSizeToFit style={{ flexShrink: 1 }}>
            {format ? format(value) : formatNumber(value, decimals, language)}
          </Num>
          {unit ? (
            <AppText variant="cardTitle" muted numberOfLines={1} style={{ fontWeight: '400', flexShrink: 1 }}>
              {unit}
            </AppText>
          ) : null}
        </View>
      ) : (
        <AppText variant="bodyStrong" muted testID={testID ? `${testID}-reason` : undefined} style={{ minHeight: 32 }}>
          {reasonLabel(reason)}
        </AppText>
      )}
      {chip && hasValue ? <Chip label={chip.label} tone={chip.tone} /> : null}
      {caption ? (
        <AppText variant="caption" muted>
          {caption}
        </AppText>
      ) : null}
    </Card>
  );
}
