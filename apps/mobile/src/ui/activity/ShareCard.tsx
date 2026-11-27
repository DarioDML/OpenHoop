import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { formatElapsed, formatWeekday } from '@/data/activityDerived';
import type { CardHandle } from '@/data/shareImage';
import type { SnapshotFormat, SnapshotStyle, SnapshotView } from '@/data/shareSnapshot';
import type { HeartRatePoint, ParityLevel } from '@/data/types';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { formatDistance, formatPace, formatSpeed, useUnits } from '@/lib/units';
import type { NetworkPrefs } from '@/net/features';
import { parityColors } from '@/ui/ParityBadge';
import { darkColors, fonts, lightColors, radius, spacing, type ColorTokens } from '@/ui/theme';
import { displayedZones } from '@/ui/ZoneBar';

import { RouteMap } from './RouteMap';

interface Props {
  view: SnapshotView;
  style: SnapshotStyle;
  format?: SnapshotFormat;
  title: string;
  network?: NetworkPrefs | null;
}

const SIZES: Record<Exclude<SnapshotFormat, 'transparent'>, { width: number; height: number; map: number }> = {
  story: { width: 270, height: 480, map: 300 },
  square: { width: 320, height: 320, map: 320 },
};
const TRANSPARENT_WIDTH = 320;
const SEGMENTS = 7;

function Wordmark({ color }: { color: string }) {
  const circumference = 2 * Math.PI * 28;
  const gap = 6;
  const segment = (circumference - gap * SEGMENTS) / SEGMENTS;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessible accessibilityLabel="OpenHoop">
      <Svg width={18} height={18} viewBox="0 0 100 100">
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
      <Text style={{ fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.4, color }}>OpenHoop</Text>
    </View>
  );
}

function Badge({ level, colors }: { level: ParityLevel; colors: ColorTokens }) {
  const { fg, bg } = parityColors(colors, level);
  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: bg }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 9, color: fg }}>{level}</Text>
    </View>
  );
}

interface StatProps {
  label: string;
  value: string;
  unit?: string;
  level: ParityLevel;
  colors: ColorTokens;
  size: number;
  color?: string;
  testID: string;
}

function Stat({ label, value, unit, level, colors, size, color, testID }: StatProps) {
  return (
    <View style={{ gap: 2 }} testID={testID}>
      <Text style={{ fontFamily: fonts.numeric, fontSize: size, lineHeight: Math.round(size * 1.08), color: color ?? colors.text }}>
        {value}
        {unit ? <Text style={{ fontFamily: fonts.semibold, fontSize: Math.max(9, Math.round(size * 0.4)), color: colors.textMuted }}>{` ${unit}`}</Text> : null}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 1, color: colors.textMuted, textTransform: 'uppercase' }}>{label}</Text>
        <Badge level={level} colors={colors} />
      </View>
    </View>
  );
}

function Sparkline({ points, start, end, color, testID }: { points: ReadonlyArray<HeartRatePoint>; start: number; end: number; color: string; testID: string }) {
  const [width, setWidth] = useState(0);
  const height = 36;
  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);
  const values = points.map((p) => p.hr);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1, end - start);
  const range = Math.max(1, hi - lo);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(((p.t - start) / span) * width).toFixed(1)} ${(height - 2 - ((p.hr - lo) / range) * (height - 4)).toFixed(1)}`)
    .join('');
  return (
    <View onLayout={onLayout} style={{ height }} testID={testID}>
      {width > 0 && points.length > 1 ? (
        <Svg width={width} height={height}>
          <Path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      ) : null}
    </View>
  );
}

function FadeToBottom({ color }: { color: string }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize({ width, height });
      }}>
      {size ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id="card-fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0} />
              <Stop offset="0.4" stopColor={color} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.width} height={size.height} fill="url(#card-fade)" />
        </Svg>
      ) : null}
    </View>
  );
}

export const ShareCard = forwardRef<CardHandle, Props>(function ShareCard({ view, style, format = 'story', title, network = null }, ref) {
  const { t, language } = useT();
  const units = useUnits();
  const colors = style === 'dark' ? darkColors : lightColors;
  const fmt = (value: number, digits = 0): string => formatNumber(value, digits, language);
  const transparent = format === 'transparent';
  const size = transparent ? null : SIZES[format];
  const width = size?.width ?? TRANSPARENT_WIDTH;

  const big: ReactNode[] = [];
  if (view.pace !== null) {
    const distance = formatDistance(view.pace.distanceM, units, language, view.pace.distanceM >= 10_000 ? 1 : 2);
    big.push(<Stat key="distance" testID="card-distance" label={t('route.distance')} value={distance.value} unit={distance.unit} level={view.pace.level} colors={colors} size={30} />);
  }
  if (view.duration !== null) {
    big.push(<Stat key="duration" testID="card-duration" label={t('activity.details.duration')} value={formatElapsed(view.duration.seconds)} level={view.duration.level} colors={colors} size={30} />);
  }

  const middle: ReactNode[] = [];
  if (view.pace !== null) {
    const measure =
      view.pace.usesPace && view.pace.secondsPerKm !== null
        ? formatPace(view.pace.secondsPerKm, units)
        : view.pace.speedKmh !== null
          ? formatSpeed(view.pace.speedKmh, units, language)
          : null;
    if (measure !== null) {
      middle.push(
        <Stat key="pace" testID="card-pace" label={t(view.pace.usesPace ? 'route.pace' : 'route.speed')} value={measure.value} unit={measure.unit} level={view.pace.level} colors={colors} size={20} />,
      );
    }
  }
  if (view.load !== null) {
    middle.push(<Stat key="load" testID="card-load" label={t('activity.live.load')} value={fmt(view.load.value, 1)} level={view.load.level} colors={colors} size={20} color={colors.metric.loadBright} />);
  }

  const small: ReactNode[] = [];
  if (view.avgHr !== null) {
    small.push(<Stat key="avg" testID="card-avg-hr" label={t('loadx.hr.avg')} value={fmt(view.avgHr)} unit={t('unit.bpm')} level={view.heartRateLevel} colors={colors} size={16} />);
  }
  if (view.maxHr !== null) {
    small.push(<Stat key="max" testID="card-max-hr" label={t('loadx.hr.max')} value={fmt(view.maxHr)} unit={t('unit.bpm')} level={view.heartRateLevel} colors={colors} size={16} />);
  }
  if (view.calories !== null) {
    small.push(<Stat key="kcal" testID="card-calories" label={t('calories.title')} value={fmt(view.calories.kcal)} unit={t('calories.unit')} level={view.calories.level} colors={colors} size={16} />);
  }

  const zones = view.zones === null ? null : displayedZones(view.zones.seconds);
  const zoneTotal = zones === null ? 0 : zones.reduce((a, b) => a + b, 0);
  const capStyle = { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1.4, color: colors.textSoft, textTransform: 'uppercase' as const };

  const content = (
    <View style={{ padding: spacing.lg, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        <Text testID="card-title" style={capStyle}>
          {title}
        </Text>
        {view.day !== null ? (
          <>
            <Text style={capStyle}>{' · '}</Text>
            <Text testID="card-date" style={capStyle}>
              {`${formatWeekday(view.day, language)} ${formatShortDay(view.day, language)}`}
            </Text>
          </>
        ) : null}
      </View>
      {view.name !== null ? (
        <Text testID="card-name" style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.text }}>
          {view.name}
        </Text>
      ) : null}
      {big.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm }}>{big}</View> : null}
      {middle.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm }}>{middle}</View> : null}
      {small.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.sm }}>{small}</View> : null}
      {view.noHeartRate ? (
        <Text testID="card-no-hr" style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted }}>
          {t('activity.noHr')}
        </Text>
      ) : null}
      {view.hrChart !== null && view.hrChart.points.length > 1 ? (
        <Sparkline points={view.hrChart.points} start={view.hrChart.start} end={view.hrChart.end} color={colors.negative} testID="card-hr-chart" />
      ) : null}
      {zones !== null && view.zones !== null ? (
        <View style={{ gap: 4 }} testID="card-zones">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 1, color: colors.textMuted, textTransform: 'uppercase' }}>{t('load.zones')}</Text>
            <Badge level={view.zones.level} colors={colors} />
          </View>
          <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surfaceAlt, gap: 2 }}>
            {zones.map((seconds, i) => (seconds > 0 && zoneTotal > 0 ? <View key={i} style={{ flex: seconds, backgroundColor: colors.zones[i] }} /> : null))}
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Wordmark color={colors.textSoft} />
        <Text style={{ fontFamily: fonts.regular, fontSize: 9, color: colors.textFaint, flexShrink: 1, textAlign: 'right' }}>{t('activity.share.cardNote')}</Text>
      </View>
    </View>
  );

  const routeLabel = t('activity.share.routeLabel');

  if (transparent) {
    return (
      <View ref={ref} collapsable={false} testID="share-card" style={{ width, backgroundColor: 'transparent' }}>
        {view.route !== null ? (
          <RouteMap points={view.route.points} markers={[]} markerLabel={() => ''} network={null} label={routeLabel} height={200} rounded={false} palette={colors} bare testID="card-route" />
        ) : null}
        {content}
      </View>
    );
  }

  const frame = size ?? SIZES.story;
  return (
    <View
      ref={ref}
      collapsable={false}
      testID="share-card"
      style={{ width: frame.width, minHeight: frame.height, justifyContent: 'flex-end', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong }}>
      {view.route !== null ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
          <RouteMap points={view.route.points} markers={[]} markerLabel={() => ''} network={network} label={routeLabel} height={frame.map} rounded={false} palette={colors} testID="card-route" />
        </View>
      ) : null}
      <View>
        {view.route !== null ? <FadeToBottom color={colors.background} /> : null}
        {view.route !== null ? <View style={{ height: spacing.xxl }} /> : null}
        {content}
      </View>
    </View>
  );
});
