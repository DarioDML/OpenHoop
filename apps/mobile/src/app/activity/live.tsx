import { loadReference } from '@openhoop/analytics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useReducer, useRef, useState } from 'react';
import { View } from 'react-native';

import { formatElapsed, loadTargetBand, parseActivityType } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { rangeStatus } from '@/data/derived';
import { activeSeconds, hudFor, IDLE_SESSION, liveReducer, type LiveEvent } from '@/data/liveSession';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { ProgressBar, StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { NotBuilt } from '@/ui/NotBuilt';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

const ZONE_KEYS = ['zone.1', 'zone.2', 'zone.3', 'zone.4', 'zone.5'] as const;
const MIN_SAVE_S = 60;

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; id: number } | { kind: 'short' } | { kind: 'failed' };

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export default function LiveActivityScreen() {
  const { live, profile, days, startLive, stopLive, saveActivity, notice } = useAppData();
  const { t, language, reason } = useT();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ type?: string }>();
  const type = parseActivityType(params.type);
  const [session, dispatch] = useReducer(liveReducer, IDLE_SESSION);
  const [now, setNow] = useState(nowSeconds);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const startedLive = useRef(false);
  const stopRef = useRef(stopLive);
  stopRef.current = stopLive;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const ticking = session.phase === 'running' || session.phase === 'paused';
  useEffect(() => {
    if (!ticking) return undefined;
    const id = setInterval(() => setNow(nowSeconds()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  useEffect(() => {
    if (live.heartRate === null || live.updatedAt === null) return;
    dispatch({ kind: 'beat', at: live.updatedAt / 1000, hr: live.heartRate });
    setNow(nowSeconds());
  }, [live.heartRate, live.updatedAt]);

  useEffect(
    () => () => {
      if (startedLive.current) void stopRef.current();
    },
    [],
  );

  const send = (event: LiveEvent): void => {
    dispatch(event);
    setNow(nowSeconds());
  };

  const begin = async (): Promise<void> => {
    send({ kind: 'start', at: nowSeconds() });
    startedLive.current = true;
    await startLive();
  };

  const finish = async (): Promise<void> => {
    const at = nowSeconds();
    const final = liveReducer(sessionRef.current, { kind: 'stop', at });
    send({ kind: 'stop', at });
    startedLive.current = false;
    await stopLive();
    if (final.startedAt === null || final.endedAt === null) return;
    if (activeSeconds(final, at) < MIN_SAVE_S) {
      setSave({ kind: 'short' });
      return;
    }
    setSave({ kind: 'saving' });
    const id = await saveActivity({ source: 'live', detectedStart: null, type, start: final.startedAt, end: final.endedAt, paused: final.paused, note: null });
    setSave(id === null ? { kind: 'failed' } : { kind: 'saved', id });
  };

  const tz = deviceTzOffsetS(new Date());
  const ref = loadReference(days, { maxHr: profile.maxHeartRate, birthYear: profile.birthYear, restingHr: null }, now, new Date(now * 1000).getFullYear());
  const latest = days[days.length - 1] ?? null;
  const today = latest !== null && latest.day === unixToIsoDate(now, tz) ? latest : null;
  const heartRate = live.active ? live.heartRate : null;
  const hud = hudFor(session, now, heartRate, ref, today);
  const zone = hud.zone;
  const zoneColor = zone !== null && zone > 0 ? colors.zones[zone - 1] : undefined;
  const band = loadTargetBand(days);
  const fmt = (v: number, d = 0): string => formatNumber(v, d, language);
  const running = session.phase === 'running' || session.phase === 'paused';

  const footer =
    session.phase === 'ready' ? (
      <Button label={t('activity.live.start')} onPress={() => void begin()} testID="live-begin" />
    ) : running ? (
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {session.phase === 'running' ? (
          <Button label={t('activity.live.pause')} variant="secondary" onPress={() => send({ kind: 'pause', at: nowSeconds() })} style={{ flex: 1 }} testID="live-pause" />
        ) : (
          <Button label={t('activity.live.resume')} variant="secondary" onPress={() => send({ kind: 'resume', at: nowSeconds() })} style={{ flex: 1 }} testID="live-resume" />
        )}
        <Button label={t('activity.live.stop')} onPress={() => void finish()} style={{ flex: 1 }} testID="live-stop" />
      </View>
    ) : save.kind === 'saved' ? (
      <Button label={t('activity.live.view')} onPress={() => router.replace({ pathname: '/activity/details', params: { id: String(save.id) } })} testID="live-view" />
    ) : null;

  return (
    <Screen
      tint="load"
      testID="live-activity"
      header={
        <>
          <Stack.Screen options={{ presentation: 'modal' }} />
          <TopBar title={t(`activity.type.${type}`)} close back={false} />
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="cap" muted>
              {session.phase === 'paused' ? t('activity.live.paused') : t('activity.live.elapsed')}
            </AppText>
            <Num size={64} testID="live-elapsed">
              {formatElapsed(hud.activeS)}
            </Num>
          </View>
        </>
      }
      footer={footer}>
      <Card style={{ alignItems: 'center' }}>
        <AppText variant="cap" muted>
          {t('metric.heartRate')}
        </AppText>
        <Num size={96} color={zoneColor} unit={heartRate !== null ? t('unit.bpm') : undefined} testID="live-hr">
          {heartRate !== null ? fmt(heartRate) : '–'}
        </Num>
        <AppText variant="bodyStrong" testID="live-zone" color={zoneColor} muted={zone === null || zone === 0}>
          {running && heartRate === null ? t('activity.live.waiting') : zone !== null && zone > 0 ? t(ZONE_KEYS[zone - 1] ?? 'activity.live.noZone') : t('activity.live.noZone')}
        </AppText>
        <AppText variant="caption" muted>
          {t('activity.live.maxHr', { rest: fmt(ref.rest), value: fmt(ref.max) })}
        </AppText>
      </Card>

      {session.phase !== 'ready' ? (
        <StatRow>
          <StatTile
            label={t('activity.live.load')}
            value={hud.load === null ? reason(hud.loadReason) : fmt(hud.load, 1)}
            testID="live-load"
          />
          <StatTile label={t('loadx.hr.avg')} value={hud.avgHr === null ? '–' : fmt(hud.avgHr)} unit={hud.avgHr === null ? undefined : t('unit.bpm')} testID="live-avg" />
          <StatTile label={t('loadx.hr.max')} value={hud.maxHr === null ? '–' : fmt(hud.maxHr)} unit={hud.maxHr === null ? undefined : t('unit.bpm')} testID="live-max" />
        </StatRow>
      ) : null}

      <Card testID="live-target">
        <AppText variant="cardTitle">{t('activity.live.target.title')}</AppText>
        {band === null ? (
          <>
            <Chip tone="warning" label={t('range.calibrating')} />
            <AppText variant="label" muted>
              {t('activity.live.target.noBand')}
            </AppText>
          </>
        ) : hud.projectedDayLoad === null ? (
          <AppText variant="label" muted testID="live-target-none">
            {t('activity.live.target.noDay', { low: fmt(band.low, 1), high: fmt(band.high, 1) })}
          </AppText>
        ) : (
          <>
            <Num size={40} color={colors.metric.loadBright} testID="live-target-value">
              {fmt(hud.projectedDayLoad, 1)}
            </Num>
            <ProgressBar fraction={band.high > 0 ? hud.projectedDayLoad / band.high : 0} color={colors.metric.loadBright} label={t('activity.live.target.title')} />
            {(() => {
              const status = rangeStatus(hud.projectedDayLoad, band);
              return status ? <Chip tone={status === 'within' ? 'positive' : 'info'} label={t(`range.${status}`, { low: fmt(band.low, 1), high: fmt(band.high, 1) })} /> : null;
            })()}
            <AppText variant="caption" muted>
              {t('activity.live.target.body')}
            </AppText>
          </>
        )}
        <ParityBadge level={PARITY.load} />
      </Card>

      {save.kind === 'saving' ? (
        <AppText variant="label" muted testID="live-saving">
          {t('activity.live.saving')}
        </AppText>
      ) : save.kind === 'saved' ? (
        <Card tone="outline" testID="live-saved">
          <AppText variant="label" muted>
            {t('activity.live.saved')}
          </AppText>
        </Card>
      ) : save.kind === 'short' ? (
        <Card tone="outline" testID="live-short">
          <AppText variant="label" muted>
            {t('activity.live.tooShort')}
          </AppText>
        </Card>
      ) : save.kind === 'failed' ? (
        <AppText variant="label" color={colors.negative} testID="live-failed">
          {notice === null ? t('activity.form.failed') : t(notice.key, notice.params)}
        </AppText>
      ) : null}

      <NotBuilt issue="gps" compact body={t('activity.start.gps')} />
    </Screen>
  );
}
