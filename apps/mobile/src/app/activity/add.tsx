import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ACTIVITY_TYPES, type ActivityType } from '@/data/activityDerived';
import { defaultForm, matchesActivitySearch, recentActivityTypes, toActivityType, validateActivityForm, type ActivityForm, type FormError } from '@/data/activities';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS } from '@/lib/dates';
import { ActivityGlyph } from '@/ui/activity/ActivityGlyph';
import { ActivityTypeGrid, RecentActivityRow } from '@/ui/activity/ActivityTypeGrid';
import { ActivityFormFields } from '@/ui/activity/entries';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { Screen } from '@/ui/Screen';
import { SearchField } from '@/ui/SearchField';
import { TopBar } from '@/ui/TopBar';
import { spacing, useTheme } from '@/ui/theme';

export default function AddActivityScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { saveActivity, notice, activities } = useAppData();
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<ActivityForm | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const searching = query.trim() !== '';
  const shown = ACTIVITY_TYPES.filter((type) => matchesActivitySearch(t(`activity.type.${type}`), query));
  const recent = recentActivityTypes(activities);

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <ActivityGlyph type={toActivityType(form.type)} size={48} />
              <AppText variant="title" testID="add-form-type">
                {t(`activity.type.${toActivityType(form.type)}`)}
              </AppText>
            </View>
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
          <SearchField label={t('activity.add.search')} value={query} onChangeText={setQuery} testID="activity-search" />
        </>
      }>
      <AppText variant="label" muted>
        {t('activity.add.intro')}
      </AppText>
      {searching ? null : (
        <View style={{ gap: spacing.md }}>
          <AppText variant="capLarge" muted>
            {t('activity.add.recent')}
          </AppText>
          {recent.length > 0 ? (
            <RecentActivityRow types={recent} onChoose={choose} />
          ) : (
            <AppText variant="label" muted testID="activity-recent-none">
              {t('activity.add.recentNone')}
            </AppText>
          )}
        </View>
      )}
      <AppText variant="capLarge" muted style={{ marginTop: spacing.sm }}>
        {t('activity.add.all')}
      </AppText>
      {shown.length === 0 ? (
        <AppText variant="body" muted testID="activity-none">
          {t('activity.add.none')}
        </AppText>
      ) : (
        <ActivityTypeGrid types={shown} onChoose={choose} testIDPrefix="activity-type" />
      )}
    </Screen>
  );
}
