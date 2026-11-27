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

export function ChevronButton({ direction, enabled, onPress, label }: { direction: 'prev' | 'next'; enabled: boolean; onPress: () => void; label: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={`day-${direction}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={{ left: 6, right: 6 }}
      style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={direction === 'prev' ? 'back' : 'chevronRight'} color={enabled ? colors.textMuted : colors.textFaint} size={18} strokeWidth={2} />
    </Pressable>
  );
}

function BatteryGlyph({ percent }: { percent: number }) {
  const { colors } = useTheme();
  const fill = Math.max(0, Math.min(100, percent)) / 100;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 19, height: 11, borderRadius: 3, borderWidth: 1.5, borderColor: colors.textMuted, padding: 1.5 }}>
        <View style={{ width: `${fill * 100}%`, height: '100%', borderRadius: 1, backgroundColor: percent <= 15 ? colors.negative : colors.text }} />
      </View>
      <View style={{ width: 2, height: 4, marginLeft: 1, borderRadius: 1, backgroundColor: colors.textMuted }} />
    </View>
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
  const dayLabel = day.day === todayIso(new Date()) ? t('common.today') : formatLongDay(day.day, language);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 6 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          testID="avatar"
          accessibilityRole="button"
          accessibilityLabel={t('home.profile')}
          onPress={() => router.push('/profile')}
          hitSlop={4}
          style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
          {initial !== null ? (
            <AppText variant="bodyStrong" testID="avatar-initial">
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
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}>
            <Icon name="flame" color={colors.metric.streak} size={14} strokeWidth={2} />
            <AppText variant="label" numeric style={{ fontWeight: '600' }}>
              {streak}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <ChevronButton direction="prev" enabled={hasPrev} label={t('home.previousDay')} onPress={() => (isToday ? router.push(`/day/${prevDay}`) : goDay(prevDay, false))} />
        <Pressable
          testID="day-label"
          accessibilityRole="button"
          accessibilityLabel={`${dayLabel}. ${t('home.pickDay')}`}
          onPress={() => router.push('/home/date-picker')}
          style={{ minHeight: 44, maxWidth: 140, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="screenTitle" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ letterSpacing: 2.7 }}>
            {dayLabel}
          </AppText>
        </Pressable>
        <ChevronButton direction="next" enabled={hasNext} label={t('home.nextDay')} onPress={() => goDay(nextDay, indexOfDay(days, nextDay) === days.length - 1)} />
      </View>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        <Pressable
          testID="bell"
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? t('home.notif.bellUnread', { count: unread }) : t('home.notifications')}
          onPress={() => router.push('/home/notifications')}
          hitSlop={{ left: 6, right: 6 }}
          style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="bell" color={colors.textMuted} size={20} />
          {unread > 0 ? (
            <View
              testID="bell-badge"
              style={{
                position: 'absolute',
                top: 6,
                right: -4,
                minWidth: 16,
                height: 16,
                paddingHorizontal: 3,
                borderRadius: radius.pill,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <AppText variant="caption" numeric color={colors.accentOn} style={{ fontWeight: '700', fontSize: 10, lineHeight: 12 }}>
                {unread > 9 ? '9+' : unread}
              </AppText>
            </View>
          ) : null}
        </Pressable>
        {device.batteryPercent !== null ? (
          <View
            testID="battery-chip"
            accessible
            accessibilityLabel={t('home.battery', { percent: device.batteryPercent })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="label" numeric muted style={{ fontWeight: '600' }}>
              {device.batteryPercent}%
            </AppText>
            <BatteryGlyph percent={device.batteryPercent} />
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: connectionColor }} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
