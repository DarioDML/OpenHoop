import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { radius, spacing, useTheme } from './theme';

interface Props {
  question: string;
  testID?: string;
}

export function coachAskHref(question: string): { pathname: '/coach'; params: { ask: string } } {
  return { pathname: '/coach', params: { ask: question } };
}

export function CoachMark({ size = 40 }: { size?: number }): ReactElement {
  const { colors } = useTheme();
  const r = size / 2 - 1;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="coach-ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.coach.from} />
            <Stop offset="1" stopColor={colors.coach.to} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="url(#coach-ring)" strokeWidth={2} fill={colors.coach.surface} />
      </Svg>
      <Icon name="coach" color={colors.text} size={Math.round(size * 0.45)} />
    </View>
  );
}

export function CoachAsk({ question, testID }: Props): ReactElement {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={question}
      onPress={() => router.push(coachAskHref(question))}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 56,
        paddingVertical: spacing.sm,
        paddingLeft: spacing.sm,
        paddingRight: spacing.lg,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.coach.surface,
        opacity: pressed ? 0.85 : 1,
      })}>
      <CoachMark />
      <AppText variant="body" muted style={{ flex: 1 }}>
        {question}
      </AppText>
    </Pressable>
  );
}
