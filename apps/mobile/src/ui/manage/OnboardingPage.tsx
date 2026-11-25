import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/controls';
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

export const ONBOARDING_STEPS = 11;

interface DotsProps {
  step: number;
  total?: number;
}

export function StepDots({ step, total = ONBOARDING_STEPS }: DotsProps) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={`${step} / ${total}`} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={{
            width: index + 1 === step ? 22 : 8,
            height: 8,
            borderRadius: radius.pill,
            backgroundColor: index + 1 === step ? colors.text : index + 1 < step ? colors.textMuted : colors.surface3,
          }}
        />
      ))}
    </View>
  );
}

interface Action {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

interface Props {
  step: number;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  primary: Action;
  secondary?: Action;
  tertiary?: Action;
  hideBack?: boolean;
  testID?: string;
}

export function OnboardingPage({ step, title, subtitle, children, primary, secondary, tertiary, hideBack = false, testID }: Props) {
  return (
    <Screen
      tint="home"
      gap={spacing.lg}
      testID={testID}
      footer={
        <>
          <Button label={primary.label} onPress={primary.onPress} disabled={primary.disabled} testID={primary.testID ?? 'onboarding-primary'} />
          {secondary ? <Button label={secondary.label} variant="secondary" onPress={secondary.onPress} disabled={secondary.disabled} testID={secondary.testID} /> : null}
          {tertiary ? <Button label={tertiary.label} variant="tertiary" onPress={tertiary.onPress} disabled={tertiary.disabled} testID={tertiary.testID} /> : null}
        </>
      }>
      <TopBar back={!hideBack} center={<StepDots step={step} />} />
      <View style={{ gap: 10 }}>
        <AppText variant="h1" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="lead" muted>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {children}
    </Screen>
  );
}
