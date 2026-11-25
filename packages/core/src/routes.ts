import type { SqlDriver, SqlValue } from './store/types';

export const ROUTE_MAX_POINTS = 50_000;
export const ROUTE_MAX_SEGMENTS = 1_000;
const ALT_MIN_M = -500;
const ALT_MAX_M = 9_000;
const ACCURACY_MAX_M = 10_000;
const INSERT_BATCH = 100;

export interface RoutePoint {
  tMs: number;
  lat: number;
  lon: number;
  altM: number | null;
  accuracyM: number | null;
  segment: number;
}

export class RouteInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouteInputError';
  }
}

function finiteIn(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function checkRoute(points: readonly RoutePoint[]): RoutePoint[] {
  if (points.length > ROUTE_MAX_POINTS) throw new RouteInputError('too many points');
  let lastT = -1;
  let lastSegment = 0;
  return points.map((p) => {
    if (!Number.isSafeInteger(p.tMs) || p.tMs < 0 || p.tMs < lastT) throw new RouteInputError('bad time');
    if (!finiteIn(p.lat, -90, 90) || !finiteIn(p.lon, -180, 180)) throw new RouteInputError('bad position');
    if (!Number.isSafeInteger(p.segment) || p.segment < lastSegment || p.segment > ROUTE_MAX_SEGMENTS) throw new RouteInputError('bad segment');
    if (p.altM !== null && !finiteIn(p.altM, ALT_MIN_M, ALT_MAX_M)) throw new RouteInputError('bad altitude');
    if (p.accuracyM !== null && !finiteIn(p.accuracyM, 0, ACCURACY_MAX_M)) throw new RouteInputError('bad accuracy');
    lastT = p.tMs;
    lastSegment = p.segment;
    return { tMs: p.tMs, lat: p.lat, lon: p.lon, altM: p.altM, accuracyM: p.accuracyM, segment: p.segment };
  });
}

export async function saveRoute(driver: SqlDriver, activityId: number, points: readonly RoutePoint[]): Promise<number> {
  const clean = checkRoute(points);
  return driver.transaction(async (tx) => {
    await tx.run('DELETE FROM route_points WHERE activity_id = ?', [activityId]);
    for (let from = 0; from < clean.length; from += INSERT_BATCH) {
      const batch = clean.slice(from, from + INSERT_BATCH);
      const params: SqlValue[] = [];
      batch.forEach((p, i) => params.push(activityId, from + i, p.segment, p.tMs, p.lat, p.lon, p.altM, p.accuracyM));
      const rows = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      await tx.run(`INSERT INTO route_points (activity_id, seq, segment, t_ms, lat, lon, alt_m, accuracy_m) VALUES ${rows}`, params);
    }
    return clean.length;
  });
}

function nullableNumber(value: SqlValue | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number') throw new Error('Invalid route point in database');
  return value;
}

function toPoint(row: Record<string, SqlValue>): RoutePoint {
  const { t_ms: tMs, lat, lon, segment } = row;
  if (typeof tMs !== 'number' || typeof lat !== 'number' || typeof lon !== 'number' || typeof segment !== 'number') {
    throw new Error('Invalid route point in database');
  }
  return { tMs, lat, lon, altM: nullableNumber(row.alt_m), accuracyM: nullableNumber(row.accuracy_m), segment };
}

export async function listRoute(driver: SqlDriver, activityId: number): Promise<RoutePoint[]> {
  const rows = await driver.all<Record<string, SqlValue>>(
    'SELECT segment, t_ms, lat, lon, alt_m, accuracy_m FROM route_points WHERE activity_id = ? ORDER BY seq',
    [activityId],
  );
  return rows.map(toPoint);
}
