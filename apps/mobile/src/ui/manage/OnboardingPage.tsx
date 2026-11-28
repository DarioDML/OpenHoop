import type { ReactNode } from 'react';
import { View } from 'react-native';

import { onboardingStage, type OnboardingScreen } from '@/data/onboarding';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/controls';
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

interface DotsProps {
  screen: OnboardingScreen;
}

export function StepDots({ screen }: DotsProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const { part, stage, total } = onboardingStage(screen);
  return (
    <View
      accessible
      accessibilityLabel={t(part === 'you' ? 'onboarding.stage.you' : 'onboarding.stage.band', { stage, total })}
      testID="onboarding-dots"
      style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={{
            width: index + 1 === stage ? 22 : 8,
            height: 8,
            borderRadius: radius.pill,
            backgroundColor: index + 1 === stage ? colors.text : colors.surface3,
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
  screen: OnboardingScreen;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  primary: Action;
  secondary?: Action;
  tertiary?: Action;
  hideBack?: boolean;
  testID?: string;
}

export function OnboardingPage({ screen, title, subtitle, children, primary, secondary, tertiary, hideBack = false, testID }: Props) {
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
      <TopBar back={!hideBack} center={<StepDots screen={screen} />} />
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
