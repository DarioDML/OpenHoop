import { Pressable, ScrollView, View } from 'react-native';

import type { ActivityType } from '@/data/activityDerived';
import { useT } from '@/i18n/useT';

import { WordFitText } from '../AppText';
import { Icon } from '../Icon';
import { radius, spacing, useTheme } from '../theme';
import { activityIcon, ActivityGlyph } from './ActivityGlyph';

const COLUMNS = 3;

interface GridProps {
  types: readonly ActivityType[];
  onChoose: (type: ActivityType) => void;
  testIDPrefix: string;
}

export function ActivityTypeGrid({ types, onChoose, testIDPrefix }: GridProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const rows: ActivityType[][] = [];
  for (let i = 0; i < types.length; i += COLUMNS) rows.push(types.slice(i, i + COLUMNS));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((row) => (
        <View key={row.join('-')} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((type) => {
            const label = t(`activity.type.${type}`);
            return (
              <Pressable
                key={type}
                testID={`${testIDPrefix}-${type}`}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => onChoose(type)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 92,
                  borderRadius: radius.md,
                  backgroundColor: colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.sm,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.md,
                  opacity: pressed ? 0.8 : 1,
                })}>
                <Icon name={activityIcon(type)} color={colors.text} size={24} strokeWidth={2} />
                <WordFitText variant="label" numberOfLines={2} style={{ fontWeight: '500', textAlign: 'center' }} testID={`${testIDPrefix}-${type}-label`}>
                  {label}
                </WordFitText>
              </Pressable>
            );
          })}
          {Array.from({ length: COLUMNS - row.length }, (_, i) => (
            <View key={`spacer-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

interface RecentProps {
  types: readonly ActivityType[];
  onChoose: (type: ActivityType) => void;
}

export function RecentActivityRow({ types, onChoose }: RecentProps) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} testID="activity-recent">
      {types.map((type) => {
        const label = t(`activity.type.${type}`);
        return (
          <Pressable
            key={type}
            testID={`activity-recent-${type}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onChoose(type)}
            style={({ pressed }) => ({ width: 76, alignItems: 'center', gap: spacing.sm, opacity: pressed ? 0.8 : 1 })}>
            <ActivityGlyph type={type} size={64} />
            <WordFitText variant="caption" color={colors.textSoft} numberOfLines={2} style={{ textAlign: 'center' }}>
              {label}
            </WordFitText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
