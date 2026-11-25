import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import type { DataSource, Language } from '@/data/types';
import type { NotificationPrefs } from '@/data/userData';
import { DATA_AT_RISK_DAYS, clockMinutes } from '@/lib/notificationPlan';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field, Segmented } from '@/ui/controls';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { useNotificationSwitch } from '@/ui/manage/notificationSwitch';
import { ToggleRow, KeyValueRow } from '@/ui/manage/rows';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { spacing, useTheme } from '@/ui/theme';

interface QuietFieldProps {
  label: string;
  value: string;
  onSave: (clock: string) => void;
  disabled: boolean;
  testID: string;
}

function QuietField({ label, value, onSave, disabled, testID }: QuietFieldProps) {
  const { t } = useT();
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const commit = (): void => {
    const trimmed = text.trim();
    if (clockMinutes(trimmed) === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (trimmed !== value) onSave(trimmed);
  };
  return (
    <Field
      testID={testID}
      label={label}
      value={text}
      editable={!disabled}
      onChangeText={setText}
      onEndEditing={commit}
      onSubmitEditing={commit}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      error={invalid}
      hint={invalid ? t('appSettings.quietInvalid') : t('appSettings.quietHint')}
    />
  );
}

export default function AppSettingsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { settings, userData, updateSettings, updateUserData } = useAppData();
  const prefs = userData.notifications;
  const notifications = useNotificationSwitch();
  const off = !notifications.enabled;
  const savePrefs = (patch: Partial<NotificationPrefs>): void => {
    void updateUserData({ notifications: { ...prefs, ...patch } });
  };

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
          title={t('appSettings.notificationsAllow')}
          subtitle={t('appSettings.notificationsAllowBody')}
          value={notifications.enabled}
          onChange={notifications.toggle}
          disabled={notifications.busy}
          testID="toggle-notifications"
        />
        {notifications.blocked ? (
          <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }} testID="notifications-blocked">
            <AppText variant="label" color={colors.warning}>
              {t('appSettings.notificationsBlocked')}
            </AppText>
            <Button variant="tertiary" label={t('appSettings.openSystemSettings')} onPress={notifications.openSettings} />
          </View>
        ) : null}
        <ToggleRow
          title={t('appSettings.morningDigest')}
          subtitle={t('appSettings.morningDigestBody')}
          value={prefs.morningDigest}
          onChange={(morningDigest) => savePrefs({ morningDigest })}
          disabled={off}
          testID="toggle-morning-digest"
        />
        <ToggleRow
          title={t('appSettings.syncProblems')}
          subtitle={t('appSettings.syncProblemsBody', { days: DATA_AT_RISK_DAYS })}
          value={prefs.syncProblems}
          onChange={(syncProblems) => savePrefs({ syncProblems })}
          disabled={off}
          testID="toggle-sync-problems"
        />
        <View style={{ paddingTop: spacing.sm, gap: spacing.md }}>
          <QuietField
            key={`start-${prefs.quietStart}`}
            label={t('appSettings.quietFrom')}
            value={prefs.quietStart}
            onSave={(quietStart) => savePrefs({ quietStart })}
            disabled={off}
            testID="quiet-start"
          />
          <QuietField
            key={`end-${prefs.quietEnd}`}
            label={t('appSettings.quietUntil')}
            value={prefs.quietEnd}
            onSave={(quietEnd) => savePrefs({ quietEnd })}
            disabled={off}
            testID="quiet-end"
          />
        </View>
      </Card>
      <AppText variant="label" muted>
        {t('appSettings.notificationsLocal')}
      </AppText>

      <CapHeader title={t('appSettings.layout')} />
      <ListGroup>
        <ListRow icon={tile(colors, 'widget', 'info')} title={t('appSettings.homeLayout')} subtitle={t('appSettings.homeLayoutBody')} href="/home/customize" />
      </ListGroup>
    </SettingsPage>
  );
}
