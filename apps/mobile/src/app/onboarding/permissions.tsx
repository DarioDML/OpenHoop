import { router } from 'expo-router';

import { useT } from '@/i18n/useT';
import { Chip } from '@/ui/Chip';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { tile } from '@/ui/manage/tiles';
import { NotBuilt } from '@/ui/NotBuilt';
import { useTheme } from '@/ui/theme';

export default function PermissionsScreen() {
  const { t } = useT();
  const { colors } = useTheme();

  return (
    <OnboardingPage
      step={5}
      title={t('onboarding.permissions.title')}
      subtitle={t('onboarding.permissions.subtitle')}
      primary={{ label: t('common.continue'), onPress: () => router.push('/onboarding/official-app') }}>
      <ListGroup>
        <ListRow
          icon={tile(colors, 'bluetooth', 'info')}
          title={t('onboarding.permissions.bluetooth')}
          subtitle={t('onboarding.permissions.bluetoothBody')}
          right={<Chip label={t('onboarding.permissions.required')} tone="info" small />}
          chevron={false}
          testID="permission-bluetooth"
        />
        <ListRow
          icon={tile(colors, 'bell', 'purple')}
          title={t('onboarding.permissions.notifications')}
          subtitle={t('onboarding.permissions.notificationsBody')}
          right={<Chip label={t('onboarding.permissions.optional')} small />}
          chevron={false}
        />
        <ListRow
          icon={tile(colors, 'map', 'positive')}
          title={t('onboarding.permissions.location')}
          subtitle={t('onboarding.permissions.locationBody')}
          right={<Chip label={t('onboarding.permissions.optional')} small />}
          chevron={false}
        />
      </ListGroup>
      <NotBuilt issue="notifications" compact body={t('onboarding.permissions.notBuilt')} />
    </OnboardingPage>
  );
}
