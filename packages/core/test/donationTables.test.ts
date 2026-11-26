import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DONATION_TABLE_FILES, donationTables, openStore } from '../src/index';
import type { DonationWindow, Store } from '../src/index';
import { openStrictDriver } from './strictDriver';

const DAY_S = 86_400;
const BASE = 1_700_000_000;
const A: DonationWindow = { day: '2026-11-23', start: BASE, end: BASE + DAY_S };
const B: DonationWindow = { day: '2026-11-24', start: BASE + DAY_S, end: BASE + 2 * DAY_S };

function lines(csv: string): string[] {
  return csv.trim().split('\r\n');
}

describe('donation tables', () => {
  let store: Store;
  let deviceId: number;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    deviceId = (
      await store.upsertDevice({ bleId: 'AA:01', name: 'WHOOP 5', model: '5.0', firmware: null, serial: null, ownerSince: null, configSnapshot: null })
    ).id;
  });
  afterEach(async () => {
    await store.driver.close();
  });

  it('writes the exact headers', async () => {
    const tables = await donationTables(store.driver, deviceId, [A]);
    expect(Object.keys(tables).sort()).toEqual([...DONATION_TABLE_FILES].sort());
    expect(lines(tables['official/cycles.csv'])[0]).toBe(
      'start_t,end_t,tz_offset_s,day,recovery_pct,resting_hr,hrv_ms,skin_temp_c,spo2_pct,respiratory_rate,day_strain',
    );
    expect(lines(tables['official/sleeps.csv'])[0]).toBe(
      'onset,wake,tz_offset_s,day,nap,performance_pct,asleep_min,in_bed_min,light_min,deep_min,rem_min,awake_min,efficiency_pct,consistency_pct,respiratory_rate',
    );
    expect(lines(tables['official/workouts.csv'])[0]).toBe('start_t,end_t,tz_offset_s,day,activity,strain,avg_hr,max_hr');
    expect(lines(tables['openhoop/days.csv'])[0]).toBe('day,readiness,load,sleep_score');
    expect(lines(tables['openhoop/sleeps.csv'])[0]).toBe('day,onset,offset,asleep_s,in_bed_s,nap,source');
    expect(lines(tables['openhoop/activities.csv'])[0]).toBe('start,end,type,active_s,load,zone_seconds,avg_hr,max_hr,active_minutes');
  });

  it('matches official rows by time overlap and writes an overlapping row once', async () => {
    const run = (sql: string, params: (string | number | null)[]) => store.driver.run(sql, params);
    await run("INSERT INTO vendor_sleeps (onset, wake, tz_offset_s, day, nap, imported_at) VALUES (?, ?, 3600, '1999-01-01', 0, 1)", [A.start + 100, A.start + 500]);
    await run("INSERT INTO vendor_sleeps (onset, wake, tz_offset_s, day, nap, imported_at) VALUES (?, ?, 3600, '2026-11-23', 0, 1)", [A.start - 900, A.start - 100]);
    await run("INSERT INTO vendor_cycles (start_t, end_t, tz_offset_s, day, recovery_pct, imported_at) VALUES (?, ?, 3600, '2026-11-23', 61, 1)", [A.end - 3_600, B.start + 3_600]);
    await run("INSERT INTO vendor_workouts (start_t, end_t, tz_offset_s, day, activity, strain, imported_at) VALUES (?, ?, 3600, '2026-11-24', 'Running', 9.5, 1)", [B.start + 60, B.start + 1_800]);
    const tables = await donationTables(store.driver, deviceId, [A, B]);
    expect(lines(tables['official/sleeps.csv'])).toEqual([
      expect.any(String),
      `${A.start + 100},${A.start + 500},3600,1999-01-01,0,,,,,,,,,,`,
    ]);
    expect(lines(tables['official/cycles.csv'])).toEqual([expect.any(String), `${A.end - 3_600},${B.start + 3_600},3600,2026-11-23,61,,,,,,`]);
    expect(lines(tables['official/workouts.csv'])).toEqual([expect.any(String), `${B.start + 60},${B.start + 1_800},3600,2026-11-24,Running,9.5,,`]);
    expect(lines((await donationTables(store.driver, deviceId, [A]))['official/workouts.csv'])).toHaveLength(1);
  });

  it('counts an open cycle until 24 hours after its start', async () => {
    await store.driver.run("INSERT INTO vendor_cycles (start_t, end_t, tz_offset_s, day, imported_at) VALUES (?, NULL, 3600, '2026-11-24', 1)", [B.start - 3_600]);
    await store.driver.run("INSERT INTO vendor_cycles (start_t, end_t, tz_offset_s, day, imported_at) VALUES (?, NULL, 3600, '2026-11-22', 1)", [B.start - DAY_S - 1]);
    const tables = await donationTables(store.driver, deviceId, [B]);
    expect(lines(tables['official/cycles.csv']).slice(1)).toEqual([`${B.start - 3_600},,3600,2026-11-24,,,,,,,`]);
  });

  it('takes OpenHoop rows of the chosen days only', async () => {
    await store.driver.run("INSERT INTO daily_metrics (device_id, day, record, readiness, load, sleep_score) VALUES (?, '2026-11-23', '{}', 71, 9.2, 80)", [deviceId]);
    await store.driver.run("INSERT INTO daily_metrics (device_id, day, record, readiness, load, sleep_score) VALUES (?, '2026-11-25', '{}', 50, 1, 2)", [deviceId]);
    await store.driver.run(
      "INSERT INTO sleeps (device_id, day, onset, offset, asleep_s, in_bed_s, nap, source) VALUES (?, '2026-11-23', ?, ?, 25000, 27000, 0, 'detected')",
      [deviceId, A.start, A.start + 27_000],
    );
    const tables = await donationTables(store.driver, deviceId, [A]);
    expect(lines(tables['openhoop/days.csv']).slice(1)).toEqual(['2026-11-23,71,9.2,80']);
    expect(lines(tables['openhoop/sleeps.csv']).slice(1)).toEqual([`2026-11-23,${A.start},${A.start + 27_000},25000,27000,0,detected`]);
  });

  it('never writes free text, deleted activities, routes or other tables', async () => {
    const run = (sql: string, params: (string | number | null)[]) => store.driver.run(sql, params);
    const kept = await run(
      "INSERT INTO activities (device_id, source, type, start, end, note, active_s, created_at, updated_at) VALUES (?, 'manual', 'run', ?, ?, 'SECRET-NOTE', 1800, 1, 1)",
      [deviceId, A.start + 3_600, A.start + 5_400],
    );
    await run(
      "INSERT INTO activities (device_id, source, type, start, end, note, deleted_at, created_at, updated_at) VALUES (?, 'manual', 'walk', ?, ?, 'SECRET-DELETED', 5, 1, 1)",
      [deviceId, A.start + 7_200, A.start + 9_000],
    );
    await run('INSERT INTO route_points (activity_id, seq, segment, t_ms, lat, lon) VALUES (?, 0, 0, 0, 51.123456, 4.654321)', [kept.lastInsertRowid]);
    await run(
      "INSERT INTO workouts (device_id, day, start, end, zone_seconds, avg_hr, max_hr, source, label) VALUES (?, '2026-11-23', ?, ?, '[]', 120, 150, 'detected', 'SECRET-LABEL')",
      [deviceId, A.start + 3_600, A.start + 5_400],
    );
    await run(
      "INSERT INTO vendor_journal (cycle_start, question, tz_offset_s, day, answered_yes, notes, imported_at) VALUES (?, 'Alcohol?', 3600, '2026-11-23', 1, 'SECRET-JOURNAL', 1)",
      [A.start],
    );
    const tables = await donationTables(store.driver, deviceId, [A]);
    const all = Object.values(tables).join('\n');
    for (const secret of ['SECRET-NOTE', 'SECRET-DELETED', 'SECRET-LABEL', 'SECRET-JOURNAL', 'Alcohol', '51.123456', '4.654321']) {
      expect(all).not.toContain(secret);
    }
    expect(lines(tables['openhoop/activities.csv']).slice(1)).toEqual([`${A.start + 3_600},${A.start + 5_400},run,1800,,"[0,0,0,0,0,0]",,,`]);
  });
});
