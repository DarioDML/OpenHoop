import type { MuscleGroup } from '@openhoop/core';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { MUSCLE_GROUPS, TREND_WEEKS, finishedSessions, parseTrendWeeks, weeklyStats, type MuscleLoad } from '@/data/strength';
import { useT } from '@/i18n/useT';
import { formatShortDay } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { BarChart } from '@/ui/BarChart';
import { Card } from '@/ui/Card';
import { Segmented } from '@/ui/controls';
import { ParityBadge } from '@/ui/ParityBadge';
import { Section } from '@/ui/Section';
import { MuscleLoadRows, StrengthPage, todayIso, useStrengthLabels } from '@/ui/strength/parts';
import { spacing } from '@/ui/theme';

export default function StrengthTrendsScreen() {
  const { t, language } = useT();
  const { strength } = useAppData();
  const labels = useStrengthLabels();
  const [range, setRange] = useState<string>('8');
  const weeks = parseTrendWeeks(range);
  const stats = weeklyStats(strength.sessions, todayIso(), weeks);
  const hasData = finishedSessions(strength.sessions).length > 0 && stats.some((week) => week.sessions > 0);

  const totalSessions = stats.reduce((sum, week) => sum + week.sessions, 0);
  const totalVolume = stats.reduce((sum, week) => sum + week.volumeKg, 0);
  const muscleTotals: MuscleLoad[] = MUSCLE_GROUPS.map((muscle: MuscleGroup) => {
    const rows = stats.flatMap((week) => week.byMuscle.filter((row) => row.muscle === muscle));
    return { muscle, sets: rows.reduce((sum, row) => sum + row.sets, 0), volumeKg: rows.reduce((sum, row) => sum + row.volumeKg, 0), share: null };
  })
    .filter((row) => row.sets > 0)
    .sort((a, b) => b.volumeKg - a.volumeKg || b.sets - a.sets)
    .map((row) => ({ ...row, share: totalVolume > 0 ? row.volumeKg / totalVolume : null }));

  const first = stats[0];
  const last = stats[stats.length - 1];
  const startLabel = first === undefined ? undefined : formatShortDay(first.weekStart, language);
  const endLabel = last === undefined ? undefined : formatShortDay(last.weekStart, language);

  return (
    <StrengthPage title={t('strength.trends.title')} testID="strength-trends">
      <Segmented
        testID="trends-range"
        value={range}
        onChange={setRange}
        options={TREND_WEEKS.map((value) => ({ value: `${value}`, label: t('strength.trends.weeks', { count: value }) }))}
      />
      {!hasData ? (
        <Card>
          <AppText variant="body" muted testID="trends-empty">
            {t('strength.trends.empty')}
          </AppText>
        </Card>
      ) : (
        <>
          <StatRow>
            <StatTile label={t('strength.trends.total')} value={`${totalSessions}`} testID="trends-total" />
            <StatTile label={t('strength.trends.average')} value={labels.kg(totalSessions / weeks, 1)} testID="trends-average" />
          </StatRow>
          <Section title={t('strength.trends.sessions')}>
            <Card>
              <BarChart
                testID="trends-sessions-chart"
                data={stats.map((week) => week.sessions)}
                formatTick={(value) => labels.kg(value)}
                startLabel={startLabel}
                endLabel={endLabel}
              />
            </Card>
          </Section>
          <Section title={t('strength.trends.volume')}>
            <Card>
              <BarChart
                testID="trends-volume-chart"
                data={stats.map((week) => week.volumeKg)}
                formatTick={(value) => labels.kg(value)}
                startLabel={startLabel}
                endLabel={endLabel}
              />
              <AppText variant="label" muted numeric testID="trends-volume-total">
                {t('strength.trends.volumeTotal')}: {labels.kg(totalVolume)} kg
              </AppText>
            </Card>
          </Section>
          <Section title={t('strength.trends.muscles')}>
            <Card testID="trends-muscles">
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                <ParityBadge level="C" />
                <AppText variant="caption" muted style={{ flex: 1 }}>
                  {t('strength.trends.musclesBody')}
                </AppText>
              </View>
              <MuscleLoadRows rows={muscleTotals} testID="trends-muscle-rows" />
            </Card>
          </Section>
        </>
      )}
    </StrengthPage>
  );
}
