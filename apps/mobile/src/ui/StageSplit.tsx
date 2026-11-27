import { View } from 'react-native';

import { SLEEP_STAGES, type SleepStage, type StageTotals } from '@openhoop/analytics';

import { formatDuration } from '@/lib/format';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { radius, spacing, useTheme, type ColorTokens } from './theme';

export function stageColor(colors: ColorTokens, stage: SleepStage): string {
  return stage === 'wake' ? colors.stage.awake : colors.stage[stage];
}

export function stageTotalS(totals: StageTotals): number {
  return SLEEP_STAGES.reduce((sum, stage) => sum + totals[stage], 0);
}

interface Props {
  totals: StageTotals;
  testID?: string;
}

export function StageSplit({ totals, testID }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const total = stageTotalS(totals);
  const pct = (seconds: number): number => (total > 0 ? Math.round((seconds / total) * 100) : 0);

  return (
    <View testID={testID} style={{ gap: spacing.md }}>
      <View
        accessibilityLabel={SLEEP_STAGES.map((s) => `${t(`stage.${s}`)} ${formatDuration(t, totals[s])}`).join(', ')}
        style={{ flexDirection: 'row', height: 18, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, gap: 2 }}>
        {SLEEP_STAGES.map((stage) =>
          totals[stage] > 0 ? <View key={stage} style={{ flex: totals[stage], backgroundColor: stageColor(colors, stage) }} /> : null,
        )}
      </View>
      <View style={{ gap: spacing.sm }}>
        {SLEEP_STAGES.map((stage) => (
          <View key={stage} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: stageColor(colors, stage) }} />
            <AppText variant="body" style={{ flex: 1 }}>
              {t(`stage.${stage}`)}
            </AppText>
            <AppText variant="label" muted numeric>
              {pct(totals[stage])}%
            </AppText>
            <AppText variant="bodyStrong" numeric testID={testID ? `${testID}-${stage}` : undefined} style={{ minWidth: 64, textAlign: 'right' }}>
              {formatDuration(t, totals[stage])}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
