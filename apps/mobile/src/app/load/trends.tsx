import { useState } from 'react';
import { View } from 'react-native';

import { formatWeekday, isLoadDay, periodStats } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { series } from '@/data/derived';
import { daysOnTarget, LOAD_SCALE_MAX } from '@/data/loadDerived';
import { loadTargetsHidden } from '@/data/pregnancyPrefs';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { NoDataScreen } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Segmented } from '@/ui/controls';
import { ChartLegend, DualLineChart } from '@/ui/DualLineChart';
import { MetricTile } from '@/ui/MetricTile';
import { PARITY } from '@/ui/parity';
import { weekdayShort } from '@/ui/readiness/format';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

type Range = '7' | '30' | '180';

export default function LoadTrendsScreen() {
  const { days, userData, cycle } = useAppData();
  const targetsHidden = loadTargetsHidden(userData.pregnancyPrefs, cycle);
  const { t, language } = useT();
  const { colors } = useTheme();
  const [range, setRange] = useState<Range>('7');
  if (days.length === 0) return <NoDataScreen title={t('loadx.trends.title')} />;

  const length = Number(range);
  const shown = days.slice(-length);
  const stats = periodStats(shown);
  const fmt = (v: number, d = 1): string => formatNumber(v, d, language);
  const total = shown.reduce((sum, d) => sum + (d.load.value ?? 0), 0);
  const onTarget = daysOnTarget(days, days.length - shown.length, days.length);
  const loadDays = shown.filter((d) => isLoadDay(d)).length;
  const labels = shown.map((d) => (range === '7' ? weekdayShort(d.day, language) : formatShortDay(d.day, language)));
  const share = onTarget.measured === 0 ? null : Math.round((onTarget.on / onTarget.measured) * 100);

  return (
    <Screen
      tint="load"
      header={
        <>
          <TopBar title={t('loadx.trends.title')} />
          <Segmented
            testID="load-range"
            value={range}
            onChange={setRange}
            options={[
              { value: '7', label: t('loadx.range.1w') },
              { value: '30', label: t('loadx.range.1m') },
              { value: '180', label: t('loadx.range.6m') },
            ]}
          />
        </>
      }>
      {shown.length < length ? (
        <AppText variant="label" muted testID="trends-few">
          {t('trends.fewDays', { count: shown.length })}
        </AppText>
      ) : null}
      <Card testID="trend-chart-card" style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="cap" muted style={{ flexShrink: 1 }}>
            {t('loadTrends.chartTitle')}
          </AppText>
          <AppText variant="label" muted testID="trend-chart-avg">
            {stats.load === null ? t('trends.noValues') : t('loadTrends.avgShort', { value: fmt(stats.load) })}
          </AppText>
        </View>
        <DualLineChart
          testID="trend-chart"
          accessibilityLabel={t('loadTrends.chartA11y', { count: shown.length })}
          primary={{ data: series(shown, 'load'), max: LOAD_SCALE_MAX, color: colors.metric.loadBright, dots: true }}
          secondary={{ data: series(shown, 'readiness'), max: 100, color: colors.metric.readinessMid }}
          labels={labels}
        />
      </Card>
      <ChartLegend
        testID="trend-legend"
        items={[
          { label: t('loadTrends.legendLoad'), color: colors.metric.loadBright },
          {
            label: stats.readiness === null ? t('loadTrends.legendReadiness') : t('loadTrends.legendReadinessAvg', { value: fmt(stats.readiness, 0) }),
            color: colors.metric.readinessMid,
          },
        ]}
      />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <MetricTile label={t('loadTrends.avgLoad')} value={stats.load} decimals={1} level={PARITY.load} reason="no-data" size={40} style={{ flex: 1 }} testID="trend-avg" />
        <MetricTile
          label={t('loadx.trends.highest')}
          value={stats.peakLoad?.value ?? null}
          decimals={1}
          level={PARITY.load}
          reason="no-data"
          size={40}
          chip={stats.peakLoad ? { label: t('loadTrends.peakChip', { day: formatWeekday(stats.peakLoad.day, language, 'long'), date: formatShortDay(stats.peakLoad.day, language) }), tone: 'neutral' } : null}
          style={{ flex: 1 }}
          testID="trend-peak"
        />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {targetsHidden ? (
          <Card style={{ flex: 1, gap: 10 }} testID="trend-ontarget">
            <AppText variant="capSmall" muted>
              {t('loadTrends.onTarget')}
            </AppText>
            <AppText variant="label" muted testID="trend-ontarget-hidden">
              {t('loadTarget.hidden.pill')}
            </AppText>
          </Card>
        ) : (
          <MetricTile
            label={t('loadTrends.onTarget')}
            value={onTarget.measured === 0 ? null : onTarget.on}
            format={(on) => `${on}/${onTarget.measured}`}
            level={PARITY.load}
            reason="needs-history"
            size={40}
            chip={share === null ? null : { label: t('loadTrends.onTargetShare', { percent: share }), tone: share >= 50 ? 'positive' : 'neutral' }}
            style={{ flex: 1 }}
            testID="trend-ontarget"
          />
        )}
        <MetricTile label={t('loadTrends.total')} value={total} decimals={1} level={PARITY.load} size={40} style={{ flex: 1 }} testID="trend-total" />
      </View>
      <AppText variant="label" muted testID="trend-loaddays">
        {t('loadTrends.loadDays', { count: loadDays, total: shown.length })}
      </AppText>
      <AppText variant="caption" muted>
        {t('loadx.trends.loadDayNote')}
      </AppText>
      <AppText variant="caption" muted testID="trend-ontarget-note">
        {targetsHidden ? t('loadTarget.hidden.body') : t('loadTrends.onTargetNote')}
      </AppText>
    </Screen>
  );
}
