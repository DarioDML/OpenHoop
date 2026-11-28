import { router } from 'expo-router';
import { View } from 'react-native';

import { useCoach } from '@/coach/CoachContext';
import type { DayRecord } from '@openhoop/core';

import { chipStatus, type ChipStatus } from '@/coach/chipStatus';
import type { CheckIn } from '@/coach/checkIns';
import { COACH_METRIC_SPECS, type CoachMetric } from '@/coach/metrics';
import type { CheckInReplyKind } from '@/coach/prefs';
import type { ResolvedChip } from '@/coach/reply';
import { useAppData } from '@/data/context';
import type { Language } from '@/data/types';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { featureEnabled } from '@/net/features';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { ParityBadge } from '@/ui/ParityBadge';
import { StateCard } from '@/ui/StateCard';
import { radius, spacing, useTheme, type ColorTokens } from '@/ui/theme';

export type CoachGate = 'loading' | 'coach-off' | 'network-off' | 'no-key' | 'ready';

export function useCoachGate(): CoachGate {
  const { userData } = useAppData();
  const { state } = useCoach();
  if (!userData.coach.enabled) return 'coach-off';
  if (!featureEnabled(userData.network, 'coach')) return 'network-off';
  if (!state.ready) return 'loading';
  return state.hasKey ? 'ready' : 'no-key';
}

export function formatMetric(t: TFunction, language: Language, metric: CoachMetric, value: number): string {
  const spec = COACH_METRIC_SPECS[metric];
  const number = formatNumber(value, spec.decimals, language);
  return spec.unitKey ? `${number} ${t(spec.unitKey)}` : number;
}

export function GateState({ gate }: { gate: CoachGate }) {
  const { t } = useT();
  if (gate === 'coach-off') {
    return (
      <StateCard
        icon="coach"
        tone="purple"
        title={t('coach.coachOffTitle')}
        body={t('coach.coachOffBody')}
        actionLabel={t('coach.coachOffAction')}
        onAction={() => router.push('/coach/settings')}
        testID="coach-state-off"
      />
    );
  }
  if (gate === 'network-off') {
    return (
      <StateCard
        icon="offline"
        tone="neutral"
        title={t('coach.offTitle')}
        body={t('coach.offBody')}
        actionLabel={t('coach.offAction')}
        onAction={() => router.push('/settings/privacy')}
        testID="coach-state-network-off"
      />
    );
  }
  if (gate === 'no-key') {
    return (
      <StateCard
        icon="lock"
        tone="purple"
        title={t('coach.keyTitle')}
        body={t('coach.keyBody')}
        actionLabel={t('coach.keyAction')}
        onAction={() => router.push('/coach/settings')}
        testID="coach-state-no-key"
      />
    );
  }
  return null;
}

function deltaText(language: Language, status: ChipStatus): string {
  const delta = status.delta;
  if (delta === null || Math.round(delta.value) === 0) return '';
  const arrow = delta.value > 0 ? '↑' : '↓';
  return ` ${arrow}${formatNumber(Math.abs(delta.value), 0, language)}${delta.kind === 'pct' ? '%' : ''}`;
}

function toneColors(colors: ColorTokens, status: ChipStatus): { fg: string; bg: string } {
  if (status.tone === 'better') return { fg: colors.positive, bg: colors.positiveSoft };
  if (status.tone === 'worse') return { fg: colors.warning, bg: colors.warningSoft };
  return { fg: colors.textSoft, bg: colors.surface };
}

export function MetricChips({ chips, days, testID }: { chips: readonly ResolvedChip[]; days?: readonly DayRecord[]; testID?: string }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  if (chips.length === 0) return null;
  const latest = days?.[days.length - 1]?.day ?? null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} testID={testID}>
      {chips.map((chip) => {
        const status: ChipStatus = days === undefined ? { tone: 'unknown', delta: null } : chipStatus(days, chip.metric, chip.day, chip.value);
        const tone = toneColors(colors, status);
        const day = chip.day === latest ? '' : ` · ${formatShortDay(chip.day, language)}`;
        const label = `${t(COACH_METRIC_SPECS[chip.metric].labelKey)} ${formatMetric(t, language, chip.metric, chip.value)}${deltaText(language, status)}${day}`;
        return (
          <View
            key={`${chip.metric}:${chip.day}`}
            accessible
            accessibilityLabel={`${label}, ${t(`coach.chipTone.${status.tone}`)}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: tone.bg }}>
            <AppText variant="label" color={tone.fg} numeric style={{ fontWeight: '600' }}>
              {label}
            </AppText>
            <ParityBadge level={COACH_METRIC_SPECS[chip.metric].level} />
          </View>
        );
      })}
    </View>
  );
}

export function checkInQuestion(t: TFunction, language: Language, checkIn: CheckIn): string {
  const params = {
    metric: t(COACH_METRIC_SPECS[checkIn.metric].labelKey),
    day: formatShortDay(checkIn.day, language),
    value: formatMetric(t, language, checkIn.metric, checkIn.value),
    usual: formatMetric(t, language, checkIn.metric, checkIn.usual),
  };
  return checkIn.kind === 'week' ? t('coach.checkIn.weekQuestion', params) : t('coach.checkIn.question', params);
}

export function replyQuestion(t: TFunction, language: Language, checkIn: CheckIn, reply: Exclude<CheckInReplyKind, 'later'>): string {
  return `${checkInQuestion(t, language, checkIn)} ${t(`coach.checkIn.replyAsk.${reply}`)}`;
}

interface CheckInCardProps {
  checkIn: CheckIn;
  onAsk: () => void;
  onDismiss: () => void;
}

export function CheckInCard({ checkIn, onAsk, onDismiss }: CheckInCardProps) {
  const { t, language } = useT();
  const spec = COACH_METRIC_SPECS[checkIn.metric];
  const label = t(spec.labelKey);
  return (
    <Card style={{ gap: spacing.md }} testID={`check-in-${checkIn.id}`}>
      <AppText variant="bodyStrong">
        {checkIn.kind === 'week' ? t('coach.checkIn.weekTitle', { metric: label }) : t(checkIn.direction === 'up' ? 'coach.checkIn.up' : 'coach.checkIn.down', { metric: label })}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
        <AppText variant="title" numeric>
          {formatMetric(t, language, checkIn.metric, checkIn.value)}
        </AppText>
        <AppText variant="label" muted numeric>
          {checkIn.kind === 'week'
            ? t('coach.checkIn.weekUsual', { value: formatMetric(t, language, checkIn.metric, checkIn.usual) })
            : t('coach.checkIn.usual', { value: formatMetric(t, language, checkIn.metric, checkIn.usual) })}
        </AppText>
        <ParityBadge level={spec.level} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label={t('coach.checkIn.ask')} variant="secondary" onPress={onAsk} style={{ flex: 1 }} testID={`check-in-ask-${checkIn.id}`} />
        <Button label={t('coach.checkIn.dismiss')} variant="tertiary" onPress={onDismiss} testID={`check-in-dismiss-${checkIn.id}`} />
      </View>
    </Card>
  );
}

export function ErrorCard({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View
      testID="coach-error"
      style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, padding: spacing.lg, gap: spacing.md }}>
      <AppText variant="body">{message}</AppText>
      {actionLabel && onAction ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label={actionLabel} variant="secondary" onPress={onAction} testID="coach-error-action" />
        </View>
      ) : null}
    </View>
  );
}
