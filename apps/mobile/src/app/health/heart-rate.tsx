import type { DayRecord } from '@openhoop/core';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { baselineAt } from '@/data/derived';
import { latestHeartRateDayIndex } from '@/data/healthDerived';
import { HR_TABS, bucketSpo2, hrStats, pointsIn, restingSeries, tabWindows, windowSpan, type HrStats, type HrTab, type HrWindow } from '@/data/heartRateView';
import type { HeartRatePoint, Spo2Point } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatClock, formatNumber, formatShortDay } from '@/lib/format';
import { AppText, WordFitText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { HealthPage } from '@/ui/health/HealthPage';
import { HeartRateChart, type ChartBand } from '@/ui/health/HeartRateChart';
import { Icon } from '@/ui/Icon';
import { LineChart } from '@/ui/LineChart';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { spacing, useTheme } from '@/ui/theme';

const BUCKET_S = 300;

const TAB_LABEL: Readonly<Record<HrTab, TranslationKey>> = {
  '24h': 'health.hr.tab.24h',
  sleep: 'health.hr.tab.sleep',
  workouts: 'health.hr.tab.workouts',
  resting: 'health.hr.tab.resting',
};

interface StatProps {
  label: string;
  value: number | null;
  testID: string;
}

function Stat({ label, value, testID }: StatProps) {
  const { language, t } = useT();
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, gap: 4, paddingHorizontal: spacing.md }}>
      <WordFitText variant="capSmall" muted numberOfLines={2}>
        {label}
      </WordFitText>
      {value === null ? (
        <AppText variant="bodyStrong" muted>
          {t('reason.no-data')}
        </AppText>
      ) : (
        <Num size={32} unit={t('unit.bpm')} unitSize={13} unitColor={colors.textMuted} testID={testID} adjustsFontSizeToFit>
          {formatNumber(value, 0, language)}
        </Num>
      )}
    </Card>
  );
}

function Stats({ stats }: { stats: HrStats | null }) {
  const { t } = useT();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <Stat label={t('health.hr.min')} value={stats?.min ?? null} testID="hr-min" />
      <Stat label={t('health.hr.max')} value={stats?.max ?? null} testID="hr-max" />
      <Stat label={t('health.hr.avg')} value={stats?.avg ?? null} testID="hr-avg" />
    </View>
  );
}

function dayStats(day: DayRecord | undefined): HrStats | null {
  const hr = day?.heartRate;
  if (hr === undefined || hr.avg === null) return null;
  return { min: hr.min ?? hr.avg, max: hr.max ?? hr.avg, avg: hr.avg };
}

function Spo2Card({ day, index, points }: { day: DayRecord; index: number; points: readonly Spo2Point[] | null }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days } = useAppData();
  const night = windowSpan(tabWindows(day, 'sleep'));
  const baseline = baselineAt(days, index, 'spo2');
  const data = night === null || points === null ? [] : bucketSpo2(points, night.from, night.to);
  return (
    <Card testID="hr-spo2">
      <AppText variant="capLarge" muted>
        {t('health.hr.spo2Title')}
      </AppText>
      {night === null ? (
        <AppText variant="label" muted testID="hr-spo2-empty">
          {t('health.hr.spo2NoSleep')}
        </AppText>
      ) : (
        <>
          <LineChart
            testID="hr-spo2-chart"
            data={data}
            color={colors.zones[1]}
            band={baseline === null ? null : { low: baseline.low, high: baseline.high }}
            formatTick={(v) => formatNumber(v, 0, language)}
            emptyLabel={t('health.hr.spo2None')}
            startLabel={formatClock(night.from, day.tzOffsetS)}
            endLabel={formatClock(night.to, day.tzOffsetS)}
            minSpan={4}
          />
          <AppText variant="caption" muted>
            {baseline === null ? t('health.hr.spo2NoRange') : t('health.hr.spo2Range', { low: formatNumber(baseline.low, 0, language), high: formatNumber(baseline.high, 0, language) })}
          </AppText>
        </>
      )}
    </Card>
  );
}

function Legend() {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.stage.light }} />
        <AppText variant="caption" muted>
          {t('health.hr.legendSleep')}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.metric.load }} />
        <AppText variant="caption" muted>
          {t('health.hr.legendWorkout')}
        </AppText>
      </View>
    </View>
  );
}

export default function HeartRateScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, heartRateBetween, spo2Between } = useAppData();
  const [index, setIndex] = useState<number>(() => latestHeartRateDayIndex(days));
  const [tab, setTab] = useState<HrTab>('24h');
  const [points, setPoints] = useState<HeartRatePoint[]>([]);
  const [spo2, setSpo2] = useState<Spo2Point[] | null>(null);
  const day = days[index];
  const wantsSpo2 = tab === '24h' || tab === 'sleep';

  useEffect(() => {
    if (!day) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    heartRateBetween(day.start, day.end, BUCKET_S)
      .then((result) => {
        if (!cancelled) setPoints(result);
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [day, heartRateBetween]);

  useEffect(() => {
    const night = day ? windowSpan(tabWindows(day, 'sleep')) : null;
    if (!wantsSpo2 || night === null) {
      setSpo2(null);
      return;
    }
    let cancelled = false;
    spo2Between(night.from, night.to)
      .then((result) => {
        if (!cancelled) setSpo2(result);
      })
      .catch(() => {
        if (!cancelled) setSpo2([]);
      });
    return () => {
      cancelled = true;
    };
  }, [day, wantsSpo2, spo2Between]);

  const bands: ChartBand[] = day
    ? [
        ...day.sleep.periods.map((p): ChartBand => ({ from: p.onset, to: p.offset, kind: 'sleep' })),
        ...day.workouts.map((w): ChartBand => ({ from: w.start, to: w.end, kind: 'workout' })),
      ]
    : [];
  const hasPrev = index > 0;
  const hasNext = index < days.length - 1;
  const windows: HrWindow[] = day && tab !== 'resting' ? tabWindows(day, tab) : [];
  const span = tab === '24h' && day ? { from: day.start, to: day.end } : windowSpan(windows);
  const shown = tab === '24h' ? points : pointsIn(points, windows);
  const stats = tab === '24h' ? dayStats(day) : hrStats(shown);
  const scrubLabel = (point: HeartRatePoint): string =>
    t('health.hr.scrub', { time: formatClock(point.t, day?.tzOffsetS ?? 0), bpm: formatNumber(point.hr, 0, language) });
  const resting = day ? restingSeries(days, index) : [];

  return (
    <HealthPage
      title={t('health.hr.title')}
      testID="health-heart-rate"
      right={<ParityBadge level="A" />}
      hero={
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="tablist" testID="hr-tabs">
            {HR_TABS.map((id) => (
              <Pill key={id} label={t(TAB_LABEL[id])} selected={tab === id} onPress={() => setTab(id)} role="tab" testID={`hr-tab-${id}`} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('health.hr.prevDay')}
              disabled={!hasPrev}
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: hasPrev ? 1 : 0.3 }}
              testID="hr-prev">
              <Icon name="back" color={colors.text} />
            </Pressable>
            <AppText variant="bodyStrong" testID="hr-day">
              {day ? formatShortDay(day.day, language) : '–'}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('health.hr.nextDay')}
              disabled={!hasNext}
              onPress={() => setIndex((i) => Math.min(days.length - 1, i + 1))}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: hasNext ? 1 : 0.3 }}
              testID="hr-next">
              <Icon name="chevronRight" color={colors.text} />
            </Pressable>
          </View>
        </View>
      }>
      {tab === 'resting' ? (
        <>
          <Card testID="hr-resting">
            <AppText variant="capLarge" muted>
              {t('metric.restingHr')}
            </AppText>
            {day?.restingHr.value !== null && day?.restingHr.value !== undefined ? (
              <Num size={52} unit={t('unit.bpm')} unitSize={18} unitColor={colors.textMuted} testID="hr-resting-value">
                {formatNumber(day.restingHr.value, 0, language)}
              </Num>
            ) : (
              <AppText variant="bodyStrong" muted testID="hr-resting-missing">
                {t('health.hr.restingNone')}
              </AppText>
            )}
            <AppText variant="label" muted>
              {t('term.restingHr.short')}
            </AppText>
            <LineChart
              testID="hr-resting-chart"
              data={resting}
              color={colors.negative}
              formatTick={(v) => formatNumber(v, 0, language)}
              emptyLabel={t('health.hr.restingNone')}
              startLabel={t('health.hr.restingDays', { count: resting.length })}
              minSpan={4}
            />
          </Card>
          <ListGroup>
            <ListRow testID="hr-resting-detail" title={t('health.hr.restingDetail')} href="/recovery/metric/rhr" />
          </ListGroup>
        </>
      ) : (
        <>
          <Stats stats={stats} />
          <Card>
            <AppText variant="capLarge" muted testID="hr-window">
              {day && span ? t('health.hr.window', { day: formatShortDay(day.day, language), from: formatClock(span.from, day.tzOffsetS), to: formatClock(span.to, day.tzOffsetS) }) : t('health.hr.title')}
            </AppText>
            {span === null ? (
              <AppText variant="label" muted testID="hr-tab-empty">
                {t(tab === 'sleep' ? 'health.hr.noSleep' : 'health.hr.noWorkouts')}
              </AppText>
            ) : (
              <HeartRateChart
                testID="hr-chart"
                points={shown}
                startS={span.from}
                endS={span.to}
                tzOffsetS={day?.tzOffsetS ?? 0}
                bands={tab === '24h' ? bands : []}
                bucketS={BUCKET_S}
                emptyLabel={t('health.hr.noData')}
                scrubLabel={scrubLabel}
                area
              />
            )}
          </Card>
          {tab === '24h' ? <Legend /> : null}
          {tab === 'workouts' && day && day.workouts.length > 0 ? (
            <ListGroup>
              {day.workouts.map((w) => (
                <ListRow
                  key={w.start}
                  testID={`hr-workout-${w.start}`}
                  title={w.label ?? t('health.hr.workout')}
                  subtitle={`${formatClock(w.start, day.tzOffsetS)} – ${formatClock(w.end, day.tzOffsetS)}`}
                  value={t('health.hr.workoutHr', { avg: formatNumber(w.avgHr, 0, language), max: formatNumber(w.maxHr, 0, language) })}
                />
              ))}
            </ListGroup>
          ) : null}
          {wantsSpo2 && day ? <Spo2Card day={day} index={index} points={spo2} /> : null}
        </>
      )}
      <AppText variant="body" muted testID="hr-scrub-note">
        {t('health.hr.scrubNote')}
      </AppText>
    </HealthPage>
  );
}
