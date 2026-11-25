import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { isValidIsoDate } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field } from '@/ui/controls';
import { Icon, type IconName } from '@/ui/Icon';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { ExportCard } from '@/ui/manage/ExportCard';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import type { TranslationKey } from '@/i18n';
import { radius, spacing, useTheme } from '@/ui/theme';

type SaveState = 'idle' | 'saved' | 'invalid';

const PROMISES: ReadonlyArray<{ icon: IconName; key: TranslationKey }> = [
  { icon: 'shield', key: 'privacy.promiseLocal' },
  { icon: 'lock', key: 'privacy.promiseEncrypted' },
  { icon: 'offline', key: 'privacy.promiseNoNetwork' },
];

export default function PrivacyScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { settings, updateSettings } = useAppData();
  const [ownerSince, setOwnerSince] = useState(settings.ownerSince ?? '');
  const [ownerState, setOwnerState] = useState<SaveState>('idle');

  useEffect(() => {
    setOwnerSince(settings.ownerSince ?? '');
  }, [settings.ownerSince]);

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

  return (
    <SettingsPage title={t('privacy.title')} tint="neutral" notice testID="privacy">
      <Card style={{ gap: spacing.md }}>
        <AppText variant="cardTitle">{t('privacy.localTitle')}</AppText>
        {PROMISES.map((promise) => (
          <View key={promise.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.positiveSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={promise.icon} color={colors.positive} size={18} />
            </View>
            <AppText variant="body" style={{ flex: 1 }}>
              {t(promise.key)}
            </AppText>
          </View>
        ))}
      </Card>

      <CapHeader title={t('settings.export')} />
      <ExportCard />
      <ListGroup>
        <ListRow icon={tile(colors, 'import', 'info')} title={t('privacy.importExport')} subtitle={t('privacy.importExportBody')} href="/settings/import" />
      </ListGroup>

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

      <Card style={{ gap: 4 }}>
        <AppText variant="bodyStrong">{t('privacy.deleteTitle')}</AppText>
        <AppText variant="label" muted>
          {t('privacy.deleteBody')}
        </AppText>
      </Card>
    </SettingsPage>
  );
}
