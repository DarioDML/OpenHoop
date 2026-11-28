import { useEffect } from 'react';
import { View } from 'react-native';

import { ACTIVITY_TYPES } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { HC_EXPORT_TYPES, HC_IMPORT_TYPES } from '@/lib/healthConnectMapping';
import { isIos } from '@/lib/platform';
import { featureEnabled } from '@/net/features';
import { AUTO_SHARE_MODES, toggleType, withMode, type AutoShareMode } from '@/strava/autoShare';
import { useStrava } from '@/strava/context';
import { AppText } from '@/ui/AppText';
import { Chip, Pill } from '@/ui/Chip';
import { Segmented } from '@/ui/controls';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { HealthConnectPanel } from '@/ui/manage/HealthConnectPanel';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { stravaStatus } from '@/ui/strava/status';
import { spacing, useTheme } from '@/ui/theme';

const MODE_LABEL = { all: 'strava.autoShare.all', byType: 'strava.autoShare.byType', manual: 'strava.autoShare.manual' } as const;

export default function IntegrationsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { healthConnect, refreshHealthConnect, userData, updateUserData } = useAppData();
  const strava = useStrava();
  useEffect(() => {
    void refreshHealthConnect();
  }, [refreshHealthConnect]);
  const ios = isIos();
  const { state, availability } = healthConnect;
  const stravaState = stravaStatus(strava.state, featureEnabled(userData.network, 'strava'));
  const autoShare = userData.stravaAutoShare;
  const stravaChip = (
    <Chip
      small
      label={t(`strava.status.${stravaState}`)}
      tone={stravaState === 'connected' ? 'positive' : stravaState === 'reconnect' ? 'warning' : 'neutral'}
      testID="strava-status"
    />
  );
  const onOff = (on: boolean, testID: string) => (
    <Chip label={on ? t('appSettings.integrations.on') : t('appSettings.integrations.off')} tone={on ? 'positive' : 'neutral'} small testID={testID} />
  );
  const notBuilt = (testID: string) => <Chip label={t('appSettings.integrations.notBuilt')} tone="pink" small testID={testID} />;
  const hcOn = HC_EXPORT_TYPES.some((type) => state.export[type]) || HC_IMPORT_TYPES.some((type) => state.import[type]);
  const hcStatus = availability === 'unsupported' ? <Chip label={t('appSettings.integrations.androidOnly')} small testID="hc-status" /> : onOff(hcOn, 'hc-status');
  const scaleOn = availability !== 'unsupported' && state.import.weight;
  const autoShareRow =
    autoShare.mode === 'all'
      ? t('strava.autoShare.rowAll')
      : autoShare.mode === 'byType'
        ? autoShare.types.length === 0
          ? t('strava.autoShare.rowNoTypes')
          : t('strava.autoShare.rowTypes', { types: autoShare.types.map((type) => t(`activity.type.${type}`)).join(', ') })
        : t('strava.autoShare.rowManual');
  const setMode = (mode: AutoShareMode): void => {
    void updateUserData({ stravaAutoShare: withMode(autoShare, mode, Math.floor(Date.now() / 1000)) });
  };

  return (
    <SettingsPage title={t('appSettings.integrations')} tint="neutral" notice testID="integrations">
      <ListGroup>
        {ios ? (
          <ListRow
            icon={tile(colors, 'heart', 'pink')}
            title={t('appSettings.integrations.appleHealth')}
            subtitle={t('appSettings.integrations.appleHealthBody')}
            right={notBuilt('apple-health-status')}
            chevron={false}
            testID="apple-health-row"
          />
        ) : (
          <ListRow
            icon={tile(colors, 'heart', 'positive')}
            title={t('appSettings.integrations.healthConnect')}
            subtitle={t('appSettings.integrations.healthConnectBody')}
            right={hcStatus}
            chevron={false}
            testID="hc-row"
          />
        )}
        <ListRow
          icon={tile(colors, 'load', 'warning')}
          title={t('appSettings.integrations.strava')}
          subtitle={autoShareRow}
          right={stravaChip}
          href="/settings/strava"
          testID="strava-row"
        />
        <ListRow
          icon={tile(colors, 'report', 'plain')}
          title={t('appSettings.integrations.scale')}
          subtitle={ios ? t('appSettings.integrations.scaleIos') : t('appSettings.integrations.scaleBody')}
          right={ios ? notBuilt('scale-status') : onOff(scaleOn, 'scale-status')}
          chevron={false}
          testID="scale-row"
        />
      </ListGroup>

      <CapHeader title={t('strava.autoShare.title')} />
      <Segmented<AutoShareMode>
        testID="auto-share-mode"
        value={autoShare.mode}
        onChange={setMode}
        options={AUTO_SHARE_MODES.map((mode) => ({ value: mode, label: t(MODE_LABEL[mode]) }))}
      />
      {autoShare.mode === 'byType' ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="capSmall" muted>
            {t('strava.autoShare.typesLabel')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {ACTIVITY_TYPES.map((type) => (
              <Pill
                key={type}
                label={t(`activity.type.${type}`)}
                selected={autoShare.types.includes(type)}
                onPress={() => void updateUserData({ stravaAutoShare: toggleType(autoShare, type) })}
                testID={`auto-share-type-${type}`}
              />
            ))}
          </View>
        </View>
      ) : null}
      <AppText variant="caption" muted testID="auto-share-body">
        {autoShare.mode === 'manual' ? t('strava.autoShare.manualBody') : t('strava.autoShare.body')}
      </AppText>
      {autoShare.mode !== 'manual' && stravaState !== 'connected' ? (
        <AppText variant="caption" color={colors.warning} testID="auto-share-needs-connection">
          {t('strava.autoShare.needsConnection')}
        </AppText>
      ) : null}

      <CapHeader title={t('appSettings.integrations.importSection')} />
      <ListGroup>
        <ListRow
          icon={tile(colors, 'export', 'plain')}
          title={t('appSettings.integrations.importFile')}
          subtitle={t('appSettings.integrations.importFileBody')}
          href="/settings/import"
          testID="import-row"
        />
        {ios ? (
          <ListRow
            icon={tile(colors, 'export', 'plain')}
            title={t('appSettings.integrations.appleExport')}
            subtitle={t('appSettings.integrations.appleExportBody')}
            right={notBuilt('apple-export-status')}
            chevron={false}
            testID="apple-export-row"
          />
        ) : null}
      </ListGroup>

      <ListGroup>
        <ListRow
          icon={tile(colors, 'plug', 'plain')}
          title={t('appSettings.integrations.providers')}
          subtitle={t('appSettings.integrations.providersBody')}
          href="/settings/connect-provider"
          testID="providers-row"
        />
      </ListGroup>

      {ios ? null : (
        <>
          <CapHeader title={t('appSettings.integrations.hcSection')} />
          <HealthConnectPanel />
        </>
      )}
      <AppText variant="caption" muted testID="integrations-others">
        {t('appSettings.integrations.othersNotBuilt')}
      </AppText>
    </SettingsPage>
  );
}
