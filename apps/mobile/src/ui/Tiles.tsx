import { router, type Href } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
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
  testID?: string;
}

export function ActionTile({ icon, iconColor, label, href, onPress, background, size = 'small', badge, disabled = false, testID }: ActionTileProps): ReactElement {
  const { colors } = useTheme();
  const large = size === 'large';
  const press = onPress ?? (href === undefined ? undefined : () => router.push(href));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled || press === undefined}
      onPress={press}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: large ? 112 : 100,
        borderRadius: radius.md,
        backgroundColor: background ?? colors.surfaceAlt,
        paddingVertical: large ? spacing.lg : 14,
        paddingHorizontal: large ? spacing.lg : spacing.md,
        justifyContent: 'space-between',
        gap: spacing.sm,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}>
      <Icon name={icon} color={iconColor} size={large ? 28 : 26} />
      <AppText variant={large ? 'bodyStrong' : 'label'} style={{ fontWeight: '600' }}>
        {label}
      </AppText>
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
  caption?: string;
  href?: Href;
  onPress?: () => void;
  badge?: BadgeProps;
  testID?: string;
}

export function MetricLinkTile({ icon, iconColor, iconBackground, label, value, caption, href, onPress, badge, testID }: MetricLinkTileProps): ReactElement {
  const { colors } = useTheme();
  const press = onPress ?? (href === undefined ? undefined : () => router.push(href));
  return (
    <Pressable
      testID={testID}
      accessibilityRole={press === undefined ? undefined : 'button'}
      accessibilityLabel={[label, value, caption].filter((part): part is string => typeof part === 'string' && part.length > 0).join(', ')}
      disabled={press === undefined}
      onPress={press}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 140,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        padding: spacing.lg,
        gap: 10,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: iconBackground, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={iconColor} size={18} />
      </View>
      <AppText variant="capSmall" muted>
        {label}
      </AppText>
      {value === null ? (
        <AppText variant="label" muted>
          –
        </AppText>
      ) : (
        <Num size={30} adjustsFontSizeToFit>
          {value}
        </Num>
      )}
      {caption === undefined ? null : (
        <AppText variant="caption" muted>
          {caption}
        </AppText>
      )}
      {badge === undefined ? null : <TileBadge {...badge} />}
    </Pressable>
  );
}
