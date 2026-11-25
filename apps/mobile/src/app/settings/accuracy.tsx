import { View } from 'react-native';

import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { spacing, useTheme } from '@/ui/theme';

const LABELS: Readonly<Record<keyof typeof PARITY, TranslationKey>> = {
  heartRate: 'metric.heartRate',
  rr: 'metric.rr',
  steps: 'metric.steps',
  skinTemp: 'metric.skinTemp',
  spo2: 'metric.spo2',
  hrv: 'metric.hrv',
  restingHr: 'metric.restingHr',
  respiratoryRate: 'metric.respiratoryRate',
  sleep: 'sleep.summary',
  sleepNeed: 'metric.need',
  sleepScore: 'metric.sleepScore',
  readiness: 'score.readiness',
  load: 'score.load',
  zones: 'load.zones',
  consistency: 'metric.consistency',
  workouts: 'load.workouts',
  calories: 'calories.title',
  stress: 'health.stress.title',
  jetLag: 'sleepx.jetLag',
  vo2max: 'health.metrics.vo2max',
  pillars: 'health.hub.pillars',
};

const KEYS = Object.keys(PARITY) as ReadonlyArray<keyof typeof PARITY>;

export default function AccuracyScreen() {
  const { t } = useT();
  const { colors } = useTheme();

  return (
    <SettingsPage title={t('aboutx.accuracy.title')} tint="neutral" testID="accuracy">
      <Card style={{ gap: 6 }}>
        <AppText variant="cardTitle">{t('aboutx.accuracy.heading')}</AppText>
        <AppText variant="label" muted>
          {t('aboutx.accuracy.body')}
        </AppText>
      </Card>

      <CapHeader title={t('aboutx.accuracy.perValue')} />
      <Card style={{ gap: spacing.md }}>
        {KEYS.map((key) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 36 }} testID={`accuracy-${key}`}>
            <ParityBadge level={PARITY[key]} />
            <AppText variant="body" style={{ flex: 1 }}>
              {t(LABELS[key])}
            </AppText>
            <Chip label={t('aboutx.accuracy.notMeasured')} small />
          </View>
        ))}
      </Card>

      <ListGroup>
        <ListRow
          icon={tile(colors, 'import', 'info')}
          title={t('aboutx.accuracy.import')}
          subtitle={t('aboutx.accuracy.importBody')}
          href="/settings/import"
        />
      </ListGroup>
    </SettingsPage>
  );
}
