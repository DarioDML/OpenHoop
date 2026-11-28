import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { useT } from '@/i18n/useT';

import { AppText } from '../AppText';
import { Card } from '../Card';
import { useLayout } from '../layout';
import { Num } from '../Num';
import { spacing, useTheme } from '../theme';

export const STEPPER_ROW_MIN_TEXT_WIDTH = 440;

export function stepperStacks(textWidth: number): boolean {
  return textWidth < STEPPER_ROW_MIN_TEXT_WIDTH;
}

interface Props {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  step?: number;
  format?: (value: number) => string;
  testID: string;
}

export function TargetStepper({ label, hint, value, min, max, onChange, step = 1, format, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const { textWidth } = useLayout();
  const { t } = useT();
  const stacked = stepperStacks(textWidth);
  const button = (delta: number, name: 'minus' | 'plus'): ReactElement => {
    const next = value + delta;
    const disabled = next < min || next > max;
    return (
      <Pressable
        testID={`${testID}-${name}`}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${delta > 0 ? t('plan.setup.increase') : t('plan.setup.decrease')}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onChange(next)}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        }}>
        <AppText variant="title">{delta > 0 ? '+' : '−'}</AppText>
      </Pressable>
    );
  };
  return (
    <Card testID={`${testID}-card`}>
      <View style={{ flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'stretch' : 'center', gap: spacing.md }} testID={`${testID}-layout`}>
        <View style={{ flex: stacked ? undefined : 1, gap: 2 }}>
          <AppText variant="cardTitle">{label}</AppText>
          <AppText variant="label" muted>
            {hint}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {button(-step, 'minus')}
          <View style={{ flex: stacked ? 1 : undefined, minWidth: 36, alignItems: 'center', flexShrink: 1 }}>
            <Num size={format ? 30 : 40} testID={`${testID}-value`} adjustsFontSizeToFit={format !== undefined}>
              {format ? format(value) : String(value)}
            </Num>
          </View>
          {button(step, 'plus')}
        </View>
      </View>
    </Card>
  );
}
