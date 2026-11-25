import type { RoutePoint } from '@openhoop/core';

import type { LatLon } from '@/lib/mercator';

import type { ActivityType } from './activityDerived';

export type { RoutePoint } from '@openhoop/core';

export const MAX_ROUTE_POINTS = 50_000;
export const MAX_SEGMENTS = 1_000;
export const MAX_ACCURACY_M = 30;
export const SEGMENT_GAP_MS = 60_000;
export const MIN_STEP_M = 1;
export const HIDDEN_ZONE_M = 200;
export const MIN_PACE_DISTANCE_M = 100;
export const ELEVATION_THRESHOLD_M = 3;
const EARTH_RADIUS_M = 6_371_008.8;
const FOOT_MAX_MPS = 12;
const OTHER_MAX_MPS = 30;
const FOOT_TYPES: ReadonlySet<ActivityType> = new Set(['running', 'walking', 'hiking']);

export interface Fix {
  tMs: number;
  lat: number;
  lon: number;
  altM: number | null;
  accuracyM: number | null;
}

export type FixVerdict = 'ok' | 'invalid' | 'inaccurate' | 'stale' | 'too-fast' | 'still';

export function haversineM(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function maxSpeedFor(type: ActivityType): number {
  return FOOT_TYPES.has(type) ? FOOT_MAX_MPS : OTHER_MAX_MPS;
}

export function usesPace(type: ActivityType): boolean {
  return FOOT_TYPES.has(type);
}

function validFix(fix: Fix): boolean {
  return (
    Number.isFinite(fix.tMs) &&
    fix.tMs >= 0 &&
    Number.isFinite(fix.lat) &&
    Number.isFinite(fix.lon) &&
    Math.abs(fix.lat) <= 90 &&
    Math.abs(fix.lon) <= 180 &&
    !(fix.lat === 0 && fix.lon === 0)
  );
}

export function checkFix(last: RoutePoint | null, fix: Fix, maxSpeedMps: number, segment: number): FixVerdict {
  if (!validFix(fix)) return 'invalid';
  if (fix.accuracyM === null || !Number.isFinite(fix.accuracyM) || fix.accuracyM < 0 || fix.accuracyM > MAX_ACCURACY_M) return 'inaccurate';
  if (last === null) return 'ok';
  if (fix.tMs <= last.tMs) return 'stale';
  if (last.segment !== segment || fix.tMs - last.tMs > SEGMENT_GAP_MS) return 'ok';
  const step = haversineM(last, fix);
  if (step / ((fix.tMs - last.tMs) / 1000) > maxSpeedMps) return 'too-fast';
  if (step < MIN_STEP_M) return 'still';
  return 'ok';
}

function cleanAltitude(altM: number | null): number | null {
  return altM !== null && Number.isFinite(altM) && altM >= -500 && altM <= 9_000 ? altM : null;
}

export function toPoint(last: RoutePoint | null, fix: Fix, segment: number): RoutePoint {
  const gap = last !== null && last.segment === segment && fix.tMs - last.tMs > SEGMENT_GAP_MS;
  return {
    tMs: Math.round(fix.tMs),
    lat: fix.lat,
    lon: fix.lon,
    altM: cleanAltitude(fix.altM),
    accuracyM: fix.accuracyM,
    segment: gap ? Math.min(segment + 1, MAX_SEGMENTS) : segment,
  };
}

export function filterFixes(fixes: readonly Fix[], maxSpeedMps: number): { points: RoutePoint[]; rejected: number } {
  const points: RoutePoint[] = [];
  let rejected = 0;
  for (const fix of fixes) {
    const last = points[points.length - 1] ?? null;
    const segment = last?.segment ?? 0;
    if (checkFix(last, fix, maxSpeedMps, segment) === 'ok') points.push(toPoint(last, fix, segment));
    else rejected++;
  }
  return { points, rejected };
}

export function cumulativeM(points: readonly RoutePoint[]): number[] {
  const out: number[] = [];
  let total = 0;
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev !== undefined && prev.segment === p.segment) total += haversineM(prev, p);
    out.push(total);
  });
  return out;
}

export function movingSeconds(points: readonly RoutePoint[]): number[] {
  const out: number[] = [];
  let total = 0;
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev !== undefined && prev.segment === p.segment) total += (p.tMs - prev.tMs) / 1000;
    out.push(total);
  });
  return out;
}

export function elevationGainM(points: readonly RoutePoint[]): number | null {
  const withAlt = points.filter((p) => p.altM !== null);
  if (withAlt.length < 2 || withAlt.length * 2 < points.length) return null;
  let gain = 0;
  let ref: number | null = null;
  let segment = -1;
  for (const p of withAlt) {
    const alt = p.altM;
    if (alt === null) continue;
    if (ref === null || p.segment !== segment) {
      ref = alt;
      segment = p.segment;
      continue;
    }
    if (alt - ref >= ELEVATION_THRESHOLD_M) {
      gain += alt - ref;
      ref = alt;
    } else if (ref - alt >= ELEVATION_THRESHOLD_M) {
      ref = alt;
    }
  }
  return gain;
}

export interface RouteStats {
  distanceM: number;
  elevationGainM: number | null;
  segments: number;
}

export function routeStats(points: readonly RoutePoint[]): RouteStats {
  const cum = cumulativeM(points);
  return {
    distanceM: cum[cum.length - 1] ?? 0,
    elevationGainM: elevationGainM(points),
    segments: new Set(points.map((p) => p.segment)).size,
  };
}

export function paceSecondsPerKm(distanceM: number, activeS: number): number | null {
  if (distanceM < MIN_PACE_DISTANCE_M || activeS <= 0) return null;
  return activeS / (distanceM / 1000);
}

export function speedKmh(distanceM: number, activeS: number): number | null {
  if (distanceM < MIN_PACE_DISTANCE_M || activeS <= 0) return null;
  return distanceM / 1000 / (activeS / 3600);
}

export function formatPace(secondsPerKm: number): string {
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

export interface RouteMarker extends LatLon {
  distanceM: number;
  movingS: number;
}

export function markerStepM(totalM: number): number {
  if (totalM >= 40_000) return 10_000;
  if (totalM >= 15_000) return 5_000;
  if (totalM >= 1_500) return 1_000;
  return 500;
}

export function distanceMarkers(points: readonly RoutePoint[], stepM: number): RouteMarker[] {
  if (stepM <= 0) return [];
  const cum = cumulativeM(points);
  const moving = movingSeconds(points);
  const out: RouteMarker[] = [];
  let next = stepM;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const da = cum[i - 1];
    const db = cum[i];
    const ta = moving[i - 1];
    const tb = moving[i];
    if (a === undefined || b === undefined || da === undefined || db === undefined || ta === undefined || tb === undefined) continue;
    while (db >= next && db > da) {
      const f = (next - da) / (db - da);
      out.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, distanceM: next, movingS: ta + (tb - ta) * f });
      next += stepM;
    }
  }
  return out;
}

export interface VisibleRoute {
  points: RoutePoint[];
  markers: RouteMarker[];
  trimmed: boolean;
}

export function visibleRoute(points: readonly RoutePoint[], hideStartM: number, hideEndM: number, stepM: number): VisibleRoute | null {
  const markers = distanceMarkers(points, stepM);
  if (hideStartM <= 0 && hideEndM <= 0) return points.length >= 2 ? { points: [...points], markers, trimmed: false } : null;
  const cum = cumulativeM(points);
  const total = cum[cum.length - 1] ?? 0;
  const from = hideStartM;
  const to = total - hideEndM;
  if (to <= from) return null;
  const kept = points.filter((_, i) => {
    const d = cum[i] ?? 0;
    return d >= from && d <= to;
  });
  if (kept.length < 2) return null;
  return { points: kept, markers: markers.filter((m) => m.distanceM >= from && m.distanceM <= to), trimmed: true };
}

export interface Split {
  index: number;
  distanceM: number;
  durationS: number;
}

export function splits(markers: readonly RouteMarker[]): Split[] {
  return markers.map((m, i) => ({ index: i + 1, distanceM: m.distanceM, durationS: m.movingS - (markers[i - 1]?.movingS ?? 0) }));
}
