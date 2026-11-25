import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { latestStressDayIndex, stressForDay, stressTimeline } from '@/data/stressDerived';
import { useT } from '@/i18n/useT';
import { formatClock, formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Icon } from '@/ui/Icon';
import { LineChart } from '@/ui/LineChart';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { StateCard } from '@/ui/StateCard';
import { HealthPage } from '@/ui/health/HealthPage';
import { STRESS_TONE, StressLevels, stressColor } from '@/ui/health/StressLevels';
import { spacing, useTheme } from '@/ui/theme';

export default function StressScreen() {
  const { t, language, reason } = useT();
  const { colors } = useTheme();
  const { days } = useAppData();
  const [index, setIndex] = useState<number>(() => latestStressDayIndex(days));
  const day = days[index];
  const view = stressForDay(day);
  const timeline = day ? stressTimeline(view.windows, day.start, day.end) : [];
  const hasPrev = index > 0;
  const hasNext = index < days.length - 1;

  return (
    <HealthPage
      title={t('health.stress.title')}
      testID="health-stress"
      right={<ParityBadge level={PARITY.stress} />}
      hero={
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('health.hr.prevDay')}
              disabled={!hasPrev}
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: hasPrev ? 1 : 0.3 }}
              testID="stress-prev">
              <Icon name="back" color={colors.text} />
            </Pressable>
            <AppText variant="h2" testID="stress-day">
              {day ? formatShortDay(day.day, language) : '–'}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('health.hr.nextDay')}
              disabled={!hasNext}
              onPress={() => setIndex((i) => Math.min(days.length - 1, i + 1))}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: hasNext ? 1 : 0.3 }}
              testID="stress-next">
              <Icon name="chevronRight" color={colors.text} />
            </Pressable>
          </View>
          <AppText variant="lead" muted>
            {t('health.stress.body')}
          </AppText>
        </View>
      }>
      {view.calibrating ? (
        <StateCard
          icon="pulse"
          tone="warning"
          title={t('stress.calibratingTitle')}
          body={t('stress.calibratingBody', { needed: view.neededDays })}
          testID="stress-calibrating"
        />
      ) : null}
      <Card testID="stress-latest">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="capSmall" muted>
            {t('stress.latest')}
          </AppText>
          <Chip label={t('stress.estimate')} tone="purple" small />
        </View>
        {view.latest ? (
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Num size={40} color={stressColor(colors, view.latest.level)} testID="stress-latest-level">
                {t(`stress.level.${view.latest.level}`)}
              </Num>
              <Chip label={t('stress.score', { score: formatNumber(view.latest.score, 1, language) })} tone={STRESS_TONE[view.latest.level]} small />
            </View>
            <AppText variant="label" muted numeric testID="stress-latest-time">
              {day ? t('stress.at', { time: formatClock(view.latest.t, day.tzOffsetS) }) : ''}
              {view.baselineDays > 0 ? ` · ${t('stress.baselineDays', { days: view.baselineDays })}` : ''}
            </AppText>
          </View>
        ) : (
          <AppText variant="bodyStrong" muted testID="stress-reason">
            {view.calibrating ? t('stress.calibratingTitle') : view.reason === 'low-coverage' ? t('stress.noWindows') : reason(view.reason ?? 'no-data')}
          </AppText>
        )}
      </Card>
      {view.latest ? (
        <>
          <Card>
            <CardHeader title={t('stress.timeline')} />
            <LineChart
              testID="stress-chart"
              data={timeline}
              domain={{ min: 0, max: 3 }}
              color={colors.levelC}
              formatTick={(v) => formatNumber(v, 0, language)}
              emptyLabel={t('stress.noWindows')}
              startLabel={day ? formatClock(day.start, day.tzOffsetS) : undefined}
              endLabel={day ? formatClock(day.end, day.tzOffsetS) : undefined}
            />
          </Card>
          <Card testID="stress-levels">
            <CardHeader title={t('stress.timeInLevel')} />
            <StressLevels seconds={view.seconds} />
          </Card>
        </>
      ) : null}
      <Card>
        <CardHeader title={t('stress.method')} />
        <AppText variant="body" soft>
          {t('stress.methodBody')}
        </AppText>
      </Card>
      <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }} testID="stress-disclaimer">
        <ParityBadge level={PARITY.stress} long />
        <AppText variant="label" muted style={{ flex: 1 }}>
          {t('stress.disclaimer')}
        </AppText>
      </Card>
    </HealthPage>
  );
}
