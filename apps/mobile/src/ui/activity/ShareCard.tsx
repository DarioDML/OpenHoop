import { forwardRef, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import type { CardHandle } from '@/data/shareImage';
import type { SnapshotStyle, SnapshotView } from '@/data/shareSnapshot';
import type { ParityLevel } from '@/data/types';
import { useT } from '@/i18n/useT';
import { formatWeekday } from '@/data/activityDerived';
import { formatDuration, formatNumber, formatShortDay } from '@/lib/format';
import { parityColors } from '@/ui/ParityBadge';
import { darkColors, fonts, lightColors, radius, spacing, type ColorTokens } from '@/ui/theme';
import { displayedZones } from '@/ui/ZoneBar';

interface Props {
  view: SnapshotView;
  style: SnapshotStyle;
  title: string;
}

const CARD_WIDTH = 320;
const SEGMENTS = 7;

function Wordmark({ color }: { color: string }) {
  const circumference = 2 * Math.PI * 28;
  const gap = 6;
  const segment = (circumference - gap * SEGMENTS) / SEGMENTS;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel="OpenHoop">
      <Svg width={22} height={22} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="seg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#A897FF" />
            <Stop offset="1" stopColor="#3FB0FF" />
          </LinearGradient>
        </Defs>
        <Circle
          cx={50}
          cy={50}
          r={28}
          fill="none"
          stroke="url(#seg)"
          strokeWidth={11}
          strokeDasharray={Array.from({ length: SEGMENTS }, () => `${segment} ${gap}`).join(' ')}
          transform="rotate(-87 50 50)"
        />
      </Svg>
      <Text style={{ fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0.4, color }}>OpenHoop</Text>
    </View>
  );
}

function Badge({ level, colors }: { level: ParityLevel; colors: ColorTokens }) {
  const { fg, bg } = parityColors(colors, level);
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: bg }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 10, color: fg }}>{level}</Text>
    </View>
  );
}

interface StatProps {
  label: string;
  value: string;
  unit?: string;
  level: ParityLevel;
  colors: ColorTokens;
  testID: string;
}

function Stat({ label, value, unit, level, colors, testID }: StatProps) {
  return (
    <View style={{ minWidth: 88, gap: 2 }} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1.2, color: colors.textMuted, textTransform: 'uppercase' }}>{label}</Text>
        <Badge level={level} colors={colors} />
      </View>
      <Text style={{ fontFamily: fonts.numeric, fontSize: 34, lineHeight: 36, color: colors.text }}>
        {value}
        {unit ? <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted }}>{` ${unit}`}</Text> : null}
      </Text>
    </View>
  );
}

export const ShareCard = forwardRef<CardHandle, Props>(function ShareCard({ view, style, title }, ref) {
  const { t, language } = useT();
  const colors = style === 'dark' ? darkColors : lightColors;
  const fmt = (value: number, digits = 0): string => formatNumber(value, digits, language);
  const stats: ReactNode[] = [];
  if (view.duration !== null) {
    stats.push(<Stat key="duration" testID="card-duration" label={t('activity.details.duration')} value={formatDuration(t, view.duration.seconds)} level={view.duration.level} colors={colors} />);
  }
  if (view.load !== null) {
    stats.push(<Stat key="load" testID="card-load" label={t('activity.live.load')} value={fmt(view.load.value, 1)} level={view.load.level} colors={colors} />);
  }
  if (view.avgHr !== null) {
    stats.push(<Stat key="avg" testID="card-avg-hr" label={t('loadx.hr.avg')} value={fmt(view.avgHr)} unit={t('unit.bpm')} level={view.heartRateLevel} colors={colors} />);
  }
  if (view.maxHr !== null) {
    stats.push(<Stat key="max" testID="card-max-hr" label={t('loadx.hr.max')} value={fmt(view.maxHr)} unit={t('unit.bpm')} level={view.heartRateLevel} colors={colors} />);
  }
  if (view.calories !== null) {
    stats.push(<Stat key="kcal" testID="card-calories" label={t('calories.title')} value={fmt(view.calories.kcal)} unit={t('calories.unit')} level={view.calories.level} colors={colors} />);
  }
  const zones = view.zones === null ? null : displayedZones(view.zones.seconds);
  const zoneTotal = zones === null ? 0 : zones.reduce((a, b) => a + b, 0);

  return (
    <View
      ref={ref}
      collapsable={false}
      testID="share-card"
      style={{ width: CARD_WIDTH, backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong }}>
      <View style={{ gap: 4 }}>
        <Text testID="card-title" style={{ fontFamily: fonts.bold, fontSize: 26, lineHeight: 30, color: colors.text }}>
          {title}
        </Text>
        {view.name !== null ? (
          <Text testID="card-name" style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.textSoft }}>
            {view.name}
          </Text>
        ) : null}
        {view.day !== null ? (
          <Text testID="card-date" style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted }}>
            {`${formatWeekday(view.day, language, 'long')} ${formatShortDay(view.day, language)}`}
          </Text>
        ) : null}
      </View>
      {stats.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.xl, rowGap: spacing.lg }}>{stats}</View> : null}
      {view.noHeartRate ? (
        <Text testID="card-no-hr" style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted }}>
          {t('activity.noHr')}
        </Text>
      ) : null}
      {zones !== null && view.zones !== null ? (
        <View style={{ gap: 6 }} testID="card-zones">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1.2, color: colors.textMuted, textTransform: 'uppercase' }}>{t('load.zones')}</Text>
            <Badge level={view.zones.level} colors={colors} />
          </View>
          <View style={{ flexDirection: 'row', height: 14, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, gap: 2 }}>
            {zones.map((seconds, i) =>
              seconds > 0 && zoneTotal > 0 ? <View key={i} style={{ flex: seconds, backgroundColor: colors.zones[i] }} /> : null,
            )}
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm }}>
        <Wordmark color={colors.textSoft} />
        <Text style={{ fontFamily: fonts.regular, fontSize: 10, color: colors.textFaint }}>{t('activity.share.cardNote')}</Text>
      </View>
    </View>
  );
});
