import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { effectiveMaxHr, formatElapsed, liveZone, parseActivityType } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { NotBuilt } from '@/ui/NotBuilt';
import { Num } from '@/ui/Num';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

const ZONE_KEYS = ['zone.1', 'zone.2', 'zone.3', 'zone.4', 'zone.5'] as const;

type Phase = 'ready' | 'running' | 'stopped';

interface Session {
  startedAt: number;
  endedAt: number | null;
  samples: number;
  sum: number;
  max: number;
}

export default function LiveActivityScreen() {
  const { live, profile, startLive, stopLive } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ type?: string }>();
  const type = parseActivityType(params.type);
  const [phase, setPhase] = useState<Phase>('ready');
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const startedLive = useRef(false);
  const stopRef = useRef(stopLive);
  stopRef.current = stopLive;

  useEffect(() => {
    if (phase !== 'running') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running' || live.heartRate === null || live.updatedAt === null) return;
    const hr = live.heartRate;
    setSession((s) => (s === null ? s : { ...s, samples: s.samples + 1, sum: s.sum + hr, max: Math.max(s.max, hr) }));
  }, [phase, live.heartRate, live.updatedAt]);

  useEffect(
    () => () => {
      if (startedLive.current) void stopRef.current();
    },
    [],
  );

  const begin = async (): Promise<void> => {
    const at = Date.now();
    setSession({ startedAt: at, endedAt: null, samples: 0, sum: 0, max: 0 });
    setNow(at);
    setPhase('running');
    startedLive.current = true;
    await startLive();
  };

  const finish = async (): Promise<void> => {
    startedLive.current = false;
    setSession((s) => (s === null ? s : { ...s, endedAt: Date.now() }));
    setPhase('stopped');
    await stopLive();
  };

  const maxHr = effectiveMaxHr(profile, new Date().getFullYear());
  const zone = live.active && live.heartRate !== null ? liveZone(live.heartRate, maxHr) : null;
  const elapsedS = session === null ? 0 : ((session.endedAt ?? now) - session.startedAt) / 1000;
  const fmt = (v: number): string => formatNumber(v, 0, language);

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
              {t('activity.live.elapsed')}
            </AppText>
            <Num size={64} testID="live-elapsed">
              {formatElapsed(elapsedS)}
            </Num>
          </View>
        </>
      }
      footer={
        phase === 'ready' ? (
          <Button label={t('activity.live.start')} onPress={() => void begin()} testID="live-begin" />
        ) : phase === 'running' ? (
          <Button label={t('activity.live.stop')} variant="secondary" onPress={() => void finish()} testID="live-stop" />
        ) : null
      }>
      <Card style={{ alignItems: 'center' }}>
        <AppText variant="cap" muted>
          {t('metric.heartRate')}
        </AppText>
        <Num size={96} color={zone ? colors.zones[zone - 1] : undefined} unit={live.active && live.heartRate !== null ? t('unit.bpm') : undefined} testID="live-hr">
          {live.active && live.heartRate !== null ? fmt(live.heartRate) : '–'}
        </Num>
        <AppText variant="bodyStrong" testID="live-zone" color={zone ? colors.zones[zone - 1] : undefined} muted={zone === null}>
          {phase === 'running' && live.heartRate === null ? t('activity.live.waiting') : zone ? t(ZONE_KEYS[zone - 1] ?? 'activity.live.noZone') : t('activity.live.noZone')}
        </AppText>
        <AppText variant="caption" muted>
          {t('activity.live.maxHr', { value: fmt(maxHr) })}
        </AppText>
      </Card>

      {session !== null && session.samples > 0 ? (
        <StatRow>
          <StatTile label={t('loadx.hr.avg')} value={fmt(session.sum / session.samples)} unit={t('unit.bpm')} testID="live-avg" />
          <StatTile label={t('loadx.hr.max')} value={fmt(session.max)} unit={t('unit.bpm')} testID="live-max" />
        </StatRow>
      ) : null}

      {phase === 'stopped' ? <NotBuilt issue="activities" body={t('activity.live.notSaved')} /> : <NotBuilt issue="activities" compact body={t('activity.live.saveLater')} />}
    </Screen>
  );
}
