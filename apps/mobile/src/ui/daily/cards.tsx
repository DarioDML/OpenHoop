import type { DayRecord } from '@openhoop/core';
import { router, type Href } from 'expo-router';
import { Pressable, View, type ViewStyle } from 'react-native';

import { dayEntries } from '@/data/activities';
import { activeCheckIns } from '@/coach/checkIns';
import { useAppData } from '@/data/context';
import { baselineAt } from '@/data/derived';
import { caloriesForDay } from '@/data/energyDerived';
import { stressForDay } from '@/data/stressDerived';
import { formatHm, mainPeriod, vitalsSummary, weekProgress } from '@/data/dailyDerived';
import { strengthWeek } from '@/data/strength';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Icon, type IconName } from '@/ui/Icon';
import { useLayout } from '@/ui/layout';
import { MetricTile } from '@/ui/MetricTile';
import { ISSUES, type IssueKey } from '@/ui/NotBuilt';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { stressColor } from '@/ui/health/StressLevels';
import { radius, spacing, useTheme } from '@/ui/theme';

import { entryHref, entryTitle } from '@/ui/activity/entries';

import { Divider, WeekDots, useRangeChip } from './bits';
import { briefLines, tonightBedtime } from './briefText';
import { METRIC_SPECS, TILE_LABEL, slugForTile } from './metrics';

interface DayProps {
  days: readonly DayRecord[];
  index: number;
}

interface PendingProps {
  label: string;
  issue: IssueKey;
  href?: Href;
  testID?: string;
}

export function PendingCard({ label, issue, href, testID }: PendingProps) {
  const { t } = useT();
  return (
    <Card href={href} testID={testID} accessibilityLabel={label} style={{ flex: 1, gap: 6 }}>
      <AppText variant="capSmall" muted>
        {href ? `${label} ›` : label}
      </AppText>
      <AppText variant="bodyStrong" muted>
        {t('notBuilt.title')}
      </AppText>
      <AppText variant="caption" muted>
        {t('notBuilt.issue', { number: ISSUES[issue] })}
      </AppText>
    </Card>
  );
}

function halfCard(compact: boolean): ViewStyle {
  return { flexGrow: 1, flexShrink: 1, flexBasis: compact ? '100%' : 160, minWidth: 140 };
}

export function VitalsCard({ days, index }: DayProps) {
  const { t, reason } = useT();
  const { compact } = useLayout();
  const summary = vitalsSummary(days, index);
  const allIn = summary.inRange === summary.measured;
  return (
    <Card href="/health/vitals" testID="card-vitals" accessibilityLabel={t('home.vitals')} style={[halfCard(compact), { gap: 8 }]}>
      <AppText variant="capSmall" muted>
        {t('home.vitals')} ›
      </AppText>
      {summary.measured > 0 ? (
        <>
          <AppText variant="bodyStrong" testID="vitals-count">
            {t('home.vitalsWithin', { inRange: summary.inRange, measured: summary.measured })}
          </AppText>
          <Chip label={allIn ? t('home.vitalsAllIn') : t('home.vitalsOutside', { count: summary.outside.length })} tone={allIn ? 'positive' : 'warning'} />
        </>
      ) : (
        <AppText variant="bodyStrong" muted>
          {summary.calibrating ? t('range.calibrating') : reason('no-data')}
        </AppText>
      )}
    </Card>
  );
}

export function StressCard({ days, index }: DayProps) {
  const { t, language, reason } = useT();
  const { compact } = useLayout();
  const { colors } = useTheme();
  const day = days[index];
  const view = stressForDay(day);
  const latest = view.latest;
  return (
    <Card href="/health/stress" testID="card-stress" accessibilityLabel={t('home.stress')} style={[halfCard(compact), { gap: 8 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="capSmall" muted numberOfLines={1} style={{ flexShrink: 1 }}>
          {t('home.stress')} ›
        </AppText>
        <ParityBadge level={PARITY.stress} />
      </View>
      {latest && day ? (
        <>
          <AppText variant="bodyStrong" color={stressColor(colors, latest.level)} testID="stress-tile-level">
            {t(`stress.level.${latest.level}`)} · {formatNumber(latest.score, 1, language)}
          </AppText>
          <AppText variant="caption" muted numeric testID="stress-tile-time">
            {t('stress.at', { time: formatClock(latest.t, day.tzOffsetS) })} · {t('stress.estimate')}
          </AppText>
        </>
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
    <Card href="/home/morning-brief" testID="card-brief" accessibilityLabel={t('home.brief')} style={{ gap: 8 }}>
      <CardHeader title={t('home.brief')} chevron />
      {lines.length > 0 ? (
        <AppText variant="body" soft numberOfLines={3}>
          {lines.map((line) => line.text).join(' ')}
        </AppText>
      ) : (
        <AppText variant="body" muted>
          {t('home.briefEmpty')}
        </AppText>
      )}
      <AppText variant="label" color={colors.link}>
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
        gap: spacing.sm,
        minHeight: 48,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        backgroundColor: colors.coach.surface,
        opacity: pressed ? 0.8 : 1,
      })}>
      <Icon name="coach" color={colors.purple} size={18} />
      <AppText variant="body" muted style={{ flex: 1 }}>
        {t('home.askCoach')}
      </AppText>
      {checkIns > 0 ? <Chip label={t('coach.checkIn.title')} tone="purple" small testID="coach-pill-check-in" /> : null}
    </Pressable>
  );
}

interface ActionButtonProps {
  label: string;
  icon: IconName;
  href: Href;
  testID: string;
}

function ActionButton({ label, icon, href, testID }: ActionButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push(href)}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Icon name={icon} color={colors.text} size={16} strokeWidth={2} />
      <AppText variant="label" style={{ fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface MyDayProps extends DayProps {
  actions?: boolean;
}

export function MyDayCard({ days, index, actions = true }: MyDayProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const { activities } = useAppData();
  const day = days[index];
  if (!day) return null;
  const main = mainPeriod(day);
  const entries = dayEntries(days, day, activities);
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="capLarge" muted>
        {actions ? t('home.myDay') : t('home.thatDay')}
      </AppText>
      <Card testID="card-myday" style={{ gap: 0, paddingVertical: spacing.sm }}>
        {main ? (
          <Pressable
            testID="row-last-sleep"
            accessibilityRole="button"
            accessibilityLabel={t('home.lastSleep')}
            onPress={() => router.push(`/sleep/last-night?day=${day.day}`)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 }}>
            <Icon name="moon" color={colors.metric.sleep} size={20} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="body" style={{ fontWeight: '500' }}>
                {t('home.lastSleep')}
              </AppText>
              <AppText variant="caption" muted numeric>
                {formatClock(main.onset, day.tzOffsetS)} – {formatClock(main.offset, day.tzOffsetS)}
              </AppText>
            </View>
            <AppText variant="bodyStrong" numeric>
              {formatDuration(t, main.asleepS)}
            </AppText>
            <Icon name="chevronRight" color={colors.textMuted} size={18} />
          </Pressable>
        ) : (
          <View style={{ minHeight: 56, justifyContent: 'center' }}>
            <AppText variant="body" muted>
              {t('home.noSleepRow')}
            </AppText>
          </View>
        )}
        {entries.map((entry) => (
          <View key={entry.key}>
            <Divider />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={entryTitle(t, entry)}
              onPress={() => router.push(entryHref(entry, day.day, entry.id === null ? day.workouts.findIndex((w) => w.start === entry.detectedStart) : null))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 }}>
              <Icon name="flame" color={colors.metric.loadBright} size={20} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="body" style={{ fontWeight: '500' }}>
                  {entryTitle(t, entry)}
                </AppText>
                <AppText variant="caption" muted numeric>
                  {formatClock(entry.start, day.tzOffsetS)} – {formatClock(entry.end, day.tzOffsetS)}
                </AppText>
              </View>
              <Icon name="chevronRight" color={colors.textMuted} size={18} />
            </Pressable>
          </View>
        ))}
      </Card>
      {actions ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <ActionButton testID="btn-add-activity" label={t('home.addActivity')} icon="plus" href="/action-center" />
          <ActionButton testID="btn-start-activity" label={t('home.startActivity')} icon="play" href="/activity/start" />
        </View>
      ) : null}
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
  const strengthWeekStats = strengthWeek(strength.sessions, day.day);
  const plan = userData.weeklyPlan;
  const row = (label: string, dots: ReadonlyArray<boolean | null>, count: number, target: number | null, color: string, testID: string) => (
    <View key={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 36 }}>
      <AppText variant="label" muted style={{ width: 96 }}>
        {label}
      </AppText>
      <View style={{ flex: 1 }}>
        <WeekDots dots={dots} color={color} />
      </View>
      <AppText variant="bodyStrong" numeric testID={testID}>
        {target === null ? `${count}` : `${count}/${target}`}
      </AppText>
    </View>
  );
  return (
    <Card href="/plan" testID="card-week" accessibilityLabel={t('home.thisWeek')}>
      <CardHeader title={t('home.thisWeek')} action={`${t('home.weeklyPlan')} ›`} href="/plan" />
      {row(t('home.weekActive'), progress.loadDots, progress.loadCount, plan?.loadDays ?? null, colors.metric.loadBright, 'week-load')}
      {row(t('home.weekSleep'), progress.sleepDots, progress.sleepCount, plan?.sleepNights ?? null, colors.metric.sleep, 'week-sleep')}
      {row(t('strength.week.label'), strengthWeekStats.dots, strengthWeekStats.count, null, colors.accent, 'week-strength')}
    </Card>
  );
}

export function TonightCard({ days, index }: DayProps) {
  const { t } = useT();
  const day = days[index];
  if (!day) return null;
  const bedtime = tonightBedtime(days, index);
  const need = day.sleep.need.value;
  return (
    <Card href="/sleep/planner" testID="card-tonight" accessibilityLabel={t('home.tonight')}>
      <CardHeader title={t('home.tonight')} action={`${t('home.planner')} ›`} href="/sleep/planner" />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="capSmall" muted>
            {t('home.bedtime')}
          </AppText>
          <AppText variant="value" numeric testID="tonight-bed">
            {bedtime ? bedtime.bed : '–'}
          </AppText>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="capSmall" muted>
            {t('home.alarm')}
          </AppText>
          <AppText variant="bodyStrong" muted>
            {t('notBuilt.title')}
          </AppText>
          <AppText variant="caption" muted>
            {t('notBuilt.issue', { number: ISSUES.alarm })}
          </AppText>
        </View>
      </View>
      <AppText variant="label" muted>
        {need === null ? t('home.tonightNoNeed') : t('home.tonightNeed', { need: formatHm(need) })}
        {bedtime ? ` · ${t('home.tonightWake', { wake: bedtime.wake })}` : ''}
      </AppText>
    </Card>
  );
}

export function DashboardGrid({ days, index }: DayProps) {
  const { userData, profile } = useAppData();
  const { t } = useT();
  const rangeChip = useRangeChip();
  const day = days[index];
  if (!day) return null;
  const tileStyle = { flexBasis: '47%', flexGrow: 1 } as const;
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
              href="/load"
              caption={t('calories.estimate')}
            />
          );
        }
        if (tile === 'steps') {
          return (
            <MetricTile
              key={tile}
              style={tileStyle}
              testID="tile-steps"
              label={label}
              value={day.steps}
              reason={day.steps === null ? 'no-data' : null}
              level={PARITY.steps}
              href="/steps"
              caption={userData.stepsGoal === null ? undefined : t('home.stepsGoal', { goal: userData.stepsGoal })}
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
            href={`/recovery/metric/${slug}`}
            chip={rangeChip(derived.value, baselineAt(days, index, spec.key), spec.decimals)}
          />
        );
      })}
    </View>
  );
}
