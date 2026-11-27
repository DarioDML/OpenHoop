import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { featureEnabled } from '@/net/features';
import { cleanClient } from '@/strava/api';
import { useStrava } from '@/strava/context';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button, Field } from '@/ui/controls';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { stravaErrorKey } from '@/ui/strava/status';
import { spacing, useTheme } from '@/ui/theme';

const API_SETTINGS_URL = 'https://www.strava.com/settings/api';

export default function StravaSettingsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData } = useAppData();
  const { state, controller } = useStrava();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [invalid, setInvalid] = useState(false);
  const networkOn = featureEnabled(userData.network, 'strava');
  const connected = state.connection === 'connected';
  const uploaded = Object.values(state.ledger).filter((entry) => entry.status === 'done' || entry.status === 'duplicate').length;

  const saveClient = async (): Promise<void> => {
    if (cleanClient(clientId, clientSecret) === null) {
      setInvalid(true);
      return;
    }
    const saved = await controller.saveClient(clientId, clientSecret);
    if (saved) {
      setClientId('');
      setClientSecret('');
    }
  };

  const confirmDisconnect = (): void => {
    Alert.alert(t('strava.disconnectTitle'), t('strava.disconnectBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('strava.disconnect'), style: 'destructive', onPress: () => void controller.disconnect() },
    ]);
  };

  return (
    <SettingsPage title={t('strava.title')} tint="neutral" testID="strava-settings">
      <AppText variant="label" muted>
        {t('strava.intro')}
      </AppText>

      {networkOn ? null : (
        <Card style={{ gap: spacing.sm }} testID="strava-network-off">
          <AppText variant="body" color={colors.warning}>
            {t('strava.networkOff')}
          </AppText>
          <Button label={t('strava.openPrivacy')} variant="secondary" onPress={() => router.push('/settings/privacy')} testID="strava-open-privacy" />
        </Card>
      )}

      {state.error !== null ? (
        <Card tone="outline" testID="strava-error">
          <AppText variant="label" color={colors.negative}>
            {t(stravaErrorKey(state.error))}
          </AppText>
        </Card>
      ) : null}
      {state.revokeFailed ? (
        <Card tone="outline" testID="strava-revoke-failed">
          <AppText variant="label" color={colors.warning}>
            {t('strava.revokeFailed')}
          </AppText>
        </Card>
      ) : null}

      {!state.hasClient ? (
        <Card style={{ gap: spacing.md }} testID="strava-setup">
          <AppText variant="bodyStrong">{t('strava.setupTitle')}</AppText>
          <AppText variant="label" muted>
            {t('strava.setupBody')}
          </AppText>
          <AppText variant="label">{t('strava.setupStep1')}</AppText>
          <AppText variant="label" selectable>
            {t('strava.setupStep2')}
          </AppText>
          <AppText variant="label">{t('strava.setupStep3')}</AppText>
          <Button label={t('strava.openApiPage')} variant="tertiary" onPress={() => void Linking.openURL(API_SETTINGS_URL)} testID="strava-open-api" />
          <Field
            label={t('strava.clientId')}
            value={clientId}
            onChangeText={(value) => {
              setClientId(value);
              setInvalid(false);
            }}
            keyboardType="number-pad"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            maxLength={12}
            testID="strava-client-id"
          />
          <Field
            label={t('strava.clientSecret')}
            value={clientSecret}
            onChangeText={(value) => {
              setClientSecret(value);
              setInvalid(false);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            maxLength={128}
            error={invalid}
            hint={invalid ? t('strava.clientInvalid') : t('strava.clientHint')}
            testID="strava-client-secret"
          />
          <Button
            label={t('strava.saveClient')}
            variant="secondary"
            disabled={clientId.trim() === '' || clientSecret.trim() === '' || state.busy !== null}
            onPress={() => void saveClient()}
            testID="strava-save-client"
          />
        </Card>
      ) : (
        <Card style={{ gap: spacing.md }} testID="strava-connection">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
            <AppText variant="bodyStrong">{t('strava.title')}</AppText>
            <Chip
              small
              label={connected ? t('strava.connected') : state.connection === 'reconnect' ? t('strava.status.reconnect') : t('strava.notConnected')}
              tone={connected ? 'positive' : state.connection === 'reconnect' ? 'warning' : 'neutral'}
              testID="strava-connection-status"
            />
          </View>
          {connected ? (
            <>
              <AppText variant="label" muted testID="strava-uploaded">
                {t('strava.uploaded', { count: uploaded })}
              </AppText>
              <Button
                label={state.busy === 'disconnect' ? t('strava.disconnecting') : t('strava.disconnect')}
                variant="danger"
                disabled={state.busy !== null}
                onPress={confirmDisconnect}
                testID="strava-disconnect"
              />
            </>
          ) : (
            <>
              <AppText variant="label" muted>
                {state.connection === 'reconnect' ? t('strava.reconnectBody') : t('strava.connectBody')}
              </AppText>
              <Button
                label={state.busy === 'connect' ? t('strava.connecting') : state.connection === 'reconnect' ? t('strava.reconnect') : t('strava.connect')}
                disabled={state.busy !== null || !networkOn}
                onPress={() => void controller.connect()}
                testID="strava-connect"
              />
              <Button
                label={t('strava.changeClient')}
                variant="tertiary"
                disabled={state.busy !== null}
                onPress={() => void controller.disconnect()}
                testID="strava-remove-client"
              />
            </>
          )}
        </Card>
      )}
    </SettingsPage>
  );
}
