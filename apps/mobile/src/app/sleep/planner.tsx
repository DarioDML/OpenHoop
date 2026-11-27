import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatHm, formatMinutes, typicalWake } from '@/data/dailyDerived';
import { GET_BY_FRACTION, PLAN_MET_FRACTION, WIND_DOWN_LEAD_MIN, effectiveGoal, planNights, tonightPlan, windDownAt } from '@/data/sleepDerived';
import { SLEEP_GOALS, type SleepGoal } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { formatDuration } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, RadioRow } from '@/ui/controls';
import { Callout, NoDataPage, Page } from '@/ui/daily/bits';
import { AlarmCard } from '@/ui/daily/cards';
import { Icon } from '@/ui/Icon';
import { Num } from '@/ui/Num';
import { spacing, useTheme } from '@/ui/theme';

const WAKE_STEP_MIN = 15;

type WindState = { kind: 'set'; at: number } | { kind: 'denied' } | { kind: 'failed' } | { kind: 'past' } | null;

function clockOf(ms: number): string {
  const date = new Date(ms);
  return formatMinutes(date.getHours() * 60 + date.getMinutes());
}

export default function SleepPlannerScreen() {
  const { days, userData, updateUserData, notificationPermission, requestNotificationPermission } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const weekly = userData.weeklyPlan;
  const [goal, setGoal] = useState<SleepGoal>(() => effectiveGoal(userData.sleepGoal, weekly !== null));
  const [wakeShift, setWakeShift] = useState(0);
  const [wind, setWind] = useState<WindState>(null);
  const [busy, setBusy] = useState(false);
  const index = days.length - 1;
  const day = days[index];
  if (!day) return <NoDataPage title={t('sleepx.planner')} body={t('empty.body')} />;

  const need = day.sleep.need.value;
  const typical = typicalWake(days, index);
  const wakeOverride = typical === null ? null : (((typical.minutes + wakeShift) % 1440) + 1440) % 1440;
  const tonight = tonightPlan(days, index, goal, weekly?.sleepNights ?? null, wakeOverride);
  const plan = tonight?.bed ?? null;
  const nights = weekly === null ? null : planNights(days, index, weekly.sleepNights);

  const choose = (next: SleepGoal): void => {
    setGoal(next);
    setWind(null);
    void updateUserData({ sleepGoal: next });
  };

  const hint = (id: SleepGoal): string => {
    if (id === 'plan') {
      if (nights === null) return t('planner.goal.planNone');
      if (need === null) return t('planner.goal.noNeed');
      return nights.met >= nights.target
        ? t('planner.goal.planMetHint', { target: nights.target, need: formatHm(need * PLAN_MET_FRACTION) })
        : t('planner.goal.planHint', { met: nights.met, target: nights.target, need: formatHm(need) });
    }
    if (need === null) return t('planner.goal.noNeed');
    return id === 'peak' ? t('planner.goal.peakHint', { need: formatHm(need) }) : t('planner.goal.getByHint', { need: formatHm(need * GET_BY_FRACTION) });
  };

  const remind = async (): Promise<void> => {
    if (plan === null || busy) return;
    const at = windDownAt(plan.bedMinutes, new Date());
    if (at === null) {
      setWind({ kind: 'past' });
      return;
    }
    setBusy(true);
    try {
      const permission = notificationPermission === 'granted' ? 'granted' : await requestNotificationPermission();
      if (permission !== 'granted') {
        setWind({ kind: 'denied' });
        return;
      }
      setWind((await updateUserData({ windDown: { at, bed: plan.bedMinutes } })) ? { kind: 'set', at } : { kind: 'failed' });
    } finally {
      setBusy(false);
    }
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

  const windText =
    wind === null
      ? null
      : wind.kind === 'set'
        ? t('planner.windDownSet', { time: clockOf(wind.at), lead: WIND_DOWN_LEAD_MIN })
        : wind.kind === 'denied'
          ? t('planner.windDownDenied')
          : wind.kind === 'past'
            ? t('planner.windDownPast', { lead: WIND_DOWN_LEAD_MIN })
            : t('planner.windDownFailed');

  return (
    <Page title={t('sleepx.planner')} tint="sleep" testID="sleep-planner">
      <AppText variant="capLarge" muted accessibilityRole="header">
        {t('sleepx.goalTonight')}
      </AppText>
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        {SLEEP_GOALS.map((id) => (
          <RadioRow
            key={id}
            testID={`goal-${id}`}
            label={t(`planner.goal.${id}`)}
            subtitle={hint(id)}
            selected={goal === id}
            disabled={id === 'plan' && weekly === null}
            onSelect={() => choose(id)}
          />
        ))}
      </View>

      <Card testID="plan-result" style={{ gap: spacing.md }}>
        {plan ? (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1, gap: 6 }}>
                <AppText variant="capSmall" muted>
                  {t('sleepx.bedBy')}
                </AppText>
                <Num size={48} testID="plan-bed" adjustsFontSizeToFit>
                  {formatMinutes(plan.bedMinutes)}
                </Num>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <AppText variant="capSmall" muted>
                  {t('sleepx.wake')}
                </AppText>
                <Num size={48} testID="plan-wake" adjustsFontSizeToFit>
                  {formatMinutes(plan.wakeMinutes)}
                </Num>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm }}>
              {stepper(t('sleepx.wakeEarlier'), -WAKE_STEP_MIN, '−')}
              {stepper(t('sleepx.wakeLater'), WAKE_STEP_MIN, '+')}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <Icon name="info" color={colors.textMuted} size={16} />
              <AppText variant="label" muted style={{ flex: 1 }} testID="plan-basis">
                {t('sleepx.plannerBasis', {
                  target: tonight === null ? '' : formatDuration(t, tonight.targetS),
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

      {plan ? (
        <>
          <Button label={t('alarm.save')} testID="planner-set-alarm" onPress={() => router.push(`/sleep/alarm?minutes=${Math.round(plan.wakeMinutes) % 1440}`)} />
          <Button label={t('planner.windDown')} variant="soft" testID="planner-wind-down" disabled={busy} onPress={() => void remind()} />
        </>
      ) : null}
      {windText !== null ? (
        <AppText variant="label" color={wind?.kind === 'set' ? colors.positive : colors.warning} testID="planner-wind-status" accessibilityLiveRegion="polite">
          {windText}
        </AppText>
      ) : null}

      <View style={{ flexDirection: 'row' }}>
        <AlarmCard testID="planner-alarm" />
      </View>
      <Callout title={t('sleepx.plannerNoteTitle')} body={t('sleepx.plannerNote')} />
    </Page>
  );
}
