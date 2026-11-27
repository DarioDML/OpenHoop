import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatHm, formatLongDay, formatMinutes, mainPeriod, planBedtime, sliceEndingAt } from '@/data/dailyDerived';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { BarChart } from '@/ui/BarChart';
import { Card, CardHeader } from '@/ui/Card';
import { NoDataPage, Page, StatRow, Divider } from '@/ui/daily/bits';
import { FlagNotice } from '@/ui/FlagNotice';
import { MetricTile } from '@/ui/MetricTile';
import { PARITY } from '@/ui/parity';
import { ParityBadge } from '@/ui/ParityBadge';
import { ScoreRing } from '@/ui/ScoreRing';
import { SleepTimeline } from '@/ui/SleepTimeline';
import { StageCard } from '@/ui/StageCard';
import { spacing, useTheme } from '@/ui/theme';

export default function SleepScreen() {
  const { days } = useAppData();
  const { t, language, reason } = useT();
  const { colors } = useTheme();
  const index = days.length - 1;
  const day = days[index];
  if (!day) return <NoDataPage title={t('score.sleep')} body={t('empty.body')} />;

  const { sleep } = day;
  const main = mainPeriod(day);
  const need = sleep.need.value;
  const hoursVsNeed = sleep.asleepS !== null && need !== null && need > 0 ? Math.round((sleep.asleepS / need) * 100) : null;
  const efficiency = sleep.asleepS !== null && sleep.inBedS !== null && sleep.inBedS > 0 ? Math.round((sleep.asleepS / sleep.inBedS) * 100) : null;
  const week = sliceEndingAt(days, 7, index);
  const plan = need === null ? null : planBedtime(days, index, need);
  const tile = { style: { flexBasis: '47%', flexGrow: 1 } } as const;
  const duration = (seconds: number): string => formatDuration(t, seconds);
  const noSleepReason = (value: number | null): string | null => (value === null ? 'no-sleep' : null);
  const coverage = (value: number | null): string | undefined => (value === null ? undefined : t('sleep.coverage', { pct: Math.round(value * 100) }));

  return (
    <Page
      title={t('score.sleep')}
      tint="sleep"
      testID="sleep"
      hero={
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <AppText variant="label" muted>
            {formatLongDay(day.day, language)}
            {main ? ` · ${formatClock(main.onset, day.tzOffsetS)} – ${formatClock(main.offset, day.tzOffsetS)}` : ''}
          </AppText>
          <ScoreRing
            testID="ring-sleep-score"
            label={t('metric.sleepScore')}
            value={sleep.score.value}
            max={100}
            level={PARITY.sleepScore}
            reason={sleep.score.reason}
            color={colors.metric.sleep}
            size={150}
            strokeWidth={12}
          />
          <View style={{ flexDirection: 'row', gap: spacing.xl }}>
            <View style={{ alignItems: 'center' }}>
              <AppText variant="capSmall" muted>
                {t('sleepx.slept')}
              </AppText>
              <AppText variant="cardTitle" numeric testID="slept">
                {sleep.asleepS === null ? reason('no-sleep') : formatHm(sleep.asleepS)}
              </AppText>
            </View>
            <View style={{ alignItems: 'center' }}>
              <AppText variant="capSmall" muted>
                {t('sleepx.needed')}
              </AppText>
              <AppText variant="cardTitle" numeric testID="needed">
                {need === null ? reason(sleep.need.reason) : formatHm(need)}
              </AppText>
            </View>
          </View>
        </View>
      }>
      <FlagNotice flags={day.flags} />

      <Card testID="card-timeline" style={{ gap: spacing.md }}>
        <CardHeader title={t('sleep.timeline')} />
        {sleep.periods.length > 0 ? (
          <SleepTimeline periods={sleep.periods} tzOffsetS={day.tzOffsetS} />
        ) : (
          <AppText variant="body" muted>
            {t('sleep.noPeriods')}
          </AppText>
        )}
      </Card>

      <Card testID="card-contributors" style={{ gap: 0 }}>
        <CardHeader title={t('sleepx.contributors')} />
        <StatRow label={t('sleepx.hoursVsNeed')} value={hoursVsNeed === null ? reason(sleep.need.reason) : `${hoursVsNeed}%`} testID="contrib-hours" />
        <Divider />
        <StatRow label={t('metric.consistency')} value={sleep.consistency.value === null ? reason(sleep.consistency.reason) : `${formatNumber(sleep.consistency.value, 0, language)}%`} testID="contrib-consistency" />
        <Divider />
        <StatRow label={t('sleepx.efficiency')} value={efficiency === null ? reason('no-sleep') : `${efficiency}%`} testID="contrib-efficiency" />
        <View style={{ paddingTop: spacing.sm }}>
          <ParityBadge level={PARITY.sleepScore} long />
        </View>
      </Card>

      <StageCard stages={sleep.stages} edited={sleep.periods.some((p) => !p.nap && p.source === 'edited')} />

      <Card style={{ gap: 0 }}>
        <StatRow label={t('sleepx.lastNight')} caption={t('sleepx.lastNightHint')} value="" href={`/sleep/last-night?day=${day.day}`} testID="link-last-night" />
        <Divider />
        <StatRow label={t('metric.need')} value={need === null ? reason(sleep.need.reason) : formatHm(need)} href="/sleep/need" testID="link-need" />
        <Divider />
        <StatRow label={t('sleepx.trends')} value="" href="/sleep/trends" testID="link-trends" />
        <Divider />
        <StatRow label={t('sleepx.jetLag')} value="" href="/sleep/jet-lag" testID="link-jet-lag" />
      </Card>

      <Card href="/sleep/planner" testID="card-planner" accessibilityLabel={t('sleepx.planner')}>
        <CardHeader title={t('sleepx.planner')} chevron />
        <AppText variant="body" muted>
          {plan ? t('sleepx.plannerLine', { bed: formatMinutes(plan.bedMinutes), wake: formatMinutes(plan.wakeMinutes) }) : t('sleepx.plannerNone')}
        </AppText>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <CardHeader title={t('sleepx.sevenDays')} />
        <BarChart
          testID="chart-week-asleep"
          data={week.map((d) => (d.sleep.asleepS === null ? null : d.sleep.asleepS / 3600))}
          formatTick={(v) => `${formatNumber(v, 0, language)} h`}
          startLabel={week[0] ? formatShortDay(week[0].day, language) : undefined}
          endLabel={formatShortDay(day.day, language)}
        />
      </Card>

      <AppText variant="capLarge" muted>
        {t('sleep.summary')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <MetricTile {...tile} testID="tile-asleep" label={t('metric.asleep')} value={sleep.asleepS} reason={noSleepReason(sleep.asleepS)} format={duration} level={PARITY.sleep} />
        <MetricTile {...tile} testID="tile-inbed" label={t('metric.inBed')} value={sleep.inBedS} reason={noSleepReason(sleep.inBedS)} format={duration} level={PARITY.sleep} />
        <MetricTile {...tile} testID="tile-need" label={t('metric.need')} value={sleep.need.value} reason={sleep.need.reason} format={duration} level={PARITY.sleepNeed} href="/sleep/need" />
        <MetricTile {...tile} testID="tile-debt" label={t('metric.debt')} value={sleep.debt.value} reason={sleep.debt.reason} format={duration} level={PARITY.sleepNeed} href="/sleep/need" />
        <MetricTile {...tile} testID="tile-consistency" label={t('metric.consistency')} value={sleep.consistency.value} reason={sleep.consistency.reason} unit={t('unit.percent')} level={PARITY.consistency} />
      </View>

      <AppText variant="capLarge" muted>
        {t('sleep.signals')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <MetricTile {...tile} label={t('metric.hrv')} value={day.hrv.value} reason={day.hrv.reason} unit={t('unit.ms')} level={PARITY.hrv} caption={coverage(day.hrv.coverage)} href="/recovery/metric/hrv" />
        <MetricTile {...tile} label={t('metric.restingHr')} value={day.restingHr.value} reason={day.restingHr.reason} unit={t('unit.bpm')} level={PARITY.restingHr} caption={coverage(day.restingHr.coverage)} href="/recovery/metric/rhr" />
        <MetricTile {...tile} label={t('metric.respiratoryRate')} value={day.respiratoryRate.value} reason={day.respiratoryRate.reason} unit={t('unit.perMin')} level={PARITY.respiratoryRate} decimals={1} caption={coverage(day.respiratoryRate.coverage)} href="/recovery/metric/resp" />
        <MetricTile {...tile} label={t('metric.spo2')} value={day.spo2.value} reason={day.spo2.reason} unit={t('unit.percent')} level={PARITY.spo2} decimals={1} caption={coverage(day.spo2.coverage)} href="/recovery/metric/spo2" />
        <MetricTile {...tile} label={t('metric.skinTemp')} value={day.skinTempC.value} reason={day.skinTempC.reason} unit={t('unit.celsius')} level={PARITY.skinTemp} decimals={1} caption={coverage(day.skinTempC.coverage)} href="/recovery/metric/temp" />
        <MetricTile {...tile} label={t('metric.skinTempDeviation')} value={day.skinTempDeviationC.value} reason={day.skinTempDeviationC.reason} unit={t('unit.celsiusDelta')} level={PARITY.skinTemp} decimals={2} caption={coverage(day.skinTempDeviationC.coverage)} />
      </View>
    </Page>
  );
}

