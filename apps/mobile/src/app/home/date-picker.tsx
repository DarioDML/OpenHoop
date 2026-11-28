import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { visibleReadiness } from '@/data/derived';
import { formatLongDay, formatMonthTitle, isDayString, monthGrid, shiftMonth, singleParam, weekdayInitials } from '@/data/dailyDerived';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { SheetScreen } from '@/ui/SheetScreen';
import { StateCard } from '@/ui/StateCard';
import { radius, readinessBand, readinessColor, spacing, useTheme } from '@/ui/theme';

const CELL_HEIGHT = 42;

function monthOf(day: string): { year: number; month: number } {
  const [y, m] = day.split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1 };
}

function MonthButton({ direction, enabled, label, onPress }: { direction: 'prev' | 'next'; enabled: boolean; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={`month-${direction}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={direction === 'prev' ? 'back' : 'chevronRight'} size={18} strokeWidth={2} color={enabled ? colors.text : colors.textFaint} />
    </Pressable>
  );
}

export default function DatePickerScreen() {
  const { days } = useAppData();
  const params = useLocalSearchParams<{ day?: string | string[] }>();
  const { t, language } = useT();
  const { colors } = useTheme();
  const first = days[0];
  const last = days[days.length - 1];
  const asked = singleParam(params.day);
  const selected = isDayString(asked) && days.some((d) => d.day === asked) ? asked : (last?.day ?? null);
  const [shown, setShown] = useState(() => (selected !== null ? monthOf(selected) : { year: 1970, month: 1 }));

  if (!first || !last) {
    return (
      <SheetScreen title={t('home.pickDay')} testID="date-picker">
        <StateCard icon="calendar" tone="neutral" title={t('empty.title')} body={t('empty.body')} />
      </SheetScreen>
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
  const legend = [
    { band: 'high', label: t('home.pickLegendHigh'), color: colors.metric.readinessHigh },
    { band: 'medium', label: t('readiness.medium'), color: colors.metric.readinessMid },
    { band: 'low', label: t('readiness.low'), color: colors.metric.readinessLow },
  ] as const;

  const pick = (day: string): void => {
    if (day === last.day) router.replace('/');
    else router.replace(`/day/${day}`);
  };

  return (
    <SheetScreen title={t('home.pickDay')} testID="date-picker" maxHeight="90%" footer={<Button label={t('common.today')} onPress={() => router.replace('/')} testID="picker-today" />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <MonthButton direction="prev" enabled={canPrev} label={t('home.previousMonth')} onPress={() => setShown(shiftMonth(shown.year, shown.month, -1))} />
        <AppText variant="cardTitle" testID="month-title" style={{ textTransform: 'capitalize' }}>
          {formatMonthTitle(shown.year, shown.month, language)}
        </AppText>
        <MonthButton direction="next" enabled={canNext} label={t('home.nextMonth')} onPress={() => setShown(shiftMonth(shown.year, shown.month, 1))} />
      </View>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {initials.map((letter, i) => (
            <AppText key={i} variant="caption" muted style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>
              {letter}
            </AppText>
          ))}
        </View>
        {weeks.map((week, w) => (
          <View key={w} style={{ flexDirection: 'row', gap: 4 }}>
            {week.map((cell, c) => {
              if (cell.day === null) return <View key={c} style={{ flex: 1, height: CELL_HEIGHT }} />;
              const record = byDay.get(cell.day);
              const dayNumber = Number(cell.day.slice(8));
              if (!record) {
                return (
                  <View
                    key={c}
                    accessible
                    accessibilityLabel={`${formatLongDay(cell.day, language)}, ${t('home.pickNoData')}`}
                    style={{ flex: 1, height: CELL_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    <AppText variant="body" numeric color={colors.textFaint} style={{ fontSize: 14, fontWeight: '500' }}>
                      {dayNumber}
                    </AppText>
                    <View style={{ height: 6 }} />
                  </View>
                );
              }
              const shownReadiness = visibleReadiness(record).value;
              const tone = readinessColor(colors, shownReadiness);
              const band = readinessBand(shownReadiness);
              const isSelected = record.day === selected;
              return (
                <Pressable
                  key={c}
                  testID={`cal-${record.day}`}
                  accessibilityRole="button"
                  accessibilityLabel={
                    shownReadiness === null || band === null
                      ? `${formatLongDay(record.day, language)}, ${t('home.pickNoReadiness')}`
                      : `${formatLongDay(record.day, language)}, ${t('score.readiness')} ${formatNumber(shownReadiness, 0, language)}%, ${t(`readiness.${band}`)}`
                  }
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => pick(record.day)}
                  style={{
                    flex: 1,
                    height: CELL_HEIGHT,
                    borderRadius: 12,
                    backgroundColor: isSelected ? colors.primary : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                  }}>
                  <AppText variant="body" numeric color={isSelected ? colors.primaryOn : colors.text} style={{ fontSize: 14, fontWeight: '600' }}>
                    {dayNumber}
                  </AppText>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: shownReadiness === null ? 'transparent' : tone }} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm, columnGap: spacing.lg }} testID="picker-legend">
        {legend.map((item) => (
          <View key={item.band} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: item.color }} />
            <AppText variant="caption" muted>
              {item.label}
            </AppText>
          </View>
        ))}
      </View>
      <AppText variant="caption" muted>
        {t('home.pickerHint')}
      </AppText>
    </SheetScreen>
  );
}
