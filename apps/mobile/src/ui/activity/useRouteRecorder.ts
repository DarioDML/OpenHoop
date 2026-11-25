import { Accuracy, requestForegroundPermissionsAsync, watchPositionAsync, type LocationObject, type LocationSubscription } from 'expo-location';
import { useEffect, useRef, useState } from 'react';

import type { ActivityType } from '@/data/activityDerived';
import { checkFix, haversineM, maxSpeedFor, MAX_ROUTE_POINTS, MAX_SEGMENTS, toPoint, type Fix, type RoutePoint } from '@/data/route';

export type GpsState = 'idle' | 'asking' | 'denied' | 'approximate' | 'unavailable' | 'recording' | 'stopped';

export interface RouteProgress {
  count: number;
  distanceM: number;
  rejected: number;
  accuracyM: number | null;
  version: number;
}

const EMPTY: RouteProgress = { count: 0, distanceM: 0, rejected: 0, accuracyM: null, version: 0 };
const WATCH_OPTIONS = { accuracy: Accuracy.High, timeInterval: 2_000, distanceInterval: 2 };

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toFix(location: LocationObject): Fix | null {
  const { coords, timestamp } = location;
  if (typeof timestamp !== 'number' || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') return null;
  return { tMs: timestamp, lat: coords.latitude, lon: coords.longitude, altM: finiteOrNull(coords.altitude), accuracyM: finiteOrNull(coords.accuracy) };
}

export function useRouteRecorder(type: ActivityType) {
  const [state, setState] = useState<GpsState>('idle');
  const [progress, setProgress] = useState<RouteProgress>(EMPTY);
  const points = useRef<RoutePoint[]>([]);
  const segment = useRef(0);
  const paused = useRef(false);
  const subscription = useRef<LocationSubscription | null>(null);
  const mounted = useRef(true);
  const maxSpeed = maxSpeedFor(type);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      subscription.current?.remove();
      subscription.current = null;
    };
  }, []);

  const onLocation = (location: LocationObject): void => {
    if (paused.current || !mounted.current) return;
    const fix = toFix(location);
    const list = points.current;
    const last = list[list.length - 1] ?? null;
    const verdict = fix === null ? 'invalid' : checkFix(last, fix, maxSpeed, segment.current);
    if (fix !== null && verdict === 'ok' && list.length < MAX_ROUTE_POINTS) {
      const point = toPoint(last, fix, segment.current);
      segment.current = point.segment;
      list.push(point);
      const step = last !== null && last.segment === point.segment ? haversineM(last, point) : 0;
      setProgress((p) => ({ count: list.length, distanceM: p.distanceM + step, rejected: p.rejected, accuracyM: fix.accuracyM, version: p.version + 1 }));
    } else if (verdict !== 'still' && verdict !== 'ok') {
      setProgress((p) => ({ ...p, rejected: p.rejected + 1, accuracyM: fix?.accuracyM ?? p.accuracyM }));
    }
  };

  const start = async (): Promise<boolean> => {
    if (subscription.current !== null) return false;
    setState('asking');
    try {
      const permission = await requestForegroundPermissionsAsync();
      if (!mounted.current) return false;
      if (!permission.granted) {
        setState('denied');
        return false;
      }
      if (permission.android?.accuracy === 'coarse' || permission.ios?.accuracy === 'reduced') {
        setState('approximate');
        return false;
      }
      subscription.current = await watchPositionAsync(WATCH_OPTIONS, onLocation, () => {
        if (mounted.current) setState('unavailable');
      });
      if (!mounted.current) {
        subscription.current.remove();
        subscription.current = null;
        return false;
      }
      setState('recording');
      return true;
    } catch {
      if (mounted.current) setState('unavailable');
      return false;
    }
  };

  const pause = (): void => {
    paused.current = true;
  };

  const resume = (): void => {
    paused.current = false;
    segment.current = Math.min(segment.current + 1, MAX_SEGMENTS);
  };

  const stop = (): RoutePoint[] => {
    subscription.current?.remove();
    subscription.current = null;
    if (mounted.current) setState('stopped');
    return [...points.current];
  };

  return { state, progress, points: points.current, start, pause, resume, stop };
}
