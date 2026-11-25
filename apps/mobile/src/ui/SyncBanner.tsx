import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { radius, spacing, useTheme } from './theme';

interface Props {
  detailed?: boolean;
}

export function SyncBanner({ detailed = false }: Props) {
  const { syncProgress } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  if (!syncProgress) return null;
  const percent = syncProgress.percent;
  return (
    <View
      testID="sync-banner"
      style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sync" color={colors.link} size={18} />
        </View>
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {percent === null || detailed ? t(`sync.phase.${syncProgress.phase}`) : t('sync.bannerPercent', { percent })}
        </AppText>
      </View>
      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ height: 6, width: `${percent ?? 100}%`, backgroundColor: colors.link, opacity: percent === null ? 0.4 : 1 }} />
      </View>
      {detailed ? (
        <View style={{ gap: 2 }}>
          <AppText variant="label" muted>
            {t('band.syncChunks', { count: syncProgress.chunks })}
          </AppText>
          {percent === null ? null : (
            <AppText variant="label" muted>
              {t('band.syncPercent', { percent })}
            </AppText>
          )}
        </View>
      ) : (
        <AppText variant="label" muted>
          {t('sync.banner')}
        </AppText>
      )}
    </View>
  );
}
