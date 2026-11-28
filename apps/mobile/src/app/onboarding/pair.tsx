import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useAppData } from '@/data/context';
import { toAppError } from '@/data/errors';
import { knownRssi, modelFromName, shortBandId, signalStrength } from '@/data/onboarding';
import type { DiscoveredBand } from '@/data/types';
import type { TranslationKey, TranslationParams } from '@/i18n';
import { useT } from '@/i18n/useT';
import { isValidIsoDate, todayIso } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field } from '@/ui/controls';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { NoteBox } from '@/ui/manage/NoteBox';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { tile } from '@/ui/manage/tiles';
import { Sheet } from '@/ui/Sheet';
import { spacing, useTheme } from '@/ui/theme';

interface Failure {
  key: TranslationKey;
  params?: TranslationParams;
}

function PairIllustration({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center' }} accessible accessibilityRole="image" accessibilityLabel={label} testID="pair-illustration">
      <Svg width={300} height={180} viewBox="0 0 300 180">
        <Rect x={28} y={20} width={84} height={150} rx={16} fill={colors.surface} stroke={colors.textFaint} strokeWidth={2} />
        <Rect x={58} y={30} width={24} height={5} rx={2.5} fill={colors.textFaint} />
        <Circle cx={70} cy={95} r={20} fill="none" stroke={colors.accent} strokeWidth={3} />
        <Rect x={196} y={58} width={76} height={74} rx={18} fill={colors.surface} stroke={colors.textMuted} strokeWidth={2} />
        <Rect x={214} y={44} width={40} height={14} rx={4} fill={colors.surface3} />
        <Rect x={214} y={132} width={40} height={14} rx={4} fill={colors.surface3} />
        <Circle cx={234} cy={95} r={6} fill={colors.positive} />
        <Path d="M120 95 H188" stroke={colors.accent} strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" />
        <Circle cx={154} cy={95} r={16} fill="none" stroke={colors.accent} strokeOpacity={0.45} strokeWidth={2} />
        <Circle cx={154} cy={95} r={28} fill="none" stroke={colors.accent} strokeOpacity={0.2} strokeWidth={2} />
      </Svg>
    </View>
  );
}

export default function PairScanScreen() {
  const { scan, pair, updateSettings, settings, clearNotice, userData } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [bands, setBands] = useState<DiscoveredBand[]>([]);
  const [selected, setSelected] = useState<DiscoveredBand | null>(null);
  const [since, setSince] = useState(() => todayIso(new Date()));
  const [bonding, setBonding] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const today = todayIso(new Date());
  const sinceValid = isValidIsoDate(since, new Date());

  const runScan = async (): Promise<void> => {
    setScanning(true);
    setFailure(null);
    setSelected(null);
    try {
      if (settings.dataSource !== 'band') {
        await updateSettings({ dataSource: 'band' });
        clearNotice();
      }
      const found = await scan();
      setBands([...found].sort((a, b) => (knownRssi(b.rssi) ?? -999) - (knownRssi(a.rssi) ?? -999)));
      setScanned(true);
    } catch (error) {
      const failed = toAppError(error);
      setFailure({ key: failed.key, params: failed.params });
    } finally {
      setScanning(false);
    }
  };

  const runPair = async (): Promise<void> => {
    if (selected === null) return;
    setBonding(true);
    setFailure(null);
    try {
      await pair(selected.id, since);
      const band = selected;
      setSelected(null);
      router.push({ pathname: '/onboarding/connected', params: { id: band.id, rssi: String(band.rssi) } });
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

  const rowText = (band: DiscoveredBand): string => {
    const rssi = knownRssi(band.rssi);
    const strength = rssi === null ? null : signalStrength(rssi);
    const id = shortBandId(band.id);
    return rssi === null || strength === null
      ? t('onboarding.pair.rowUnknown', { id })
      : t('onboarding.pair.row', { id, signal: t(`onboarding.pair.signal.${strength}`), rssi });
  };

  const failureCard =
    failure === null ? null : (
      <Card tone="warning" testID="pair-failure">
        <AppText variant="body">{t(failure.key, failure.params)}</AppText>
      </Card>
    );

  return (
    <OnboardingPage
      screen="pair"
      title={t('onboarding.pair.title')}
      subtitle={t('onboarding.pair.subtitle')}
      primary={{
        label: scanning ? t('pairing.scanning') : scanned ? t('onboarding.pair.scanAgain') : t('pairing.scanStart'),
        onPress: () => void runScan(),
        disabled: scanning || bonding,
        testID: 'scan-button',
      }}>
      <PairIllustration label={t('onboarding.pair.illustration')} />
      {selected === null ? failureCard : null}
      {scanned && bands.length === 0 && failure === null ? (
        <AppText variant="body" muted testID="pair-none">
          {t('pairing.scanNone')}
        </AppText>
      ) : null}
      {bands.length > 0 ? (
        <ListGroup>
          {bands.map((band, index) => (
            <ListRow
              key={band.id}
              icon={tile(colors, 'band', modelFromName(band.name) === 'MG' ? 'pink' : 'neutral')}
              title={band.name}
              subtitle={rowText(band)}
              chevron={false}
              testID={`band-row-${band.id}`}
              right={
                <Button
                  label={t('onboarding.pair.pair')}
                  variant={index === 0 ? 'primary' : 'soft'}
                  compact
                  onPress={() => {
                    setFailure(null);
                    setSelected(band);
                  }}
                  disabled={bonding || scanning}
                  accessibilityLabel={t('onboarding.pair.pairLabel', { name: band.name })}
                  testID={`pair-${band.id}`}
                />
              }
            />
          ))}
        </ListGroup>
      ) : null}
      <NoteBox icon="info" tone="warning" title={t('onboarding.pair.otherAppTitle')} body={t('pairing.oneBondBody')} testID="pair-other-app">
        {userData.officialAppMode === 'switch' ? (
          <AppText variant="label" color={colors.textSoft} testID="pair-switch-note">
            {t('onboarding.pair.switchNote')}
          </AppText>
        ) : null}
      </NoteBox>
      <View style={{ gap: spacing.xs }}>
        <Button label={t('onboarding.pair.help')} variant="tertiary" onPress={() => router.push('/onboarding/official-app')} testID="pair-help" />
        <Button label={t('onboarding.pair.useDemo')} variant="tertiary" onPress={() => void startDemo()} testID="pair-demo" />
      </View>
      <Sheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={t('pairing.sinceTitle')}
        subtitle={selected === null ? undefined : `${selected.name} · ${shortBandId(selected.id)}`}
        testID="pair-sheet"
        footer={
          <Button
            label={bonding ? t('pairing.bonding') : t('pairing.bondStart')}
            onPress={() => void runPair()}
            disabled={bonding || !sinceValid}
            testID="bond-button"
          />
        }>
        {selected !== null ? failureCard : null}
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
        <NoteBox icon="alert" tone="warning" title={since === today ? t('onboarding.pair.sinceToday') : undefined} body={t('pairing.sinceWarning')} testID="since-warning" />
        <AppText variant="caption" muted>
          {t('pairing.bondBody')}
        </AppText>
      </Sheet>
    </OnboardingPage>
  );
}
