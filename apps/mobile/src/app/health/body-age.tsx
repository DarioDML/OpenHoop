import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { useTheme } from '@/ui/theme';

export default function BodyAgeScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <FeaturePage
      testID="health-body-age"
      title={t('health.bodyAge.title')}
      heading={t('health.bodyAge.heading')}
      body={t('health.bodyAge.body')}
      icon="user"
      issue="healthspan"
      pointsTitle={t('health.bodyAge.pointsTitle')}
      points={[t('health.bodyAge.p1'), t('health.bodyAge.p2'), t('health.bodyAge.p3')]}>
      <ListGroup title={t('health.bodyAge.instead')}>
        <ListRow
          testID="body-age-pillars"
          title={t('health.hub.pillars')}
          subtitle={t('health.hub.pillarsHint')}
          icon={{ icon: 'target', color: colors.textSoft, background: colors.surfaceAlt }}
          href="/health/pillar"
        />
        <ListRow
          testID="body-age-vo2max"
          title={t('health.hub.vo2max')}
          subtitle={t('health.hub.vo2maxHint')}
          icon={{ icon: 'lungs', color: colors.textSoft, background: colors.surfaceAlt }}
          href="/health/vo2max"
        />
      </ListGroup>
    </FeaturePage>
  );
}
