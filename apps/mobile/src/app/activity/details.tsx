import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { formatElapsed, formatWeekday } from '@/data/activityDerived';
import { chartBucketS } from '@/data/activities';
import { useAppData, usePendingDelete } from '@/data/context';
import { caloriesForActivity } from '@/data/energyDerived';
import { customFloors, zoneReference } from '@/data/profile';
import { routeStats } from '@/data/route';
import type { HeartRatePoint, ParityLevel } from '@/data/types';
import { useT } from '@/i18n/useT';
import { unixToIsoDate } from '@/lib/dates';
import { formatClock, formatNumber, formatShortDay } from '@/lib/format';
import { formatDistance, useUnits } from '@/lib/units';
import { entryTitle, kindLabel, UndoBar, useResolvedEntry, type ResolvedEntry } from '@/ui/activity/entries';
import { NoDataScreen } from '@/ui/activity/parts';
import { RouteSection } from '@/ui/activity/RouteSection';
import { useActivityRoute } from '@/ui/activity/useActivityRoute';
import { zoneRangeLabels, ZoneRows } from '@/ui/activity/ZoneRows';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { HeartRateChart } from '@/ui/health/HeartRateChart';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { ScoreRing } from '@/ui/ScoreRing';
import { spacing, useTheme } from '@/ui/theme';
import { IconButton, TopBar } from '@/ui/TopBar';
import { StravaUploadCard } from '@/ui/strava/StravaUploadCard';

export default function ActivityDetailsScreen() {
  const pendingDelete = usePendingDelete();
  const { t } = useT();
  const resolved = useResolvedEntry();
  const hadEntry = useRef(false);
  if (resolved !== null) hadEntry.current = true;
  const gone = resolved === null && pendingDelete === null && hadEntry.current;

  useEffect(() => {
    if (gone && router.canGoBack()) router.back();
  }, [gone]);

  if (resolved === null) {
    return pendingDelete !== null ? (
      <Screen tint="load" testID="activity-deleted" header={<TopBar title={t('activity.details.title')} />}>
        <UndoBar />
      </Screen>
    ) : (
      <NoDataScreen title={t('activity.details.title')} notFound />
    );
  }
  return <DetailsBody resolved={resolved} />;
}

function DetailsBody({ resolved }: { resolved: ResolvedEntry }) {
  const { deleteActivity, userData, profile, days, heartRateBetween } = useAppData();
  const { t, language, reason } = useT();
  const { colors } = useTheme();
  const units = useUnits();
  const [deleting, setDeleting] = useState(false);
  const [heart, setHeart] = useState<HeartRatePoint[] | null>(null);
  const { entry, workout, tzOffsetS, query } = resolved;
  const route = useActivityRoute(entry.id);
  const bucketS = chartBucketS(entry.end - entry.start);

  useEffect(() => {
    let alive = true;
    heartRateBetween(entry.start, entry.end, bucketS).then(
      (points) => {
        if (alive) setHeart(points);
      },
      () => {
        if (alive) setHeart([]);
      },
    );
    return () => {
      alive = false;
    };
  }, [entry.start, entry.end, bucketS, heartRateBetween]);

  const distanceM = useMemo(() => (route !== null && route.length >= 2 ? routeStats(route).distanceM : null), [route]);
  const reference = zoneReference(days, profile, entry.start);
  const ranges = zoneRangeLabels(customFloors(profile), reference.max);
  const fmt = (v: number, d = 0): string => formatNumber(v, d, language);
  const day = unixToIsoDate(entry.start, tzOffsetS);
  const m = entry.metrics;
  const calories = entry.hasLoad ? caloriesForActivity(m.activeMinutes, entry.start, userData, profile) : null;
  const title = entryTitle(t, entry);
  const share = (): void => router.push({ pathname: '/activity/share', params: query });

  const remove = async (): Promise<void> => {
    setDeleting(true);
    const ok = await deleteActivity(entry.id !== null ? { kind: 'activity', id: entry.id } : { kind: 'detected', workout: workout ?? { start: entry.start, end: entry.end, zoneSeconds: m.zoneSeconds, avgHr: m.avgHr ?? 0, maxHr: m.maxHr ?? 0, source: 'auto', label: entry.label } });
    setDeleting(false);
    if (ok && router.canGoBack()) router.back();
  };

  const tiles: Tile[] = [
    { key: 'avg', label: t('loadx.hr.avg'), value: m.avgHr === null ? t('activity.noHr') : fmt(m.avgHr), unit: m.avgHr === null ? undefined : t('unit.bpm'), testID: 'detail-avg' },
    { key: 'max', label: t('loadx.hr.max'), value: m.maxHr === null ? t('activity.noHr') : fmt(m.maxHr), unit: m.maxHr === null ? undefined : t('unit.bpm'), testID: 'detail-max' },
  ];
  if (calories !== null) {
    tiles.push({
      key: 'kcal',
      label: `${t('calories.title')} · ${t('calories.estimate')}`,
      value: calories.estimate === null ? reason(calories.reason) : fmt(calories.estimate.totalKcal),
      unit: calories.estimate === null ? undefined : t('calories.unit'),
      testID: 'detail-calories',
      valueTestID: 'detail-calories-value',
      level: PARITY.calories,
    });
  }
  if (distanceM !== null) {
    const distance = formatDistance(distanceM, units, language, distanceM >= 10_000 ? 1 : 2);
    tiles.push({ key: 'distance', label: t('route.distance'), value: distance.value, unit: distance.unit, testID: 'detail-distance', level: PARITY.route });
  }

  return (
    <Screen
      tint="load"
      testID="activity-details"
      header={
        <>
          <TopBar title={title} right={<IconButton icon="share" label={t('activity.share.title')} onPress={share} color={colors.text} />} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            {entry.hasLoad ? (
              <View testID="detail-load">
                <ScoreRing
                  label={t('activity.live.load')}
                  sublabel={t('activity.live.load')}
                  value={m.load}
                  reason={m.loadReason}
                  max={21}
                  decimals={1}
                  level={PARITY.load}
                  size={120}
                  strokeWidth={9}
                  numberSize={44}
                  sublabelSize={10}
                  color={colors.metric.load}
                  showLabel={false}
                />
              </View>
            ) : null}
            <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
              <AppText variant="label" soft numeric testID="detail-when">
                {formatWeekday(day, language)} {formatShortDay(day, language)} · {formatClock(entry.start, tzOffsetS)}–{formatClock(entry.end, tzOffsetS)}
              </AppText>
              <Num size={40} testID="detail-duration" accessibilityLabel={`${t('activity.details.duration')} ${formatElapsed(m.activeS)}`}>
                {formatElapsed(m.activeS)}
              </Num>
              <Chip tone={entry.kind === 'detected' ? 'info' : 'neutral'} label={kindLabel(t, entry.kind)} testID="detail-kind" />
            </View>
          </View>
        </>
      }>
      <TileGrid tiles={tiles} />
      {calories !== null && calories.reason === 'no-profile' ? (
        <AppText variant="label" muted testID="detail-calories-profile">
          {t('calories.needsProfile')}
        </AppText>
      ) : null}
      {entry.hasLoad && m.load === null ? (
        <Card tone="outline">
          <AppText variant="label" muted testID="detail-no-load">
            {t(m.loadReason === 'low-coverage' ? 'activity.details.lowCoverage' : 'activity.details.noHr')}
          </AppText>
        </Card>
      ) : null}

      <Card testID="detail-hr" style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="cap" muted>
            {t('metric.heartRate')}
          </AppText>
          <ParityBadge level={PARITY.heartRate} />
        </View>
        {heart === null ? (
          <AppText variant="label" muted testID="detail-hr-loading">
            {t('activity.details.hrLoading')}
          </AppText>
        ) : (
          <HeartRateChart
            testID="detail-hr-chart"
            points={heart}
            startS={entry.start}
            endS={entry.end}
            tzOffsetS={tzOffsetS}
            bands={[]}
            bucketS={bucketS}
            height={160}
            axis="elapsed"
            area
            emptyLabel={t('activity.details.hrNone')}
          />
        )}
      </Card>

      <ZoneRows zoneSeconds={m.zoneSeconds} ranges={ranges} testID="detail-zones" />

      {entry.note !== null ? (
        <Card>
          <AppText variant="capSmall" muted>
            {t('activity.form.note')}
          </AppText>
          <AppText variant="body" testID="detail-note">
            {entry.note}
          </AppText>
        </Card>
      ) : null}
      <Card tone="outline" style={{ gap: 4 }}>
        <ParityBadge level={entry.kind === 'detected' ? PARITY.workouts : PARITY.load} long />
        <AppText variant="label" muted>
          {t('activity.details.dayLoad')}
        </AppText>
      </Card>
      <RouteSection activityId={entry.id} activeS={m.activeS} type={entry.type} route={route} />
      <StravaUploadCard entry={entry} title={title} tzOffsetS={tzOffsetS} />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Button label={t('activity.details.editShort')} accessibilityLabel={t('activity.details.edit')} icon="edit" variant="secondary" onPress={() => router.push({ pathname: '/activity/edit', params: query })} style={{ flex: 1 }} testID="detail-edit" />
        <Button label={t('activity.share.title')} icon="share" onPress={share} style={{ flex: 1 }} testID="detail-share" />
      </View>
      <Button label={t('activity.delete')} icon="trash" variant="danger" disabled={deleting} onPress={() => void remove()} testID="detail-delete" />
    </Screen>
  );
}

interface Tile {
  key: string;
  label: string;
  value: string;
  unit?: string;
  testID: string;
  valueTestID?: string;
  level?: ParityLevel;
}

function TileGrid({ tiles }: { tiles: readonly Tile[] }) {
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <View style={{ gap: spacing.md }}>
      {rows.map((row) => (
        <View key={row.map((tile) => tile.key).join('-')} style={{ flexDirection: 'row', gap: spacing.md }}>
          {row.map((tile) => (
            <DetailTile key={tile.key} tile={tile} />
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

function DetailTile({ tile }: { tile: Tile }) {
  const { colors } = useTheme();
  const numeric = tile.unit !== undefined;
  return (
    <Card testID={tile.testID} style={{ flex: 1, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <AppText variant="capSmall" muted numberOfLines={1} style={{ flexShrink: 1 }}>
          {tile.label}
        </AppText>
        {tile.level !== undefined ? <ParityBadge level={tile.level} /> : null}
      </View>
      {numeric ? (
        <Num size={40} unit={tile.unit} unitSize={18} unitColor={colors.textMuted} testID={tile.valueTestID}>
          {tile.value}
        </Num>
      ) : (
        <AppText variant="bodyStrong" muted testID={tile.valueTestID}>
          {tile.value}
        </AppText>
      )}
    </Card>
  );
}
