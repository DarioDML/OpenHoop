import type { ReactElement } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { fonts, radius, useTheme } from '@/ui/theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onStep: (direction: -1 | 1) => void;
  label: string;
  lessLabel: string;
  moreLabel: string;
  decimal?: boolean;
  error?: boolean;
  disabled?: boolean;
  testID: string;
}

const BUTTON = 28;

export function NumberStepper({ value, onChangeText, onStep, label, lessLabel, moreLabel, decimal = false, error = false, disabled = false, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const button = (direction: -1 | 1): ReactElement => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction < 0 ? lessLabel : moreLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => onStep(direction)}
      testID={`${testID}-${direction < 0 ? 'less' : 'more'}`}
      style={({ pressed }) => ({
        width: BUTTON,
        height: BUTTON,
        borderRadius: radius.pill,
        backgroundColor: colors.surface3,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}>
      <AppText variant="bodyStrong" style={{ fontSize: 18, lineHeight: 22 }}>
        {direction < 0 ? '−' : '+'}
      </AppText>
    </Pressable>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        padding: 3,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: error ? colors.negative : 'transparent',
        opacity: disabled ? 0.55 : 1,
      }}>
      {button(-1)}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        accessibilityLabel={label}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
        maxFontSizeMultiplier={1.3}
        testID={testID}
        style={{
          minWidth: 36,
          maxWidth: 52,
          paddingVertical: 0,
          paddingHorizontal: 2,
          textAlign: 'center',
          color: colors.text,
          fontFamily: fonts.numeric,
          fontSize: 20,
        }}
      />
      {button(1)}
    </View>
  );
}
