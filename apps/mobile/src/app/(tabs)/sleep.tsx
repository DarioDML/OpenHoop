import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatDuration } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { FlagNotice } from '@/ui/FlagNotice';
import { MetricTile } from '@/ui/MetricTile';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { ScoreRing } from '@/ui/ScoreRing';
import { Section } from '@/ui/Section';
import { SleepTimeline } from '@/ui/SleepTimeline';
import { spacing } from '@/ui/theme';

export default function SleepScreen() {
  const { days } = useAppData();
  const { t, reason } = useT();
  const day = days[days.length - 1];

  if (!day) {
    return (
      <Screen>
        <EmptyState />
      </Screen>
    );
  }

  const { sleep } = day;
  const tile = { style: { flexBasis: '47%', flexGrow: 1 } } as const;
  const coverage = (value: number | null): string | undefined =>
    value === null ? undefined : t('sleep.coverage', { pct: Math.round(value * 100) });
  const duration = (seconds: number): string => formatDuration(t, seconds);
  const noSleepReason = (value: number | null): string | null => (value === null ? 'no-sleep' : null);

  return (
    <Screen>
      <FlagNotice flags={day.flags} />
      <View style={{ alignItems: 'center' }}>
        <ScoreRing
          testID="ring-sleep-score"
          label={t('metric.sleepScore')}
          value={sleep.score.value}
          max={100}
          level={PARITY.sleepScore}
          reason={sleep.score.reason}
          size={150}
          strokeWidth={12}
        />
      </View>

      <Section title={t('sleep.timeline')}>
        <Card>
          {sleep.periods.length > 0 ? (
            <SleepTimeline periods={sleep.periods} tzOffsetS={day.tzOffsetS} />
          ) : (
            <AppText variant="body" muted>
              {t('sleep.noPeriods')} {reason('no-sleep')}
            </AppText>
          )}
        </Card>
      </Section>

      <Section title={t('sleep.summary')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <MetricTile {...tile} testID="tile-asleep" label={t('metric.asleep')} value={sleep.asleepS} reason={noSleepReason(sleep.asleepS)} format={duration} level={PARITY.sleep} />
          <MetricTile {...tile} testID="tile-inbed" label={t('metric.inBed')} value={sleep.inBedS} reason={noSleepReason(sleep.inBedS)} format={duration} level={PARITY.sleep} />
          <MetricTile {...tile} testID="tile-need" label={t('metric.need')} value={sleep.need.value} reason={sleep.need.reason} format={duration} level={PARITY.sleepNeed} />
          <MetricTile {...tile} testID="tile-debt" label={t('metric.debt')} value={sleep.debt.value} reason={sleep.debt.reason} format={duration} level={PARITY.sleepNeed} />
          <MetricTile
            {...tile}
            testID="tile-consistency"
            label={t('metric.consistency')}
            value={sleep.consistency.value}
            reason={sleep.consistency.reason}
            unit={t('unit.percent')}
            level={PARITY.consistency}
          />
        </View>
      </Section>

      <Section title={t('sleep.signals')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <MetricTile {...tile} label={t('metric.hrv')} value={day.hrv.value} reason={day.hrv.reason} unit={t('unit.ms')} level={PARITY.hrv} caption={coverage(day.hrv.coverage)} />
          <MetricTile {...tile} label={t('metric.restingHr')} value={day.restingHr.value} reason={day.restingHr.reason} unit={t('unit.bpm')} level={PARITY.restingHr} caption={coverage(day.restingHr.coverage)} />
          <MetricTile {...tile} label={t('metric.respiratoryRate')} value={day.respiratoryRate.value} reason={day.respiratoryRate.reason} unit={t('unit.perMin')} level={PARITY.respiratoryRate} decimals={1} caption={coverage(day.respiratoryRate.coverage)} />
          <MetricTile {...tile} label={t('metric.spo2')} value={day.spo2.value} reason={day.spo2.reason} unit={t('unit.percent')} level={PARITY.spo2} decimals={1} caption={coverage(day.spo2.coverage)} />
          <MetricTile {...tile} label={t('metric.skinTemp')} value={day.skinTempC.value} reason={day.skinTempC.reason} unit={t('unit.celsius')} level={PARITY.skinTemp} decimals={1} caption={coverage(day.skinTempC.coverage)} />
          <MetricTile {...tile} label={t('metric.skinTempDeviation')} value={day.skinTempDeviationC.value} reason={day.skinTempDeviationC.reason} unit={t('unit.celsiusDelta')} level={PARITY.skinTemp} decimals={2} caption={coverage(day.skinTempDeviationC.coverage)} />
        </View>
      </Section>
    </Screen>
  );
}
