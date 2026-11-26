import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData, useLive } from '@/data/context';
import {
  REST_OPTIONS_S,
  STRENGTH_LIMITS,
  activeSession,
  durationS,
  formatClockTimer,
  planned,
  restRemainingS,
  setsDone,
  suggestSet,
  validateSetDraft,
  type ExerciseRef,
  type RestSeconds,
  type SetDraft,
  type SetField,
} from '@/data/strength';
import { useT } from '@/i18n/useT';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { Button, Field } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { Section } from '@/ui/Section';
import { ExercisePicker, StrengthPage, useStrengthLabels } from '@/ui/strength/parts';
import { goBack } from '@/ui/TopBar';
import { spacing, useTheme } from '@/ui/theme';

function useNowMs(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function StrengthLiveScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { strength, strengthActions, startLive, stopLive } = useAppData();
  const live = useLive();
  const labels = useStrengthLabels();
  const nowMs = useNowMs();
  const session = activeSession(strength.sessions);

  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [invalid, setInvalid] = useState<Record<string, SetField[]>>({});
  const [picking, setPicking] = useState(false);
  const [restS, setRestS] = useState<RestSeconds>(90);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const startedLiveHere = useRef(false);
  const stopLiveRef = useRef(stopLive);
  stopLiveRef.current = stopLive;
  useEffect(
    () => () => {
      if (startedLiveHere.current) {
        startedLiveHere.current = false;
        void stopLiveRef.current();
      }
    },
    [],
  );

  if (session === null) {
    return (
      <StrengthPage title={t('strength.live.title')} testID="strength-live" close>
        <Card>
          <AppText variant="title">{t('strength.live.none')}</AppText>
          <AppText variant="body" muted testID="live-none">
            {t('strength.live.noneBody')}
          </AppText>
        </Card>
      </StrengthPage>
    );
  }

  const nowS = Math.floor(nowMs / 1000);
  const remaining = restStartedAt === null ? null : restRemainingS(restStartedAt, restS, nowMs);
  const total = session.sets.length;

  const draftFor = (key: string, fallback: SetDraft): SetDraft => drafts[key] ?? fallback;

  const patchDraft = (key: string, base: SetDraft, change: Partial<SetDraft>): void => {
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? base), ...change } }));
    setInvalid((current) => ({ ...current, [key]: [] }));
  };

  const log = async (key: string, name: string, muscle: ExerciseRef['muscle'], draft: SetDraft): Promise<void> => {
    const result = validateSetDraft(draft);
    if (!result.ok) {
      setInvalid((current) => ({ ...current, [key]: result.invalid }));
      return;
    }
    setBusy(true);
    const saved = await strengthActions.logSet(session.id, { exerciseKey: key, exerciseName: name, muscle, ...result.value });
    setBusy(false);
    if (!saved) return;
    setDrafts((current) => {
      return Object.fromEntries(Object.entries(current).filter(([other]) => other !== key));
    });
    setInvalid((current) => ({ ...current, [key]: [] }));
    setRestStartedAt(Date.now());
  };

  const stopLiveIfStartedHere = async (): Promise<void> => {
    if (startedLiveHere.current) {
      startedLiveHere.current = false;
      await stopLive();
    }
  };

  const finish = async (): Promise<void> => {
    setBusy(true);
    const done = await strengthActions.finishSession(session.id);
    setBusy(false);
    if (!done) return;
    await stopLiveIfStartedHere();
    router.replace({ pathname: '/strength/summary', params: { id: String(session.id) } });
  };

  const discard = async (): Promise<void> => {
    setConfirmDiscard(false);
    if (await strengthActions.removeSession(session.id)) {
      await stopLiveIfStartedHere();
      goBack();
    }
  };

  const add = async (ref: ExerciseRef): Promise<void> => {
    setPicking(false);
    await strengthActions.addSessionExercise(session.id, planned(ref));
  };

  return (
    <StrengthPage title={session.name} testID="strength-live" close>
      <StatRow>
        <StatTile label={t('strength.live.elapsed')} value={formatClockTimer(durationS(session, nowS))} testID="live-elapsed" />
        <StatTile
          label={t('strength.live.hr')}
          value={live.active && live.heartRate !== null ? `${live.heartRate}` : '–'}
          unit={live.active && live.heartRate !== null ? 'bpm' : undefined}
          testID="live-hr"
        />
      </StatRow>
      {live.active && live.heartRate === null ? (
        <AppText variant="caption" muted testID="live-hr-waiting">
          {t('strength.live.hrWaiting')}
        </AppText>
      ) : null}
      {!live.active ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="caption" muted testID="live-hr-off">
            {t('strength.live.hrOff')}
          </AppText>
          <Button
            label={t('strength.live.hrStart')}
            variant="tertiary"
            icon="heart"
            onPress={() => {
              startedLiveHere.current = true;
              void startLive();
            }}
            testID="live-hr-start"
          />
        </View>
      ) : null}

      <Card testID="live-rest">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="cardTitle">{t('strength.live.rest')}</AppText>
          <AppText variant="value" numeric testID="live-rest-value">
            {remaining === null ? '–' : formatClockTimer(remaining)}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {REST_OPTIONS_S.map((seconds) => (
            <Pill key={seconds} label={t('strength.live.restOption', { seconds })} selected={restS === seconds} onPress={() => setRestS(seconds)} testID={`live-rest-${seconds}`} />
          ))}
        </View>
        <AppText variant="caption" muted testID="live-rest-state">
          {remaining === null ? t('strength.live.restIdle') : remaining > 0 ? t('strength.live.restRunning') : t('strength.live.restDone')}
        </AppText>
        {remaining !== null ? <Button label={t('strength.live.restSkip')} variant="tertiary" onPress={() => setRestStartedAt(null)} testID="live-rest-skip" /> : null}
      </Card>

      {session.exercises.length === 0 ? (
        <AppText variant="body" muted testID="live-empty">
          {t('strength.live.empty')}
        </AppText>
      ) : null}

      {session.exercises.map((exercise) => {
        const key = exercise.exerciseKey;
        const name = labels.nameOf(key, exercise.exerciseName);
        const logged = session.sets.filter((set) => set.exerciseKey === key);
        const draft = draftFor(key, suggestSet(exercise, session.sets));
        const bad = invalid[key] ?? [];
        return (
          <Card key={exercise.id} testID={`live-exercise-${key}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="cardTitle">{name}</AppText>
                <AppText variant="caption" muted numeric>
                  {labels.muscleName(exercise.muscle)} · {t('strength.live.progress', { done: setsDone(exercise, session.sets), target: exercise.sets })}
                </AppText>
              </View>
              {logged.length === 0 ? (
                <Pressable
                  testID={`live-remove-${key}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('strength.live.removeExercise', { name })}
                  onPress={() => void strengthActions.removeSessionExercise(exercise.id)}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="trash" color={colors.textMuted} size={18} />
                </Pressable>
              ) : null}
            </View>
            {logged.map((set, index) => (
              <View key={set.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }} testID={`live-set-${set.id}`}>
                <AppText variant="body" numeric style={{ flex: 1 }}>
                  {t('strength.live.setLine', { n: index + 1, reps: set.reps, weight: labels.weight(set.weightKg) })}
                  {set.rpe === null ? '' : ` · ${t('strength.live.setRpe', { rpe: labels.weight(set.rpe) })}`}
                </AppText>
                <Pressable
                  testID={`live-delete-set-${set.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('strength.live.removeSet', { n: index + 1, name })}
                  onPress={() => void strengthActions.removeSet(set.id)}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="close" color={colors.textMuted} size={16} />
                </Pressable>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Field
                  label={t('strength.live.reps')}
                  error={bad.includes('reps')}
                  value={draft.reps}
                  onChangeText={(reps) => patchDraft(key, draft, { reps })}
                  keyboardType="number-pad"
                  testID={`live-reps-${key}`}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label={t('strength.live.weight')}
                  error={bad.includes('weight')}
                  suffix="kg"
                  value={draft.weight}
                  onChangeText={(weight) => patchDraft(key, draft, { weight })}
                  keyboardType="decimal-pad"
                  testID={`live-weight-${key}`}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label={t('strength.live.rpe')}
                  error={bad.includes('rpe')}
                  value={draft.rpe}
                  onChangeText={(rpe) => patchDraft(key, draft, { rpe })}
                  keyboardType="decimal-pad"
                  testID={`live-rpe-${key}`}
                />
              </View>
            </View>
            <AppText variant="caption" color={bad.length > 0 ? colors.negative : colors.textMuted}>
              {bad.length > 0
                ? t('strength.live.errorSet')
                : t('strength.builder.targetHint', {
                    setsMin: STRENGTH_LIMITS.sets.min,
                    setsMax: STRENGTH_LIMITS.sets.max,
                    repsMin: STRENGTH_LIMITS.reps.min,
                    repsMax: STRENGTH_LIMITS.reps.max,
                    weightMin: STRENGTH_LIMITS.weightKg.min,
                    weightMax: STRENGTH_LIMITS.weightKg.max,
                  }) +
                  ' ' +
                  t('strength.live.rpeHint')}
            </AppText>
            <Button
              label={t('strength.live.logSet')}
              icon="check"
              disabled={busy}
              onPress={() => void log(key, exercise.exerciseName, exercise.muscle, draft)}
              testID={`live-log-${key}`}
            />
          </Card>
        );
      })}

      <Section title={t('strength.live.addExercise')}>
        {picking ? (
          <ExercisePicker exclude={session.exercises.map((exercise) => exercise.exerciseKey)} onPick={(ref) => void add(ref)} onClose={() => setPicking(false)} />
        ) : (
          <Button label={t('strength.live.addExercise')} variant="secondary" icon="plus" onPress={() => setPicking(true)} testID="live-add" />
        )}
      </Section>

      <Button label={t('strength.live.finish')} onPress={() => void finish()} disabled={busy || total === 0} testID="live-finish" />
      {total === 0 ? (
        <AppText variant="caption" muted testID="live-finish-hint">
          {t('strength.live.finishNeedsSet')}
        </AppText>
      ) : null}
      {confirmDiscard ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
          <Button label={t('strength.live.confirmDiscard')} variant="danger" onPress={() => void discard()} testID="live-confirm-discard" />
          <Button label={t('strength.live.keepGoing')} variant="tertiary" onPress={() => setConfirmDiscard(false)} testID="live-keep" />
        </View>
      ) : (
        <Button label={t('strength.live.discard')} variant="tertiary" onPress={() => setConfirmDiscard(true)} testID="live-discard" />
      )}
    </StrengthPage>
  );
}
