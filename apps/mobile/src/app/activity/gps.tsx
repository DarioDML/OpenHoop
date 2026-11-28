import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatElapsed, parseActivityType } from '@/data/activityDerived';
import { aimAt } from '@/data/loadDerived';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { useAppData } from '@/data/context';
import {
  gpsSignal,
  HIDDEN_ZONE_M,
  latestSplits,
  markerStepM,
  MIN_PACE_DISTANCE_M,
  paceSecondsPerKm,
  routeSplits,
  speedKmh,
  usesPace,
  visibleRoute,
  type GpsSignal,
} from '@/data/route';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { distanceIn, distanceUnit, formatDistance, formatPace, formatShortDistance, formatSpeed, unitLengthM, useUnits, type Measure } from '@/lib/units';
import { BuzzChip, LiveControls, LiveStatus, ZoneStrip } from '@/ui/activity/LiveParts';
import { RouteMap } from '@/ui/activity/RouteMap';
import { nowSeconds, useLiveRecording } from '@/ui/activity/useLiveRecording';
import { useRouteRecorder, type GpsState } from '@/ui/activity/useRouteRecorder';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip, type ChipTone } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { useLayout } from '@/ui/layout';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { radius, spacing, useTheme } from '@/ui/theme';
import { goBack } from '@/ui/TopBar';

const BLOCKED: Partial<Record<GpsState, TranslationKey>> = {
  denied: 'route.live.denied',
  approximate: 'route.live.approximate',
  unavailable: 'route.live.unavailable',
};

const SIGNAL: Record<GpsSignal, { key: TranslationKey; tone: ChipTone }> = {
  0: { key: 'route.live.signal.none', tone: 'negative' },
  1: { key: 'route.live.signal.weak', tone: 'warning' },
  2: { key: 'route.live.signal.fair', tone: 'warning' },
  3: { key: 'route.live.signal.good', tone: 'positive' },
};

const ZONE_KEYS = ['zone.1', 'zone.2', 'zone.3', 'zone.4', 'zone.5'] as const;
const SPLITS_SHOWN = 3;

export default function GpsActivityScreen() {
  const { notice, userData, days } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const { height: windowHeight } = useWindowDimensions();
  const units = useUnits();
  const params = useLocalSearchParams<{ type?: string; start?: string; live?: string }>();
  const type = parseActivityType(params.type);
  const recording = useLiveRecording(type, { adoptLive: params.live === '1' });
  const gps = useRouteRecorder(type);
  const [starting, setStarting] = useState(false);
  const { session, save, running, hud, heartRate, now } = recording;
  const fmt = (v: number, d = 0): string => formatNumber(v, d, language);

  const { points, progress } = gps;
  const { shown, lastSplits } = useMemo(
    () => ({
      shown: visibleRoute([...points], userData.hideRouteEnds ? HIDDEN_ZONE_M : 0, 0, markerStepM(progress.distanceM, units)),
      lastSplits: latestSplits(routeSplits(points, units), SPLITS_SHOWN),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- points is a mutable ref that keeps its identity; progress.version changes on every new fix
    [points, progress.version, progress.distanceM, userData.hideRouteEnds, units],
  );

  const begin = async (): Promise<void> => {
    if (starting) return;
    setStarting(true);
    try {
      if (await gps.start()) await recording.begin();
    } finally {
      setStarting(false);
    }
  };

  const beginRef = useRef(begin);
  beginRef.current = begin;
  const autoStarted = useRef(false);
  useEffect(() => {
    if (params.start !== '1' || autoStarted.current) return;
    autoStarted.current = true;
    void beginRef.current();
  }, [params.start]);

  const pause = (): void => {
    gps.pause();
    recording.send({ kind: 'pause', at: nowSeconds() });
  };

  const resume = (): void => {
    gps.resume();
    recording.send({ kind: 'resume', at: nowSeconds() });
  };

  const finish = async (): Promise<void> => {
    const route = gps.stop();
    await recording.finish(route.length >= 2 ? route : undefined);
  };

  const blocked = session.phase === 'ready' ? BLOCKED[gps.state] : undefined;
  const pace = usesPace(type);
  const paceSeconds = paceSecondsPerKm(progress.distanceM, hud.activeS);
  const speed = speedKmh(progress.distanceM, hud.activeS);
  const paceValue: Measure | null = pace ? (paceSeconds === null ? null : formatPace(paceSeconds, units)) : speed === null ? null : formatSpeed(speed, units, language);
  const needs = formatShortDistance(MIN_PACE_DISTANCE_M, units, language);
  const distance = formatDistance(progress.distanceM, units, language, 2);
  const signal = gpsSignal(gps.state === 'recording', progress.accuracyM);
  const zone = hud.zone;
  const zoneColor = zone !== null && zone > 0 ? colors.zones[zone - 1] : undefined;
  const unitWord = distanceUnit(units);
  const markerText = (m: number): string => fmt(distanceIn(m, units), m % unitLengthM(units) === 0 ? 0 : 1);
  const mapHeight = Math.max(240, Math.round(windowHeight * 0.42));

  const footer =
    session.phase === 'ready' ? (
      blocked !== undefined ? (
        <Button label={t('route.live.withoutRoute')} variant="secondary" onPress={() => router.replace({ pathname: '/activity/live', params: { type, start: '1' } })} testID="gps-without-route" />
      ) : (
        <Button label={starting ? t('route.live.asking') : t('route.live.start')} icon="play" disabled={starting} onPress={() => void begin()} testID="gps-begin" />
      )
    ) : running ? (
      <LiveControls phase={session.phase} onPause={pause} onResume={resume} onStop={() => void finish()} testIDPrefix="gps" />
    ) : save.kind === 'saved' ? (
      <Button label={t('activity.live.view')} onPress={() => router.replace({ pathname: '/activity/details', params: { id: String(save.id) } })} testID="gps-view" />
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="gps-activity">
      <Stack.Screen options={{ presentation: 'modal' }} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} testID="screen-scroll">
        <View style={{ height: mapHeight + insets.top, backgroundColor: colors.surfaceAlt }}>
          {shown !== null ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
              <RouteMap
                points={shown.points}
                markers={shown.markers}
                markerLabel={(m) => markerText(m.distanceM)}
                network={null}
                label={t('route.mapLabelUnit', { distance: distance.value, unit: distance.unit })}
                height={mapHeight}
                rounded={false}
                testID="gps-map"
              />
            </View>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingTop: insets.top, paddingHorizontal: gutter }}>
              <Icon name="gps" color={colors.textFaint} size={48} />
              {session.phase !== 'ready' ? (
                <AppText variant="label" muted testID="gps-waiting" style={{ textAlign: 'center' }}>
                  {gps.state === 'recording' ? t('route.live.waitingFix') : t('route.live.unavailable')}
                </AppText>
              ) : null}
            </View>
          )}
          <View style={{ position: 'absolute', top: insets.top + spacing.md, left: gutter, right: gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={goBack}
              hitSlop={6}
              testID="gps-close"
              style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" color={colors.text} size={22} strokeWidth={2} />
            </Pressable>
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${t(SIGNAL[signal].key)}${progress.accuracyM === null ? '' : ` · ${t('route.live.accuracy', { value: fmt(progress.accuracyM) })}`}`}
              testID="gps-signal">
              <Chip tone={SIGNAL[signal].tone} label={`GPS ${'●'.repeat(signal)}${'○'.repeat(3 - signal)}`} />
            </View>
          </View>
        </View>

        <View
          style={{
            marginTop: -24,
            flexGrow: 1,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            backgroundColor: colors.sheet,
            paddingTop: spacing.xl,
            paddingHorizontal: gutter,
            paddingBottom: spacing.xxl,
            gap: spacing.lg,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
            <AppText variant="cap" muted numberOfLines={1} style={{ flexShrink: 1 }}>
              {`${t(`activity.type.${type}`)} · ${t('route.title')}`}
            </AppText>
            <LiveStatus phase={session.phase} testID="gps-status" />
          </View>

          {session.phase === 'ready' ? (
            <Card testID="gps-rationale">
              <AppText variant="cardTitle">{t('route.live.permissionTitle')}</AppText>
              <AppText variant="body" muted>
                {t('route.live.permissionBody')}
              </AppText>
              {blocked !== undefined ? (
                <AppText variant="label" color={colors.negative} testID={`gps-${gps.state}`}>
                  {t(blocked)}
                </AppText>
              ) : null}
            </Card>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <BigStat label={t('route.distance')} value={distance.value} unit={distance.unit} testID="gps-distance" />
                <BigStat
                  label={t(pace ? 'route.pace' : 'route.speed')}
                  value={paceValue === null ? t('route.needsDistanceUnit', { distance: `${needs.value} ${needs.unit}` }) : paceValue.value}
                  unit={paceValue?.unit}
                  note={paceValue === null}
                  testID="gps-pace"
                />
                <BigStat
                  label={session.phase === 'paused' ? t('activity.live.paused') : t('activity.live.elapsed')}
                  value={formatElapsed(hud.activeS)}
                  testID="gps-elapsed"
                />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
                  <Icon name="heart" color={colors.metric.readinessLow} fill={colors.metric.readinessLow} size={22} />
                  <Num size={44} color={zoneColor} unit={heartRate === null ? undefined : t('unit.bpm')} unitSize={19} unitColor={colors.textMuted} testID="gps-hr">
                    {heartRate === null ? '–' : fmt(heartRate)}
                  </Num>
                </View>
                <Chip
                  tone={zone !== null && zone >= 4 ? 'warning' : zone !== null && zone > 0 ? 'positive' : 'neutral'}
                  label={running && heartRate === null ? t('activity.live.noHrYet') : zone !== null && zone > 0 ? t(ZONE_KEYS[zone - 1] ?? 'activity.live.noZone') : t('activity.live.noZone')}
                  testID="gps-zone"
                />
                <View accessible accessibilityLabel={`${t('activity.live.load')} ${hud.load === null ? t('activity.live.noHrYet') : fmt(hud.load, 1)}`} testID="gps-load">
                  <Num size={32} color={colors.metric.loadBright}>
                    {hud.load === null ? '–' : fmt(hud.load, 1)}
                  </Num>
                  <AppText variant="capSmall" muted>
                    {t('activity.live.load')}
                  </AppText>
                </View>
              </View>

              <ZoneStrip zone={heartRate === null ? null : zone} testID="gps-zones" />
              <BuzzChip prefs={userData.loadBuzz} aim={aimAt(days, days.length - 1)} todayKey={unixToIsoDate(now, deviceTzOffsetS(new Date(now * 1000)))} testID="gps-buzz" />

              {lastSplits.length > 0 ? (
                <View style={{ gap: spacing.sm }} testID="gps-splits">
                  <AppText variant="capSmall" muted>
                    {t('route.splits')}
                  </AppText>
                  {lastSplits.map((split) => (
                    <View key={split.index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <AppText variant="body" muted>
                        {t('route.splitLabelUnit', { unit: unitWord, index: split.index })}
                      </AppText>
                      <Num size={20}>{formatElapsed(split.durationS)}</Num>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={{ gap: spacing.xs }}>
                {progress.accuracyM !== null ? (
                  <AppText variant="caption" muted testID="gps-accuracy">
                    {t('route.live.accuracy', { value: fmt(progress.accuracyM) })}
                  </AppText>
                ) : null}
                {progress.rejected > 0 ? (
                  <AppText variant="caption" muted testID="gps-skipped">
                    {t('route.live.skipped', { count: progress.rejected })}
                  </AppText>
                ) : null}
                {gps.state === 'unavailable' ? (
                  <AppText variant="caption" color={colors.negative} testID="gps-lost">
                    {t('route.live.unavailable')}
                  </AppText>
                ) : null}
                <ParityBadge level={PARITY.route} />
              </View>
            </>
          )}

          <Card tone="outline">
            <AppText variant="label" muted>
              {t('route.live.keepOpen')}
            </AppText>
          </Card>

          {save.kind === 'saving' ? (
            <AppText variant="label" muted testID="gps-saving">
              {t('activity.live.saving')}
            </AppText>
          ) : save.kind === 'saved' ? (
            <Card tone="outline" testID="gps-saved">
              <AppText variant="label" muted>
                {t('activity.live.saved')}
              </AppText>
            </Card>
          ) : save.kind === 'short' ? (
            <Card tone="outline" testID="gps-short">
              <AppText variant="label" muted>
                {t('activity.live.tooShort')}
              </AppText>
            </Card>
          ) : save.kind === 'failed' ? (
            <AppText variant="label" color={colors.negative} testID="gps-failed">
              {notice === null ? t('activity.form.failed') : t(notice.key, notice.params)}
            </AppText>
          ) : null}
        </View>
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + spacing.lg, paddingTop: spacing.md, backgroundColor: colors.sheet }}>{footer}</View> : null}
    </View>
  );
}

function BigStat({ label, value, unit, note = false, testID }: { label: string; value: string; unit?: string; note?: boolean; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, gap: 6, minWidth: 0 }} testID={testID}>
      <AppText variant="capSmall" muted numberOfLines={1}>
        {label}
      </AppText>
      {note ? (
        <AppText variant="label" muted>
          {value}
        </AppText>
      ) : (
        <Num size={36} unit={unit} unitSize={16} unitColor={colors.textMuted} adjustsFontSizeToFit>
          {value}
        </Num>
      )}
    </View>
  );
}
