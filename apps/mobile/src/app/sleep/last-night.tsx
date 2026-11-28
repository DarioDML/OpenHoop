import type { StageEpochRow } from '@openhoop/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatHm, formatLongDay, indexOfDay, isDayString, mainNightSpan, singleParam } from '@/data/dailyDerived';
import { baselineAt } from '@/data/derived';
import { nightEvents, restorativePct } from '@/data/sleepDerived';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Divider, NoDataPage, Page, StatRow, useRangeChip } from '@/ui/daily/bits';
import { LevelNote } from '@/ui/LevelNote';
import { LineChart } from '@/ui/LineChart';
import { MetricTile } from '@/ui/MetricTile';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { StageLegend, TimeInStage } from '@/ui/sleep/TimeInStage';
import { useNightHeartRate } from '@/ui/sleep/useNightHeartRate';
import { SleepTimeline } from '@/ui/SleepTimeline';
import { StageCard } from '@/ui/StageCard';
import { IconButton } from '@/ui/TopBar';
import { spacing, useTheme } from '@/ui/theme';

const HR_BUCKET_S = 600;

export default function LastNightScreen() {
  const params = useLocalSearchParams<{ day?: string | string[] }>();
  const { days, sleepStagesBetween } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const rangeChip = useRangeChip();
  const requested = singleParam(params.day);
  const index = requested === null ? days.length - 1 : isDayString(requested) ? indexOfDay(days, requested) : -1;
  const day = days[index];
  const [loaded, setLoaded] = useState<{ onset: number; epochs: StageEpochRow[] } | null>(null);
  const night = day ? mainNightSpan(day) : null;
  const heart = useNightHeartRate(night, HR_BUCKET_S);
  const nightOnset = night?.onset ?? null;
  const nightOffset = night?.offset ?? null;
  const staged = (day?.sleep.stages?.totals ?? null) !== null;
  const epochsLoaded = loaded !== null && loaded.onset === nightOnset;
  const epochs = epochsLoaded ? loaded.epochs : [];

  useEffect(() => {
    if (nightOnset === null || nightOffset === null || !staged) return;
    let cancelled = false;
    void sleepStagesBetween(nightOnset, nightOffset + 1).then(
      (result) => {
        if (!cancelled) setLoaded({ onset: nightOnset, epochs: result });
      },
      () => {
        if (!cancelled) setLoaded({ onset: nightOnset, epochs: [] });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sleepStagesBetween, nightOnset, nightOffset, staged]);

  if (!day) {
    return <NoDataPage title={t('lastNight.title')} body={requested !== null && !isDayString(requested) ? t('daily.invalidDay') : t('sleepx.noNight')} />;
  }

  const points = heart.points;
  const naps = day.sleep.periods.filter((p) => p.nap);
  const minHr = points.length > 0 ? Math.min(...points.map((p) => p.hr)) : null;
  const resp = day.respiratoryRate.value;
  const respChip = rangeChip(resp, baselineAt(days, index, 'respiratoryRate'), 1);
  const totals = day.sleep.stages?.totals ?? null;
  const events = night !== null && epochs.length > 0 ? nightEvents(epochs, night.onset) : null;
  const stageReason = staged ? (epochsLoaded ? 'missing-signal' : null) : (day.sleep.stages?.reason ?? 'no-sleep');
  const restorative = restorativePct(totals);
  const edited = day.sleep.periods.some((p) => !p.nap && p.source === 'edited');
  const tile = { style: { flexBasis: '47%', flexGrow: 1 } } as const;

  return (
    <Page
      title={t('lastNight.title')}
      tint="sleep"
      testID="last-night"
      right={<IconButton icon="edit" label={t('lastNight.edit')} testID="link-edit-sleep" onPress={() => router.push(`/sleep/edit?day=${day.day}`)} />}
      hero={
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
          <View style={{ gap: spacing.sm, flexShrink: 1 }}>
            <AppText variant="cap" color={colors.levelC}>
              {t('sleepx.timeAsleep')}
            </AppText>
            {day.sleep.asleepS === null ? (
              <AppText variant="title" testID="asleep-total">
                {t('reason.no-sleep')}
              </AppText>
            ) : (
              <Num size={64} testID="asleep-total">
                {formatHm(day.sleep.asleepS)}
              </Num>
            )}
            <AppText variant="label" color={colors.levelC}>
              {formatLongDay(day.day, language)}
            </AppText>
          </View>
          {night ? (
            <View style={{ alignItems: 'flex-end', gap: spacing.xs, paddingBottom: 6 }}>
              {edited ? <Chip label={t('sleepx.sourceEdited')} tone="info" small testID="night-edited" /> : null}
              <AppText variant="label" color={colors.levelC} numeric testID="night-range">
                {formatClock(night.onset, day.tzOffsetS)} – {formatClock(night.offset, day.tzOffsetS)}
              </AppText>
            </View>
          ) : null}
        </View>
      }>
      <Card style={{ gap: spacing.md }} testID="card-hr">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="cap" muted>
              {t('metric.heartRate')}
            </AppText>
            <ParityBadge level={PARITY.heartRate} />
          </View>
          {minHr !== null ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }} testID="hr-min" accessible accessibilityLabel={t('sleepx.hrMin', { value: formatNumber(minHr, 0, language) })}>
              <AppText variant="label" muted>
                {t('lastNight.hrMin')}
              </AppText>
              <Num size={18}>{formatNumber(minHr, 0, language)}</Num>
              <AppText variant="label" muted>
                {t('unit.bpm')}
              </AppText>
            </View>
          ) : null}
        </View>
        {night && points.length > 0 ? (
          <LineChart
            testID="chart-sleep-hr"
            data={points.map((p) => p.hr)}
            minSpan={10}
            color={colors.negative}
            guide={minHr}
            formatTick={(v) => formatNumber(v, 0, language)}
            emptyLabel={t('trends.noValues')}
            startLabel={formatClock(night.onset, day.tzOffsetS)}
            endLabel={formatClock(night.offset, day.tzOffsetS)}
          />
        ) : (
          <AppText variant="body" muted>
            {t('sleepx.noHr')}
          </AppText>
        )}
      </Card>

      <StageCard
        stages={day.sleep.stages}
        hypnogram={night ? { epochs, from: night.onset, to: night.offset + 1, tzOffsetS: day.tzOffsetS } : undefined}
        edited={edited}
        split={false}
        laneLabels={false}
        legend={<StageLegend testID="stage-legend" />}
      />

      {totals !== null ? <TimeInStage totals={totals} /> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }} testID="night-kpis">
        <MetricTile
          {...tile}
          size={36}
          testID="kpi-restorative"
          explain={{ term: 'restorative', index }}
          label={t('term.restorative.name')}
          value={restorative}
          reason={day.sleep.stages?.reason ?? 'no-sleep'}
          unit="%"
          caption={t('lastNight.restorativeHint')}
          level={PARITY.stages}
        />
        <MetricTile
          {...tile}
          size={36}
          testID="kpi-latency"
          explain={{ term: 'latency', index }}
          label={t('term.latency.name')}
          value={events === null ? null : Math.round(events.latencyS / 60)}
          reason={stageReason}
          unit={t('lastNight.minUnit')}
          caption={t('lastNight.latencyHint')}
          level={PARITY.stages}
        />
        <MetricTile
          {...tile}
          size={36}
          testID="kpi-disturbances"
          explain={{ term: 'disturbances', index }}
          label={t('term.disturbances.name')}
          value={events === null ? null : events.disturbances}
          reason={stageReason}
          caption={t('lastNight.disturbancesHint')}
          level={PARITY.stages}
        />
        <MetricTile
          {...tile}
          size={36}
          testID="kpi-resp"
          explain={{ term: 'respiratoryRate', index }}
          label={t('metric.respiratoryRate')}
          value={resp}
          reason={day.respiratoryRate.reason}
          unit={t('unit.perMin')}
          decimals={1}
          chip={respChip}
          level={PARITY.respiratoryRate}
        />
      </View>

      <Card style={{ gap: spacing.md }} testID="card-timeline">
        <CardHeader title={t('sleep.timeline')} />
        {day.sleep.periods.length > 0 ? (
          <SleepTimeline periods={day.sleep.periods} tzOffsetS={day.tzOffsetS} />
        ) : (
          <AppText variant="body" muted>
            {t('sleep.noPeriods')}
          </AppText>
        )}
      </Card>

      <Card style={{ gap: 0 }} testID="card-in-bed">
        <CardHeader title={t('lastNight.inBedRows')} />
        <StatRow label={t('metric.asleep')} value={day.sleep.asleepS === null ? t('reason.no-sleep') : formatDuration(t, day.sleep.asleepS)} testID="row-asleep" />
        <Divider />
        <StatRow label={t('metric.inBed')} value={day.sleep.inBedS === null ? t('reason.no-sleep') : formatDuration(t, day.sleep.inBedS)} testID="row-in-bed" />
      </Card>

      {naps.length > 0 ? (
        <Card style={{ gap: 0 }} testID="card-naps">
          <CardHeader title={t('sleepx.naps')} />
          {naps.map((nap) => (
            <StatRow
              key={nap.onset}
              label={`${formatClock(nap.onset, day.tzOffsetS)} – ${formatClock(nap.offset, day.tzOffsetS)}`}
              caption={nap.source === 'manual' ? t('sleepx.sourceManual') : nap.source === 'edited' ? t('sleepx.sourceEdited') : undefined}
              value={formatDuration(t, nap.asleepS)}
            />
          ))}
        </Card>
      ) : null}

      <LevelNote level={PARITY.stages} text={t('lastNight.level')} testID="last-night-level" />
    </Page>
  );
}
