import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatWeekday, isLoadDay } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { addDays, daysInWeek, visibleReadiness, weekStart } from '@/data/derived';
import { isoWeekNumber, LOAD_SCALE_MAX, weekBlockGaps, type WeekBlockGap } from '@/data/loadDerived';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { NoDataScreen } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { ChartLegend, DualLineChart } from '@/ui/DualLineChart';
import { Icon } from '@/ui/Icon';
import { weekdayShort } from '@/ui/readiness/format';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { radius, readinessColor, spacing, useTheme } from '@/ui/theme';
import { IconButton, TopBar } from '@/ui/TopBar';

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function gapText(t: TFunction, reason: (value: string | null) => string, gap: WeekBlockGap, soFar: string | null): string | null {
  if (gap.load === null && gap.readiness === null) return null;
  if (gap.load === 'future' || gap.load === 'noData') return t(`loadWeek.gap.${gap.load}`);
  const parts: string[] = [];
  if (gap.load === 'open') parts.push(soFar === null ? t('loadWeek.gap.open') : t('loadWeek.gap.openSoFar', { value: soFar }));
  if (gap.load === 'missing') parts.push(t('loadWeek.gap.load', { reason: lowerFirst(reason(gap.loadReason)) }));
  if (gap.readiness === 'calibrating') parts.push(t('loadWeek.gap.calibrating'));
  if (gap.readiness === 'missing') parts.push(t('loadWeek.gap.readiness', { reason: lowerFirst(reason(gap.readinessReason)) }));
  return parts.join(', ');
}

export default function LoadWeekScreen() {
  const { days } = useAppData();
  const { t, language, reason } = useT();
  const { colors } = useTheme();
  const [offset, setOffset] = useState(0);
  const [about, setAbout] = useState(false);
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
  const range = `${formatShortDay(start, language)} – ${formatShortDay(addDays(start, 6), language)}`;
  const loads = week.map((d) => d?.load.value ?? null);
  const readiness = week.map((d) => {
    const value = d === null ? null : visibleReadiness(d).value;
    return value === null ? null : Math.round(value);
  });
  const gaps = weekBlockGaps(week, start, latest.day);
  const gapLines = gaps
    .map((gap, i) => {
      const text = gapText(t, reason, gap, gap.soFar === null ? null : fmt(gap.soFar));
      return text === null ? null : { key: addDays(start, i), line: t('loadWeek.gap.line', { day: weekdayShort(addDays(start, i), language), text }) };
    })
    .filter((entry): entry is { key: string; line: string } => entry !== null);

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
          <TopBar
            title={t('loadWeek.title', { week: isoWeekNumber(start) })}
            right={<IconButton icon="info" label={t('loadWeek.info')} onPress={() => setAbout(true)} testID="week-info" />}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {nav(-1, canGoBack, t('loadx.week.prev'), 'back')}
            <AppText variant="bodyStrong" testID="week-range">
              {range}
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
        <AppText variant="label" muted testID="week-summary">
          {t('loadx.week.summary', { total: fmt(total), count: week.filter((d) => isLoadDay(d)).length })}
        </AppText>
      )}

      <Card testID="week-chart-card" style={{ gap: spacing.md }}>
        <AppText variant="cap" muted>
          {t('loadWeek.chartTitle')}
        </AppText>
        <DualLineChart
          testID="week-chart"
          height={150}
          accessibilityLabel={t('loadWeek.chartA11y', { range })}
          primary={{ data: loads, max: LOAD_SCALE_MAX, color: colors.metric.loadBright, dots: true }}
          secondary={{ data: readiness, max: 100, color: colors.metric.readinessMid }}
          labels={week.map((_, i) => weekdayShort(addDays(start, i), language))}
        />
      </Card>

      <Card testID="week-blocks" style={{ gap: spacing.md }}>
        <AppText variant="cap" muted>
          {t('loadWeek.blocks')}
        </AppText>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {week.map((d, i) => {
            const date = addDays(start, i);
            const loadValue = loads[i] ?? null;
            const readinessValue = readiness[i] ?? null;
            const label = t('loadWeek.dayA11y', {
              day: `${formatWeekday(date, language, 'long')} ${formatShortDay(date, language)}`,
              readiness: readinessValue === null ? t('loadWeek.noValue') : fmt(readinessValue, 0),
              load: loadValue === null ? t('loadWeek.noValue') : fmt(loadValue),
            });
            const blocks = (
              <>
                <View
                  testID={`week-readiness-${i}`}
                  style={{
                    height: 36,
                    borderRadius: radius.sm - 2,
                    backgroundColor: readinessValue === null ? 'transparent' : readinessColor(colors, readinessValue),
                    borderWidth: readinessValue === null ? 1 : 0,
                    borderColor: colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <AppText variant="label" color={colors.primaryOn} style={{ fontWeight: '700' }} maxFontSizeMultiplier={1.2}>
                    {readinessValue === null ? '' : fmt(readinessValue, 0)}
                  </AppText>
                </View>
                <View
                  style={{
                    height: 36,
                    borderRadius: radius.sm - 2,
                    backgroundColor: loadValue === null ? 'transparent' : colors.tint.load,
                    borderWidth: loadValue === null ? 1 : 0,
                    borderColor: colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <AppText variant="label" style={{ fontWeight: '700' }} maxFontSizeMultiplier={1.2} testID={`week-load-${i}`}>
                    {loadValue === null ? '' : fmt(loadValue)}
                  </AppText>
                </View>
                <AppText variant="caption" muted style={{ textAlign: 'center' }}>
                  {weekdayShort(date, language)}
                </AppText>
              </>
            );
            return d ? (
              <Pressable
                key={date}
                testID={`week-day-${i}`}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => router.push({ pathname: '/day/[day]', params: { day: date } })}
                style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 4, opacity: pressed ? 0.7 : 1 })}>
                {blocks}
              </Pressable>
            ) : (
              <View key={date} testID={`week-day-${i}`} accessible accessibilityLabel={`${formatWeekday(date, language, 'long')} ${formatShortDay(date, language)}: ${t('loadx.week.noData')}`} style={{ flex: 1, minWidth: 0, gap: 4, opacity: 0.6 }}>
                {blocks}
              </View>
            );
          })}
        </View>
        {gapLines.length > 0 ? (
          <View style={{ gap: 2 }} testID="week-gaps">
            {gapLines.map((entry) => (
              <AppText key={entry.key} variant="caption" muted testID={`week-gap-${entry.key}`}>
                {entry.line}
              </AppText>
            ))}
          </View>
        ) : null}
      </Card>

      <ChartLegend
        testID="week-legend"
        items={[
          { label: t('loadWeek.legendReadiness'), color: colors.metric.readinessMid },
          { label: t('score.load'), color: colors.metric.loadBright },
        ]}
      />

      <Sheet visible={about} onClose={() => setAbout(false)} title={t('loadWeek.about')} testID="week-about">
        <AppText variant="body" soft>
          {t('loadWeek.aboutBody')}
        </AppText>
        <AppText variant="label" muted>
          {t('loadWeek.aboutLoadDays')}
        </AppText>
      </Sheet>
    </Screen>
  );
}
