import { useRef } from 'react';
import { TextInput, View, type TextInputInstance } from 'react-native';

import { AppText } from '@/ui/AppText';
import { fonts, spacing, useTheme } from '@/ui/theme';

export type BirthPart = 'day' | 'month' | 'year';

interface Props {
  label: string;
  day: string;
  month: string;
  year: string;
  onChange: (part: BirthPart, value: string) => void;
  partLabels: Readonly<Record<BirthPart, string>>;
  placeholders: Readonly<Record<BirthPart, string>>;
  hint?: string;
  error?: boolean;
}

const WIDTHS: Readonly<Record<BirthPart, number>> = { day: 34, month: 34, year: 60 };
const LENGTHS: Readonly<Record<BirthPart, number>> = { day: 2, month: 2, year: 4 };

export function BirthDateField({ label, day, month, year, onChange, partLabels, placeholders, hint, error = false }: Props) {
  const { colors } = useTheme();
  const monthRef = useRef<TextInputInstance>(null);
  const yearRef = useRef<TextInputInstance>(null);
  const values: Readonly<Record<BirthPart, string>> = { day, month, year };
  const next: Readonly<Record<BirthPart, (() => void) | null>> = {
    day: () => monthRef.current?.focus(),
    month: () => yearRef.current?.focus(),
    year: null,
  };

  const input = (part: BirthPart) => (
    <TextInput
      ref={part === 'month' ? monthRef : part === 'year' ? yearRef : undefined}
      accessibilityLabel={partLabels[part]}
      value={values[part]}
      onChangeText={(text) => {
        const digits = text.replace(/\D/g, '').slice(0, LENGTHS[part]);
        onChange(part, digits);
        if (digits.length === LENGTHS[part]) next[part]?.();
      }}
      placeholder={placeholders[part]}
      placeholderTextColor={colors.textFaint}
      keyboardType="number-pad"
      maxLength={LENGTHS[part]}
      testID={`birth-${part}-input`}
      style={{ width: WIDTHS[part], minHeight: 50, color: colors.text, fontSize: 16, fontFamily: fonts.regular, textAlign: 'center', padding: 0 }}
    />
  );

  const slash = (
    <AppText variant="lead" muted importantForAccessibility="no" accessibilityElementsHidden>
      /
    </AppText>
  );

  return (
    <View style={{ gap: 6 }}>
      <AppText variant="capSmall" muted>
        {label}
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: 52,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: error ? colors.negative : colors.borderStrong,
          backgroundColor: colors.surfaceAlt,
          paddingHorizontal: spacing.sm,
        }}>
        {input('day')}
        {slash}
        {input('month')}
        {slash}
        {input('year')}
      </View>
      {hint ? (
        <AppText variant="caption" color={error ? colors.negative : colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
