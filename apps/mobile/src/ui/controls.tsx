import { Pressable, Switch, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { Chip } from './Chip';
import { Icon, type IconName } from './Icon';
import { fonts, radius, spacing, useTheme } from './theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger';
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, icon, style, testID, accessibilityLabel }: ButtonProps) {
  const { colors } = useTheme();
  const background =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.negativeSoft : 'transparent';
  const foreground =
    variant === 'primary' ? colors.primaryOn : variant === 'tertiary' ? colors.link : variant === 'danger' ? colors.negative : colors.text;
  const border = variant === 'secondary' ? colors.text : variant === 'danger' ? colors.negative : 'transparent';
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
          borderWidth: variant === 'secondary' || variant === 'danger' ? 2 : 0,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
          borderRadius: radius.pill,
          minHeight: 56,
          paddingHorizontal: variant === 'tertiary' ? spacing.md : spacing.xl,
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
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

export function Segmented<T extends string>({ options, value, onChange, testID }: SegmentedProps<T>) {
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
            accessibilityRole="tab"
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
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={{ fontFamily: fonts.semibold, fontWeight: '600' }}>
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
