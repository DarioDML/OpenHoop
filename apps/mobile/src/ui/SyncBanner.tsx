import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Card } from './Card';
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
    <Card tone="accent" style={{ gap: spacing.sm }}>
      <AppText variant="bodyStrong">
        {percent === null || detailed ? t(`sync.phase.${syncProgress.phase}`) : t('sync.bannerPercent', { percent })}
      </AppText>
      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
        <View
          style={{
            height: 6,
            width: `${percent ?? 100}%`,
            backgroundColor: colors.accent,
            opacity: percent === null ? 0.4 : 1,
          }}
        />
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
    </Card>
  );
}
