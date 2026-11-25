import { router } from 'expo-router';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { caloriesForDay } from '@/data/energyDerived';
import { useT } from '@/i18n/useT';
import { formatDuration, formatNumber } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { spacing } from '@/ui/theme';
import type { DayRecord } from '@openhoop/core';

export function CaloriesCard({ day }: { day: DayRecord }) {
  const { userData, profile } = useAppData();
  const { t, language, reason } = useT();
  const view = caloriesForDay(day, userData, profile);
  const fmt = (v: number): string => formatNumber(v, 0, language);
  const estimate = view.estimate;

  return (
    <Card testID="calories-card" style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="cardTitle">{t('calories.title')}</AppText>
        <ParityBadge level={PARITY.calories} />
      </View>
      {estimate === null ? (
        <>
          <AppText variant="bodyStrong" muted testID="calories-reason">
            {reason(view.reason)}
          </AppText>
          {view.reason === 'no-profile' ? (
            <>
              <AppText variant="label" muted>
                {t('calories.needsProfile')}
              </AppText>
              <Button label={t('calories.completeProfile')} variant="secondary" onPress={() => router.push('/profile/edit')} testID="calories-profile" />
            </>
          ) : null}
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Num size={40} unit={t('calories.unit')} testID="calories-total">
              {fmt(estimate.totalKcal)}
            </Num>
            <Chip label={t('calories.estimate')} tone="info" />
          </View>
          <StatRow>
            <StatTile label={t('calories.resting')} value={fmt(estimate.restingKcal)} unit={t('calories.unit')} testID="calories-resting" />
            <StatTile label={t('calories.active')} value={fmt(estimate.activeKcal)} unit={t('calories.unit')} testID="calories-active" />
            <StatTile label={t('calories.activeTime')} value={formatDuration(t, estimate.activeMinutes * 60)} testID="calories-active-time" />
          </StatRow>
          {view.coverage !== null && view.coverage < 1 ? (
            <AppText variant="label" muted testID="calories-coverage">
              {t('calories.coverage', { percent: Math.round(view.coverage * 100) })}
            </AppText>
          ) : null}
          {userData.sex === 'other' ? (
            <AppText variant="label" muted testID="calories-other">
              {t('calories.other')}
            </AppText>
          ) : null}
        </>
      )}
      <AppText variant="caption" muted>
        {t('calories.method', { threshold: view.thresholdBpm === null ? '–' : fmt(view.thresholdBpm) })}
      </AppText>
    </Card>
  );
}
