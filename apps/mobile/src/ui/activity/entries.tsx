import type { WorkoutRecord } from '@openhoop/core';
import { useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ACTIVITY_TYPES, resolveWorkout } from '@/data/activityDerived';
import { dayOfActivity, entryById, entryForWorkout, parseIdParam, type ActivityEntry, type ActivityForm, type EntryKind, type FormError } from '@/data/activities';
import { useAppData, usePendingDelete } from '@/data/context';
import type { TranslationKey } from '@/i18n';
import { reasonKey } from '@/i18n';
import { useT, type TFunction } from '@/i18n/useT';
import { deviceTzOffsetS } from '@/lib/dates';
import { formatClock, formatDuration, formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { Button, Field } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { radius, spacing, useTheme } from '@/ui/theme';

export function entryTitle(t: TFunction, entry: ActivityEntry): string {
  if (entry.type !== null) return t(`activity.type.${entry.type}`);
  return entry.label ?? t('workout.default');
}

const KIND_LABELS: Record<EntryKind, TranslationKey> = {
  detected: 'workout.auto',
  edited: 'activity.kind.edited',
  manual: 'workout.manual',
  live: 'activity.kind.live',
};

export function kindLabel(t: TFunction, kind: EntryKind): string {
  return t(KIND_LABELS[kind]);
}

export function entryHref(entry: ActivityEntry, day: string, index: number | null): Href {
  if (entry.id !== null) return { pathname: '/activity/details', params: { id: String(entry.id) } };
  return { pathname: '/activity/details', params: { day, index: String(index ?? 0) } };
}

export function loadText(t: TFunction, entry: ActivityEntry, language: 'nl' | 'en'): string | null {
  if (!entry.hasLoad) return null;
  if (entry.metrics.load !== null) return t('activity.load.value', { value: formatNumber(entry.metrics.load, 1, language) });
  return t(reasonKey(entry.metrics.loadReason));
}

interface EntryRowProps {
  entry: ActivityEntry;
  href: Href;
  tzOffsetS: number;
  testID?: string;
}

export function EntryRow({ entry, href, tzOffsetS, testID }: EntryRowProps) {
  const { colors } = useTheme();
  const { t, language } = useT();
  const title = entryTitle(t, entry);
  const stats =
    entry.metrics.avgHr !== null && entry.metrics.maxHr !== null
      ? t('load.workoutStats', { avg: Math.round(entry.metrics.avgHr), max: Math.round(entry.metrics.maxHr) })
      : t('activity.noHr');
  const load = loadText(t, entry, language);
  return (
    <Card href={href} accessibilityLabel={title} testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="pulse" color={colors.accent} size={20} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="label" muted numeric>
          {formatClock(entry.start, tzOffsetS)}–{formatClock(entry.end, tzOffsetS)} · {formatDuration(t, entry.metrics.activeS)}
        </AppText>
        <AppText variant="caption" muted numeric>
          {[stats, load, kindLabel(t, entry.kind)].filter((part): part is string => part !== null).join(' · ')}
        </AppText>
      </View>
      <Icon name="chevronRight" color={colors.textMuted} size={18} />
    </Card>
  );
}

export function UndoBar() {
  const { undoDelete } = useAppData();
  const pendingDelete = usePendingDelete();
  const { t } = useT();
  const { colors } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (pendingDelete === null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [pendingDelete]);
  if (pendingDelete === null) return null;
  const seconds = Math.max(0, Math.ceil((pendingDelete.until - now) / 1000));
  return (
    <Card testID="undo-bar" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceAlt }}>
      <AppText variant="body" style={{ flex: 1 }} accessibilityLiveRegion="polite">
        {t('activity.deleted', { seconds })}
      </AppText>
      <Button label={t('activity.undo')} variant="tertiary" onPress={() => void undoDelete()} testID="undo-delete" />
    </Card>
  );
}

const FORM_ERRORS: Record<FormError, TranslationKey> = {
  type: 'activity.form.error.type',
  date: 'activity.form.error.date',
  start: 'activity.form.error.start',
  end: 'activity.form.error.end',
  endBeforeStart: 'activity.form.error.endBeforeStart',
  future: 'activity.form.error.future',
  tooShort: 'activity.form.error.tooShort',
  tooLong: 'activity.form.error.tooLong',
  note: 'activity.form.error.note',
};

interface FormProps {
  form: ActivityForm;
  onChange: (form: ActivityForm) => void;
  error: FormError | null;
  showType?: boolean;
  beforeTimes?: ReactNode;
}

export function ActivityFormFields({ form, onChange, error, showType = true, beforeTimes }: FormProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const set = (patch: Partial<ActivityForm>): void => onChange({ ...form, ...patch });
  const timeError = error === 'start' || error === 'end' || error === 'endBeforeStart' || error === 'future' || error === 'tooShort' || error === 'tooLong';
  return (
    <View style={{ gap: spacing.md }}>
      {showType ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="capSmall" muted>
            {t('activity.edit.type')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {ACTIVITY_TYPES.map((type) => (
              <Pill key={type} label={t(`activity.type.${type}`)} selected={form.type === type} onPress={() => set({ type })} testID={`form-type-${type}`} />
            ))}
          </View>
        </View>
      ) : null}
      <Field
        label={t('activity.form.date')}
        value={form.date}
        onChangeText={(date) => set({ date })}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        autoCorrect={false}
        error={error === 'date'}
        testID="form-date"
      />
      {beforeTimes}
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('activity.edit.start')}
            value={form.startTime}
            onChangeText={(startTime) => set({ startTime })}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            error={timeError && error !== 'end'}
            testID="form-start"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t('activity.edit.end')}
            value={form.endTime}
            onChangeText={(endTime) => set({ endTime })}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            error={timeError && error !== 'start'}
            testID="form-end"
          />
        </View>
      </View>
      <Field
        label={t('activity.form.note')}
        value={form.note}
        onChangeText={(note) => set({ note })}
        multiline
        maxLength={500}
        error={error === 'note'}
        testID="form-note"
      />
      {error !== null ? (
        <AppText variant="label" color={colors.negative} testID="form-error">
          {t(FORM_ERRORS[error])}
        </AppText>
      ) : (
        <AppText variant="caption" muted>
          {t('activity.form.hint')}
        </AppText>
      )}
    </View>
  );
}

export interface ResolvedEntry {
  entry: ActivityEntry;
  workout: WorkoutRecord | null;
  tzOffsetS: number;
  query: Record<string, string>;
}

export function useResolvedEntry(): ResolvedEntry | null {
  const { days, activities } = useAppData();
  const params = useLocalSearchParams<{ id?: string; day?: string; index?: string }>();
  const id = parseIdParam(params.id);
  if (id !== null) {
    const entry = entryById(activities, id);
    if (entry === null) return null;
    const tzOffsetS = dayOfActivity(days, entry.start)?.tzOffsetS ?? deviceTzOffsetS(new Date(entry.start * 1000));
    return { entry, workout: null, tzOffsetS, query: { id: String(id) } };
  }
  const ref = resolveWorkout(days, params.day, params.index);
  if (ref === null) return null;
  const entry = entryForWorkout(activities, ref.workout);
  if (entry === null) return null;
  const query: Record<string, string> = entry.id === null ? { day: ref.day.day, index: String(ref.index) } : { id: String(entry.id) };
  return { entry, workout: ref.workout, tzOffsetS: ref.day.tzOffsetS, query };
}
