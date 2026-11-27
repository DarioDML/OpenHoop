import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatLongDay, formatMinutes, indexOfDay, isDayString, singleParam } from '@/data/dailyDerived';
import { draftTimes, editableSleeps, parseClock, type EditableSleep } from '@/data/sleepEditForm';
import type { SleepEditOutcome } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button, Field, Segmented } from '@/ui/controls';
import { Divider, NoDataPage, Page } from '@/ui/daily/bits';
import { Icon } from '@/ui/Icon';
import { ListRow } from '@/ui/ListGroup';
import { Timeline24, timelineWindow } from '@/ui/sleep/Timeline24';
import { radius, spacing, useTheme } from '@/ui/theme';

const HOUR_S = 3_600;
const NEW_NAP = 'new';
const NAP_START = '14:00';
const NAP_END = '14:30';

type Mode = 'edit' | 'nap';
type Problem = Exclude<SleepEditOutcome, 'saved'> | 'invalid-time';

interface Draft {
  key: string;
  start: string;
  end: string;
}

function problemKey(problem: Problem, manual: boolean): TranslationKey {
  if (problem === 'too-long') return manual ? 'sleepx.problem.too-long-nap' : 'sleepx.problem.too-long-night';
  return `sleepx.problem.${problem}`;
}

export default function EditSleepScreen() {
  const params = useLocalSearchParams<{ day?: string | string[] }>();
  const { days, sleepEdits, sleepEditLimits, saveSleepEdit, deleteSleepEdit, removeDetectedSleep } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const requested = singleParam(params.day);
  const [selected, setSelected] = useState<string | null>(requested === null ? (days[days.length - 1]?.day ?? null) : isDayString(requested) ? requested : null);
  const index = selected === null ? -1 : indexOfDay(days, selected);
  const [mode, setMode] = useState<Mode>('edit');
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [status, setStatus] = useState<TranslationKey | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const day = days[index];
  if (!day) {
    return <NoDataPage title={t('sleepx.edit')} body={requested !== null && !isDayString(requested) ? t('daily.invalidDay') : t('sleepx.noNight')} />;
  }
  const tz = day.tzOffsetS;
  const items = editableSleeps(day, sleepEdits);
  const clock = (epochS: number): string => formatClock(epochS, tz);
  const night = items.find((i) => i.kind === 'night' && !i.removed) ?? items.find((i) => i.removed) ?? null;
  const current: EditableSleep | null = mode === 'nap' ? null : (items.find((i) => i.key === picked) ?? night);
  const key = mode === 'nap' ? NEW_NAP : (current?.key ?? null);
  const startText = draft !== null && draft.key === key ? draft.start : current === null ? NAP_START : clock(current.onset);
  const endText = draft !== null && draft.key === key ? draft.end : current === null ? NAP_END : clock(current.offset);
  const manual = current === null || current.source === 'manual';
  const label = (item: EditableSleep | null): string => (item === null ? t('sleepx.editNewNap') : item.kind === 'night' ? t('sleepx.editNight') : t('sleepx.editNap'));

  const reset = (): void => {
    setDraft(null);
    setProblem(null);
    setConfirming(false);
  };

  const edit = (patch: Partial<Pick<Draft, 'start' | 'end'>>): void => {
    if (key === null) return;
    setDraft({ key, start: patch.start ?? startText, end: patch.end ?? endText });
    setProblem(null);
    setStatus(null);
  };

  const switchMode = (next: Mode): void => {
    setMode(next);
    setPicked(null);
    setStatus(null);
    reset();
  };

  const pick = (item: EditableSleep): void => {
    setMode('edit');
    setPicked(item.key);
    setStatus(null);
    reset();
  };

  const moveDay = (delta: number): void => {
    const next = days[Math.min(days.length - 1, Math.max(0, index + delta))];
    if (next !== undefined) setSelected(next.day);
    setPicked(null);
    setStatus(null);
    reset();
  };

  const save = async (): Promise<void> => {
    if (busy || key === null) return;
    const result = draftTimes(current, day.day, tz, startText, endText);
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    setBusy(true);
    const outcome = await saveSleepEdit({
      id: current?.editId ?? null,
      targetOnset: current === null ? null : current.targetOnset,
      targetOffset: current === null ? null : current.targetOffset,
      onset: result.onset,
      offset: result.offset,
      replaces: current === null ? null : { onset: current.onset, offset: current.offset },
    });
    setBusy(false);
    if (outcome === 'saved') {
      reset();
      setPicked(null);
      if (mode === 'nap') setMode('edit');
      setStatus('sleepx.editSaved');
    } else {
      setProblem(outcome);
    }
  };

  const remove = async (item: EditableSleep): Promise<void> => {
    if (busy) return;
    setBusy(true);
    const done = item.editId === null ? await removeDetectedSleep(item) : await deleteSleepEdit(item.editId);
    setBusy(false);
    if (done) {
      reset();
      setPicked(null);
      setStatus(item.removed ? 'editSleep.restoredStatus' : item.editId === null ? 'editSleep.deletedStatus' : item.source === 'manual' ? 'sleepx.editDeleted' : 'sleepx.editRestored');
    } else {
      setConfirming(false);
      setProblem('error');
    }
  };

  const sourceChip = (item: EditableSleep) =>
    item.removed ? (
      <Chip label={t('editSleep.removedChip')} tone="warning" small />
    ) : item.source === 'detected' ? undefined : (
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

  const editedTarget =
    current !== null && current.source === 'edited' && current.targetOnset !== null && current.targetOffset !== null
      ? t('sleepx.editDetected', { start: clock(current.targetOnset), end: clock(current.targetOffset) })
      : undefined;
  const startMin = parseClock(startText);
  const endMin = parseClock(endText);
  const showEditor = mode === 'nap' || (current !== null && !current.removed);
  const removedNight = current !== null && current.removed ? current : null;

  return (
    <Page
      title={t('sleepx.edit')}
      tint="sleep"
      testID="sleep-edit"
      hero={
        <View style={{ gap: spacing.lg }}>
          <Segmented<Mode>
            testID="edit-mode"
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'edit', label: t('editSleep.modeNight') },
              { value: 'nap', label: t('editSleep.modeNap') },
            ]}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            {dayStep(-1, '‹', t('sleepx.editPrevDay'), index <= 0)}
            <AppText variant="cardTitle" style={{ flex: 1, textAlign: 'center' }} testID="edit-day">
              {formatLongDay(day.day, language)}
            </AppText>
            {dayStep(1, '›', t('sleepx.editNextDay'), index >= days.length - 1)}
          </View>
        </View>
      }>
      {status !== null ? (
        <AppText variant="label" color={colors.positive} testID="edit-status" accessibilityLiveRegion="polite">
          {t(status)}
        </AppText>
      ) : null}

      {showEditor ? (
        <View style={{ gap: spacing.md }} testID="edit-form">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
            <AppText variant="cap" muted>
              {label(current)}
            </AppText>
            {current !== null ? sourceChip(current) : null}
          </View>
          <Timeline24
            testID="edit-timeline"
            start={startMin}
            end={endMin}
            windowStart={timelineWindow(parseClock(current === null ? NAP_START : clock(current.onset)) ?? 0, startMin, endMin)}
            onChange={(start, end) => edit({ start: formatMinutes(start), end: formatMinutes(end) })}
            label={t('editSleep.timelineLabel', { start: startText, end: endText })}
            startLabel={t('editSleep.dragStart')}
            endLabel={t('editSleep.dragEnd')}
          />
          {editedTarget !== undefined ? (
            <AppText variant="label" muted testID="edit-detected">
              {editedTarget}
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field testID="edit-start" label={t('sleepx.editStart')} value={startText} onChangeText={(start) => edit({ start })} placeholder="23:15" keyboardType="numbers-and-punctuation" maxLength={5} />
            </View>
            <View style={{ flex: 1 }}>
              <Field testID="edit-end" label={t('sleepx.editEnd')} value={endText} onChangeText={(end) => edit({ end })} placeholder="07:00" keyboardType="numbers-and-punctuation" maxLength={5} />
            </View>
          </View>
          <AppText variant="caption" muted>
            {t('sleepx.editTimeHint')}
          </AppText>
          {problem !== null ? (
            <AppText variant="label" color={colors.negative} testID="edit-problem" accessibilityLiveRegion="polite">
              {t(problemKey(problem, manual), { hours: (manual ? sleepEditLimits.napMaxS : sleepEditLimits.sleepMaxS) / HOUR_S })}
            </AppText>
          ) : null}
        </View>
      ) : removedNight !== null ? (
        <Card testID="edit-removed" style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
            <AppText variant="cardTitle">{t('editSleep.removedTitle')}</AppText>
            {sourceChip(removedNight)}
          </View>
          <AppText variant="label" muted>
            {t('editSleep.removedBody', { start: clock(removedNight.onset), end: clock(removedNight.offset) })}
          </AppText>
          <Button testID="edit-restore-removed" label={t('editSleep.restore')} variant="soft" icon="sync" disabled={busy} onPress={() => void remove(removedNight)} />
        </Card>
      ) : (
        <Card testID="edit-none">
          <AppText variant="body" muted>
            {t('editSleep.noNight')}
          </AppText>
        </Card>
      )}

      <View accessibilityRole="summary" style={{ flexDirection: 'row', gap: spacing.md, padding: 14, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }} testID="edit-recalc">
        <Icon name="sync" color={colors.textSoft} size={18} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong" color={colors.textSoft}>
            {t('editSleep.recalcTitle')}
          </AppText>
          <AppText variant="label" color={colors.textSoft}>
            {`${t('sleepx.editRecalc')} ${t('sleepx.editPhysio')}`}
          </AppText>
        </View>
      </View>

      {showEditor ? (
        <View style={{ gap: spacing.md }}>
          <Button testID="edit-save" label={t('common.save')} disabled={busy} onPress={() => void save()} />
          {draft !== null && draft.key === key ? <Button testID="edit-cancel" label={t('common.cancel')} variant="tertiary" disabled={busy} onPress={reset} /> : null}
          {current !== null && !confirming ? (
            <Button
              testID="edit-revert"
              label={current.source === 'edited' ? t('sleepx.editRestore') : t('editSleep.delete')}
              variant="danger"
              icon={current.source === 'edited' ? 'sync' : 'trash'}
              disabled={busy}
              onPress={() => setConfirming(true)}
            />
          ) : null}
          {current !== null && confirming ? (
            <Card tone="danger" testID="edit-delete-confirm-card" style={{ gap: spacing.md }}>
              <AppText variant="bodyStrong">{current.source === 'edited' ? t('sleepx.editRestore') : t('editSleep.deleteTitle')}</AppText>
              <AppText variant="label" muted testID="edit-delete-body">
                {current.source === 'manual' ? t('editSleep.deleteNapBody') : current.source === 'edited' ? t('editSleep.deleteEditedBody') : t('editSleep.deleteDetectedBody')}
              </AppText>
              <Button testID="edit-delete-confirm" label={current.source === 'edited' ? t('sleepx.editRestore') : t('editSleep.delete')} variant="danger" disabled={busy} onPress={() => void remove(current)} />
              <Button testID="edit-delete-cancel" label={t('common.cancel')} variant="tertiary" disabled={busy} onPress={() => setConfirming(false)} />
            </Card>
          ) : null}
        </View>
      ) : null}

      {items.length > 0 ? (
        <Card style={{ gap: 0 }} testID="edit-list">
          <CardHeader title={t('editSleep.otherSleeps')} />
          {items.map((item, i) => (
            <View key={item.key}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                testID={`edit-item-${item.key}`}
                title={label(item)}
                subtitle={t('sleepx.editRange', { start: clock(item.onset), end: clock(item.offset), asleep: formatDuration(t, item.asleepS) })}
                right={sourceChip(item)}
                onPress={() => pick(item)}
              />
            </View>
          ))}
        </Card>
      ) : null}

      <AppText variant="caption" muted>
        {t('sleepx.editIntro')}
      </AppText>
    </Page>
  );
}
