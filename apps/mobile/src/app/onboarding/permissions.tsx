import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { HC_ONBOARDING_TYPES } from '@/data/healthConnectSwitch';
import { isGranted } from '@/data/healthConnectSync';
import { useT } from '@/i18n/useT';
import { HC_EXPORT_TYPES } from '@/lib/healthConnectMapping';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/Chip';
import { Button, Toggle } from '@/ui/controls';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { useLocationSwitch } from '@/ui/manage/locationSwitch';
import { useNotificationSwitch } from '@/ui/manage/notificationSwitch';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { tile } from '@/ui/manage/tiles';
import { spacing, useTheme } from '@/ui/theme';

export default function PermissionsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const notifications = useNotificationSwitch();
  const location = useLocationSwitch();
  const { healthConnect, refreshHealthConnect, setHealthConnectTypes, setHealthConnectAfterSync, installHealthConnect, openHealthConnectSettings } = useAppData();
  const [hcBusy, setHcBusy] = useState(false);
  const [hcDenied, setHcDenied] = useState(false);

  useEffect(() => {
    void refreshHealthConnect();
  }, [refreshHealthConnect]);

  const { availability, state } = healthConnect;
  const granted = new Set(healthConnect.granted);
  const exportOn = HC_EXPORT_TYPES.some((type) => state.export[type]);
  const missing = availability === 'available' ? HC_EXPORT_TYPES.filter((type) => state.export[type] && !isGranted(granted, type)) : [];
  const needsInstall = availability === 'not-installed' || availability === 'update-required';

  const switchHealthConnect = async (next: boolean): Promise<void> => {
    setHcDenied(false);
    if (!next) {
      await setHealthConnectTypes(HC_EXPORT_TYPES, false);
      return;
    }
    const on = await setHealthConnectTypes(HC_ONBOARDING_TYPES, true);
    if (on.length === 0) {
      setHcDenied(true);
      return;
    }
    if (!state.afterBandSync) await setHealthConnectAfterSync(true);
  };

  const toggleHealthConnect = (next: boolean): void => {
    setHcBusy(true);
    void switchHealthConnect(next).finally(() => setHcBusy(false));
  };

  const hcSubtitle =
    availability === 'unsupported'
      ? t('hc.androidOnlyBody')
      : availability === 'not-installed'
        ? t('hc.notInstalled')
        : availability === 'update-required'
          ? t('hc.updateRequired')
          : t('onboarding.permissions.healthConnectBody');

  const hcRight =
    availability === 'unsupported' ? (
      <Chip label={t('appSettings.integrations.androidOnly')} />
    ) : needsInstall ? null : (
      <Toggle
        value={exportOn}
        onChange={toggleHealthConnect}
        disabled={hcBusy || availability === 'checking'}
        label={t('onboarding.permissions.healthConnect')}
        testID="permission-health-connect-toggle"
      />
    );

  return (
    <OnboardingPage
      screen="permissions"
      title={t('onboarding.permissions.title')}
      subtitle={t('onboarding.permissions.subtitle')}
      primary={{ label: t('common.continue'), onPress: () => router.push('/onboarding/official-app') }}>
      <ListGroup>
        <ListRow
          icon={tile(colors, 'bluetooth', 'info')}
          title={t('onboarding.permissions.bluetooth')}
          subtitle={t('onboarding.permissions.bluetoothBody')}
          right={<Chip label={t('onboarding.permissions.required')} tone="info" />}
          chevron={false}
          testID="permission-bluetooth"
        />
        <ListRow
          icon={tile(colors, 'bell')}
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
          icon={tile(colors, 'health', 'positive')}
          title={t('onboarding.permissions.healthConnect')}
          subtitle={hcSubtitle}
          right={hcRight}
          chevron={false}
          testID="permission-health-connect"
        />
        <ListRow
          icon={tile(colors, 'pin')}
          title={t('onboarding.permissions.location')}
          subtitle={t('onboarding.permissions.locationBody')}
          right={
            <Toggle
              value={location.granted}
              onChange={location.toggle}
              disabled={location.busy}
              label={t('onboarding.permissions.location')}
              testID="permission-location-toggle"
            />
          }
          chevron={false}
          testID="permission-location"
        />
      </ListGroup>
      {notifications.blocked ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" color={colors.warning} testID="permission-notifications-blocked">
            {t('onboarding.permissions.notificationsBlocked')}
          </AppText>
          <Button variant="tertiary" label={t('appSettings.openSystemSettings')} onPress={notifications.openSettings} />
        </View>
      ) : null}
      {needsInstall ? (
        <Button
          variant="secondary"
          label={availability === 'update-required' ? t('hc.update') : t('hc.install')}
          onPress={() => void installHealthConnect()}
          testID="permission-health-connect-install"
        />
      ) : null}
      {availability === 'available' ? (
        <AppText variant="caption" muted testID="permission-health-connect-when">
          {exportOn && !state.afterBandSync ? t('onboarding.permissions.healthConnectManual') : t('onboarding.permissions.healthConnectWhen')}
        </AppText>
      ) : null}
      {hcDenied ? (
        <AppText variant="label" color={colors.warning} testID="permission-health-connect-denied">
          {t('onboarding.permissions.healthConnectDenied')}
        </AppText>
      ) : null}
      {exportOn && missing.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" color={colors.warning} testID="permission-health-connect-missing">
            {t('onboarding.permissions.healthConnectMissing')}
          </AppText>
          <Button variant="tertiary" label={t('hc.manage')} onPress={openHealthConnectSettings} />
        </View>
      ) : null}
      {location.blocked ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" color={colors.warning} testID="permission-location-blocked">
            {t('onboarding.permissions.locationBlocked')}
          </AppText>
          <Button variant="tertiary" label={t('appSettings.openSystemSettings')} onPress={location.openSettings} />
        </View>
      ) : location.granted ? (
        <AppText variant="caption" muted testID="permission-location-revoke">
          {t('onboarding.permissions.locationRevoke')}
        </AppText>
      ) : null}
    </OnboardingPage>
  );
}
