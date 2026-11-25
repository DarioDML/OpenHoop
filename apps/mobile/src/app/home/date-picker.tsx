import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatMonthTitle, monthGrid, shiftMonth, weekdayInitials } from '@/data/dailyDerived';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Page } from '@/ui/daily/bits';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { StateCard } from '@/ui/StateCard';
import { readinessColor, spacing, useTheme } from '@/ui/theme';

function monthOf(day: string): { year: number; month: number } {
  const [y, m] = day.split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1 };
}

export default function DatePickerScreen() {
  const { days } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const first = days[0];
  const last = days[days.length - 1];
  const [shown, setShown] = useState(() => (last ? monthOf(last.day) : { year: 1970, month: 1 }));

  if (!first || !last) {
    return (
      <Page title={t('home.pickDay')} testID="date-picker">
        <StateCard icon="calendar" tone="neutral" title={t('empty.title')} body={t('empty.body')} />
      </Page>
    );
  }

  const byDay = new Map(days.map((d) => [d.day, d]));
  const min = monthOf(first.day);
  const max = monthOf(last.day);
  const index = (m: { year: number; month: number }): number => m.year * 12 + m.month;
  const canPrev = index(shown) > index(min);
  const canNext = index(shown) < index(max);
  const weeks = monthGrid(shown.year, shown.month);
  const initials = weekdayInitials(language);

  const pick = (day: string): void => {
    if (day === last.day) router.replace('/');
    else router.replace(`/day/${day}`);
  };

  return (
    <Page title={t('home.pickDay')} testID="date-picker" footer={<Button label={t('common.today')} variant="secondary" onPress={() => router.replace('/')} testID="picker-today" />}>
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            testID="month-prev"
            accessibilityRole="button"
            accessibilityLabel={t('home.previousMonth')}
            disabled={!canPrev}
            onPress={() => setShown(shiftMonth(shown.year, shown.month, -1))}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: canPrev ? 1 : 0.3 }}>
            <AppText variant="title">‹</AppText>
          </Pressable>
          <AppText variant="cardTitle" testID="month-title" style={{ textTransform: 'capitalize' }}>
            {formatMonthTitle(shown.year, shown.month, language)}
          </AppText>
          <Pressable
            testID="month-next"
            accessibilityRole="button"
            accessibilityLabel={t('home.nextMonth')}
            disabled={!canNext}
            onPress={() => setShown(shiftMonth(shown.year, shown.month, 1))}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: canNext ? 1 : 0.3 }}>
            <AppText variant="title">›</AppText>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row' }}>
          {initials.map((letter, i) => (
            <AppText key={i} variant="capSmall" muted style={{ flex: 1, textAlign: 'center' }}>
              {letter}
            </AppText>
          ))}
        </View>
        {weeks.map((week, w) => (
          <View key={w} style={{ flexDirection: 'row' }}>
            {week.map((cell, c) => {
              if (cell.day === null) return <View key={c} style={{ flex: 1, height: 48 }} />;
              const record = byDay.get(cell.day);
              const dayNumber = Number(cell.day.slice(8));
              if (!record) {
                return (
                  <View key={c} style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                    <AppText variant="body" color={colors.textFaint}>
                      {dayNumber}
                    </AppText>
                  </View>
                );
              }
              const tone = record.readinessCalibrating ? colors.textMuted : readinessColor(colors, record.readiness.value);
              const isLast = record.day === last.day;
              return (
                <Pressable
                  key={c}
                  testID={`cal-${record.day}`}
                  accessibilityRole="button"
                  accessibilityLabel={record.day}
                  onPress={() => pick(record.day)}
                  style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                  <View
                    style={{
                      minWidth: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: isLast ? 2 : 0,
                      borderColor: colors.text,
                    }}>
                    <AppText variant="body" style={{ fontWeight: '600' }}>
                      {dayNumber}
                    </AppText>
                  </View>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: record.readiness.value === null ? 'transparent' : tone }} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </Card>
      <View style={{ flexDirection: 'row', gap: spacing.lg, justifyContent: 'center' }}>
        {([['high', colors.metric.readinessHigh], ['medium', colors.metric.readinessMid], ['low', colors.metric.readinessLow]] as const).map(([band, color]) => (
          <View key={band} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <AppText variant="caption" muted>
              {t(`readiness.${band}`)} · {t('score.readiness')}
            </AppText>
          </View>
        ))}
      </View>
      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        {t('home.pickerHint')}
      </AppText>
    </Page>
  );
}
