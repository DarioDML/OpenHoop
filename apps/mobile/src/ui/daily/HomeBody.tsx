import type { DayRecord } from '@openhoop/core';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { FlagNotice } from '@/ui/FlagNotice';
import { DeviceStateCard } from '@/ui/manage/DeviceStateCard';
import { pickDeviceState } from '@/ui/manage/deviceState';
import { NoticeCard } from '@/ui/NoticeCard';
import { SyncBanner } from '@/ui/SyncBanner';
import { spacing } from '@/ui/theme';

import { CapRow } from './bits';
import { CoachPill, DashboardGrid, MorningBriefCard, MyDayCard, StressCard, TonightCard, VitalsCard, WeekCard } from './cards';

interface Props {
  days: readonly DayRecord[];
  index: number;
}

export function Notices({ day }: { day: DayRecord }) {
  const { t } = useT();
  const { device, days, syncProgress } = useAppData();
  const state = pickDeviceState({ device, days, syncProgress, nowS: Math.floor(Date.now() / 1000) });
  return (
    <>
      <SyncBanner />
      <NoticeCard />
      {state !== null && state !== 'syncing' ? <DeviceStateCard /> : null}
      <FlagNotice flags={day.flags} />
      {day.readinessCalibrating ? (
        <Card tone="warning" testID="calibrating-hint">
          <AppText variant="label">{t('calibrating.hint')}</AppText>
        </Card>
      ) : null}
    </>
  );
}

export function LiveHeartRateCard() {
  const { live, startLive, stopLive } = useAppData();
  const { t, language } = useT();
  return (
    <Card testID="card-live" style={{ gap: spacing.md }}>
      <AppText variant="capSmall" muted>
        {t('today.live')}
      </AppText>
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
  );
}

export function HomeBody({ days, index }: Props) {
  const { t } = useT();
  const day = days[index];
  if (!day) return null;
  return (
    <>
      <Notices day={day} />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <VitalsCard days={days} index={index} />
        <StressCard />
      </View>
      <MorningBriefCard days={days} index={index} />
      <CoachPill />
      <LiveHeartRateCard />
      <MyDayCard days={days} index={index} />
      <WeekCard days={days} index={index} />
      <TonightCard days={days} index={index} />
      <CapRow
        title={t('home.dashboard')}
        links={[
          { label: t('home.allMetrics'), onPress: () => router.push('/health/metrics'), testID: 'link-all-metrics' },
          { label: t('common.edit'), onPress: () => router.push('/home/customize'), testID: 'link-edit-dashboard' },
        ]}
      />
      <DashboardGrid days={days} index={index} />
    </>
  );
}
