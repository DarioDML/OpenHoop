import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { Toggle } from '@/ui/controls';
import { useLayout } from '@/ui/layout';
import { maxFontScale, spacing, typeScale } from '@/ui/theme';

export function titleLineHeight(fontScale: number): number {
  return Math.round(typeScale.body.lineHeight * Math.min(fontScale, maxFontScale.body));
}

interface RowStatusProps {
  children: ReactNode;
  placement: 'chip' | 'right';
  testID?: string;
}

export function RowStatus({ children, placement, testID }: RowStatusProps) {
  const { compact, fontScale } = useLayout();
  if (placement === 'chip' && compact) return <>{children}</>;
  return (
    <View testID={testID} style={{ alignSelf: 'flex-start', minHeight: titleLineHeight(fontScale), justifyContent: 'center' }}>
      {children}
    </View>
  );
}

interface KeyValueProps {
  label: string;
  value: string;
  valueColor?: string;
  testID?: string;
}

export function KeyValueRow({ label, value, valueColor, testID }: KeyValueProps) {
  return (
    <View testID={testID} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
      <AppText variant="body" muted style={{ flexShrink: 1, minWidth: 96 }}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" numeric color={valueColor} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  );
}

interface ToggleRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

export function ToggleRow({ title, subtitle, value, onChange, disabled = false, testID }: ToggleRowProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: subtitle ? 68 : 56, paddingVertical: spacing.sm, opacity: disabled ? 0.6 : 1 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <AppText variant="body" style={{ fontWeight: '500' }}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" muted>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Toggle value={value} onChange={onChange} label={title} disabled={disabled} testID={testID} />
    </View>
  );
}
