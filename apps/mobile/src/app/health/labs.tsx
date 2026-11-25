import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatEntered, summarizeBiomarkers } from '@/data/labs';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { markerName, statusText } from '@/ui/health/labsText';
import { Icon } from '@/ui/Icon';
import { ParityBadge } from '@/ui/ParityBadge';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';

export default function LabsScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { labResults } = useAppData();
  const summaries = summarizeBiomarkers(labResults);

  return (
    <HealthPage
      title={t('health.labs.title')}
      testID="health-labs"
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header">
            {t('health.labs.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {t('health.labs.body')}
          </AppText>
        </View>
      }>
      <Button label={t('health.labs.add')} icon="plus" onPress={() => router.push('/health/labs-upload')} testID="labs-add" />

      <Section title={t('health.labs.summaryTitle')}>
        {summaries.length === 0 ? (
          <AppText variant="body" muted testID="labs-empty">
            {t('health.labs.empty')}
          </AppText>
        ) : (
          summaries.map((summary) => {
            const { latest } = summary;
            return (
              <Pressable
                key={summary.group}
                accessibilityRole="button"
                accessibilityLabel={markerName(summary.ref, t)}
                onPress={() => router.push({ pathname: '/health/biomarker', params: { id: summary.key } })}
                testID={`labs-row-${summary.group}`}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="bodyStrong">{markerName(summary.ref, t)}</AppText>
                      <AppText variant="label" muted numeric>
                        {latest.day} · {summary.count === 1 ? t('health.labs.countOne') : t('health.labs.count', { count: summary.count })}
                      </AppText>
                    </View>
                    <AppText variant="bodyStrong" numeric testID={`labs-value-${summary.group}`}>
                      {formatEntered(latest.value, language)} {latest.unit}
                    </AppText>
                    <Icon name="chevronRight" color={colors.textMuted} size={18} />
                  </View>
                  <Chip label={statusText(latest, t)} tone="neutral" small testID={`labs-status-${summary.group}`} />
                </Card>
              </Pressable>
            );
          })
        )}
      </Section>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <ParityBadge level="D" />
        <AppText variant="caption" muted style={{ flex: 1 }} testID="labs-entered-note">
          {t('health.labs.note')}
        </AppText>
      </View>
    </HealthPage>
  );
}
