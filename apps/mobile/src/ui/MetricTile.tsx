import type { Href } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import type { TermId } from '@/data/terms';
import type { ParityLevel } from '@/data/types';
import { formatNumber } from '@/lib/format';
import { useT } from '@/i18n/useT';

import { AppText, WordFitText } from './AppText';
import { Card } from './Card';
import { Chip, type ChipTone } from './Chip';
import { useExplain, useMissing, type ExplainTarget } from './explain/ExplainProvider';
import { MetricName } from './explain/MetricName';
import { missingStatus } from './explain/whyText';
import { Icon } from './Icon';
import { useLayout } from './layout';
import { Num } from './Num';
import { ParityBadge } from './ParityBadge';
import { spacing, useTheme } from './theme';

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
  explain?: { term: TermId; index: number };
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface MissingValueProps {
  target: ExplainTarget;
  testID?: string;
}

export function MissingValue({ target, testID }: MissingValueProps): ReactElement {
  const { t, language } = useT();
  const explain = useExplain();
  const missing = useMissing(target);
  const status = missing === null ? t('why.noNumber') : missingStatus(t, language, missing, 'row');
  return (
    <Pressable accessibilityRole="button" testID={testID ? `${testID}-why` : undefined} onPress={() => explain.why(target)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText variant="bodyStrong" muted testID={testID ? `${testID}-reason` : undefined}>
        {`${status} ›`}
      </AppText>
    </Pressable>
  );
}

export function MetricTile({ label, value, level, unit, reason = null, decimals = 0, format, caption, chip, href, explain, size = 44, style, testID }: Props) {
  const { language, reason: reasonLabel } = useT();
  const { colors } = useTheme();
  const { compact } = useLayout();
  const hasValue = value !== null;
  const shownValue = hasValue ? (format ? format(value) : formatNumber(value, decimals, language)) : null;
  const target: ExplainTarget | null = explain ? { term: explain.term, index: explain.index, shown: { value: shownValue, unit: unit ?? null, reason } } : null;
  return (
    <Card href={href} style={[{ gap: 10 }, style]} testID={testID} accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        {target ? (
          <MetricName target={target} label={label} testID={testID ? `${testID}-name` : undefined} />
        ) : (
          <View style={{ flexShrink: 1 }}>
            <WordFitText variant="capSmall" muted numberOfLines={2}>
              {href ? `${label} ›` : label}
            </WordFitText>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          {compact ? null : <ParityBadge level={level} />}
          {target && href ? <Icon name="chevronRight" size={14} color={colors.textMuted} /> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flexShrink: 1 }}>
          {shownValue !== null ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Num size={size} testID={testID ? `${testID}-value` : undefined} adjustsFontSizeToFit style={{ flexShrink: 1 }}>
                {shownValue}
              </Num>
              {unit ? (
                <AppText variant={compact ? 'body' : 'cardTitle'} muted numberOfLines={1} style={{ fontWeight: '400', flexShrink: 0 }} testID={testID ? `${testID}-unit` : undefined}>
                  {unit}
                </AppText>
              ) : null}
            </View>
          ) : target ? (
            <MissingValue target={target} testID={testID} />
          ) : (
            <AppText variant="bodyStrong" muted testID={testID ? `${testID}-reason` : undefined} style={{ minHeight: 32 }}>
              {reasonLabel(reason)}
            </AppText>
          )}
        </View>
      </View>
      {compact ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }} testID={testID ? `${testID}-status` : undefined}>
          <View style={{ flexShrink: 1 }}>{chip && hasValue ? <Chip label={chip.label} tone={chip.tone} /> : null}</View>
          <ParityBadge level={level} />
        </View>
      ) : chip && hasValue ? (
        <Chip label={chip.label} tone={chip.tone} />
      ) : null}
      {caption ? (
        <AppText variant="caption" muted>
          {caption}
        </AppText>
      ) : null}
    </Card>
  );
}
