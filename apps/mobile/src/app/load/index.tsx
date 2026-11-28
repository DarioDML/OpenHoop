import { router } from 'expo-router';
import { View } from 'react-native';

import { stepsForDay } from '@/data/activityDerived';
import { dayEntries, dayTotals } from '@/data/activities';
import { useAppData } from '@/data/context';
import { LOAD_SCALE_MAX } from '@/data/loadDerived';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatNumber, formatShortDay } from '@/lib/format';
import { CaloriesCard, CaloriesTile } from '@/ui/activity/CaloriesCard';
import { entryHref, UndoBar } from '@/ui/activity/entries';
import { NoDataScreen, StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { BarChart } from '@/ui/BarChart';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { useExplain, type ExplainTarget } from '@/ui/explain/ExplainProvider';
import { LevelNote } from '@/ui/LevelNote';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { LoadEntryRow } from '@/ui/load/LoadEntryRow';
import { LoadRing } from '@/ui/load/LoadRing';
import { ReadyCard } from '@/ui/load/ReadyCard';
import { StepsTile } from '@/ui/load/StepsTile';
import { TargetPill } from '@/ui/load/TargetPill';
import { useLoadToday } from '@/ui/load/useLoadToday';
import { ZoneRows } from '@/ui/load/ZoneRows';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';
import { IconButton, TopBar } from '@/ui/TopBar';
import { displayedZones } from '@/ui/ZoneBar';

export default function LoadScreen() {
  const { days, userData, activities, healthConnect, device } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const explain = useExplain();
  const today = useLoadToday();

  if (today === null) return <NoDataScreen title={t('score.load')} />;

  const { day, index } = today;
  const recent = days.slice(-14);
  const zoneTotal = displayedZones(day.zoneSeconds).reduce((a, b) => a + b, 0);
  const steps = stepsForDay(day, healthConnect.state.steps);
  const fmt = (v: number, d = 0): string => formatNumber(v, d, language);
  const target: ExplainTarget = { term: 'load', index, shown: { value: today.value === null ? null : fmt(today.value, 1), unit: null, reason: today.reason } };
  const caption = today.live
    ? t('loadScreen.ring.live', { max: LOAD_SCALE_MAX })
    : today.soFar
      ? t('loadScreen.ring.soFar', { max: LOAD_SCALE_MAX })
      : t('loadScreen.ring.day', { max: LOAD_SCALE_MAX });
  const entries = dayEntries(days, day, activities);
  const totals = dayTotals(entries);

  return (
    <Screen
      tint="load"
      header={
        <>
          <TopBar title={t('score.load')} right={<IconButton icon="info" label={t('explain.whatIs', { name: t('score.load') })} onPress={() => explain.about(target)} testID="load-about" />} />
          <View style={{ alignItems: 'center', gap: spacing.lg }}>
            <LoadRing
              testID="ring-load-detail"
              value={today.value}
              max={LOAD_SCALE_MAX}
              aim={today.aim}
              caption={caption}
              reason={today.reason}
              onExplain={() => explain.why(target)}
            />
            <View style={{ alignItems: 'center', gap: spacing.xs }}>
              <TargetPill view={today.view} hidden={today.targetsHidden} marker onPress={() => router.push('/load/target')} testID="load-target-pill" />
              {today.soFar && device.lastSyncAt !== null ? (
                <AppText variant="caption" muted>
                  {t('loadx.soFarCaption', { time: formatClock(device.lastSyncAt, day.tzOffsetS) })}
                </AppText>
              ) : null}
            </View>
          </View>
        </>
      }>
      <ReadyCard today={today} />

      <UndoBar />
      <View style={{ gap: spacing.sm }}>
        <CapHeader title={t('loadScreen.activities')} />
        {totals.count > 0 ? (
          <AppText variant="label" muted>
            {t('activity.totals', { count: totals.count, time: formatDuration(t, totals.seconds) })}
          </AppText>
        ) : null}
      </View>
      {entries.length === 0 ? (
        <Card>
          <AppText variant="body" muted>
            {t('load.noWorkouts')}
          </AppText>
        </Card>
      ) : (
        entries.map((entry) => {
          const workoutIndex = entry.id === null ? day.workouts.findIndex((w) => w.start === entry.detectedStart) : null;
          return <LoadEntryRow key={entry.key} entry={entry} href={entryHref(entry, day.day, workoutIndex)} tzOffsetS={day.tzOffsetS} max={LOAD_SCALE_MAX} testID={`entry-${entry.key}`} />;
        })
      )}
      {totals.count > 0 ? (
        <AppText variant="caption" muted>
          {t('activity.dayLoadNote')}
        </AppText>
      ) : null}
      <Button label={t('loadx.addActivity')} variant="secondary" onPress={() => router.push('/activity/add')} />

      <Card testID="load-zones" style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="cap" muted style={{ flexShrink: 1 }}>
            {t('loadScreen.zones.title')}
          </AppText>
          <AppText variant="caption" muted>
            {t('loadScreen.zones.unit')}
          </AppText>
        </View>
        <ZoneRows zoneSeconds={day.zoneSeconds} testID="load-zone" />
        <AppText variant="caption" muted>
          {t('load.zonesTotal', { time: formatDuration(t, zoneTotal) })}
        </AppText>
      </Card>

      <Section title={t('metric.heartRate')}>
        <StatRow>
          <StatTile label={t('loadx.hr.min')} value={day.heartRate.min === null ? t('loadx.noValue') : fmt(day.heartRate.min)} unit={day.heartRate.min === null ? undefined : t('unit.bpm')} testID="hr-min" />
          <StatTile label={t('loadx.hr.avg')} value={day.heartRate.avg === null ? t('loadx.noValue') : fmt(day.heartRate.avg)} unit={day.heartRate.avg === null ? undefined : t('unit.bpm')} testID="hr-avg" />
          <StatTile label={t('loadx.hr.max')} value={day.heartRate.max === null ? t('loadx.noValue') : fmt(day.heartRate.max)} unit={day.heartRate.max === null ? undefined : t('unit.bpm')} testID="hr-max" />
        </StatRow>
      </Section>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <StepsTile steps={steps} goal={userData.stepsGoal} />
        <CaloriesTile day={day} />
      </View>
      <CaloriesCard day={day} compact />

      <Section title={t('load.history')}>
        <Card>
          <BarChart
            data={recent.map((d) => d.load.value)}
            max={LOAD_SCALE_MAX}
            formatTick={(v) => fmt(v)}
            startLabel={formatShortDay(recent[0]?.day ?? '', language)}
            endLabel={formatShortDay(recent[recent.length - 1]?.day ?? '', language)}
          />
        </Card>
      </Section>

      <ListGroup>
        <ListRow title={t('loadx.link.trends')} href="/load/trends" icon={{ icon: 'trends', color: colors.accent, background: colors.accentSoft }} />
        <ListRow title={t('loadx.link.week')} href="/load/week" icon={{ icon: 'calendar', color: colors.accent, background: colors.accentSoft }} />
        <ListRow title={t('loadx.link.plan')} href="/plan" icon={{ icon: 'target', color: colors.accent, background: colors.accentSoft }} />
        <ListRow title={t('loadx.link.strength')} href="/strength" icon={{ icon: 'dumbbell', color: colors.accent, background: colors.accentSoft }} />
      </ListGroup>

      <LevelNote level={PARITY.load} text={t('loadScreen.levelNote')} testID="load-level" />
    </Screen>
  );
}
