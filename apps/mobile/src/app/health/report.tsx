import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function ReportScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-report"
      title={t('health.report.title')}
      heading={t('health.report.heading')}
      body={t('health.report.body')}
      icon="report"
      issue="report"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.report.p1'), t('health.report.p2'), t('health.report.p3')]}
    />
  );
}
