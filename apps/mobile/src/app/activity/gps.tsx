import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatElapsed, parseActivityType } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { formatPace, HIDDEN_ZONE_M, markerStepM, paceSecondsPerKm, speedKmh, usesPace, visibleRoute } from '@/data/route';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { RouteMap } from '@/ui/activity/RouteMap';
import { nowSeconds, useLiveRecording } from '@/ui/activity/useLiveRecording';
import { useRouteRecorder, type GpsState } from '@/ui/activity/useRouteRecorder';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import type { TranslationKey } from '@/i18n';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

const BLOCKED: Partial<Record<GpsState, TranslationKey>> = {
  denied: 'route.live.denied',
  approximate: 'route.live.approximate',
  unavailable: 'route.live.unavailable',
};

export default function GpsActivityScreen() {
  const { notice, userData } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ type?: string }>();
  const type = parseActivityType(params.type);
  const recording = useLiveRecording(type);
  const gps = useRouteRecorder(type);
  const [starting, setStarting] = useState(false);
  const { session, save, running, hud, heartRate } = recording;
  const fmt = (v: number, d = 0): string => formatNumber(v, d, language);

  const { points, progress } = gps;
  const shown = useMemo(
    () => visibleRoute([...points], userData.hideRouteEnds ? HIDDEN_ZONE_M : 0, 0, markerStepM(progress.distanceM)),
    [points, progress.version, progress.distanceM, userData.hideRouteEnds],
  );

  const begin = async (): Promise<void> => {
    setStarting(true);
    const ok = await gps.start();
    setStarting(false);
    if (ok) await recording.begin();
  };

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
    await recording.finish(route.length >= 2 ? () => route : undefined);
  };

  const blocked = session.phase === 'ready' ? BLOCKED[gps.state] : undefined;
  const pace = usesPace(type);
  const paceValue = pace ? paceSecondsPerKm(progress.distanceM, hud.activeS) : speedKmh(progress.distanceM, hud.activeS);

  const footer =
    session.phase === 'ready' ? (
      blocked !== undefined ? (
        <Button label={t('route.live.withoutRoute')} variant="secondary" onPress={() => router.replace({ pathname: '/activity/live', params: { type } })} testID="gps-without-route" />
      ) : (
        <Button label={starting ? t('route.live.asking') : t('route.live.start')} disabled={starting} onPress={() => void begin()} testID="gps-begin" />
      )
    ) : running ? (
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {session.phase === 'running' ? (
          <Button label={t('activity.live.pause')} variant="secondary" onPress={pause} style={{ flex: 1 }} testID="gps-pause" />
        ) : (
          <Button label={t('activity.live.resume')} variant="secondary" onPress={resume} style={{ flex: 1 }} testID="gps-resume" />
        )}
        <Button label={t('activity.live.stop')} onPress={() => void finish()} style={{ flex: 1 }} testID="gps-stop" />
      </View>
    ) : save.kind === 'saved' ? (
      <Button label={t('activity.live.view')} onPress={() => router.replace({ pathname: '/activity/details', params: { id: String(save.id) } })} testID="gps-view" />
    ) : null;

  return (
    <Screen
      tint="load"
      testID="gps-activity"
      header={
        <>
          <Stack.Screen options={{ presentation: 'modal' }} />
          <TopBar title={`${t(`activity.type.${type}`)} · ${t('route.title')}`} close back={false} />
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="cap" muted>
              {session.phase === 'paused' ? t('activity.live.paused') : t('activity.live.elapsed')}
            </AppText>
            <Num size={56} testID="gps-elapsed">
              {formatElapsed(hud.activeS)}
            </Num>
          </View>
        </>
      }
      footer={footer}>
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
          <StatRow>
            <StatTile label={t('route.distance')} value={fmt(progress.distanceM / 1000, 2)} unit={t('route.unit.km')} testID="gps-distance" />
            <StatTile
              label={t(pace ? 'route.pace' : 'route.speed')}
              value={paceValue === null ? '–' : pace ? formatPace(paceValue) : fmt(paceValue, 1)}
              unit={paceValue === null ? undefined : t(pace ? 'route.unit.perKm' : 'route.unit.kmh')}
              testID="gps-pace"
            />
            <StatTile label={t('metric.heartRate')} value={heartRate === null ? '–' : fmt(heartRate)} unit={heartRate === null ? undefined : t('unit.bpm')} testID="gps-hr" />
          </StatRow>
          <Card testID="gps-map-card">
            {shown === null ? (
              <AppText variant="label" muted testID="gps-waiting">
                {gps.state === 'recording' ? t('route.live.waitingFix') : t('route.live.unavailable')}
              </AppText>
            ) : (
              <RouteMap
                points={shown.points}
                markers={shown.markers}
                markerLabel={(m) => fmt(m.distanceM / 1000, m.distanceM % 1000 === 0 ? 0 : 1)}
                network={null}
                label={t('route.mapLabel', { distance: fmt(progress.distanceM / 1000, 2) })}
                testID="gps-map"
              />
            )}
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
          </Card>
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
    </Screen>
  );
}
