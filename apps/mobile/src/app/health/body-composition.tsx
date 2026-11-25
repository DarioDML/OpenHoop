import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { bmi } from '@/data/healthDerived';
import { formatNumber } from '@/lib/format';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { FeaturePage } from '@/ui/health/FeaturePage';
import { Num } from '@/ui/Num';
import { spacing } from '@/ui/theme';

interface FactProps {
  label: string;
  value: string | null;
  unit: string;
  testID: string;
}

function Fact({ label, value, unit, testID }: FactProps) {
  const { t } = useT();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <AppText variant="capSmall" muted>
        {label}
      </AppText>
      {value === null ? (
        <AppText variant="bodyStrong" muted testID={`${testID}-empty`}>
          {t('health.bodyComposition.notSet')}
        </AppText>
      ) : (
        <Num size={32} unit={unit} testID={testID}>
          {value}
        </Num>
      )}
    </View>
  );
}

export default function BodyCompositionScreen() {
  const { t, language } = useT();
  const { userData } = useAppData();
  const index = bmi(userData.heightCm, userData.weightKg);
  return (
    <FeaturePage
      testID="health-body-composition"
      title={t('health.bodyComposition.title')}
      heading={t('health.bodyComposition.heading')}
      body={t('health.bodyComposition.body')}
      icon="layers"
      issue="bodyComp"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.bodyComposition.p1'), t('health.bodyComposition.p2'), t('health.bodyComposition.p3')]}>
      <Card testID="body-profile">
        <AppText variant="capLarge" muted>
          {t('health.bodyComposition.yourProfile')}
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Fact
            label={t('health.bodyComposition.height')}
            value={userData.heightCm === null ? null : formatNumber(userData.heightCm, 0, language)}
            unit="cm"
            testID="body-height"
          />
          <Fact
            label={t('health.bodyComposition.weight')}
            value={userData.weightKg === null ? null : formatNumber(userData.weightKg, 1, language)}
            unit="kg"
            testID="body-weight"
          />
          <Fact label="BMI" value={index === null ? null : formatNumber(index, 1, language)} unit="" testID="body-bmi" />
        </View>
        <AppText variant="caption" muted>
          {t('health.bodyComposition.profileNote')}
        </AppText>
      </Card>
    </FeaturePage>
  );
}
