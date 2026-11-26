import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROUTE_MAX_POINTS, RouteInputError, bindActivityStore, checkRoute, exportCsv, listRoute, openStore, saveRoute } from '../src/index';
import type { ActivityMetricsRecord, ActivityStore, DeviceRow, RoutePoint, Store } from '../src/index';
import { openStrictDriver } from './strictDriver';

const T0 = 1_800_000_000;
const EMPTY: ActivityMetricsRecord = { activeS: 0, load: null, loadReason: 'no-data', zoneSeconds: [0, 0, 0, 0, 0, 0], avgHr: null, maxHr: null, hrSeconds: 0, activeMinutes: null };

function point(i: number, over: Partial<RoutePoint> = {}): RoutePoint {
  return { tMs: T0 * 1000 + i * 2000, lat: 51.05 + i * 0.0001, lon: 3.72, altM: 10 + i, accuracyM: 5, segment: 0, ...over };
}

describe('route storage', () => {
  let store: Store;
  let activities: ActivityStore;
  let device: DeviceRow;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    activities = bindActivityStore(store.driver);
    device = await store.upsertDevice({ bleId: 'AA', name: null, model: null, firmware: null, serial: null, ownerSince: null, configSnapshot: null });
  });
  afterEach(async () => {
    await store.driver.close();
  });

  async function activity(): Promise<number> {
    const saved = await activities.save({ deviceId: device.id, source: 'live', detectedStart: null, type: 'running', start: T0, end: T0 + 1800, paused: [], note: null }, EMPTY, 1);
    return saved.id;
  }

  it('saves, lists in order, replaces and exports a route', async () => {
    const id = await activity();
    const points = Array.from({ length: 250 }, (_, i) => point(i, { segment: i < 120 ? 0 : 1, altM: i % 2 === 0 ? null : 10 }));
    expect(await saveRoute(store.driver, id, points)).toBe(250);
    expect(await listRoute(store.driver, id)).toEqual(points);
    await saveRoute(store.driver, id, [point(0)]);
    expect(await listRoute(store.driver, id)).toHaveLength(1);
    const csv = await exportCsv(store, 'route_points');
    expect(csv.split('\r\n')[0]).toBe('activity_id,seq,segment,t_ms,lat,lon,alt_m,accuracy_m');
    expect(csv).toContain(`${id},0,0,${T0 * 1000},51.05,3.72,10,5`);
  });

  it('deletes the route together with its activity', async () => {
    const id = await activity();
    const other = await activity();
    await saveRoute(store.driver, id, [point(0), point(1)]);
    await saveRoute(store.driver, other, [point(0)]);
    await activities.setDeleted(id, 5, 5);
    expect(await activities.purgeDeleted(null)).toBe(1);
    expect(await listRoute(store.driver, id)).toEqual([]);
    expect(await listRoute(store.driver, other)).toHaveLength(1);
    await activities.remove(other);
    expect(await store.driver.all('SELECT * FROM route_points')).toEqual([]);
  });

  it('refuses a route for an activity that does not exist', async () => {
    await expect(saveRoute(store.driver, 999, [point(0)])).rejects.toThrow();
  });

  it('validates every point before it is stored', () => {
    expect(() => checkRoute([point(0, { lat: 91 })])).toThrow(RouteInputError);
    expect(() => checkRoute([point(0, { lon: Number.NaN })])).toThrow('bad position');
    expect(() => checkRoute([point(1), point(0)])).toThrow('bad time');
    expect(() => checkRoute([point(0, { segment: 1 }), point(1, { segment: 0 })])).toThrow('bad segment');
    expect(() => checkRoute([point(0, { altM: 20_000 })])).toThrow('bad altitude');
    expect(() => checkRoute([point(0, { accuracyM: -1 })])).toThrow('bad accuracy');
    expect(() => checkRoute(Array.from({ length: ROUTE_MAX_POINTS + 1 }, (_, i) => point(i)))).toThrow('too many points');
    expect(checkRoute([point(0)])).toEqual([point(0)]);
  });
});
