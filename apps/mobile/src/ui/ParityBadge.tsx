import { View } from 'react-native';

import type { ParityLevel } from '@/data/types';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { radius, useTheme, type ColorTokens } from './theme';

export function parityColors(colors: ColorTokens, level: ParityLevel): { fg: string; bg: string } {
  if (level === 'A') return { fg: colors.positive, bg: colors.positiveSoft };
  if (level === 'B') return { fg: colors.info, bg: colors.infoSoft };
  if (level === 'C') return { fg: colors.levelC, bg: colors.purpleSoft };
  return { fg: colors.pink, bg: colors.pinkSoft };
}

interface Props {
  level: ParityLevel;
  long?: boolean;
}

export function ParityBadge({ level, long = false }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const { fg, bg } = parityColors(colors, level);
  return (
    <View
      accessible
      accessibilityLabel={`${t('level.label', { level })}: ${t(`level.${level}`)}`}
      style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: bg, alignSelf: 'flex-start' }}>
      <AppText variant="capSmall" color={fg} style={{ fontSize: 10, lineHeight: 13 }}>
        {long ? t('level.label', { level }) : level}
      </AppText>
    </View>
  );
}
