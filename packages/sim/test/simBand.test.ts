import { Command, GATT, buildCommand, concat, decodeFrame, fromHex, wrapFrame } from '@openhoop/protocol';
import { describe, expect, it } from 'vitest';
import { SimBand } from '../src/index';
import { NOW, TestClient, isRecord, options, sleep } from './harness';

const HELLO = 'aa0108000001e67123019101363e5c8d';

function utf8(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

function keyArgs(key: string): Uint8Array {
  const out = new Uint8Array(33);
  out[0] = 1;
  for (let i = 0; i < key.length; i++) out[1 + i] = key.charCodeAt(i);
  return out;
}

describe('commands', () => {
  it('answers the captured GET_HELLO frame with firmware 50.38.1.0', async () => {
    const c = await TestClient.open(options());
    await c.band.write(GATT.service, GATT.cmdToStrap, fromHex(HELLO));
    await c.waitFor(() => c.responses.length === 1);
    const r = c.responses[0];
    expect(r?.commandName).toBe('GET_HELLO');
    expect(r?.resultName).toBe('SUCCESS');
    expect(r?.originSequence).toBe(1);
    expect(r?.hello?.firmware).toEqual({ major: 50, minor: 38, patch: 1, build: 0 });
    expect(r?.hello?.unixS).toBe(NOW);
  });

  it('adds the clock offset to the hello and clock replies', async () => {
    const c = await TestClient.open(options({ clockOffsetS: 10_800, firmware: '50.43.2.0' }));
    const s1 = await c.command(Command.GET_HELLO);
    const s2 = await c.command(Command.GET_CLOCK);
    const hello = await c.responseTo(Command.GET_HELLO, s1);
    const clock = await c.responseTo(Command.GET_CLOCK, s2);
    expect(hello.hello?.unixS).toBe(NOW + 10_800);
    expect(hello.hello?.firmware.minor).toBe(43);
    expect(clock.clockUnixS).toBe(NOW + 10_800);
  });

  it('answers GET_BATTERY_LEVEL and increments its own sequence', async () => {
    const c = await TestClient.open(options());
    const s1 = await c.command(Command.GET_BATTERY_LEVEL);
    const s2 = await c.command(Command.GET_BATTERY_LEVEL);
    const a = await c.responseTo(Command.GET_BATTERY_LEVEL, s1);
    const b = await c.responseTo(Command.GET_BATTERY_LEVEL, s2);
    expect(a.batteryPercent).toBeGreaterThan(0);
    expect(a.batteryPercent).toBeLessThanOrEqual(100);
    expect(b.sequence).toBe(a.sequence + 1);
  });

  it('answers GET_DATA_RANGE with a PENDING reply and then the body', async () => {
    const c = await TestClient.open(options());
    const s = await c.command(Command.GET_DATA_RANGE, Uint8Array.of(0));
    await c.waitFor(() => c.responses.length === 2);
    const [first, second] = c.responses;
    expect(first?.resultName).toBe('PENDING');
    expect(first?.body.every((b) => b === 0)).toBe(true);
    expect(first?.originSequence).toBe(s);
    expect(second?.resultName).toBe('SUCCESS');
    expect(second?.originSequence).toBe(s);
    expect(second?.dataRange?.totalPages).toBe(131072);
    expect(second?.dataRange?.trimPage).toBe(0);
    expect(second?.dataRange?.writePage).toBe(Math.floor(7200 / 14));
    expect(second?.dataRange?.newestUnix).toBe(NOW);
  });

  it('enumerates feature flags and reads the official values', async () => {
    const c = await TestClient.open(options());
    const s = await c.command(Command.START_FF_KEY_EXCHANGE, Uint8Array.of(1));
    const start = await c.responseTo(Command.START_FF_KEY_EXCHANGE, s);
    const count = (start.body[1] ?? 0) | ((start.body[2] ?? 0) << 8);
    expect(start.body[0]).toBe(1);
    expect(count).toBe(16);
    const keys: string[] = [];
    for (let i = 0; i <= count; i++) {
      const n = await c.command(Command.SEND_NEXT_FF, Uint8Array.of(1));
      const r = await c.responseTo(Command.SEND_NEXT_FF, n);
      expect(r.body[1]).toBe(i);
      if (i < count) {
        expect(r.body[2]).toBe(1);
        keys.push(utf8(r.body.subarray(3, 35)).replace(/\0+$/, ''));
      } else {
        expect(r.body[2]).toBe(0);
      }
    }
    expect(keys[0]).toBe('enable_r22_packets');
    const v = await c.command(Command.GET_FF_VALUE, keyArgs('enable_r22_v4_packets'));
    const value = await c.responseTo(Command.GET_FF_VALUE, v);
    expect(value.body[0]).toBe(1);
    expect(utf8(value.body.subarray(1, 33)).replace(/\0+$/, '')).toBe('enable_r22_v4_packets');
    expect(utf8(value.body.subarray(33, 65)).replace(/\0+$/, '')).toBe('1');
  });

  it('enumerates device config keys', async () => {
    const c = await TestClient.open(options());
    const s = await c.command(Command.START_DEVICE_CONFIG_KEY_EXCHANGE, Uint8Array.of(1));
    const start = await c.responseTo(Command.START_DEVICE_CONFIG_KEY_EXCHANGE, s);
    expect(start.body[1]).toBe(7);
    const n = await c.command(Command.SEND_NEXT_DEVICE_CONFIG, Uint8Array.of(1));
    const first = await c.responseTo(Command.SEND_NEXT_DEVICE_CONFIG, n);
    expect(utf8(first.body.subarray(3, 35)).replace(/\0+$/, '')).toBe('sigproc_wear_detect');
    const v = await c.command(Command.GET_DEVICE_CONFIG_VALUE, keyArgs('sigproc_wear_detect'));
    expect((await c.responseTo(Command.GET_DEVICE_CONFIG_VALUE, v)).body.length).toBeGreaterThanOrEqual(33);
  });

  it('refuses unknown read commands, counts write and dangerous commands, and counts forbidden ones', async () => {
    const c = await TestClient.open(options());
    const unsupported = await c.command(Command.GET_ALL_HAPTICS_PATTERN);
    expect((await c.responseTo(Command.GET_ALL_HAPTICS_PATTERN, unsupported)).resultName).toBe('UNSUPPORTED');
    const w = await c.command(Command.SET_ALARM_TIME, new Uint8Array(8));
    expect((await c.responseTo(Command.SET_ALARM_TIME, w)).resultName).toBe('SUCCESS');
    c.seq += 1;
    await c.band.write(
      GATT.service,
      GATT.cmdToStrap,
      buildCommand(Command.REBOOT_STRAP, new Uint8Array(0), c.seq, { confirmDangerous: 'REBOOT_STRAP' }),
    );
    await c.waitFor(() => c.responses.some((r) => r.command === Command.REBOOT_STRAP));
    expect(c.band.writesReceived).toBe(1);
    expect(c.band.dangerousReceived).toBe(1);
    expect(c.band.forbiddenReceived).toBe(0);

    for (const forbidden of [36, 83, 143, 159, 200]) {
      c.seq += 1;
      const frame = wrapFrame(concat(Uint8Array.of(35, c.seq, forbidden), new Uint8Array(1)), 0, 1);
      await c.band.write(GATT.service, GATT.cmdToStrap, frame);
      await c.waitFor(() => c.responses.some((r) => r.command === forbidden));
      expect(c.responses.find((r) => r.command === forbidden)?.resultName).toBe('UNSUPPORTED');
    }
    expect(c.band.forbiddenReceived).toBe(5);
  });

  it('ignores a frame with a bad CRC', async () => {
    const c = await TestClient.open(options());
    const frame = fromHex(HELLO);
    frame[12] = (frame[12] ?? 0) ^ 0xff;
    await c.band.write(GATT.service, GATT.cmdToStrap, frame);
    await sleep(30);
    expect(c.responses.length).toBe(0);
    expect(c.band.wireLog.filter((e) => e.dir === 'in').length).toBe(0);
  });

  it('streams realtime heart-rate frames while toggled on', async () => {
    const c = await TestClient.open(options());
    const on = await c.command(Command.TOGGLE_REALTIME_HR, Uint8Array.of(1));
    await c.responseTo(Command.TOGGLE_REALTIME_HR, on);
    await c.waitFor(() => c.data.filter((p) => p.kind === 'realtimeHr').length >= 3);
    const off = await c.command(Command.TOGGLE_REALTIME_HR, Uint8Array.of(0));
    await c.responseTo(Command.TOGGLE_REALTIME_HR, off);
    await sleep(30);
    const count = c.data.length;
    await sleep(40);
    expect(c.data.length).toBe(count);
  });
});

describe('history', () => {
  it('drains a 2-hour band in order and ends with HISTORY_COMPLETE', async () => {
    const c = await TestClient.open(options());
    await c.drain();
    const records = c.records();
    expect(records.length).toBe(7196);
    records.forEach((r, i) => {
      expect(r.unixS).toBe(NOW - 7200 + 1 + i);
      expect(r.recordIndex).toBe(i);
    });
    expect(c.metas('HISTORY_START').length).toBe(Math.ceil(514 / 40));
    expect(c.metas('HISTORY_END').length).toBe(Math.ceil(514 / 40));
    expect(c.metas('HISTORY_COMPLETE').length).toBe(1);
    const last = c.data[c.data.length - 1];
    expect(last?.kind === 'metadata' && last.metaName).toBe('HISTORY_COMPLETE');

    const s = await c.command(Command.GET_DATA_RANGE, Uint8Array.of(0));
    const range = (await c.responseTo(Command.GET_DATA_RANGE, s)).dataRange;
    expect(range?.trimPage).toBe(range?.writePage);
    expect(range?.pagesBehind).toBe(0);
  });

  it('serves battery events and console lines inside the stream', async () => {
    const c = await TestClient.open(options());
    await c.drain();
    expect(c.data.filter((p) => p.kind === 'event').length).toBeGreaterThanOrEqual(3);
    expect(c.data.filter((p) => p.kind === 'console').length).toBeGreaterThanOrEqual(3);
  });

  it('honours recordsPerChunk', async () => {
    const c = await TestClient.open(options({ recordsPerChunk: 140 }));
    await c.drain();
    expect(c.metas('HISTORY_END').length).toBe(Math.ceil(514 / 10));
    expect(c.records().length).toBe(7196);
  });

  it('re-serves the same records when a new request arrives without an acknowledgement', async () => {
    const c = await TestClient.open(options());
    await c.command(Command.SEND_HISTORICAL_DATA);
    await c.waitFor(() => c.metas('HISTORY_END').length === 1);
    const first = c.records().map((r) => r.unixS);
    expect(first.length).toBe(560);
    c.data.length = 0;
    await c.command(Command.SEND_HISTORICAL_DATA);
    await c.waitFor(() => c.metas('HISTORY_END').length === 1);
    expect(c.records().map((r) => r.unixS)).toEqual(first);
  });

  it('ignores an acknowledgement with a wrong token', async () => {
    const c = await TestClient.open(options());
    await c.command(Command.SEND_HISTORICAL_DATA);
    await c.waitFor(() => c.metas('HISTORY_END').length === 1);
    const token = c.metas('HISTORY_END')[0]?.endToken ?? new Uint8Array(8);
    const wrong = token.slice();
    wrong[0] = (wrong[0] ?? 0) + 1;
    const before = c.responses.length;
    await c.ack(wrong);
    await sleep(40);
    expect(c.responses.length).toBe(before);
    expect(c.metas('HISTORY_END').length).toBe(1);
    const s = await c.command(Command.GET_DATA_RANGE, Uint8Array.of(0));
    expect((await c.responseTo(Command.GET_DATA_RANGE, s)).dataRange?.trimPage).toBe(0);
    await c.ack(token);
    await c.waitFor(() => c.metas('HISTORY_END').length === 2);
    expect(c.records()[560]?.recordIndex).toBe(560);
  });

  it('stops serving on ABORT and keeps trim', async () => {
    const c = await TestClient.open(options());
    await c.command(Command.SEND_HISTORICAL_DATA);
    await c.waitFor(() => c.metas('HISTORY_END').length === 1);
    await c.ack(c.metas('HISTORY_END')[0]?.endToken ?? new Uint8Array(8));
    const a = await c.command(Command.ABORT_HISTORICAL_TRANSMITS);
    expect((await c.responseTo(Command.ABORT_HISTORICAL_TRANSMITS, a)).resultName).toBe('SUCCESS');
    await sleep(60);
    const dataFrames = c.data.length;
    await sleep(60);
    expect(c.data.length).toBe(dataFrames);
    const s = await c.command(Command.GET_DATA_RANGE, Uint8Array.of(0));
    expect((await c.responseTo(Command.GET_DATA_RANGE, s)).dataRange?.trimPage).toBe(40);
  });

  it('never sends fragments larger than mtu - 3', async () => {
    for (const mtu of [23, 100, 244]) {
      const c = await TestClient.open(options({ mtu, historyDays: 600 / 86400 }));
      await c.drain();
      expect(Math.max(...c.fragmentSizes)).toBeLessThanOrEqual(mtu - 3);
      expect(c.records().length).toBe(588);
    }
  });

  it('drains two days without blocking the event loop', async () => {
    const c = await TestClient.open(options({ historyDays: 2, wireLogCap: 100 }));
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 5);
    const started = Date.now();
    await c.drain(120_000);
    const elapsed = Date.now() - started;
    clearInterval(timer);
    expect(c.records().length).toBe(Math.floor(172_800 / 14) * 14);
    expect(ticks).toBeGreaterThan(5);
    expect(c.band.wireLog.length).toBeLessThanOrEqual(100);
    console.log(`two-day drain: ${elapsed} ms`);
  }, 180_000);
});

describe('faults', () => {
  it('drops the connection after N data frames, once, and keeps trim', async () => {
    const c = await TestClient.open(options({ faults: { disconnectAfterFrames: 700 } }));
    await c.command(Command.SEND_HISTORICAL_DATA);
    await c.waitFor(() => c.metas('HISTORY_END').length === 1);
    await c.ack(c.metas('HISTORY_END')[0]?.endToken ?? new Uint8Array(8));
    await c.waitFor(() => c.disconnects === 1);
    expect(c.data.length).toBe(700);
    await sleep(30);
    expect(c.data.length).toBe(700);
    await expect(c.command(Command.GET_HELLO)).rejects.toThrow();

    c.data.length = 0;
    c.responses.length = 0;
    await c.connect();
    const s = await c.command(Command.GET_DATA_RANGE, Uint8Array.of(0));
    expect((await c.responseTo(Command.GET_DATA_RANGE, s)).dataRange?.trimPage).toBe(40);
    await c.drain();
    expect(c.disconnects).toBe(1);
    const times = c.records().map((r) => r.unixS);
    expect(times.length).toBe(7196 - 560);
    expect(times[0]).toBe(NOW - 7200 + 1 + 560);
  });

  it('ignores the first valid acknowledgement with dropAckOnce', async () => {
    const c = await TestClient.open(options({ faults: { dropAckOnce: true } }));
    await c.command(Command.SEND_HISTORICAL_DATA);
    await c.waitFor(() => c.metas('HISTORY_END').length === 1);
    const token = c.metas('HISTORY_END')[0]?.endToken ?? new Uint8Array(8);
    const before = c.responses.length;
    await c.ack(token);
    await sleep(40);
    expect(c.responses.length).toBe(before);
    expect(c.metas('HISTORY_END').length).toBe(1);
    const s = await c.command(Command.GET_DATA_RANGE, Uint8Array.of(0));
    expect((await c.responseTo(Command.GET_DATA_RANGE, s)).dataRange?.trimPage).toBe(0);

    await c.ack(token);
    await c.waitFor(() => c.metas('HISTORY_END').length === 2);
    expect(c.records()[560]?.recordIndex).toBe(560);
  });

  it('corrupts every Nth fragment so frames fail validation', async () => {
    const band = new SimBand(options({ faults: { corruptEveryNthFragment: 3 }, historyDays: 300 / 86400 }));
    await band.connect('sim:7');
    await band.bond();
    const fragments: Uint8Array[] = [];
    await band.subscribe(GATT.service, GATT.dataFromStrap, (d) => fragments.push(d));
    await band.subscribe(GATT.service, GATT.cmdFromStrap, () => undefined);
    await band.write(GATT.service, GATT.cmdToStrap, buildCommand(Command.SEND_HISTORICAL_DATA, new Uint8Array(0), 1));
    while (fragments.length < 30) await sleep(2);
    const reference = new SimBand(options({ historyDays: 300 / 86400 }));
    await reference.connect('sim:7');
    await reference.bond();
    const clean: Uint8Array[] = [];
    await reference.subscribe(GATT.service, GATT.dataFromStrap, (d) => clean.push(d));
    await reference.subscribe(GATT.service, GATT.cmdFromStrap, () => undefined);
    await reference.write(GATT.service, GATT.cmdToStrap, buildCommand(Command.SEND_HISTORICAL_DATA, new Uint8Array(0), 1));
    while (clean.length < 30) await sleep(2);
    const differing = fragments
      .slice(0, 30)
      .filter((f, i) => f.some((b, k) => b !== clean[i]?.[k])).length;
    expect(differing).toBeGreaterThanOrEqual(9);
    expect(differing).toBeLessThanOrEqual(11);
    const bad = fragments.slice(0, 30).find((f, i) => f.some((b, k) => b !== clean[i]?.[k]));
    expect(() => decodeFrame(bad ?? new Uint8Array(0))).toThrow();
  });
});

describe('locked', () => {
  it('answers commands but sends nothing on the data characteristic, while standard heart rate works', async () => {
    const c = await TestClient.open(options({ locked: true }));
    const hr: Uint8Array[] = [];
    await c.band.subscribe(GATT.heartRateService, GATT.heartRateMeasurement, (d) => hr.push(d));
    const h = await c.command(Command.SEND_HISTORICAL_DATA);
    expect((await c.responseTo(Command.SEND_HISTORICAL_DATA, h)).resultName).toBe('SUCCESS');
    const r = await c.command(Command.TOGGLE_REALTIME_HR, Uint8Array.of(1));
    expect((await c.responseTo(Command.TOGGLE_REALTIME_HR, r)).resultName).toBe('SUCCESS');
    const d = await c.command(Command.GET_DATA_RANGE, Uint8Array.of(0));
    expect((await c.responseTo(Command.GET_DATA_RANGE, d)).resultName).toBe('SUCCESS');
    await c.waitFor(() => hr.length >= 3);
    expect(c.data.length).toBe(0);
    expect(c.events.length).toBe(0);
    expect(hr[0]?.[1]).toBeGreaterThan(30);
  });
});

describe('gatt and bonding', () => {
  it('lists services, serves device information and a standard heart-rate stream without a bond', async () => {
    const band = new SimBand(options({ model: 'MG', firmware: '50.43.2.0' }));
    const found = await band.scan(1000);
    expect(found).toEqual([{ id: 'sim:7', name: 'WHOOP SIM', rssi: expect.any(Number) }]);
    await band.connect('sim:7');
    const services = await band.services();
    const uuids = services.map((s) => s.uuid);
    expect(uuids).toEqual([GATT.service, GATT.heartRateService, GATT.deviceInformationService, GATT.batteryService]);
    const custom = services[0]?.characteristics.map((x) => x.uuid);
    expect(custom).toEqual([GATT.cmdToStrap, GATT.cmdFromStrap, GATT.eventsFromStrap, GATT.dataFromStrap]);
    expect(utf8(await band.read(GATT.deviceInformationService, GATT.firmwareRevision))).toBe('50.43.2.0');
    expect(utf8(await band.read(GATT.deviceInformationService, GATT.serialNumber))).toBe('SIM-7');
    expect(utf8(await band.read(GATT.deviceInformationService, GATT.modelNumber))).toBe('WHOOP MG');
    expect((await band.read(GATT.batteryService, GATT.batteryLevel))[0]).toBeGreaterThan(0);
    const hr: Uint8Array[] = [];
    const stop = await band.subscribe(GATT.heartRateService, GATT.heartRateMeasurement, (d) => hr.push(d));
    while (hr.length < 3) await sleep(2);
    await stop();
    const count = hr.length;
    await sleep(40);
    expect(hr.length).toBe(count);
  });

  it('rejects the command characteristic and custom notifications before a bond', async () => {
    const band = new SimBand(options());
    await band.connect('sim:7');
    await expect(band.write(GATT.service, GATT.cmdToStrap, fromHex(HELLO))).rejects.toThrow(/insufficient authentication/);
    for (const uuid of [GATT.cmdFromStrap, GATT.eventsFromStrap, GATT.dataFromStrap]) {
      await expect(band.subscribe(GATT.service, uuid, () => undefined)).rejects.toThrow(/insufficient authentication/);
    }
    expect(await band.bond()).toBe('bonded');
    expect(await band.bond()).toBe('already-bonded');
    await band.write(GATT.service, GATT.cmdToStrap, fromHex(HELLO));
  });

  it('keeps the bond across a reconnect', async () => {
    const band = new SimBand(options());
    await band.connect('sim:7');
    await band.bond();
    await band.disconnect();
    await band.connect('sim:7');
    expect(await band.bond()).toBe('already-bonded');
  });

  it('refuses to bond when bondRefused is set and then rejects writes', async () => {
    const band = new SimBand(options({ bondRefused: true }));
    await band.connect('sim:7');
    expect(await band.bond()).toBe('refused');
    await expect(band.write(GATT.service, GATT.cmdToStrap, fromHex(HELLO))).rejects.toThrow(/insufficient authentication/);
  });

  it('logs frames in and out as hex', async () => {
    const c = await TestClient.open(options());
    await c.command(Command.GET_HELLO);
    await c.waitFor(() => c.responses.length === 1);
    expect(c.band.wireLog.map((e) => e.dir)).toEqual(['in', 'out']);
    const out = decodeFrame(fromHex(c.band.wireLog[1]?.hex ?? ''));
    expect(out.kind === 'commandResponse' && out.commandName).toBe('GET_HELLO');
  });
});

describe('records', () => {
  it('stamps records with the band clock', async () => {
    const c = await TestClient.open(options({ clockOffsetS: 7200 }));
    await c.drain();
    expect(c.records().every(isRecord)).toBe(true);
    expect(c.records()[0]?.unixS).toBe(NOW + 7200 - 7200 + 1);
  });
});
