import { Stack, useLocalSearchParams } from 'expo-router';

import { resolveWorkout } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatShortDay } from '@/lib/format';
import { NoDataScreen, workoutTitle } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { NotBuilt } from '@/ui/NotBuilt';
import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';

export default function EditActivityScreen() {
  const { days } = useAppData();
  const { t, language } = useT();
  const params = useLocalSearchParams<{ day?: string; index?: string }>();
  const ref = resolveWorkout(days, params.day, params.index);

  if (ref === null) return <NoDataScreen title={t('activity.edit.title')} />;
  const { day, workout } = ref;

  return (
    <Screen
      tint="load"
      testID="edit-activity"
      header={
        <>
          <Stack.Screen options={{ presentation: 'modal' }} />
          <TopBar title={t('activity.edit.title')} close back={false} />
        </>
      }>
      <Card>
        <AppText variant="cardTitle">{workoutTitle(workout, t('workout.default'))}</AppText>
        <AppText variant="label" muted numeric>
          {formatShortDay(day.day, language)} · {formatClock(workout.start, day.tzOffsetS)}–{formatClock(workout.end, day.tzOffsetS)} · {formatDuration(t, workout.end - workout.start)}
        </AppText>
      </Card>
      <ListGroup>
        <ListRow title={t('activity.edit.type')} value={workoutTitle(workout, t('workout.default'))} disabled />
        <ListRow title={t('activity.edit.start')} value={formatClock(workout.start, day.tzOffsetS)} disabled />
        <ListRow title={t('activity.edit.end')} value={formatClock(workout.end, day.tzOffsetS)} disabled />
      </ListGroup>
      <NotBuilt issue="activities" body={t('activity.edit.notBuilt')} />
    </Screen>
  );
}
