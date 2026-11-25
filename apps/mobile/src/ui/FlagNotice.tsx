import { View } from 'react-native';

import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { radius, spacing, useTheme } from './theme';

interface Props {
  flags: ReadonlyArray<string>;
}

const FLAG_KEYS: Readonly<Record<string, TranslationKey>> = {
  'clock-offset': 'flag.clock-offset',
};

export function FlagNotice({ flags }: Props) {
  const { t } = useT();
  const { colors } = useTheme();
  const keys = flags.flatMap((flag) => {
    const key = FLAG_KEYS[flag];
    return key ? [key] : [];
  });
  return (
    <>
      {keys.map((key) => (
        <View
          key={key}
          style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft }}>
          <Icon name="alert" color={colors.warning} size={18} />
          <AppText variant="label" style={{ flex: 1 }}>
            {t(key)}
          </AppText>
        </View>
      ))}
    </>
  );
}
