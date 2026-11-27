import { View } from 'react-native';

import { useAppData } from '@/data/context';
import type { HcTypeResult } from '@/data/healthConnectState';
import { EXPORT_WINDOW_DAYS, isGranted } from '@/data/healthConnectSync';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatAgo } from '@/lib/format';
import { HC_EXPORT_TYPES, HC_IMPORT_TYPES, isExportType, type HcDataType } from '@/lib/healthConnectMapping';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { CapHeader } from '@/ui/ListGroup';
import { ToggleRow } from '@/ui/manage/rows';
import { spacing, useTheme } from '@/ui/theme';

const TITLES: Record<HcDataType, TranslationKey> = {
  heartRate: 'hc.type.heartRate',
  restingHeartRate: 'hc.type.restingHeartRate',
  hrv: 'hc.type.hrv',
  sleep: 'hc.type.sleep',
  exercise: 'hc.type.exercise',
  spo2: 'hc.type.spo2',
  respiratoryRate: 'hc.type.respiratoryRate',
  skinTemperature: 'hc.type.skinTemperature',
  weight: 'hc.type.weight',
  bodyFat: 'hc.type.bodyFat',
  steps: 'hc.type.steps',
};

const SUBTITLES: Record<HcDataType, TranslationKey> = {
  heartRate: 'hc.type.heartRateBody',
  restingHeartRate: 'hc.type.nightlyBody',
  hrv: 'hc.type.nightlyBody',
  sleep: 'hc.type.sleepBody',
  exercise: 'hc.type.exerciseBody',
  spo2: 'hc.type.nightlyBody',
  respiratoryRate: 'hc.type.nightlyBody',
  skinTemperature: 'hc.type.skinTemperatureBody',
  weight: 'hc.type.weightBody',
  bodyFat: 'hc.type.bodyFatBody',
  steps: 'hc.type.stepsBody',
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function resultText(t: ReturnType<typeof useT>['t'], type: HcDataType, result: HcTypeResult): string {
  switch (result.status) {
    case 'ok':
      return isExportType(type) ? t('hc.result.written', { count: result.count }) : t('hc.result.imported', { count: result.count });
    case 'denied':
      return t('hc.result.denied');
    case 'demo':
      return t('hc.result.demo');
    case 'error':
      return t(`hc.result.${result.step}`);
  }
}

function Unavailable({ title, body, action, onAction, testID }: { title: string; body: string; action?: string; onAction?: () => void; testID: string }) {
  const { t } = useT();
  const { refreshHealthConnect } = useAppData();
  return (
    <Card testID={testID} style={{ gap: spacing.sm }}>
      <AppText variant="bodyStrong">{title}</AppText>
      <AppText variant="label" muted>
        {body}
      </AppText>
      {action !== undefined && onAction !== undefined ? <Button label={action} onPress={onAction} testID={`${testID}-action`} /> : null}
      {action !== undefined ? <Button label={t('hc.checkAgain')} variant="tertiary" onPress={() => void refreshHealthConnect()} testID={`${testID}-recheck`} /> : null}
    </Card>
  );
}

export function HealthConnectPanel() {
  const { t } = useT();
  const { colors } = useTheme();
  const {
    healthConnect,
    settings,
    setHealthConnectType,
    setHealthConnectAfterSync,
    requestHealthConnectAccess,
    syncHealthConnect,
    openHealthConnectSettings,
    installHealthConnect,
  } = useAppData();
  const { availability, state, syncing } = healthConnect;
  const granted = new Set(healthConnect.granted);

  if (availability === 'unsupported') {
    return <Unavailable testID="hc-unsupported" title={t('appSettings.integrations.androidOnly')} body={t('hc.androidOnlyBody')} />;
  }
  if (availability === 'checking') {
    return <Unavailable testID="hc-checking" title={t('hc.checking')} body={t('hc.intro')} />;
  }
  if (availability === 'not-installed') {
    return (
      <Unavailable
        testID="hc-not-installed"
        title={t('hc.notInstalled')}
        body={t('hc.notInstalledBody')}
        action={t('hc.install')}
        onAction={() => void installHealthConnect()}
      />
    );
  }
  if (availability === 'update-required') {
    return (
      <Unavailable
        testID="hc-update"
        title={t('hc.updateRequired')}
        body={t('hc.updateRequiredBody')}
        action={t('hc.update')}
        onAction={() => void installHealthConnect()}
      />
    );
  }

  const enabled = (type: HcDataType): boolean => (isExportType(type) ? state.export[type] : state.import[type]);
  const allTypes: HcDataType[] = [...HC_EXPORT_TYPES, ...HC_IMPORT_TYPES];
  const missing = allTypes.filter((type) => enabled(type) && !isGranted(granted, type));
  const anyOn = allTypes.some(enabled);
  const results = state.lastSync?.results ?? {};

  const row = (type: HcDataType, disabled = false) => (
    <View key={type}>
      <ToggleRow
        title={t(TITLES[type])}
        subtitle={t(SUBTITLES[type])}
        value={enabled(type)}
        onChange={(value) => void setHealthConnectType(type, value)}
        disabled={disabled}
        testID={`hc-toggle-${type}`}
      />
      {enabled(type) && !isGranted(granted, type) ? (
        <AppText variant="caption" color={colors.warning} testID={`hc-denied-${type}`}>
          {t('hc.denied')}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <View style={{ gap: spacing.md }} testID="hc-panel">
      <AppText variant="label" muted>
        {t('hc.intro')}
      </AppText>
      <CapHeader title={t('hc.writeSection')} />
      <Card style={{ gap: 0 }}>{HC_EXPORT_TYPES.map((type) => row(type))}</Card>
      <AppText variant="caption" muted>
        {t('hc.window', { days: EXPORT_WINDOW_DAYS })}
      </AppText>
      {settings.dataSource === 'demo' ? (
        <AppText variant="label" color={colors.warning} testID="hc-demo-note">
          {t('hc.demoNote')}
        </AppText>
      ) : null}
      <CapHeader title={t('hc.readSection')} />
      <Card style={{ gap: 0 }}>{HC_IMPORT_TYPES.map((type) => row(type, type === 'bodyFat' && !state.import.weight))}</Card>

      <Card style={{ gap: spacing.sm }}>
        <ToggleRow
          title={t('hc.afterSync')}
          subtitle={t('hc.afterSyncBody')}
          value={state.afterBandSync}
          onChange={(value) => void setHealthConnectAfterSync(value)}
          testID="hc-toggle-after-sync"
        />
        {missing.length > 0 ? <Button label={t('hc.allow')} variant="secondary" onPress={() => void requestHealthConnectAccess()} testID="hc-allow" /> : null}
        <Button
          label={syncing ? t('hc.syncing') : t('hc.syncNow')}
          onPress={() => void syncHealthConnect()}
          disabled={syncing || !anyOn}
          testID="hc-sync"
        />
        <AppText variant="label" muted testID="hc-last-sync">
          {state.lastSync === null ? t('hc.never') : t('hc.lastSync', { time: formatAgo(t, nowSeconds(), state.lastSync.at) })}
        </AppText>
        {allTypes
          .filter((type) => results[type] !== undefined)
          .map((type) => {
            const result = results[type];
            if (result === undefined) return null;
            return (
              <View key={type} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }} testID={`hc-result-${type}`}>
                <AppText variant="label">{t(TITLES[type])}</AppText>
                <Chip
                  small
                  label={resultText(t, type, result)}
                  tone={result.status === 'ok' ? 'positive' : result.status === 'error' ? 'negative' : 'warning'}
                />
              </View>
            );
          })}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('hc.manageBody')}
        </AppText>
        <Button label={t('hc.manage')} variant="tertiary" onPress={openHealthConnectSettings} testID="hc-manage" />
      </Card>
    </View>
  );
}
