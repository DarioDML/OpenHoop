import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { useTheme } from './theme';

interface Props {
  fraction: number | null;
  color: string;
  size?: number;
  strokeWidth?: number;
  tickFraction?: number | null;
  trackColor?: string;
  children?: ReactNode;
  testID?: string;
}

export function Ring({ fraction, color, size = 104, strokeWidth = 7, tickFraction = null, trackColor, children, testID }: Props) {
  const { colors } = useTheme();
  const half = size / 2;
  const r = half - strokeWidth / 2 - 1;
  const c = 2 * Math.PI * r;
  const f = fraction === null ? 0 : Math.min(1, Math.max(0, fraction));
  const tick =
    tickFraction === null
      ? null
      : (() => {
          const angle = Math.min(1, Math.max(0, tickFraction)) * 2 * Math.PI - Math.PI / 2;
          const inner = r - strokeWidth / 2 - 2;
          const outer = r + strokeWidth / 2 + 2;
          return {
            x1: half + inner * Math.cos(angle),
            y1: half + inner * Math.sin(angle),
            x2: half + outer * Math.cos(angle),
            y2: half + outer * Math.sin(angle),
          };
        })();
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} testID={testID}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={half} cy={half} r={r} stroke={trackColor ?? colors.ringTrack} strokeWidth={strokeWidth} fill="none" />
        {fraction !== null && f > 0 ? (
          <Circle
            cx={half}
            cy={half}
            r={r}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${c * f} ${c}`}
            rotation={-90}
            origin={`${half}, ${half}`}
            fill="none"
          />
        ) : null}
        {tick ? <Line {...tick} stroke={colors.text} strokeWidth={2} strokeLinecap="round" /> : null}
      </Svg>
      {children}
    </View>
  );
}
