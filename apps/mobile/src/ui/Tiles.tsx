import { router, type Href } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, WordFitText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Num } from './Num';
import { radius, spacing, useTheme } from './theme';

interface BadgeProps {
  label: string;
  color: string;
  background: string;
}

function TileBadge({ label, color, background }: BadgeProps): ReactElement {
  return (
    <View style={{ position: 'absolute', top: 12, right: 10, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: background }}>
      <AppText variant="capSmall" color={color} style={{ fontSize: 9, lineHeight: 12, letterSpacing: 0.9 }}>
        {label}
      </AppText>
    </View>
  );
}

export const ACTION_LABEL_LINES = 3;

interface ActionTileProps {
  icon: IconName;
  iconColor: string;
  label: string;
  href?: Href;
  onPress?: () => void;
  background?: string;
  size?: 'large' | 'small';
  badge?: BadgeProps;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function ActionTile({ icon, iconColor, label, href, onPress, background, size = 'small', badge, disabled = false, accessibilityHint, testID }: ActionTileProps): ReactElement {
  const { colors } = useTheme();
  const large = size === 'large';
  const press = onPress ?? (href === undefined ? undefined : () => router.push(href));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled || press === undefined}
      onPress={press}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: large ? 96 : 84,
        borderRadius: radius.md,
        backgroundColor: background ?? colors.surfaceAlt,
        paddingVertical: large ? 14 : spacing.md,
        paddingHorizontal: large ? 14 : 10,
        justifyContent: 'space-between',
        gap: spacing.sm,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}>
      <Icon name={icon} color={iconColor} size={large ? 24 : 22} />
      <WordFitText variant={large ? 'bodyStrong' : 'label'} numberOfLines={ACTION_LABEL_LINES} style={{ fontWeight: '600' }} testID={testID === undefined ? undefined : `${testID}-label`}>
        {label}
      </WordFitText>
      {badge === undefined ? null : <TileBadge {...badge} />}
    </Pressable>
  );
}

interface MetricLinkTileProps {
  icon: IconName;
  iconColor: string;
  iconBackground: string;
  label: string;
  value: string | null;
  missing?: string;
  caption?: string;
  href?: Href;
  onPress?: () => void;
  badge?: BadgeProps;
  testID?: string;
}

export function MetricLinkTile({ icon, iconColor, iconBackground, label, value, missing, caption, href, onPress, badge, testID }: MetricLinkTileProps): ReactElement {
  const { colors } = useTheme();
  const press = onPress ?? (href === undefined ? undefined : () => router.push(href));
  return (
    <Pressable
      testID={testID}
      accessibilityRole={press === undefined ? undefined : 'button'}
      accessibilityLabel={[label, value ?? missing, caption].filter((part): part is string => typeof part === 'string' && part.length > 0).join(', ')}
      disabled={press === undefined}
      onPress={press}
      style={({ pressed }) => ({
        flex: 1,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        paddingVertical: 14,
        paddingHorizontal: 14,
        gap: 6,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 32, height: 32, borderRadius: radius.sm, backgroundColor: iconBackground, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Icon name={icon} color={iconColor} size={17} />
      </View>
      <WordFitText variant="capSmall" muted numberOfLines={2}>
        {label}
      </WordFitText>
      {value === null ? (
        <WordFitText variant="bodyStrong" muted numberOfLines={2} testID={testID === undefined ? undefined : `${testID}-missing`}>
          {missing ?? '–'}
        </WordFitText>
      ) : (
        <Num size={28} adjustsFontSizeToFit testID={testID === undefined ? undefined : `${testID}-value`}>
          {value}
        </Num>
      )}
      {caption === undefined ? null : (
        <AppText variant="caption" muted numberOfLines={2} testID={testID === undefined ? undefined : `${testID}-caption`}>
          {caption}
        </AppText>
      )}
      {badge === undefined ? null : <TileBadge {...badge} />}
    </Pressable>
  );
}
