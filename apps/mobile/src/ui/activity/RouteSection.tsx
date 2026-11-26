import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatElapsed, type ActivityType } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import {
  distanceMarkers,
  formatPace,
  HIDDEN_ZONE_M,
  markerStepM,
  paceSecondsPerKm,
  routeStats,
  speedKmh,
  splits,
  usesPace,
  visibleRoute,
  type RoutePoint,
} from '@/data/route';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { currentNetworkPrefs } from '@/net';
import { featureEnabled, strictestPrefs } from '@/net/features';

import { AppText } from '../AppText';
import { Card } from '../Card';
import { Chip } from '../Chip';
import { Button, Toggle } from '../controls';
import { ParityBadge } from '../ParityBadge';
import { PARITY } from '../parity';
import { Section } from '../Section';
import { spacing, useTheme } from '../theme';
import { StatRow, StatTile } from './parts';
import { RouteMap } from './RouteMap';

interface Props {
  activityId: number | null;
  activeS: number;
  type: ActivityType | null;
}

export function RouteSection({ activityId, activeS, type }: Props) {
  const { routeFor, userData, updateUserData } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const [route, setRoute] = useState<RoutePoint[] | null>(activityId === null ? [] : null);
  const fmt = (v: number, d = 0): string => formatNumber(v, d, language);

  useEffect(() => {
    if (activityId === null) {
      setRoute([]);
      return undefined;
    }
    let alive = true;
    routeFor(activityId).then(
      (points) => {
        if (alive) setRoute(points);
      },
      () => {
        if (alive) setRoute([]);
      },
    );
    return () => {
      alive = false;
    };
  }, [activityId, routeFor]);

  const hide = userData.hideRouteEnds;
  const derived = useMemo(() => {
    if (route === null || route.length < 2) return null;
    const stats = routeStats(route);
    const step = markerStepM(stats.distanceM);
    const shown = visibleRoute(route, hide ? HIDDEN_ZONE_M : 0, hide ? HIDDEN_ZONE_M : 0, step);
    return { stats, step, shown, splits: splits(distanceMarkers(route, step)) };
  }, [route, hide]);

  if (route === null) {
    return (
      <AppText variant="label" muted testID="route-loading">
        {t('route.loading')}
      </AppText>
    );
  }
  if (derived === null) {
    return (
      <Card tone="outline">
        <AppText variant="label" muted testID="detail-no-route">
          {t('route.none')}
        </AppText>
      </Card>
    );
  }

  const { stats, shown } = derived;
  const network = strictestPrefs(userData.network, currentNetworkPrefs());
  const mapsOn = featureEnabled(network, 'maps');
  const pace = usesPace(type ?? 'other');
  const paceValue = pace ? paceSecondsPerKm(stats.distanceM, activeS) : speedKmh(stats.distanceM, activeS);
  const km = (m: number): string => fmt(m / 1000, m % 1000 === 0 ? 0 : 1);

  return (
    <Section title={t('route.title')}>
      <Card testID="detail-route" style={{ gap: spacing.md }}>
        {shown === null ? (
          <AppText variant="label" muted testID="route-too-short">
            {t('route.tooShortHidden')}
          </AppText>
        ) : (
          <RouteMap
            points={shown.points}
            markers={shown.markers}
            markerLabel={(m) => km(m.distanceM)}
            network={mapsOn ? network : null}
            label={t('route.mapLabel', { distance: fmt(stats.distanceM / 1000, 2) })}
            testID="route-map"
          />
        )}
        {hide ? <Chip tone="info" label={t('route.hidden')} testID="route-hidden" /> : null}
        {!mapsOn ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="caption" muted testID="route-map-off">
              {t('route.mapOff')}
            </AppText>
            <Button label={t('route.privacyLink')} variant="tertiary" onPress={() => router.push('/settings/privacy')} testID="route-privacy" />
          </View>
        ) : null}
        <StatRow>
          <StatTile label={t('route.distance')} value={fmt(stats.distanceM / 1000, 2)} unit={t('route.unit.km')} testID="route-distance" />
          <StatTile
            label={t(pace ? 'route.pace' : 'route.speed')}
            value={paceValue === null ? t('route.needsDistance') : pace ? formatPace(paceValue) : fmt(paceValue, 1)}
            unit={paceValue === null ? undefined : t(pace ? 'route.unit.perKm' : 'route.unit.kmh')}
            testID="route-pace"
          />
          <StatTile
            label={t('route.elevation')}
            value={stats.elevationGainM === null ? t('route.noAltitude') : fmt(stats.elevationGainM)}
            unit={stats.elevationGainM === null ? undefined : t('route.unit.m')}
            testID="route-elevation"
          />
        </StatRow>
        {stats.segments > 1 ? (
          <AppText variant="caption" muted testID="route-gaps">
            {t('route.gaps', { count: stats.segments - 1 })}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="bodyStrong">{t('route.hideEnds')}</AppText>
            <AppText variant="caption" muted>
              {t('route.hideEndsBody')}
            </AppText>
          </View>
          <Toggle label={t('route.hideEnds')} value={hide} onChange={(on) => void updateUserData({ hideRouteEnds: on })} testID="route-hide-toggle" />
        </View>
        <ParityBadge level={PARITY.route} />
        <AppText variant="caption" muted>
          {t('route.estimate')}
        </AppText>
      </Card>
      {derived.splits.length > 0 ? (
        <Card testID="route-splits" style={{ gap: spacing.sm }}>
          <AppText variant="cardTitle">{t('route.splits')}</AppText>
          {derived.splits.map((split) => (
            <View key={split.index} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body">{t('route.splitLabel', { distance: km(split.distanceM) })}</AppText>
              <AppText variant="bodyStrong" numeric>
                {formatElapsed(split.durationS)}
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}
    </Section>
  );
}
