import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { useAppData } from '@/data/context';
import type { DataSource, Language, ParityLevel } from '@/data/types';
import { useT } from '@/i18n/useT';
import { isValidIsoDate } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field, Segmented } from '@/ui/controls';
import { NoticeCard } from '@/ui/NoticeCard';
import { ParityBadge } from '@/ui/ParityBadge';
import { Screen } from '@/ui/Screen';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';

const LEVELS: ReadonlyArray<ParityLevel> = ['A', 'B', 'C', 'D'];

function parseInteger(text: string): number {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

export default function SettingsScreen() {
  const { profile, settings, updateProfile, updateSettings, exportData } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [birthYear, setBirthYear] = useState(profile.birthYear?.toString() ?? '');
  const [maxHr, setMaxHr] = useState(profile.maxHeartRate?.toString() ?? '');
  const [profileState, setProfileState] = useState<'idle' | 'saved' | 'invalid'>('idle');
  const [ownerSince, setOwnerSince] = useState(settings.ownerSince ?? '');
  const [ownerState, setOwnerState] = useState<'idle' | 'saved' | 'invalid'>('idle');
  useEffect(() => {
    setOwnerSince(settings.ownerSince ?? '');
  }, [settings.ownerSince]);
  const [exporting, setExporting] = useState(false);

  const parsedYear = birthYear.trim() === '' ? null : parseInteger(birthYear);
  const defaultMaxHr =
    parsedYear !== null && !Number.isNaN(parsedYear) ? Math.round(208 - 0.7 * (new Date().getFullYear() - parsedYear)) : null;

  const saveProfile = async (): Promise<void> => {
    const year = birthYear.trim() === '' ? null : parseInteger(birthYear);
    const hr = maxHr.trim() === '' ? null : parseInteger(maxHr);
    const yearOk = year === null || (!Number.isNaN(year) && year >= 1900 && year <= new Date().getFullYear());
    const hrOk = hr === null || (!Number.isNaN(hr) && hr >= 120 && hr <= 230);
    if (!yearOk || !hrOk) {
      setProfileState('invalid');
      return;
    }
    await updateProfile({ birthYear: year, maxHeartRate: hr });
    setProfileState('saved');
  };

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

  const runExport = async (): Promise<void> => {
    setExporting(true);
    try {
      await exportData();
    } finally {
      setExporting(false);
    }
  };

  const version = Constants.expoConfig?.version ?? '0';

  return (
    <Screen>
      <NoticeCard />
      <Section title={t('settings.profile')}>
        <Card style={{ gap: spacing.lg }}>
          <Field
            label={t('settings.birthYear')}
            value={birthYear}
            onChangeText={(v) => {
              setBirthYear(v);
              setProfileState('idle');
            }}
            keyboardType="number-pad"
            maxLength={4}
            testID="birth-year-input"
          />
          <Field
            label={t('settings.maxHr')}
            value={maxHr}
            onChangeText={(v) => {
              setMaxHr(v);
              setProfileState('idle');
            }}
            keyboardType="number-pad"
            maxLength={3}
            hint={defaultMaxHr === null ? t('settings.maxHrHintNoYear') : t('settings.maxHrHint', { value: defaultMaxHr })}
            testID="max-hr-input"
          />
          {profileState === 'invalid' ? (
            <AppText variant="label" color={colors.negative}>
              {t('settings.profileInvalid')}
            </AppText>
          ) : null}
          <Button label={profileState === 'saved' ? t('settings.saved') : t('settings.save')} onPress={() => void saveProfile()} />
        </Card>
      </Section>

      <Section title={t('settings.language')}>
        <Segmented<Language>
          value={settings.language}
          onChange={(language) => void updateSettings({ language })}
          options={[
            { value: 'nl', label: t('settings.lang.nl') },
            { value: 'en', label: t('settings.lang.en') },
          ]}
        />
      </Section>

      <Section title={t('settings.dataSource')} hint={t('settings.sourceHint')}>
        <Segmented<DataSource>
          value={settings.dataSource}
          onChange={(dataSource) => void updateSettings({ dataSource })}
          options={[
            { value: 'demo', label: t('settings.source.demo') },
            { value: 'band', label: t('settings.source.band') },
          ]}
        />
        {settings.dataSource === 'band' ? (
          <AppText variant="label" muted>
            {t('settings.sourceUntested')}
          </AppText>
        ) : null}
      </Section>

      <Section title={t('settings.ownerSince')}>
        <Card style={{ gap: spacing.lg }}>
          <Field
            label={t('pairing.sinceLabel')}
            value={ownerSince}
            onChangeText={(v) => {
              setOwnerSince(v);
              setOwnerState('idle');
            }}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            maxLength={10}
            hint={ownerState === 'invalid' ? t('pairing.sinceInvalid') : undefined}
            testID="owner-since-input"
          />
          <Button label={ownerState === 'saved' ? t('settings.saved') : t('settings.save')} variant="secondary" onPress={() => void saveOwnerSince()} />
        </Card>
      </Section>

      <Section title={t('settings.export')}>
        <Card style={{ gap: spacing.md }}>
          <AppText variant="body" muted>
            {t('settings.exportBody')}
          </AppText>
          <AppText variant="label" muted>
            {t('settings.exportWarning')}
          </AppText>
          <Button label={exporting ? t('settings.exporting') : t('settings.exportAction')} onPress={() => void runExport()} disabled={exporting} testID="export-button" />
        </Card>
      </Section>

      <Button label={t('settings.selftest')} variant="secondary" onPress={() => router.push('/selftest')} testID="selftest-link" />

      <Section title={t('settings.about')}>
        <Card style={{ gap: spacing.md }}>
          <AppText variant="bodyStrong">{t('about.version', { version })}</AppText>
          <AppText variant="body">{t('about.local')}</AppText>
          <AppText variant="body">{t('about.disclaimer')}</AppText>
          <AppText variant="body">{t('about.affiliation')}</AppText>
          <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
            <AppText variant="label" muted>
              {t('about.levels')}
            </AppText>
            {LEVELS.map((level) => (
              <View key={level} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <ParityBadge level={level} />
                <AppText variant="body" style={{ flex: 1 }}>
                  {t(`level.${level}`)}
                </AppText>
              </View>
            ))}
          </View>
        </Card>
      </Section>
    </Screen>
  );
}
