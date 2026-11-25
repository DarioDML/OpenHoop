import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { ParityLevel } from '@/data/types';
import { formatNumber } from '@/lib/format';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { ParityBadge } from './ParityBadge';
import { useTheme } from './theme';

interface Props {
  label: string;
  value: number | null;
  max: number;
  level: ParityLevel;
  reason?: string | null;
  decimals?: number;
  calibrating?: boolean;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  testID?: string;
}

export function ScoreRing({
  label,
  value,
  max,
  level,
  reason = null,
  decimals = 0,
  calibrating = false,
  size = 104,
  strokeWidth = 9,
  showLabel = true,
  testID,
}: Props) {
  const { colors } = useTheme();
  const { language, t, reason: reasonLabel } = useT();
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const fraction = value === null ? 0 : Math.min(1, Math.max(0, value / max));
  const arcColor = calibrating ? colors.textMuted : colors.accent;

  return (
    <View style={{ alignItems: 'center', gap: 8, flex: 1 }} testID={testID}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={strokeWidth} fill="none" />
          {value !== null ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={arcColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${c * fraction} ${c}`}
              strokeDashoffset={0}
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
              fill="none"
            />
          ) : null}
        </Svg>
        {value !== null ? (
          <AppText variant={size >= 140 ? 'display' : 'value'} numeric>
            {formatNumber(value, decimals, language)}
          </AppText>
        ) : (
          <AppText variant="caption" muted style={{ textAlign: 'center', paddingHorizontal: 14 }}>
            {reasonLabel(reason)}
          </AppText>
        )}
      </View>
      {showLabel ? (
        <View style={{ alignItems: 'center', gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="label" numberOfLines={1}>
              {label}
            </AppText>
            <ParityBadge level={level} />
          </View>
          {calibrating && value !== null ? (
            <AppText variant="caption" color={colors.warning}>
              {t('calibrating.label')}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
