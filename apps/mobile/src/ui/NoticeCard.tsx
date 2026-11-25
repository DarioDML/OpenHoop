import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Card } from './Card';
import { Button } from './controls';
import { spacing, useTheme } from './theme';

export function NoticeCard() {
  const { notice, clearNotice } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  if (!notice) return null;
  return (
    <Card tone="warning" style={{ gap: spacing.md }}>
      <AppText variant="body" color={colors.text}>
        {t(notice.key, notice.params)}
      </AppText>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={t('notice.dismiss')} variant="secondary" onPress={clearNotice} />
      </View>
    </Card>
  );
}
