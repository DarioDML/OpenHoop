import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatHm, formatLongDay, indexOfDay, isDayString, mainNightSpan, mainPeriod, singleParam } from '@/data/dailyDerived';
import { baselineAt } from '@/data/derived';
import type { StageEpochRow } from '@openhoop/core';

import type { HeartRatePoint } from '@/data/types';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Divider, NoDataPage, Page, StatRow, useRangeChip } from '@/ui/daily/bits';
import { LineChart } from '@/ui/LineChart';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { SleepTimeline } from '@/ui/SleepTimeline';
import { StageCard } from '@/ui/StageCard';
import { spacing, useTheme } from '@/ui/theme';

const HR_BUCKET_S = 600;

export default function LastNightScreen() {
  const params = useLocalSearchParams<{ day?: string | string[] }>();
  const { days, heartRateBetween, sleepStagesBetween } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const rangeChip = useRangeChip();
  const requested = singleParam(params.day);
  const index = requested === null ? days.length - 1 : isDayString(requested) ? indexOfDay(days, requested) : -1;
  const day = days[index];
  const main = day ? mainPeriod(day) : null;
  const [points, setPoints] = useState<HeartRatePoint[]>([]);
  const [epochs, setEpochs] = useState<StageEpochRow[]>([]);
  const onset = main?.onset ?? null;
  const offset = main?.offset ?? null;
  const night = day ? mainNightSpan(day) : null;
  const nightOnset = night?.onset ?? null;
  const nightOffset = night?.offset ?? null;
  const staged = (day?.sleep.stages?.totals ?? null) !== null;

  useEffect(() => {
    if (onset === null || offset === null) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    void heartRateBetween(onset, offset, HR_BUCKET_S).then(
      (result) => {
        if (!cancelled) setPoints(result);
      },
      () => {
        if (!cancelled) setPoints([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [heartRateBetween, onset, offset]);

  useEffect(() => {
    if (nightOnset === null || nightOffset === null || !staged) {
      setEpochs([]);
      return;
    }
    let cancelled = false;
    void sleepStagesBetween(nightOnset, nightOffset + 1).then(
      (result) => {
        if (!cancelled) setEpochs(result);
      },
      () => {
        if (!cancelled) setEpochs([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sleepStagesBetween, nightOnset, nightOffset, staged]);

  if (!day) {
    return <NoDataPage title={t('sleepx.lastNight')} body={requested !== null && !isDayString(requested) ? t('daily.invalidDay') : t('sleepx.noNight')} />;
  }

  const naps = day.sleep.periods.filter((p) => p.nap);
  const minHr = points.length > 0 ? Math.min(...points.map((p) => p.hr)) : null;
  const resp = day.respiratoryRate.value;
  const respChip = rangeChip(resp, baselineAt(days, index, 'respiratoryRate'), 1);

  return (
    <Page
      title={t('sleepx.lastNight')}
      tint="sleep"
      testID="last-night"
      hero={
        <View style={{ gap: 6 }}>
          <AppText variant="capSmall" muted>
            {t('sleepx.timeAsleep')} · {formatLongDay(day.day, language)}
          </AppText>
          <AppText variant="display" numeric testID="asleep-total">
            {day.sleep.asleepS === null ? t('reason.no-sleep') : formatHm(day.sleep.asleepS)}
          </AppText>
          {main ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText variant="label" muted numeric>
                {formatClock(main.onset, day.tzOffsetS)} – {formatClock(main.offset, day.tzOffsetS)}
              </AppText>
              {main.source === 'edited' ? <Chip label={t('sleepx.sourceEdited')} tone="info" small testID="night-edited" /> : null}
            </View>
          ) : null}
        </View>
      }>
      <Card style={{ gap: spacing.md }}>
        <CardHeader title={t('sleep.timeline')} />
        {day.sleep.periods.length > 0 ? (
          <SleepTimeline periods={day.sleep.periods} tzOffsetS={day.tzOffsetS} />
        ) : (
          <AppText variant="body" muted>
            {t('sleep.noPeriods')}
          </AppText>
        )}
      </Card>

      <Card style={{ gap: spacing.md }} testID="card-hr">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="cardTitle">{t('metric.heartRate')}</AppText>
          <ParityBadge level={PARITY.heartRate} />
        </View>
        {main && points.length > 0 ? (
          <>
            <AppText variant="label" muted numeric testID="hr-min">
              {t('sleepx.hrMin', { value: formatNumber(minHr ?? 0, 0, language) })}
            </AppText>
            <LineChart
              testID="chart-sleep-hr"
              data={points.map((p) => p.hr)}
              minSpan={10}
              color={colors.negative}
              formatTick={(v) => formatNumber(v, 0, language)}
              emptyLabel={t('trends.noValues')}
              startLabel={formatClock(main.onset, day.tzOffsetS)}
              endLabel={formatClock(main.offset, day.tzOffsetS)}
            />
          </>
        ) : (
          <AppText variant="body" muted>
            {t('sleepx.noHr')}
          </AppText>
        )}
      </Card>

      <StageCard
        stages={day.sleep.stages}
        hypnogram={night ? { epochs, from: night.onset, to: night.offset + 1, tzOffsetS: day.tzOffsetS } : undefined}
        edited={day.sleep.periods.some((p) => !p.nap && p.source === 'edited')}
      />

      <Card style={{ gap: 0 }}>
        <StatRow label={t('metric.asleep')} value={day.sleep.asleepS === null ? '–' : formatDuration(t, day.sleep.asleepS)} />
        <Divider />
        <StatRow label={t('metric.inBed')} value={day.sleep.inBedS === null ? '–' : formatDuration(t, day.sleep.inBedS)} />
        <Divider />
        <StatRow
          label={t('metric.respiratoryRate')}
          value={resp === null ? '–' : `${formatNumber(resp, 1, language)} ${t('unit.perMin')}`}
          right={respChip ? <Chip label={respChip.label} tone={respChip.tone} small /> : undefined}
        />
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

      <Card style={{ gap: 0 }}>
        <StatRow testID="link-edit-sleep" label={t('sleepx.editLink')} value="" href={`/sleep/edit?day=${day.day}`} />
      </Card>
    </Page>
  );
}
