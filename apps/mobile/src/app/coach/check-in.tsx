import { router } from 'expo-router';
import { View } from 'react-native';

import { scanForCheckIns } from '@/coach/checkIns';
import { withDismissed } from '@/coach/prefs';
import { useAppData } from '@/data/context';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { CheckInCard } from '@/ui/coach/parts';
import { Toggle } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { spacing } from '@/ui/theme';

export default function CoachCheckInScreen() {
  const { t } = useT();
  const { days, userData, updateUserData } = useAppData();
  const enabled = userData.coach.checkIns;
  const scan = scanForCheckIns(days, userData.coach.dismissedCheckIns);

  let status: TranslationKey | null = null;
  if (!enabled) status = 'coach.checkIn.off';
  else if (scan.status === 'no-data') status = 'coach.checkIn.noData';
  else if (scan.status === 'needs-history') status = 'coach.checkIn.needsHistory';
  else if (scan.checkIns.length === 0) status = 'coach.checkIn.none';

  return (
    <HealthPage
      title={t('coach.checkIn.title')}
      tint="coach"
      testID="coach-check-in"
      hero={
        <AppText variant="lead" muted>
          {t('coach.checkIn.body')}
        </AppText>
      }>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong">{t('coach.checkIn.toggle')}</AppText>
          <AppText variant="label" muted>
            {t('coach.checkIn.toggleBody')}
          </AppText>
        </View>
        <Toggle
          label={t('coach.checkIn.toggle')}
          value={enabled}
          onChange={(value) => void updateUserData({ coach: { ...userData.coach, checkIns: value } })}
          testID="coach-check-in-toggle"
        />
      </Card>
      {status !== null ? (
        <AppText variant="body" muted testID="coach-check-in-status">
          {t(status)}
        </AppText>
      ) : null}
      {enabled && scan.status === 'ok'
        ? scan.checkIns.map((checkIn) => (
            <CheckInCard
              key={checkIn.id}
              checkIn={checkIn}
              onAsk={() => router.push({ pathname: '/coach', params: { ask: checkIn.id } })}
              onDismiss={() => void updateUserData({ coach: withDismissed(userData.coach, checkIn.id) })}
            />
          ))
        : null}
    </HealthPage>
  );
}
