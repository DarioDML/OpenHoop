import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import type { DiscoveredBand } from '@/data/types';
import { useT } from '@/i18n/useT';
import { isValidIsoDate, todayIso } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field } from '@/ui/controls';
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme } from '@/ui/theme';

type Step = 1 | 2 | 3 | 4;
const TOTAL = 4;

export default function PairingScreen() {
  const { scan, pair } = useAppData();
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

  const sinceValid = isValidIsoDate(since, new Date());

  const runScan = async (): Promise<void> => {
    setScanning(true);
    try {
      setBands(await scan());
      setScanned(true);
    } finally {
      setScanning(false);
    }
  };

  const runPair = async (): Promise<void> => {
    if (!selected) return;
    setBonding(true);
    try {
      await pair(selected, since);
      setBonded(true);
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
          {scanned && bands.length === 0 ? (
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
          {bonded ? (
            <Card tone="accent">
              <AppText variant="bodyStrong">{t('pairing.bondDone')}</AppText>
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
