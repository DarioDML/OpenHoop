import { router, type Href } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import type { ActivityType } from '@/data/activityDerived';
import type { ActivityEntry } from '@/data/activities';
import { reasonKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatNumber } from '@/lib/format';
import { entryTitle, kindLabel } from '@/ui/activity/entries';
import { AppText } from '@/ui/AppText';
import { Icon, type IconName } from '@/ui/Icon';
import { Num } from '@/ui/Num';
import { radius, spacing, useTheme } from '@/ui/theme';

const TYPE_ICONS: Partial<Record<ActivityType, IconName>> = {
  walking: 'steps',
  hiking: 'steps',
  strength: 'dumbbell',
  yoga: 'wind',
  pilates: 'wind',
};

interface Props {
  entry: ActivityEntry;
  href: Href;
  tzOffsetS: number;
  max: number;
  testID?: string;
}

export function LoadEntryRow({ entry, href, tzOffsetS, max, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const { t, language } = useT();
  const title = entryTitle(t, entry);
  const load = entry.metrics.load;
  const icon = (entry.type === null ? undefined : TYPE_ICONS[entry.type]) ?? 'pulse';
  const time = `${formatClock(entry.start, tzOffsetS)} – ${formatClock(entry.end, tzOffsetS)} · ${kindLabel(t, entry.kind)}`;
  const hr =
    entry.metrics.avgHr !== null && entry.metrics.maxHr !== null
      ? t('load.workoutStats', { avg: Math.round(entry.metrics.avgHr), max: Math.round(entry.metrics.maxHr) })
      : t('activity.noHr');
  const loadReason = entry.hasLoad && load === null ? t(reasonKey(entry.metrics.loadReason)) : null;
  const detail = [formatDuration(t, entry.metrics.activeS), hr, loadReason].filter((part): part is string => part !== null).join(' · ');
  const fraction = load === null ? 0 : Math.min(1, Math.max(0, load / max));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={load === null ? title : `${title}, ${t('activity.load.value', { value: formatNumber(load, 1, language) })}`}
      onPress={() => router.push(href)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 104, minHeight: 56, borderRadius: radius.sm, backgroundColor: colors.tint.load, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
        <Icon name={icon} color={colors.metric.loadBright} size={18} />
        {load !== null ? (
          <Num size={26} testID={testID === undefined ? undefined : `${testID}-load`}>
            {formatNumber(load, 1, language)}
          </Num>
        ) : (
          <AppText variant="caption" muted testID={testID === undefined ? undefined : `${testID}-load`}>
            {t('loadScreen.entry.noLoad')}
          </AppText>
        )}
      </View>
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
        <AppText variant="capLarge" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="label" muted numeric>
          {time}
        </AppText>
        <AppText variant="caption" muted numeric>
          {detail}
        </AppText>
        <View style={{ height: 2, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}>
          {fraction > 0 ? <View style={{ width: `${fraction * 100}%`, height: 2, borderRadius: radius.pill, backgroundColor: colors.metric.loadBright }} /> : null}
        </View>
      </View>
      <Icon name="chevronRight" color={colors.textMuted} size={18} />
    </Pressable>
  );
}
