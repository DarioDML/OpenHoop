import { router } from 'expo-router';
import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { Page } from '@/ui/daily/bits';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { NotBuilt } from '@/ui/NotBuilt';
import { spacing, useTheme } from '@/ui/theme';

export default function NotificationsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <Page title={t('home.notifications')} testID="notifications">
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {(['all', 'insights', 'device', 'goals'] as const).map((filter) => (
          <Pill key={filter} label={t(`home.notif.${filter}`)} selected={filter === 'all'} onPress={() => undefined} />
        ))}
      </View>
      <NotBuilt issue="notifications" />
      <Card tone="outline" style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name="bell" color={colors.textMuted} size={18} />
          <AppText variant="bodyStrong">{t('home.notif.quietTitle')}</AppText>
        </View>
        <AppText variant="label" muted>
          {t('home.notif.quietBody')}
        </AppText>
      </Card>
      <ListGroup>
        <ListRow title={t('home.notif.settings')} onPress={() => router.push('/settings/app')} />
      </ListGroup>
    </Page>
  );
}
