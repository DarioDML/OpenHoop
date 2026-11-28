import type { PlannedExercise } from '@openhoop/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import type { CoachErrorKind } from '@/coach/api';
import { CoachContext } from '@/coach/CoachContext';
import { secureKeyStore } from '@/coach/keyStore';
import { singleParam } from '@/data/dailyDerived';
import { useAppData } from '@/data/context';
import {
  STRENGTH_LIMITS,
  activeSession,
  cleanName,
  exerciseRefs,
  planned,
  targetDraftOf,
  validateTargetDraft,
  type ExerciseRef,
  type TargetDraft,
  type TargetField,
} from '@/data/strength';
import { cleanDescription, recentWeights, requestWorkoutPlan, DESCRIPTION_LIMITS } from '@/data/strengthCoach';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { moveItem } from '@/lib/reorder';
import { weightIn } from '@/lib/units';
import { netFetch } from '@/net';
import { featureEnabled } from '@/net/features';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field } from '@/ui/controls';
import { Icon, type IconName } from '@/ui/Icon';
import { useLayout } from '@/ui/layout';
import { CapHeader } from '@/ui/ListGroup';
import { GradientFill } from '@/ui/Screen';
import { DragList } from '@/ui/strength/DragList';
import { ExercisePicker, StrengthPage, useStrengthLabels } from '@/ui/strength/parts';
import { IconButton, goBack } from '@/ui/TopBar';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';

interface Row {
  localId: number;
  base: PlannedExercise;
  draft: TargetDraft;
}

type RowProblems = Record<number, TargetField[]>;

type CoachPhase =
  | { step: 'idle' }
  | { step: 'sending' }
  | { step: 'filled'; count: number; dropped: number; previous: { rows: Row[]; name: string } }
  | { step: 'failed'; message: TranslationKey };

const OWN_ERRORS: Partial<Record<CoachErrorKind, TranslationKey>> = {
  rejected: 'strength.coach.error.rejected',
  incomplete: 'strength.coach.error.incomplete',
  'invalid-response': 'strength.coach.error.invalid',
};

function coachErrorKey(kind: CoachErrorKind): TranslationKey {
  return OWN_ERRORS[kind] ?? `coach.error.${kind}`;
}

export default function StrengthBuilderScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { narrow } = useLayout();
  const { strength, strengthActions, userData } = useAppData();
  const coach = useContext(CoachContext);
  const labels = useStrengthLabels();
  const params = useLocalSearchParams<{ id?: string | string[]; coach?: string | string[] }>();
  const idParam = singleParam(params.id);
  const askCoach = singleParam(params.coach) === '1';
  const templateId = idParam !== null && /^\d{1,9}$/.test(idParam) ? Number(idParam) : null;
  const existing = templateId === null ? null : (strength.templates.find((template) => template.id === templateId) ?? null);

  const counter = useRef(0);
  const nextId = (): number => {
    counter.current += 1;
    return counter.current;
  };
  const [name, setName] = useState(existing?.name ?? '');
  const [rows, setRows] = useState<Row[]>(() => (existing?.items ?? []).map((item) => ({ localId: nextId(), base: item, draft: targetDraftOf(item, labels.units) })));
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [reorder, setReorder] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [picking, setPicking] = useState(false);
  const [problems, setProblems] = useState<RowProblems>({});
  const [formError, setFormError] = useState<'name' | 'items' | 'targets' | 'tooMany' | null>(null);
  const [saving, setSaving] = useState(false);
  const savingNow = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [description, setDescription] = useState('');
  const [coachPhase, setCoachPhase] = useState<CoachPhase>({ step: 'idle' });
  const inflight = useRef<AbortController | null>(null);
  const latest = useRef({ rows, name });
  latest.current = { rows, name };
  const running = activeSession(strength.sessions) !== null;
  const coachNetwork = featureEnabled(userData.network, 'coach');
  const coachKey = coach?.state.hasKey === true;

  useEffect(
    () => () => {
      inflight.current?.abort();
    },
    [],
  );

  if (templateId !== null && existing === null) {
    return (
      <StrengthPage title={t('strength.builder.title')} testID="strength-builder">
        <Card>
          <AppText variant="body" muted testID="builder-missing">
            {t('strength.builder.notFound')}
          </AppText>
        </Card>
      </StrengthPage>
    );
  }

  const clearErrors = (): void => {
    setProblems({});
    setFormError(null);
  };

  const add = (ref: ExerciseRef): void => {
    if (rows.length >= STRENGTH_LIMITS.items.max) {
      setFormError('tooMany');
      return;
    }
    const item = planned(ref);
    const localId = nextId();
    setRows((current) => [...current, { localId, base: item, draft: targetDraftOf(item, labels.units) }]);
    setExpanded((current) => new Set([...current, localId]));
    setPicking(false);
    clearErrors();
  };

  const patchRow = (localId: number, change: Partial<TargetDraft>): void => {
    setRows((current) => current.map((row) => (row.localId === localId ? { ...row, draft: { ...row.draft, ...change } } : row)));
    clearErrors();
  };

  const move = (from: number, to: number): void => {
    setRows((current) => moveItem(current, from, to));
    setProblems({});
  };

  const toggle = (localId: number): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
  };

  const collect = (): { name: string; items: PlannedExercise[] } | null => {
    const cleaned = cleanName(name, STRENGTH_LIMITS.templateNameLength);
    if (cleaned === null) {
      setFormError('name');
      return null;
    }
    if (rows.length === 0) {
      setFormError('items');
      return null;
    }
    const found: RowProblems = {};
    const items: PlannedExercise[] = [];
    rows.forEach((row, index) => {
      const result = validateTargetDraft(row.draft, labels.units, row.base.weightKg);
      if (!result.ok) found[index] = result.invalid;
      else items.push({ ...row.base, ...result.value });
    });
    if (Object.keys(found).length > 0) {
      setProblems(found);
      setExpanded((current) => new Set([...current, ...rows.filter((_, index) => found[index] !== undefined).map((row) => row.localId)]));
      setFormError('targets');
      return null;
    }
    return { name: cleaned, items };
  };

  const save = async (start: boolean): Promise<void> => {
    if (savingNow.current) return;
    const input = collect();
    if (input === null) return;
    savingNow.current = true;
    setSaving(true);
    try {
      const savedId = await strengthActions.saveTemplate(templateId, input);
      if (savedId === null) return;
      if (start) {
        const sessionId = await strengthActions.startSession(savedId, input.name, input.items);
        if (sessionId !== null) router.replace('/strength/live');
        return;
      }
      goBack();
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (templateId === null) return;
    if (await strengthActions.removeTemplate(templateId)) goBack();
  };

  const askForWorkout = async (): Promise<void> => {
    const text = cleanDescription(description);
    if (text === null || coachPhase.step === 'sending') {
      if (text === null) setCoachPhase({ step: 'failed', message: 'strength.coach.describeHint' });
      return;
    }
    const abort = new AbortController();
    inflight.current?.abort();
    inflight.current = abort;
    setCoachPhase({ step: 'sending' });
    let apiKey: string | null;
    try {
      apiKey = await secureKeyStore.load();
    } catch {
      apiKey = null;
    }
    if (abort.signal.aborted) return;
    if (apiKey === null) {
      setCoachPhase({ step: 'failed', message: coachErrorKey('no-key') });
      return;
    }
    const result = await requestWorkoutPlan(
      netFetch,
      { apiKey, model: userData.coach.model, description: text, language, refs: exerciseRefs(strength.customExercises, labels.libraryName), recent: recentWeights(strength.sessions) },
      { signal: abort.signal },
    );
    if (abort.signal.aborted) return;
    inflight.current = null;
    if (!result.ok) {
      setCoachPhase({ step: 'failed', message: coachErrorKey(result.error) });
      return;
    }
    if (result.items.length === 0) {
      setCoachPhase({ step: 'failed', message: 'strength.coach.nothing' });
      return;
    }
    const previous = latest.current;
    setRows(result.items.map((item) => ({ localId: nextId(), base: item, draft: targetDraftOf(item, labels.units) })));
    setExpanded(new Set());
    if (previous.name.trim() === '' && result.name !== null) setName(result.name);
    clearErrors();
    setCoachPhase({ step: 'filled', count: result.items.length, dropped: result.dropped, previous });
  };

  const undoCoach = (): void => {
    if (coachPhase.step !== 'filled') return;
    setRows(coachPhase.previous.rows);
    setName(coachPhase.previous.name);
    setCoachPhase({ step: 'idle' });
    clearErrors();
  };

  const errorText =
    formError === 'name'
      ? t('strength.builder.errorName', { max: STRENGTH_LIMITS.templateNameLength.max })
      : formError === 'items'
        ? t('strength.builder.errorItems')
        : formError === 'tooMany'
          ? t('strength.builder.tooMany', { max: STRENGTH_LIMITS.items.max })
          : formError === 'targets'
            ? t('strength.builder.errorTargets')
            : null;

  const targetHint = t('strength.builder.targetHint', {
    setsMin: STRENGTH_LIMITS.sets.min,
    setsMax: STRENGTH_LIMITS.sets.max,
    repsMin: STRENGTH_LIMITS.reps.min,
    repsMax: STRENGTH_LIMITS.reps.max,
    weightMin: labels.num(Math.ceil(weightIn(STRENGTH_LIMITS.weightKg.min, labels.units))),
    weightMax: labels.num(Math.floor(weightIn(STRENGTH_LIMITS.weightKg.max, labels.units))),
    unit: labels.unit,
  });

  const title = name.trim() === '' ? t(existing === null ? 'strength.builder.newTitle' : 'strength.builder.title') : name.trim();

  const renderRow = (row: Row, index: number): ReactElement => {
    const bad = problems[index] ?? [];
    const label = labels.nameOf(row.base.exerciseKey, row.base.exerciseName);
    const open = expanded.has(row.localId) || bad.length > 0;
    const checked = validateTargetDraft(row.draft, labels.units, row.base.weightKg);
    const summary = checked.ok ? labels.setSummary(checked.value.sets, checked.value.reps, checked.value.weightKg) : t('strength.builder.checkRow');
    const fields = [
      { key: 'sets' as const, label: t('strength.builder.sets'), decimal: false },
      { key: 'reps' as const, label: t('strength.builder.reps'), decimal: false },
      { key: 'weight' as const, label: t('strength.builder.weight'), decimal: true },
    ];
    const fieldFor = (field: (typeof fields)[number]): ReactElement => (
      <Field
        label={field.label}
        error={bad.includes(field.key)}
        suffix={field.key === 'weight' ? labels.unit : undefined}
        value={row.draft[field.key]}
        onChangeText={(value) => patchRow(row.localId, draftPatch(field.key, value))}
        keyboardType={field.decimal ? 'decimal-pad' : 'number-pad'}
        testID={`builder-${field.key}-${index}`}
      />
    );
    return (
      <View testID={`builder-row-${index}`} style={{ paddingVertical: spacing.sm, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52 }}>
          <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
            <AppText variant="body" style={{ fontWeight: '500' }}>
              {label}
            </AppText>
            <AppText variant="label" color={checked.ok ? colors.textMuted : colors.negative} numeric testID={`builder-summary-${index}`}>
              {summary}
            </AppText>
          </View>
          {reorder ? (
            <>
              <RoundButton icon="chevronUp" label={t('strength.builder.moveUp', { name: label })} disabled={index === 0} onPress={() => move(index, index - 1)} testID={`builder-up-${index}`} />
              <RoundButton icon="chevronDown" label={t('strength.builder.moveDown', { name: label })} disabled={index === rows.length - 1} onPress={() => move(index, index + 1)} testID={`builder-down-${index}`} />
            </>
          ) : (
            <RoundButton icon={open ? 'check' : 'edit'} label={t(open ? 'strength.builder.doneEditing' : 'strength.builder.editRow', { name: label })} onPress={() => toggle(row.localId)} testID={`builder-edit-${index}`} />
          )}
        </View>
        {open && !reorder ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: narrow ? 'column' : 'row', gap: spacing.sm }}>
              {fields.slice(0, 2).map((field) => (
                <View key={field.key} style={narrow ? undefined : { flex: 1 }}>
                  {fieldFor(field)}
                </View>
              ))}
            </View>
            {fields.slice(2).map((field) => (
              <View key={field.key}>{fieldFor(field)}</View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
              <AppText variant="caption" muted style={{ flex: 1 }}>
                {labels.muscleName(row.base.muscle)}
              </AppText>
              <Button
                label={t('strength.builder.removeShort')}
                accessibilityLabel={t('strength.builder.remove', { name: label })}
                variant="tertiary"
                icon="trash"
                onPress={() => {
                  setRows((current) => current.filter((other) => other.localId !== row.localId));
                  clearErrors();
                }}
                testID={`builder-remove-${index}`}
              />
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <StrengthPage
      title={title}
      testID="strength-builder"
      scrollEnabled={!dragging}
      right={<IconButton icon="check" label={t('strength.builder.save')} color={colors.text} onPress={() => void save(false)} disabled={saving} testID="builder-save-icon" />}>
      {coachNetwork && coachKey ? (
        <View style={{ gap: spacing.sm }} testID="builder-coach">
          <View style={{ justifyContent: 'center' }}>
            <TextInput
              value={description}
              onChangeText={(text) => {
                setDescription(text);
                if (coachPhase.step === 'failed') setCoachPhase({ step: 'idle' });
              }}
              placeholder={t('strength.coach.placeholder')}
              placeholderTextColor={colors.textFaint}
              accessibilityLabel={t('strength.coach.describe')}
              maxLength={DESCRIPTION_LIMITS.max}
              autoFocus={askCoach}
              returnKeyType="send"
              onSubmitEditing={() => void askForWorkout()}
              editable={coachPhase.step !== 'sending'}
              testID="builder-describe"
              style={{
                minHeight: 52,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.borderStrong,
                backgroundColor: colors.coach.surface,
                color: colors.text,
                paddingLeft: spacing.lg,
                paddingRight: 56,
                fontSize: 16,
                fontFamily: fonts.regular,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('strength.coach.send')}
              accessibilityState={{ disabled: coachPhase.step === 'sending', busy: coachPhase.step === 'sending' }}
              disabled={coachPhase.step === 'sending'}
              onPress={() => void askForWorkout()}
              testID="builder-describe-send"
              style={{ position: 'absolute', right: 6, width: 40, height: 40, borderRadius: radius.pill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              <GradientFill id="builder-coach-send" from={colors.coach.from} to={colors.coach.to} angle="diagonal" />
              {coachPhase.step === 'sending' ? <ActivityIndicator color={colors.text} /> : <Icon name="sparkle" color={colors.text} size={20} />}
            </Pressable>
          </View>
          <AppText
            variant="caption"
            color={coachPhase.step === 'failed' ? colors.negative : colors.textMuted}
            testID="builder-coach-status"
            accessibilityLiveRegion="polite">
            {coachPhase.step === 'sending'
              ? t('strength.coach.sending')
              : coachPhase.step === 'failed'
                ? t(coachPhase.message, { min: DESCRIPTION_LIMITS.min, max: DESCRIPTION_LIMITS.max })
                : coachPhase.step === 'filled'
                  ? [t('strength.coach.filled', { count: coachPhase.count }), coachPhase.dropped > 0 ? t('strength.coach.dropped', { count: coachPhase.dropped }) : null]
                      .filter((part): part is string => part !== null)
                      .join(' ')
                  : t('strength.coach.privacy')}
          </AppText>
          {coachPhase.step === 'filled' ? <Button label={t('strength.coach.undo')} variant="tertiary" onPress={undoCoach} testID="builder-coach-undo" /> : null}
        </View>
      ) : (
        <Card testID="builder-coach-off" style={{ backgroundColor: colors.coach.surface }}>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
            <Icon name="sparkle" color={colors.text} size={22} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="cardTitle">{t('strength.coach.offTitle')}</AppText>
              <AppText variant="label" muted>
                {t(coachKey ? 'strength.coach.offNetwork' : 'strength.coach.offKey')}
              </AppText>
            </View>
          </View>
          <Button label={t('strength.coach.settings')} variant="secondary" onPress={() => router.push('/coach/settings')} testID="builder-coach-settings" />
        </Card>
      )}

      <Field
        label={t('strength.builder.name')}
        hint={t('strength.builder.nameHint', { max: STRENGTH_LIMITS.templateNameLength.max })}
        error={formError === 'name'}
        value={name}
        onChangeText={(value) => {
          setName(value);
          clearErrors();
        }}
        testID="builder-name"
      />

      <CapHeader
        title={t('strength.builder.items')}
        action={rows.length > 1 ? t(reorder ? 'strength.builder.reorderDone' : 'strength.builder.reorder') : undefined}
        onAction={() => setReorder((current) => !current)}
      />
      {rows.length === 0 ? (
        <AppText variant="body" muted testID="builder-items-empty">
          {t('strength.builder.itemsEmpty')}
        </AppText>
      ) : (
        <DragList items={rows} keyOf={(row) => `${row.localId}`} renderRow={renderRow} onMove={move} onDragChange={setDragging} testPrefix="builder-" />
      )}
      <AppText variant="caption" muted>
        {`${t('strength.builder.intro')} ${targetHint} ${t('strength.builder.dragHint')}`}
      </AppText>
      {picking ? (
        <ExercisePicker exclude={rows.map((row) => row.base.exerciseKey)} onPick={add} onClose={() => setPicking(false)} />
      ) : (
        <Button label={t('strength.builder.add')} variant="soft" icon="plus" onPress={() => setPicking(true)} testID="builder-add" />
      )}

      {errorText !== null ? (
        <AppText variant="label" color={colors.negative} testID="builder-error">
          {errorText}
        </AppText>
      ) : null}
      <Button label={t('strength.builder.saveStart')} icon="play" onPress={() => void save(true)} disabled={saving || running} testID="builder-save-start" />
      <AppText variant="caption" muted>
        {running ? t('strength.builder.runningHint') : t('strength.builder.saveStartHint')}
      </AppText>
      <Button label={t('strength.builder.save')} variant="secondary" onPress={() => void save(false)} disabled={saving} testID="builder-save" />
      {existing !== null ? (
        confirmDelete ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' }}>
            <Button label={t('strength.common.confirmDelete')} variant="danger" onPress={() => void remove()} testID="builder-confirm-delete" />
            <Button label={t('strength.common.keep')} variant="tertiary" onPress={() => setConfirmDelete(false)} testID="builder-keep" />
          </View>
        ) : (
          <Button label={t('strength.builder.delete')} variant="tertiary" onPress={() => setConfirmDelete(true)} testID="builder-delete" />
        )
      ) : null}
    </StrengthPage>
  );
}

function draftPatch(key: TargetField, value: string): Partial<TargetDraft> {
  if (key === 'sets') return { sets: value };
  if (key === 'reps') return { reps: value };
  return { weight: value };
}

interface RoundButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}

function RoundButton({ icon, label, onPress, disabled = false, testID }: RoundButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
      })}>
      <Icon name={icon} color={colors.text} size={18} />
    </Pressable>
  );
}
