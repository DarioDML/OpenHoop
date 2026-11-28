import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { isCustomLayout, previousLayoutPatch } from '@/data/layoutRestore';
import type { DataSource, Language, Units } from '@/data/types';
import type { NotificationPrefs } from '@/data/userData';
import { DATA_AT_RISK_DAYS, clockMinutes } from '@/lib/notificationPlan';
import type { ThemePreference } from '@/lib/themePreference';
import { useT } from '@/i18n/useT';
import { coachActive } from '@/coach/prefs';
import { AppText } from '@/ui/AppText';
import { Button, Field, Segmented } from '@/ui/controls';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { NOTIFICATION_PRESETS, presetChoice, presetOf, type NotificationPreset } from '@/ui/manage/notificationPresets';
import { useNotificationSwitch } from '@/ui/manage/notificationSwitch';
import { ToggleRow } from '@/ui/manage/rows';
import { SettingsPage } from '@/ui/manage/SettingsPage';
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
      hint={invalid ? t('appSettings.quietInvalid') : undefined}
    />
  );
}

export default function AppSettingsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { settings, userData, updateSettings, updateUserData } = useAppData();
  const [restored, setRestored] = useState(false);
  const prefs = userData.notifications;
  const notifications = useNotificationSwitch();
  const off = !notifications.enabled;
  const preset = presetOf(prefs);
  const coachReady = coachActive(userData.coach, userData.network);
  const restorePatch = previousLayoutPatch(userData);
  const hero = t(userData.homeHero === 'compact' ? 'appSettings.hero.compact' : 'appSettings.hero.classic');
  const savePrefs = (patch: Partial<NotificationPrefs>): void => {
    void updateUserData({ notifications: { ...prefs, ...patch } });
  };
  const restore = async (): Promise<void> => {
    if (restorePatch === null) return;
    setRestored(await updateUserData(restorePatch));
  };

  return (
    <SettingsPage title={t('appSettings.title')} tint="neutral" notice testID="app-settings">
      <CapHeader title={t('appSettings.units')} />
      <Segmented<Units>
        testID="units-segmented"
        value={settings.units}
        onChange={(units) => void updateSettings({ units })}
        options={[
          { value: 'metric', label: t('appSettings.units.metric') },
          { value: 'imperial', label: t('appSettings.units.imperial') },
        ]}
      />

      <CapHeader title={t('appSettings.theme')} />
      <Segmented<ThemePreference>
        testID="theme-segmented"
        value={userData.theme}
        onChange={(theme) => void updateUserData({ theme })}
        options={[
          { value: 'dark', label: t('appSettings.theme.dark') },
          { value: 'light', label: t('appSettings.theme.light') },
          { value: 'system', label: t('appSettings.theme.system') },
        ]}
      />
      <AppText variant="caption" muted>
        {t('appSettings.themeBody')}
      </AppText>

      <CapHeader title={t('settings.language')} />
      <Segmented<Language>
        testID="language-segmented"
        value={settings.language}
        onChange={(language) => void updateSettings({ language })}
        options={[
          { value: 'en', label: t('settings.lang.en') },
          { value: 'nl', label: t('settings.lang.nl') },
        ]}
      />

      <CapHeader title={t('appSettings.notifications')} />
      <ListGroup>
        <ToggleRow
          title={t('appSettings.notificationsAllow')}
          subtitle={t('appSettings.notificationsAllowBody')}
          value={notifications.enabled}
          onChange={notifications.toggle}
          disabled={notifications.busy}
          testID="toggle-notifications"
        />
        {notifications.blocked ? (
          <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }} testID="notifications-blocked">
            <AppText variant="label" color={colors.warning}>
              {t('appSettings.notificationsBlocked')}
            </AppText>
            <Button variant="tertiary" label={t('appSettings.openSystemSettings')} onPress={notifications.openSettings} />
          </View>
        ) : null}
      </ListGroup>
      <AppText variant="capSmall" muted testID="notification-preset-label">
        {t('appSettings.presetLabel')}
      </AppText>
      <Segmented<NotificationPreset | 'custom'>
        testID="notification-preset"
        value={preset ?? 'custom'}
        onChange={(next) => {
          if (next !== 'custom' && !off) savePrefs(presetChoice(next));
        }}
        options={NOTIFICATION_PRESETS.map((value) => ({ value, label: t(`appSettings.preset.${value}`) }))}
      />
      {preset === null ? (
        <AppText variant="caption" muted testID="notification-preset-custom">
          {t('appSettings.preset.custom')}
        </AppText>
      ) : null}
      <ListGroup>
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
        <ToggleRow
          title={t('appSettings.goalHits')}
          subtitle={t('appSettings.goalHitsBody')}
          value={prefs.goals}
          onChange={(goals) => savePrefs({ goals })}
          disabled={off}
          testID="toggle-goals"
        />
        <ToggleRow
          title={t('appSettings.coachCheckins')}
          subtitle={coachReady ? t('appSettings.coachCheckinsBody') : t('appSettings.coachCheckinsOff')}
          value={prefs.coachCheckins === true}
          onChange={(coachCheckins) => savePrefs({ coachCheckins })}
          disabled={off}
          testID="toggle-coach-checkins"
        />
      </ListGroup>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <QuietField
            key={`start-${prefs.quietStart}`}
            label={t('appSettings.quietFrom')}
            value={prefs.quietStart}
            onSave={(quietStart) => savePrefs({ quietStart })}
            disabled={off}
            testID="quiet-start"
          />
        </View>
        <View style={{ flex: 1 }}>
          <QuietField
            key={`end-${prefs.quietEnd}`}
            label={t('appSettings.quietUntil')}
            value={prefs.quietEnd}
            onSave={(quietEnd) => savePrefs({ quietEnd })}
            disabled={off}
            testID="quiet-end"
          />
        </View>
      </View>
      <AppText variant="caption" muted>
        {t('appSettings.quietHint')}
      </AppText>
      <AppText variant="label" muted>
        {t('appSettings.notificationsLocal')}
      </AppText>

      <CapHeader title={t('appSettings.layout')} />
      <ListGroup>
        <ListRow
          title={t('appSettings.homeLayout')}
          subtitle={t(isCustomLayout(userData) ? 'appSettings.layoutCustomised' : 'appSettings.layoutDefault', { hero })}
          href="/home/customize"
          testID="home-layout"
        />
        <ListRow
          title={t('appSettings.restoreLayout')}
          subtitle={restored ? t('appSettings.restoreLayoutDone') : restorePatch === null ? t('appSettings.restoreLayoutNone') : t('appSettings.restoreLayoutBody')}
          onPress={restorePatch === null ? undefined : () => void restore()}
          disabled={restorePatch === null && !restored}
          chevron={restorePatch !== null}
          testID="restore-layout"
        />
      </ListGroup>

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
      <AppText variant="label" muted testID="source-hint-band">
        {t('settings.sourceBand')}
      </AppText>
      <AppText variant="label" muted testID="source-hint-demo">
        {t('settings.sourceHint')}
      </AppText>
    </SettingsPage>
  );
}
