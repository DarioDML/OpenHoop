import type { ReactElement } from 'react';
import { View } from 'react-native';

import { MIN_REPORT_DAYS, trendOf, type PeriodStats, type Trend } from '@/data/activityDerived';
import type { TranslationKey } from '@/i18n';
import { useT, type TFunction } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';

import { AppText } from '../AppText';
import { Card } from '../Card';
import { Chip } from '../Chip';
import { Section } from '../Section';
import { spacing } from '../theme';

export function tooFewText(t: TFunction, count: number): string {
  return count === 1 ? t('plan.report.tooFewOne', { needed: MIN_REPORT_DAYS }) : t('plan.report.tooFew', { count, needed: MIN_REPORT_DAYS });
}

export type RowId = 'readiness' | 'load' | 'sleep' | 'hrv' | 'restingHr';

interface Row {
  id: RowId;
  label: TranslationKey;
  current: number | null;
  previous: number | null;
  decimals: number;
}

function rowsFor(current: PeriodStats, previous: PeriodStats): Row[] {
  return [
    { id: 'readiness', label: 'score.readiness', current: current.readiness, previous: previous.readiness, decimals: 0 },
    { id: 'load', label: 'score.load', current: current.load, previous: previous.load, decimals: 1 },
    { id: 'sleep', label: 'plan.report.sleepAvg', current: current.sleepH, previous: previous.sleepH, decimals: 1 },
    { id: 'hrv', label: 'metric.hrv', current: current.hrv, previous: previous.hrv, decimals: 0 },
    { id: 'restingHr', label: 'metric.restingHr', current: current.restingHr, previous: previous.restingHr, decimals: 0 },
  ];
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
  const fmt = (v: number, d: number): string => formatNumber(v, d, language);
  const rows = rowsFor(current, previous).filter((row) => only === undefined || only.includes(row.id));
  return (
    <Section title={title ?? t('plan.report.changes')} hint={comparable ? t('plan.report.vsPrevious', { count: previousCount }) : t('plan.report.noPrevious')}>
      <View style={{ gap: spacing.sm }}>
        {rows.map((row) => {
          if (row.current === null) return null;
          const trend = row.previous !== null && comparable ? trendOf(row.current, row.previous) : null;
          const label = t(row.label);
          return (
            <Card key={row.id} testID={`report-row-${row.id}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{label}</AppText>
                  <AppText variant="label" muted>
                    {trend !== null && row.previous !== null
                      ? t('plan.report.sentence', { label, current: fmt(row.current, row.decimals), previous: fmt(row.previous, row.decimals), trend: t(TREND_KEY[trend]) })
                      : t('plan.report.sentenceNoPrev', { label, current: fmt(row.current, row.decimals) })}
                  </AppText>
                </View>
                {trend !== null ? <Chip tone="neutral" label={t(TREND_KEY[trend])} /> : null}
              </View>
            </Card>
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
          {t('plan.report.peak', { value: formatNumber(stats.peakLoad.value, 1, language), day: stats.peakLoad.day })}
        </AppText>
      ) : null}
    </Card>
  );
}
