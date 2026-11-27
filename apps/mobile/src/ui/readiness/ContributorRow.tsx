import { router, type Href } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Chip, type ChipTone } from '@/ui/Chip';
import { useExplain, type ExplainTarget } from '@/ui/explain/ExplainProvider';
import { Icon } from '@/ui/Icon';
import { MissingValue } from '@/ui/MetricTile';
import { Num } from '@/ui/Num';
import { spacing, useTheme } from '@/ui/theme';

interface Props {
  name: string;
  caption: string;
  value: string | null;
  unit?: string;
  chip: { label: string; tone: ChipTone } | null;
  href: Href;
  explain: ExplainTarget;
  divider: boolean;
  testID: string;
}

export function ContributorRow({ name, caption, value, unit, chip, href, explain, divider, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const { t } = useT();
  const { about } = useExplain();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={[name, value === null ? null : `${value}${unit ?? ''}`, chip?.label, caption].filter((part): part is string => part !== null && part !== undefined).join(', ')}
      onPress={() => router.push(href)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 64,
        paddingVertical: spacing.sm,
        gap: spacing.md,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <AppText variant="cap" numberOfLines={1} style={{ flexShrink: 1 }}>
            {`${name} ›`}
          </AppText>
          <Pressable
            testID={`${testID}-name`}
            accessibilityRole="button"
            accessibilityLabel={t('explain.whatIs', { name })}
            hitSlop={13}
            onPress={() => about(explain)}
            style={{ padding: 2 }}>
            <Icon name="info" size={14} color={colors.textMuted} />
          </Pressable>
        </View>
        <AppText variant="caption" muted testID={`${testID}-caption`}>
          {caption}
        </AppText>
      </View>
      {chip ? <Chip label={chip.label} tone={chip.tone} testID={`${testID}-chip`} /> : null}
      {value === null ? (
        <View style={{ maxWidth: '40%' }}>
          <MissingValue target={explain} testID={testID} />
        </View>
      ) : (
        <View style={{ minWidth: 76, alignItems: 'flex-end' }}>
          <Num size={30} unit={unit} unitSize={14} unitColor={colors.textMuted} testID={`${testID}-value`} maxFontSizeMultiplier={1.2}>
            {value}
          </Num>
        </View>
      )}
    </Pressable>
  );
}
