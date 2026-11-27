import { useRef, useState, type ReactElement } from 'react';
import { Animated, PanResponder, View, type AccessibilityActionEvent, type LayoutChangeEvent, type PanResponderInstance } from 'react-native';

import { formatMinutes } from '@/data/dailyDerived';
import { AppText } from '@/ui/AppText';
import { radius, useTheme } from '@/ui/theme';

const DAY_MIN = 1440;
const SNAP_MIN = 5;
const MIN_GAP_MIN = 5;
const TRACK_H = 72;
const HANDLE_W = 24;
const HANDLE_H = 56;
const GRID_HOURS = 2;
const LABEL_HOURS = 6;

export function relative(minutes: number, windowStart: number): number {
  return (((minutes - windowStart) % DAY_MIN) + DAY_MIN) % DAY_MIN;
}

export function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN;
}

export function dragTo(which: 'start' | 'end', startRel: number, endRel: number, proposedRel: number): number {
  const value = snap(proposedRel);
  return which === 'start' ? Math.min(Math.max(0, value), endRel - MIN_GAP_MIN) : Math.max(Math.min(DAY_MIN, value), startRel + MIN_GAP_MIN);
}

interface Props {
  start: number | null;
  end: number | null;
  windowStart: number;
  onChange: (start: number, end: number) => void;
  label: string;
  startLabel: string;
  endLabel: string;
  testID?: string;
}

interface Latest {
  startRel: number;
  endRel: number;
  width: number;
  windowStart: number;
  onChange: (start: number, end: number) => void;
}

export function Timeline24({ start, end, windowStart, onChange, label, startLabel, endLabel, testID = 'timeline24' }: Props): ReactElement {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const startRel = start === null ? null : relative(start, windowStart);
  const endRaw = end === null ? null : relative(end, windowStart);
  const endRel = endRaw === null || startRel === null ? endRaw : endRaw <= startRel ? endRaw + DAY_MIN : endRaw;
  const shown = startRel !== null && endRel !== null && endRel <= DAY_MIN;
  const latest = useRef<Latest>({ startRel: startRel ?? 0, endRel: endRel ?? 0, width, windowStart, onChange });
  latest.current = { startRel: startRel ?? 0, endRel: endRel ?? 0, width, windowStart, onChange };
  const scales = useRef({ start: new Animated.Value(1), end: new Animated.Value(1) }).current;

  const emit = (which: 'start' | 'end', rel: number): void => {
    const { startRel: s, endRel: e, windowStart: w, onChange: change } = latest.current;
    const next = dragTo(which, s, e, rel);
    const nextStart = which === 'start' ? next : s;
    const nextEnd = which === 'end' ? next : e;
    if (nextStart === s && nextEnd === e) return;
    change((nextStart + w) % DAY_MIN, (nextEnd + w) % DAY_MIN);
  };

  const responder = (which: 'start' | 'end'): PanResponderInstance => {
    let origin = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        origin = which === 'start' ? latest.current.startRel : latest.current.endRel;
        Animated.spring(scales[which], { toValue: 1.12, useNativeDriver: true }).start();
      },
      onPanResponderMove: (_event, gesture) => {
        const w = latest.current.width;
        if (w <= 0) return;
        emit(which, origin + (gesture.dx / w) * DAY_MIN);
      },
      onPanResponderRelease: () => {
        Animated.spring(scales[which], { toValue: 1, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(scales[which], { toValue: 1, useNativeDriver: true }).start();
      },
    });
  };
  const responders = useRef({ start: responder('start'), end: responder('end') }).current;

  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);
  const x = (rel: number): number => (rel / DAY_MIN) * width;
  const step = (which: 'start' | 'end') => (event: AccessibilityActionEvent): void => {
    const current = which === 'start' ? latest.current.startRel : latest.current.endRel;
    if (event.nativeEvent.actionName === 'increment') emit(which, current + SNAP_MIN);
    if (event.nativeEvent.actionName === 'decrement') emit(which, current - SNAP_MIN);
  };

  const handle = (which: 'start' | 'end', rel: number, a11y: string) => (
    <Animated.View
      testID={`${testID}-${which}`}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={a11y}
      accessibilityValue={{ text: formatMinutes((rel + windowStart) % DAY_MIN) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={step(which)}
      hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
      {...responders[which].panHandlers}
      style={{
        position: 'absolute',
        top: (TRACK_H - HANDLE_H) / 2,
        left: x(rel) - HANDLE_W / 2,
        width: HANDLE_W,
        height: HANDLE_H,
        borderRadius: 8,
        backgroundColor: colors.primary,
        transform: [{ scale: scales[which] }],
      }}
    />
  );

  const grid = Array.from({ length: DAY_MIN / 60 / GRID_HOURS - 1 }, (_, i) => (i + 1) * GRID_HOURS * 60);
  const labels = Array.from({ length: DAY_MIN / 60 / LABEL_HOURS + 1 }, (_, i) => i * LABEL_HOURS * 60);

  return (
    <View style={{ gap: 8 }}>
      <View
        testID={testID}
        accessibilityLabel={label}
        onLayout={onLayout}
        style={{ height: TRACK_H, borderRadius: radius.md, backgroundColor: colors.surface }}>
        {width > 0
          ? grid.map((rel) => <View key={rel} style={{ position: 'absolute', top: 0, bottom: 0, left: x(rel), width: 1, backgroundColor: colors.border }} />)
          : null}
        {shown && width > 0 ? (
          <>
            <View
              testID={`${testID}-range`}
              style={{ position: 'absolute', top: 16, bottom: 16, left: x(startRel), width: Math.max(2, x(endRel) - x(startRel)), borderRadius: 10, backgroundColor: colors.metric.sleep }}
            />
            {handle('start', startRel, startLabel)}
            {handle('end', endRel, endLabel)}
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {labels.map((rel) => (
          <AppText key={rel} variant="caption" muted numeric>
            {formatMinutes((rel + windowStart) % DAY_MIN)}
          </AppText>
        ))}
      </View>
    </View>
  );
}
