import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatLongDay, indexOfDay, isDayString, singleParam } from '@/data/dailyDerived';
import { draftTimes, editableSleeps, type EditableSleep } from '@/data/sleepEditForm';
import type { SleepEditOutcome } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button, Field } from '@/ui/controls';
import { Callout, Divider, NoDataPage, Page } from '@/ui/daily/bits';
import { ListRow } from '@/ui/ListGroup';
import { spacing, useTheme } from '@/ui/theme';

const HOUR_S = 3_600;

type Problem = Exclude<SleepEditOutcome, 'saved'> | 'invalid-time';

interface Editing {
  item: EditableSleep | null;
}

function problemKey(problem: Problem, manual: boolean): TranslationKey {
  if (problem === 'too-long') return manual ? 'sleepx.problem.too-long-nap' : 'sleepx.problem.too-long-night';
  return `sleepx.problem.${problem}`;
}

export default function EditSleepScreen() {
  const params = useLocalSearchParams<{ day?: string | string[] }>();
  const { days, sleepEdits, sleepEditLimits, saveSleepEdit, deleteSleepEdit } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const requested = singleParam(params.day);
  const initial = requested === null ? days.length - 1 : isDayString(requested) ? indexOfDay(days, requested) : -1;
  const [index, setIndex] = useState(initial);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [status, setStatus] = useState<TranslationKey | null>(null);
  const [busy, setBusy] = useState(false);

  const day = days[index];
  if (!day) {
    return <NoDataPage title={t('sleepx.edit')} body={requested !== null && !isDayString(requested) ? t('daily.invalidDay') : t('sleepx.noNight')} />;
  }
  const tz = day.tzOffsetS;
  const items = editableSleeps(day, sleepEdits);
  const clock = (epochS: number): string => formatClock(epochS, tz);
  const label = (item: EditableSleep | null): string =>
    item === null ? t('sleepx.editNewNap') : item.kind === 'night' ? t('sleepx.editNight') : t('sleepx.editNap');

  const open = (item: EditableSleep | null): void => {
    setEditing({ item });
    setStartText(item === null ? '' : clock(item.onset));
    setEndText(item === null ? '' : clock(item.offset));
    setProblem(null);
    setStatus(null);
  };

  const close = (): void => {
    setEditing(null);
    setProblem(null);
  };

  const moveDay = (delta: number): void => {
    setIndex((current) => Math.min(days.length - 1, Math.max(0, current + delta)));
    setEditing(null);
    setProblem(null);
    setStatus(null);
  };

  const save = async (): Promise<void> => {
    if (editing === null || busy) return;
    const item = editing.item;
    const draft = draftTimes(item, day.day, tz, startText, endText);
    if (!draft.ok) {
      setProblem(draft.problem);
      return;
    }
    setBusy(true);
    const outcome = await saveSleepEdit({
      id: item?.editId ?? null,
      targetOnset: item === null ? null : item.targetOnset,
      targetOffset: item === null ? null : item.targetOffset,
      onset: draft.onset,
      offset: draft.offset,
      replaces: item === null ? null : { onset: item.onset, offset: item.offset },
    });
    setBusy(false);
    if (outcome === 'saved') {
      close();
      setStatus('sleepx.editSaved');
    } else {
      setProblem(outcome);
    }
  };

  const remove = async (item: EditableSleep): Promise<void> => {
    if (item.editId === null || busy) return;
    setBusy(true);
    const removed = await deleteSleepEdit(item.editId);
    setBusy(false);
    if (removed) {
      close();
      setStatus(item.source === 'manual' ? 'sleepx.editDeleted' : 'sleepx.editRestored');
    } else {
      setProblem('error');
    }
  };

  const sourceChip = (item: EditableSleep) =>
    item.source === 'detected' ? undefined : (
      <Chip label={item.source === 'manual' ? t('sleepx.sourceManual') : t('sleepx.sourceEdited')} tone="info" small />
    );

  const dayStep = (delta: number, glyph: string, accessibility: string, disabled: boolean) => (
    <Pressable
      testID={delta < 0 ? 'edit-prev-day' : 'edit-next-day'}
      accessibilityRole="button"
      accessibilityLabel={accessibility}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => moveDay(delta)}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <AppText variant="title">{glyph}</AppText>
    </Pressable>
  );

  const current = editing?.item ?? null;
  const editedTarget =
    current !== null && current.source === 'edited' && current.targetOnset !== null && current.targetOffset !== null
      ? t('sleepx.editDetected', { start: clock(current.targetOnset), end: clock(current.targetOffset) })
      : undefined;

  return (
    <Page
      title={t('sleepx.edit')}
      tint="sleep"
      testID="sleep-edit"
      hero={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {dayStep(-1, '‹', t('sleepx.editPrevDay'), index <= 0)}
          <AppText variant="title" style={{ flex: 1, textAlign: 'center' }} testID="edit-day">
            {formatLongDay(day.day, language)}
          </AppText>
          {dayStep(1, '›', t('sleepx.editNextDay'), index >= days.length - 1)}
        </View>
      }>
      <AppText variant="body" muted>
        {t('sleepx.editIntro')}
      </AppText>

      {status !== null ? (
        <AppText variant="label" color={colors.positive} testID="edit-status">
          {t(status)}
        </AppText>
      ) : null}

      <Card style={{ gap: 0 }} testID="edit-list">
        {items.length === 0 ? (
          <AppText variant="body" muted testID="edit-none">
            {t('sleepx.editNone')}
          </AppText>
        ) : (
          items.map((item, i) => (
            <View key={item.key}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                testID={`edit-item-${item.key}`}
                title={label(item)}
                subtitle={t('sleepx.editRange', { start: clock(item.onset), end: clock(item.offset), asleep: formatDuration(t, item.asleepS) })}
                right={sourceChip(item)}
                onPress={() => open(item)}
              />
            </View>
          ))
        )}
      </Card>

      {editing === null ? (
        <Button testID="edit-add-nap" label={t('sleepx.editAddNap')} variant="secondary" icon="plus" onPress={() => open(null)} />
      ) : (
        <Card style={{ gap: spacing.md }} testID="edit-form">
          <CardHeader title={label(current)} />
          {editedTarget !== undefined ? (
            <AppText variant="label" muted testID="edit-detected">
              {editedTarget}
            </AppText>
          ) : null}
          <Field
            testID="edit-start"
            label={t('sleepx.editStart')}
            value={startText}
            onChangeText={setStartText}
            placeholder="23:15"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
          <Field
            testID="edit-end"
            label={t('sleepx.editEnd')}
            value={endText}
            onChangeText={setEndText}
            placeholder="07:00"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            hint={t('sleepx.editTimeHint')}
          />
          {problem !== null ? (
            <AppText variant="label" color={colors.negative} testID="edit-problem" accessibilityLiveRegion="polite">
              {t(problemKey(problem, current === null || current.source === 'manual'), {
                hours: (current === null || current.source === 'manual' ? sleepEditLimits.napMaxS : sleepEditLimits.sleepMaxS) / HOUR_S,
              })}
            </AppText>
          ) : null}
          <Button testID="edit-save" label={t('common.save')} disabled={busy} onPress={() => void save()} />
          {current !== null && current.editId !== null ? (
            <Button
              testID="edit-revert"
              label={current.source === 'manual' ? t('sleepx.editDeleteNap') : t('sleepx.editRestore')}
              variant="danger"
              disabled={busy}
              onPress={() => void remove(current)}
            />
          ) : null}
          <Button testID="edit-cancel" label={t('common.cancel')} variant="tertiary" disabled={busy} onPress={close} />
        </Card>
      )}

      <Callout title={t('sleepx.editHowTitle')} body={`${t('sleepx.editRecalc')} ${t('sleepx.editPhysio')}`} />
    </Page>
  );
}
