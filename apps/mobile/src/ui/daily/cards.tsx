import type { DayRecord } from '@openhoop/core';
import { LOAD_MAX, type StressLevel } from '@openhoop/analytics';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { dayEntries, type ActivityEntry } from '@/data/activities';
import { stepsForDay } from '@/data/activityDerived';
import { activeCheckIns } from '@/coach/checkIns';
import { useAppData } from '@/data/context';
import { MIN_BASELINE_NIGHTS, baselineAt } from '@/data/derived';
import { buildingProgress } from '@/data/progress';
import type { TermId } from '@/data/terms';
import { caloriesForDay } from '@/data/energyDerived';
import { stressForDay } from '@/data/stressDerived';
import { formatHm, formatMinutes, goalMet, mainPeriod, strengthWeekMinutes, vitalsSummary, weekProgress } from '@/data/dailyDerived';
import { deviceTzOffsetS } from '@/lib/dates';
import { confirmedAlarm } from '@/data/alarm';
import type { AlarmView } from '@/data/types';
import { strengthWeek } from '@/data/strength';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { CoachMark } from '@/ui/CoachAsk';
import { useExplain, type ExplainTarget } from '@/ui/explain/ExplainProvider';
import { MetricName } from '@/ui/explain/MetricName';
import { Icon, type IconName } from '@/ui/Icon';
import { useLayout } from '@/ui/layout';
import { tile } from '@/ui/manage/tiles';
import { MetricTile } from '@/ui/MetricTile';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { stressColor } from '@/ui/health/StressLevels';
import { radius, spacing, useTheme, type ColorTokens } from '@/ui/theme';

import { entryHref, entryTitle } from '@/ui/activity/entries';

import { GoalSeal, IconTile, ProgressBar, SectionTitle, WeekDots, useRangeChip } from './bits';
import { briefLines, tonightBedtime } from './briefText';
import { METRIC_SPECS, TILE_LABEL, slugForTile } from './metrics';

interface DayProps {
  days: readonly DayRecord[];
  index: number;
}

interface TileCardProps extends DayProps {
  big?: boolean;
}

function halfCard(compact: boolean): ViewStyle {
  return { flexGrow: 1, flexShrink: 1, flexBasis: compact ? '100%' : 160, minWidth: 140 };
}

function TileLine({
  icon,
  title,
  titleColor,
  detail,
  testID,
  detailTestID,
}: {
  icon: ReactNode;
  title: string;
  titleColor?: string;
  detail: string;
  testID?: string;
  detailTestID?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="cap" color={titleColor} testID={testID}>
          {title}
        </AppText>
        <AppText variant="label" muted numeric testID={detailTestID}>
          {detail}
        </AppText>
      </View>
    </View>
  );
}

export function VitalsCard({ days, index, big = false }: TileCardProps) {
  const { t, reason } = useT();
  const { colors } = useTheme();
  const { compact } = useLayout();
  const summary = vitalsSummary(days, index);
  const allIn = summary.inRange === summary.measured;
  const status = allIn ? t('home.vitalsAllIn') : t('home.vitalsOutside', { count: summary.outside.length });
  const style = tile(colors, allIn ? 'check' : 'alert', allIn ? 'positive' : 'warning');
  return (
    <Card href="/health/vitals" testID="card-vitals" accessibilityLabel={t('home.vitals')} style={[halfCard(compact), { gap: 12 }]}>
      <AppText variant="capSmall" muted>
        {t('home.vitals')} ›
      </AppText>
      {summary.measured > 0 && big ? (
        <>
          <Num size={40} testID="vitals-count" accessibilityLabel={t('home.vitalsWithin', { inRange: summary.inRange, measured: summary.measured })}>
            {`${summary.inRange}/${summary.measured}`}
          </Num>
          <Chip label={status} tone={allIn ? 'positive' : 'warning'} />
        </>
      ) : summary.measured > 0 ? (
        <TileLine
          icon={<IconTile tile={style} />}
          title={status}
          titleColor={style.color}
          detail={t('home.vitalsWithin', { inRange: summary.inRange, measured: summary.measured })}
          detailTestID="vitals-count"
        />
      ) : summary.calibrating ? (
        <TileLine
          icon={<IconTile tile={tile(colors, 'check')} />}
          title={t('home.vitalsMeasured', { count: summary.withValue, total: summary.total })}
          detail={t('home.vitalsRangesFrom', { night: MIN_BASELINE_NIGHTS + 1 })}
          testID="vitals-count"
        />
      ) : (
        <AppText variant="bodyStrong" muted>
          {reason('no-data')}
        </AppText>
      )}
    </Card>
  );
}

function stressSoft(colors: ColorTokens, level: StressLevel): string {
  if (level === 'high') return colors.negativeSoft;
  if (level === 'medium') return colors.warningSoft;
  return colors.positiveSoft;
}

export function StressCard({ days, index, big = false }: TileCardProps) {
  const { t, language, reason } = useT();
  const { compact } = useLayout();
  const { colors } = useTheme();
  const day = days[index];
  const view = stressForDay(day);
  const latest = view.latest;
  const { why } = useExplain();
  const building = latest === null && index === days.length - 1 && buildingProgress('stress', days, index) !== null;
  const target: ExplainTarget = {
    term: 'stress',
    index,
    shown: { value: latest ? formatNumber(latest.score, 1, language) : null, unit: null, reason: view.reason },
  };
  const score = latest ? formatNumber(latest.score, 1, language) : null;
  return (
    <Card href="/health/stress" testID="card-stress" accessibilityLabel={t('home.stress')} style={[halfCard(compact), { gap: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginVertical: -15 }}>
        <MetricName target={target} label={t('home.stress')} testID="stress-tile-name" />
        <ParityBadge level={PARITY.stress} />
      </View>
      {latest && day && score !== null && big ? (
        <>
          <Num size={40} testID="stress-tile-score">
            {score}
          </Num>
          <Chip
            label={t(`stress.level.${latest.level}`)}
            tone={latest.level === 'low' ? 'positive' : latest.level === 'medium' ? 'warning' : 'negative'}
            testID="stress-tile-level"
          />
        </>
      ) : latest && day && score !== null ? (
        <TileLine
          icon={
            <IconTile tile={{ icon: 'pulse', color: stressColor(colors, latest.level), background: stressSoft(colors, latest.level) }}>
              <Num size={17} color={stressColor(colors, latest.level)} testID="stress-tile-score" maxFontSizeMultiplier={1}>
                {score}
              </Num>
            </IconTile>
          }
          title={t(`stress.level.${latest.level}`)}
          titleColor={stressColor(colors, latest.level)}
          detail={`${t('stress.at', { time: formatClock(latest.t, day.tzOffsetS) })} · ${t('stress.estimate')}`}
          testID="stress-tile-level"
          detailTestID="stress-tile-time"
        />
      ) : building ? (
        <Pressable accessibilityRole="button" testID="stress-tile-why" onPress={() => why(target)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconTile tile={tile(colors, 'clock')} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="cap" muted testID="stress-tile-reason">
              {t('stress.notYet')}
            </AppText>
            <AppText variant="label" muted>
              {t('stress.needsCalm')}
            </AppText>
          </View>
        </Pressable>
      ) : (
        <AppText variant="bodyStrong" muted testID="stress-tile-reason">
          {view.calibrating ? t('stress.calibratingTitle') : view.reason === 'low-coverage' ? t('stress.noWindows') : reason(view.reason ?? 'no-data')}
        </AppText>
      )}
    </Card>
  );
}

export function MorningBriefCard({ days, index }: DayProps) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const lines = briefLines(t, language, days, index);
  return (
    <Card href="/home/morning-brief" testID="card-brief" accessibilityLabel={t('home.brief')} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="sun" color={colors.gold} size={22} />
        <AppText variant="cardTitle" style={{ flex: 1 }}>
          {t('home.brief')}
        </AppText>
        <Icon name="chevronRight" color={colors.textMuted} size={18} />
      </View>
      {lines.length > 0 ? (
        <AppText variant="lead" soft numberOfLines={3}>
          {lines.map((line) => line.text).join(' ')}
        </AppText>
      ) : (
        <AppText variant="body" muted>
          {t('home.briefEmpty')}
        </AppText>
      )}
      <AppText variant="cap" color={colors.purple}>
        {t('home.readMore')} →
      </AppText>
    </Card>
  );
}

export function CoachPill() {
  const { t } = useT();
  const { colors } = useTheme();
  const { days, userData } = useAppData();
  const checkIns = userData.coach.checkIns ? activeCheckIns(days, userData.coach.dismissedCheckIns).length : 0;
  return (
    <Pressable
      testID="coach-pill"
      accessibilityRole="button"
      accessibilityLabel={t('home.askCoach')}
      onPress={() => router.push('/coach')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 56,
        paddingLeft: spacing.sm,
        paddingRight: spacing.lg,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.coach.surface,
        opacity: pressed ? 0.8 : 1,
      })}>
      <CoachMark />
      <AppText variant="body" muted style={{ flex: 1 }}>
        {t('home.askCoach')}
      </AppText>
      {checkIns > 0 ? <Chip label={t('coach.checkIn.title')} tone="purple" small testID="coach-pill-check-in" /> : null}
    </Pressable>
  );
}

interface ActionButtonProps {
  label: string;
  href: Href;
  filled: boolean;
  testID: string;
}

function ActionButton({ label, href, filled, testID }: ActionButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push(href)}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 56,
        paddingHorizontal: spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        borderWidth: 2,
        borderColor: colors.primary,
        backgroundColor: filled ? colors.primary : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}>
      <AppText variant="cap" color={filled ? colors.primaryOn : colors.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 13 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface DayRowProps {
  icon: IconName;
  iconColor: string;
  tileColor: string;
  value: string;
  title: string;
  span: string;
  fraction: number | null;
  barColor: string;
  href: Href;
  a11y: string;
  testID?: string;
}

function DayRow({ icon, iconColor, tileColor, value, title, span, fraction, barColor, href, a11y, testID }: DayRowProps) {
  const { colors } = useTheme();
  return (
    <Card href={href} testID={testID} accessibilityLabel={a11y} style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View
        style={{
          width: 104,
          height: 56,
          borderRadius: radius.sm,
          backgroundColor: tileColor,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
        }}>
        <Icon name={icon} color={iconColor} size={18} />
        <Num size={26} adjustsFontSizeToFit maxFontSizeMultiplier={1.1} style={{ maxWidth: 66 }}>
          {value}
        </Num>
      </View>
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
        <AppText variant="cap" numberOfLines={1} style={{ fontSize: 13 }}>
          {title}
        </AppText>
        <AppText variant="label" muted numeric numberOfLines={1}>
          {span}
        </AppText>
        {fraction === null ? null : <ProgressBar fraction={fraction} color={barColor} height={2} />}
      </View>
      <Icon name="chevronRight" color={colors.textMuted} size={18} />
    </Card>
  );
}

function entryValue(entry: ActivityEntry, language: 'nl' | 'en'): string {
  if (entry.metrics.load !== null) return formatNumber(entry.metrics.load, 1, language);
  return formatHm(entry.metrics.activeS);
}

interface MyDayProps extends DayProps {
  actions?: boolean;
}

export function MyDayCard({ days, index, actions = true }: MyDayProps) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { activities } = useAppData();
  const day = days[index];
  if (!day) return null;
  const main = mainPeriod(day);
  const entries = dayEntries(days, day, activities);
  const need = day.sleep.need.value;
  return (
    <View style={{ gap: spacing.md }} testID="card-myday">
      <SectionTitle title={actions ? t('home.myDay') : t('home.thatDay')} />
      {main ? (
        <DayRow
          testID="row-last-sleep"
          icon="moon"
          iconColor={colors.purple}
          tileColor={colors.purpleSoft}
          value={formatHm(main.asleepS)}
          title={t('home.lastSleep')}
          span={`${formatClock(main.onset, day.tzOffsetS)} – ${formatClock(main.offset, day.tzOffsetS)}`}
          fraction={need === null || need <= 0 ? null : main.asleepS / need}
          barColor={colors.metric.sleep}
          href={`/sleep/last-night?day=${day.day}`}
          a11y={`${t('home.lastSleep')}, ${formatDuration(t, main.asleepS)}`}
        />
      ) : (
        <Card style={{ minHeight: 56, justifyContent: 'center' }}>
          <AppText variant="body" muted>
            {t('home.noSleepRow')}
          </AppText>
        </Card>
      )}
      {entries.map((entry) => {
        const title = entryTitle(t, entry);
        return (
          <DayRow
            key={entry.key}
            testID={`row-entry-${entry.key}`}
            icon="run"
            iconColor={colors.metric.loadBright}
            tileColor={colors.accentSoft}
            value={entryValue(entry, language)}
            title={title}
            span={`${formatClock(entry.start, day.tzOffsetS)} – ${formatClock(entry.end, day.tzOffsetS)}`}
            fraction={entry.metrics.load === null ? null : entry.metrics.load / LOAD_MAX}
            barColor={colors.metric.loadBright}
            href={entryHref(entry, day.day, entry.id === null ? day.workouts.findIndex((w) => w.start === entry.detectedStart) : null)}
            a11y={
              entry.metrics.load === null
                ? `${title}, ${formatDuration(t, entry.metrics.activeS)}`
                : `${title}, ${t('activity.load.value', { value: entryValue(entry, language) })}`
            }
          />
        );
      })}
      {actions ? (
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <ActionButton testID="btn-add-activity" label={`+ ${t('home.addActivity')}`} href="/action-center" filled={false} />
          <ActionButton testID="btn-start-activity" label={t('home.startActivity')} href="/activity/start" filled />
        </View>
      ) : null}
    </View>
  );
}

interface WeekRowProps {
  label: string;
  a11y: string;
  children: ReactNode;
  value: string;
  met: boolean;
  testID: string;
}

function WeekRow({ label, a11y, children, value, met, testID }: WeekRowProps) {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${a11y}: ${value}${met ? `, ${t('home.week.goalMet')}` : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 28 }}>
      <AppText variant="cap" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ width: 84 }}>
        {label}
      </AppText>
      <View style={{ flex: 1 }}>{children}</View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {met ? <GoalSeal label={t('home.week.goalMet')} testID={`${testID}-seal`} /> : null}
        <AppText variant="label" numeric color={met ? colors.positive : colors.textMuted} testID={testID}>
          {value}
        </AppText>
      </View>
    </View>
  );
}

export function WeekCard({ days, index }: DayProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData, strength } = useAppData();
  const day = days[index];
  if (!day) return null;
  const progress = weekProgress(days, day.day);
  const strengthDots = strengthWeek(strength.sessions, day.day);
  const strengthTime = strengthWeekMinutes(strength.sessions, day.day);
  const plan = userData.weeklyPlan;
  const strengthGoal = plan?.strengthMinutes ?? null;
  return (
    <Card href="/plan" testID="card-week" accessibilityLabel={t('home.thisWeek')} style={{ gap: spacing.lg }}>
      <CardHeader title={t('home.thisWeek')} action={`${t('home.weeklyPlan')} ›`} href="/plan" />
      <WeekRow
        label={t('score.load')}
        a11y={t('home.weekActive')}
        value={plan ? t('home.week.days', { count: progress.loadCount, target: plan.loadDays }) : t('home.week.daysCount', { count: progress.loadCount })}
        met={goalMet(progress.loadCount, plan?.loadDays)}
        testID="week-load">
        <WeekDots dots={progress.loadDots} color={colors.metric.loadBright} />
      </WeekRow>
      <WeekRow
        label={t('home.week.sleep')}
        a11y={t('home.weekSleep')}
        value={plan ? `${progress.sleepCount}/${plan.sleepNights}` : `${progress.sleepCount}`}
        met={goalMet(progress.sleepCount, plan?.sleepNights)}
        testID="week-sleep">
        <WeekDots dots={progress.sleepDots} color={colors.purple} />
      </WeekRow>
      <WeekRow
        label={t('strength.week.label')}
        a11y={t('strength.week.label')}
        value={
          strengthGoal === null
            ? t('home.week.strengthNoGoal', { count: strengthDots.count, minutes: strengthTime.minutes })
            : t('home.week.strengthGoal', { minutes: strengthTime.minutes, goal: strengthGoal })
        }
        met={goalMet(strengthTime.minutes, strengthGoal)}
        testID="week-strength">
        {strengthGoal === null ? (
          <WeekDots dots={strengthDots.dots} color={colors.metric.loadBright} />
        ) : (
          <ProgressBar fraction={strengthTime.minutes / strengthGoal} color={colors.metric.loadBright} testID="week-strength-bar" />
        )}
      </WeekRow>
    </Card>
  );
}

function alarmValue(alarm: AlarmView, nowS: number): { time: string | null; armed: boolean } {
  const armed = confirmedAlarm(alarm.armed, nowS);
  if (armed !== null) return { time: formatClock(armed.wakeAt, deviceTzOffsetS(new Date(armed.wakeAt * 1000))), armed: true };
  return { time: alarm.plan.enabled ? formatMinutes(alarm.plan.minutes) : null, armed: false };
}

export function AlarmSummary({ testID }: { testID: string }) {
  const { t } = useT();
  const { alarm } = useAppData();
  const value = alarmValue(alarm, Math.floor(Date.now() / 1000));
  return (
    <View style={{ gap: 4 }}>
      <AppText variant="bodyStrong" numeric muted={value.time === null} testID={`${testID}-time`}>
        {value.time ?? t('alarm.status.off')}
      </AppText>
      <AppText variant="caption" muted testID={`${testID}-state`}>
        {value.time === null ? t('alarm.summary.off') : value.armed ? t('alarm.summary.armed') : t('alarm.summary.pending')}
      </AppText>
    </View>
  );
}

export function AlarmCard({ testID }: { testID: string }) {
  const { t } = useT();
  return (
    <Card href="/sleep/alarm" testID={testID} accessibilityLabel={t('home.alarm')} style={{ flex: 1, gap: 6 }}>
      <AppText variant="capSmall" muted>
        {`${t('home.alarm')} ›`}
      </AppText>
      <AlarmSummary testID={testID} />
    </Card>
  );
}

export function TonightCard({ days, index }: DayProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const { alarm } = useAppData();
  const day = days[index];
  if (!day) return null;
  const bedtime = tonightBedtime(days, index);
  const need = day.sleep.need.value;
  const value = alarmValue(alarm, Math.floor(Date.now() / 1000));
  const parts = [need === null ? t('home.tonightNoNeed') : t('home.tonightNeed', { need: formatHm(need) })];
  if (value.time !== null) parts.push(t('home.tonightAlarmMode', { mode: t(`alarm.mode.${alarm.plan.mode}`) }));
  else if (bedtime) parts.push(t('home.tonightWake', { wake: bedtime.wake }));
  return (
    <Card href="/sleep/planner" testID="card-tonight" accessibilityLabel={t('home.tonight')} style={{ gap: 14 }}>
      <CardHeader title={t('home.tonight')} action={`${t('home.planner')} ›`} href="/sleep/planner" />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 6 }}>
          <AppText variant="capSmall" muted>
            {t('home.bedtime')}
          </AppText>
          {bedtime ? (
            <Num size={32} testID="tonight-bed">
              {bedtime.bed}
            </Num>
          ) : (
            <AppText variant="bodyStrong" muted testID="tonight-bed">
              {t('home.tonightNoBed')}
            </AppText>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('home.alarm')} onPress={() => router.push('/sleep/alarm')} style={{ flex: 1, gap: 6 }} testID="tonight-alarm">
          <AppText variant="capSmall" muted>
            {t('home.alarm')}
          </AppText>
          {value.time === null ? (
            <AppText variant="bodyStrong" muted testID="tonight-alarm-time">
              {t('alarm.status.off')}
            </AppText>
          ) : (
            <Num size={32} testID="tonight-alarm-time">
              {value.time}
            </Num>
          )}
          <AppText variant="caption" color={value.time !== null && !value.armed ? colors.warning : colors.textMuted} testID="tonight-alarm-state">
            {value.time === null ? t('alarm.summary.off') : value.armed ? t('alarm.summary.armed') : t('alarm.summary.pending')}
          </AppText>
        </Pressable>
      </View>
      <AppText variant="label" muted testID="tonight-note">
        {parts.join(' · ')}
      </AppText>
    </Card>
  );
}

export function DashboardGrid({ days, index }: DayProps) {
  const { userData, profile, healthConnect } = useAppData();
  const { t } = useT();
  const rangeChip = useRangeChip();
  const day = days[index];
  if (!day) return null;
  const tileStyle = { flexBasis: '47%', flexGrow: 1 } as const;
  const explainOf = (term: TermId): { term: TermId; index: number } => ({ term, index });
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }} testID="dashboard-grid">
      {userData.dashboardTiles.map((tile) => {
        const label = t(TILE_LABEL[tile]);
        if (tile === 'calories') {
          const calories = caloriesForDay(day, userData, profile);
          return (
            <MetricTile
              key={tile}
              style={tileStyle}
              testID="tile-calories"
              label={label}
              value={calories.estimate?.totalKcal ?? null}
              reason={calories.reason}
              unit={t('calories.unit')}
              level={PARITY.calories}
              explain={explainOf('calories')}
              href="/load"
              caption={t('calories.estimate')}
            />
          );
        }
        if (tile === 'steps') {
          const steps = stepsForDay(day, healthConnect.state.steps);
          const fromHc = steps.source === 'healthConnect';
          return (
            <MetricTile
              key={tile}
              style={tileStyle}
              testID="tile-steps"
              label={label}
              value={steps.steps}
              reason={steps.steps === null ? 'no-data' : null}
              level={fromHc ? 'D' : PARITY.steps}
              explain={explainOf('steps')}
              href="/steps"
              caption={fromHc ? t('steps.fromHealthConnect') : userData.stepsGoal === null ? undefined : t('home.stepsGoal', { goal: userData.stepsGoal })}
            />
          );
        }
        if (tile === 'wearTime') {
          return (
            <MetricTile
              key={tile}
              style={tileStyle}
              testID="tile-wearTime"
              label={label}
              value={day.worn?.value ?? null}
              reason={day.worn === undefined ? 'no-data' : day.worn.reason}
              level={PARITY.wearTime}
              explain={explainOf('wearTime')}
              format={(v) => formatDuration(t, v)}
            />
          );
        }
        if (tile === 'sleepDebt') {
          return (
            <MetricTile
              key={tile}
              style={tileStyle}
              testID="tile-sleepDebt"
              label={label}
              value={day.sleep.debt.value}
              reason={day.sleep.debt.reason}
              level={PARITY.sleepNeed}
              explain={explainOf('sleepDebt')}
              format={(v) => formatDuration(t, v)}
              href="/sleep/need"
            />
          );
        }
        const slug = slugForTile(tile);
        if (slug === null) return null;
        const spec = METRIC_SPECS[slug];
        const derived = spec.pick(day);
        return (
          <MetricTile
            key={tile}
            style={tileStyle}
            testID={`tile-${tile}`}
            label={label}
            value={derived.value}
            reason={derived.reason}
            unit={t(spec.unit)}
            decimals={spec.decimals}
            level={spec.level}
            explain={explainOf(spec.term)}
            href={`/recovery/metric/${slug}`}
            chip={rangeChip(derived.value, baselineAt(days, index, spec.key), spec.decimals)}
          />
        );
      })}
    </View>
  );
}
