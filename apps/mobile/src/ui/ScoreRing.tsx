import { View } from 'react-native';

import type { ParityLevel } from '@/data/types';
import { formatNumber } from '@/lib/format';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Num } from './Num';
import { ParityBadge } from './ParityBadge';
import { Ring } from './Ring';
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
  color?: string;
  unit?: string;
  sublabel?: string;
  tickValue?: number | null;
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
  strokeWidth = 7,
  showLabel = true,
  color,
  unit,
  sublabel,
  tickValue = null,
  testID,
}: Props) {
  const { colors } = useTheme();
  const { language, t, reason: reasonLabel } = useT();
  const arcColor = calibrating ? colors.textMuted : (color ?? colors.accent);
  const numberColor = calibrating ? colors.textMuted : (color ?? colors.text);

  return (
    <View style={{ alignItems: 'center', gap: 10 }} testID={testID}>
      <Ring
        size={size}
        strokeWidth={strokeWidth}
        fraction={value === null ? null : value / max}
        color={arcColor}
        tickFraction={tickValue === null ? null : tickValue / max}>
        {value !== null ? (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Num size={Math.round(size * 0.38)} color={numberColor} unit={unit} unitSize={Math.round(size * 0.17)}>
              {formatNumber(value, decimals, language)}
            </Num>
            {sublabel ? (
              <AppText variant="capSmall" color={numberColor} style={{ fontSize: 9, lineHeight: 11 }}>
                {sublabel}
              </AppText>
            ) : null}
          </View>
        ) : (
          <AppText variant="caption" muted style={{ textAlign: 'center', paddingHorizontal: 14 }}>
            {reasonLabel(reason)}
          </AppText>
        )}
      </Ring>
      {showLabel ? (
        <View style={{ alignItems: 'center', gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="cap" muted numberOfLines={1}>
              {label} ›
            </AppText>
          </View>
          <ParityBadge level={level} />
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
