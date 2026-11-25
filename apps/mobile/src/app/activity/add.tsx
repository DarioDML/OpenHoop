import { router, Stack } from 'expo-router';
import { useState } from 'react';

import { ACTIVITY_TYPES, type ActivityType } from '@/data/activityDerived';
import { defaultForm, validateActivityForm, type ActivityForm, type FormError } from '@/data/activities';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS } from '@/lib/dates';
import { ActivityFormFields } from '@/ui/activity/entries';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field } from '@/ui/controls';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';
import { useTheme } from '@/ui/theme';

export default function AddActivityScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { saveActivity, notice } = useAppData();
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<ActivityForm | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const needle = query.trim().toLowerCase();
  const shown = ACTIVITY_TYPES.filter((type) => needle === '' || t(`activity.type.${type}`).toLowerCase().includes(needle));

  const choose = (type: ActivityType): void => {
    setForm(defaultForm(type, Math.floor(Date.now() / 1000), deviceTzOffsetS(new Date())));
    setError(null);
  };

  const save = async (): Promise<void> => {
    if (form === null) return;
    const result = validateActivityForm(form, Math.floor(Date.now() / 1000), deviceTzOffsetS(new Date()));
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setSaving(true);
    setFailed(false);
    const id = await saveActivity({ source: 'manual', detectedStart: null, type: result.value.type, start: result.value.start, end: result.value.end, paused: [], note: result.value.note });
    setSaving(false);
    if (id === null) {
      setFailed(true);
      return;
    }
    router.replace({ pathname: '/activity/details', params: { id: String(id) } });
  };

  if (form !== null) {
    return (
      <Screen
        tint="load"
        testID="add-activity-form"
        header={
          <>
            <Stack.Screen options={{ presentation: 'modal' }} />
            <TopBar title={t('activity.add.title')} close back={false} />
          </>
        }
        footer={<Button label={t('activity.form.save')} onPress={() => void save()} disabled={saving} testID="form-save" />}>
        <AppText variant="label" muted>
          {t('activity.add.formIntro')}
        </AppText>
        <ActivityFormFields form={form} onChange={setForm} error={error} />
        {failed ? (
          <AppText variant="label" color={colors.negative} testID="form-failed">
            {notice === null ? t('activity.form.failed') : t(notice.key, notice.params)}
          </AppText>
        ) : null}
        <Card tone="outline">
          <AppText variant="label" muted>
            {t('activity.add.hrNote')}
          </AppText>
        </Card>
        <Button label={t('activity.add.startInstead')} variant="tertiary" onPress={() => router.replace({ pathname: '/activity/start', params: { type: form.type } })} testID="add-start-instead" />
      </Screen>
    );
  }

  return (
    <Screen
      tint="load"
      testID="add-activity"
      header={
        <>
          <Stack.Screen options={{ presentation: 'modal' }} />
          <TopBar title={t('activity.add.title')} close back={false} />
          <Field label={t('activity.add.search')} value={query} onChangeText={setQuery} autoCapitalize="none" testID="activity-search" />
        </>
      }>
      <AppText variant="label" muted>
        {t('activity.add.intro')}
      </AppText>
      {shown.length === 0 ? (
        <AppText variant="body" muted testID="activity-none">
          {t('activity.add.none')}
        </AppText>
      ) : (
        <ListGroup title={t('activity.add.all')}>
          {shown.map((type) => (
            <ListRow
              key={type}
              testID={`activity-type-${type}`}
              title={t(`activity.type.${type}`)}
              icon={{ icon: 'pulse', color: colors.accent, background: colors.accentSoft }}
              onPress={() => choose(type)}
              chevron
            />
          ))}
        </ListGroup>
      )}
    </Screen>
  );
}
