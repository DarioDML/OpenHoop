import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { latestHeartRateDayIndex } from '@/data/healthDerived';
import type { HeartRatePoint } from '@/data/types';
import { formatNumber, formatShortDay } from '@/lib/format';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { ParityBadge } from '@/ui/ParityBadge';
import { HealthPage } from '@/ui/health/HealthPage';
import { HeartRateChart, type ChartBand } from '@/ui/health/HeartRateChart';
import { Num } from '@/ui/Num';
import { spacing, useTheme } from '@/ui/theme';

const BUCKET_S = 300;

interface StatProps {
  label: string;
  value: number | null;
  testID: string;
}

function Stat({ label, value, testID }: StatProps) {
  const { language, t } = useT();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <AppText variant="capSmall" muted>
        {label}
      </AppText>
      {value === null ? (
        <AppText variant="bodyStrong" muted>
          {t('reason.no-data')}
        </AppText>
      ) : (
        <Num size={32} testID={testID}>
          {formatNumber(value, 0, language)}
        </Num>
      )}
    </View>
  );
}

export default function HeartRateScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, heartRateBetween } = useAppData();
  const [index, setIndex] = useState<number>(() => latestHeartRateDayIndex(days));
  const [points, setPoints] = useState<HeartRatePoint[]>([]);
  const day = days[index];

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

  const bands: ChartBand[] = day
    ? [
        ...day.sleep.periods.map((p): ChartBand => ({ from: p.onset, to: p.offset, kind: 'sleep' })),
        ...day.workouts.map((w): ChartBand => ({ from: w.start, to: w.end, kind: 'workout' })),
      ]
    : [];
  const hasPrev = index > 0;
  const hasNext = index < days.length - 1;

  return (
    <HealthPage
      title={t('health.hr.title')}
      testID="health-heart-rate"
      right={<ParityBadge level="A" />}
      hero={
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
          <AppText variant="h2" testID="hr-day">
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
      }>
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Stat label={t('health.hr.min')} value={day?.heartRate.min ?? null} testID="hr-min" />
          <Stat label={t('health.hr.avg')} value={day?.heartRate.avg ?? null} testID="hr-avg" />
          <Stat label={t('health.hr.max')} value={day?.heartRate.max ?? null} testID="hr-max" />
        </View>
        <HeartRateChart
          testID="hr-chart"
          points={points}
          startS={day?.start ?? 0}
          endS={day?.end ?? 1}
          tzOffsetS={day?.tzOffsetS ?? 0}
          bands={bands}
          bucketS={BUCKET_S}
          emptyLabel={t('health.hr.noData')}
        />
      </Card>
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
    </HealthPage>
  );
}
