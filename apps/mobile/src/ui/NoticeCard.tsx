import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Button } from './controls';
import { Icon } from './Icon';
import { radius, spacing, useTheme } from './theme';

export function NoticeCard() {
  const { notice, clearNotice } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  if (!notice) return null;
  return (
    <View
      testID="notice-card"
      style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <Icon name="alert" color={colors.warning} size={22} />
        <AppText variant="body" style={{ flex: 1 }}>
          {t(notice.key, notice.params)}
        </AppText>
      </View>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={t('notice.dismiss')} variant="secondary" onPress={clearNotice} />
      </View>
    </View>
  );
}
