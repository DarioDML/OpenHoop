import type { ActivitySource } from '@openhoop/core';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ACTIVITY_TYPES } from '@/data/activityDerived';
import {
  DELETE_UNDO_MS,
  formFor,
  formRange,
  keepSeconds,
  rangeWindow,
  toActivityType,
  validateActivityForm,
  withRange,
  type ActivityEntry,
  type ActivityForm,
  type EntryKind,
  type FormError,
  type RangeWindow,
  type TimeRange,
} from '@/data/activities';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatShortDay } from '@/lib/format';
import { unixToIsoDate } from '@/lib/dates';
import { ActivityGlyph } from '@/ui/activity/ActivityGlyph';
import { ActivityFormFields, entryTitle, useResolvedEntry, type ResolvedEntry } from '@/ui/activity/entries';
import { NoDataScreen } from '@/ui/activity/parts';
import { TimeRangeSlider } from '@/ui/activity/TimeRangeSlider';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

const SOURCE_OF: Record<EntryKind, ActivitySource> = { detected: 'auto', edited: 'auto', manual: 'manual', live: 'live' };

export default function EditActivityScreen() {
  const { t } = useT();
  const resolved = useResolvedEntry();
  if (resolved === null) return <NoDataScreen title={t('activity.edit.title')} notFound />;
  return <EditForm resolved={resolved} key={resolved.entry.key} />;
}

function initialForm(entry: ActivityEntry, tzOffsetS: number): ActivityForm {
  return formFor(entry.type ?? 'other', entry.start, entry.end, entry.note, tzOffsetS);
}

function EditForm({ resolved }: { resolved: ResolvedEntry }) {
  const { activities, saveActivity, deleteActivity, notice } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const { entry, workout, tzOffsetS } = resolved;
  const [form, setForm] = useState<ActivityForm>(() => initialForm(entry, tzOffsetS));
  const [frame, setFrame] = useState<RangeWindow>(() => rangeWindow({ start: entry.start, end: entry.end }, tzOffsetS));
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const range = formRange(form, tzOffsetS);
  const type = toActivityType(form.type);

  const close = (): void => {
    if (router.canGoBack()) router.back();
  };

  const onFields = (next: ActivityForm): void => {
    setForm(next);
    const typed = formRange(next, tzOffsetS);
    if (typed !== null && (typed.start < frame.from || typed.end > frame.to)) setFrame(rangeWindow(typed, tzOffsetS));
  };

  const onSlide = (next: TimeRange): void => {
    setForm((current) => withRange(current, next, tzOffsetS));
    setError(null);
  };

  const save = async (): Promise<void> => {
    const result = validateActivityForm(form, Math.floor(Date.now() / 1000), tzOffsetS);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setBusy(true);
    setFailed(false);
    const row = entry.id === null ? undefined : activities.find((r) => r.id === entry.id);
    const times = keepSeconds(entry, result.value);
    const id = await saveActivity(
      {
        source: SOURCE_OF[entry.kind],
        detectedStart: entry.detectedStart,
        type: result.value.type,
        start: times.start,
        end: times.end,
        paused: row?.paused ?? [],
        note: result.value.note,
      },
      entry.id ?? undefined,
    );
    setBusy(false);
    if (id === null) setFailed(true);
    else close();
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    const ok =
      entry.id !== null
        ? await deleteActivity({ kind: 'activity', id: entry.id })
        : workout !== null
          ? await deleteActivity({ kind: 'detected', workout })
          : false;
    setBusy(false);
    if (ok) close();
    else setFailed(true);
  };

  const day = unixToIsoDate(entry.start, tzOffsetS);

  return (
    <Screen
      tint="load"
      testID="edit-activity"
      header={
        <>
          <Stack.Screen options={{ presentation: 'modal' }} />
          <TopBar title={t('activity.edit.title')} />
        </>
      }>
      <Card>
        <AppText variant="cardTitle">{entryTitle(t, entry)}</AppText>
        <AppText variant="label" muted numeric>
          {formatShortDay(day, language)} · {formatClock(entry.start, tzOffsetS)}–{formatClock(entry.end, tzOffsetS)} · {formatDuration(t, entry.metrics.activeS)}
        </AppText>
        {entry.kind === 'detected' || entry.kind === 'edited' ? (
          <AppText variant="caption" muted testID="edit-detected-note">
            {t('activity.edit.detectedNote')}
          </AppText>
        ) : null}
      </Card>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('activity.edit.typeRow')}, ${t(`activity.type.${type}`)}`}
        accessibilityState={{ expanded: picking }}
        onPress={() => setPicking((open) => !open)}
        testID="edit-type-row"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: 68,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          opacity: pressed ? 0.85 : 1,
        })}>
        <ActivityGlyph type={type} size={40} />
        <View style={{ flex: 1, gap: 3 }}>
          <AppText variant="body" style={{ fontWeight: '500' }}>
            {t('activity.edit.typeRow')}
          </AppText>
          <AppText variant="label" muted testID="edit-type-value">
            {t(`activity.type.${type}`)}
          </AppText>
        </View>
        <Icon name={picking ? 'chevronDown' : 'chevronRight'} color={colors.textMuted} size={20} />
      </Pressable>
      {picking ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {ACTIVITY_TYPES.map((option) => (
            <Pill
              key={option}
              label={t(`activity.type.${option}`)}
              selected={form.type === option}
              onPress={() => {
                setForm((current) => ({ ...current, type: option }));
                setPicking(false);
              }}
              testID={`form-type-${option}`}
            />
          ))}
        </View>
      ) : null}

      <AppText variant="capLarge" muted style={{ marginTop: spacing.sm }}>
        {t('activity.edit.time')}
      </AppText>
      <ActivityFormFields
        form={form}
        onChange={onFields}
        error={error}
        showType={false}
        beforeTimes={
          range === null ? (
            <AppText variant="caption" muted testID="edit-slider-off">
              {t('activity.edit.sliderNeedsTimes')}
            </AppText>
          ) : (
            <TimeRangeSlider range={range} frame={frame} maxS={Math.floor(Date.now() / 1000)} tzOffsetS={tzOffsetS} onChange={onSlide} testID="edit-slider" />
          )
        }
      />
      {failed ? (
        <AppText variant="label" color={colors.negative} testID="edit-failed">
          {notice === null ? t('activity.form.failed') : t(notice.key, notice.params)}
        </AppText>
      ) : null}
      <Button label={t('activity.edit.save')} onPress={() => void save()} disabled={busy} testID="edit-save" />
      <Button label={t('activity.delete')} icon="trash" variant="danger" disabled={busy} onPress={() => void remove()} testID="edit-delete" />
      <AppText variant="label" muted testID="edit-delete-hint">
        {t('activity.edit.deleteHint', { seconds: DELETE_UNDO_MS / 1000 })}
      </AppText>
    </Screen>
  );
}
