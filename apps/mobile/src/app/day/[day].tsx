import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatLongDay, indexOfDay, isDayString, singleParam } from '@/data/dailyDerived';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { NoDataPage } from '@/ui/daily/bits';
import { CoachPill, MyDayCard, StressCard, VitalsCard } from '@/ui/daily/cards';
import { Hero } from '@/ui/daily/Hero';
import { HomeHeader } from '@/ui/daily/HomeHeader';
import { Notices } from '@/ui/daily/HomeBody';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';

export default function PastDayScreen() {
  const params = useLocalSearchParams<{ day?: string | string[] }>();
  const { days, userData } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const day = singleParam(params.day);
  const index = isDayString(day) ? indexOfDay(days, day) : -1;
  const record = days[index];

  if (!isDayString(day) || !record) {
    return <NoDataPage title={t('home.pastDay')} body={isDayString(day) ? t('daily.noDataBody', { day: formatLongDay(day, language) }) : t('daily.invalidDay')} />;
  }

  return (
    <Screen
      tint="home"
      testID="past-day"
      header={
        <>
          <HomeHeader days={days} index={index} />
          <Hero days={days} index={index} variant={userData.homeHero} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.md }}>
            <AppText variant="caption" muted>
              {t('home.viewing', { day: formatLongDay(record.day, language) })}
            </AppText>
            <Pressable testID="back-today" accessibilityRole="link" onPress={() => router.replace('/')} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText variant="caption" color={colors.link}>
                {t('daily.backToToday')} →
              </AppText>
            </Pressable>
          </View>
        </>
      }>
      <Notices day={record} />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <VitalsCard days={days} index={index} />
        <StressCard days={days} index={index} />
      </View>
      <MyDayCard days={days} index={index} actions={false} />
      <CoachPill />
    </Screen>
  );
}

