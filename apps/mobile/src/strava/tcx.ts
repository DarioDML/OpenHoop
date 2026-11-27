import type { ActivityEntry } from '@/data/activities';
import type { ActivityType } from '@/data/activityDerived';
import { cumulativeM, HIDDEN_ZONE_M, visibleRoute, type RoutePoint } from '@/data/route';
import type { HeartRatePoint } from '@/data/types';

export const MIN_HR = 25;
export const MAX_HR = 250;
export const HR_BUCKET_S = 5;
export const MAX_TRACKPOINTS = 40_000;

const SPORT_TYPES: Readonly<Record<ActivityType, string>> = {
  running: 'Run',
  walking: 'Walk',
  cycling: 'Ride',
  swimming: 'Swim',
  strength: 'WeightTraining',
  yoga: 'Yoga',
  hiit: 'HighIntensityIntervalTraining',
  football: 'Soccer',
  padel: 'Padel',
  pilates: 'Pilates',
  hiking: 'Hike',
  other: 'Workout',
};

export function stravaSportType(type: ActivityType | null): string {
  return type === null ? 'Workout' : SPORT_TYPES[type];
}

function tcxSport(type: ActivityType | null): 'Running' | 'Biking' | 'Other' {
  if (type === 'running') return 'Running';
  if (type === 'cycling') return 'Biking';
  return 'Other';
}

export function stravaKey(entry: Pick<ActivityEntry, 'kind' | 'id' | 'detectedStart' | 'start'>): string {
  if (entry.detectedStart !== null && (entry.kind === 'detected' || entry.kind === 'edited')) return `detected:${entry.detectedStart}`;
  if (entry.id !== null) return `activity:${entry.id}`;
  return `detected:${entry.start}`;
}

export function externalId(key: string): string {
  return `openhoop-${key.replace(':', '-')}.tcx`;
}

function iso(unixS: number): string {
  return new Date(Math.round(unixS) * 1000).toISOString().replace('.000Z', 'Z');
}

export function localIso(unixS: number, tzOffsetS: number): string {
  return new Date((Math.round(unixS) + tzOffsetS) * 1000).toISOString().slice(0, 19);
}

function validPoint(p: RoutePoint): boolean {
  return Number.isFinite(p.tMs) && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
}

export function uploadRoute(points: readonly RoutePoint[], hideEnds: boolean): RoutePoint[] {
  const valid = points.filter(validPoint);
  if (valid.length < 2) return [];
  const shown = visibleRoute(valid, hideEnds ? HIDDEN_ZONE_M : 0, hideEnds ? HIDDEN_ZONE_M : 0, Number.MAX_SAFE_INTEGER);
  return shown === null ? [] : shown.points;
}

export function uploadHeartRate(points: readonly HeartRatePoint[], startS: number, endS: number): HeartRatePoint[] {
  return points
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.hr) && p.t >= startS && p.t <= endS)
    .map((p) => ({ t: Math.round(p.t), hr: Math.round(p.hr) }))
    .filter((p) => p.hr >= MIN_HR && p.hr <= MAX_HR);
}

interface Trackpoint {
  t: number;
  hr: number | null;
  point: RoutePoint | null;
  distanceM: number | null;
}

function trackpoints(heartRate: readonly HeartRatePoint[], route: readonly RoutePoint[]): Trackpoint[] {
  const byTime = new Map<number, Trackpoint>();
  const cum = cumulativeM(route);
  const offset = cum[0] ?? 0;
  route.forEach((point, i) => {
    const t = Math.floor(point.tMs / 1000);
    byTime.set(t, { t, hr: null, point, distanceM: (cum[i] ?? offset) - offset });
  });
  for (const sample of heartRate) {
    const current = byTime.get(sample.t);
    byTime.set(sample.t, current === undefined ? { t: sample.t, hr: sample.hr, point: null, distanceM: null } : { ...current, hr: sample.hr });
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t).slice(0, MAX_TRACKPOINTS);
}

function trackpointXml(tp: Trackpoint): string {
  const parts = [`<Time>${iso(tp.t)}</Time>`];
  if (tp.point !== null) {
    parts.push(`<Position><LatitudeDegrees>${tp.point.lat.toFixed(7)}</LatitudeDegrees><LongitudeDegrees>${tp.point.lon.toFixed(7)}</LongitudeDegrees></Position>`);
    if (tp.point.altM !== null && Number.isFinite(tp.point.altM)) parts.push(`<AltitudeMeters>${tp.point.altM.toFixed(1)}</AltitudeMeters>`);
  }
  if (tp.distanceM !== null) parts.push(`<DistanceMeters>${tp.distanceM.toFixed(1)}</DistanceMeters>`);
  if (tp.hr !== null) parts.push(`<HeartRateBpm><Value>${tp.hr}</Value></HeartRateBpm>`);
  return `<Trackpoint>${parts.join('')}</Trackpoint>`;
}

export interface TcxInput {
  type: ActivityType | null;
  startS: number;
  endS: number;
  heartRate: readonly HeartRatePoint[];
  route: readonly RoutePoint[];
}

export function buildTcx(input: TcxInput): string {
  const points = trackpoints(input.heartRate, input.route);
  const cum = cumulativeM(input.route);
  const distance = Math.max(0, (cum[cum.length - 1] ?? 0) - (cum[0] ?? 0));
  const avg = input.heartRate.length === 0 ? null : Math.round(input.heartRate.reduce((sum, p) => sum + p.hr, 0) / input.heartRate.length);
  const max = input.heartRate.length === 0 ? null : input.heartRate.reduce((best, p) => Math.max(best, p.hr), 0);
  const lap = [
    `<TotalTimeSeconds>${Math.max(1, Math.round(input.endS - input.startS))}</TotalTimeSeconds>`,
    `<DistanceMeters>${distance.toFixed(1)}</DistanceMeters>`,
    '<Calories>0</Calories>',
    avg === null ? '' : `<AverageHeartRateBpm><Value>${avg}</Value></AverageHeartRateBpm>`,
    max === null ? '' : `<MaximumHeartRateBpm><Value>${max}</Value></MaximumHeartRateBpm>`,
    '<Intensity>Active</Intensity>',
    '<TriggerMethod>Manual</TriggerMethod>',
    `<Track>${points.map(trackpointXml).join('')}</Track>`,
  ].join('');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">',
    `<Activities><Activity Sport="${tcxSport(input.type)}">`,
    `<Id>${iso(input.startS)}</Id>`,
    `<Lap StartTime="${iso(input.startS)}">${lap}</Lap>`,
    '<Creator xsi:type="Device_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Name>OpenHoop</Name><UnitId>0</UnitId><ProductID>0</ProductID><Version><VersionMajor>0</VersionMajor><VersionMinor>0</VersionMinor></Version></Creator>',
    '</Activity></Activities>',
    '</TrainingCenterDatabase>',
    '',
  ].join('\n');
}

export interface UploadSource {
  key: string;
  type: ActivityType | null;
  name: string;
  startS: number;
  endS: number;
  tzOffsetS: number;
  heartRate: readonly HeartRatePoint[];
  route: readonly RoutePoint[];
  hideEnds: boolean;
}

export type UploadPlan =
  | { kind: 'file'; tcx: string; externalId: string; name: string; sportType: string; trackpoints: number; routePoints: number; heartRatePoints: number }
  | { kind: 'manual'; name: string; sportType: string; startDateLocal: string; elapsedS: number };

export function planUpload(source: UploadSource): UploadPlan | null {
  if (!Number.isFinite(source.startS) || !Number.isFinite(source.endS) || source.endS <= source.startS) return null;
  const heartRate = uploadHeartRate(source.heartRate, source.startS, source.endS);
  const route = uploadRoute(source.route, source.hideEnds);
  const sportType = stravaSportType(source.type);
  if (heartRate.length === 0 && route.length === 0) {
    return { kind: 'manual', name: source.name, sportType, startDateLocal: localIso(source.startS, source.tzOffsetS), elapsedS: Math.round(source.endS - source.startS) };
  }
  const tcx = buildTcx({ type: source.type, startS: source.startS, endS: source.endS, heartRate, route });
  return {
    kind: 'file',
    tcx,
    externalId: externalId(source.key),
    name: source.name,
    sportType,
    trackpoints: trackpoints(heartRate, route).length,
    routePoints: route.length,
    heartRatePoints: heartRate.length,
  };
}
