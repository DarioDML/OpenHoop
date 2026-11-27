import type { Href } from 'expo-router';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from './AppText';
import { Card } from './Card';
import { Chip, type ChipTone } from './Chip';
import { Num } from './Num';
import { spacing, useTheme } from './theme';

interface GridProps {
  children: ReactNode;
  testID?: string;
}

export function StatGrid({ children, testID }: GridProps): ReactElement {
  const items = Children.toArray(children).filter(isValidElement);
  const rows: ReactElement[][] = [];
  items.forEach((item, i) => {
    if (i % 2 === 0) rows.push([item]);
    else rows[rows.length - 1]?.push(item);
  });
  return (
    <View style={{ gap: spacing.md }} testID={testID}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: spacing.md }}>
          {row.map((item, c) => (
            <View key={item.key ?? c} style={{ flex: 1, minWidth: 0 }}>
              {item}
            </View>
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

interface TileProps {
  label: string;
  value: string | null;
  missing?: string;
  unit?: string;
  chip?: { label: string; tone: ChipTone } | null;
  caption?: string;
  href?: Href;
  onPress?: () => void;
  accessibilityLabel?: string;
  header?: ReactNode;
  testID?: string;
}

export function tileSpokenLabel(parts: ReadonlyArray<string | null | undefined>): string {
  return parts.filter((part): part is string => part !== null && part !== undefined && part !== '').join(', ');
}

export function GridTile({ label, value, missing, unit, chip = null, caption, href, onPress, accessibilityLabel, header, testID }: TileProps): ReactElement {
  const { colors } = useTheme();
  const pressable = href !== undefined || onPress !== undefined;
  const spoken = accessibilityLabel ?? tileSpokenLabel([label, value === null ? missing : unit ? `${value} ${unit}` : value, chip?.label, caption]);
  const body = (
    <>
      {header ?? (
        <AppText variant="capSmall" muted numberOfLines={1}>
          {pressable ? `${label} ›` : label}
        </AppText>
      )}
      {value !== null ? (
        <Num size={40} unit={unit} unitSize={18} unitColor={colors.textMuted} adjustsFontSizeToFit testID={testID ? `${testID}-value` : undefined}>
          {value}
        </Num>
      ) : (
        <AppText variant="bodyStrong" muted testID={testID ? `${testID}-missing` : undefined} style={{ minHeight: 42 }}>
          {missing ?? ''}
        </AppText>
      )}
      {chip !== null ? <Chip label={chip.label} tone={chip.tone} testID={testID ? `${testID}-chip` : undefined} /> : null}
      {caption ? (
        <AppText variant="caption" muted>
          {caption}
        </AppText>
      ) : null}
    </>
  );
  if (pressable) {
    return (
      <Card href={href} onPress={onPress} accessibilityLabel={spoken} testID={testID} style={{ gap: 10, flex: 1 }}>
        {body}
      </Card>
    );
  }
  return (
    <Card testID={testID} style={{ flex: 1 }}>
      <View accessible={header === undefined} accessibilityLabel={header === undefined ? spoken : undefined} testID={testID ? `${testID}-content` : undefined} style={{ gap: 10 }}>
        {body}
      </View>
    </Card>
  );
}
