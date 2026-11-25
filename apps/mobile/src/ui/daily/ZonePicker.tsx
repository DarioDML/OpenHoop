import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useT } from '@/i18n/useT';
import { zoneTitle } from '@/lib/timeZones';
import { AppText } from '@/ui/AppText';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';

const MAX_VISIBLE = 8;

interface Props {
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (zone: string) => void;
  testID: string;
}

function matches(zone: string, query: string): boolean {
  const needle = query.trim().toLowerCase().replace(/\s+/g, '_');
  return needle === '' || zone.toLowerCase().includes(needle);
}

export function ZonePicker({ label, value, options, onChange, testID }: Props) {
  const { t } = useT();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const shown = useMemo(() => options.filter((zone) => matches(zone, query)), [options, query]);
  const visible = shown.slice(0, MAX_VISIBLE);

  return (
    <View style={{ gap: 6 }}>
      <AppText variant="capSmall" muted>
        {label}
      </AppText>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={{
          minHeight: 52,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surfaceAlt,
          paddingHorizontal: 14,
          justifyContent: 'center',
        }}>
        <AppText variant="body" muted={value === null}>
          {value === null ? t('jetlag.chooseZone') : zoneTitle(value)}
        </AppText>
      </Pressable>
      {open ? (
        <View style={{ gap: spacing.sm }}>
          <TextInput
            testID={`${testID}-search`}
            accessibilityLabel={t('jetlag.zoneSearch')}
            placeholder={t('jetlag.zoneSearch')}
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              minHeight: 48,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: colors.surfaceAlt,
              color: colors.text,
              paddingHorizontal: 14,
              fontSize: 16,
              fontFamily: fonts.regular,
            }}
          />
          {visible.length === 0 ? (
            <AppText variant="caption" muted>
              {t('jetlag.zoneNone')}
            </AppText>
          ) : (
            visible.map((zone) => (
              <Pressable
                key={zone}
                testID={`${testID}-option-${zone}`}
                accessibilityRole="button"
                accessibilityState={{ selected: zone === value }}
                onPress={() => {
                  onChange(zone);
                  setOpen(false);
                  setQuery('');
                }}
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  borderRadius: radius.md,
                  borderWidth: 1.5,
                  borderColor: zone === value ? colors.accent : colors.border,
                  backgroundColor: colors.surface,
                }}>
                <AppText variant="body">{zoneTitle(zone)}</AppText>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
