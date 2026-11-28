import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { Icon, type IconName } from '@/ui/Icon';
import { radius, spacing, useTheme } from '@/ui/theme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  error?: boolean;
  testID?: string;
}

export function SelectChip({ label, selected, onPress, icon, error = false, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const shown: IconName | undefined = selected ? 'check' : icon;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: error ? colors.negative : selected ? colors.pink : colors.borderStrong,
        backgroundColor: selected ? colors.surface : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}>
      {shown === undefined ? null : (
        <View>
          <Icon name={shown} color={selected ? colors.pink : colors.textMuted} size={16} strokeWidth={selected ? 2.2 : 1.8} />
        </View>
      )}
      <AppText variant="body" color={selected ? colors.text : colors.textSoft} style={{ fontWeight: selected ? '600' : '400' }}>
        {label}
      </AppText>
    </Pressable>
  );
}
