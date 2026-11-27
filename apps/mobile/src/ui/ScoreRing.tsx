import { Pressable, View } from 'react-native';

import type { ParityLevel } from '@/data/types';
import { formatNumber } from '@/lib/format';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Num } from './Num';
import { ParityBadge } from './ParityBadge';
import { Ring } from './Ring';
import { useTheme } from './theme';

export interface BuildingRing {
  left: number;
  have: number;
  need: number;
}

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
  numberSize?: number;
  unitSize?: number;
  sublabelSize?: number;
  tickValue?: number | null;
  building?: BuildingRing | null;
  onExplain?: () => void;
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
  numberSize,
  unitSize,
  sublabelSize = 9,
  tickValue = null,
  building = null,
  onExplain,
  testID,
}: Props) {
  const { colors } = useTheme();
  const { language, t, reason: reasonLabel } = useT();
  const explainable = onExplain !== undefined && (building !== null || value === null);
  const arcColor = calibrating ? colors.textMuted : (color ?? colors.accent);
  const numberColor = calibrating ? colors.textMuted : (color ?? colors.text);

  const ring = (
    <Ring
      size={size}
      strokeWidth={strokeWidth}
      fraction={value === null ? null : value / max}
      color={building === null ? arcColor : colors.pink}
      segments={building === null ? null : { count: building.need, filled: building.have }}
      tickFraction={tickValue === null ? null : tickValue / max}>
      {building !== null ? (
        <View
          style={{ alignItems: 'center', gap: 2 }}
          accessible
          accessibilityLabel={building.left === 1 ? t('readiness.nightsLeftA11yOne') : t('readiness.nightsLeftA11y', { count: building.left })}>
          <Num size={Math.round(size * 0.38)} color={colors.pink}>
            {formatNumber(building.left, 0, language)}
          </Num>
          <AppText variant="capSmall" color={colors.pink} style={{ fontSize: 9, lineHeight: 11 }}>
            {building.left === 1 ? t('readiness.nightsLeftOne') : t('readiness.nightsLeft')}
          </AppText>
        </View>
      ) : value !== null ? (
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Num size={numberSize ?? Math.round(size * 0.38)} color={numberColor} unit={unit} unitSize={unitSize ?? Math.round(size * 0.17)}>
            {formatNumber(value, decimals, language)}
          </Num>
          {sublabel ? (
            <AppText variant="capSmall" color={numberColor} style={{ fontSize: sublabelSize, lineHeight: Math.round(sublabelSize * 1.25) }}>
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
  );

  return (
    <View style={{ alignItems: 'center', gap: 10 }} testID={testID}>
      {explainable ? (
        <Pressable accessibilityRole="button" testID={testID ? `${testID}-why` : undefined} onPress={onExplain} style={{ minWidth: 44, minHeight: 44 }}>
          {ring}
        </Pressable>
      ) : (
        ring
      )}
      {showLabel ? (
        <View style={{ alignItems: 'center', gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="cap" muted numberOfLines={1}>
              {label}
            </AppText>
          </View>
          <ParityBadge level={level} />
        </View>
      ) : null}
    </View>
  );
}
