import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatHm, formatMinutes, planBedtime, typicalWake } from '@/data/dailyDerived';
import { useT } from '@/i18n/useT';
import { formatDuration } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Callout, NoDataPage, Page } from '@/ui/daily/bits';
import { AlarmCard } from '@/ui/daily/cards';
import { Icon } from '@/ui/Icon';
import { Num } from '@/ui/Num';
import { radius, spacing, useTheme } from '@/ui/theme';

type Goal = 'full' | 'enough';
const GOAL_FRACTION: Readonly<Record<Goal, number>> = { full: 1, enough: 0.85 };
const WAKE_STEP_MIN = 15;

export default function SleepPlannerScreen() {
  const { days } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [goal, setGoal] = useState<Goal>('full');
  const [wakeShift, setWakeShift] = useState(0);
  const index = days.length - 1;
  const day = days[index];
  if (!day) return <NoDataPage title={t('sleepx.planner')} body={t('empty.body')} />;

  const need = day.sleep.need.value;
  const target = need === null ? null : need * GOAL_FRACTION[goal];
  const typical = typicalWake(days, index);
  const wakeOverride = typical === null ? null : (((typical.minutes + wakeShift) % 1440) + 1440) % 1440;
  const plan = target === null ? null : planBedtime(days, index, target, wakeOverride);

  const goalRow = (id: Goal, label: string, hint: string) => {
    const selected = goal === id;
    return (
      <Pressable
        key={id}
        testID={`goal-${id}`}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPress={() => setGoal(id)}
        style={{
          minHeight: 64,
          padding: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: colors.surface,
          gap: 2,
        }}>
        <AppText variant="bodyStrong">{label}</AppText>
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      </Pressable>
    );
  };

  const stepper = (label: string, delta: number, glyph: string) => (
    <Pressable
      testID={delta < 0 ? 'wake-earlier' : 'wake-later'}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={typical === null}
      onPress={() => setWakeShift((v) => v + delta)}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', opacity: typical === null ? 0.4 : 1 }}>
      <AppText variant="title">{glyph}</AppText>
    </Pressable>
  );

  return (
    <Page title={t('sleepx.planner')} tint="sleep" testID="sleep-planner">
      <AppText variant="capLarge" muted>
        {t('sleepx.goalTonight')}
      </AppText>
      <View style={{ gap: spacing.sm }}>
        {goalRow('full', t('sleepx.goalFull'), need === null ? t('reason.needs-history') : t('sleepx.goalFullHint', { need: formatHm(need) }))}
        {goalRow('enough', t('sleepx.goalEnough'), need === null ? t('reason.needs-history') : t('sleepx.goalEnoughHint', { need: formatHm(need * GOAL_FRACTION.enough) }))}
      </View>

      <Card testID="plan-result" style={{ gap: spacing.md }}>
        {plan ? (
          <>
            <View style={{ gap: spacing.lg }}>
              <View style={{ gap: 4 }}>
                <AppText variant="capSmall" muted>
                  {t('sleepx.bedBy')}
                </AppText>
                <Num size={44} testID="plan-bed">
                  {formatMinutes(plan.bedMinutes)}
                </Num>
              </View>
              <View style={{ gap: 4 }}>
                <AppText variant="capSmall" muted>
                  {t('sleepx.wake')}
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  {stepper(t('sleepx.wakeEarlier'), -WAKE_STEP_MIN, '−')}
                  <Num size={44} testID="plan-wake">
                    {formatMinutes(plan.wakeMinutes)}
                  </Num>
                  {stepper(t('sleepx.wakeLater'), WAKE_STEP_MIN, '+')}
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <Icon name="info" color={colors.textMuted} size={16} />
              <AppText variant="caption" muted style={{ flex: 1 }} testID="plan-basis">
                {t('sleepx.plannerBasis', {
                  target: target === null ? '' : formatDuration(t, target),
                  awake: formatDuration(t, plan.awakeInBedS),
                  nights: plan.nights,
                })}
              </AppText>
            </View>
          </>
        ) : (
          <AppText variant="body" muted testID="plan-none">
            {need === null ? t('sleepx.plannerNoNeed') : t('sleepx.plannerNoWake')}
          </AppText>
        )}
      </Card>

      <View style={{ flexDirection: 'row' }}>
        <AlarmCard testID="planner-alarm" />
      </View>
      <Callout title={t('sleepx.plannerNoteTitle')} body={t('sleepx.plannerNote')} />
    </Page>
  );
}
