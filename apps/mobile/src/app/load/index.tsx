import { router } from 'expo-router';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { loadTargetBand } from '@/data/activityDerived';
import { rangeStatus } from '@/data/derived';
import { useT } from '@/i18n/useT';
import { formatDuration, formatNumber, formatShortDay } from '@/lib/format';
import { CaloriesCard } from '@/ui/activity/CaloriesCard';
import { NoDataScreen, ProgressBar, StatRow, StatTile, WorkoutRow } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { BarChart } from '@/ui/BarChart';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { ScoreRing } from '@/ui/ScoreRing';
import { Section } from '@/ui/Section';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';
import { ZoneBar } from '@/ui/ZoneBar';

export default function LoadScreen() {
  const { days, userData } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const day = days[days.length - 1];

  if (!day) return <NoDataScreen title={t('score.load')} />;

  const recent = days.slice(-14);
  const zoneTotal = day.zoneSeconds.reduce((a, b) => a + b, 0);
  const band = loadTargetBand(days);
  const status = rangeStatus(day.load.value, band);
  const stepsGoal = userData.stepsGoal;
  const fmt = (v: number, d = 0): string => formatNumber(v, d, language);

  return (
    <Screen
      tint="load"
      header={
        <>
          <TopBar title={t('score.load')} />
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <ScoreRing
              testID="ring-load-detail"
              label={t('score.load')}
              value={day.load.value}
              max={21}
              level={PARITY.load}
              reason={day.load.reason}
              decimals={1}
              size={200}
              strokeWidth={12}
              color={colors.metric.loadBright}
              showLabel={false}
              tickValue={band ? band.mean : null}
            />
            <AppText variant="cap" muted>
              {t('loadx.hero.caption')}
            </AppText>
            <ParityBadge level={PARITY.load} long />
          </View>
        </>
      }>
      <Card href="/load/target" accessibilityLabel={t('loadx.target.title')} testID="load-target-card">
        <CardHeader title={t('loadx.target.title')} chevron />
        {band ? (
          <>
            <AppText variant="body">{t('loadx.target.usual', { low: fmt(band.low, 1), high: fmt(band.high, 1) })}</AppText>
            {status ? <Chip tone={status === 'within' ? 'positive' : 'info'} label={t(`range.${status}`, { low: fmt(band.low, 1), high: fmt(band.high, 1) })} /> : null}
          </>
        ) : (
          <Chip label={t('range.calibrating')} tone="warning" />
        )}
      </Card>

      <Section title={t('load.workouts')}>
        {day.workouts.length === 0 ? (
          <Card>
            <AppText variant="body" muted>
              {t('load.noWorkouts')}
            </AppText>
          </Card>
        ) : (
          day.workouts.map((_, index) => <WorkoutRow key={day.workouts[index]?.start ?? index} day={day} index={index} />)
        )}
        <Button label={t('loadx.addActivity')} variant="secondary" onPress={() => router.push('/activity/add')} />
      </Section>

      <Section title={t('load.zones')} hint={t('load.zonesTotal', { time: formatDuration(t, zoneTotal) })}>
        <Card>
          <ZoneBar zoneSeconds={day.zoneSeconds} />
        </Card>
      </Section>

      <Section title={t('metric.heartRate')}>
        <StatRow>
          <StatTile label={t('loadx.hr.min')} value={day.heartRate.min === null ? t('loadx.noValue') : fmt(day.heartRate.min)} unit={day.heartRate.min === null ? undefined : t('unit.bpm')} testID="hr-min" />
          <StatTile label={t('loadx.hr.avg')} value={day.heartRate.avg === null ? t('loadx.noValue') : fmt(day.heartRate.avg)} unit={day.heartRate.avg === null ? undefined : t('unit.bpm')} testID="hr-avg" />
          <StatTile label={t('loadx.hr.max')} value={day.heartRate.max === null ? t('loadx.noValue') : fmt(day.heartRate.max)} unit={day.heartRate.max === null ? undefined : t('unit.bpm')} testID="hr-max" />
        </StatRow>
      </Section>

      <Card href="/steps" accessibilityLabel={t('metric.steps')} testID="steps-card">
        <CardHeader title={t('metric.steps')} chevron />
        {day.steps === null ? (
          <AppText variant="body" muted>
            {t('steps.none')}
          </AppText>
        ) : (
          <>
            <Num size={40}>{fmt(day.steps)}</Num>
            {stepsGoal !== null ? (
              <>
                <ProgressBar fraction={day.steps / stepsGoal} label={t('metric.steps')} />
                <AppText variant="label" muted>
                  {t('steps.ofGoal', { percent: Math.round((day.steps / stepsGoal) * 100), goal: fmt(stepsGoal) })}
                </AppText>
              </>
            ) : null}
          </>
        )}
      </Card>

      <CaloriesCard day={day} />

      <Section title={t('load.history')}>
        <Card>
          <BarChart
            data={recent.map((d) => d.load.value)}
            max={21}
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

      <Card tone="outline" style={{ gap: 4 }}>
        <ParityBadge level={PARITY.load} long />
        <AppText variant="label" muted>
          {t('loadx.levelNote')}
        </AppText>
        <AppText variant="caption" muted>
          {t('load.scale')}
        </AppText>
      </Card>
    </Screen>
  );
}
