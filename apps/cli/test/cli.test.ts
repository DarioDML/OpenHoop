import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openStore } from '@openhoop/core';
import { openNodeDriver } from '@openhoop/core/node';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const MAIN = join(ROOT, 'apps', 'cli', 'src', 'main.ts');

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

function cli(...args: string[]): Promise<Run> {
  return new Promise((resolveRun) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', MAIN, ...args],
      { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1' } },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolveRun({ code, stdout, stderr });
      },
    );
  });
}

function parseJson(run: Run): Record<string, unknown> {
  const parsed: unknown = JSON.parse(run.stdout);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('stdout is not a JSON object');
  return parsed as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('not an object');
  return value as Record<string, unknown>;
}

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'openhoop-cli-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe.concurrent('triage', () => {
  it('reports firmware 50.38.1.0 and an open state, and sends the simulator nothing but reads', async () => {
    const db = join(dir, 'triage-open.db');
    const out = join(dir, 'triage-open.json');
    const run = await cli('triage', '--sim=7', '--json', '--db', db, '--out', out, '--hr-seconds', '1', '--scan-seconds', '1');
    expect(run.code).toBe(0);
    const snapshot = parseJson(run);
    expect(snapshot.firmware).toBe('50.38.1.0');
    expect(snapshot.state).toBe('open');
    expect(asRecord(snapshot.verdict).label).toBe('OPEN');
    expect(snapshot.simulator).toEqual({ forbiddenReceived: 0, writesReceived: 0, dangerousReceived: 0 });
    expect(run.stderr).toContain('[7/7] Lock probe');
    expect(run.stderr).not.toContain('Bluetooth path');
    for (const step of Object.values(asRecord(snapshot.steps))) expect(asRecord(step).status).toBe('ok');

    const saved = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
    expect(saved.firmware).toBe('50.38.1.0');
    const store = await openStore(openNodeDriver(db));
    const [device] = await store.listDevices();
    expect(device?.firmware).toBe('50.38.1.0');
    expect(JSON.parse(device?.configSnapshot ?? 'null')).toMatchObject({ state: 'open', firmware: '50.38.1.0' });
    await store.driver.close();
  });

  it('reports locked for firmware 50.43.2.0 that withholds data and starts the verdict with LOCKED', async () => {
    const db = join(dir, 'triage-locked.db');
    const out = join(dir, 'triage-locked.json');
    const run = await cli(
      'triage',
      '--sim=7',
      '--sim-locked',
      '--sim-firmware',
      '50.43.2.0',
      '--db',
      db,
      '--out',
      out,
      '--hr-seconds',
      '1',
      '--scan-seconds',
      '1',
    );
    expect(run.code).toBe(0);
    const verdictLine = run.stdout.split('\n').find((line) => /^(OPEN|LOCKED|NO DATA)/.test(line));
    expect(verdictLine?.startsWith('LOCKED')).toBe(true);
    expect(run.stdout).toContain('REMINDER: never connect this band to the official WHOOP app');
    const saved = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
    expect(saved.state).toBe('locked');
    expect(saved.firmware).toBe('50.43.2.0');
    expect(asRecord(saved.verdict).line).toEqual(expect.stringMatching(/^LOCKED/));
    expect(saved.simulator).toEqual({ forbiddenReceived: 0, writesReceived: 0, dangerousReceived: 0 });
  }, 60_000);

  it('warns about data-lock firmware even when the state is open', async () => {
    const run = await cli(
      'triage',
      '--sim=7',
      '--sim-firmware',
      '50.43.2.0',
      '--json',
      '--db',
      join(dir, 'triage-warn.db'),
      '--out',
      join(dir, 'triage-warn.json'),
      '--hr-seconds',
      '0',
      '--scan-seconds',
      '1',
    );
    expect(run.code).toBe(0);
    const snapshot = parseJson(run);
    expect(snapshot.state).toBe('open');
    expect(JSON.stringify(snapshot.warnings)).toContain('50.43 or later');
  });

  it('puts a wrong band clock in the verdict because sync will refuse', async () => {
    const run = await cli(
      'triage',
      '--sim=7',
      '--sim-clock-offset',
      '10800',
      '--json',
      '--db',
      join(dir, 'triage-clock.db'),
      '--out',
      join(dir, 'triage-clock.json'),
      '--hr-seconds',
      '0',
      '--scan-seconds',
      '1',
    );
    expect(run.code).toBe(0);
    const verdict = asRecord(parseJson(run).verdict);
    expect(verdict.label).toBe('OPEN');
    expect(verdict.clock).toEqual(expect.stringMatching(/^CLOCK OFF/));
    expect(verdict.line).toEqual(expect.stringContaining('`sync` will refuse'));
    expect(verdict.line).toEqual(expect.stringContaining('--ignore-clock'));
  });

  it('reaches no verdict but still finishes the independent steps when the bond is refused', async () => {
    const run = await cli(
      'triage',
      '--sim=7',
      '--sim-bond-refused',
      '--json',
      '--db',
      join(dir, 'triage-refused.db'),
      '--out',
      join(dir, 'triage-refused.json'),
      '--hr-seconds',
      '1',
      '--scan-seconds',
      '1',
    );
    expect(run.code).toBe(1);
    const snapshot = parseJson(run);
    const steps = asRecord(snapshot.steps);
    expect(asRecord(steps.deviceInformation).status).toBe('ok');
    expect(asRecord(steps.heartRate).status).toBe('ok');
    expect(asRecord(steps.bond).result).toBe('refused');
    expect(asRecord(steps.session).status).toBe('failed');
    expect(asRecord(steps.lockProbe).status).toBe('skipped');
    expect(snapshot.state).toBe('unknown');
    expect(run.stderr).toContain('pair the band in Windows Bluetooth settings');
    expect(run.stderr).toContain('NO VERDICT');
  });
});

describe('a simulated database', () => {
  const db = (): string => join(dir, 'sim.db');

  beforeAll(async () => {
    const run = await cli('sim', '--days', '3', '--seed', '7', '--db', db());
    expect(run.code, run.stderr).toBe(0);
  }, 120_000);

  it('lists three or more days', async () => {
    const run = await cli('days', '--json', '--db', db());
    expect(run.code).toBe(0);
    const days = parseJson(run).days;
    expect(Array.isArray(days)).toBe(true);
    expect((days as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  it('prints a readable table with the reason for a missing value', async () => {
    const run = await cli('days', '--last', '5', '--db', db());
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/Date\s+Readiness\s+Load\s+Sleep score\s+HRV ms\s+Resting HR\s+Slept/);
    expect(run.stdout).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('exports the database and one CSV per table', async () => {
    const target = join(dir, 'export');
    const run = await cli('export', '--dir', target, '--db', db(), '--json');
    expect(run.code, run.stderr).toBe(0);
    for (const name of [
      'openhoop.db',
      'devices.csv',
      'samples_1hz.csv',
      'daily_metrics.csv',
      'sleeps.csv',
      'workouts.csv',
      'events.csv',
      'console_log.csv',
      'raw_chunks.csv',
    ]) {
      expect(existsSync(join(target, name)), name).toBe(true);
    }
    const metrics = readFileSync(join(target, 'daily_metrics.csv'), 'utf8').trim().split('\r\n');
    expect(metrics[0]).toBe('device_id,day,readiness,load,sleep_score,record');
    expect(metrics.length).toBeGreaterThanOrEqual(4);
    const copy = await openStore(openNodeDriver(join(target, 'openhoop.db')));
    expect((await copy.listDevices()).length).toBe(1);
    await copy.driver.close();
  });

  it('rebuilds from the raw archive to the same day records', async () => {
    const before = parseJson(await cli('days', '--json', '--db', db()));
    const rebuild = await cli('recompute', '--rebuild', '--db', db());
    expect(rebuild.code, rebuild.stderr).toBe(0);
    const after = parseJson(await cli('days', '--json', '--db', db()));
    expect(after).toEqual(before);
  }, 120_000);

  it('stores and reads the profile', async () => {
    const saved = await cli('profile', '--birth-year', '1990', '--max-hr', '188', '--json', '--db', db());
    expect(saved.code).toBe(0);
    const read = parseJson(await cli('profile', '--json', '--db', db()));
    expect(read.profile).toEqual({ birthYear: 1990, maxHr: 188, restingHr: null });
    const bad = await cli('profile', '--max-hr', '400', '--db', db());
    expect(bad.code).toBe(2);
  });
});

describe.concurrent('sync', () => {
  it('refuses without an owner-since date and explains why', async () => {
    const run = await cli('sync', '--sim=7', '--db', join(dir, 'sync-refuse.db'));
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('owner-since');
    expect(run.stderr).toContain('previous owner');
    expect(run.stderr).toContain('discards them');
  });

  it('stores the owner-since date it is given and then syncs without the flag', async () => {
    const db = join(dir, 'sync-ok.db');
    const first = await cli('sync', '--sim=7', '--sim-days', '0', '--owner-since', '2020-01-01', '--json', '--db', db);
    expect(first.code, first.stderr).toBe(0);
    const store = await openStore(openNodeDriver(db));
    const [device] = await store.listDevices();
    expect(device?.ownerSince).toBe(Date.UTC(2020, 0, 1) / 1000 - -new Date(2020, 0, 1).getTimezoneOffset() * 60);
    await store.driver.close();
    const second = await cli('sync', '--sim=7', '--sim-days', '0', '--db', db);
    expect(second.code, second.stderr).toBe(0);
  }, 60_000);

  it('stops with clock when the band clock is 3 hours off, and explains what to do', async () => {
    const db = join(dir, 'sync-clock.db');
    const run = await cli('sync', '--sim=7', '--sim-days', '0', '--sim-clock-offset', '10800', '--owner-since', '2020-01-01', '--json', '--db', db);
    expect(run.code).toBe(1);
    expect(asRecord(parseJson(run).sync).stoppedBy).toBe('clock');
    expect(run.stderr).toMatch(/clock is off by 10[78]\d\d s/);
    expect(run.stderr).toContain('nothing was removed from it');
    expect(run.stderr).toContain('--ignore-clock');
    const store = await openStore(openNodeDriver(db));
    const [device] = await store.listDevices();
    expect(await store.listChunkIds(device?.id ?? -1)).toEqual([]);
    await store.driver.close();
  }, 60_000);

  it('syncs a band with a wrong clock under --ignore-clock and warns about it', async () => {
    const db = join(dir, 'sync-ignore-clock.db');
    const run = await cli(
      'sync',
      '--sim=7',
      '--sim-days',
      '0',
      '--sim-clock-offset',
      '10800',
      '--owner-since',
      '2020-01-01',
      '--ignore-clock',
      '--json',
      '--db',
      db,
    );
    expect(run.code, run.stderr).toBe(0);
    expect(asRecord(parseJson(run).sync)).toMatchObject({ stoppedBy: 'complete', discardedBeforeOwner: 0 });
    expect(run.stderr).toContain('records from before you owned the band may be stored');
  }, 60_000);

  it('rejects a malformed owner-since date', async () => {
    const run = await cli('sync', '--sim=7', '--owner-since', '31-01-2027', '--db', join(dir, 'sync-bad.db'));
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('--owner-since');
  });
});

describe.concurrent('decode', () => {
  it('prints a COMMAND frame for GET_HELLO', async () => {
    const run = await cli('decode', 'aa0108000001e67123019101363e5c8d');
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('COMMAND');
    expect(run.stdout).toContain('GET_HELLO');
  });

  it('names a charger status event from an MG band and prints what it decoded', async () => {
    const run = await cli('decode', 'aa011400010021b1303c7500fe65086b5118040001020000ba53f756');
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('CHARGER_STATUS_CHANGED (117)');
    expect(run.stdout).toContain('"chargerStatus":2');
  });

  it('reads hex lines from a file and reports a bad frame', async () => {
    const { writeFileSync } = await import('node:fs');
    const file = join(dir, 'frames.txt');
    writeFileSync(file, '# one good, one bad\naa0108000001e67123019101363e5c8d\naa0108000001e67123019101363e5c00\n');
    const run = await cli('decode', file, '--json');
    expect(run.code).toBe(1);
    const packets = parseJson(run).packets as unknown[];
    expect(packets.length).toBe(2);
    expect(JSON.stringify(packets[1])).toContain('INVALID FRAME');
  });
});

describe.concurrent('usage', () => {
  it('rejects unknown commands and options with exit code 2', async () => {
    expect((await cli('frobnicate')).code).toBe(2);
    expect((await cli('days', '--nope')).code).toBe(2);
    const stray = await cli('days', '--sim-locked');
    expect(stray.code).toBe(2);
    expect(stray.stderr).toContain('only works together with --sim');
  });

  it('prints help', async () => {
    const run = await cli('help');
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('triage');
    expect(run.stdout).toContain('UNTESTED until day 1');
    expect(run.stdout).toContain('--ignore-clock');
    expect(run.stdout).toContain('--sim-clock-offset');
  });

  it('keeps stdout to one JSON document even when the command fails', async () => {
    const run = await cli('days', '--json', '--db', join(dir, 'empty.db'));
    expect(run.code).toBe(1);
    expect(parseJson(run).error).toEqual(expect.stringContaining('no device'));
  });
});
