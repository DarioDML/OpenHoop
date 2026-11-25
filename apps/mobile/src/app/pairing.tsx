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
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme } from '@/ui/theme';

type Step = 1 | 2 | 3 | 4;

interface Failure {
  key: TranslationKey;
  params?: TranslationParams;
}
const TOTAL = 4;

export default function PairingScreen() {
  const { scan, pair, device } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>(1);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [bands, setBands] = useState<DiscoveredBand[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [since, setSince] = useState(() => todayIso(new Date()));
  const [bonding, setBonding] = useState(false);
  const [bonded, setBonded] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const sinceValid = isValidIsoDate(since, new Date());

  const runScan = async (): Promise<void> => {
    setScanning(true);
    setFailure(null);
    try {
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
      setBonded(true);
    } catch (error) {
      const failed = toAppError(error);
      setFailure({ key: failed.key, params: failed.params });
    } finally {
      setBonding(false);
    }
  };

  const next = (): void => setStep((s) => (s < TOTAL ? ((s + 1) as Step) : s));
  const back = (): void => setStep((s) => (s > 1 ? ((s - 1) as Step) : s));

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('pairing.stepOf', { current: step, total: TOTAL })}
        </AppText>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < step ? colors.accent : colors.surfaceAlt }} />
          ))}
        </View>
      </View>

      {step === 1 ? (
        <View style={{ gap: spacing.lg }}>
          <AppText variant="title">{t('pairing.prepareTitle')}</AppText>
          <AppText variant="body">{t('pairing.prepareBody')}</AppText>
          <Card tone="warning" style={{ gap: 6 }}>
            <AppText variant="bodyStrong">{t('pairing.oneBondTitle')}</AppText>
            <AppText variant="body">{t('pairing.oneBondBody')}</AppText>
          </Card>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: spacing.lg }}>
          <AppText variant="title">{t('pairing.scanTitle')}</AppText>
          <Button label={scanning ? t('pairing.scanning') : t('pairing.scanStart')} onPress={() => void runScan()} disabled={scanning} testID="scan-button" />
          {failure ? (
            <Card tone="warning">
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
                  borderRadius: radius.md,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? colors.accent : colors.border,
                  backgroundColor: colors.surface,
                  padding: spacing.lg,
                  gap: 2,
                  minHeight: 64,
                }}>
                <AppText variant="bodyStrong">{band.name}</AppText>
                <AppText variant="label" muted>
                  {t('pairing.rssi', { rssi: band.rssi })}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: spacing.lg }}>
          <AppText variant="title">{t('pairing.sinceTitle')}</AppText>
          <AppText variant="body">{t('pairing.sinceBody')}</AppText>
          <Field
            label={t('pairing.sinceLabel')}
            value={since}
            onChangeText={setSince}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            maxLength={10}
            hint={sinceValid ? undefined : t('pairing.sinceInvalid')}
            testID="since-input"
          />
        </View>
      ) : null}

      {step === 4 ? (
        <View style={{ gap: spacing.lg }}>
          <AppText variant="title">{t('pairing.bondTitle')}</AppText>
          <AppText variant="body">{t('pairing.bondBody')}</AppText>
          {failure ? (
            <Card tone="warning">
              <AppText variant="body">{t(failure.key, failure.params)}</AppText>
            </Card>
          ) : null}
          {bonded ? (
            <Card tone={device.lockState === 'locked' ? 'warning' : 'accent'} style={{ gap: 6 }}>
              <AppText variant="bodyStrong">
                {device.lockState === 'locked' ? t('pairing.lockedDone') : t('pairing.bondDone')}
              </AppText>
              {device.lockState === 'locked' ? <AppText variant="body">{t('lock.locked.body')}</AppText> : null}
            </Card>
          ) : (
            <Button label={bonding ? t('pairing.bonding') : t('pairing.bondStart')} onPress={() => void runPair()} disabled={bonding} testID="bond-button" />
          )}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {step > 1 ? (
          <View style={{ flex: 1 }}>
            <Button label={t('pairing.back')} variant="secondary" onPress={back} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          {step < TOTAL ? (
            <Button
              label={t('pairing.next')}
              onPress={next}
              disabled={(step === 2 && selected === null) || (step === 3 && !sinceValid)}
              testID="next-button"
            />
          ) : (
            <Button label={t('pairing.finish')} onPress={() => router.back()} disabled={!bonded} />
          )}
        </View>
      </View>
    </Screen>
  );
}
