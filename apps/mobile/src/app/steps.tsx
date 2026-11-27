import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { mergeSteps, stepsStats, type StepsDay } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { compactThousands, hourlyStepBars, type HourBar } from '@/data/loadDerived';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { NoDataScreen, StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { BarChart } from '@/ui/BarChart';
import { Card } from '@/ui/Card';
import { Button, Segmented } from '@/ui/controls';
import { useExplain } from '@/ui/explain/ExplainProvider';
import { LevelNote } from '@/ui/LevelNote';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { weekdayShort } from '@/ui/readiness/format';
import { Ring } from '@/ui/Ring';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';
import { ValueBars } from '@/ui/ValueBars';

type Range = '7' | '30';

function HealthConnectSource({ entry }: { entry: StepsDay }) {
  const { t } = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
      <ParityBadge level="D" />
      <AppText variant="caption" muted style={{ flexShrink: 1 }} testID="steps-today-source">
        {entry.origins.length === 0 ? t('steps.fromHealthConnect') : t('steps.fromHealthConnectApp', { app: entry.origins.join(', ') })}
      </AppText>
    </View>
  );
}

function HourChart({ bars }: { bars: readonly HourBar[] }) {
  const { t, language } = useT();
  return (
    <>
      <ValueBars
        testID="steps-by-hour"
        fill
        showValues={false}
        height={110}
        barWidth={24}
        bars={bars.map((bar, i) => ({
          key: String(bar.t),
          value: bar.steps,
          label: i % 2 === 0 ? String(bar.hour) : '',
          a11yLabel: t('stepsScreen.hourA11y', { hour: bar.hour }),
          display: bar.steps === null ? undefined : formatNumber(bar.steps, 0, language),
        }))}
      />
      {bars.some((bar) => bar.steps === null) ? (
        <AppText variant="caption" muted>
          {t('stepsScreen.byHourGap')}
        </AppText>
      ) : null}
    </>
  );
}

export default function StepsScreen() {
  const { days, userData, healthConnect } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const nowS = useExplain().nowS();
  const [range, setRange] = useState<Range>('7');
  const merged = mergeSteps(days, healthConnect.state.steps);
  const today = merged[merged.length - 1];
  if (!today) return <NoDataScreen title={t('metric.steps')} />;

  const goal = userData.stepsGoal;
  const shown = merged.slice(-Number(range));
  const stats = stepsStats(shown, goal);
  const fromHc = shown.filter((entry) => entry.source === 'healthConnect').length;
  const fmt = (v: number): string => formatNumber(v, 0, language);
  const record = days.find((d) => d.day === today.day) ?? null;
  const hours = today.source === 'band' && record !== null ? hourlyStepBars(record, nowS) : null;
  const hourNote =
    today.source === 'healthConnect'
      ? t('stepsScreen.byHourHc')
      : today.steps === null || (hours !== null && hours.length === 0)
        ? t('stepsScreen.byHourEmpty')
        : hours === null
          ? t('stepsScreen.byHourPending')
          : null;
  const goalLine =
    today.steps === null || goal === null
      ? null
      : today.steps >= goal
        ? t('stepsScreen.goalReached', { percent: Math.round((today.steps / goal) * 100), goal: fmt(goal) })
        : t('stepsScreen.goalLine', { percent: Math.round((today.steps / goal) * 100), goal: fmt(goal), left: fmt(goal - today.steps) });

  return (
    <Screen
      tint="load"
      testID="steps-screen"
      header={
        <>
          <TopBar title={t('metric.steps')} />
          <View style={{ alignItems: 'center', gap: 14 }}>
            <Ring size={200} strokeWidth={10} fraction={today.steps === null || goal === null ? null : today.steps / goal} color={colors.accent} testID="steps-ring">
              {today.steps === null ? (
                <AppText variant="label" muted style={{ textAlign: 'center', paddingHorizontal: spacing.xl }} testID="steps-today-none">
                  {t('steps.none')}
                </AppText>
              ) : (
                <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: spacing.md }}>
                  <Num size={64} adjustsFontSizeToFit testID="steps-today">
                    {fmt(today.steps)}
                  </Num>
                  <AppText variant="cap" muted>
                    {t('stepsScreen.today')}
                  </AppText>
                </View>
              )}
            </Ring>
            {goalLine !== null ? (
              <AppText variant="label" soft style={{ textAlign: 'center', fontWeight: '400' }} testID="steps-goal-line">
                {goalLine}
              </AppText>
            ) : null}
            {today.source === 'healthConnect' ? <HealthConnectSource entry={today} /> : null}
          </View>
        </>
      }>
      {goal === null ? (
        <Card>
          <AppText variant="body" muted>
            {t('steps.noGoal')}
          </AppText>
          <Button label={t('steps.setGoal')} variant="secondary" onPress={() => router.push('/profile/edit')} testID="steps-set-goal" />
        </Card>
      ) : null}

      <Card testID="steps-hour-card" style={{ gap: spacing.md }}>
        <AppText variant="cap" muted>
          {t('stepsScreen.byHour')}
        </AppText>
        {hourNote !== null || hours === null ? (
          <AppText variant="label" muted testID="steps-hour-note">
            {hourNote ?? t('stepsScreen.byHourPending')}
          </AppText>
        ) : (
          <HourChart bars={hours} />
        )}
      </Card>

      <Segmented
        testID="steps-range"
        value={range}
        onChange={setRange}
        options={[
          { value: '7', label: t('trends.range7') },
          { value: '30', label: t('trends.range30') },
        ]}
      />
      {shown.length < Number(range) ? (
        <AppText variant="label" muted>
          {t('trends.fewDays', { count: shown.length })}
        </AppText>
      ) : null}
      <Card testID="steps-days-card" style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="cap" muted>
            {range === '7' ? t('stepsScreen.last7') : t('stepsScreen.last30')}
          </AppText>
          {stats.average !== null ? (
            <AppText variant="label" muted testID="steps-avg-short">
              {t('stepsScreen.avgShort', { value: formatNumber(compactThousands(stats.average), 1, language) })}
            </AppText>
          ) : null}
        </View>
        {range === '7' ? (
          <>
            <ValueBars
              testID="steps-week"
              fill
              height={110}
              barWidth={24}
              highlight={shown.length - 1}
              bars={shown.map((entry) => ({
                key: entry.day,
                value: entry.steps,
                label: weekdayShort(entry.day, language),
                a11yLabel: formatShortDay(entry.day, language),
                display: entry.steps === null ? undefined : formatNumber(compactThousands(entry.steps), 1, language),
              }))}
            />
            <AppText variant="caption" muted>
              {t('stepsScreen.thousands')}
            </AppText>
          </>
        ) : (
          <BarChart
            data={shown.map((entry) => entry.steps)}
            formatTick={(v) => fmt(v)}
            startLabel={formatShortDay(shown[0]?.day ?? '', language)}
            endLabel={formatShortDay(shown[shown.length - 1]?.day ?? '', language)}
          />
        )}
        {fromHc > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
            <ParityBadge level="D" />
            <AppText variant="caption" muted style={{ flex: 1 }} testID="steps-hc-days">
              {t('steps.hcDays', { count: fromHc })}
            </AppText>
          </View>
        ) : null}
      </Card>

      <StatRow>
        <StatTile label={t('steps.average')} value={stats.average === null ? t('loadx.noValue') : fmt(stats.average)} testID="steps-average" />
        <StatTile label={t('steps.best')} value={stats.best === null ? t('loadx.noValue') : fmt(stats.best.steps)} testID="steps-best" />
      </StatRow>
      {stats.goalDays !== null ? (
        <AppText variant="label" muted testID="steps-goal-days">
          {t('steps.goalDays', { count: stats.goalDays, total: stats.daysWithData })}
        </AppText>
      ) : null}

      <LevelNote level={PARITY.steps} text={t('stepsScreen.levelNote')} testID="steps-level" />
    </Screen>
  );
}
