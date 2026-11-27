import type { ReactElement } from 'react';
import { View } from 'react-native';

import type { ImpactConfidence } from '@/data/journalImpacts';
import { useT } from '@/i18n/useT';
import { formatSigned } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Num } from '@/ui/Num';
import { radius, spacing, useTheme } from '@/ui/theme';

interface Props {
  name: string;
  effectPct: number;
  scale: number;
  logged: number;
  confidence: ImpactConfidence;
  divider: boolean;
  testID: string;
}

export function ImpactRow({ name, effectPct, scale, logged, confidence, divider, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const { t, language } = useT();
  const rounded = Math.round(effectPct);
  const color = rounded > 0 ? colors.positive : rounded < 0 ? colors.warning : colors.textMuted;
  const value = `${formatSigned(rounded, 0, language)}%`;
  const width = `${Math.min(1, Math.abs(effectPct) / scale) * 50}%` as const;
  const confidenceText = t(`readinessImpacts.confidence.${confidence}`);
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={t('readinessImpacts.effectA11y', { name, value, count: logged, confidence: confidenceText })}
      style={{ gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: divider ? 1 : 0, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md }}>
        <AppText variant="body" style={{ fontWeight: '500', flexShrink: 1 }}>
          {name}
        </AppText>
        <Num size={22} color={color} testID={`${testID}-value`}>
          {value}
        </Num>
      </View>
      <View style={{ height: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, backgroundColor: colors.textFaint }} />
        {rounded === 0 ? null : (
          <View
            testID={`${testID}-bar`}
            style={{ position: 'absolute', top: 0, bottom: 0, width, borderRadius: radius.pill, backgroundColor: color, ...(rounded > 0 ? { left: '50%' } : { right: '50%' }) }}
          />
        )}
      </View>
      <AppText variant="caption" muted testID={`${testID}-caption`}>
        {t('readinessImpacts.logged', { count: logged, confidence: confidenceText })}
      </AppText>
    </View>
  );
}
