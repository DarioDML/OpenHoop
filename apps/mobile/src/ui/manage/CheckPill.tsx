import { Pressable } from 'react-native';

import { AppText } from '@/ui/AppText';
import { Icon } from '@/ui/Icon';
import { fonts, radius, useTheme } from '@/ui/theme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'checkbox' | 'radio';
  testID?: string;
}

export function CheckPill({ label, selected, onPress, role = 'checkbox', testID }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityState={role === 'checkbox' ? { checked: selected } : { selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.positive : colors.borderStrong,
        backgroundColor: selected ? colors.surface : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.8 : 1,
      })}>
      {selected ? <Icon name="check" color={colors.positive} size={16} strokeWidth={2.25} /> : null}
      <AppText variant="body" color={selected ? colors.text : colors.textMuted} style={{ fontSize: 14, fontFamily: fonts.medium }}>
        {label}
      </AppText>
    </Pressable>
  );
}
