import { useState, type ReactElement } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';

import { AppText } from '../AppText';
import { useTheme } from '../theme';

export interface ScatterPoint {
  x: number;
  y: number;
  color: string;
}

interface Domain {
  min: number;
  max: number;
}

interface Props {
  points: readonly ScatterPoint[];
  xDomain: Domain;
  yDomain: Domain;
  invertY?: boolean;
  shade?: ReadonlyArray<{ x: number; y: number }> | null;
  shadeLabel?: string;
  xLabel: string;
  yLabel: string;
  yTicks?: { top: string; bottom: string } | null;
  height?: number;
  emptyLabel: string;
  accessibilityLabel: string;
  testID?: string;
}

const PAD = 10;
const DOT = 7;
const AXIS = 40;

export function ScatterChart({ points, xDomain, yDomain, invertY = false, shade = null, shadeLabel, xLabel, yLabel, yTicks = null, height = 200, emptyLabel, accessibilityLabel, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);
  const plotW = Math.max(0, width - PAD * 2);
  const plotH = height - PAD * 2;
  const xSpan = xDomain.max - xDomain.min || 1;
  const ySpan = yDomain.max - yDomain.min || 1;
  const px = (x: number): number => PAD + ((Math.min(xDomain.max, Math.max(xDomain.min, x)) - xDomain.min) / xSpan) * plotW;
  const py = (y: number): number => {
    const f = (Math.min(yDomain.max, Math.max(yDomain.min, y)) - yDomain.min) / ySpan;
    return PAD + (invertY ? f : 1 - f) * plotH;
  };
  return (
    <View testID={testID} accessible accessibilityLabel={accessibilityLabel} style={{ gap: 4 }}>
      <AppText variant="caption" muted style={{ marginLeft: yTicks ? AXIS : 0 }}>
        {yLabel}
      </AppText>
      <View style={{ flexDirection: 'row', height }}>
        {yTicks ? (
          <View style={{ width: AXIS, justifyContent: 'space-between', paddingVertical: PAD - 6 }}>
            <AppText variant="caption" muted numeric>
              {yTicks.top}
            </AppText>
            <AppText variant="caption" muted numeric>
              {yTicks.bottom}
            </AppText>
          </View>
        ) : null}
        <View style={{ flex: 1 }} onLayout={onLayout}>
          {width > 0 ? (
            <Svg width={width} height={height}>
              {shade && shade.length > 2 ? <Polygon points={shade.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ')} fill={colors.surface3} opacity={0.7} /> : null}
              <Line x1={PAD} y1={PAD} x2={PAD} y2={height - PAD} stroke={colors.borderStrong} strokeWidth={1} />
              <Line x1={PAD} y1={height - PAD} x2={width - PAD} y2={height - PAD} stroke={colors.borderStrong} strokeWidth={1} />
              {points.map((p, i) => (
                <Circle key={i} cx={px(p.x)} cy={py(p.y)} r={DOT} fill={p.color} />
              ))}
            </Svg>
          ) : null}
          {shade && shadeLabel ? (
            <AppText variant="capSmall" muted style={{ position: 'absolute', top: PAD + 6, right: PAD + 8 }}>
              {shadeLabel}
            </AppText>
          ) : null}
          {points.length === 0 ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <AppText variant="label" muted>
                {emptyLabel}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
      <AppText variant="caption" muted style={{ textAlign: 'right' }}>
        {xLabel}
      </AppText>
    </View>
  );
}
