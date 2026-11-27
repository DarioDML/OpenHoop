import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { STAGE_EPOCH_S, type SleepStage } from '@openhoop/analytics';
import type { StageEpochRow } from '@openhoop/core';

import { formatClock } from '@/lib/format';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { stageColor } from './StageSplit';
import { spacing, useTheme } from './theme';

interface Props {
  epochs: ReadonlyArray<StageEpochRow>;
  from: number;
  to: number;
  tzOffsetS: number;
  labels?: boolean;
  testID?: string;
}

const LANES: readonly SleepStage[] = ['wake', 'rem', 'light', 'deep'];
const LANE_H = 22;
const LANE_GAP = 4;
const LABEL_W = 52;
const HOUR = 3600;
const TICK_W = 28;

interface Run {
  stage: SleepStage;
  start: number;
  end: number;
}

export function stageRuns(epochs: ReadonlyArray<StageEpochRow>): Run[] {
  const runs: Run[] = [];
  for (const e of epochs) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last.stage === e.stage && last.end === e.t) last.end = e.t + STAGE_EPOCH_S;
    else runs.push({ stage: e.stage, start: e.t, end: e.t + STAGE_EPOCH_S });
  }
  return runs;
}

export function Hypnogram({ epochs, from, to, tzOffsetS, labels = true, testID }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);
  const span = Math.max(to - from, STAGE_EPOCH_S);
  const height = LANES.length * LANE_H + (LANES.length - 1) * LANE_GAP;
  const px = (time: number): number => ((time - from) / span) * width;
  const runs = stageRuns(epochs);
  const ticks: number[] = [];
  const stepHours = span / HOUR > 8 ? 2 : 1;
  for (let tick = Math.ceil((from + tzOffsetS) / HOUR) * HOUR - tzOffsetS; tick <= to; tick += HOUR) {
    if ((Math.round((tick + tzOffsetS) / HOUR) % 24) % stepHours === 0) ticks.push(tick);
  }

  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: spacing.sm }}>
      {labels ? (
        <View style={{ width: LABEL_W, gap: LANE_GAP }}>
          {LANES.map((stage) => (
            <View key={stage} style={{ height: LANE_H, justifyContent: 'center' }}>
              <AppText variant="caption" muted numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {t(`stage.${stage}`)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 6 }} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {LANES.map((stage, i) => {
              const y = i * (LANE_H + LANE_GAP) + LANE_H / 2;
              return <Line key={stage} x1={0} x2={width} y1={y} y2={y} stroke={colors.grid} strokeWidth={1} />;
            })}
            {runs.map((run) => {
              const lane = LANES.indexOf(run.stage);
              const x = px(run.start);
              return (
                <Rect
                  key={run.start}
                  x={x}
                  y={lane * (LANE_H + LANE_GAP)}
                  width={Math.max(1, px(run.end) - x)}
                  height={LANE_H}
                  rx={2}
                  fill={stageColor(colors, run.stage)}
                />
              );
            })}
          </Svg>
        ) : null}
        <View style={{ height: 18 }}>
          {width > 0
            ? ticks.map((tick) => (
                <AppText
                  key={tick}
                  variant="caption"
                  muted
                  numeric
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                  style={{ position: 'absolute', left: Math.min(Math.max(px(tick) - TICK_W / 2, 0), width - TICK_W), width: TICK_W, textAlign: 'center' }}>
                  {formatClock(tick, tzOffsetS).slice(0, 2)}
                </AppText>
              ))
            : null}
        </View>
      </View>
    </View>
  );
}
