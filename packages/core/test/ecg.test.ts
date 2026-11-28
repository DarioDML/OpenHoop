import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteEcgRecording, ecgSamples, exportCsv, insertEcgRecording, listEcgRecordings, normalizeEcgSymptoms, openStore, parseEcgSymptoms, sampleRate, setEcgSymptoms } from '../src/index';
import type { Store } from '../src/index';
import { openStrictDriver } from './strictDriver';

describe('ECG recordings', () => {
  let store: Store;
  let deviceId: number;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    deviceId = (
      await store.upsertDevice({ bleId: 'AA', name: 'MG', model: 'MG', firmware: '50.43.2.0', serial: null, ownerSince: null, configSnapshot: null })
    ).id;
  });
  afterEach(async () => {
    await store.driver.close();
  });

  it('stores the samples, lists newest first and deletes one', async () => {
    const first = await insertEcgRecording(store.driver, deviceId, { startedAt: 100, durationMs: 30_000, samples: [1, -2, 40000, -40000], rateHz: 128, wrist: 'left' });
    const second = await insertEcgRecording(store.driver, deviceId, { startedAt: 200, durationMs: 29_500, samples: [5], rateHz: null, wrist: 'right' });
    expect((await listEcgRecordings(store.driver, deviceId)).map((r) => [r.id, r.t, r.sampleCount, r.rateHz, r.wrist])).toEqual([
      [second, 200, 1, null, 'right'],
      [first, 100, 4, 128, 'left'],
    ]);
    expect(await ecgSamples(store.driver, first)).toEqual([1, -2, 32767, -32768]);
    expect(await deleteEcgRecording(store.driver, first)).toBe(true);
    expect(await ecgSamples(store.driver, first)).toBeNull();
    expect(await deleteEcgRecording(store.driver, first)).toBe(false);
  });

  it('exports the samples as little-endian hex', async () => {
    await insertEcgRecording(store.driver, deviceId, { startedAt: 100, durationMs: 1000, samples: [1, -1], rateHz: 128, wrist: 'left' });
    const csv = await exportCsv(store, 'ecg_recordings');
    expect(csv.split(/\r?\n/)[0]).toBe('id,device_id,t,duration_ms,sample_count,rate_hz,wrist,symptoms,samples_i16le');
    expect(csv).toContain('0100FFFF');
  });

  it('stores how the wearer felt with the recording, with none only on its own', async () => {
    const id = await insertEcgRecording(store.driver, deviceId, { startedAt: 100, durationMs: 1000, samples: [1], rateHz: 128, wrist: 'left' });
    expect((await listEcgRecordings(store.driver, deviceId))[0]?.symptoms).toEqual([]);
    expect(await setEcgSymptoms(store.driver, id, ['dizzy', 'palpitations', 'none'])).toBe(true);
    expect((await listEcgRecordings(store.driver, deviceId))[0]?.symptoms).toEqual(['palpitations', 'dizzy']);
    expect(await setEcgSymptoms(store.driver, id, ['none'])).toBe(true);
    expect((await listEcgRecordings(store.driver, deviceId))[0]?.symptoms).toEqual(['none']);
    expect(await setEcgSymptoms(store.driver, id + 1, ['none'])).toBe(false);
    expect(await exportCsv(store, 'ecg_recordings')).toContain(',none,');
  });

  it('reads only known symptom tags', () => {
    expect(parseEcgSymptoms('')).toEqual([]);
    expect(parseEcgSymptoms('chestPain, bogus,shortBreath')).toEqual(['shortBreath', 'chestPain']);
    expect(normalizeEcgSymptoms(['none', 'none'])).toEqual(['none']);
  });

  it('measures the sample rate as the median per record, so partial records do not skew it', () => {
    expect(sampleRate([{ t: 10, count: 100 }, { t: 10.5, count: 100 }, { t: 11, count: 100 }])).toBe(200);
    expect(sampleRate([{ t: 9, count: 0 }, { t: 10, count: 49 }, { t: 11, count: 100 }, { t: 12, count: 100 }, { t: 13, count: 100 }])).toBe(100);
    expect(sampleRate([{ t: 10, count: 100 }])).toBeNull();
    expect(sampleRate([{ t: 10, count: 100 }, { t: 10, count: 100 }])).toBeNull();
  });
});
