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
  segments?: { count: number; filled: number } | null;
  children?: ReactNode;
  testID?: string;
}

export function Ring({ fraction, color, size = 104, strokeWidth = 7, tickFraction = null, trackColor, segments = null, children, testID }: Props) {
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
  const arcs =
    segments === null || segments.count <= 0
      ? []
      : (() => {
          const gap = strokeWidth / c;
          const span = 1 / segments.count - gap;
          return Array.from({ length: segments.count }, (_, i) => ({
            key: i,
            filled: i < segments.filled,
            dash: `${c * Math.max(0, span)} ${c}`,
            rotation: -90 + (i / segments.count) * 360,
          }));
        })();
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} testID={testID}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {segments === null ? <Circle cx={half} cy={half} r={r} stroke={trackColor ?? colors.ringTrack} strokeWidth={strokeWidth} fill="none" /> : null}
        {arcs.map((arc) => (
          <Circle
            key={arc.key}
            testID={testID ? `${testID}-segment-${arc.key}` : undefined}
            cx={half}
            cy={half}
            r={r}
            stroke={arc.filled ? color : (trackColor ?? colors.ringTrack)}
            strokeWidth={strokeWidth}
            strokeDasharray={arc.dash}
            rotation={arc.rotation}
            origin={`${half}, ${half}`}
            fill="none"
          />
        ))}
        {segments === null && fraction !== null && f > 0 ? (
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
        {segments === null && tick ? <Line {...tick} stroke={colors.text} strokeWidth={2} strokeLinecap="round" /> : null}
      </Svg>
      {children}
    </View>
  );
}
