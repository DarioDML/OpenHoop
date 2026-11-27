import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatHm, sliceEndingAt, TREND_RANGES, type TrendRange } from '@/data/dailyDerived';
import { RESTORATIVE_TYPICAL, contributorStatus, rangeFlag, sleepTrendStats, type ContributorStatus } from '@/data/sleepDerived';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import type { ChipTone } from '@/ui/Chip';
import { NoDataPage, Page } from '@/ui/daily/bits';
import { RangeSwitch, TrendCard } from '@/ui/daily/charts';
import { MetricTile } from '@/ui/MetricTile';
import { PARITY } from '@/ui/parity';
import { BedWakeChart } from '@/ui/sleep/BedWakeChart';
import { StageTrend } from '@/ui/StageTrend';
import { spacing, useTheme } from '@/ui/theme';

export default function SleepTrendsScreen() {
  const { days } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [range, setRange] = useState<TrendRange>('1W');
  if (days.length === 0) return <NoDataPage title={t('sleepx.trends')} body={t('empty.body')} />;

  const index = days.length - 1;
  const count = TREND_RANGES[range];
  const slice = sliceEndingAt(days, count);
  const stats = sleepTrendStats(slice);
  const tile = { style: { flexBasis: '47%', flexGrow: 1 }, size: 40 } as const;
  const statusChip = (status: ContributorStatus | null): { label: string; tone: ChipTone } | null => {
    if (status === null) return null;
    if (status === 'optimal') return { label: t('sleepTrends.statusOptimal'), tone: 'positive' };
    if (status === 'poor') return { label: t('sleepTrends.statusPoor'), tone: 'warning' };
    return { label: t('sleepTrends.statusSufficient'), tone: 'neutral' };
  };
  const restorativeFlag = stats.restorative === null ? null : rangeFlag(stats.restorative, RESTORATIVE_TYPICAL);
  const restorativeChip =
    stats.restorative === null
      ? null
      : {
          label: t(restorativeFlag === null ? 'sleepTrends.within' : restorativeFlag === 'above' ? 'sleepTrends.above' : 'sleepTrends.below', { low: RESTORATIVE_TYPICAL.low, high: RESTORATIVE_TYPICAL.high }),
          tone: restorativeFlag === null ? ('positive' as const) : ('warning' as const),
        };
  const debtChip = stats.debtS === null ? null : stats.debtS > 0 ? { label: t('sleepTrends.carrying'), tone: 'warning' as const } : { label: t('sleepTrends.noDebt'), tone: 'positive' as const };
  const missing = slice.some((d) => d.sleep.asleepS !== null) ? 'needs-history' : 'no-sleep';

  return (
    <Page title={t('sleepx.trends')} tint="sleep" testID="sleep-trends" hero={<RangeSwitch value={range} onChange={setRange} />}>
      {slice.length < count ? (
        <AppText variant="label" muted>
          {t('trends.fewDays', { count: slice.length })}
        </AppText>
      ) : null}
      <TrendCard testID="score" title={t('score.sleep')} slice={slice} pick={(d) => d.sleep.score.value} decimals={0} minSpan={10} level={PARITY.sleepScore} color={colors.metric.sleep} unit="%" />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }} testID="trend-stats">
        <MetricTile
          {...tile}
          testID="stat-consistency"
          explain={{ term: 'consistency', index }}
          label={t('metric.consistency')}
          value={stats.consistency}
          reason={missing}
          unit="%"
          chip={statusChip(contributorStatus('consistency', stats.consistency))}
          caption={t('sleepTrends.average')}
          level={PARITY.consistency}
        />
        <MetricTile
          {...tile}
          testID="stat-efficiency"
          explain={{ term: 'efficiency', index }}
          label={t('sleepx.efficiency')}
          value={stats.efficiency}
          reason="no-sleep"
          unit="%"
          chip={statusChip(contributorStatus('efficiency', stats.efficiency))}
          caption={t('sleepTrends.average')}
          level={PARITY.sleep}
        />
        <MetricTile
          {...tile}
          testID="stat-debt"
          explain={{ term: 'sleepDebt', index }}
          label={t('metric.debt')}
          value={stats.debtS}
          reason={missing}
          format={formatHm}
          chip={debtChip}
          caption={t('sleepTrends.latest')}
          level={PARITY.sleepNeed}
        />
        <MetricTile
          {...tile}
          testID="stat-restorative"
          explain={{ term: 'restorative', index }}
          label={t('term.restorative.name')}
          value={stats.restorative}
          reason={slice.some((d) => d.sleep.stages?.totals) ? 'missing-signal' : 'no-sleep'}
          unit="%"
          chip={restorativeChip}
          caption={t('sleepTrends.average')}
          level={PARITY.stages}
        />
      </View>

      <BedWakeChart slice={slice} />

      <AppText variant="capLarge" muted accessibilityRole="header">
        {t('sleepTrends.more')}
      </AppText>
      <TrendCard testID="asleep" title={t('metric.asleep')} slice={slice} pick={(d) => (d.sleep.asleepS === null ? null : d.sleep.asleepS / 3600)} decimals={1} minSpan={2} level={PARITY.sleep} color={colors.metric.sleep} unit="h" />
      <StageTrend slice={slice} />
      <TrendCard testID="consistency" title={t('metric.consistency')} slice={slice} pick={(d) => d.sleep.consistency.value} decimals={0} minSpan={10} level={PARITY.consistency} color={colors.metric.sleep} unit="%" />
      <TrendCard testID="debt" title={t('metric.debt')} slice={slice} pick={(d) => (d.sleep.debt.value === null ? null : d.sleep.debt.value / 3600)} decimals={1} minSpan={1} level={PARITY.sleepNeed} color={colors.metric.sleep} unit="h" />
    </Page>
  );
}
