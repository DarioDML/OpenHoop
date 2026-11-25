import { View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { Toggle } from '@/ui/controls';
import { spacing } from '@/ui/theme';

interface KeyValueProps {
  label: string;
  value: string;
  valueColor?: string;
  testID?: string;
}

export function KeyValueRow({ label, value, valueColor, testID }: KeyValueProps) {
  return (
    <View testID={testID} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
      <AppText variant="body" muted>
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: subtitle ? 68 : 56, opacity: disabled ? 0.6 : 1 }}>
      <View style={{ flex: 1, gap: 3 }}>
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
