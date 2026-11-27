import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { addDays } from '@/data/derived';
import { formatLongDay, indexOfDay, isDayString, singleParam } from '@/data/dailyDerived';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { CoachAsk } from '@/ui/CoachAsk';
import { NoDataPage } from '@/ui/daily/bits';
import { MyDayCard, StressCard, VitalsCard } from '@/ui/daily/cards';
import { Hero } from '@/ui/daily/Hero';
import { ChevronButton } from '@/ui/daily/HomeHeader';
import { Notices } from '@/ui/daily/HomeBody';
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme } from '@/ui/theme';
import { IconButton, TopBar } from '@/ui/TopBar';

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

  const label = formatLongDay(record.day, language);
  const prevDay = addDays(record.day, -1);
  const nextDay = addDays(record.day, 1);
  const nextIndex = indexOfDay(days, nextDay);
  const goDay = (target: string, isToday: boolean): void => {
    if (isToday) router.replace('/');
    else router.replace(`/day/${target}`);
  };

  return (
    <Screen
      tint="home"
      testID="past-day"
      header={
        <>
          <TopBar
            center={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <ChevronButton direction="prev" enabled={indexOfDay(days, prevDay) >= 0} label={t('home.previousDay')} onPress={() => goDay(prevDay, false)} />
                <AppText variant="screenTitle" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="past-day-title">
                  {label}
                </AppText>
                <ChevronButton direction="next" enabled={nextIndex >= 0} label={t('home.nextDay')} onPress={() => goDay(nextDay, nextIndex === days.length - 1)} />
              </View>
            }
            right={
              <IconButton
                icon="calendar"
                label={t('home.pickDay')}
                color={colors.text}
                onPress={() => router.push(`/home/date-picker?day=${record.day}`)}
                testID="past-day-calendar"
              />
            }
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.md,
              minHeight: 48,
              paddingLeft: spacing.lg,
              paddingRight: spacing.xs,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
            }}>
            <AppText variant="bodyStrong" color={colors.primaryOn} numberOfLines={1} style={{ flexShrink: 1 }}>
              {t('home.viewing', { day: label })}
            </AppText>
            <Pressable
              testID="back-today"
              accessibilityRole="link"
              onPress={() => router.replace('/')}
              hitSlop={6}
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md }}>
              <AppText variant="cap" color={colors.primaryOn}>
                {t('daily.backToToday')} →
              </AppText>
            </Pressable>
          </View>
          <Hero days={days} index={index} variant={userData.homeHero} />
        </>
      }>
      <Notices day={record} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <VitalsCard days={days} index={index} big />
        <StressCard days={days} index={index} big />
      </View>
      <MyDayCard days={days} index={index} actions={false} />
      <CoachAsk question={t('home.askAboutDay', { day: label })} testID="past-day-ask" />
    </Screen>
  );
}
