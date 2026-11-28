import { router } from 'expo-router';
import { View } from 'react-native';

import { useCoach } from '@/coach/CoachContext';
import type { CheckIn } from '@/coach/checkIns';
import { COACH_METRIC_SPECS, type CoachMetric } from '@/coach/metrics';
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
import { radius, spacing, useTheme } from '@/ui/theme';

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

export function MetricChips({ chips, testID }: { chips: readonly ResolvedChip[]; testID?: string }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  if (chips.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} testID={testID}>
      {chips.map((chip) => (
        <View
          key={`${chip.metric}:${chip.day}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface }}>
          <AppText variant="label" soft numeric>
            {`${t(COACH_METRIC_SPECS[chip.metric].labelKey)} ${formatMetric(t, language, chip.metric, chip.value)} · ${formatShortDay(chip.day, language)}`}
          </AppText>
          <ParityBadge level={COACH_METRIC_SPECS[chip.metric].level} />
        </View>
      ))}
    </View>
  );
}

export function checkInQuestion(t: TFunction, language: Language, checkIn: CheckIn): string {
  return t('coach.checkIn.question', {
    metric: t(COACH_METRIC_SPECS[checkIn.metric].labelKey),
    day: formatShortDay(checkIn.day, language),
    value: formatMetric(t, language, checkIn.metric, checkIn.value),
    usual: formatMetric(t, language, checkIn.metric, checkIn.usual),
  });
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
      <AppText variant="bodyStrong">{t(checkIn.direction === 'up' ? 'coach.checkIn.up' : 'coach.checkIn.down', { metric: label })}</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
        <AppText variant="title" numeric>
          {formatMetric(t, language, checkIn.metric, checkIn.value)}
        </AppText>
        <AppText variant="label" muted numeric>
          {t('coach.checkIn.usual', { value: formatMetric(t, language, checkIn.metric, checkIn.usual) })}
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
