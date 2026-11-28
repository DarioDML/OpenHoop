import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from './theme';

export interface GaugeSegment {
  from: number;
  to: number;
  color: string;
}

interface Props {
  size: number;
  stroke?: number;
  segments?: readonly GaugeSegment[];
  progress?: { to: number; color: string } | null;
  marker?: number | null;
  gap?: number;
  children?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}

function clamp(f: number): number {
  return Math.min(1, Math.max(0, f));
}

export function gaugePoint(f: number, cx: number, cy: number, r: number): { x: number; y: number } {
  const angle = Math.PI * (1 - clamp(f));
  return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
}

export function gaugeArc(from: number, to: number, cx: number, cy: number, r: number): string {
  const a = gaugePoint(from, cx, cy, r);
  const b = gaugePoint(to, cx, cy, r);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function SemiGauge({ size, stroke = 14, segments, progress = null, marker = null, gap = 0, children, accessibilityLabel, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const r = (size - stroke) / 2 - 4;
  const cx = size / 2;
  const cy = r + stroke / 2 + 4;
  const height = cy + stroke / 2 + 4;
  const track = segments ?? [{ from: 0, to: 1, color: colors.ringTrack }];
  const dot = marker === null ? null : gaugePoint(marker, cx, cy, r);
  return (
    <View testID={testID} accessible={accessibilityLabel !== undefined} accessibilityLabel={accessibilityLabel} style={{ width: size, height, alignSelf: 'center' }}>
      <Svg width={size} height={height}>
        {track.map((segment) => {
          const from = clamp(segment.from + (segment.from > 0 ? gap / 2 : 0));
          const to = clamp(segment.to - (segment.to < 1 ? gap / 2 : 0));
          if (to <= from) return null;
          return <Path key={`${segment.from}-${segment.to}`} d={gaugeArc(from, to, cx, cy, r)} stroke={segment.color} strokeWidth={stroke} strokeLinecap="round" fill="none" />;
        })}
        {progress !== null && progress.to > 0 ? <Path d={gaugeArc(0, clamp(progress.to), cx, cy, r)} stroke={progress.color} strokeWidth={stroke} strokeLinecap="round" fill="none" /> : null}
        {dot === null ? null : <Circle cx={dot.x} cy={dot.y} r={stroke / 2 + 3} fill={colors.primary} stroke={colors.background} strokeWidth={3} />}
      </Svg>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}>{children}</View>
    </View>
  );
}
