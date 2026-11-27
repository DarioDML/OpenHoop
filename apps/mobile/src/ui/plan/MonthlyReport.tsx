import { useState, type ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { enoughForReport, formatWeekday, periodStats, periodWindows } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { formatHm } from '@/data/dailyDerived';
import { visibleReadiness } from '@/data/derived';
import { findQuestion } from '@/data/journalQuestions';
import { averageConsistency, averageSleepScore, bestDay, deltaOf, monthFocus, monthHeadline, type Delta, type MonthFocus, type MonthHeadline } from '@/data/periodReport';
import type { Language } from '@/data/types';
import type { UserData } from '@/data/userData';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { NoDataScreen } from '@/ui/activity/parts';

import { AppText } from '../AppText';
import { BarChart } from '../BarChart';
import { Card, CardHeader } from '../Card';
import { Chip, type ChipTone } from '../Chip';
import { Button } from '../controls';
import { LineChart } from '../LineChart';
import { Num } from '../Num';
import { Screen } from '../Screen';
import { GridTile, StatGrid } from '../StatGrid';
import { radius, spacing, useTheme } from '../theme';
import { goBack, IconButton, TopBar } from '../TopBar';
import { formatDayRange } from './goals';
import { ChangeRows, LoadDaysCard } from './reportParts';
import { ReportShareSheet } from './ReportShareSheet';

const PAGES = 5;
const MONTH = 30;

function headlineText(t: TFunction, headline: MonthHeadline): string {
  if (headline.kind === 'bestSleep') return t('plan.month.headline.bestSleep');
  if (headline.kind === 'steady') return t('plan.month.headline.steady');
  return t(`plan.month.headline.${headline.kind}`, { metric: t(`plan.month.metric.${headline.metric}`), delta: headline.delta });
}

function focusText(t: TFunction, focus: MonthFocus): string {
  if (focus.kind === 'weekendBedtime') return t('plan.month.focus.weekendBedtime', { minutes: focus.minutes });
  if (focus.kind === 'consistency') return t('plan.month.focus.consistency', { value: focus.value });
  if (focus.kind === 'sleepNeed') return t('plan.month.focus.sleepNeed', { minutes: focus.minutes });
  if (focus.kind === 'loadDays') return t('plan.month.focus.loadDays', { perWeek: focus.perWeek });
  return t('plan.month.focus.keep');
}

function deltaChip(t: TFunction, delta: Delta | null, upTone: ChipTone, downTone: ChipTone): { label: string; tone: ChipTone } | null {
  if (delta === null) return null;
  if (delta.trend === 'stable') return { label: t('plan.month.stable'), tone: 'neutral' };
  return { label: `${delta.trend === 'up' ? '↑' : '↓'} ${delta.value}`, tone: delta.trend === 'up' ? upTone : downTone };
}

function shortDate(day: string, language: Language): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const month = date.toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short', timeZone: 'UTC' });
  return `${formatWeekday(day, language)} ${date.getUTCDate()} ${month}`;
}

function journalLine(t: TFunction, journal: UserData['journal'], day: string): string | null {
  const answers = journal[day];
  if (answers === undefined) return null;
  const items: string[] = [];
  for (const [id, answer] of Object.entries(answers)) {
    const question = findQuestion(id);
    if (question === undefined) continue;
    const label = t(question.labelKey).replace(/\?$/, '');
    items.push(typeof answer === 'boolean' ? `${label}: ${answer ? t('journal.yes') : t('journal.no')}` : `${label}: ${answer}`);
  }
  return items.length === 0 ? null : t('plan.month.bestJournal', { items: items.slice(0, 3).join(' · ') });
}

function PageDots({ page, onPick }: { page: number; onPick: (page: number) => void }): ReactElement {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} testID="report-pages">
      {Array.from({ length: PAGES }, (_, i) => (
        <Pressable
          key={i}
          accessibilityRole="button"
          accessibilityLabel={t('plan.month.page', { page: i + 1, total: PAGES })}
          accessibilityState={{ selected: i === page }}
          hitSlop={8}
          onPress={() => onPick(i)}
          testID={`report-page-${i + 1}`}>
          <View style={{ width: i === page ? 22 : 8, height: 8, borderRadius: radius.pill, backgroundColor: i === page ? colors.text : colors.textFaint }} />
        </Pressable>
      ))}
    </View>
  );
}

export function MonthlyReport({ testID }: { testID: string }): ReactElement {
  const { days, userData } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const [page, setPage] = useState(0);
  const [sharing, setSharing] = useState(false);
  const last = days[days.length - 1];
  if (last === undefined) return <NoDataScreen title={t('plan.monthly.title')} tint="home" />;

  const { current, previous } = periodWindows(days, MONTH);
  const cur = periodStats(current);
  const prev = periodStats(previous);
  const enough = enoughForReport(current);
  const comparable = enoughForReport(previous);
  const fmt = (v: number, d = 0): string => formatNumber(v, d, language);
  const range = formatDayRange(current[0]?.day ?? last.day, last.day, language);
  const missing = t('plan.report.notMeasured');

  const sleepScore = averageSleepScore(current);
  const consistency = averageConsistency(current);
  const best = bestDay(current);
  const headlines = [
    headlineText(t, monthHeadline(days, MONTH)),
    cur.readiness === null ? t('plan.month.readiness.none') : t('plan.month.readiness.headline', { value: fmt(cur.readiness) }),
    cur.sleepH === null ? t('plan.month.sleep.none') : t('plan.month.sleep.headline', { time: formatHm(cur.sleepH * 3600) }),
    t('plan.month.load.headline', { count: cur.loadDays, total: current.length }),
    t('plan.month.compare.headline'),
  ];
  const headline = headlines[page] ?? headlines[0] ?? '';

  const tiles = {
    sleepScore: { value: sleepScore === null ? null : fmt(sleepScore), chip: deltaChip(t, deltaOf(sleepScore, averageSleepScore(previous), comparable), 'positive', 'warning') },
    readiness: { value: cur.readiness === null ? null : fmt(cur.readiness), chip: deltaChip(t, deltaOf(cur.readiness, prev.readiness, comparable), 'positive', 'warning') },
    hrv: { value: cur.hrv === null ? null : fmt(cur.hrv), chip: deltaChip(t, deltaOf(cur.hrv, prev.hrv, comparable), 'positive', 'warning') },
    loadDays: { value: fmt(cur.loadDays), chip: deltaChip(t, deltaOf(cur.loadDays, prev.loadDays, comparable), 'info', 'neutral') },
  };

  const pageBody = (): ReactElement => {
    if (page === 0) {
      return (
        <>
          <StatGrid>
            <GridTile label={t('plan.month.avgSleepScore')} value={tiles.sleepScore.value} unit="%" missing={missing} chip={tiles.sleepScore.chip} testID="report-sleepscore" />
            <GridTile label={t('plan.report.avgReadiness')} value={tiles.readiness.value} unit="%" missing={missing} chip={tiles.readiness.chip} testID="report-readiness" />
            <GridTile label={t('plan.month.avgHrv')} value={tiles.hrv.value} unit={t('unit.ms')} missing={missing} chip={tiles.hrv.chip} testID="report-hrv" />
            <GridTile label={t('plan.report.loadDays')} value={tiles.loadDays.value} chip={tiles.loadDays.chip} testID="report-loaddays-tile" />
          </StatGrid>
          {!comparable ? (
            <AppText variant="caption" muted>
              {t('plan.report.noPrevious')}
            </AppText>
          ) : null}
          <Card testID="report-best-day">
            <CardHeader title={t('plan.month.bestDay')} />
            {best !== null ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <Num size={28}>{shortDate(best.day, language)}</Num>
                  <Chip tone="positive" label={t('plan.month.bestReadiness', { value: fmt(best.readiness) })} />
                </View>
                <AppText variant="label" muted>
                  {[
                    best.asleepS === null ? null : t('plan.month.bestSleep', { time: formatHm(best.asleepS) }),
                    best.load === null ? null : t('plan.month.bestLoad', { value: fmt(best.load, 1) }),
                    journalLine(t, userData.journal, best.day),
                  ]
                    .filter((part): part is string => part !== null)
                    .join(' · ')}
                </AppText>
              </>
            ) : (
              <AppText variant="body" muted>
                {t('plan.month.noBestDay')}
              </AppText>
            )}
          </Card>
          <Card testID="report-focus">
            <CardHeader title={t('plan.month.focus.title')} />
            <AppText variant="body" color={colors.textSoft}>
              {focusText(t, monthFocus(current))}
            </AppText>
          </Card>
        </>
      );
    }
    if (page === 1) {
      return (
        <>
          <Card>
            <AppText variant="capSmall" muted>
              {t('score.readiness')}
            </AppText>
            <LineChart
              data={current.map((d) => visibleReadiness(d).value)}
              domain={{ min: 0, max: 100 }}
              formatTick={(v) => fmt(v)}
              emptyLabel={t('plan.month.readiness.none')}
              startLabel={current[0] ? shortDate(current[0].day, language) : undefined}
              endLabel={shortDate(last.day, language)}
              color={colors.metric.readinessHigh}
              testID="report-readiness-chart"
            />
          </Card>
          <ChangeRows current={cur} previous={prev} comparable={comparable} previousCount={previous.length} only={['readiness', 'hrv', 'restingHr']} />
        </>
      );
    }
    if (page === 2) {
      return (
        <>
          <Card>
            <AppText variant="capSmall" muted>
              {t('plan.report.sleepAvg')}
            </AppText>
            <LineChart
              data={current.map((d) => (d.sleep.asleepS === null ? null : d.sleep.asleepS / 3600))}
              formatTick={(v) => formatHm(v * 3600)}
              emptyLabel={t('plan.month.sleep.none')}
              startLabel={current[0] ? shortDate(current[0].day, language) : undefined}
              endLabel={shortDate(last.day, language)}
              color={colors.metric.sleep}
              testID="report-sleep-chart"
            />
          </Card>
          <StatGrid>
            <GridTile label={t('plan.report.sleepAvg')} value={cur.sleepH === null ? null : formatHm(cur.sleepH * 3600)} missing={missing} testID="report-sleep" />
            <GridTile label={t('plan.month.avgSleepScore')} value={sleepScore === null ? null : fmt(sleepScore)} unit="%" missing={missing} />
            <GridTile label={t('metric.consistency')} value={consistency === null ? null : fmt(consistency)} unit="%" missing={missing} />
          </StatGrid>
          <ChangeRows current={cur} previous={prev} comparable={comparable} previousCount={previous.length} only={['sleep']} />
        </>
      );
    }
    if (page === 3) {
      return (
        <>
          <Card>
            <AppText variant="capSmall" muted>
              {t('score.load')}
            </AppText>
            <BarChart data={current.map((d) => d.load.value)} max={21} formatTick={(v) => fmt(v)} startLabel={current[0] ? shortDate(current[0].day, language) : undefined} endLabel={shortDate(last.day, language)} testID="report-load-chart" />
          </Card>
          <StatGrid>
            <GridTile label={t('plan.report.avgLoad')} value={cur.load === null ? null : fmt(cur.load, 1)} missing={missing} testID="report-load" />
            <GridTile label={t('plan.report.loadDays')} value={fmt(cur.loadDays)} />
          </StatGrid>
          <LoadDaysCard stats={cur} total={current.length} />
          <ChangeRows current={cur} previous={prev} comparable={comparable} previousCount={previous.length} only={['load']} />
        </>
      );
    }
    return <ChangeRows current={cur} previous={prev} comparable={comparable} previousCount={previous.length} />;
  };

  return (
    <Screen
      tint="home"
      testID={testID}
      header={
        <>
          <TopBar title={t('plan.monthly.title')} right={enough ? <IconButton icon="share" label={t('plan.share.title')} onPress={() => setSharing(true)} testID="report-share" /> : undefined} />
          {enough ? (
            <View style={{ gap: 10 }}>
              <AppText variant="cap" soft testID="report-page-label">
                {t('plan.month.pageRange', { page: page + 1, total: PAGES, range })}
              </AppText>
              <AppText variant="h2" accessibilityRole="header" testID="report-headline">
                {headline}
              </AppText>
              <PageDots page={page} onPick={setPage} />
            </View>
          ) : (
            <AppText variant="lead" soft>
              {t('plan.monthly.intro', { count: current.length })}
            </AppText>
          )}
        </>
      }>
      {!enough ? (
        <Card testID="report-few">
          <AppText variant="body" muted>
            {t('plan.report.tooFew', { count: current.length, needed: 3 })}
          </AppText>
        </Card>
      ) : (
        <>
          {pageBody()}
          {page < PAGES - 1 ? (
            <Button label={t('plan.month.next')} onPress={() => setPage((p) => Math.min(PAGES - 1, p + 1))} testID="report-next" />
          ) : (
            <Button label={t('common.done')} onPress={goBack} testID="report-done" />
          )}
        </>
      )}
      <AppText variant="caption" muted>
        {t('plan.report.note')}
      </AppText>
      {enough ? (
        <ReportShareSheet
          visible={sharing}
          onClose={() => setSharing(false)}
          title={t('plan.monthly.title')}
          range={range}
          headline={headlines[0] ?? ''}
          fileName="openhoop-month.png"
          testID="report-share-sheet"
          stats={[
            { label: t('plan.month.avgSleepScore'), value: tiles.sleepScore.value ?? missing, unit: tiles.sleepScore.value === null ? undefined : '%' },
            { label: t('plan.report.avgReadiness'), value: tiles.readiness.value ?? missing, unit: tiles.readiness.value === null ? undefined : '%' },
            { label: t('plan.month.avgHrv'), value: tiles.hrv.value ?? missing, unit: tiles.hrv.value === null ? undefined : t('unit.ms') },
            { label: t('plan.report.loadDays'), value: tiles.loadDays.value },
          ]}
        />
      ) : null}
    </Screen>
  );
}
