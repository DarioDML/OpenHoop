import type { PlannedExercise } from '@openhoop/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { singleParam } from '@/data/dailyDerived';
import { useAppData } from '@/data/context';
import { STRENGTH_LIMITS, cleanName, planned, targetDraftOf, validateTargetDraft, type ExerciseRef, type TargetDraft, type TargetField } from '@/data/strength';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { Section } from '@/ui/Section';
import { ExercisePicker, StrengthPage, useStrengthLabels } from '@/ui/strength/parts';
import { goBack } from '@/ui/TopBar';
import { spacing, useTheme } from '@/ui/theme';

interface Row {
  localId: number;
  base: PlannedExercise;
  draft: TargetDraft;
}

type RowProblems = Record<number, TargetField[]>;

export default function StrengthBuilderScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { strength, strengthActions } = useAppData();
  const labels = useStrengthLabels();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const idParam = singleParam(params.id);
  const templateId = idParam !== null && /^\d{1,9}$/.test(idParam) ? Number(idParam) : null;
  const existing = templateId === null ? null : (strength.templates.find((template) => template.id === templateId) ?? null);

  const counter = useRef(0);
  const nextId = (): number => {
    counter.current += 1;
    return counter.current;
  };
  const [name, setName] = useState(existing?.name ?? '');
  const [rows, setRows] = useState<Row[]>(() => (existing?.items ?? []).map((item) => ({ localId: nextId(), base: item, draft: targetDraftOf(item) })));
  const [picking, setPicking] = useState(false);
  const [problems, setProblems] = useState<RowProblems>({});
  const [formError, setFormError] = useState<'name' | 'items' | 'targets' | 'tooMany' | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    setRows((current) => [...current, { localId: nextId(), base: item, draft: targetDraftOf(item) }]);
    setPicking(false);
    clearErrors();
  };

  const patchRow = (localId: number, change: Partial<TargetDraft>): void => {
    setRows((current) => current.map((row) => (row.localId === localId ? { ...row, draft: { ...row.draft, ...change } } : row)));
    clearErrors();
  };

  const move = (index: number, delta: -1 | 1): void => {
    setRows((current) => {
      const target = index + delta;
      const a = current[index];
      const b = current[target];
      if (a === undefined || b === undefined) return current;
      const next = [...current];
      next[index] = b;
      next[target] = a;
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
      const result = validateTargetDraft(row.draft);
      if (!result.ok) found[index] = result.invalid;
      else items.push({ ...row.base, ...result.value });
    });
    if (Object.keys(found).length > 0) {
      setProblems(found);
      setFormError('targets');
      return null;
    }
    return { name: cleaned, items };
  };

  const save = async (start: boolean): Promise<void> => {
    const input = collect();
    if (input === null) return;
    setSaving(true);
    const savedId = await strengthActions.saveTemplate(templateId, input);
    if (savedId === null) {
      setSaving(false);
      return;
    }
    if (start) {
      const sessionId = await strengthActions.startSession(savedId, input.name, input.items);
      setSaving(false);
      if (sessionId !== null) router.replace('/strength/live');
      return;
    }
    setSaving(false);
    goBack();
  };

  const remove = async (): Promise<void> => {
    if (templateId === null) return;
    if (await strengthActions.removeTemplate(templateId)) goBack();
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

  return (
    <StrengthPage title={t('strength.builder.title')} intro={t('strength.builder.intro')} testID="strength-builder">
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

      <Section title={t('strength.builder.items')} hint={t('strength.builder.targetHint', {
        setsMin: STRENGTH_LIMITS.sets.min,
        setsMax: STRENGTH_LIMITS.sets.max,
        repsMin: STRENGTH_LIMITS.reps.min,
        repsMax: STRENGTH_LIMITS.reps.max,
        weightMin: STRENGTH_LIMITS.weightKg.min,
        weightMax: STRENGTH_LIMITS.weightKg.max,
      })}>
        {rows.length === 0 ? (
          <AppText variant="body" muted testID="builder-items-empty">
            {t('strength.builder.itemsEmpty')}
          </AppText>
        ) : (
          rows.map((row, index) => {
            const bad = problems[index] ?? [];
            const label = labels.nameOf(row.base.exerciseKey, row.base.exerciseName);
            return (
              <Card key={row.localId} testID={`builder-row-${index}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="bodyStrong">{label}</AppText>
                    <AppText variant="caption" muted>
                      {labels.muscleName(row.base.muscle)}
                    </AppText>
                  </View>
                  <IconButton name="chevronDown" rotate label={t('strength.builder.moveUp', { name: label })} disabled={index === 0} onPress={() => move(index, -1)} testID={`builder-up-${index}`} />
                  <IconButton name="chevronDown" label={t('strength.builder.moveDown', { name: label })} disabled={index === rows.length - 1} onPress={() => move(index, 1)} testID={`builder-down-${index}`} />
                  <IconButton
                    name="trash"
                    label={t('strength.builder.remove', { name: label })}
                    color={colors.negative}
                    onPress={() => {
                      setRows((current) => current.filter((other) => other.localId !== row.localId));
                      clearErrors();
                    }}
                    testID={`builder-remove-${index}`}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={t('strength.builder.sets')}
                      error={bad.includes('sets')}
                      value={row.draft.sets}
                      onChangeText={(sets) => patchRow(row.localId, { sets })}
                      keyboardType="number-pad"
                      testID={`builder-sets-${index}`}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={t('strength.builder.reps')}
                      error={bad.includes('reps')}
                      value={row.draft.reps}
                      onChangeText={(reps) => patchRow(row.localId, { reps })}
                      keyboardType="number-pad"
                      testID={`builder-reps-${index}`}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={t('strength.builder.weight')}
                      error={bad.includes('weight')}
                      suffix="kg"
                      value={row.draft.weight}
                      onChangeText={(weight) => patchRow(row.localId, { weight })}
                      keyboardType="decimal-pad"
                      testID={`builder-weight-${index}`}
                    />
                  </View>
                </View>
              </Card>
            );
          })
        )}
        {picking ? (
          <ExercisePicker exclude={rows.map((row) => row.base.exerciseKey)} onPick={add} onClose={() => setPicking(false)} />
        ) : (
          <Button label={t('strength.builder.add')} variant="secondary" icon="plus" onPress={() => setPicking(true)} testID="builder-add" />
        )}
      </Section>

      {errorText !== null ? (
        <AppText variant="label" color={colors.negative} testID="builder-error">
          {errorText}
        </AppText>
      ) : null}
      <Button label={t('strength.builder.save')} onPress={() => void save(false)} disabled={saving} testID="builder-save" />
      <Button label={t('strength.builder.saveStart')} variant="secondary" icon="play" onPress={() => void save(true)} disabled={saving} testID="builder-save-start" />
      {existing !== null ? (
        confirmDelete ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
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

interface IconButtonProps {
  name: 'chevronDown' | 'trash';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  rotate?: boolean;
  color?: string;
  testID: string;
}

function IconButton({ name, label, onPress, disabled = false, rotate = false, color, testID }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1, transform: [{ rotate: rotate ? '180deg' : '0deg' }] }}>
      <Icon name={name} color={color ?? colors.textMuted} size={18} />
    </Pressable>
  );
}
