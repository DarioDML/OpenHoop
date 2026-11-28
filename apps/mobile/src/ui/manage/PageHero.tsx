import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { Icon, type IconName } from '@/ui/Icon';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';

interface Props {
  icon: IconName;
  iconColor: string;
  iconBackground?: string;
  title: string;
  body?: string;
  mono?: string;
  layout?: 'row' | 'stack';
  children?: ReactNode;
  testID?: string;
}

export function PageHero({ icon, iconColor, iconBackground, title, body, mono, layout = 'row', children, testID }: Props): ReactElement {
  const stacked = layout === 'stack';
  const tile =
    iconBackground === undefined ? (
      <Icon name={icon} color={iconColor} size={40} />
    ) : (
      <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: iconBackground, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={iconColor} size={stacked ? 34 : 30} />
      </View>
    );
  return (
    <View testID={testID} style={{ flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'flex-start' : 'center', gap: stacked ? spacing.lg : spacing.lg }}>
      {tile}
      <View style={{ flex: stacked ? undefined : 1, gap: 6, minWidth: 0 }}>
        <AppText variant={stacked ? 'h1' : 'title'} accessibilityRole="header" style={stacked ? { fontSize: 32, lineHeight: 38 } : { fontSize: 24, lineHeight: 30 }}>
          {title}
        </AppText>
        {mono === undefined ? null : <MonoLine text={mono} />}
        {body === undefined ? null : (
          <AppText variant="lead" soft>
            {body}
          </AppText>
        )}
        {children}
      </View>
    </View>
  );
}

export function MonoLine({ text, testID }: { text: string; testID?: string }): ReactElement {
  const { colors } = useTheme();
  return (
    <AppText variant="label" testID={testID} color={colors.textMuted} style={{ fontFamily: fonts.mono, fontWeight: '400', letterSpacing: 0.4 }}>
      {text}
    </AppText>
  );
}

export function StatusDotChip({ label, color, background, testID }: { label: string; color: string; background: string; testID?: string }): ReactElement {
  return (
    <View testID={testID} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: background }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <AppText variant="label" color={color} style={{ fontWeight: '600' }}>
        {label}
      </AppText>
    </View>
  );
}
