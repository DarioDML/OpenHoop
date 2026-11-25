import { View } from 'react-native';

import { formatDuration } from '@/lib/format';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { radius, spacing, useTheme } from './theme';

interface Props {
  zoneSeconds: ReadonlyArray<number>;
}

const ZONE_KEYS = ['zone.1', 'zone.2', 'zone.3', 'zone.4', 'zone.5'] as const;

export function displayedZones(zoneSeconds: ReadonlyArray<number>): ReadonlyArray<number> {
  return zoneSeconds.length > ZONE_KEYS.length ? zoneSeconds.slice(zoneSeconds.length - ZONE_KEYS.length) : zoneSeconds;
}

export function ZoneBar({ zoneSeconds: raw }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const zoneSeconds = displayedZones(raw);
  const total = zoneSeconds.reduce((a, b) => a + b, 0);

  return (
    <View style={{ gap: spacing.md }}>
      <View
        accessibilityLabel={ZONE_KEYS.map((key, i) => `${t(key)} ${formatDuration(t, zoneSeconds[i] ?? 0)}`).join(', ')}
        style={{ flexDirection: 'row', height: 18, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, gap: 2 }}>
        {ZONE_KEYS.map((key, i) => {
          const seconds = zoneSeconds[i] ?? 0;
          if (seconds <= 0 || total <= 0) return null;
          return <View key={key} style={{ flex: seconds, backgroundColor: colors.zones[i] }} />;
        })}
      </View>
      <View style={{ gap: spacing.sm }}>
        {ZONE_KEYS.map((key, i) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: colors.zones[i] }} />
            <AppText variant="body" style={{ flex: 1 }}>
              {t(key)}
            </AppText>
            <AppText variant="bodyStrong" numeric>
              {formatDuration(t, zoneSeconds[i] ?? 0)}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
