import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { singleParam } from '@/data/dailyDerived';
import { useAppData } from '@/data/context';
import { exerciseHistory, exercisesUsed } from '@/data/strength';
import { useT } from '@/i18n/useT';
import { formatShortDay } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { BarChart } from '@/ui/BarChart';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { ParityBadge } from '@/ui/ParityBadge';
import { Section } from '@/ui/Section';
import { StrengthPage, useStrengthLabels } from '@/ui/strength/parts';
import { spacing, useTheme } from '@/ui/theme';

const SHOWN_ENTRIES = 10;

export default function StrengthExerciseScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { strength } = useAppData();
  const labels = useStrengthLabels();
  const params = useLocalSearchParams<{ key?: string | string[] }>();
  const key = singleParam(params.key);
  const used = exercisesUsed(strength.sessions);

  if (key === null) {
    return (
      <StrengthPage title={t('strength.exercise.title')} testID="strength-exercise">
        <Section title={t('strength.exercise.pick')}>
          {used.length === 0 ? (
            <AppText variant="body" muted testID="exercise-pick-empty">
              {t('strength.exercise.pickEmpty')}
            </AppText>
          ) : (
            used.map((exercise) => (
              <Card
                key={exercise.key}
                href={{ pathname: '/strength/exercise', params: { key: exercise.key } }}
                accessibilityLabel={labels.nameOf(exercise.key, exercise.name)}
                testID={`exercise-pick-${exercise.key}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  {labels.nameOf(exercise.key, exercise.name)}
                </AppText>
                <Icon name="chevronRight" color={colors.textMuted} size={18} />
              </Card>
            ))
          )}
        </Section>
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

  return (
    <StrengthPage
      title={t('strength.exercise.title')}
      intro={`${name} · ${t('strength.exercise.muscle', { muscle: labels.muscleName(info.muscle) })}`}
      testID="strength-exercise">
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
              {labels.kg(history.bestOneRepMax.kg, 1)} kg
            </AppText>
            <AppText variant="caption" muted numeric>
              {formatShortDay(history.bestOneRepMax.day, language)}
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
        <StatTile
          label={t('strength.exercise.heaviest')}
          value={history.heaviest === null ? '–' : labels.weight(history.heaviest.weightKg)}
          unit={history.heaviest === null ? undefined : 'kg'}
          testID="exercise-heaviest"
        />
        <StatTile label={t('strength.exercise.totalSets')} value={`${history.totalSets}`} testID="exercise-total-sets" />
      </StatRow>

      <Section title={t('strength.exercise.volumeChart')}>
        <Card>
          <BarChart
            testID="exercise-chart"
            data={chronological.map((entry) => entry.volumeKg)}
            formatTick={(value) => labels.kg(value)}
            startLabel={first === undefined ? undefined : formatShortDay(first.day, language)}
            endLabel={last === undefined ? undefined : formatShortDay(last.day, language)}
          />
        </Card>
      </Section>

      <Section title={t('strength.exercise.history')}>
        {history.entries.slice(0, SHOWN_ENTRIES).map((entry) => (
          <Card key={entry.sessionId} testID={`exercise-entry-${entry.sessionId}`}>
            <AppText variant="bodyStrong">{formatShortDay(entry.day, language)}</AppText>
            <AppText variant="label" muted numeric>
              {t('strength.exercise.entryMeta', { sets: entry.sets.length, volume: labels.kg(entry.volumeKg) })}
              {entry.oneRepMaxKg === null ? '' : ` · ${t('strength.exercise.entryRm', { value: labels.kg(entry.oneRepMaxKg, 1) })}`}
            </AppText>
            <AppText variant="caption" muted numeric>
              {entry.sets.map((set) => t('strength.exercise.setLine', { reps: set.reps, weight: labels.weight(set.weightKg) })).join(' · ')}
            </AppText>
          </Card>
        ))}
      </Section>
      <Button label={t('strength.home.trends')} variant="secondary" icon="trends" onPress={() => router.push('/strength/trends')} testID="exercise-trends" />
    </StrengthPage>
  );
}
