import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { formatElapsed, type ActivityType } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import {
  HIDDEN_ZONE_M,
  markerStepM,
  MIN_PACE_DISTANCE_M,
  paceSecondsPerKm,
  routeSplits,
  routeStats,
  speedKmh,
  usesPace,
  visibleRoute,
  type RoutePoint,
} from '@/data/route';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { distanceIn, formatDistance, formatPace, formatShortDistance, formatSpeed, M_PER_FT, unitLengthM, useUnits } from '@/lib/units';
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
import { useActivityRoute } from './useActivityRoute';

interface Props {
  activityId: number | null;
  activeS: number;
  type: ActivityType | null;
  route?: RoutePoint[] | null;
}

export function RouteSection({ activityId, activeS, type, route: given }: Props) {
  const { userData, updateUserData } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const units = useUnits();
  const fetched = useActivityRoute(given === undefined ? activityId : null);
  const route = given === undefined ? fetched : given;
  const fmt = (v: number, d = 0): string => formatNumber(v, d, language);

  const hide = userData.hideRouteEnds;
  const derived = useMemo(() => {
    if (route === null || route.length < 2) return null;
    const stats = routeStats(route);
    const step = markerStepM(stats.distanceM, units);
    const shown = visibleRoute(route, hide ? HIDDEN_ZONE_M : 0, hide ? HIDDEN_ZONE_M : 0, step);
    return { stats, step, shown, splits: routeSplits(route, units) };
  }, [route, hide, units]);

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
  const paceSeconds = paceSecondsPerKm(stats.distanceM, activeS);
  const speed = speedKmh(stats.distanceM, activeS);
  const paceValue = pace ? (paceSeconds === null ? null : formatPace(paceSeconds, units)) : speed === null ? null : formatSpeed(speed, units, language);
  const needs = formatShortDistance(MIN_PACE_DISTANCE_M, units, language);
  const distance = formatDistance(stats.distanceM, units, language, 2);
  const inUnit = (m: number): string => fmt(distanceIn(m, units), m % unitLengthM(units) === 0 ? 0 : 1);

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
            markerLabel={(m) => inUnit(m.distanceM)}
            network={mapsOn ? network : null}
            label={t('route.mapLabelUnit', { distance: distance.value, unit: distance.unit })}
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
          <StatTile label={t('route.distance')} value={distance.value} unit={distance.unit} testID="route-distance" />
          <StatTile
            label={t(pace ? 'route.pace' : 'route.speed')}
            value={paceValue === null ? t('route.needsDistanceUnit', { distance: `${needs.value} ${needs.unit}` }) : paceValue.value}
            unit={paceValue?.unit}
            testID="route-pace"
          />
          <StatTile
            label={t('route.elevation')}
            value={stats.elevationGainM === null ? t('route.noAltitude') : fmt(units === 'imperial' ? stats.elevationGainM / M_PER_FT : stats.elevationGainM)}
            unit={stats.elevationGainM === null ? undefined : units === 'imperial' ? 'ft' : t('route.unit.m')}
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
              <AppText variant="body">{t('route.splitLabelDistance', { distance: inUnit(split.distanceM), unit: distance.unit })}</AppText>
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
