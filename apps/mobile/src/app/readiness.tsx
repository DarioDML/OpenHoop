import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { ScoreRing } from '@/ui/ScoreRing';
import { Section } from '@/ui/Section';
import { SignedBar } from '@/ui/SignedBar';
import { spacing } from '@/ui/theme';

export default function ReadinessScreen() {
  const { days } = useAppData();
  const { t, reason } = useT();
  const day = days[days.length - 1];

  if (!day) {
    return (
      <Screen>
        <EmptyState />
      </Screen>
    );
  }

  const contributions = day.readinessContributions;
  const scale = contributions ? Math.max(15, ...Object.values(contributions).map((v) => Math.abs(v))) : 15;

  return (
    <Screen>
      <View style={{ alignItems: 'center' }}>
        <ScoreRing
          testID="ring-readiness-detail"
          label={t('score.readiness')}
          value={day.readiness.value}
          max={100}
          level={PARITY.readiness}
          reason={day.readiness.reason}
          calibrating={day.readinessCalibrating}
          size={168}
          strokeWidth={14}
        />
      </View>
      {day.readinessCalibrating ? (
        <Card tone="warning">
          <AppText variant="label">{t('calibrating.hint')}</AppText>
        </Card>
      ) : null}

      <Section title={t('readiness.contributions')} hint={t('readiness.contributionsHint')}>
        <Card style={{ gap: spacing.lg }}>
          {contributions ? (
            <>
              <SignedBar label={t('readiness.contrib.hrv')} value={contributions.hrv} scale={scale} />
              <SignedBar label={t('readiness.contrib.sleep')} value={contributions.sleep} scale={scale} />
              <SignedBar label={t('readiness.contrib.rhr')} value={contributions.rhr} scale={scale} />
            </>
          ) : (
            <AppText variant="bodyStrong" muted>
              {reason(day.readiness.reason)}
            </AppText>
          )}
        </Card>
      </Section>

      <Section title={t('readiness.howTitle')}>
        <Card>
          <AppText variant="body">{t('readiness.howBody')}</AppText>
        </Card>
      </Section>

      <Card tone="warning" style={{ gap: 6 }}>
        <AppText variant="bodyStrong">{t('readiness.modelTitle')}</AppText>
        <AppText variant="body" muted>
          {t('readiness.modelBody')}
        </AppText>
      </Card>
    </Screen>
  );
}
