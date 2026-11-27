import type { DayRecord } from '@openhoop/core';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useAppData, useLive, useSyncProgress } from '@/data/context';
import type { HomeSection } from '@/data/userData';
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
import { FirstWeekCard } from './FirstWeekCard';
import { CoachPill, DashboardGrid, MorningBriefCard, MyDayCard, StressCard, TonightCard, VitalsCard, WeekCard } from './cards';

interface Props {
  days: readonly DayRecord[];
  index: number;
}

export function Notices({ day }: { day: DayRecord }) {
  const { device, days } = useAppData();
  const syncProgress = useSyncProgress();
  const state = pickDeviceState({ device, days, syncProgress, nowS: Math.floor(Date.now() / 1000) });
  return (
    <>
      <SyncBanner />
      <NoticeCard />
      {state !== null && state !== 'syncing' ? <DeviceStateCard /> : null}
      <FlagNotice flags={day.flags} />
    </>
  );
}

export function LiveHeartRateCard() {
  const { startLive, stopLive } = useAppData();
  const live = useLive();
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
  const { userData } = useAppData();
  const day = days[index];
  if (!day) return null;
  const sections: Record<HomeSection, ReactNode> = {
    summary: (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <VitalsCard days={days} index={index} />
        <StressCard days={days} index={index} />
      </View>
    ),
    brief: <MorningBriefCard days={days} index={index} />,
    coach: <CoachPill />,
    live: <LiveHeartRateCard />,
    myDay: <MyDayCard days={days} index={index} />,
    week: <WeekCard days={days} index={index} />,
    tonight: <TonightCard days={days} index={index} />,
    dashboard: (
      <>
        <CapRow
          title={t('home.dashboard')}
          links={[
            { label: t('home.allMetrics'), onPress: () => router.push('/health/metrics'), testID: 'link-all-metrics' },
            { label: t('common.edit'), onPress: () => router.push('/home/customize'), testID: 'link-edit-dashboard' },
          ]}
        />
        <DashboardGrid days={days} index={index} />
      </>
    ),
  };
  return (
    <>
      <Notices day={day} />
      <FirstWeekCard days={days} index={index} />
      {userData.homeSections.map((section) => (
        <View key={section} style={{ gap: spacing.md }}>
          {sections[section]}
        </View>
      ))}
      <Button variant="tertiary" icon="edit" label={t('home.customizeHome')} onPress={() => router.push('/home/customize')} testID="link-customize-home" />
    </>
  );
}
