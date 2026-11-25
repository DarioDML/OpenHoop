import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatAgo } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Hero } from '@/ui/daily/Hero';
import { HomeBody } from '@/ui/daily/HomeBody';
import { HomeHeader } from '@/ui/daily/HomeHeader';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { SyncBanner } from '@/ui/SyncBanner';
import { NoticeCard } from '@/ui/NoticeCard';
import { DeviceStateCard } from '@/ui/manage/DeviceStateCard';
import { useTheme } from '@/ui/theme';

export default function HomeScreen() {
  const { days, device, userData, sync } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const index = days.length - 1;
  const day = days[index];

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await sync();
    } catch {
      // the controller reports sync failures through the notice card
    } finally {
      setRefreshing(false);
    }
  };

  if (!day) {
    return (
      <Screen withTabBar tint="home" onRefresh={() => void onRefresh()} refreshing={refreshing} testID="home-empty">
        <SyncBanner />
        <NoticeCard />
        <DeviceStateCard />
        <EmptyState />
      </Screen>
    );
  }

  const nowS = Math.floor(Date.now() / 1000);
  const syncedText = device.lastSyncAt === null ? t('home.neverSynced') : t('home.synced', { ago: formatAgo(t, nowS, device.lastSyncAt) });

  return (
    <Screen
      withTabBar
      tint="home"
      testID="home"
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      header={
        <>
          <HomeHeader days={days} index={index} />
          <Hero days={days} index={index} variant={userData.homeHero} />
          <View style={{ alignItems: 'center' }}>
            <AppText variant="caption" color={colors.textMuted} testID="synced-line" style={{ textAlign: 'center' }}>
              {syncedText}
            </AppText>
          </View>
        </>
      }>
      <HomeBody days={days} index={index} />
    </Screen>
  );
}

