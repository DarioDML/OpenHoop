import type { StorageStats } from '@openhoop/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { useAppData } from '@/data/context';
import type { ExportContent } from '@/data/exportData';
import type { RawRetentionDays } from '@/data/userData';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { isValidIsoDate } from '@/lib/format';
import { NETWORK_FEATURES, type NetworkFeature } from '@/net/features';
import { useStrava } from '@/strava/context';
import { AppText } from '@/ui/AppText';
import { BigStatRow, BigStatTile } from '@/ui/BigStat';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { ConfirmDangerDialog } from '@/ui/ConfirmDangerDialog';
import { Button, Field, Segmented, Toggle } from '@/ui/controls';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { PageHero } from '@/ui/manage/PageHero';
import { ToggleRow } from '@/ui/manage/rows';
import { compactCount, sizeParts } from '@/ui/manage/storageFormat';
import { tile } from '@/ui/manage/tiles';
import { NoticeCard } from '@/ui/NoticeCard';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

type SaveState = 'idle' | 'saved' | 'invalid';
type RetentionChoice = '7' | '30' | 'all';

const FEATURE_TEXT: Record<NetworkFeature, { title: TranslationKey; sends: TranslationKey; to: TranslationKey }> = {
  coach: { title: 'network.coach.title', sends: 'network.coach.sends', to: 'network.coach.to' },
  maps: { title: 'network.maps.title', sends: 'network.maps.sends', to: 'network.maps.to' },
  labs: { title: 'network.labs.title', sends: 'network.labs.sends', to: 'network.labs.to' },
  strava: { title: 'network.strava.title', sends: 'network.strava.sends', to: 'network.strava.to' },
};

const EXPORTS: ReadonlyArray<{ content: ExportContent; title: TranslationKey; body: TranslationKey }> = [
  { content: 'csv', title: 'privacy.export.csv', body: 'privacy.export.csvBody' },
  { content: 'json', title: 'privacy.export.json', body: 'privacy.export.jsonBody' },
  { content: 'database', title: 'privacy.export.database', body: 'privacy.export.databaseBody' },
  { content: 'all', title: 'privacy.export.all', body: 'settings.exportBody' },
];

function retentionChoice(days: RawRetentionDays | null): RetentionChoice {
  return days === null ? 'all' : days === 7 ? '7' : '30';
}

function retentionDays(choice: RetentionChoice): RawRetentionDays | null {
  return choice === 'all' ? null : choice === '7' ? 7 : 30;
}

export default function PrivacyScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { settings, updateSettings, userData, updateUserData, exportData, storageStats, deleteAllData } = useAppData();
  const network = userData.network;
  const localOnly = !network.enabled;
  const [ownerSince, setOwnerSince] = useState(settings.ownerSince ?? '');
  const [ownerState, setOwnerState] = useState<SaveState>('idle');
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [exporting, setExporting] = useState<ExportContent | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const retention = userData.rawRetentionDays;
  const strava = useStrava();

  useEffect(() => {
    setOwnerSince(settings.ownerSince ?? '');
  }, [settings.ownerSince]);

  useEffect(() => {
    let alive = true;
    void storageStats().then((next) => {
      if (alive) setStats(next);
    });
    return () => {
      alive = false;
    };
  }, [storageStats, retention]);

  const saveOwnerSince = async (): Promise<void> => {
    if (!isValidIsoDate(ownerSince, new Date())) {
      setOwnerState('invalid');
      return;
    }
    const commit = async (): Promise<void> => {
      try {
        await updateSettings({ ownerSince });
        setOwnerState('saved');
      } catch {
        setOwnerState('idle');
      }
    };
    const movesLater = settings.ownerSince === null || ownerSince > settings.ownerSince;
    if (!movesLater) {
      await commit();
      return;
    }
    Alert.alert(t('settings.ownerLaterTitle'), t('settings.ownerLaterBody', { date: ownerSince }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.ownerLaterConfirm'), style: 'destructive', onPress: () => void commit() },
    ]);
  };

  const pickRetention = (choice: RetentionChoice): void => {
    const days = retentionDays(choice);
    if (days === retention) return;
    const save = (): void => void updateUserData({ rawRetentionDays: days });
    if (days === null || (retention !== null && days > retention)) {
      save();
      return;
    }
    Alert.alert(t('privacy.retentionConfirmTitle'), t('privacy.retentionConfirmBody', { days }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('privacy.retentionConfirm'), style: 'destructive', onPress: save },
    ]);
  };

  const runExport = async (content: ExportContent): Promise<void> => {
    if (exporting !== null) return;
    setExporting(content);
    try {
      await exportData(content);
    } finally {
      setExporting(null);
    }
  };

  const wipe = async (): Promise<void> => {
    setConfirmWipe(false);
    if (!(await deleteAllData())) return;
    await strava.controller.load();
    router.replace('/onboarding');
  };

  const database = stats?.databaseBytes === null || stats === null ? null : sizeParts(stats.databaseBytes, language);
  const header = (
    <>
      <TopBar title={t('privacy.title')} />
      <PageHero
        icon="lock"
        iconColor={localOnly ? colors.positive : colors.warning}
        iconBackground={localOnly ? colors.positiveSoft : colors.warningSoft}
        title={localOnly ? t('privacy.hero.local') : t('privacy.hero.network')}
        body={localOnly ? t('privacy.hero.localBody') : t('privacy.hero.networkBody')}
        testID="privacy-hero"
      />
    </>
  );

  return (
    <Screen header={header} tint="neutral" testID="privacy">
      <NoticeCard />
      <ListGroup>
        <ToggleRow
          title={t('privacy.localMode')}
          subtitle={t('privacy.localModeBody')}
          value={localOnly}
          onChange={(on) => void updateUserData({ network: { ...network, enabled: !on } })}
          testID="local-only-toggle"
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 68, paddingVertical: spacing.md }} testID="backup-not-built">
          <View style={{ flex: 1, gap: 3 }}>
            <AppText variant="body" style={{ fontWeight: '500' }}>
              {t('privacy.backup')}
            </AppText>
            <AppText variant="label" muted>
              {t('privacy.backupBody')}
            </AppText>
          </View>
          <Chip label={t('appSettings.integrations.notBuilt')} tone="pink" small />
        </View>
      </ListGroup>

      <BigStatRow>
        <BigStatTile testID="privacy-database" label={t('privacy.database')} value={database?.value ?? null} unit={database?.unit} missing={t('privacy.statsMissing')} />
        <BigStatTile
          testID="privacy-raw"
          label={t('privacy.rawRecords')}
          value={stats === null ? null : compactCount(stats.rawFrames, language)}
          missing={t('privacy.statsMissing')}
          chip={{ label: retention === null ? t('privacy.rawKeptAll') : t('privacy.rawKeptDays', { days: retention }), tone: 'neutral' }}
        />
      </BigStatRow>

      <CapHeader title={t('privacy.retention')} />
      <Segmented<RetentionChoice>
        testID="retention-segmented"
        value={retentionChoice(retention)}
        onChange={pickRetention}
        options={[
          { value: '7', label: t('privacy.retention.7') },
          { value: '30', label: t('privacy.retention.30') },
          { value: 'all', label: t('privacy.retention.all') },
        ]}
      />
      <AppText variant="caption" muted>
        {t('privacy.retentionBody')}
      </AppText>

      <CapHeader title={t('settings.export')} />
      <ListGroup>
        {EXPORTS.map((item) => (
          <ListRow
            key={item.content}
            icon={tile(colors, 'import', 'plain')}
            title={t(item.title)}
            subtitle={exporting === item.content ? t('privacy.export.busy') : t(item.body)}
            onPress={() => void runExport(item.content)}
            disabled={exporting !== null}
            testID={item.content === 'all' ? 'export-button' : `export-${item.content}`}
          />
        ))}
      </ListGroup>
      <AppText variant="caption" muted>
        {t('settings.exportWarning')}
      </AppText>
      <ListGroup>
        <ListRow icon={tile(colors, 'export', 'info')} title={t('privacy.importExport')} subtitle={t('privacy.importExportBody')} href="/settings/import" />
      </ListGroup>

      <CapHeader title={t('privacy.networkFeatures')} />
      <Card style={{ gap: spacing.lg }} testID="network-settings">
        <AppText variant="label" muted>
          {t('network.globalBody')}
        </AppText>
        {NETWORK_FEATURES.map((feature) => (
          <View key={feature} style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <AppText variant="bodyStrong" style={{ flex: 1 }}>
                {t(FEATURE_TEXT[feature].title)}
              </AppText>
              <Toggle
                label={t(FEATURE_TEXT[feature].title)}
                value={network.enabled && network.features[feature]}
                disabled={!network.enabled}
                onChange={(on) => void updateUserData({ network: { ...network, features: { ...network.features, [feature]: on } } })}
                testID={`network-feature-${feature}`}
              />
            </View>
            <AppText variant="label" muted>
              {t(FEATURE_TEXT[feature].sends)}
            </AppText>
            <AppText variant="label" muted>
              {t(FEATURE_TEXT[feature].to)}
            </AppText>
            {network.enabled ? null : (
              <AppText variant="caption" muted>
                {t('privacy.networkOffNote')}
              </AppText>
            )}
          </View>
        ))}
      </Card>

      <CapHeader title={t('settings.ownerSince')} />
      <Card style={{ gap: spacing.lg }}>
        <AppText variant="label" muted>
          {t('pairing.sinceBody')}
        </AppText>
        <Field
          label={t('pairing.sinceLabel')}
          value={ownerSince}
          onChangeText={(value) => {
            setOwnerSince(value);
            setOwnerState('idle');
          }}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          maxLength={10}
          error={ownerState === 'invalid'}
          hint={ownerState === 'invalid' ? t('pairing.sinceInvalid') : undefined}
          testID="owner-since-input"
        />
        <Button label={ownerState === 'saved' ? t('settings.saved') : t('settings.save')} variant="secondary" onPress={() => void saveOwnerSince()} testID="owner-since-save" />
      </Card>

      <Button label={t('privacy.deleteAll')} icon="trash" variant="outlineDanger" onPress={() => setConfirmWipe(true)} testID="delete-all" style={{ marginTop: spacing.sm }} />
      <AppText variant="label" muted>
        {t('privacy.deleteAllBody')}
      </AppText>
      <ConfirmDangerDialog
        visible={confirmWipe}
        commandName={t('privacy.deleteAllWord')}
        title={t('privacy.deleteAllTitle')}
        body={t('privacy.deleteAllDialog', { word: t('privacy.deleteAllWord') })}
        inputLabel={t('privacy.deleteAllInput')}
        confirmLabel={t('privacy.deleteAllConfirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmWipe(false)}
        onConfirm={() => void wipe()}
      />
    </Screen>
  );
}
