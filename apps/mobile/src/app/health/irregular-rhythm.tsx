import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function IrregularRhythmScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-irregular-rhythm"
      title={t('health.irregularRhythm.title')}
      heading={t('health.irregularRhythm.heading')}
      body={t('health.irregularRhythm.body')}
      icon="alert"
      issue="mg"
      needsMg
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.irregularRhythm.p1'), t('health.irregularRhythm.p2'), t('health.irregularRhythm.p3')]}
    />
  );
}
