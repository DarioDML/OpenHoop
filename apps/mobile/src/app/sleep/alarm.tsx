import type { AlarmEvent } from '@openhoop/core';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { MONDAY_FIRST, WINDOW_CHOICES_MIN, confirmedAlarm, rangEarly, sameDays, shiftMinutes, toggleDay, type AlarmMode, type AlarmPlan } from '@/data/alarm';
import { GOAL_WINDOW_S } from '@/data/smartWake';
import { useAppData } from '@/data/context';
import { formatHm, formatMinutes, singleParam } from '@/data/dailyDerived';
import { useT, type TFunction } from '@/i18n/useT';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { formatClock, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, RadioRow, Segmented } from '@/ui/controls';
import { Callout, Page } from '@/ui/daily/bits';
import { ToggleRow } from '@/ui/manage/rows';
import { Num } from '@/ui/Num';
import { radius, spacing, useTheme } from '@/ui/theme';

const STEP_MIN = 5;
const HOUR_MIN = 60;
const RING_WINDOW_S = 120;
const DAY_MIN = 1440;

type WindowChoice = 'off' | `${number}`;

function clockAt(unixS: number): string {
  return formatClock(unixS, deviceTzOffsetS(new Date(unixS * 1000)));
}

function localDay(unixS: number): string {
  return unixToIsoDate(unixS, deviceTzOffsetS(new Date(unixS * 1000)));
}

export function wakeLabel(t: TFunction, language: 'nl' | 'en', unixS: number, nowS: number): string {
  const time = formatClock(unixS, deviceTzOffsetS(new Date(unixS * 1000)));
  const day = localDay(unixS);
  if (day === localDay(nowS)) return t('alarm.today', { time });
  if (day === localDay(nowS + 86_400)) return t('alarm.tomorrow', { time });
  return t('alarm.onDay', { day: formatShortDay(day, language), time });
}

export function lastRing(events: readonly AlarmEvent[]): { at: number; endedBy: AlarmEvent['endedBy'] } | null {
  const fired = events.find((event) => event.kind === 'fired' || event.kind === 'app-fired');
  if (fired === undefined) return null;
  const ended = events.find((event) => event.kind === 'haptics-ended' && event.t >= fired.t && event.t <= fired.t + RING_WINDOW_S);
  return { at: fired.t, endedBy: ended?.endedBy ?? null };
}

function samePlan(a: AlarmPlan, b: AlarmPlan): boolean {
  return a.enabled === b.enabled && a.minutes === b.minutes && a.mode === b.mode && a.windowMin === b.windowMin && sameDays(a.days, b.days);
}

function plannerMinutes(raw: string | null): number | null {
  if (raw === null || !/^\d{1,4}$/.test(raw)) return null;
  const minutes = Number(raw);
  return minutes >= 0 && minutes < DAY_MIN ? minutes : null;
}

function weekdayName(day: number, language: 'nl' | 'en', style: 'long' | 'narrow'): string {
  const sunday = Date.UTC(2024, 0, 7);
  return new Date(sunday + day * 86_400_000).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: style, timeZone: 'UTC' });
}

export default function HapticAlarmScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ minutes?: string | string[] }>();
  const { alarm, alarmActions, device, days } = useAppData();
  const fromPlanner = plannerMinutes(singleParam(params.minutes));
  const [edit, setEdit] = useState<AlarmPlan | null>(() => (fromPlanner === null || (alarm.plan.enabled && alarm.plan.minutes === fromPlanner) ? null : { ...alarm.plan, enabled: true, minutes: fromPlanner }));
  const draft = edit ?? alarm.plan;
  const setDraft = (change: (plan: AlarmPlan) => AlarmPlan): void => setEdit(change(draft));
  const [saving, setSaving] = useState(false);
  const [ringing, setRinging] = useState(false);
  const nowS = Math.floor(Date.now() / 1000);
  const need = days[days.length - 1]?.sleep.need.value ?? null;

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await alarmActions.save(draft);
      setEdit(null);
    } finally {
      setSaving(false);
    }
  };
  const ring = async (): Promise<void> => {
    setRinging(true);
    try {
      await alarmActions.ring();
    } finally {
      setRinging(false);
    }
  };

  const armed = confirmedAlarm(alarm.armed, nowS);
  const early = rangEarly(alarm.armed, nowS);
  const status = armed !== null ? t('alarm.status.armed', { when: wakeLabel(t, language, armed.wakeAt, nowS) }) : t(alarm.plan.enabled ? 'alarm.status.pending' : 'alarm.status.off');
  const smartOk = alarm.smartAvailable;
  const mode: AlarmMode = smartOk ? draft.mode : 'exact';
  const startMin = mode === 'goal' ? GOAL_WINDOW_S / 60 : draft.windowMin;
  const time = formatMinutes(draft.minutes);
  const modeBody =
    mode === 'exact'
      ? t('sleepx.alarmExact')
      : t(mode === 'goal' ? 'alarm.smart.howGoal' : 'alarm.smart.howWindow', {
          start: formatMinutes(shiftMinutes(draft.minutes, -startMin)),
          time,
        });
  const windowLine = !draft.enabled
    ? t('alarmx.offLine')
    : mode === 'exact'
      ? t('alarmx.exactLine', { time })
      : t('alarmx.window', { start: formatMinutes(shiftMinutes(draft.minutes, -startMin)), end: time });
  const rang = lastRing(alarm.events);
  const busy = saving || device.connection === 'syncing' || device.connection === 'connecting';
  const windowValue: WindowChoice = mode === 'window' ? `${draft.windowMin}` : 'off';

  const setMode = (next: AlarmMode): void => setDraft((plan) => ({ ...plan, mode: next }));
  const setWindow = (value: WindowChoice): void =>
    setDraft((plan) => (value === 'off' ? { ...plan, mode: 'exact' } : { ...plan, mode: 'window', windowMin: Number(value) }));

  const stepper = (delta: number, glyph: string, testID: string, label: string) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => setDraft((plan) => ({ ...plan, minutes: shiftMinutes(plan.minutes, delta) }))}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <AppText variant="title">{glyph}</AppText>
    </Pressable>
  );

  return (
    <Page
      title={t('sleepx.alarm')}
      tint="sleep"
      testID="sleep-alarm"
      hero={
        <View style={{ alignItems: 'center', gap: spacing.sm, opacity: draft.enabled ? 1 : 0.6 }}>
          <Num size={96} testID="alarm-time" adjustsFontSizeToFit>
            {time}
          </Num>
          <AppText variant="body" color={colors.levelC} testID="alarm-window-line">
            {windowLine}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs }}>
            {stepper(-HOUR_MIN, '«', 'alarm-hour-earlier', t('alarm.hourEarlier'))}
            {stepper(-STEP_MIN, '−', 'alarm-earlier', t('alarm.earlier'))}
            {stepper(STEP_MIN, '+', 'alarm-later', t('alarm.later'))}
            {stepper(HOUR_MIN, '»', 'alarm-hour-later', t('alarm.hourLater'))}
          </View>
        </View>
      }>
      {edit !== null && fromPlanner !== null && edit.minutes === fromPlanner ? (
        <AppText variant="label" muted testID="alarm-from-planner">
          {t('alarmx.fromPlanner')}
        </AppText>
      ) : null}

      <Card style={{ paddingVertical: spacing.xs }}>
        <ToggleRow title={t('alarm.enabled')} subtitle={t('sleepx.alarmIntro')} value={draft.enabled} onChange={(enabled) => setDraft((plan) => ({ ...plan, enabled }))} testID="alarm-enabled" />
      </Card>

      <AppText variant="capLarge" muted accessibilityRole="header" style={{ marginTop: spacing.sm }}>
        {t('alarmx.type')}
      </AppText>
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        <RadioRow label={t('alarmx.exact')} subtitle={t('alarmx.exactHint', { time })} selected={mode === 'exact'} onSelect={() => setMode('exact')} testID="alarm-type-exact" />
        {smartOk ? (
          <>
            <RadioRow
              label={t('alarmx.goal')}
              subtitle={need === null ? t('alarmx.goalHintNoNeed') : t('alarmx.goalHint', { need: formatHm(need) })}
              selected={mode === 'goal'}
              onSelect={() => setMode('goal')}
              testID="alarm-type-goal"
            />
            <RadioRow label={t('alarmx.green')} subtitle={t('alarmx.greenHint')} selected={mode === 'window'} onSelect={() => setMode('window')} testID="alarm-type-window" />
          </>
        ) : null}
      </View>

      {smartOk ? (
        <View style={{ gap: 10, marginTop: spacing.sm }}>
          <AppText variant="capLarge" muted accessibilityRole="header">
            {t('alarmx.smartWindow')}
          </AppText>
          {mode === 'goal' ? (
            <AppText variant="label" muted testID="alarm-goal-window">
              {t('alarmx.goalWindow')}
            </AppText>
          ) : (
            <Segmented<WindowChoice>
              value={windowValue}
              onChange={setWindow}
              options={[{ value: 'off', label: t('alarmx.off') }, ...WINDOW_CHOICES_MIN.map((minutes) => ({ value: `${minutes}` as const, label: t('alarm.window.minutes', { minutes }) }))]}
              testID="alarm-window"
            />
          )}
        </View>
      ) : null}

      <AppText variant="label" muted testID="alarm-mode-body">
        {modeBody}
      </AppText>

      <View style={{ gap: 10, marginTop: spacing.sm }}>
        <AppText variant="capLarge" muted accessibilityRole="header">
          {t('alarmx.repeat')}
        </AppText>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 4 }} testID="alarm-days">
          {MONDAY_FIRST.map((day) => {
            const on = draft.days.includes(day);
            const only = on && draft.days.length === 1;
            return (
              <Pressable
                key={day}
                testID={`alarm-day-${day}`}
                accessibilityRole="checkbox"
                accessibilityLabel={weekdayName(day, language, 'long')}
                accessibilityState={{ checked: on, disabled: only }}
                disabled={only}
                onPress={() => setDraft((plan) => ({ ...plan, days: toggleDay(plan.days, day) }))}
                style={{ width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.purple : colors.surfaceAlt }}>
                <AppText variant="bodyStrong" color={on ? colors.primaryOn : colors.textMuted}>
                  {weekdayName(day, language, 'narrow').toUpperCase()}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <AppText variant="caption" muted>
          {t('alarmx.repeatHint')}
        </AppText>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
        <Button
          label={ringing ? t('alarm.ringing') : t('alarmx.testVibration')}
          variant="soft"
          icon="load"
          onPress={() => void ring()}
          disabled={busy || ringing}
          testID="alarm-test"
          style={{ flex: 1.6 }}
        />
        <Button label={saving ? t('alarm.saving') : t('common.save')} onPress={() => void save()} disabled={busy || samePlan(draft, alarm.plan)} testID="alarm-save" style={{ flex: 1 }} />
      </View>

      <Card testID="alarm-status" style={{ gap: 6 }}>
        <AppText variant="capSmall" muted>
          {t('alarm.status.title')}
        </AppText>
        <AppText variant="bodyStrong" testID="alarm-status-text">
          {status}
        </AppText>
        {early !== null ? (
          <AppText variant="label" muted testID="alarm-rang-early">
            {t('alarm.status.rangEarly', { time: clockAt(early) })}
          </AppText>
        ) : null}
        {alarm.problem !== null ? (
          <AppText variant="label" color={colors.warning} testID="alarm-problem">
            {t(alarm.problem.key, alarm.problem.params)}
          </AppText>
        ) : null}
        {rang !== null ? (
          <AppText variant="label" muted testID="alarm-last">
            {t(rang.endedBy === 'stopped' ? 'alarm.lastStopped' : rang.endedBy === 'expired' ? 'alarm.lastExpired' : 'alarm.last', {
              when: wakeLabel(t, language, Math.round(rang.at / 60) * 60, nowS),
            })}
          </AppText>
        ) : null}
      </Card>

      <View style={{ gap: spacing.sm }} testID="alarm-smart">
        <AppText variant="bodyStrong">{t('alarm.smartTitle')}</AppText>
        <AppText variant="label" muted>
          {smartOk ? t('alarm.smart.needs') : t('alarm.smart.unavailable')}
        </AppText>
      </View>

      <Callout title={t('alarm.howTitle')} body={t('alarm.howBody')} />
    </Page>
  );
}
