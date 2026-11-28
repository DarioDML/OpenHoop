import { Pressable, Switch, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { Chip } from './Chip';
import { Icon, type IconName } from './Icon';
import { fonts, radius, spacing, useTheme } from './theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'soft' | 'outlineDanger';
  disabled?: boolean;
  icon?: IconName;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, icon, compact = false, style, testID, accessibilityLabel }: ButtonProps) {
  const { colors } = useTheme();
  const background =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.negativeSoft : variant === 'soft' ? colors.surfaceAlt : 'transparent';
  const foreground =
    variant === 'primary'
      ? colors.primaryOn
      : variant === 'tertiary'
        ? colors.link
        : variant === 'danger' || variant === 'outlineDanger'
          ? colors.negative
          : colors.text;
  const border = variant === 'secondary' ? colors.text : variant === 'danger' || variant === 'outlineDanger' ? colors.negative : 'transparent';
  const bordered = variant === 'secondary' || variant === 'danger' || variant === 'outlineDanger';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: background,
          borderColor: border,
          borderWidth: bordered ? 2 : 0,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
          borderRadius: radius.pill,
          minHeight: compact ? 44 : 56,
          paddingHorizontal: variant === 'tertiary' ? spacing.md : compact ? spacing.lg : spacing.xl,
          flexDirection: 'row',
          gap: spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      {icon ? <Icon name={icon} color={foreground} size={18} strokeWidth={2} /> : null}
      <AppText variant="capLarge" color={foreground}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string; accessibilityLabel?: string; testID?: string }>;
  value: T;
  onChange: (value: T) => void;
  wrap?: boolean;
  testID?: string;
}

export function Segmented<T extends string>({ options, value, onChange, wrap = false, testID }: SegmentedProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      testID={testID}
      style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, gap: 4 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={option.testID}
            accessibilityRole="tab"
            accessibilityLabel={option.accessibilityLabel}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: 36,
              paddingHorizontal: 6,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.pill,
              backgroundColor: selected ? colors.primary : 'transparent',
            }}>
            <AppText
              variant="label"
              color={selected ? colors.primaryOn : colors.textMuted}
              numberOfLines={wrap ? 2 : 1}
              adjustsFontSizeToFit={!wrap}
              minimumFontScale={0.7}
              style={{ fontFamily: fonts.semibold, fontWeight: '600', textAlign: 'center' }}>
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
  error?: boolean;
  suffix?: string;
}

export function Field({ label, hint, error = false, suffix, style, ...rest }: FieldProps) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="capSmall" muted>
        {label}
      </AppText>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          {...rest}
          accessibilityLabel={label}
          placeholderTextColor={colors.textFaint}
          style={[
            {
              minHeight: 52,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: error ? colors.negative : colors.borderStrong,
              backgroundColor: colors.surfaceAlt,
              color: colors.text,
              paddingHorizontal: 14,
              paddingRight: suffix ? 56 : 14,
              fontSize: 16,
              fontFamily: fonts.regular,
            },
            style,
          ]}
        />
        {suffix ? (
          <AppText variant="label" muted style={{ position: 'absolute', right: 14 }}>
            {suffix}
          </AppText>
        ) : null}
      </View>
      {hint ? (
        <AppText variant="caption" color={error ? colors.negative : colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  testID?: string;
}

export function Toggle({ value, onChange, label, disabled = false, testID }: ToggleProps) {
  const { colors } = useTheme();
  return (
    <Switch
      testID={testID}
      accessibilityLabel={label}
      value={value}
      disabled={disabled}
      onValueChange={onChange}
      trackColor={{ false: colors.surface3, true: colors.positive }}
      thumbColor={value ? colors.primaryOn : colors.textMuted}
    />
  );
}

interface CheckRowProps {
  label: string;
  subtitle?: string;
  badge?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  testID?: string;
}

export function CheckRow({ label, subtitle, badge, checked, onChange, testID }: CheckRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 })}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.sm,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.borderStrong,
          backgroundColor: checked ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {checked ? <Icon name="check" color={colors.primaryOn} size={16} /> : null}
      </View>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <AppText variant="body" style={{ fontWeight: '500' }}>
          {label}
        </AppText>
        {subtitle ? (
          <AppText variant="label" muted>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {badge ? <Chip label={badge} tone="positive" small /> : null}
    </Pressable>
  );
}

interface RadioRowProps {
  label: string;
  subtitle?: string;
  selected: boolean;
  onSelect: () => void;
  accent?: string;
  disabled?: boolean;
  testID?: string;
}

export function RadioRow({ label, subtitle, selected, onSelect, accent, disabled = false, testID }: RadioRowProps) {
  const { colors } = useTheme();
  const ring = accent ?? colors.purple;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={subtitle ? `${label}, ${subtitle}` : label}
      disabled={disabled}
      onPress={onSelect}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 56,
        paddingVertical: 14,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: selected ? ring : 'transparent',
        backgroundColor: colors.surface,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 20, height: 20, borderRadius: radius.pill, borderWidth: 2, borderColor: selected ? ring : colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
        {selected ? <View style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: ring }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <AppText variant="bodyStrong">{label}</AppText>
        {subtitle ? (
          <AppText variant="label" muted>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}
