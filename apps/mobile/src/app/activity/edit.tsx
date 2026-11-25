import type { ActivitySource } from '@openhoop/core';
import { router, Stack } from 'expo-router';
import { useState } from 'react';

import { formFor, keepSeconds, validateActivityForm, type ActivityEntry, type ActivityForm, type EntryKind, type FormError } from '@/data/activities';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatShortDay } from '@/lib/format';
import { unixToIsoDate } from '@/lib/dates';
import { ActivityFormFields, entryTitle, useResolvedEntry, type ResolvedEntry } from '@/ui/activity/entries';
import { NoDataScreen } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';
import { useTheme } from '@/ui/theme';

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
  const [error, setError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const close = (): void => {
    if (router.canGoBack()) router.back();
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
          <TopBar title={t('activity.edit.title')} close back={false} />
        </>
      }
      footer={<Button label={t('activity.form.save')} onPress={() => void save()} disabled={busy} testID="edit-save" />}>
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
      <ActivityFormFields form={form} onChange={setForm} error={error} />
      {failed ? (
        <AppText variant="label" color={colors.negative} testID="edit-failed">
          {notice === null ? t('activity.form.failed') : t(notice.key, notice.params)}
        </AppText>
      ) : null}
      <Button label={t('activity.delete')} variant="danger" disabled={busy} onPress={() => void remove()} testID="edit-delete" />
    </Screen>
  );
}
