import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/controls';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { FlagNotice } from '@/ui/FlagNotice';
import { MetricTile } from '@/ui/MetricTile';
import { NoticeCard } from '@/ui/NoticeCard';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { ScoreRing } from '@/ui/ScoreRing';
import { Section } from '@/ui/Section';
import { SyncBanner } from '@/ui/SyncBanner';
import { spacing } from '@/ui/theme';

export default function TodayScreen() {
  const { days, live, startLive, stopLive } = useAppData();
  const { t, language } = useT();
  const day = days[days.length - 1];

  if (!day) {
    return (
      <Screen>
        <SyncBanner />
        <NoticeCard />
        <EmptyState />
      </Screen>
    );
  }

  const calibrating = day.readinessCalibrating;
  const tile = { style: { flexBasis: '47%', flexGrow: 1 } } as const;

  return (
    <Screen>
      <SyncBanner />
      <NoticeCard />
      <FlagNotice flags={day.flags} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/readiness')} style={{ flex: 1 }}>
          <ScoreRing
            testID="ring-readiness"
            label={t('score.readiness')}
            value={day.readiness.value}
            max={100}
            level={PARITY.readiness}
            reason={day.readiness.reason}
            calibrating={calibrating}
          />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/load')} style={{ flex: 1 }}>
          <ScoreRing
            testID="ring-load"
            label={t('score.load')}
            value={day.load.value}
            max={21}
            level={PARITY.load}
            reason={day.load.reason}
            decimals={1}
          />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/sleep')} style={{ flex: 1 }}>
          <ScoreRing
            testID="ring-sleep"
            label={t('score.sleep')}
            value={day.sleep.score.value}
            max={100}
            level={PARITY.sleepScore}
            reason={day.sleep.score.reason}
          />
        </Pressable>
      </View>
      {calibrating ? (
        <Card tone="warning">
          <AppText variant="label">{t('calibrating.hint')}</AppText>
        </Card>
      ) : null}

      <Section title={t('today.live')}>
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <AppText variant="display" numeric>
                  {live.active && live.heartRate !== null ? formatNumber(live.heartRate, 0, language) : '–'}
                </AppText>
                <AppText variant="label" muted>
                  {t('unit.bpm')}
                </AppText>
              </View>
              <AppText variant="label" muted>
                {!live.active ? t('today.liveIdle') : live.lastRrMs !== null ? t('today.liveRr', { value: live.lastRrMs }) : t('today.liveWaiting')}
              </AppText>
            </View>
            <View style={{ width: 120 }}>
              <Button
                label={live.active ? t('today.liveStop') : t('today.liveStart')}
                variant={live.active ? 'secondary' : 'primary'}
                onPress={() => void (live.active ? stopLive() : startLive())}
                testID="live-toggle"
              />
            </View>
          </View>
        </Card>
      </Section>

      <Section title={t('today.vitals')} hint={t('today.vitalsHint')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <MetricTile {...tile} testID="tile-hrv" label={t('metric.hrv')} value={day.hrv.value} reason={day.hrv.reason} unit={t('unit.ms')} level={PARITY.hrv} decimals={0} />
          <MetricTile {...tile} testID="tile-rhr" label={t('metric.restingHr')} value={day.restingHr.value} reason={day.restingHr.reason} unit={t('unit.bpm')} level={PARITY.restingHr} />
          <MetricTile {...tile} testID="tile-resp" label={t('metric.respiratoryRate')} value={day.respiratoryRate.value} reason={day.respiratoryRate.reason} unit={t('unit.perMin')} level={PARITY.respiratoryRate} decimals={1} />
          <MetricTile {...tile} testID="tile-spo2" label={t('metric.spo2')} value={day.spo2.value} reason={day.spo2.reason} unit={t('unit.percent')} level={PARITY.spo2} decimals={1} />
          <MetricTile {...tile} testID="tile-temp" label={t('metric.skinTemp')} value={day.skinTempC.value} reason={day.skinTempC.reason} unit={t('unit.celsius')} level={PARITY.skinTemp} decimals={1} />
          <MetricTile {...tile} testID="tile-steps" label={t('metric.steps')} value={day.steps} reason={day.steps === null ? 'no-data' : null} level={PARITY.steps} />
        </View>
      </Section>
    </Screen>
  );
}
