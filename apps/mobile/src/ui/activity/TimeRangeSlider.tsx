import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, View, type AccessibilityActionEvent, type LayoutChangeEvent, type PanResponderInstance } from 'react-native';

import { clockText, dragRange, type RangeWindow, type TimeRange } from '@/data/activities';
import { useT } from '@/i18n/useT';

import { AppText } from '../AppText';
import { radius, useTheme } from '../theme';

interface Props {
  range: TimeRange;
  frame: RangeWindow;
  maxS: number;
  tzOffsetS: number;
  onChange: (range: TimeRange) => void;
  testID?: string;
}

type Handle = 'start' | 'end';

const HANDLE_W = 24;
const TRACK_H = 64;
const LABEL_W = 48;
const A11Y_STEP_S = 300;

export function TimeRangeSlider({ range, frame, maxS, tzOffsetS, onChange, testID }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const [width, setWidth] = useState(0);
  const span = Math.max(1, frame.to - frame.from);
  const usable = Math.max(1, width - HANDLE_W);
  const bounds = { from: frame.from, to: Math.min(frame.to, maxS) };
  const startX = useRef(new Animated.Value(0)).current;
  const endX = useRef(new Animated.Value(0)).current;
  const latest = useRef({ range, span, usable, bounds, onChange });
  latest.current = { range, span, usable, bounds, onChange };
  const origin = useRef(0);

  useEffect(() => {
    const at = (value: number): number => ((Math.min(Math.max(value, frame.from), frame.to) - frame.from) / span) * usable;
    startX.setValue(at(range.start));
    endX.setValue(at(range.end));
  }, [range.start, range.end, frame.from, frame.to, span, usable, startX, endX]);

  const responder = (handle: Handle): PanResponderInstance =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        origin.current = latest.current.range[handle];
      },
      onPanResponderMove: (_event, gesture) => {
        const current = latest.current;
        current.onChange(dragRange(current.range, handle, origin.current + (gesture.dx / current.usable) * current.span, current.bounds));
      },
    });
  const startResponder = useRef(responder('start')).current;
  const endResponder = useRef(responder('end')).current;

  const step = (handle: Handle, event: AccessibilityActionEvent): void => {
    const delta = event.nativeEvent.actionName === 'increment' ? A11Y_STEP_S : event.nativeEvent.actionName === 'decrement' ? -A11Y_STEP_S : 0;
    if (delta !== 0) onChange(dragRange(range, handle, range[handle] + delta, bounds));
  };

  const xOf = (value: number): number => HANDLE_W / 2 + ((Math.min(Math.max(value, frame.from), frame.to) - frame.from) / span) * usable;
  const onLayout = (event: LayoutChangeEvent): void => setWidth(Math.round(event.nativeEvent.layout.width));

  const handleView = (handle: Handle, x: Animated.Value, pan: PanResponderInstance) => (
    <Animated.View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t(handle === 'start' ? 'activity.edit.dragStart' : 'activity.edit.dragEnd')}
      accessibilityValue={{ text: clockText(range[handle], tzOffsetS) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => step(handle, event)}
      testID={testID ? `${testID}-${handle}` : undefined}
      hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
      style={{ position: 'absolute', top: 6, left: 0, width: HANDLE_W, height: TRACK_H - 12, borderRadius: 8, backgroundColor: colors.primary, transform: [{ translateX: x }] }}
    />
  );

  return (
    <View style={{ gap: 6 }}>
      <View onLayout={onLayout} testID={testID} style={{ height: TRACK_H, borderRadius: radius.md, backgroundColor: colors.surface }}>
        {width > 0 ? (
          <>
            <View
              pointerEvents="none"
              style={{ position: 'absolute', top: 14, bottom: 14, left: xOf(range.start), width: Math.max(2, xOf(range.end) - xOf(range.start)), borderRadius: 10, backgroundColor: colors.accent }}
            />
            {handleView('start', startX, startResponder)}
            {handleView('end', endX, endResponder)}
          </>
        ) : null}
      </View>
      <View style={{ height: 18 }}>
        {width > 0
          ? frame.ticks.map((tick, index) => {
              const first = index === 0;
              const last = index === frame.ticks.length - 1;
              return (
                <AppText
                  key={tick}
                  variant="caption"
                  muted
                  numeric
                  style={[
                    { position: 'absolute', width: LABEL_W },
                    first ? { left: 0 } : last ? { right: 0, textAlign: 'right' } : { left: Math.min(width - LABEL_W, Math.max(0, xOf(tick) - LABEL_W / 2)), textAlign: 'center' },
                  ]}>
                  {clockText(tick, tzOffsetS)}
                </AppText>
              );
            })
          : null}
      </View>
    </View>
  );
}
