import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import type { TranslationKey } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { spacing } from '@/ui/theme';

const CHECKS: ReadonlyArray<TranslationKey> = ['selftest.driver', 'selftest.sync', 'selftest.pipeline'];

export default function SelfTestScreen() {
  const { t } = useT();
  return (
    <Screen>
      <AppText variant="body" muted>
        {t('selftest.intro')}
      </AppText>
      <View style={{ gap: spacing.md }}>
        {CHECKS.map((key) => (
          <Card key={key} style={{ gap: 4 }}>
            <AppText variant="bodyStrong">{t(key)}</AppText>
            <AppText variant="label" muted>
              {t('selftest.pending')}
            </AppText>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
