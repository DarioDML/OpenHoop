import { useState } from 'react';

import { useAppData } from '@/data/context';
import { sliceEndingAt, TREND_RANGES, type TrendRange } from '@/data/dailyDerived';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { NoDataPage, Page } from '@/ui/daily/bits';
import { RangeSwitch, TrendCard } from '@/ui/daily/charts';
import { PARITY } from '@/ui/parity';
import { StageTrend } from '@/ui/StageTrend';
import { useTheme } from '@/ui/theme';

export default function SleepTrendsScreen() {
  const { days } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [range, setRange] = useState<TrendRange>('1M');
  if (days.length === 0) return <NoDataPage title={t('sleepx.trends')} body={t('empty.body')} />;

  const count = TREND_RANGES[range];
  const slice = sliceEndingAt(days, count);

  return (
    <Page title={t('sleepx.trends')} tint="sleep" testID="sleep-trends">
      <RangeSwitch value={range} onChange={setRange} />
      {slice.length < count ? (
        <AppText variant="label" muted>
          {t('trends.fewDays', { count: slice.length })}
        </AppText>
      ) : null}
      <TrendCard testID="score" title={t('score.sleep')} slice={slice} pick={(d) => d.sleep.score.value} decimals={0} minSpan={10} level={PARITY.sleepScore} color={colors.metric.sleep} unit="%" />
      <TrendCard testID="asleep" title={t('metric.asleep')} slice={slice} pick={(d) => (d.sleep.asleepS === null ? null : d.sleep.asleepS / 3600)} decimals={1} minSpan={2} level={PARITY.sleep} color={colors.metric.sleep} unit="h" />
      <StageTrend slice={slice} />
      <TrendCard testID="consistency" title={t('metric.consistency')} slice={slice} pick={(d) => d.sleep.consistency.value} decimals={0} minSpan={10} level={PARITY.consistency} color={colors.metric.sleep} unit="%" />
      <TrendCard testID="debt" title={t('metric.debt')} slice={slice} pick={(d) => (d.sleep.debt.value === null ? null : d.sleep.debt.value / 3600)} decimals={1} minSpan={1} level={PARITY.sleepNeed} color={colors.metric.sleep} unit="h" />
    </Page>
  );
}
