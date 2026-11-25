import type { DayRecord } from '@openhoop/core';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { addDays, wearStreak } from '@/data/derived';
import { formatLongDay, indexOfDay } from '@/data/dailyDerived';
import { initialOf } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { todayIso } from '@/lib/format';
import { unreadCount } from '@/lib/notificationPlan';
import { AppText } from '@/ui/AppText';
import { Icon } from '@/ui/Icon';
import { radius, useTheme } from '@/ui/theme';

interface Props {
  days: readonly DayRecord[];
  index: number;
}

function ChevronButton({ direction, enabled, onPress, label }: { direction: 'prev' | 'next'; enabled: boolean; onPress: () => void; label: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={`day-${direction}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : 0.3 }}>
      <AppText variant="title" color={colors.text}>
        {direction === 'prev' ? '‹' : '›'}
      </AppText>
    </Pressable>
  );
}

export function HomeHeader({ days, index }: Props) {
  const { colors } = useTheme();
  const { t, language } = useT();
  const { userData, device, inbox } = useAppData();
  const unread = unreadCount(inbox);
  const day = days[index];
  if (!day) return null;
  const isToday = index === days.length - 1;
  const initial = initialOf(userData.name);
  const streak = wearStreak(days);
  const prevDay = addDays(day.day, -1);
  const nextDay = addDays(day.day, 1);
  const hasPrev = indexOfDay(days, prevDay) >= 0;
  const hasNext = indexOfDay(days, nextDay) >= 0;
  const goDay = (target: string, targetIsToday: boolean): void => {
    if (targetIsToday) router.replace('/');
    else router.replace(`/day/${target}`);
  };
  const connectionColor =
    device.connection === 'connected' || device.connection === 'syncing' ? colors.positive : device.connection === 'connecting' ? colors.warning : colors.textFaint;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          testID="avatar"
          accessibilityRole="button"
          accessibilityLabel={t('home.profile')}
          onPress={() => router.push('/profile')}
          style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          {initial !== null ? (
            <AppText variant="cardTitle" testID="avatar-initial">
              {initial}
            </AppText>
          ) : (
            <Icon name="user" color={colors.textMuted} size={20} />
          )}
        </Pressable>
        {streak > 0 ? (
          <View
            testID="streak-chip"
            accessible
            accessibilityLabel={t('home.streak', { count: streak })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 32, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}>
            <Icon name="flame" color={colors.metric.streak} size={14} />
            <AppText variant="label" numeric style={{ fontWeight: '600' }}>
              {streak}
            </AppText>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {device.batteryPercent !== null ? (
          <View
            testID="battery-chip"
            accessible
            accessibilityLabel={t('home.battery', { percent: device.batteryPercent })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 32, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: connectionColor }} />
            <AppText variant="label" numeric style={{ fontWeight: '600' }}>
              {device.batteryPercent}%
            </AppText>
          </View>
        ) : null}
        <Pressable
          testID="bell"
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? t('home.notif.bellUnread', { count: unread }) : t('home.notifications')}
          onPress={() => router.push('/home/notifications')}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="bell" color={colors.text} size={22} />
          {unread > 0 ? (
            <View
              testID="bell-badge"
              style={{
                position: 'absolute',
                top: 6,
                right: 4,
                minWidth: 18,
                height: 18,
                paddingHorizontal: 4,
                borderRadius: radius.pill,
                backgroundColor: colors.negative,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <AppText variant="caption" numeric color={colors.primaryOn} style={{ fontWeight: '700' }}>
                {unread > 9 ? '9+' : unread}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <ChevronButton direction="prev" enabled={hasPrev} label={t('home.previousDay')} onPress={() => (isToday ? router.push(`/day/${prevDay}`) : goDay(prevDay, false))} />
        <Pressable
          testID="day-label"
          accessibilityRole="button"
          accessibilityLabel={t('home.pickDay')}
          onPress={() => router.push('/home/date-picker')}
          style={{ minWidth: 120, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="cardTitle">{day.day === todayIso(new Date()) ? t('common.today') : formatLongDay(day.day, language)}</AppText>
        </Pressable>
        <ChevronButton direction="next" enabled={hasNext} label={t('home.nextDay')} onPress={() => goDay(nextDay, indexOfDay(days, nextDay) === days.length - 1)} />
      </View>
    </View>
  );
}
