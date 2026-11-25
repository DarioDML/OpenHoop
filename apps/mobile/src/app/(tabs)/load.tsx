import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { BarChart } from '@/ui/BarChart';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { ScoreRing } from '@/ui/ScoreRing';
import { Section } from '@/ui/Section';
import { spacing } from '@/ui/theme';
import { ZoneBar } from '@/ui/ZoneBar';

export default function LoadScreen() {
  const { days } = useAppData();
  const { t, language } = useT();
  const day = days[days.length - 1];

  if (!day) {
    return (
      <Screen>
        <EmptyState />
      </Screen>
    );
  }

  const recent = days.slice(-14);
  const totalZoneSeconds = day.zoneSeconds.reduce((a, b) => a + b, 0);

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <ScoreRing
          testID="ring-load-detail"
          label={t('score.load')}
          value={day.load.value}
          max={21}
          level={PARITY.load}
          reason={day.load.reason}
          decimals={1}
          size={150}
          strokeWidth={12}
        />
        <AppText variant="label" muted>
          {t('load.scale')}
        </AppText>
      </View>

      <Section title={t('load.zones')} hint={t('load.zonesTotal', { time: formatDuration(t, totalZoneSeconds) })}>
        <Card>
          <ZoneBar zoneSeconds={day.zoneSeconds} />
        </Card>
      </Section>

      <Section title={t('load.history')}>
        <Card>
          <BarChart
            data={recent.map((d) => d.load.value)}
            max={21}
            formatTick={(v) => formatNumber(v, 0, language)}
            startLabel={formatShortDay(recent[0]?.day ?? '', language)}
            endLabel={formatShortDay(recent[recent.length - 1]?.day ?? '', language)}
          />
        </Card>
      </Section>

      <Section title={t('load.workouts')}>
        {day.workouts.length === 0 ? (
          <Card>
            <AppText variant="body" muted>
              {t('load.noWorkouts')}
            </AppText>
          </Card>
        ) : (
          day.workouts.map((w) => (
            <Card key={w.start} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  {w.label ?? t('workout.default')}
                </AppText>
                <ParityBadge level={PARITY.workouts} />
              </View>
              <AppText variant="body" numeric>
                {formatClock(w.start, day.tzOffsetS)}–{formatClock(w.end, day.tzOffsetS)} · {formatDuration(t, w.end - w.start)}
              </AppText>
              <AppText variant="label" muted numeric>
                {t('load.workoutStats', { avg: w.avgHr, max: w.maxHr })}
              </AppText>
              <AppText variant="caption" muted>
                {w.source === 'auto' ? t('workout.auto') : t('workout.manual')}
              </AppText>
            </Card>
          ))
        )}
      </Section>
    </Screen>
  );
}
