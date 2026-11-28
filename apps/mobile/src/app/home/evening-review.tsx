import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatHm, formatLongDay, formatMinutes, planBedtime } from '@/data/dailyDerived';
import { visibleReadiness } from '@/data/derived';
import {
  ROOM_TEMPERATURE_C,
  answeredToday,
  eveningSummary,
  journalRows,
  loadReview,
  screensOffMinutes,
  stepsReview,
  type JournalMark,
  type JournalRow,
  type LoadMark,
} from '@/data/eveningReview';
import { readinessNightsLeft } from '@/data/progress';
import { countKey, type TranslationKey } from '@/i18n';
import { useT, type TFunction } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { formatTemperature, useUnits } from '@/lib/units';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { CoachAsk } from '@/ui/CoachAsk';
import { BriefShell, StatChips, TonePill, type BriefStat } from '@/ui/daily/BriefPage';
import { GoalSeal, IconTile, NoDataPage } from '@/ui/daily/bits';
import { alarmValue } from '@/ui/daily/cards';
import { Icon } from '@/ui/Icon';
import { LevelNote } from '@/ui/LevelNote';
import type { IconTileStyle } from '@/ui/ListGroup';
import { tile } from '@/ui/manage/tiles';
import { Num } from '@/ui/Num';
import { PARITY } from '@/ui/parity';
import { radius, spacing, useTheme } from '@/ui/theme';
import { loadTargetsHidden } from '@/data/pregnancyPrefs';

const BEHAVIOUR_NAME: Readonly<Record<string, TranslationKey>> = {
  alcohol: 'evening.b.alcohol',
  'caffeine-late': 'evening.b.caffeineLate',
  'screens-bed': 'evening.b.screensBed',
  'read-before-sleep': 'evening.b.readBeforeSleep',
  sauna: 'evening.b.sauna',
  melatonin: 'evening.b.melatonin',
  'late-meal': 'evening.b.lateMeal',
  'evening-workout': 'evening.b.eveningWorkout',
  nap: 'evening.b.nap',
  'high-stress': 'evening.b.highStress',
  water: 'evening.b.water',
  outdoors: 'evening.b.outdoors',
};

function behaviourName(t: TFunction, row: JournalRow): string {
  const key = BEHAVIOUR_NAME[row.question.id];
  const name = key === undefined ? t(row.question.labelKey) : t(key);
  if (typeof row.answer === 'number' && row.question.unitKey !== undefined) return `${name} · ${row.answer} ${t(row.question.unitKey).toLowerCase()}`;
  return name;
}

const LOAD_MARK: Readonly<Record<LoadMark, { key: TranslationKey; tone: 'positive' | 'neutral' | 'warning' }>> = {
  onTarget: { key: 'evening.mark.onTarget', tone: 'positive' },
  below: { key: 'evening.mark.below', tone: 'neutral' },
  above: { key: 'evening.mark.above', tone: 'warning' },
};

const JOURNAL_MARK: Readonly<Record<JournalMark, { key: TranslationKey; tone: 'positive' | 'warning' }>> = {
  late: { key: 'evening.mark.late', tone: 'warning' },
  watch: { key: 'evening.mark.watch', tone: 'warning' },
  good: { key: 'evening.mark.good', tone: 'positive' },
};

interface RowProps {
  tile: IconTileStyle;
  title: string;
  sub: string;
  right?: ReactNode;
  first: boolean;
  onPress?: () => void;
  testID: string;
}

function BehaviourRow({ tile: style, title, sub, right, first, onPress, testID }: RowProps) {
  const { colors } = useTheme();
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 68,
        paddingVertical: spacing.sm,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}>
      <IconTile tile={style} size={40} />
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <AppText variant="body" numeric style={{ fontWeight: '500' }}>
          {title}
        </AppText>
        <AppText variant="label" muted numeric>
          {sub}
        </AppText>
      </View>
      {right}
    </View>
  );
  if (onPress === undefined) return <View testID={testID}>{body}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      {body}
    </Pressable>
  );
}

export default function EveningReviewScreen() {
  const { days, userData, alarm, cycle } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const units = useUnits();
  const index = days.length - 1;
  const day = days[index];
  if (!day) return <NoDataPage title={t('home.evening')} body={t('empty.body')} />;

  const load = loadReview(days, index, loadTargetsHidden(userData.pregnancyPrefs, cycle));
  const steps = stepsReview(day.steps, userData.stepsGoal);
  const rows = journalRows(userData.journal, day.day, userData.journalQuestions);
  const summary = eveningSummary(load, steps, rows);
  const firstWatch = summary.watch[0];
  const sentence = [
    t(`evening.lead.${summary.lead}`),
    summary.watch.length === 0
      ? t('evening.watch.none')
      : summary.watch.length === 1 && firstWatch !== undefined
        ? t('evening.watch.one', { behaviour: behaviourName(t, firstWatch).toLowerCase() })
        : t('evening.watch.many', { count: summary.watch.length }),
  ].join(' ');

  const { value: shownReadiness, reason: readinessReason } = visibleReadiness(day);
  const nightsLeft = readinessNightsLeft(days, index);
  const stats: BriefStat[] = [
    { id: 'load', label: t('score.load'), value: day.load.value === null ? null : formatNumber(day.load.value, 1, language), tone: 'info' },
    { id: 'steps', label: t('metric.steps'), value: day.steps === null ? null : formatNumber(day.steps, 0, language) },
    {
      id: 'readiness',
      label: t('score.readiness'),
      value: shownReadiness === null ? null : formatNumber(shownReadiness, 0, language),
      missing: nightsLeft === null ? undefined : t(countKey(nightsLeft, 'why.status.nightsOne', 'why.status.nights'), { count: nightsLeft }),
      unit: '%',
      explain: { term: 'readiness', index, shown: { value: null, unit: null, reason: readinessReason } },
    },
  ];

  const need = day.sleep.need.value;
  const plan = need === null ? null : planBedtime(days, index, need);
  const bed = plan === null ? null : formatMinutes(plan.bedMinutes);
  const room = formatTemperature(ROOM_TEMPERATURE_C, units, language, 0);
  const tips: string[] = [
    plan === null ? t('evening.tip.screensHour') : t('evening.tip.screens', { time: formatMinutes(screensOffMinutes(plan.bedMinutes)) }),
    t('evening.tip.room', { temp: `${room.value} ${room.unit}` }),
    bed === null ? t('evening.tip.regular') : t('evening.tip.bed', { bed }),
  ];
  if (rows.some((row) => row.question.id === 'caffeine-late')) tips.push(t('evening.tip.caffeine'));

  const nowS = Math.floor(Date.now() / 1000);
  const alarmNow = alarmValue(alarm, nowS);
  const loadMark = load?.mark ?? null;

  const loadSub = (): string => {
    if (load === null) return '';
    const parts: string[] = [];
    if (load.low !== null && load.high !== null) {
      const range = { low: formatNumber(load.low, 1, language), high: formatNumber(load.high, 1, language) };
      parts.push(loadMark === 'onTarget' ? t('evening.load.inside', range) : t('evening.load.target', range));
    }
    if (load.weekAverage !== null) parts.push(t('evening.load.average', { avg: formatNumber(load.weekAverage, 1, language) }));
    return parts.length > 0 ? parts.join(' · ') : t('evening.load.noTarget');
  };

  const behaviourRows: ReactNode[] = [];
  if (load !== null) {
    const mark = loadMark === null ? null : LOAD_MARK[loadMark];
    behaviourRows.push(
      <BehaviourRow
        key="load"
        testID="behaviour-load"
        first={behaviourRows.length === 0}
        tile={tile(colors, 'load', 'info')}
        title={t('evening.load.title', { value: formatNumber(load.value, 1, language) })}
        sub={loadSub()}
        onPress={() => router.push('/load')}
        right={mark === null ? null : <TonePill label={t(mark.key)} tone={mark.tone} testID="behaviour-load-mark" />}
      />,
    );
  }
  if (steps !== null) {
    behaviourRows.push(
      <BehaviourRow
        key="steps"
        testID="behaviour-steps"
        first={behaviourRows.length === 0}
        tile={tile(colors, 'walk', 'info')}
        title={t('evening.steps.title', { steps: formatNumber(steps.steps, 0, language) })}
        sub={steps.goal === null ? t('evening.steps.noGoal') : t('home.stepsGoal', { goal: formatNumber(steps.goal, 0, language) })}
        onPress={() => router.push('/steps')}
        right={
          steps.met ? (
            <GoalSeal size={28} label={t('home.week.goalMet')} testID="behaviour-steps-seal" />
          ) : steps.goal === null ? null : (
            <TonePill label={t('evening.steps.toGo', { count: formatNumber(steps.goal - steps.steps, 0, language) })} tone="neutral" />
          )
        }
      />,
    );
  }
  if (day.workouts.length > 0) {
    behaviourRows.push(
      <BehaviourRow
        key="workouts"
        testID="behaviour-workouts"
        first={behaviourRows.length === 0}
        tile={tile(colors, 'run', 'info')}
        title={t('brief.workouts', { count: day.workouts.length })}
        sub={t('evening.workouts.sub')}
        onPress={() => router.push('/load')}
      />,
    );
  }
  rows.forEach((row) => {
    const mark = row.mark === null ? null : JOURNAL_MARK[row.mark];
    behaviourRows.push(
      <BehaviourRow
        key={row.question.id}
        testID={`behaviour-${row.question.id}`}
        first={behaviourRows.length === 0}
        tile={
          row.question.id === 'caffeine-late'
            ? tile(colors, 'coffee', 'warning')
            : tile(colors, 'journal', row.mark === 'good' ? 'positive' : row.mark === null ? 'purple' : 'warning')
        }
        title={behaviourName(t, row)}
        sub={t('evening.fromJournal')}
        right={mark === null ? null : <TonePill label={t(mark.key)} tone={mark.tone} testID={`behaviour-${row.question.id}-mark`} />}
      />,
    );
  });
  if (rows.length === 0) {
    behaviourRows.push(
      <BehaviourRow
        key="journal"
        testID="behaviour-journal-empty"
        first={behaviourRows.length === 0}
        tile={tile(colors, 'journal', 'purple')}
        title={answeredToday(userData.journal, day.day) ? t('evening.journal.nothing') : t('evening.journal.empty')}
        sub={t('evening.journal.log')}
        onPress={() => router.push('/journal')}
        right={<Icon name="chevronRight" color={colors.textMuted} size={18} />}
      />,
    );
  }

  return (
    <BriefShell
      testID="evening-review"
      title={t('home.evening')}
      tint="sleep"
      icon="moon"
      iconColor={colors.purple}
      heading={t('home.eveningHeading', { day: formatLongDay(day.day, language) })}
      sub={
        <View style={{ gap: spacing.md }}>
          <AppText variant="body" soft testID="evening-summary">
            {sentence}
          </AppText>
          <StatChips stats={stats} />
        </View>
      }>
      <AppText variant="capLarge" muted style={{ marginTop: spacing.sm }}>
        {t('evening.keyBehaviours')}
      </AppText>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 4, paddingHorizontal: spacing.lg }} testID="card-behaviours">
        {behaviourRows}
      </View>
      <Card style={{ gap: spacing.md }} testID="card-wind-down">
        <AppText variant="cardTitle">{t('evening.windDown')}</AppText>
        {tips.map((tip, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Icon name="moon" color={colors.purple} size={20} />
            <AppText variant="body" soft style={{ flex: 1 }}>
              {tip}
            </AppText>
          </View>
        ))}
      </Card>
      <Card href="/sleep/planner" accessibilityLabel={t('evening.tonight')} testID="card-evening-tonight" style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="cardTitle">{t('evening.tonight')}</AppText>
          <Icon name="chevronRight" color={colors.textMuted} size={18} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.md }}>
          {bed === null ? (
            <AppText variant="bodyStrong" muted testID="evening-bed">
              {t('home.tonightNoBed')}
            </AppText>
          ) : (
            <Num size={40} testID="evening-bed">
              {bed}
            </Num>
          )}
          {alarmNow.time === null ? (
            <AppText variant="bodyStrong" muted testID="evening-alarm">
              {t('alarm.status.off')}
            </AppText>
          ) : (
            <Num size={40} testID="evening-alarm">
              {alarmNow.time}
            </Num>
          )}
        </View>
        {plan === null || need === null ? null : (
          <AppText variant="label" muted testID="evening-tonight-need">
            {`${t('home.tonightNeed', { need: formatHm(need) })} · ${t('home.tonightWake', { wake: formatMinutes(plan.wakeMinutes) })}`}
          </AppText>
        )}
        <AppText variant="label" muted testID="evening-tonight-note">
          {alarmNow.time === null ? t('evening.tonightNoAlarm') : t('evening.tonightAlarm', { mode: t(`alarm.mode.${alarm.plan.mode}`).toLowerCase() })}
        </AppText>
      </Card>
      <CoachAsk question={t('evening.ask')} testID="evening-ask" />
      <LevelNote level={PARITY.readiness} text={t('home.briefNote')} />
    </BriefShell>
  );
}
