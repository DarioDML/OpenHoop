import { router } from 'expo-router';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { KeyValueRow } from '@/ui/manage/rows';
import { radius, spacing, useTheme } from '@/ui/theme';

export default function PairConnectedScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { device } = useAppData();
  const unknown = t('band.unknown');

  return (
    <OnboardingPage
      step={8}
      hideBack
      title={t('onboarding.connected.title')}
      subtitle={t('onboarding.connected.subtitle')}
      primary={{ label: t('common.continue'), onPress: () => router.push('/onboarding/setup'), testID: 'connected-continue' }}>
      <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
        <View style={{ width: 96, height: 96, borderRadius: radius.lg, backgroundColor: colors.positiveSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" color={colors.positive} size={44} strokeWidth={2.5} />
        </View>
      </View>
      <Card style={{ gap: 0 }}>
        <KeyValueRow label={t('band.device')} value={device.name ?? unknown} />
        <KeyValueRow label={t('band.model')} value={device.model ?? unknown} />
        <KeyValueRow label={t('band.battery')} value={device.batteryPercent === null ? unknown : `${device.batteryPercent}${t('unit.percent')}`} />
        <KeyValueRow label={t('band.firmware')} value={device.firmware ?? unknown} />
        <KeyValueRow label={t('band.lock')} value={t(`lock.${device.lockState}`)} />
      </Card>
      {device.lockState === 'locked' ? (
        <Card tone="warning" style={{ gap: 6 }}>
          <AppText variant="bodyStrong" color={colors.warning}>
            {t('pairing.lockedDone')}
          </AppText>
          <AppText variant="body">{t('lock.locked.body')}</AppText>
        </Card>
      ) : null}
      <AppText variant="label" muted>
        {t('onboarding.connected.readOnly')}
      </AppText>
    </OnboardingPage>
  );
}
