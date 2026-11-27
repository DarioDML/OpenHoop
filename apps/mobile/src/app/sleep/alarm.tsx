import type { AlarmEvent } from '@openhoop/core';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ALARM_MODES, WINDOW_CHOICES_MIN, confirmedAlarm, rangEarly, shiftMinutes, type AlarmMode, type AlarmPlan } from '@/data/alarm';
import { GOAL_WINDOW_S } from '@/data/smartWake';
import { useAppData } from '@/data/context';
import { formatMinutes } from '@/data/dailyDerived';
import { useT, type TFunction } from '@/i18n/useT';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { formatClock, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Segmented } from '@/ui/controls';
import { Callout, Page } from '@/ui/daily/bits';
import { ToggleRow } from '@/ui/manage/rows';
import { Num } from '@/ui/Num';
import { spacing, useTheme } from '@/ui/theme';

const STEP_MIN = 5;
const HOUR_MIN = 60;
const RING_WINDOW_S = 120;

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
  return a.enabled === b.enabled && a.minutes === b.minutes && a.mode === b.mode && a.windowMin === b.windowMin;
}

export default function HapticAlarmScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { alarm, alarmActions, device } = useAppData();
  const [edit, setEdit] = useState<AlarmPlan | null>(null);
  const draft = edit ?? alarm.plan;
  const setDraft = (change: (plan: AlarmPlan) => AlarmPlan): void => setEdit(change(draft));
  const [saving, setSaving] = useState(false);
  const [ringing, setRinging] = useState(false);
  const nowS = Math.floor(Date.now() / 1000);

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
  const status =
    early !== null
      ? t('alarm.status.rangEarly', { time: clockAt(early) })
      : armed !== null
        ? t('alarm.status.armed', { when: wakeLabel(t, language, armed.wakeAt, nowS) })
        : t(alarm.plan.enabled ? 'alarm.status.pending' : 'alarm.status.off');
  const smartOk = alarm.smartAvailable;
  const startMin = draft.mode === 'goal' ? GOAL_WINDOW_S / 60 : draft.windowMin;
  const modeBody =
    !smartOk || draft.mode === 'exact'
      ? t('sleepx.alarmExact')
      : t(draft.mode === 'goal' ? 'alarm.smart.howGoal' : 'alarm.smart.howWindow', {
          start: formatMinutes(shiftMinutes(draft.minutes, -startMin)),
          time: formatMinutes(draft.minutes),
        });
  const rang = lastRing(alarm.events);
  const busy = saving || device.connection === 'syncing' || device.connection === 'connecting';

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
    <Page title={t('sleepx.alarm')} tint="sleep" testID="sleep-alarm">
      <AppText variant="body" muted>
        {t('sleepx.alarmIntro')}
      </AppText>

      <Card style={{ gap: spacing.md }}>
        <ToggleRow title={t('alarm.enabled')} value={draft.enabled} onChange={(enabled) => setDraft((plan) => ({ ...plan, enabled }))} testID="alarm-enabled" />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, opacity: draft.enabled ? 1 : 0.5 }}>
          {stepper(-HOUR_MIN, '«', 'alarm-hour-earlier', t('alarm.hourEarlier'))}
          {stepper(-STEP_MIN, '−', 'alarm-earlier', t('alarm.earlier'))}
          <Num size={44} testID="alarm-time">
            {formatMinutes(draft.minutes)}
          </Num>
          {stepper(STEP_MIN, '+', 'alarm-later', t('alarm.later'))}
          {stepper(HOUR_MIN, '»', 'alarm-hour-later', t('alarm.hourLater'))}
        </View>
        <AppText variant="capSmall" muted>
          {t('alarm.mode.title')}
        </AppText>
        <Segmented<AlarmMode>
          value={smartOk ? draft.mode : 'exact'}
          onChange={(mode) => setDraft((plan) => ({ ...plan, mode }))}
          options={ALARM_MODES.filter((mode) => smartOk || mode === 'exact').map((mode) => ({ value: mode, label: t(`alarm.mode.${mode}`) }))}
          testID="alarm-mode"
        />
        {smartOk && draft.mode === 'window' ? (
          <>
            <AppText variant="capSmall" muted>
              {t('alarm.window.title')}
            </AppText>
            <Segmented<string>
              value={String(draft.windowMin)}
              onChange={(value) => setDraft((plan) => ({ ...plan, windowMin: Number(value) }))}
              options={WINDOW_CHOICES_MIN.map((minutes) => ({ value: String(minutes), label: t('alarm.window.minutes', { minutes }) }))}
              testID="alarm-window"
            />
          </>
        ) : null}
        <AppText variant="label" muted testID="alarm-mode-body">
          {modeBody}
        </AppText>
        <Button label={saving ? t('alarm.saving') : t('alarm.save')} onPress={() => void save()} disabled={busy || samePlan(draft, alarm.plan)} testID="alarm-save" />
      </Card>

      <Card testID="alarm-status" style={{ gap: 6 }}>
        <AppText variant="capSmall" muted>
          {t('alarm.status.title')}
        </AppText>
        <AppText variant="bodyStrong" testID="alarm-status-text">
          {status}
        </AppText>
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

      <Button label={ringing ? t('alarm.ringing') : t('alarm.test')} variant="secondary" onPress={() => void ring()} disabled={busy || ringing} testID="alarm-test" />

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
