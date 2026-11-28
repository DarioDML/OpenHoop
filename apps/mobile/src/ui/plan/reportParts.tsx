import type { ReactElement } from 'react';
import { View } from 'react-native';

import { MIN_REPORT_DAYS, trendOf, type PeriodStats, type Trend } from '@/data/activityDerived';
import { formatLongDay } from '@/data/dailyDerived';
import type { Language } from '@/data/types';
import { countKey, type TranslationKey } from '@/i18n';
import { useT, type TFunction } from '@/i18n/useT';
import { formatDuration, formatNumber } from '@/lib/format';

import { AppText } from '../AppText';
import { Card } from '../Card';
import { Chip } from '../Chip';
import { Section } from '../Section';
import { spacing } from '../theme';

export function tooFewText(t: TFunction, count: number): string {
  return t(countKey(count, 'plan.report.tooFewOne', 'plan.report.tooFew'), { count, needed: MIN_REPORT_DAYS });
}

export type RowId = 'readiness' | 'load' | 'sleep' | 'hrv' | 'restingHr';

interface Row {
  id: RowId;
  label: TranslationKey;
  current: number | null;
  previous: number | null;
}

function rowsFor(current: PeriodStats, previous: PeriodStats): Row[] {
  return [
    { id: 'readiness', label: 'score.readiness', current: current.readiness, previous: previous.readiness },
    { id: 'load', label: 'score.load', current: current.load, previous: previous.load },
    { id: 'sleep', label: 'plan.report.sleepAvg', current: current.sleepH, previous: previous.sleepH },
    { id: 'hrv', label: 'metric.hrv', current: current.hrv, previous: previous.hrv },
    { id: 'restingHr', label: 'metric.restingHr', current: current.restingHr, previous: previous.restingHr },
  ];
}

export function changeValueText(t: TFunction, language: Language, id: RowId, value: number): string {
  if (id === 'readiness') return `${formatNumber(value, 0, language)}%`;
  if (id === 'load') return formatNumber(value, 1, language);
  if (id === 'sleep') return formatDuration(t, value * 3600);
  if (id === 'hrv') return `${formatNumber(value, 0, language)} ${t('unit.ms')}`;
  return `${formatNumber(value, 0, language)} ${t('unit.bpm')}`;
}

export const TREND_KEY: Record<Trend, TranslationKey> = {
  up: 'plan.report.trend.up',
  down: 'plan.report.trend.down',
  stable: 'plan.report.trend.stable',
};

interface ChangeRowsProps {
  current: PeriodStats;
  previous: PeriodStats;
  comparable: boolean;
  previousCount: number;
  only?: readonly RowId[];
  title?: string;
}

export function ChangeRows({ current, previous, comparable, previousCount, only, title }: ChangeRowsProps): ReactElement {
  const { t, language } = useT();
  const rows = rowsFor(current, previous).filter((row) => only === undefined || only.includes(row.id));
  return (
    <Section title={title ?? t('plan.report.changes')} hint={comparable ? t('plan.report.vsPrevious', { count: previousCount }) : t('plan.report.noPrevious')}>
      <View style={{ gap: spacing.sm }}>
        {rows.map((row) => {
          if (row.current === null) return null;
          const trend = row.previous !== null && comparable ? trendOf(row.current, row.previous) : null;
          const label = t(row.label);
          const value = changeValueText(t, language, row.id, row.current);
          const before = trend !== null && row.previous !== null ? changeValueText(t, language, row.id, row.previous) : null;
          const sentence = before !== null && trend !== null ? t('plan.report.rowA11y', { label, value, before, trend: t(TREND_KEY[trend]) }) : t('plan.report.rowA11yNoPrev', { label, value });
          return (
            <View key={row.id} accessible accessibilityLabel={sentence} testID={`report-row-${row.id}`}>
              <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <Card style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: spacing.md, rowGap: 2 }}>
                    <AppText variant="bodyStrong" style={{ flexShrink: 1 }}>
                      {label}
                    </AppText>
                    <AppText variant="bodyStrong" numeric testID={`report-row-${row.id}-value`}>
                      {value}
                    </AppText>
                  </View>
                  {before !== null && trend !== null ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                      <AppText variant="label" muted numeric style={{ flexShrink: 1 }} testID={`report-row-${row.id}-before`}>
                        {t('plan.report.before', { value: before })}
                      </AppText>
                      <Chip tone="neutral" label={t(TREND_KEY[trend])} />
                    </View>
                  ) : null}
                </Card>
              </View>
            </View>
          );
        })}
      </View>
    </Section>
  );
}

export function LoadDaysCard({ stats, total }: { stats: PeriodStats; total: number }): ReactElement {
  const { t, language } = useT();
  return (
    <Card>
      <AppText variant="cardTitle">{t('plan.report.loadDays')}</AppText>
      <AppText variant="body" muted testID="report-loaddays">
        {t('plan.report.loadDaysSentence', { count: stats.loadDays, total })}
      </AppText>
      {stats.peakLoad ? (
        <AppText variant="label" muted>
          {t('plan.report.peak', { value: formatNumber(stats.peakLoad.value, 1, language), day: formatLongDay(stats.peakLoad.day, language) })}
        </AppText>
      ) : null}
    </Card>
  );
}
