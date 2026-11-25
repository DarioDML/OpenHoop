import { loadReference } from '@openhoop/analytics';
import { useEffect, useReducer, useRef, useState } from 'react';

import type { ActivityType } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { activeSeconds, hudFor, IDLE_SESSION, liveReducer, type LiveEvent, type LiveSession } from '@/data/liveSession';
import type { RoutePoint } from '@/data/route';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';

export const MIN_SAVE_S = 60;

export type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; id: number } | { kind: 'short' } | { kind: 'failed' };

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function useLiveRecording(type: ActivityType) {
  const { live, profile, days, startLive, stopLive, saveActivity } = useAppData();
  const [session, dispatch] = useReducer(liveReducer, IDLE_SESSION);
  const [now, setNow] = useState(nowSeconds);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const startedLive = useRef(false);
  const stopRef = useRef(stopLive);
  stopRef.current = stopLive;
  const sessionRef = useRef<LiveSession>(session);
  sessionRef.current = session;

  const running = session.phase === 'running' || session.phase === 'paused';
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(nowSeconds()), 1000);
    return () => clearInterval(id);
  }, [running]);

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

  const finish = async (route?: () => RoutePoint[]): Promise<void> => {
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
    const points = route?.();
    const draft = { source: 'live' as const, detectedStart: null, type, start: final.startedAt, end: final.endedAt, paused: final.paused, note: null };
    const id = await saveActivity(points === undefined ? draft : { ...draft, route: points });
    setSave(id === null ? { kind: 'failed' } : { kind: 'saved', id });
  };

  const tz = deviceTzOffsetS(new Date());
  const ref = loadReference(days, { maxHr: profile.maxHeartRate, birthYear: profile.birthYear, restingHr: null }, now, new Date(now * 1000).getFullYear());
  const latest = days[days.length - 1] ?? null;
  const today = latest !== null && latest.day === unixToIsoDate(now, tz) ? latest : null;
  const heartRate = live.active ? live.heartRate : null;
  const hud = hudFor(session, now, heartRate, ref, today);

  return { session, now, save, running, send, begin, finish, ref, today, heartRate, hud };
}
