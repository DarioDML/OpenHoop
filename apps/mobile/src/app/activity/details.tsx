import { router, useLocalSearchParams } from 'expo-router';

import { formatWeekday, resolveWorkout } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatNumber, formatShortDay } from '@/lib/format';
import { NoDataScreen, StatRow, StatTile, workoutTitle } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { Screen } from '@/ui/Screen';
import { Section } from '@/ui/Section';
import { IconButton, TopBar } from '@/ui/TopBar';
import { ZoneBar } from '@/ui/ZoneBar';

export default function ActivityDetailsScreen() {
  const { days } = useAppData();
  const { t, language } = useT();
  const params = useLocalSearchParams<{ day?: string; index?: string }>();
  const ref = resolveWorkout(days, params.day, params.index);

  if (ref === null) return <NoDataScreen title={t('activity.details.title')} />;

  const { day, index, workout } = ref;
  const durationS = workout.end - workout.start;
  const fmt = (v: number): string => formatNumber(v, 0, language);
  const query = { day: day.day, index: String(index) };

  return (
    <Screen
      tint="load"
      testID="activity-details"
      header={
        <>
          <TopBar
            title={t('activity.details.title')}
            right={<IconButton icon="share" label={t('activity.share.title')} onPress={() => router.push({ pathname: '/activity/share', params: query })} />}
          />
          <AppText variant="h1">{workoutTitle(workout, t('workout.default'))}</AppText>
          <AppText variant="label" soft numeric>
            {formatWeekday(day.day, language, 'long')} {formatShortDay(day.day, language)} · {formatClock(workout.start, day.tzOffsetS)}–{formatClock(workout.end, day.tzOffsetS)}
          </AppText>
          <Chip tone={workout.source === 'auto' ? 'info' : 'neutral'} label={workout.source === 'auto' ? t('workout.auto') : t('workout.manual')} />
        </>
      }>
      <StatRow>
        <StatTile label={t('activity.details.duration')} value={formatDuration(t, durationS)} testID="detail-duration" />
        <StatTile label={t('loadx.hr.avg')} value={fmt(workout.avgHr)} unit={t('unit.bpm')} testID="detail-avg" />
        <StatTile label={t('loadx.hr.max')} value={fmt(workout.maxHr)} unit={t('unit.bpm')} testID="detail-max" />
      </StatRow>
      <Section title={t('load.zones')} hint={t('load.zonesTotal', { time: formatDuration(t, workout.zoneSeconds.reduce((a, b) => a + b, 0)) })}>
        <Card>
          <ZoneBar zoneSeconds={workout.zoneSeconds} />
        </Card>
      </Section>
      <Card tone="outline">
        <AppText variant="label" muted>
          {t('activity.details.noMap')}
        </AppText>
      </Card>
      <Button label={t('activity.details.edit')} variant="secondary" onPress={() => router.push({ pathname: '/activity/edit', params: query })} testID="detail-edit" />
    </Screen>
  );
}
