import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { toAppError } from '@/data/errors';
import type { DiscoveredBand } from '@/data/types';
import type { TranslationKey, TranslationParams } from '@/i18n';
import { useT } from '@/i18n/useT';
import { isValidIsoDate, todayIso } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { radius, spacing, useTheme } from '@/ui/theme';

interface Failure {
  key: TranslationKey;
  params?: TranslationParams;
}

export default function PairScanScreen() {
  const { scan, pair, updateSettings, settings, clearNotice } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [bands, setBands] = useState<DiscoveredBand[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [since, setSince] = useState(() => todayIso(new Date()));
  const [bonding, setBonding] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const sinceValid = isValidIsoDate(since, new Date());

  const runScan = async (): Promise<void> => {
    setScanning(true);
    setFailure(null);
    try {
      if (settings.dataSource !== 'band') {
        await updateSettings({ dataSource: 'band' });
        clearNotice();
      }
      setBands(await scan());
      setScanned(true);
    } catch (error) {
      const failed = toAppError(error);
      setFailure({ key: failed.key, params: failed.params });
    } finally {
      setScanning(false);
    }
  };

  const runPair = async (): Promise<void> => {
    if (!selected) return;
    setBonding(true);
    setFailure(null);
    try {
      await pair(selected, since);
      router.push('/onboarding/connected');
    } catch (error) {
      const failed = toAppError(error);
      setFailure({ key: failed.key, params: failed.params });
    } finally {
      setBonding(false);
    }
  };

  const startDemo = async (): Promise<void> => {
    setFailure(null);
    try {
      await updateSettings({ dataSource: 'demo' });
      router.push('/onboarding/setup');
    } catch (error) {
      const failed = toAppError(error);
      setFailure({ key: failed.key, params: failed.params });
    }
  };

  return (
    <OnboardingPage
      step={7}
      title={t('onboarding.pair.title')}
      subtitle={t('onboarding.pair.subtitle')}
      primary={
        selected === null
          ? { label: scanning ? t('pairing.scanning') : scanned ? t('onboarding.pair.scanAgain') : t('pairing.scanStart'), onPress: () => void runScan(), disabled: scanning, testID: 'scan-button' }
          : { label: bonding ? t('pairing.bonding') : t('pairing.bondStart'), onPress: () => void runPair(), disabled: bonding || !sinceValid, testID: 'bond-button' }
      }
      secondary={selected === null ? undefined : { label: t('onboarding.pair.scanAgain'), onPress: () => void runScan(), disabled: scanning }}
      tertiary={{ label: t('onboarding.pair.useDemo'), onPress: () => void startDemo(), testID: 'pair-demo' }}>
      {failure ? (
        <Card tone="warning" testID="pair-failure">
          <AppText variant="body">{t(failure.key, failure.params)}</AppText>
        </Card>
      ) : null}
      {scanned && bands.length === 0 && !failure ? (
        <AppText variant="body" muted>
          {t('pairing.scanNone')}
        </AppText>
      ) : null}
      {bands.map((band) => {
        const isSelected = band.id === selected;
        return (
          <Pressable
            key={band.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            onPress={() => setSelected(band.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              borderRadius: radius.md,
              borderWidth: isSelected ? 2 : 1,
              borderColor: isSelected ? colors.text : colors.border,
              backgroundColor: colors.surface,
              padding: spacing.lg,
              minHeight: 64,
            }}>
            <Icon name="band" color={colors.accent} size={24} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong">{band.name}</AppText>
              <AppText variant="label" muted>
                {t('pairing.rssi', { rssi: band.rssi })}
              </AppText>
            </View>
          </Pressable>
        );
      })}
      {selected !== null ? (
        <Card style={{ gap: spacing.md }}>
          <AppText variant="bodyStrong">{t('pairing.sinceTitle')}</AppText>
          <AppText variant="label" muted>
            {t('pairing.sinceBody')}
          </AppText>
          <Field
            label={t('pairing.sinceLabel')}
            value={since}
            onChangeText={setSince}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            maxLength={10}
            error={!sinceValid}
            hint={sinceValid ? undefined : t('pairing.sinceInvalid')}
            testID="since-input"
          />
          <AppText variant="caption" muted>
            {t('pairing.bondBody')}
          </AppText>
        </Card>
      ) : null}
      <Card tone="warning" style={{ gap: 4 }}>
        <AppText variant="bodyStrong">{t('pairing.oneBondTitle')}</AppText>
        <AppText variant="label" muted>
          {t('pairing.oneBondBody')}
        </AppText>
      </Card>
      <Button label={t('onboarding.pair.help')} variant="tertiary" onPress={() => router.push('/onboarding/official-app')} />
    </OnboardingPage>
  );
}
