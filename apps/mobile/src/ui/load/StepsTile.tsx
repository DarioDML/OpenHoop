import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import type { StepsDay } from '@/data/activityDerived';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Icon } from '@/ui/Icon';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { Ring } from '@/ui/Ring';
import { radius, spacing, useTheme } from '@/ui/theme';

interface Props {
  steps: StepsDay;
  goal: number | null;
}

export function StepsTile({ steps, goal }: Props): ReactElement {
  const { colors } = useTheme();
  const { t, language } = useT();
  const fmt = (v: number): string => formatNumber(v, 0, language);
  const fraction = steps.steps === null || goal === null ? null : steps.steps / goal;
  return (
    <Pressable
      testID="steps-card"
      accessibilityRole="link"
      accessibilityLabel={t('metric.steps')}
      onPress={() => router.push('/steps')}
      style={({ pressed }) => ({ flex: 1, gap: 10, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <AppText variant="capSmall" muted>
          {t('metric.steps')}
        </AppText>
        <Icon name="chevronRight" color={colors.textMuted} size={12} />
      </View>
      {steps.steps === null ? (
        <AppText variant="label" muted>
          {t('steps.none')}
        </AppText>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ring size={44} strokeWidth={6} fraction={fraction} color={colors.accent} />
          <Num size={32} style={{ flexShrink: 1 }} adjustsFontSizeToFit testID="steps-card-value">
            {fmt(steps.steps)}
          </Num>
        </View>
      )}
      {steps.steps !== null ? (
        <AppText variant="caption" muted>
          {goal === null ? t('loadScreen.steps.noGoal') : t('steps.ofGoal', { percent: Math.round((steps.steps / goal) * 100), goal: fmt(goal) })}
        </AppText>
      ) : null}
      {steps.source === 'healthConnect' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <ParityBadge level="D" />
          <AppText variant="caption" muted style={{ flex: 1 }} testID="steps-card-source">
            {t('steps.fromHealthConnect')}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
