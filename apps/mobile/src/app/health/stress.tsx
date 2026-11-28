import { useState, type ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { STRESS_HOURS, hourTicks, latestStressDayIndex, recentStress, stressForDay, stressHours, stressTimeline, type StressHour } from '@/data/stressDerived';
import { useT } from '@/i18n/useT';
import { formatClock, formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { useExplain } from '@/ui/explain/ExplainProvider';
import { SemiGauge } from '@/ui/Gauge';
import { HealthPage } from '@/ui/health/HealthPage';
import { StressLevels, stressColor } from '@/ui/health/StressLevels';
import { Icon } from '@/ui/Icon';
import { useLayout } from '@/ui/layout';
import { LevelNote } from '@/ui/LevelNote';
import { LineChart } from '@/ui/LineChart';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { PARITY } from '@/ui/parity';
import { StateCard } from '@/ui/StateCard';
import { radius, spacing, useTheme } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

const SCALE_MAX = 3;
const BAR_AREA = 150;
const TICK_WIDTH = 64;

function HourBars({ hours }: { hours: readonly StressHour[] }): ReactElement {
  const { t, language } = useT();
  const { colors } = useTheme();
  const label = hours
    .filter((h) => h.score !== null)
    .map((h) => `${formatClock(h.start, h.tzOffsetS)} ${formatNumber(h.score ?? 0, 1, language)}`)
    .join(', ');
  return (
    <View accessible accessibilityLabel={label === '' ? t('stress.noWindows') : label} testID="stress-hours" style={{ gap: 6 }}>
      <View style={{ height: BAR_AREA, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
        {hours.map((hour) => (
          <View key={hour.start} style={{ flex: 1, height: BAR_AREA, justifyContent: 'flex-end' }}>
            {hour.score === null || hour.level === null ? (
              <View style={{ height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }} />
            ) : (
              <View
                testID={`stress-hour-${hour.level}`}
                style={{ height: Math.max(8, (Math.min(hour.score, SCALE_MAX) / SCALE_MAX) * BAR_AREA), borderRadius: 4, backgroundColor: stressColor(colors, hour.level) }}
              />
            )}
          </View>
        ))}
      </View>
      <View style={{ height: 22 }} testID="stress-hour-ticks">
        {hourTicks(hours.length).map((i) => {
          const hour = hours[i];
          if (hour === undefined) return null;
          const first = i === 0;
          const last = i === hours.length - 1;
          const center = ((i + 0.5) / hours.length) * 100;
          return (
            <View
              key={hour.start}
              style={{
                position: 'absolute',
                top: 0,
                width: TICK_WIDTH,
                ...(first ? { left: 0 } : last ? { right: 0 } : { left: `${center}%`, marginLeft: -TICK_WIDTH / 2 }),
              }}>
              <AppText variant="caption" muted numeric numberOfLines={1} style={{ textAlign: first ? 'left' : last ? 'right' : 'center' }} testID={`stress-tick-${i}`}>
                {formatClock(hour.start, hour.tzOffsetS)}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function StressScreen() {
  const { t, language, reason } = useT();
  const { colors } = useTheme();
  const { width, gutter } = useLayout();
  const explain = useExplain();
  const { days } = useAppData();
  const [index, setIndex] = useState<number>(() => latestStressDayIndex(days));
  const day = days[index];
  const view = stressForDay(day);
  const timeline = day ? stressTimeline(view.windows, day.start, day.end) : [];
  const recent = recentStress(days, index);
  const hours = day && view.latest ? stressHours(recent.windows, view.latest.t, day.tzOffsetS, STRESS_HOURS, recent.spans) : [];
  const hasPrev = index > 0;
  const hasNext = index < days.length - 1;
  const gaugeSize = Math.min(300, width - gutter * 2 - 40);
  const fraction = view.latest === null ? null : Math.min(view.latest.score, SCALE_MAX) / SCALE_MAX;
  const levelColor = view.latest === null ? colors.textMuted : stressColor(colors, view.latest.level);

  return (
    <HealthPage
      title={t('health.stress.title')}
      testID="health-stress"
      right={<IconButton icon="info" label={t('explain.whatIs', { name: t('health.stress.title') })} onPress={() => explain.about({ term: 'stress', index, shown: null })} color={colors.text} testID="stress-about" />}
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
            <AppText variant="bodyStrong" testID="stress-day">
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
          <SemiGauge
            size={gaugeSize}
            stroke={16}
            progress={fraction === null ? null : { to: fraction, color: levelColor }}
            marker={fraction}
            accessibilityLabel={view.latest === null ? undefined : `${t(`stress.level.${view.latest.level}`)}, ${t('stress.score', { score: formatNumber(view.latest.score, 1, language) })}`}
            testID="stress-gauge">
            {view.latest ? (
              <View style={{ alignItems: 'center' }}>
                <Num size={72} testID="stress-score">
                  {formatNumber(view.latest.score, 1, language)}
                </Num>
                <AppText variant="capLarge" color={levelColor} testID="stress-latest-level">
                  {t(`stress.level.${view.latest.level}`)}
                </AppText>
              </View>
            ) : (
              <AppText variant="bodyStrong" muted testID="stress-reason" style={{ textAlign: 'center', maxWidth: gaugeSize - 60 }}>
                {view.calibrating ? t('stress.calibratingTitle') : view.reason === 'low-coverage' ? t('stress.noWindows') : reason(view.reason ?? 'no-data')}
              </AppText>
            )}
          </SemiGauge>
          {view.latest && day ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Chip label={t('stress.estimate')} tone="purple" small />
              <AppText variant="label" muted numeric testID="stress-latest-time" style={{ textAlign: 'center' }}>
                {t('stress.at', { time: formatClock(view.latest.t, day.tzOffsetS) })}
                {view.baselineDays > 0 ? ` · ${t('stress.baselineDays', { days: view.baselineDays })}` : ''}
              </AppText>
            </View>
          ) : null}
        </View>
      }>
      {view.calibrating ? (
        <StateCard icon="pulse" tone="warning" title={t('stress.calibratingTitle')} body={t('stress.calibratingBody', { needed: view.neededDays })} testID="stress-calibrating" />
      ) : null}
      {view.latest && day ? (
        <>
          <Card testID="stress-hours-card">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="capLarge" muted>
                {t('health.stress.lastHours', { hours: STRESS_HOURS })}
              </AppText>
              <AppText variant="label" muted numeric>
                {t('health.stress.scale')}
              </AppText>
            </View>
            <HourBars hours={hours} />
          </Card>
          <Card testID="stress-levels">
            <AppText variant="capLarge" muted>
              {t('stress.timeInLevel')}
            </AppText>
            <StressLevels seconds={view.seconds} />
          </Card>
          <Card>
            <CardHeader title={t('stress.timeline')} />
            <LineChart
              testID="stress-chart"
              data={timeline}
              domain={{ min: 0, max: SCALE_MAX }}
              color={colors.levelC}
              formatTick={(v) => formatNumber(v, 0, language)}
              emptyLabel={t('stress.noWindows')}
              startLabel={formatClock(day.start, day.tzOffsetS)}
              endLabel={formatClock(day.end, day.tzOffsetS)}
            />
          </Card>
        </>
      ) : null}
      <ListGroup>
        <ListRow
          testID="stress-breathing"
          title={t('health.stress.breathing')}
          subtitle={t('health.stress.breathingHint')}
          icon={{ icon: 'lungs', color: colors.info, background: colors.infoSoft }}
          href="/health/breathing"
        />
      </ListGroup>
      <Card>
        <CardHeader title={t('stress.method')} />
        <AppText variant="body" soft>
          {t('stress.methodBody')}
        </AppText>
      </Card>
      <LevelNote level={PARITY.stress} text={t('stress.disclaimer')} testID="stress-disclaimer" />
    </HealthPage>
  );
}
