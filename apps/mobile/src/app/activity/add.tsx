import { router, Stack } from 'expo-router';
import { useState } from 'react';

import { ACTIVITY_TYPES } from '@/data/activityDerived';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Field } from '@/ui/controls';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { NotBuilt } from '@/ui/NotBuilt';
import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';
import { useTheme } from '@/ui/theme';

export default function AddActivityScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = ACTIVITY_TYPES.filter((type) => needle === '' || t(`activity.type.${type}`).toLowerCase().includes(needle));

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
              onPress={() => router.push({ pathname: '/activity/start', params: { type } })}
              chevron
            />
          ))}
        </ListGroup>
      )}
      <NotBuilt issue="activities" compact body={t('activity.add.notBuilt')} />
    </Screen>
  );
}
