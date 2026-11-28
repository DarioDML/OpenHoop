import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatMonthTitle, monthGrid, shiftMonth, weekdayInitials } from '@/data/dailyDerived';
import { TREND_DAYS, yesRate } from '@/data/healthDerived';
import { behaviourStats, dayMark, earliestAnswer, weeklyCounts } from '@/data/journalTrends';
import { findQuestion, trackedQuestions } from '@/data/journalQuestions';
import { todayIso } from '@/lib/format';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { Icon } from '@/ui/Icon';
import { CapHeader } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { Screen } from '@/ui/Screen';
import { StateCard } from '@/ui/StateCard';
import { radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';
import { ValueBars } from '@/ui/ValueBars';

const WEEKS = 4;

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  return value?.[0] ?? null;
}

function StatColumn({ label, value, testID }: { label: string; value: number; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 6 }} testID={testID} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="capLarge" color={colors.levelC} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {label}
      </AppText>
      <Num size={56}>{value}</Num>
    </View>
  );
}

export default function JournalTrendsScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { userData } = useAppData();
  const params = useLocalSearchParams<{ q?: string }>();
  const today = todayIso(new Date());
  const tracked = useMemo(() => trackedQuestions(userData.journalQuestions, userData.journal), [userData.journalQuestions, userData.journal]);
  const requested = firstParam(params.q);
  const [pickedId, setPickedId] = useState<string | null>(requested !== null && findQuestion(requested) !== undefined ? requested : null);
  const rows = tracked.map((question) => ({ question, rate: yesRate(userData.journal, question.id, today) }));
  const anyAnswers = rows.some((row) => row.rate.answered > 0);
  const fallback = rows.find((row) => row.rate.yes > 0)?.question ?? rows.find((row) => row.rate.answered > 0)?.question ?? tracked[0];
  const question = (pickedId !== null ? findQuestion(pickedId) : undefined) ?? fallback;
  const [year, monthNumber] = today.split('-').map(Number);
  const [shown, setShown] = useState({ year: year ?? 2026, month: monthNumber ?? 1 });

  const stats = question ? behaviourStats(userData.journal, question.id, today) : null;
  const weeks = question ? weeklyCounts(userData.journal, question.id, today, WEEKS) : [];
  const earliest = question ? earliestAnswer(userData.journal, question.id) : null;
  const shownKey = `${shown.year}-${String(shown.month).padStart(2, '0')}`;
  const canGoBack = earliest !== null && earliest.slice(0, 7) < shownKey;
  const canGoForward = shownKey < today.slice(0, 7);
  const initials = weekdayInitials(language);
  const name = question ? t(question.nameKey) : t('journal.trends.title');

  return (
    <Screen
      tint="coach"
      testID="journal-trends"
      header={
        <View style={{ gap: spacing.lg }}>
          <TopBar
            center={
              <AppText variant="screenTitle" accessibilityRole="header" numberOfLines={2} style={{ textAlign: 'center' }} testID="trend-title">
                {name}
              </AppText>
            }
          />
          {stats !== null && anyAnswers ? (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: spacing.md }} testID="trend-stats">
                <StatColumn label={t('journal.trends.streak')} value={stats.streak} testID="trend-streak" />
                <StatColumn label={t('journal.trends.thisMonth')} value={stats.thisMonth} testID="trend-month" />
                <StatColumn label={t('journal.trends.best')} value={stats.best} testID="trend-best" />
              </View>
              <AppText variant="caption" muted>
                {t('journal.trends.statsNote')}
              </AppText>
            </View>
          ) : (
            <AppText variant="lead" muted>
              {t('journal.trends.intro', { days: TREND_DAYS })}
            </AppText>
          )}
        </View>
      }>
      {tracked.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} testID="trend-picker">
          {tracked.map((item) => (
            <Pill key={item.id} label={t(item.nameKey)} selected={item.id === question?.id} onPress={() => setPickedId(item.id)} testID={`trend-pick-${item.id}`} />
          ))}
        </ScrollView>
      ) : null}

      {!anyAnswers || question === undefined ? (
        <StateCard icon="journal" tone="neutral" title={t('journal.trends.emptyTitle')} body={t('journal.trends.emptyBody')} testID="trends-empty" />
      ) : (
        <>
          <Card testID="trend-calendar">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="title" style={{ flexShrink: 1 }} testID="trend-month-title">
                {formatMonthTitle(shown.year, shown.month, language)}
              </AppText>
              <View style={{ flexDirection: 'row' }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('journal.trends.prevMonth')}
                  disabled={!canGoBack}
                  onPress={() => setShown(shiftMonth(shown.year, shown.month, -1))}
                  testID="trend-month-prev"
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: canGoBack ? 1 : 0.3 }}>
                  <Icon name="back" color={colors.text} size={20} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('journal.trends.nextMonth')}
                  disabled={!canGoForward}
                  onPress={() => setShown(shiftMonth(shown.year, shown.month, 1))}
                  testID="trend-month-next"
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: canGoForward ? 1 : 0.3 }}>
                  <Icon name="chevronRight" color={colors.text} size={20} />
                </Pressable>
              </View>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {initials.map((initial, index) => (
                <AppText key={index} variant="label" muted style={{ flex: 1, textAlign: 'center' }}>
                  {initial}
                </AppText>
              ))}
            </View>
            {monthGrid(shown.year, shown.month).map((week, w) => (
              <View key={w} style={{ flexDirection: 'row' }}>
                {week.map((cell, d) => {
                  if (cell.day === null) return <View key={d} style={{ flex: 1, height: 48 }} />;
                  const day = cell.day;
                  const mark = dayMark(userData.journal, question.id, day);
                  const future = day > today;
                  const isToday = day === today;
                  return (
                    <View
                      key={d}
                      testID={`trend-day-${day}`}
                      accessible
                      accessibilityLabel={`${Number(day.slice(8))}: ${t(mark === 'yes' ? 'journal.yes' : mark === 'no' ? 'journal.no' : 'journal.trends.notLogged')}`}
                      style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                      <View
                        style={{
                          width: 40,
                          height: 44,
                          borderRadius: radius.sm,
                          borderWidth: isToday ? 2 : 0,
                          borderColor: colors.text,
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 3,
                        }}>
                        <AppText variant="bodyStrong" numeric color={future ? colors.textFaint : colors.text}>
                          {String(Number(day.slice(8)))}
                        </AppText>
                        <View
                          testID={mark === 'yes' ? `trend-dot-${day}` : undefined}
                          style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: mark === 'yes' ? colors.purple : 'transparent' }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </Card>

          <Card testID="trend-weeks">
            <AppText variant="capLarge" muted>
              {t('journal.trends.perWeek')}
            </AppText>
            <ValueBars
              testID="trend-week-bars"
              height={120}
              barWidth={48}
              highlight={weeks.length - 1}
              bars={weeks.map((week) => ({
                key: week.weekStart,
                value: week.count,
                label: t('journal.trends.weekShort', { week: week.week }),
                color: colors.purple,
                a11yLabel: t('journal.trends.weekA11y', { week: week.week }),
              }))}
            />
          </Card>
        </>
      )}

      {rows.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <CapHeader title={t('journal.trends.overview')} />
          <AppText variant="label" muted>
            {t('journal.trends.intro', { days: TREND_DAYS })}
          </AppText>
          {rows.map(({ question: item, rate }) => (
            <Card key={item.id} testID={`trend-${item.id}`} onPress={() => setPickedId(item.id)} accessibilityLabel={t(item.nameKey)} tone={item.id === question?.id ? 'outline' : 'default'}>
              <AppText variant="cardTitle">{t(item.nameKey)}</AppText>
              {rate.answered === 0 ? (
                <AppText variant="label" muted>
                  {t('journal.trends.noEntries')}
                </AppText>
              ) : (
                <>
                  <AppText variant="body" soft testID={`trend-${item.id}-rate`}>
                    {t('journal.trends.yesOf', { yes: rate.yes, answered: rate.answered })}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {rate.cells.map((cell, index) => (
                      <View
                        key={index}
                        style={{
                          flex: 1,
                          height: 16,
                          borderRadius: 3,
                          backgroundColor: cell === null ? colors.surfaceAlt : cell ? colors.purple : colors.border,
                          opacity: cell === null ? 0.5 : 1,
                        }}
                      />
                    ))}
                  </View>
                </>
              )}
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
