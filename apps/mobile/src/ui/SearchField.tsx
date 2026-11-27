import { TextInput, View } from 'react-native';

import { Icon } from './Icon';
import { fonts, radius, spacing, useTheme } from './theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  label: string;
  placeholder?: string;
  testID?: string;
}

export function SearchField({ value, onChangeText, label, placeholder, testID }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: 52,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surfaceAlt,
      }}>
      <Icon name="search" color={colors.textMuted} size={20} />
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textFaint}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ flex: 1, minHeight: 48, color: colors.text, fontSize: 16, fontFamily: fonts.regular }}
      />
    </View>
  );
}
