import { useState } from 'react';
import { View } from 'react-native';

import { achievements } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { NoDataScreen, ProgressBar } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Segmented } from '@/ui/controls';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

type Filter = 'all' | 'unlocked' | 'locked';

export default function AchievementsScreen() {
  const { days } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  if (days.length === 0) return <NoDataScreen title={t('profile.achievements')} tint="neutral" />;

  const shown = achievements(days).filter((a) => filter === 'all' || (filter === 'unlocked' ? a.unlocked : !a.unlocked));

  return (
    <Screen
      tint="neutral"
      testID="achievements-screen"
      header={
        <>
          <TopBar title={t('profile.achievements')} />
          <Segmented
            testID="achievement-filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('profile.ach.all') },
              { value: 'unlocked', label: t('profile.ach.unlocked') },
              { value: 'locked', label: t('profile.ach.locked') },
            ]}
          />
        </>
      }>
      {shown.length === 0 ? (
        <AppText variant="body" muted>
          {t('profile.ach.none')}
        </AppText>
      ) : null}
      {shown.map((a) => {
        const title = t(`profile.ach.${a.group}`, { count: a.target });
        return (
          <Card key={a.id} testID={`ach-${a.id}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
              <AppText variant="cardTitle" style={{ flex: 1 }}>
                {title}
              </AppText>
              <Chip tone={a.unlocked ? 'positive' : 'neutral'} label={a.unlocked ? t('profile.ach.unlockedChip') : t('profile.ach.lockedChip')} />
            </View>
            <ProgressBar fraction={a.current / a.target} label={title} color={a.unlocked ? colors.positive : colors.accent} />
            <AppText variant="label" muted numeric>
              {t('profile.ach.progress', { current: Math.min(a.current, a.target), target: a.target })}
            </AppText>
          </Card>
        );
      })}
      <AppText variant="caption" muted>
        {t('profile.ach.note')}
      </AppText>
    </Screen>
  );
}
