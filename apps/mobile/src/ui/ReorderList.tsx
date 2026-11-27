import { useRef, useState, type ReactElement } from 'react';
import { Animated, PanResponder, Pressable, View, type PanResponderInstance } from 'react-native';

import { useT } from '@/i18n/useT';
import { moveItem, reorderTarget, shiftFor } from '@/lib/reorder';

import { AppText } from './AppText';
import { Toggle } from './controls';
import { Icon } from './Icon';
import { radius, spacing, useTheme } from './theme';

interface Drag {
  from: number;
  to: number;
}

interface Handlers {
  begin: (item: string) => void;
  move: (item: string, dy: number) => void;
  end: (item: string, dy: number) => void;
  cancel: () => void;
}

function useRowResponder(item: string, handlers: Handlers): PanResponderInstance {
  const latest = useRef(handlers);
  latest.current = handlers;
  const responder = useRef<PanResponderInstance | null>(null);
  if (responder.current === null) {
    responder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => latest.current.begin(item),
      onPanResponderMove: (_, gesture) => latest.current.move(item, gesture.dy),
      onPanResponderRelease: (_, gesture) => latest.current.end(item, gesture.dy),
      onPanResponderTerminate: () => latest.current.cancel(),
    });
  }
  return responder.current;
}

interface RowProps {
  item: string;
  label: string;
  index: number;
  count: number;
  canHide: boolean;
  dragging: boolean;
  shift: number;
  dy: Animated.Value;
  handlers: Handlers;
  onLayout: (height: number) => void;
  onMove: (delta: -1 | 1) => void;
  onHide: () => void;
  testPrefix: string;
}

function ArrowButton({ icon, label, enabled, onPress, testID }: { icon: 'chevronUp' | 'chevronDown'; label: string; enabled: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={18} strokeWidth={2} color={enabled ? colors.textMuted : colors.surface3} />
    </Pressable>
  );
}

function ShownRow({ item, label, index, count, canHide, dragging, shift, dy, handlers, onLayout, onMove, onHide, testPrefix }: RowProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const responder = useRowResponder(item, handlers);
  const translateY = dragging ? dy : shift;
  return (
    <Animated.View
      testID={`${testPrefix}row-${item}`}
      onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
      style={{
        transform: [{ translateY }],
        zIndex: dragging ? 2 : 0,
        elevation: dragging ? 6 : 0,
        backgroundColor: dragging ? colors.surfaceAlt : colors.surface,
        borderRadius: dragging ? radius.sm : 0,
        borderTopWidth: index > 0 && !dragging ? 1 : 0,
        borderTopColor: colors.border,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: spacing.xs }}>
        <View
          {...responder.panHandlers}
          testID={`${testPrefix}handle-${item}`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 4 }}
          style={{ width: 36, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="grip" size={20} strokeWidth={3} color={dragging ? colors.text : colors.textMuted} />
        </View>
        <AppText variant="body" style={{ flex: 1 }}>
          {label}
        </AppText>
        <ArrowButton icon="chevronUp" label={`${t('home.moveUp')}: ${label}`} enabled={index > 0} onPress={() => onMove(-1)} testID={`${testPrefix}up-${item}`} />
        <ArrowButton icon="chevronDown" label={`${t('home.moveDown')}: ${label}`} enabled={index < count - 1} onPress={() => onMove(1)} testID={`${testPrefix}down-${item}`} />
        <Toggle value onChange={onHide} label={label} disabled={!canHide} testID={`${testPrefix}toggle-${item}`} />
      </View>
    </Animated.View>
  );
}

interface Props<T extends string> {
  all: readonly T[];
  shown: readonly T[];
  label: (item: T) => string;
  minimum: number;
  onChange: (next: T[]) => void;
  onDragChange?: (dragging: boolean) => void;
  testPrefix: string;
}

export function ReorderList<T extends string>({ all, shown, label, minimum, onChange, onDragChange, testPrefix }: Props<T>): ReactElement {
  const { colors } = useTheme();
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const heights = useRef(new Map<string, number>());
  const hidden = all.filter((item) => !shown.includes(item));
  const heightList = (): number[] => shown.map((item) => heights.current.get(item) ?? 56);
  const update = (next: Drag | null): void => {
    dragRef.current = next;
    setDrag(next);
  };

  const handlers: Handlers = {
    begin: (item) => {
      const from = shown.indexOf(item as T);
      if (from < 0) return;
      dy.setValue(0);
      update({ from, to: from });
      onDragChange?.(true);
    },
    move: (item, distance) => {
      const current = dragRef.current;
      if (current === null || shown[current.from] !== item) return;
      dy.setValue(distance);
      const to = reorderTarget(heightList(), current.from, distance);
      if (to !== current.to) update({ from: current.from, to });
    },
    end: (item, distance) => {
      const current = dragRef.current;
      update(null);
      dy.setValue(0);
      onDragChange?.(false);
      if (current === null || shown[current.from] !== item) return;
      const to = reorderTarget(heightList(), current.from, distance);
      if (to !== current.from) onChange(moveItem(shown, current.from, to));
    },
    cancel: () => {
      update(null);
      dy.setValue(0);
      onDragChange?.(false);
    },
  };

  const draggedHeight = drag === null ? 0 : (heights.current.get(shown[drag.from] ?? '') ?? 56);

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.md }} testID={`${testPrefix}list`}>
      {shown.map((item, index) => (
        <ShownRow
          key={item}
          item={item}
          label={label(item)}
          index={index}
          count={shown.length}
          canHide={shown.length > minimum}
          dragging={drag !== null && drag.from === index}
          shift={drag === null ? 0 : shiftFor(index, drag.from, drag.to, draggedHeight)}
          dy={dy}
          handlers={handlers}
          onLayout={(height) => heights.current.set(item, height)}
          onMove={(delta) => onChange(moveItem(shown, index, index + delta))}
          onHide={() => onChange(shown.filter((x) => x !== item))}
          testPrefix={testPrefix}
        />
      ))}
      {hidden.map((item, i) => (
        <View
          key={item}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: spacing.xs, borderTopWidth: shown.length > 0 || i > 0 ? 1 : 0, borderTopColor: colors.border }}>
          <View style={{ width: 36 }} />
          <AppText variant="body" muted style={{ flex: 1 }}>
            {label(item)}
          </AppText>
          <Toggle value={false} onChange={() => onChange([...shown, item])} label={label(item)} testID={`${testPrefix}toggle-${item}`} />
        </View>
      ))}
    </View>
  );
}
