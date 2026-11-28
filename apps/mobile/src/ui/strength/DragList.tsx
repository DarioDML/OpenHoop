import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Animated, PanResponder, View, type PanResponderInstance } from 'react-native';

import { reorderTarget, shiftFor } from '@/lib/reorder';
import { Icon } from '@/ui/Icon';
import { radius, spacing, useTheme } from '@/ui/theme';

interface Drag {
  from: number;
  to: number;
}

interface Handlers {
  begin: (key: string) => void;
  move: (key: string, dy: number) => void;
  end: (key: string, dy: number) => void;
  cancel: () => void;
}

function useHandle(key: string, handlers: Handlers): PanResponderInstance {
  const latest = useRef(handlers);
  latest.current = handlers;
  const responder = useRef<PanResponderInstance | null>(null);
  if (responder.current === null) {
    responder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => latest.current.begin(key),
      onPanResponderMove: (_, gesture) => latest.current.move(key, gesture.dy),
      onPanResponderRelease: (_, gesture) => latest.current.end(key, gesture.dy),
      onPanResponderTerminate: () => latest.current.cancel(),
    });
  }
  return responder.current;
}

interface RowProps {
  rowKey: string;
  index: number;
  dragging: boolean;
  shift: number;
  dy: Animated.Value;
  handlers: Handlers;
  onLayout: (height: number) => void;
  children: ReactNode;
  testPrefix: string;
}

function DragRow({ rowKey, index, dragging, shift, dy, handlers, onLayout, children, testPrefix }: RowProps): ReactElement {
  const { colors } = useTheme();
  const responder = useHandle(rowKey, handlers);
  return (
    <Animated.View
      onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
      style={{
        transform: [{ translateY: dragging ? dy : shift }],
        zIndex: dragging ? 2 : 0,
        elevation: dragging ? 6 : 0,
        backgroundColor: dragging ? colors.surfaceAlt : colors.surface,
        borderRadius: dragging ? radius.sm : 0,
        borderTopWidth: index > 0 && !dragging ? 1 : 0,
        borderTopColor: colors.border,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs }}>
        <View
          {...responder.panHandlers}
          testID={`${testPrefix}handle-${index}`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 4 }}
          style={{ width: 32, height: 68, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="grip" size={20} strokeWidth={3} color={dragging ? colors.text : colors.textMuted} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      </View>
    </Animated.View>
  );
}

interface Props<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  renderRow: (item: T, index: number) => ReactNode;
  onMove: (from: number, to: number) => void;
  onDragChange?: (dragging: boolean) => void;
  testPrefix: string;
}

export function DragList<T>({ items, keyOf, renderRow, onMove, onDragChange, testPrefix }: Props<T>): ReactElement {
  const { colors } = useTheme();
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const heights = useRef(new Map<string, number>());
  const keys = items.map(keyOf);
  const heightList = (): number[] => keys.map((key) => heights.current.get(key) ?? 68);
  const update = (next: Drag | null): void => {
    dragRef.current = next;
    setDrag(next);
  };

  const handlers: Handlers = {
    begin: (key) => {
      const from = keys.indexOf(key);
      if (from < 0) return;
      dy.setValue(0);
      update({ from, to: from });
      onDragChange?.(true);
    },
    move: (key, distance) => {
      const current = dragRef.current;
      if (current === null || keys[current.from] !== key) return;
      dy.setValue(distance);
      const to = reorderTarget(heightList(), current.from, distance);
      if (to !== current.to) update({ from: current.from, to });
    },
    end: (key, distance) => {
      const current = dragRef.current;
      update(null);
      dy.setValue(0);
      onDragChange?.(false);
      if (current === null || keys[current.from] !== key) return;
      const to = reorderTarget(heightList(), current.from, distance);
      if (to !== current.from) onMove(current.from, to);
    },
    cancel: () => {
      update(null);
      dy.setValue(0);
      onDragChange?.(false);
    },
  };

  const draggedHeight = drag === null ? 0 : (heights.current.get(keys[drag.from] ?? '') ?? 68);

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.md }} testID={`${testPrefix}list`}>
      {items.map((item, index) => {
        const key = keyOf(item);
        return (
          <DragRow
            key={key}
            rowKey={key}
            index={index}
            dragging={drag !== null && drag.from === index}
            shift={drag === null ? 0 : shiftFor(index, drag.from, drag.to, draggedHeight)}
            dy={dy}
            handlers={handlers}
            onLayout={(height) => heights.current.set(key, height)}
            testPrefix={testPrefix}>
            {renderRow(item, index)}
          </DragRow>
        );
      })}
    </View>
  );
}
