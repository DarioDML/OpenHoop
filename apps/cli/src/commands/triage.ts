import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ConfigKey, DiscoveredDevice, GattService, Transport } from '@stoop/core';
import { probeLock, readDeviceInformation, readKeys } from '@stoop/core';
import type { Session } from '@stoop/core';
import { GATT, formatFirmware, isDataLockFirmware, parseFirmware, parseHeartRateMeasurement } from '@stoop/protocol';
import { UsageError } from '../args';
import type { Command, CommandResult } from '../command';
import type { Context } from '../context';
import { modelFromText } from '../devices';
import { bondWithGuidance, openSession, pickBand, registerDevice, scanForBands } from '../flows';
import { errorMessage, formatDuration, formatIso, timestampForFile } from '../format';

const SECONDS_PER_PAGE = 13.6;
const CLOCK_WARN_S = 120;
const DEFAULT_HR_SECONDS = 10;
const DEFAULT_SCAN_SECONDS = 8;

type Step<T> = ({ status: 'ok' } & T) | { status: 'failed'; error: string } | { status: 'skipped'; reason: string };

interface HeartRateSummary {
  seconds: number;
  notifications: number;
  beats: number;
  hr: { min: number; avg: number; max: number } | null;
  rrIntervals: number;
  rrSampleMs: number[];
}

interface SessionSummary {
  firmware: string;
  battery: number;
  bandClockUnixS: number;
  laptopClockUnixS: number;
  clockOffsetS: number | null;
  dataRange: {
    readPage: number;
    writePage: number;
    trimPage: number;
    totalPages: number;
    pagesBehind: number | null;
    newestUnix: number | null;
  };
  backlogHours: number | null;
}

type Verdict = {
  label: 'OPEN' | 'LOCKED' | 'NO DATA';
  line: string;
  explanation: string;
  nextCommand: string;
};

interface Snapshot {
  version: 1;
  generatedAt: string;
  simulated: boolean;
  bluetoothPath: 'untested-until-day-1' | 'simulated';
  firmware: string | null;
  state: 'open' | 'locked' | 'no-data' | 'unknown';
  verdict: Verdict | null;
  warnings: string[];
  found: DiscoveredDevice[];
  device: DiscoveredDevice | null;
  steps: {
    scan: Step<{ chosen: DiscoveredDevice }>;
    gatt: Step<{ services: GattService[] }>;
    deviceInformation: Step<{ firmware: string | null; serial: string | null; model: string | null; battery: number | null }>;
    heartRate: Step<{ summary: HeartRateSummary }>;
    bond: Step<{ result: string }>;
    session: Step<{ summary: SessionSummary }>;
    featureFlags: Step<{ keys: ConfigKey[] }>;
    deviceConfig: Step<{ keys: ConfigKey[] }>;
    lockProbe: Step<{
      state: 'open' | 'locked' | 'no-data';
      pagesBehind: number | null;
      sawHistory: boolean;
      sawRealtime: boolean;
      waitedMs: number;
    }>;
  };
  simulator?: { forbiddenReceived: number; writesReceived: number; dangerousReceived: number };
  snapshotFile?: string;
}

function skipped(reason: string): { status: 'skipped'; reason: string } {
  return { status: 'skipped', reason };
}

async function attempt<T extends object>(ctx: Context, title: string, work: () => Promise<T>): Promise<Step<T>> {
  ctx.log(`\n${title}`);
  try {
    return { status: 'ok', ...(await work()) };
  } catch (error) {
    const message = errorMessage(error);
    ctx.log(`  failed: ${message}`);
    return { status: 'failed', error: message };
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolveWait) => {
    setTimeout(resolveWait, ms);
  });
}

async function sampleHeartRate(ctx: Context, transport: Transport, seconds: number): Promise<{ summary: HeartRateSummary }> {
  const rates: number[] = [];
  const rr: number[] = [];
  let notifications = 0;
  const unsubscribe = await transport.subscribe(GATT.heartRateService, GATT.heartRateMeasurement, (data) => {
    notifications += 1;
    const { heartRate, rrMs } = parseHeartRateMeasurement(data);
    if (heartRate > 0) rates.push(heartRate);
    rr.push(...rrMs);
  });
  try {
    await pause(seconds * 1000);
  } finally {
    await unsubscribe().catch(() => undefined);
  }
  const summary: HeartRateSummary = {
    seconds,
    notifications,
    beats: rates.length,
    hr:
      rates.length === 0
        ? null
        : { min: Math.min(...rates), avg: Math.round(rates.reduce((a, b) => a + b, 0) / rates.length), max: Math.max(...rates) },
    rrIntervals: rr.length,
    rrSampleMs: rr.slice(0, 20),
  };
  if (summary.hr === null) ctx.log(`  no heart-rate notifications in ${seconds} s (the band may need to be worn, or it withholds this service)`);
  else {
    ctx.log(`  ${summary.beats} readings, ${summary.hr.min}-${summary.hr.max} bpm (avg ${summary.hr.avg}), ${summary.rrIntervals} R-R intervals`);
  }
  return { summary };
}

async function describeSession(session: Session, laptopNowS: number): Promise<{ summary: SessionSummary }> {
  const hello = session.hello;
  if (hello === null) throw new Error('session has no hello');
  const range = await session.dataRange();
  const behind = range.pagesBehind;
  return {
    summary: {
      firmware: formatFirmware(hello.firmware),
      battery: hello.batteryPercent,
      bandClockUnixS: hello.unixS,
      laptopClockUnixS: Math.floor(laptopNowS),
      clockOffsetS: session.clockOffsetS(),
      dataRange: {
        readPage: range.readPage,
        writePage: range.writePage,
        trimPage: range.trimPage,
        totalPages: range.totalPages,
        pagesBehind: behind,
        newestUnix: range.newestUnix,
      },
      backlogHours: behind === null ? null : Math.round(((behind * SECONDS_PER_PAGE) / 3600) * 10) / 10,
    },
  };
}

function keyLine(key: ConfigKey): string {
  const value = key.valueText ?? (key.valueHex === null ? '(unreadable)' : `0x${key.valueHex}`);
  return `  ${key.key} = ${value}`;
}

export function buildVerdict(state: 'open' | 'locked' | 'no-data'): Verdict {
  if (state === 'open') {
    const explanation = 'The band sent history or live data when asked, so its data is readable.';
    const nextCommand = 'npm run stoop -- sync --owner-since <YYYY-MM-DD the band became yours>';
    return { label: 'OPEN', line: `OPEN: ${explanation} Next: ${nextCommand}`, explanation, nextCommand };
  }
  if (state === 'locked') {
    const explanation =
      'The band answers every command but sends no data, which is how firmware 50.43 and later behaves without a vendor-signed certificate; Stoop does not try to get around that.';
    const nextCommand = 'npm run stoop -- live --record';
    return { label: 'LOCKED', line: `LOCKED (firmware 50.43+, data withheld): ${explanation} Next: ${nextCommand}`, explanation, nextCommand };
  }
  const explanation =
    'The band answered but sent no data within the wait, and its firmware is older than 50.43, so it is probably not locked.';
  const nextCommand = 'wear the band for a few minutes, then run: npm run stoop -- triage';
  return { label: 'NO DATA', line: `NO DATA: ${explanation} Next: ${nextCommand}`, explanation, nextCommand };
}

function outputPath(requested: string | undefined, now: Date): string {
  if (requested !== undefined) {
    if (requested.length === 0 || requested.includes('\0')) throw new UsageError('--out needs a file path');
    return resolve(requested);
  }
  return resolve('stoop-data', `triage-${timestampForFile(now)}.json`);
}

async function run(ctx: Context): Promise<CommandResult> {
  const hrSeconds = ctx.args.int('hr-seconds', 0, 120) ?? DEFAULT_HR_SECONDS;
  const scanSeconds = ctx.args.int('scan-seconds', 1, 60) ?? DEFAULT_SCAN_SECONDS;
  const now = new Date(ctx.nowMs());
  const target = outputPath(ctx.args.string('out'), now);
  const handle = await ctx.transport();
  const { transport } = handle;
  const store = await ctx.store();

  const snapshot: Snapshot = {
    version: 1,
    generatedAt: now.toISOString(),
    simulated: handle.sim !== null,
    bluetoothPath: handle.sim !== null ? 'simulated' : 'untested-until-day-1',
    firmware: null,
    state: 'unknown',
    verdict: null,
    warnings: [],
    found: [],
    device: null,
    steps: {
      scan: skipped('not run'),
      gatt: skipped('not run'),
      deviceInformation: skipped('not run'),
      heartRate: skipped('not run'),
      bond: skipped('not run'),
      session: skipped('not run'),
      featureFlags: skipped('not run'),
      deviceConfig: skipped('not run'),
      lockProbe: skipped('not run'),
    },
  };
  const steps = snapshot.steps;

  ctx.log('Stoop triage: read-only. Nothing is written to the band and no history is acknowledged.');

  steps.scan = await attempt(ctx, '[1/7] Scan for bands', async () => {
    snapshot.found = await scanForBands(ctx, transport, scanSeconds);
    const chosen = pickBand(ctx, snapshot.found, await store.listDevices());
    snapshot.device = chosen;
    ctx.log(`  using: ${chosen.name ?? '(no name)'} ${chosen.id}`);
    return { chosen };
  });

  const chosen = snapshot.device;
  const link = { up: false };
  if (chosen === null) {
    steps.gatt = skipped('no band selected');
  } else {
    steps.gatt = await attempt(ctx, '[2/7] Connect and list GATT services', async () => {
      await transport.connect(chosen.id);
      link.up = true;
      const services = await transport.services();
      for (const service of services) {
        ctx.log(`  service ${service.uuid}`);
        for (const characteristic of service.characteristics) {
          ctx.log(`    ${characteristic.uuid}  [${characteristic.properties.join(', ')}]`);
        }
      }
      return { services };
    });
  }

  if (!link.up) {
    steps.deviceInformation = skipped('not connected');
    steps.heartRate = skipped('not connected');
  } else {
    steps.deviceInformation = await attempt(ctx, '[3/7] Read device information and sample heart rate (no bond)', async () => {
      const info = await readDeviceInformation(transport);
      ctx.log(`  firmware ${info.firmware ?? 'unreadable'}, serial ${info.serial ?? 'unreadable'}, model ${info.model ?? 'unreadable'}, battery ${info.battery === null ? 'unreadable' : `${info.battery}%`}`);
      return info;
    });
    if (hrSeconds === 0) steps.heartRate = skipped('--hr-seconds 0');
    else {
      steps.heartRate = await attempt(ctx, `  Sampling standard heart rate for ${hrSeconds} s`, () => sampleHeartRate(ctx, transport, hrSeconds));
    }
  }

  let session: Session | null = null;
  if (!link.up) {
    steps.bond = skipped('not connected');
    steps.session = skipped('not connected');
  } else {
    steps.bond = await attempt(ctx, '[4/7] Bond', async () => ({ result: await bondWithGuidance(ctx, transport) }));
    steps.session = await attempt(ctx, '[5/7] Open a session', async () => {
      const opened = await openSession(ctx, transport);
      session = opened.session;
      const described = await describeSession(opened.session, ctx.nowMs() / 1000);
      const s = described.summary;
      const behind = s.dataRange.pagesBehind;
      ctx.log(`  ring: read ${s.dataRange.readPage}, write ${s.dataRange.writePage}, trim ${s.dataRange.trimPage} of ${s.dataRange.totalPages} pages`);
      ctx.log(
        behind === null
          ? '  backlog: unknown'
          : `  backlog: ${behind} pages, about ${formatDuration(behind * SECONDS_PER_PAGE)} of data (1 page is about ${SECONDS_PER_PAGE} s)`,
      );
      ctx.log(`  band clock ${formatIso(s.bandClockUnixS)}, laptop clock ${formatIso(s.laptopClockUnixS)}`);
      return described;
    });
  }

  const open = session as Session | null;
  if (open === null) {
    steps.featureFlags = skipped('no session');
    steps.deviceConfig = skipped('no session');
    steps.lockProbe = skipped('no session');
  } else {
    steps.featureFlags = await attempt(ctx, '[6/7] Feature flags and device config', async () => {
      const keys = await readKeys(open, 'featureFlags');
      ctx.log(`  ${keys.length} feature flags`);
      for (const key of keys) ctx.log(keyLine(key));
      return { keys };
    });
    steps.deviceConfig = await attempt(ctx, '  Device config keys', async () => {
      const keys = await readKeys(open, 'deviceConfig');
      ctx.log(`  ${keys.length} config keys`);
      for (const key of keys) ctx.log(keyLine(key));
      return { keys };
    });
    steps.lockProbe = await attempt(ctx, '[7/7] Lock probe (asks for history, waits, aborts, never acknowledges)', async () => {
      const probe = await probeLock(open);
      ctx.log(`  state ${probe.state}: history seen ${probe.sawHistory}, live heart rate seen ${probe.sawRealtime}, waited ${(probe.waitedMs / 1000).toFixed(1)} s`);
      return { state: probe.state, pagesBehind: probe.pagesBehind, sawHistory: probe.sawHistory, sawRealtime: probe.sawRealtime, waitedMs: probe.waitedMs };
    });
  }

  if (open !== null) await open.close().catch(() => undefined);
  if (link.up) await transport.disconnect().catch(() => undefined);

  const sessionStep = steps.session;
  const infoStep = steps.deviceInformation;
  snapshot.firmware =
    sessionStep.status === 'ok' ? sessionStep.summary.firmware : infoStep.status === 'ok' ? infoStep.firmware : null;
  const parsedFirmware = snapshot.firmware === null ? null : parseFirmware(snapshot.firmware);
  const lockFirmware = parsedFirmware !== null && isDataLockFirmware(parsedFirmware);
  if (steps.lockProbe.status === 'ok') {
    snapshot.state = steps.lockProbe.state;
    snapshot.verdict = buildVerdict(steps.lockProbe.state);
  }
  if (lockFirmware && snapshot.state !== 'locked') {
    snapshot.warnings.push(
      `Firmware ${snapshot.firmware} is 50.43 or later: it withholds data without a vendor-signed certificate. If the band reads OPEN now, the certificate it holds may still expire, so sync soon and keep an export of the database.`,
    );
  }
  if (sessionStep.status === 'ok') {
    const offset = sessionStep.summary.clockOffsetS;
    if (offset === null) snapshot.warnings.push('The band clock is not set (sentinel value). Samples cannot be placed in time.');
    else if (Math.abs(offset) > CLOCK_WARN_S) {
      snapshot.warnings.push(`The band clock differs from this laptop by ${offset} s. Days touched by a sync are flagged, not corrected.`);
    }
  }
  if (steps.bond.status === 'ok' && (steps.bond.result === 'refused' || steps.bond.result === 'unsupported')) {
    snapshot.warnings.push('The band was not bonded, so the bonded steps may have failed. See the pairing instructions above.');
  }
  if (handle.sim !== null) {
    snapshot.simulator = {
      forbiddenReceived: handle.sim.forbiddenReceived,
      writesReceived: handle.sim.writesReceived,
      dangerousReceived: handle.sim.dangerousReceived,
    };
  }
  snapshot.snapshotFile = target;

  const text = JSON.stringify(snapshot, null, 2);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text, 'utf8');
  if (chosen !== null) {
    await registerDevice(store, chosen, {
      firmware: snapshot.firmware,
      serial: infoStep.status === 'ok' ? infoStep.serial : null,
      model: infoStep.status === 'ok' ? modelFromText(infoStep.model) : null,
      configSnapshot: text,
    });
  }

  ctx.log('\nVerdict');
  if (snapshot.verdict !== null) ctx.log(snapshot.verdict.line);
  else ctx.log('NO VERDICT: the lock probe did not run (see the failed steps above), so the band was not classified. Next: fix the first failed step and run triage again.');
  for (const warning of snapshot.warnings) ctx.log(`WARNING: ${warning}`);
  ctx.log('REMINDER: never connect this band to the official WHOOP app; it may update the firmware, and a later firmware can withhold the data; Stoop cannot undo that.');
  ctx.log(`Snapshot saved to ${target} and to the device row in ${ctx.dbPath}`);
  if (handle.sim !== null) {
    ctx.log(`Simulator counters: forbidden ${snapshot.simulator?.forbiddenReceived ?? 0}, write ${snapshot.simulator?.writesReceived ?? 0}, dangerous ${snapshot.simulator?.dangerousReceived ?? 0}`);
  }
  return { json: snapshot, exitCode: snapshot.verdict === null ? 1 : 0 };
}

export const triage: Command = {
  name: 'triage',
  summary: 'Read-only first look at a band: firmware, lock state, ring buffer, configuration',
  usage: ['triage [--out <file>] [--device <id or name>] [--hr-seconds n] [--scan-seconds n]'],
  options: {
    out: { type: 'string' },
    'hr-seconds': { type: 'string' },
    'scan-seconds': { type: 'string' },
  },
  bluetooth: true,
  run,
};
