import { router } from 'expo-router';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/Chip';
import { Button, Toggle } from '@/ui/controls';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { useNotificationSwitch } from '@/ui/manage/notificationSwitch';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { tile } from '@/ui/manage/tiles';
import { useTheme } from '@/ui/theme';

export default function PermissionsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const notifications = useNotificationSwitch();

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
          right={
            <Toggle
              value={notifications.enabled}
              onChange={notifications.toggle}
              disabled={notifications.busy}
              label={t('onboarding.permissions.notifications')}
              testID="permission-notifications-toggle"
            />
          }
          chevron={false}
          testID="permission-notifications"
        />
        <ListRow
          icon={tile(colors, 'map', 'positive')}
          title={t('onboarding.permissions.location')}
          subtitle={t('onboarding.permissions.locationBody')}
          right={<Chip label={t('onboarding.permissions.optional')} small />}
          chevron={false}
        />
      </ListGroup>
      {notifications.blocked ? (
        <>
          <AppText variant="label" color={colors.warning} testID="permission-notifications-blocked">
            {t('onboarding.permissions.notificationsBlocked')}
          </AppText>
          <Button variant="tertiary" label={t('appSettings.openSystemSettings')} onPress={notifications.openSettings} />
        </>
      ) : null}
    </OnboardingPage>
  );
}
