import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { singleParam } from '@/data/dailyDerived';
import { useAppData } from '@/data/context';
import {
  durationS,
  exerciseVolumes,
  finishedSessions,
  heartRateStats,
  muscleLoad,
  newRecords,
  sessionTotals,
  type HeartRateStats,
} from '@/data/strength';
import { useT } from '@/i18n/useT';
import { formatDuration, formatShortDay } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { ParityBadge } from '@/ui/ParityBadge';
import { Section } from '@/ui/Section';
import { MuscleLoadRows, StrengthPage, useStrengthLabels } from '@/ui/strength/parts';
import { goBack } from '@/ui/TopBar';
import { spacing, useTheme } from '@/ui/theme';

const HR_BUCKET_S = 10;

export default function StrengthSummaryScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { strength, strengthActions, heartRateBetween } = useAppData();
  const labels = useStrengthLabels();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const idParam = singleParam(params.id);
  const finished = finishedSessions(strength.sessions);
  const requested = idParam !== null && /^\d{1,9}$/.test(idParam) ? Number(idParam) : null;
  const session = requested === null ? (finished[finished.length - 1] ?? null) : (finished.find((candidate) => candidate.id === requested) ?? null);

  const [hr, setHr] = useState<HeartRateStats | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sessionId = session?.id ?? null;
  const startedAt = session?.startedAt ?? 0;
  const endedAt = session?.endedAt ?? 0;
  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    setHr(undefined);
    void heartRateBetween(startedAt, endedAt, HR_BUCKET_S).then((points) => {
      if (!cancelled) setHr(heartRateStats(points));
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, startedAt, endedAt, heartRateBetween]);

  if (session === null) {
    return (
      <StrengthPage title={t('strength.summary.title')} testID="strength-summary">
        <Card>
          <AppText variant="title">{t('strength.summary.empty')}</AppText>
          <AppText variant="body" muted testID="summary-empty">
            {t('strength.summary.emptyBody')}
          </AppText>
        </Card>
      </StrengthPage>
    );
  }

  const totals = sessionTotals(session.sets);
  const exercises = exerciseVolumes(session.sets);
  const records = newRecords(session, strength.sessions);
  const load = muscleLoad(session.sets);

  const remove = async (): Promise<void> => {
    if (await strengthActions.removeSession(session.id)) goBack();
  };

  return (
    <StrengthPage title={t('strength.summary.title')} intro={`${session.name} · ${formatShortDay(session.day, language)}`} testID="strength-summary">
      <StatRow>
        <StatTile label={t('strength.summary.duration')} value={formatDuration(t, durationS(session, 0))} testID="summary-duration" />
        <StatTile label={t('strength.summary.sets')} value={`${totals.sets}`} testID="summary-sets" />
      </StatRow>
      <StatRow>
        <StatTile label={t('strength.summary.reps')} value={`${totals.reps}`} testID="summary-reps" />
        <StatTile label={t('strength.summary.volume')} value={labels.kg(totals.volumeKg)} unit="kg" testID="summary-volume" />
      </StatRow>
      <AppText variant="caption" muted>
        {t('strength.summary.volumeNote')}
      </AppText>

      <Section title={t('strength.summary.heartRate')}>
        <Card testID="summary-hr">
          {hr === undefined ? null : hr === null ? (
            <AppText variant="body" muted testID="summary-hr-none">
              {t('strength.summary.hrNone')}
            </AppText>
          ) : (
            <>
              <StatRow>
                <StatTile label={t('strength.summary.hrAvg')} value={`${Math.round(hr.avg)}`} unit="bpm" testID="summary-hr-avg" />
                <StatTile label={t('strength.summary.hrMax')} value={`${Math.round(hr.max)}`} unit="bpm" testID="summary-hr-max" />
              </StatRow>
              <AppText variant="caption" muted>
                {t('strength.summary.hrNote')}
              </AppText>
            </>
          )}
        </Card>
      </Section>

      <Section title={t('strength.summary.perExercise')}>
        {exercises.map((exercise) => {
          const name = labels.nameOf(exercise.exerciseKey, exercise.exerciseName);
          return (
            <Card
              key={exercise.exerciseKey}
              href={{ pathname: '/strength/exercise', params: { key: exercise.exerciseKey } }}
              accessibilityLabel={name}
              testID={`summary-exercise-${exercise.exerciseKey}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">{name}</AppText>
                <AppText variant="label" muted numeric>
                  {t('strength.summary.exerciseMeta', { sets: exercise.sets, volume: labels.kg(exercise.volumeKg) })}
                </AppText>
                {exercise.topSet !== null ? (
                  <AppText variant="caption" muted numeric>
                    {t('strength.summary.topSet', { reps: exercise.topSet.reps, weight: labels.weight(exercise.topSet.weightKg) })}
                  </AppText>
                ) : null}
                {records.includes(exercise.exerciseKey) ? <Chip label={t('strength.summary.record')} tone="positive" small testID={`summary-record-${exercise.exerciseKey}`} /> : null}
              </View>
              <Icon name="chevronRight" color={colors.textMuted} size={18} />
            </Card>
          );
        })}
      </Section>

      <Section title={t('strength.summary.load')}>
        <Card testID="summary-load">
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
            <ParityBadge level="C" />
            <AppText variant="caption" muted style={{ flex: 1 }}>
              {t('strength.summary.loadBody')}
            </AppText>
          </View>
          <MuscleLoadRows rows={load} testID="summary-load-rows" />
        </Card>
      </Section>

      <Button label={t('strength.summary.trends')} variant="secondary" icon="trends" onPress={() => router.push('/strength/trends')} testID="summary-trends" />
      {confirmDelete ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
          <Button label={t('strength.common.confirmDelete')} variant="danger" onPress={() => void remove()} testID="summary-confirm-delete" />
          <Button label={t('strength.common.keep')} variant="tertiary" onPress={() => setConfirmDelete(false)} testID="summary-keep" />
        </View>
      ) : (
        <Button label={t('strength.summary.delete')} variant="tertiary" onPress={() => setConfirmDelete(true)} testID="summary-delete" />
      )}
    </StrengthPage>
  );
}
