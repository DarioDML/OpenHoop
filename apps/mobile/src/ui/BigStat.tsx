import type { ReactElement } from 'react';
import { View } from 'react-native';

import { AppText } from './AppText';
import { Chip, type ChipTone } from './Chip';
import { Num } from './Num';
import { radius, spacing, useTheme } from './theme';

interface Props {
  label: string;
  value: string | null;
  unit?: string;
  missing?: string;
  chip?: { label: string; tone: ChipTone } | null;
  caption?: string;
  testID?: string;
}

export function BigStatTile({ label, value, unit, missing, chip = null, caption, testID }: Props): ReactElement {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={[label, value === null ? missing : `${value}${unit === undefined ? '' : ` ${unit}`}`, chip?.label, caption].filter((part): part is string => typeof part === 'string' && part.length > 0).join(', ')}
      style={{ flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, paddingTop: 18, gap: 10 }}>
      <AppText variant="capSmall" muted numberOfLines={1}>
        {label}
      </AppText>
      {value === null ? (
        <AppText variant="bodyStrong" muted testID={testID === undefined ? undefined : `${testID}-missing`} style={{ minHeight: 48, textAlignVertical: 'center' }}>
          {missing ?? '–'}
        </AppText>
      ) : (
        <Num size={48} unit={unit} unitSize={20} unitColor={colors.textMuted} adjustsFontSizeToFit testID={testID === undefined ? undefined : `${testID}-value`}>
          {value}
        </Num>
      )}
      {chip === null ? null : <Chip label={chip.label} tone={chip.tone} />}
      {caption === undefined ? null : (
        <AppText variant="caption" muted>
          {caption}
        </AppText>
      )}
    </View>
  );
}

export function BigStatRow({ children }: { children: ReactElement | ReactElement[] }): ReactElement {
  return <View style={{ flexDirection: 'row', gap: spacing.md }}>{children}</View>;
}
