import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { AppText } from './AppText';
import { useTheme } from './theme';

interface Props {
  data: ReadonlyArray<number | null>;
  height?: number;
  max?: number;
  formatTick: (value: number) => string;
  startLabel?: string;
  endLabel?: string;
  testID?: string;
}

const AXIS_WIDTH = 40;
const GAP = 3;

export function BarChart({ data, height = 110, max, formatTick, startLabel, endLabel, testID }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);

  const present = data.filter((v): v is number => v !== null);
  const top = Math.max(max ?? 0, ...present, 1);
  const bottom = Math.min(0, ...present);
  const span = top - bottom;
  const barW = data.length > 0 ? Math.max(2, (width - GAP * (data.length - 1)) / data.length) : 0;
  const zeroY = (top / span) * height;

  return (
    <View testID={testID} style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', height }}>
        <View style={{ width: AXIS_WIDTH, justifyContent: 'space-between' }}>
          <AppText variant="caption" muted numeric>
            {formatTick(top)}
          </AppText>
          <AppText variant="caption" muted numeric>
            {formatTick(bottom)}
          </AppText>
        </View>
        <View style={{ flex: 1 }} onLayout={onLayout}>
          {width > 0 ? (
            <Svg width={width} height={height}>
              <Line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke={colors.grid} strokeWidth={1} />
              {data.map((v, i) => {
                if (v === null) return null;
                const h = Math.max(1, (Math.abs(v) / span) * height);
                const barY = v >= 0 ? zeroY - h : zeroY;
                const isLast = i === data.length - 1;
                return (
                  <Rect
                    key={i}
                    x={i * (barW + GAP)}
                    y={barY}
                    width={barW}
                    height={h}
                    rx={Math.min(3, barW / 2)}
                    fill={v >= 0 ? colors.accent : colors.negative}
                    opacity={isLast ? 1 : 0.6}
                  />
                );
              })}
            </Svg>
          ) : null}
        </View>
      </View>
      {startLabel || endLabel ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: AXIS_WIDTH }}>
          <AppText variant="caption" muted>
            {startLabel}
          </AppText>
          {startLabel === endLabel ? null : (
            <AppText variant="caption" muted>
              {endLabel}
            </AppText>
          )}
        </View>
      ) : null}
    </View>
  );
}
