import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from './AppText';
import { radius, spacing, useTheme } from './theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  testID?: string;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, testID }: ButtonProps) {
  const { colors } = useTheme();
  const background = variant === 'primary' ? colors.accent : variant === 'danger' ? colors.negative : colors.surfaceAlt;
  const foreground = variant === 'secondary' ? colors.text : variant === 'danger' ? '#FFFFFF' : colors.accentOn;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: background,
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        borderRadius: radius.md,
        minHeight: 48,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      <AppText variant="bodyStrong" color={foreground}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.md - 3,
              backgroundColor: selected ? colors.surface : 'transparent',
              borderWidth: selected ? 1 : 0,
              borderColor: colors.border,
            }}>
            <AppText variant="label" color={selected ? colors.text : colors.textMuted} style={{ fontWeight: selected ? '700' : '500' }}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
}

export function Field({ label, hint, style, ...rest }: FieldProps) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label" muted>
        {label}
      </AppText>
      <TextInput
        {...rest}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[
          {
            minHeight: 48,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceAlt,
            color: colors.text,
            paddingHorizontal: spacing.md,
            fontSize: 16,
          },
          style,
        ]}
      />
      {hint ? (
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
