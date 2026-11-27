import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatWeekday, isLoadDay } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { addDays, daysInWeek, visibleReadiness, weekStart } from '@/data/derived';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { NoDataScreen, ProgressBar } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { Num } from '@/ui/Num';
import { Screen } from '@/ui/Screen';
import { readinessColor, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

export default function LoadWeekScreen() {
  const { days } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const [offset, setOffset] = useState(0);
  const latest = days[days.length - 1];
  if (!latest) return <NoDataScreen title={t('loadx.week.title')} />;

  const first = days[0]?.day ?? latest.day;
  const start = addDays(weekStart(latest.day), offset * 7);
  const week = daysInWeek(days, start);
  const canGoBack = addDays(start, -1) >= weekStart(first);
  const canGoForward = offset < 0;
  const fmt = (v: number, d = 1): string => formatNumber(v, d, language);
  const present = week.map((d) => d?.load.value ?? null).filter((v): v is number => v !== null);
  const total = present.reduce((a, b) => a + b, 0);

  const nav = (delta: number, enabled: boolean, label: string, icon: 'back' | 'chevronRight') => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={() => setOffset(offset + delta)}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : 0.3 }}>
      <Icon name={icon} color={colors.text} size={22} />
    </Pressable>
  );

  return (
    <Screen
      tint="load"
      header={
        <>
          <TopBar title={t('loadx.week.title')} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {nav(-1, canGoBack, t('loadx.week.prev'), 'back')}
            <AppText variant="bodyStrong" testID="week-range">
              {formatShortDay(start, language)} – {formatShortDay(addDays(start, 6), language)}
            </AppText>
            {nav(1, canGoForward, t('loadx.week.next'), 'chevronRight')}
          </View>
        </>
      }>
      {present.length === 0 ? (
        <Card>
          <AppText variant="body" muted>
            {t('loadx.week.empty')}
          </AppText>
        </Card>
      ) : (
        <AppText variant="label" muted>
          {t('loadx.week.summary', { total: fmt(total), count: week.filter((d) => isLoadDay(d)).length })}
        </AppText>
      )}
      {week.map((d, i) => {
        const date = addDays(start, i);
        const loadValue = d?.load.value ?? null;
        const readinessValue = d ? visibleReadiness(d).value : null;
        const body = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 44 }}>
              <AppText variant="bodyStrong">{formatWeekday(date, language)}</AppText>
              <AppText variant="caption" muted>
                {formatShortDay(date, language)}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              {loadValue !== null ? (
                <ProgressBar fraction={loadValue / 21} color={colors.metric.loadBright} label={`${t('score.load')} ${fmt(loadValue)}`} />
              ) : (
                <AppText variant="caption" muted>
                  {d ? t('loadx.week.noLoad') : t('loadx.week.noData')}
                </AppText>
              )}
            </View>
            <View style={{ width: 52, alignItems: 'flex-end' }}>
              <Num size={24} testID={`week-load-${i}`}>
                {loadValue !== null ? fmt(loadValue) : ''}
              </Num>
            </View>
            <View style={{ width: 40, alignItems: 'flex-end' }}>
              <Num size={24} color={readinessColor(colors, readinessValue)}>
                {readinessValue !== null ? fmt(readinessValue, 0) : ''}
              </Num>
            </View>
          </View>
        );
        return d ? (
          <Card key={date} onPress={() => router.push({ pathname: '/day/[day]', params: { day: date } })} accessibilityLabel={formatWeekday(date, language, 'long')}>
            {body}
          </Card>
        ) : (
          <Card key={date} tone="outline">
            {body}
          </Card>
        );
      })}
      <View style={{ flexDirection: 'row', gap: spacing.lg, justifyContent: 'flex-end' }}>
        <AppText variant="caption" muted>
          {t('score.load')}
        </AppText>
        <AppText variant="caption" muted>
          {t('score.readiness')}
        </AppText>
      </View>
    </Screen>
  );
}
