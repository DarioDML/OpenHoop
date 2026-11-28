import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { achievements, type Achievement } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { NoDataScreen, ProgressBar } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/Chip';
import { Segmented } from '@/ui/controls';
import { HexBadge } from '@/ui/HexBadge';
import { Icon } from '@/ui/Icon';
import { BADGE_ICON, badgeDescription, badgeName, badgePoints } from '@/ui/plan/badges';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

type Filter = 'all' | 'unlocked' | 'locked';

const COLUMNS = 3;

function rowsOf<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  items.forEach((item, i) => {
    if (i % COLUMNS === 0) rows.push([item]);
    else rows[rows.length - 1]?.push(item);
  });
  return rows;
}

export default function AchievementsScreen() {
  const { days } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Achievement | null>(null);
  if (days.length === 0) return <NoDataScreen title={t('profile.achievements')} tint="community" />;

  const shown = achievements(days).filter((a) => filter === 'all' || (filter === 'unlocked' ? a.unlocked : !a.unlocked));

  return (
    <Screen
      tint="community"
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
      <View style={{ gap: 20 }} testID="achievement-grid">
        {rowsOf(shown).map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: spacing.md }}>
            {row.map((a) => {
              const name = badgeName(t, a, language);
              const progress = t('profile.ach.progress', { current: Math.min(a.current, a.target), target: a.target });
              return (
                <Pressable
                  key={a.id}
                  testID={`ach-${a.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}, ${a.unlocked ? t('profile.ach.unlockedChip') : t('profile.ach.lockedChip')}, ${progress}`}
                  onPress={() => setOpen(a)}
                  style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: spacing.sm, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ alignItems: 'center', gap: spacing.sm, opacity: a.unlocked ? 1 : 0.35 }}>
                    <HexBadge earned={a.unlocked}>
                      <Icon name={BADGE_ICON[a.group]} color={a.unlocked ? colors.gold : colors.textMuted} size={24} strokeWidth={2} />
                    </HexBadge>
                    <AppText variant="caption" color={a.unlocked ? colors.text : colors.textMuted} style={{ textAlign: 'center' }}>
                      {name}
                    </AppText>
                  </View>
                  <View style={{ marginTop: 'auto', alignItems: 'center', gap: spacing.sm }}>
                    <View
                      testID={`ach-${a.id}-pill`}
                      accessibilityElementsHidden={a.unlocked}
                      importantForAccessibility={a.unlocked ? 'no-hide-descendants' : 'auto'}
                      style={{ opacity: a.unlocked ? 0 : 1 }}>
                      <Chip small tone="neutral" label={t('profile.ach.lockedChip')} />
                    </View>
                    <AppText variant="caption" muted numeric testID={`ach-${a.id}-progress`}>
                      {progress}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
            {Array.from({ length: COLUMNS - row.length }, (_, i) => (
              <View key={`pad-${i}`} style={{ flex: 1 }} />
            ))}
          </View>
        ))}
      </View>
      <AppText variant="caption" muted>
        {t('profile.ach.noteLevel')}
      </AppText>
      <Sheet visible={open !== null} onClose={() => setOpen(null)} title={open ? badgeName(t, open, language) : ''} subtitle={open ? badgeDescription(t, open, language) : undefined} testID="achievement-sheet">
        {open ? (
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <HexBadge earned={open.unlocked} size={56}>
                <Icon name={BADGE_ICON[open.group]} color={open.unlocked ? colors.gold : colors.textMuted} size={22} strokeWidth={2} />
              </HexBadge>
              <View style={{ flex: 1, gap: 4 }}>
                <Chip tone={open.unlocked ? 'positive' : 'neutral'} label={open.unlocked ? t('profile.ach.unlockedChip') : t('profile.ach.lockedChip')} />
                <AppText variant="label" muted>
                  {badgePoints(t, open)}
                </AppText>
              </View>
            </View>
            <ProgressBar fraction={open.current / open.target} label={badgeName(t, open, language)} color={open.unlocked ? colors.positive : colors.accent} />
            <AppText variant="label" muted numeric testID="achievement-sheet-progress">
              {t('profile.ach.progress', { current: Math.min(open.current, open.target), target: open.target })}
            </AppText>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
