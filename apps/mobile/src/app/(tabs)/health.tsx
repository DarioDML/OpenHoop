import { router } from 'expo-router';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { latestHeartRateDayIndex, latestVitalsIndex, vitalReadings, vitalsSummary } from '@/data/healthDerived';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { HealthPage } from '@/ui/health/HealthPage';
import { ListGroup, ListRow, type IconTileStyle } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { spacing, useTheme } from '@/ui/theme';
import { formatNumber } from '@/lib/format';
import type { IconName } from '@/ui/Icon';
import type { Href } from 'expo-router';
import type { TranslationKey } from '@/i18n';

interface Entry {
  id: string;
  icon: IconName;
  title: TranslationKey;
  subtitle: TranslationKey;
  href: Href;
  mg?: boolean;
}

const ENTRIES: readonly Entry[] = [
  { id: 'heart-rate', icon: 'heart', title: 'health.hub.heartRate', subtitle: 'health.hub.heartRateHint', href: '/health/heart-rate' },
  { id: 'breathing', icon: 'wind', title: 'health.hub.breathing', subtitle: 'health.hub.breathingHint', href: '/health/breathing' },
  { id: 'journal', icon: 'journal', title: 'health.hub.journal', subtitle: 'health.hub.journalHint', href: '/journal' },
  { id: 'stress', icon: 'pulse', title: 'health.hub.stress', subtitle: 'health.hub.stressHint', href: '/health/stress' },
  { id: 'body-age', icon: 'user', title: 'health.hub.bodyAge', subtitle: 'health.hub.bodyAgeHint', href: '/health/body-age' },
  { id: 'vo2max', icon: 'lungs', title: 'health.hub.vo2max', subtitle: 'health.hub.vo2maxHint', href: '/health/vo2max' },
  { id: 'body-composition', icon: 'layers', title: 'health.hub.bodyComposition', subtitle: 'health.hub.bodyCompositionHint', href: '/health/body-composition' },
  { id: 'cycle', icon: 'calendar', title: 'health.hub.cycle', subtitle: 'health.hub.cycleHint', href: '/health/cycle' },
  { id: 'labs', icon: 'drop', title: 'health.hub.labs', subtitle: 'health.hub.labsHint', href: '/health/labs' },
  { id: 'ecg', icon: 'pulse', title: 'health.hub.ecg', subtitle: 'health.hub.ecgHint', href: '/health/ecg', mg: true },
  { id: 'blood-pressure', icon: 'drop', title: 'health.hub.bloodPressure', subtitle: 'health.hub.bloodPressureHint', href: '/health/blood-pressure', mg: true },
  { id: 'report', icon: 'report', title: 'health.hub.report', subtitle: 'health.hub.reportHint', href: '/health/report' },
];

export default function HealthScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, device } = useAppData();
  const index = latestVitalsIndex(days);
  const readings = index >= 0 ? vitalReadings(days, index) : [];
  const summary = vitalsSummary(readings);
  const hrIndex = latestHeartRateDayIndex(days);
  const hr = days[hrIndex]?.heartRate;
  const tile: IconTileStyle = { icon: 'heart', color: colors.textSoft, background: colors.surfaceAlt };
  const isMg = device.model === 'MG';

  return (
    <HealthPage
      title={t('tabs.health')}
      back={false}
      withTabBar
      testID="health-hub"
      hero={
        <Card onPress={() => router.push('/health/metrics')} accessibilityLabel={t('health.hub.findMetric')} testID="health-find-metric">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="body" muted>
              {t('health.hub.findMetric')}
            </AppText>
            <AppText variant="title" muted>
              ›
            </AppText>
          </View>
        </Card>
      }>
      <Card href="/health/vitals" testID="health-vitals-card" accessibilityLabel={t('health.vitals.title')}>
        <CardHeader title={t('health.vitals.title')} chevron />
        {summary.judged > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Num size={44} testID="health-vitals-within">{`${summary.within}/${summary.judged}`}</Num>
              <AppText variant="cardTitle" muted style={{ fontWeight: '400' }}>
                {t('health.vitals.withinRange')}
              </AppText>
            </View>
            <Chip label={t('health.hub.vitalsMeasured', { count: summary.measured })} />
          </View>
        ) : (
          <AppText variant="body" muted testID="health-vitals-empty">
            {summary.measured > 0 ? t('health.vitals.calibrating') : t('health.vitals.empty')}
          </AppText>
        )}
      </Card>

      <Card href="/health/heart-rate" testID="health-hr-card" accessibilityLabel={t('health.hub.heartRate')}>
        <CardHeader title={t('health.hub.heartRate')} chevron />
        {hr && hr.avg !== null ? (
          <AppText variant="body" soft numeric testID="health-hr-summary">
            {t('health.hr.summary', {
              min: formatNumber(hr.min ?? hr.avg, 0, language),
              avg: formatNumber(hr.avg, 0, language),
              max: formatNumber(hr.max ?? hr.avg, 0, language),
            })}
          </AppText>
        ) : (
          <AppText variant="body" muted>
            {t('health.hr.noData')}
          </AppText>
        )}
      </Card>

      <ListGroup title={t('health.hub.explore')}>
        {ENTRIES.map((entry) => (
          <ListRow
            key={entry.id}
            testID={`health-entry-${entry.id}`}
            title={t(entry.title)}
            subtitle={entry.mg && !isMg ? `${t(entry.subtitle)} · ${t('health.mg.badge')}` : t(entry.subtitle)}
            icon={{ ...tile, icon: entry.icon }}
            href={entry.href}
          />
        ))}
      </ListGroup>
    </HealthPage>
  );
}
