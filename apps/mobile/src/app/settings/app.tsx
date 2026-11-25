import { View } from 'react-native';

import { useAppData } from '@/data/context';
import type { DataSource, Language } from '@/data/types';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Segmented } from '@/ui/controls';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { ToggleRow, KeyValueRow } from '@/ui/manage/rows';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { NotBuilt } from '@/ui/NotBuilt';
import { spacing, useTheme } from '@/ui/theme';

export default function AppSettingsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { settings, userData, updateSettings, updateUserData } = useAppData();
  const prefs = userData.notifications;

  return (
    <SettingsPage title={t('appSettings.title')} tint="neutral" notice testID="app-settings">
      <CapHeader title={t('settings.language')} />
      <Segmented<Language>
        testID="language-segmented"
        value={settings.language}
        onChange={(language) => void updateSettings({ language })}
        options={[
          { value: 'nl', label: t('settings.lang.nl') },
          { value: 'en', label: t('settings.lang.en') },
        ]}
      />

      <CapHeader title={t('settings.dataSource')} />
      <Segmented<DataSource>
        testID="source-segmented"
        value={settings.dataSource}
        onChange={(dataSource) => void updateSettings({ dataSource })}
        options={[
          { value: 'demo', label: t('settings.source.demo') },
          { value: 'band', label: t('settings.source.band') },
        ]}
      />
      <AppText variant="label" muted>
        {t('settings.sourceHint')}
      </AppText>
      {settings.dataSource === 'band' ? (
        <AppText variant="label" muted>
          {t('settings.sourceUntested')}
        </AppText>
      ) : null}

      <CapHeader title={t('appSettings.theme')} />
      <Card>
        <KeyValueRow label={t('appSettings.theme')} value={t('appSettings.themeSystem')} />
        <AppText variant="label" muted>
          {t('appSettings.themeBody')}
        </AppText>
      </Card>

      <CapHeader title={t('appSettings.notifications')} />
      <Card style={{ gap: 0 }}>
        <ToggleRow
          title={t('appSettings.morningDigest')}
          subtitle={t('appSettings.morningDigestBody')}
          value={prefs.morningDigest}
          onChange={(morningDigest) => void updateUserData({ notifications: { ...prefs, morningDigest } })}
          testID="toggle-morning-digest"
        />
        <ToggleRow
          title={t('appSettings.syncProblems')}
          subtitle={t('appSettings.syncProblemsBody')}
          value={prefs.syncProblems}
          onChange={(syncProblems) => void updateUserData({ notifications: { ...prefs, syncProblems } })}
          testID="toggle-sync-problems"
        />
        <View style={{ paddingTop: spacing.sm }}>
          <KeyValueRow label={t('appSettings.quietFrom')} value={prefs.quietStart} />
          <KeyValueRow label={t('appSettings.quietUntil')} value={prefs.quietEnd} />
        </View>
      </Card>
      <NotBuilt issue="notifications" compact body={t('appSettings.notificationsNotBuilt')} />

      <CapHeader title={t('appSettings.layout')} />
      <ListGroup>
        <ListRow icon={tile(colors, 'widget', 'info')} title={t('appSettings.homeLayout')} subtitle={t('appSettings.homeLayoutBody')} href="/home/customize" />
      </ListGroup>
    </SettingsPage>
  );
}
