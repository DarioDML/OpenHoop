import { router, type Href } from 'expo-router';
import { Children, isValidElement, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useLayout } from './layout';
import { radius, spacing, useTheme } from './theme';

interface GroupProps {
  title?: string;
  children: ReactNode;
}

export function ListGroup({ title, children }: GroupProps) {
  const { colors } = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ gap: spacing.sm }}>
      {title ? (
        <AppText variant="capLarge" muted style={{ marginTop: spacing.sm }}>
          {title}
        </AppText>
      ) : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 4, paddingHorizontal: spacing.lg }}>
        {items.map((child, index) => (
          <View key={child.key ?? index} style={index < items.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null}>
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

export interface IconTileStyle {
  icon: IconName;
  color: string;
  background: string;
}

interface RowProps {
  title: string;
  subtitle?: string;
  icon?: IconTileStyle;
  leading?: ReactNode;
  right?: ReactNode;
  chip?: ReactNode;
  value?: string;
  href?: Href;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function ListRow({ title, subtitle, icon, leading, right, chip, value, href, onPress, chevron, destructive = false, disabled = false, testID }: RowProps) {
  const { colors } = useTheme();
  const { compact } = useLayout();
  const chipBelow = chip !== undefined && chip !== null && compact;
  const valueInline = value !== undefined && value !== '' && compact && subtitle !== undefined && subtitle !== '';
  const valueText = value ? (
    <AppText variant="label" muted numeric style={{ flexShrink: 1, maxWidth: valueInline ? '50%' : '45%', textAlign: 'right' }} testID={testID === undefined ? undefined : `${testID}-value`}>
      {value}
    </AppText>
  ) : null;
  const titleText = (
    <AppText variant="body" color={destructive ? colors.negative : undefined} style={{ fontWeight: '500', flexShrink: 1 }}>
      {title}
    </AppText>
  );
  const press = onPress ?? (href ? () => router.push(href) : undefined);
  const showChevron = chevron ?? press !== undefined;
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: subtitle ? 68 : 56, paddingVertical: spacing.md, opacity: disabled ? 0.5 : 1 }}>
      {leading}
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: icon.background, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon.icon} color={icon.color} size={18} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 3, minWidth: 0 }} testID={testID === undefined ? undefined : `${testID}-text`}>
        {valueInline ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm }}>
            {titleText}
            {valueText}
          </View>
        ) : (
          titleText
        )}
        {subtitle ? (
          <AppText variant="label" muted>
            {subtitle}
          </AppText>
        ) : null}
        {chipBelow ? <View style={{ flexDirection: 'row', marginTop: 3 }}>{chip}</View> : null}
      </View>
      {valueInline ? null : valueText}
      {chipBelow ? null : chip}
      {right}
      {showChevron ? <Icon name="chevronRight" color={colors.textMuted} size={18} /> : null}
    </View>
  );
  if (!press) return <View testID={testID}>{content}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={press}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}

interface CapHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
}

export function CapHeader({ title, action, onAction }: CapHeaderProps) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
      <AppText variant="capLarge" muted style={{ flex: 1, minWidth: 0 }}>
        {title}
      </AppText>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center', flexShrink: 0 }}>
          <AppText variant="cap" muted>
            {action}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
