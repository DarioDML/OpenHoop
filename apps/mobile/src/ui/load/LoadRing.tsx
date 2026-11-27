import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { AimRange } from '@/data/readinessDerived';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Num } from '@/ui/Num';
import { useTheme } from '@/ui/theme';

interface Props {
  value: number | null;
  max: number;
  aim: AimRange | null;
  caption: string;
  reason?: string | null;
  size?: number;
  numberSize?: number;
  onExplain?: () => void;
  testID?: string;
}

const OUTER_STROKE = 3;
const RING_STROKE = 10;
const RING_INSET = 15;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function LoadRing({ value, max, aim, caption, reason = null, size = 220, numberSize = 96, onExplain, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const { t, language, reason: reasonLabel } = useT();
  const half = size / 2;
  const outerR = half - OUTER_STROKE - 1;
  const ringR = half - RING_INSET;
  const outerC = 2 * Math.PI * outerR;
  const ringC = 2 * Math.PI * ringR;
  const fraction = value === null ? 0 : clamp01(value / max);
  const aimStart = aim === null ? 0 : clamp01(aim.low / max);
  const aimSpan = aim === null ? 0 : clamp01(aim.high / max) - aimStart;
  const shown = value === null ? null : formatNumber(value, 1, language);
  const a11y =
    shown === null
      ? reasonLabel(reason)
      : aim === null
        ? t('loadScreen.ring.a11y', { value: shown, max })
        : t('loadScreen.ring.a11yTarget', { value: shown, max, low: formatNumber(aim.low, 1, language), high: formatNumber(aim.high, 1, language) });

  const ring = (
    <View accessible accessibilityRole="image" accessibilityLabel={a11y} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {aimSpan > 0 ? (
          <Circle
            testID={testID === undefined ? undefined : `${testID}-target`}
            cx={half}
            cy={half}
            r={outerR}
            stroke={colors.metric.loadBright}
            strokeOpacity={0.6}
            strokeWidth={OUTER_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${outerC * aimSpan} ${outerC}`}
            rotation={-90 + aimStart * 360}
            origin={`${half}, ${half}`}
            fill="none"
          />
        ) : null}
        <Circle cx={half} cy={half} r={ringR} stroke={colors.ringTrack} strokeWidth={RING_STROKE} fill="none" />
        {fraction > 0 ? (
          <Circle
            cx={half}
            cy={half}
            r={ringR}
            stroke={colors.metric.load}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${ringC * fraction} ${ringC}`}
            rotation={-90}
            origin={`${half}, ${half}`}
            fill="none"
          />
        ) : null}
      </Svg>
      {shown === null ? (
        <AppText variant="label" muted style={{ textAlign: 'center', paddingHorizontal: 36 }}>
          {reasonLabel(reason)}
        </AppText>
      ) : (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Num size={numberSize} maxFontSizeMultiplier={1}>
            {shown}
          </Num>
          <AppText variant="cap" muted maxFontSizeMultiplier={1.2}>
            {caption}
          </AppText>
        </View>
      )}
    </View>
  );

  return (
    <View testID={testID} style={{ alignItems: 'center' }}>
      {onExplain !== undefined && value === null ? (
        <Pressable accessibilityRole="button" testID={testID === undefined ? undefined : `${testID}-why`} onPress={onExplain} style={{ minWidth: 44, minHeight: 44 }}>
          {ring}
        </Pressable>
      ) : (
        ring
      )}
    </View>
  );
}
