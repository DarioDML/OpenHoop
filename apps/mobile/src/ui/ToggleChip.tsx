import { Pressable } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { radius, spacing, useTheme } from './theme';

interface Props {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID?: string;
}

export function ToggleChip({ label, value, onChange, testID }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => ({
        minHeight: 40,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: value ? colors.accent : colors.borderStrong,
        backgroundColor: value ? colors.border : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.8 : 1,
      })}>
      {value ? <Icon name="check" color={colors.accent} size={16} strokeWidth={2.25} /> : null}
      <AppText variant="body" color={value ? colors.text : colors.textMuted} style={{ fontWeight: '500' }}>
        {label}
      </AppText>
    </Pressable>
  );
}
