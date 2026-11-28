import { router } from 'expo-router';
import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { CenteredIntro } from '@/ui/health/CenteredIntro';
import { CheckList } from '@/ui/health/CheckList';
import { HealthPage } from '@/ui/health/HealthPage';
import { spacing, useTheme } from '@/ui/theme';

export default function IrregularRhythmScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <HealthPage title={t('health.irregularRhythm.title')} tint="heart" testID="health-irregular-rhythm">
      <CenteredIntro
        icon="lock"
        iconColor={colors.pink}
        iconBackground={colors.pinkSoft}
        heading={t('health.notOffered.title')}
        body={t('health.irregularRhythm.notOffered')}
        testID="not-offered"
      />
      <Card testID="rhythm-can-do">
        <AppText variant="cardTitle">{t('health.irregularRhythm.canDo')}</AppText>
        <CheckList items={[t('health.irregularRhythm.do1'), t('health.irregularRhythm.do2'), t('health.irregularRhythm.do3'), t('health.irregularRhythm.p2')]} />
      </Card>
      <View style={{ gap: spacing.md }}>
        <Button label={t('health.irregularRhythm.record')} onPress={() => router.push('/health/ecg')} testID="rhythm-record" />
        <Button label={t('health.irregularRhythm.provider')} icon="link" variant="soft" onPress={() => router.push('/settings/connect-provider')} testID="rhythm-provider" />
      </View>
      <AppText variant="caption" muted testID="mg-disclaimer">
        {t('health.mg.disclaimer')}
      </AppText>
    </HealthPage>
  );
}
