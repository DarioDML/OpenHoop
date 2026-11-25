import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { parseActivityType } from '@/data/activityDerived';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { NotBuilt } from '@/ui/NotBuilt';
import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';
import { spacing } from '@/ui/theme';

export default function StartActivityScreen() {
  const { t } = useT();
  const params = useLocalSearchParams<{ type?: string }>();
  const type = parseActivityType(params.type);

  return (
    <Screen
      tint="load"
      testID="start-activity"
      header={
        <>
          <Stack.Screen options={{ presentation: 'modal' }} />
          <TopBar title={t('activity.start.title')} close back={false} />
          <View style={{ gap: spacing.xs }}>
            <AppText variant="cap" muted>
              {t('activity.start.chosen')}
            </AppText>
            <AppText variant="h1" testID="start-type">
              {t(`activity.type.${type}`)}
            </AppText>
          </View>
        </>
      }
      footer={<Button label={t('activity.start.begin')} onPress={() => router.replace({ pathname: '/activity/live', params: { type } })} testID="start-begin" />}>
      <Card>
        <AppText variant="cardTitle">{t('activity.start.hr.title')}</AppText>
        <AppText variant="body" muted>
          {t('activity.start.hr.body')}
        </AppText>
      </Card>
      <NotBuilt issue="gps" compact body={t('activity.start.gps')} />
      <NotBuilt issue="activities" compact body={t('activity.start.save')} />
    </Screen>
  );
}
