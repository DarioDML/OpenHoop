import { ZONE_EDGES_PERCENT, type ZoneFloors } from '@openhoop/analytics';
import { View } from 'react-native';

import { formatElapsed } from '@/data/activityDerived';
import { zoneRanges } from '@/data/profile';
import { useT } from '@/i18n/useT';
import { formatDuration } from '@/lib/format';

import { AppText } from '../AppText';
import { Card } from '../Card';
import { Num } from '../Num';
import { radius, spacing, useTheme } from '../theme';
import { displayedZones } from '../ZoneBar';

export interface ZoneRangeLabels {
  basis: 'hrr' | 'custom';
  labels: [string, string, string, string, string];
}

export function zoneRangeLabels(floors: ZoneFloors | null, maxHr: number): ZoneRangeLabels {
  if (floors === null) {
    const label = (i: number): string => `${ZONE_EDGES_PERCENT[i] ?? 0}–${ZONE_EDGES_PERCENT[i + 1] ?? 100}%`;
    return { basis: 'hrr', labels: [label(0), label(1), label(2), label(3), label(4)] };
  }
  const ranges = zoneRanges(floors, maxHr);
  const label = (i: number): string => {
    const range = ranges[i];
    if (range === undefined) return '';
    return range.high === null ? `≥${range.low}` : `${range.low}–${range.high}`;
  };
  return { basis: 'custom', labels: [label(0), label(1), label(2), label(3), label(4)] };
}

interface Props {
  zoneSeconds: ReadonlyArray<number>;
  ranges: ZoneRangeLabels;
  testID?: string;
}

const ORDER = [4, 3, 2, 1, 0] as const;

export function ZoneRows({ zoneSeconds, ranges, testID }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const zones = displayedZones(zoneSeconds);
  const total = zones.reduce((a, b) => a + b, 0);
  return (
    <Card testID={testID} style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
        <AppText variant="cap" muted style={{ flexShrink: 1 }}>
          {t('load.zones')}
        </AppText>
        <AppText variant="caption" muted>
          {ranges.basis === 'hrr' ? t('activity.details.zonesHrr') : t('activity.details.zonesCustom')}
        </AppText>
      </View>
      {ORDER.map((i) => {
        const seconds = zones[i] ?? 0;
        const fraction = total > 0 ? seconds / total : 0;
        const zone = i + 1;
        return (
          <View
            key={zone}
            testID={testID ? `${testID}-${zone}` : undefined}
            accessible
            accessibilityLabel={t('activity.details.zoneRowA11y', { zone, range: ranges.labels[i], time: formatDuration(t, seconds) })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AppText variant="capSmall" numberOfLines={1} style={{ width: 108 }}>
              {`Z${zone} ${ranges.labels[i]}`}
            </AppText>
            <View style={{ flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
              {fraction > 0 ? <View style={{ width: `${Math.max(3, fraction * 100)}%`, height: 10, borderRadius: radius.pill, backgroundColor: colors.zones[i] }} /> : null}
            </View>
            <Num size={17} style={{ minWidth: 52, textAlign: 'right' }}>
              {formatElapsed(seconds)}
            </Num>
          </View>
        );
      })}
      <AppText variant="caption" muted>
        {t('load.zonesTotal', { time: formatDuration(t, total) })}
      </AppText>
    </Card>
  );
}
