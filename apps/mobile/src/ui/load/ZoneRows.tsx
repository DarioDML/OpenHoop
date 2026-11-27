import type { ReactElement } from 'react';
import { View } from 'react-native';

import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatDuration } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Num } from '@/ui/Num';
import { radius, spacing, useTheme } from '@/ui/theme';
import { displayedZones } from '@/ui/ZoneBar';

const ZONE_KEYS: readonly TranslationKey[] = ['zone.1', 'zone.2', 'zone.3', 'zone.4', 'zone.5'];

export function clockDuration(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

interface Props {
  zoneSeconds: ReadonlyArray<number>;
  testID?: string;
}

export function ZoneRows({ zoneSeconds: raw, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const { t } = useT();
  const zones = displayedZones(raw);
  const total = zones.reduce((a, b) => a + b, 0);
  const order = [4, 3, 2, 1, 0];
  return (
    <View testID={testID} style={{ gap: 10 }}>
      {order.map((i) => {
        const seconds = zones[i] ?? 0;
        const fraction = total > 0 ? seconds / total : 0;
        const key = ZONE_KEYS[i] ?? 'zone.1';
        return (
          <View
            key={key}
            testID={testID === undefined ? undefined : `${testID}-${i + 1}`}
            accessible
            accessibilityLabel={`${t(key)} ${formatDuration(t, seconds)}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AppText variant="cap" style={{ width: 28 }}>
              {t('loadScreen.zones.short', { zone: i + 1 })}
            </AppText>
            <View style={{ flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
              {fraction > 0 ? <View style={{ width: `${Math.max(fraction * 100, 3)}%`, height: 10, borderRadius: radius.pill, backgroundColor: colors.zones[i] }} /> : null}
            </View>
            <View style={{ width: 44, alignItems: 'flex-end', marginLeft: spacing.xs }}>
              <Num size={17} color={seconds > 0 ? colors.text : colors.textMuted}>
                {clockDuration(seconds)}
              </Num>
            </View>
          </View>
        );
      })}
    </View>
  );
}
