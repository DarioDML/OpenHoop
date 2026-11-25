import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { radius, spacing, useTheme } from './theme';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'accent' | 'warning' | 'danger' | 'outline';
  href?: Href;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function Card({ children, style, tone = 'default', href, onPress, accessibilityLabel, testID }: Props) {
  const { colors } = useTheme();
  const borderColor =
    tone === 'accent'
      ? colors.accent
      : tone === 'warning'
        ? colors.warning
        : tone === 'danger'
          ? colors.negative
          : tone === 'outline'
            ? colors.border
            : 'transparent';
  const base: ViewStyle = {
    backgroundColor: tone === 'outline' ? 'transparent' : colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor,
    padding: spacing.lg,
    gap: spacing.md,
  };
  const press = onPress ?? (href ? () => router.push(href) : undefined);
  if (press) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={press}
        testID={testID}
        style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[base, style]} testID={testID}>
      {children}
    </View>
  );
}

interface CardHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
  href?: Href;
  chevron?: boolean;
}

export function CardHeader({ title, action, onAction, href, chevron = false }: CardHeaderProps) {
  const { colors } = useTheme();
  const press = onAction ?? (href ? () => router.push(href) : undefined);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
      <AppText variant="cardTitle" style={{ flexShrink: 1 }}>
        {title}
      </AppText>
      {action && press ? (
        <Pressable accessibilityRole="link" onPress={press} hitSlop={10} style={{ minHeight: 32, justifyContent: 'center' }}>
          <AppText variant="capSmall" muted>
            {action}
          </AppText>
        </Pressable>
      ) : chevron ? (
        <AppText variant="title" muted>
          ›
        </AppText>
      ) : null}
    </View>
  );
}
