import type { StressLevel } from '@openhoop/analytics';
import { View } from 'react-native';

import { STRESS_LEVELS } from '@/data/stressDerived';
import { useT } from '@/i18n/useT';
import { formatDuration } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import type { ChipTone } from '@/ui/Chip';
import { radius, spacing, useTheme, type ColorTokens } from '@/ui/theme';

export const STRESS_TONE: Readonly<Record<StressLevel, ChipTone>> = { low: 'positive', medium: 'warning', high: 'negative' };

export function stressColor(colors: ColorTokens, level: StressLevel): string {
  if (level === 'high') return colors.negative;
  if (level === 'medium') return colors.warning;
  return colors.positive;
}

interface Props {
  seconds: Readonly<Record<StressLevel, number>>;
}

export function StressLevels({ seconds }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const total = STRESS_LEVELS.reduce((sum, level) => sum + seconds[level], 0);
  return (
    <View style={{ gap: spacing.md }}>
      <View
        accessibilityLabel={STRESS_LEVELS.map((level) => `${t(`stress.level.${level}`)} ${formatDuration(t, seconds[level])}`).join(', ')}
        style={{ flexDirection: 'row', height: 18, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, gap: 2 }}>
        {STRESS_LEVELS.map((level) =>
          seconds[level] > 0 && total > 0 ? <View key={level} style={{ flex: seconds[level], backgroundColor: stressColor(colors, level) }} /> : null,
        )}
      </View>
      <View style={{ gap: spacing.sm }}>
        {STRESS_LEVELS.map((level) => (
          <View key={level} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: stressColor(colors, level) }} />
            <AppText variant="body" style={{ flex: 1 }}>
              {t(`stress.level.${level}`)}
            </AppText>
            <AppText variant="bodyStrong" numeric testID={`stress-time-${level}`}>
              {formatDuration(t, seconds[level])}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
