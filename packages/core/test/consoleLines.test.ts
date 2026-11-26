import { beforeEach, describe, expect, it } from 'vitest';
import { consoleLines, consoleLinesCsv, joinConsoleFragments, openStore } from '../src/index';
import type { ConsoleFragment, DeviceRow, SqlDriver, Store } from '../src/index';
import { openStrictDriver } from './strictDriver';

function frag(id: number, sequence: number, text: string, t = 100 + id): ConsoleFragment {
  return { id, t, sequence, text };
}

describe('joinConsoleFragments', () => {
  it('joins a line split across fragments and uses the start time', () => {
    const lines = joinConsoleFragments([frag(1, 1, ' 30, 11: SUPERVISOR: SOC re'), frag(2, 2, 'port: 42.90\n')]);
    expect(lines).toEqual([{ t: 101, text: '30, 11: SUPERVISOR: SOC report: 42.90' }]);
  });

  it('splits a fragment holding a newline into the end of one line and the start of the next', () => {
    const lines = joinConsoleFragments([frag(1, 1, '46, hrc = 0\n 30, 12: WEAR: mov'), frag(2, 2, 'ing\n')]);
    expect(lines).toEqual([
      { t: 101, text: '46, hrc = 0' },
      { t: 101, text: '30, 12: WEAR: moving' },
    ]);
  });

  it('drops empty lines', () => {
    expect(joinConsoleFragments([frag(1, 1, '\n\n a\n \n')])).toEqual([{ t: 101, text: 'a' }]);
  });

  it('breaks the line in progress on a sequence gap instead of gluing unrelated text', () => {
    const lines = joinConsoleFragments([frag(1, 1, 'alpha, be'), frag(2, 5, 'ta gamma\n'), frag(3, 6, 'next\n')]);
    expect(lines).toEqual([
      { t: 101, text: 'alpha, be …' },
      { t: 102, text: 'ta gamma' },
      { t: 103, text: 'next' },
    ]);
  });

  it('treats 255 followed by 0 as consecutive', () => {
    const lines = joinConsoleFragments([frag(1, 255, 'wrap'), frag(2, 0, 'ped\n')]);
    expect(lines).toEqual([{ t: 101, text: 'wrapped' }]);
  });

  it('returns a trailing partial line', () => {
    expect(joinConsoleFragments([frag(1, 1, 'done\npart'), frag(2, 2, 'ial')])).toEqual([
      { t: 101, text: 'done' },
      { t: 101, text: 'partial' },
    ]);
  });

  it('orders by row id', () => {
    expect(joinConsoleFragments([frag(2, 2, 'b\n'), frag(1, 1, 'a')])).toEqual([{ t: 101, text: 'ab' }]);
  });

  it('returns nothing for no fragments', () => {
    expect(joinConsoleFragments([])).toEqual([]);
  });
});

describe('console lines from the store', () => {
  let driver: SqlDriver;
  let store: Store;
  let first: number;
  let second: number;

  async function insert(deviceId: number, sequence: number, text: string, t: number): Promise<void> {
    await driver.run('INSERT INTO console_log (device_id, t, sequence, text) VALUES (?, ?, ?, ?)', [deviceId, t, sequence, text]);
  }

  beforeEach(async () => {
    driver = openStrictDriver();
    store = await openStore(driver);
    const base: Omit<DeviceRow, 'id'> = { bleId: 'x', name: 'n', model: 'MG', firmware: null, serial: null, ownerSince: 1, configSnapshot: null };
    first = (await store.upsertDevice({ ...base, bleId: 'ble-a' })).id;
    second = (await store.upsertDevice({ ...base, bleId: 'ble-b' })).id;
  });

  it('is empty for an empty table', async () => {
    expect(await consoleLines(store, first)).toEqual([]);
    expect(await consoleLinesCsv(store)).toBe('device_id,t,text\r\n');
  });

  it('keeps two interleaved devices apart', async () => {
    await insert(first, 1, 'one, ', 10);
    await insert(second, 7, 'two, ', 11);
    await insert(first, 2, 'a\n', 12);
    await insert(second, 8, 'b\n', 13);
    expect(await consoleLines(store, first)).toEqual([{ t: 10, text: 'one, a' }]);
    expect(await consoleLines(store, second)).toEqual([{ t: 11, text: 'two, b' }]);
  });

  it('writes a CSV with the formula guard and escaping', async () => {
    await insert(first, 1, '=SUM(1,2)\n"q"\n', 10);
    const csv = await consoleLinesCsv(store);
    expect(csv).toBe(`device_id,t,text\r\n${first},10,"'=SUM(1,2)"\r\n${first},10,"""q"""\r\n`);
  });
});
