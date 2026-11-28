import type { StrengthSet } from '@openhoop/core';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { singleParam } from '@/data/dailyDerived';
import { useAppData } from '@/data/context';
import { bestSet, exerciseHistory, exerciseRecords, exercisesUsed } from '@/data/strength';
import { useT } from '@/i18n/useT';
import { weightIn } from '@/lib/units';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { LineChart } from '@/ui/LineChart';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { StrengthPage, useStrengthLabels } from '@/ui/strength/parts';
import { spacing, useTheme } from '@/ui/theme';

const SHOWN_ENTRIES = 10;

export default function StrengthExerciseScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { strength } = useAppData();
  const labels = useStrengthLabels();
  const params = useLocalSearchParams<{ key?: string | string[] }>();
  const key = singleParam(params.key);
  const used = exercisesUsed(strength.sessions);

  if (key === null) {
    return (
      <StrengthPage title={t('strength.exercise.title')} testID="strength-exercise">
        <CapHeader title={t('strength.exercise.pick')} />
        {used.length === 0 ? (
          <AppText variant="body" muted testID="exercise-pick-empty">
            {t('strength.exercise.pickEmpty')}
          </AppText>
        ) : (
          <ListGroup>
            {used.map((exercise) => (
              <ListRow
                key={exercise.key}
                testID={`exercise-pick-${exercise.key}`}
                title={labels.nameOf(exercise.key, exercise.name)}
                subtitle={labels.muscleName(exercise.muscle)}
                href={{ pathname: '/strength/exercise', params: { key: exercise.key } }}
              />
            ))}
          </ListGroup>
        )}
      </StrengthPage>
    );
  }

  const history = exerciseHistory(strength.sessions, key);
  const info = used.find((exercise) => exercise.key === key) ?? null;

  if (info === null || history.entries.length === 0) {
    return (
      <StrengthPage title={t('strength.exercise.title')} testID="strength-exercise">
        <Card>
          <AppText variant="body" muted testID="exercise-not-found">
            {t('strength.exercise.notFound')}
          </AppText>
        </Card>
      </StrengthPage>
    );
  }

  const name = labels.nameOf(info.key, info.name);
  const chronological = [...history.entries].reverse();
  const first = chronological[0];
  const last = chronological[chronological.length - 1];
  const best = bestSet(history);
  const records = exerciseRecords(history);

  const setsText = (sets: readonly StrengthSet[]): string => {
    const head = sets[0];
    if (head !== undefined && sets.every((set) => set.reps === head.reps && set.weightKg === head.weightKg)) return labels.setSummary(sets.length, head.reps, head.weightKg);
    return sets.map((set) => (set.weightKg > 0 ? t('strength.exercise.setLine', { reps: set.reps, weight: labels.weightText(set.weightKg) }) : t('strength.exercise.setLineBody', { reps: set.reps }))).join(' · ');
  };

  const hero =
    best === null ? null : (
      <View style={{ gap: spacing.sm }} testID="exercise-best">
        <AppText variant="cap" soft>
          {t('strength.exercise.bestSet')}
        </AppText>
        {best.weightKg > 0 ? (
          <Num size={64} unit={labels.unit} unitSize={28} unitColor={colors.textMuted} adjustsFontSizeToFit testID="exercise-best-value">
            {`${labels.weight(best.weightKg)} × ${best.reps}`}
          </Num>
        ) : (
          <Num size={64} unit={t('strength.exercise.repsUnit')} unitSize={28} unitColor={colors.textMuted} adjustsFontSizeToFit testID="exercise-best-value">
            {`${best.reps}`}
          </Num>
        )}
        <AppText variant="label" soft>
          {best.oneRepMaxKg === null
            ? t('strength.exercise.bestDay', { day: labels.day(best.day) })
            : t('strength.exercise.bestRmLine', { value: labels.weightText(Math.round(best.oneRepMaxKg * 10) / 10), day: labels.day(best.day) })}
        </AppText>
      </View>
    );

  return (
    <StrengthPage title={name} intro={t('strength.exercise.muscle', { muscle: labels.muscleName(info.muscle) })} testID="strength-exercise" hero={hero}>
      <Card>
        <AppText variant="capSmall" muted>
          {t('strength.exercise.volumeChart')}
        </AppText>
        <LineChart
          testID="exercise-chart"
          data={chronological.map((entry) => weightIn(entry.volumeKg, labels.units))}
          formatTick={(value) => labels.num(value)}
          emptyLabel={t('strength.exercise.chartEmpty')}
          startLabel={first === undefined ? undefined : labels.day(first.day)}
          endLabel={last === undefined ? undefined : labels.day(last.day)}
          color={colors.metric.loadBright}
        />
        <AppText variant="caption" muted>
          {t('strength.exercise.volumeUnit', { unit: labels.unit })}
        </AppText>
      </Card>

      <CapHeader title={t('strength.exercise.records')} />
      <ListGroup>
        <ListRow
          testID="exercise-heaviest"
          title={t('strength.exercise.heaviest')}
          subtitle={records.heaviest === null ? t('strength.exercise.heaviestNone') : labels.day(records.heaviest.day)}
          right={
            records.heaviest === null ? undefined : (
              <Num size={22} unit={`${labels.unit} × ${records.heaviest.reps}`} unitSize={16}>
                {labels.weight(records.heaviest.weightKg)}
              </Num>
            )
          }
        />
        <ListRow
          testID="exercise-pr-reps"
          title={
            records.mostReps === null
              ? t('strength.exercise.mostRepsTitle')
              : records.mostReps.weightKg > 0
                ? t('strength.exercise.mostRepsAt', { weight: labels.weightText(records.mostReps.weightKg) })
                : t('strength.exercise.mostRepsBody')
          }
          subtitle={records.mostReps === null ? undefined : labels.day(records.mostReps.day)}
          right={records.mostReps === null ? undefined : <Num size={22}>{`${records.mostReps.reps}`}</Num>}
        />
        <ListRow
          testID="exercise-pr-volume"
          title={t('strength.exercise.bestVolume')}
          subtitle={records.bestVolume === null ? t('strength.exercise.bestVolumeNone') : labels.day(records.bestVolume.day)}
          right={
            records.bestVolume === null ? undefined : (
              <Num size={22} unit={labels.unit} unitSize={16}>
                {labels.kg(records.bestVolume.volumeKg)}
              </Num>
            )
          }
        />
      </ListGroup>

      <Card testID="exercise-rm">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="capLarge" muted>
            {t('strength.exercise.bestRm')}
          </AppText>
          <Chip label={t('strength.exercise.estimate')} tone="purple" small />
        </View>
        {history.bestOneRepMax === null ? (
          <AppText variant="body" muted testID="exercise-rm-none">
            {t('strength.exercise.rmNone')}
          </AppText>
        ) : (
          <>
            <AppText variant="value" numeric testID="exercise-rm-value">
              {labels.weightText(Math.round(history.bestOneRepMax.kg * 10) / 10)}
            </AppText>
            <AppText variant="caption" muted numeric>
              {labels.day(history.bestOneRepMax.day)}
            </AppText>
          </>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <ParityBadge level="C" />
          <AppText variant="caption" muted style={{ flex: 1 }}>
            {t('strength.exercise.rmNote')}
          </AppText>
        </View>
      </Card>

      <StatRow>
        <StatTile label={t('strength.exercise.totalSets')} value={`${history.totalSets}`} testID="exercise-total-sets" />
        <StatTile label={t('strength.exercise.sessions')} value={`${history.entries.length}`} testID="exercise-sessions" />
      </StatRow>

      <CapHeader title={t('strength.exercise.history')} />
      <ListGroup>
        {history.entries.slice(0, SHOWN_ENTRIES).map((entry) => (
          <ListRow
            key={entry.sessionId}
            testID={`exercise-entry-${entry.sessionId}`}
            title={labels.day(entry.day)}
            subtitle={[
              setsText(entry.sets),
              t('strength.exercise.entryMeta', { sets: entry.sets.length, volume: labels.volumeText(entry.volumeKg) }),
              ...(entry.oneRepMaxKg === null ? [] : [t('strength.exercise.entryRm', { value: labels.weightText(Math.round(entry.oneRepMaxKg * 10) / 10) })]),
            ].join('\n')}
            href={{ pathname: '/strength/summary', params: { id: String(entry.sessionId) } }}
          />
        ))}
      </ListGroup>
      {history.entries.length > SHOWN_ENTRIES ? (
        <AppText variant="caption" muted>
          {t('strength.exercise.older', { shown: SHOWN_ENTRIES, total: history.entries.length })}
        </AppText>
      ) : null}
      <Button label={t('strength.home.trends')} variant="secondary" icon="trends" onPress={() => router.push('/strength/trends')} testID="exercise-trends" />
    </StrengthPage>
  );
}
