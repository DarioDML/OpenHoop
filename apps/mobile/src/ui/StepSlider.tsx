import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { radius, spacing, useTheme } from './theme';

interface Props<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  testID?: string;
}

const THUMB = 22;

export function StepSlider<T extends string>({ options, value, onChange, label, testID }: Props<T>): ReactElement {
  const { colors } = useTheme();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const last = Math.max(1, options.length - 1);
  const fraction = index / last;
  const pick = (next: number): void => {
    const option = options[Math.min(options.length - 1, Math.max(0, next))];
    if (option && option.value !== value) onChange(option.value);
  };
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: options[index]?.label ?? '' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => pick(index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))}
      style={{ gap: spacing.sm }}>
      <View style={{ height: THUMB, justifyContent: 'center', marginHorizontal: THUMB / 2 }}>
        <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: 'hidden' }}>
          <View style={{ width: `${fraction * 100}%`, height: 6, backgroundColor: colors.accent }} />
        </View>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: `${fraction * 100}%`, marginLeft: -THUMB / 2, width: THUMB, height: THUMB, borderRadius: radius.pill, backgroundColor: colors.accent }}
        />
        <View style={{ position: 'absolute', left: -THUMB / 2, right: -THUMB / 2, top: -12, bottom: -12, flexDirection: 'row' }}>
          {options.map((option, i) => (
            <Pressable key={option.value} accessible={false} onPress={() => pick(i)} style={{ flex: 1 }} testID={testID ? `${testID}-${option.value}` : undefined} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {options.map((option, i) => (
          <Pressable key={option.value} accessible={false} onPress={() => pick(i)} hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}>
            <AppText variant="label" color={i === index ? colors.text : colors.textMuted} style={{ fontWeight: i === index ? '600' : '400' }}>
              {option.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
