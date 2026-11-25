import { router } from 'expo-router';
import { useState } from 'react';

import { stepsStats } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { series } from '@/data/derived';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { NoDataScreen, ProgressBar, StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { BarChart } from '@/ui/BarChart';
import { Card } from '@/ui/Card';
import { Button, Segmented } from '@/ui/controls';
import { Num } from '@/ui/Num';
import { Screen } from '@/ui/Screen';
import { Section } from '@/ui/Section';
import { TopBar } from '@/ui/TopBar';

type Range = '7' | '30';

export default function StepsScreen() {
  const { days, userData } = useAppData();
  const { t, language } = useT();
  const [range, setRange] = useState<Range>('7');
  const today = days[days.length - 1];
  if (!today) return <NoDataScreen title={t('metric.steps')} />;

  const goal = userData.stepsGoal;
  const shown = days.slice(-Number(range));
  const stats = stepsStats(shown, goal);
  const fmt = (v: number): string => formatNumber(v, 0, language);

  return (
    <Screen
      tint="load"
      testID="steps-screen"
      header={
        <>
          <TopBar title={t('metric.steps')} />
          {today.steps === null ? (
            <AppText variant="body" soft testID="steps-today-none">
              {t('steps.none')}
            </AppText>
          ) : (
            <>
              <Num size={72} testID="steps-today">
                {fmt(today.steps)}
              </Num>
              {goal !== null ? (
                <>
                  <ProgressBar fraction={today.steps / goal} label={t('metric.steps')} />
                  <AppText variant="label" soft>
                    {t('steps.ofGoal', { percent: Math.round((today.steps / goal) * 100), goal: fmt(goal) })}
                  </AppText>
                </>
              ) : null}
            </>
          )}
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
      <Section title={t('steps.perDay')}>
        <Card>
          <BarChart
            data={series(shown, 'steps')}
            formatTick={(v) => fmt(v)}
            startLabel={formatShortDay(shown[0]?.day ?? '', language)}
            endLabel={formatShortDay(shown[shown.length - 1]?.day ?? '', language)}
          />
        </Card>
      </Section>
      <StatRow>
        <StatTile label={t('steps.average')} value={stats.average === null ? t('loadx.noValue') : fmt(stats.average)} testID="steps-average" />
        <StatTile label={t('steps.best')} value={stats.best === null ? t('loadx.noValue') : fmt(stats.best.steps)} testID="steps-best" />
      </StatRow>
      {stats.goalDays !== null ? (
        <AppText variant="label" muted testID="steps-goal-days">
          {t('steps.goalDays', { count: stats.goalDays, total: stats.daysWithData })}
        </AppText>
      ) : null}
    </Screen>
  );
}
