import { View } from 'react-native';

import type { ParityLevel } from '@/data/types';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { useTheme } from './theme';

interface Props {
  level: ParityLevel;
}

export function ParityBadge({ level }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <View
      accessible
      accessibilityLabel={`${t('level.label', { level })}: ${t(`level.${level}`)}`}
      style={{
        minWidth: 20,
        height: 20,
        paddingHorizontal: 5,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText variant="caption" color={colors.textMuted} style={{ fontWeight: '700', lineHeight: 14 }}>
        {level}
      </AppText>
    </View>
  );
}
