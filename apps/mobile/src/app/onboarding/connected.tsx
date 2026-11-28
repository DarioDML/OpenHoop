import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { knownRssi, shortBandId } from '@/data/onboarding';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { DoneBadge } from '@/ui/manage/DoneBadge';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { KeyValueRow } from '@/ui/manage/rows';
import { GridTile, StatGrid } from '@/ui/StatGrid';
import { spacing, useTheme } from '@/ui/theme';

function firstParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first === '' ? null : first;
}

export default function PairConnectedScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { device } = useAppData();
  const params = useLocalSearchParams<{ id?: string; rssi?: string }>();
  const id = firstParam(params.id);
  const rssiParam = firstParam(params.rssi);
  const rssi = knownRssi(rssiParam === null ? null : Number(rssiParam));
  const unknown = t('band.unknown');
  const short = id === null ? null : shortBandId(id);
  const hardwareId = short !== null && short !== id ? short : null;
  const band = device.name === null ? (short ?? unknown) : hardwareId === null ? device.name : `${device.name} · ${hardwareId}`;

  return (
    <OnboardingPage
      screen="connected"
      hideBack
      title={t('onboarding.connected.title')}
      subtitle={t('onboarding.connected.subtitle')}
      primary={{ label: t('common.continue'), onPress: () => router.push('/onboarding/setup'), testID: 'connected-continue' }}>
      <View style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl }}>
        <DoneBadge size={120} label={t('onboarding.connected.title')} />
        <AppText variant="screenTitle" style={{ textAlign: 'center' }} testID="connected-success">
          {t('onboarding.connected.success', { band })}
        </AppText>
      </View>
      <StatGrid testID="connected-facts">
        <GridTile label={t('band.model')} value={device.model} missing={unknown} testID="fact-model" />
        <GridTile label={t('band.battery')} value={device.batteryPercent === null ? null : String(device.batteryPercent)} unit={t('unit.percent')} missing={unknown} testID="fact-battery" />
        <GridTile
          label={t('band.firmware')}
          value={device.firmware}
          missing={unknown}
          chip={device.firmware === null ? null : { label: t('onboarding.connected.logged'), tone: 'neutral' }}
          testID="fact-firmware"
        />
        <GridTile
          label={t('onboarding.connected.signal')}
          value={rssi === null ? null : String(rssi)}
          unit="dBm"
          missing={unknown}
          caption={rssi === null ? undefined : t('onboarding.connected.signalAtPairing')}
          testID="fact-signal"
        />
      </StatGrid>
      <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
        <KeyValueRow label={t('band.lock')} value={t(`lock.${device.lockState}`)} testID="fact-lock" />
      </Card>
      {device.lockState === 'locked' ? (
        <Card tone="warning" style={{ gap: 6 }} testID="connected-locked">
          <AppText variant="bodyStrong" color={colors.warning}>
            {t('pairing.lockedDone')}
          </AppText>
          <AppText variant="body">{t('lock.locked.body')}</AppText>
        </Card>
      ) : null}
      <AppText variant="label" muted testID="connected-read-only">
        {t('onboarding.connected.readOnly')}
      </AppText>
    </OnboardingPage>
  );
}
