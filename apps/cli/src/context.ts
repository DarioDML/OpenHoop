import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Profile } from '@stoop/analytics';
import { openStore } from '@stoop/core';
import type { Store, Transport } from '@stoop/core';
import { openNodeDriver } from '@stoop/core/node';
import { NobleTransport } from '@stoop/ble-node';
import { parseFirmware } from '@stoop/protocol';
import { SimBand } from '@stoop/sim';
import { UsageError } from './args';
import type { ParsedArgs } from './args';

export const DEFAULT_DB_PATH = './stoop-data/stoop.db';
export const BLUETOOTH_NOTICE = 'Bluetooth path: UNTESTED until day 1';
const PROFILE_KEY = 'profile';
const MAX_SEED = 2_147_483_647;

export interface SimSettings {
  seed: number;
  locked: boolean;
  firmware: string | undefined;
  days: number;
  bondRefused: boolean;
}

export interface TransportHandle {
  transport: Transport;
  sim: SimBand | null;
  dispose(): Promise<void>;
}

export interface Context {
  args: ParsedArgs;
  json: boolean;
  dbPath: string;
  sim: SimSettings | null;
  deviceSelector: string | undefined;
  tzOffsetS: number;
  log(line: string): void;
  nowMs(): number;
  store(): Promise<Store>;
  transport(overrides?: { historyDays?: number; seed?: number }): Promise<TransportHandle>;
  loadProfile(): Promise<Profile>;
  saveProfile(profile: Profile): Promise<void>;
  close(): Promise<void>;
}

export interface Sink {
  stdout(text: string): void;
  stderr(text: string): void;
}

function readSimSettings(args: ParsedArgs): SimSettings | null {
  const simulated = args.has('sim');
  const extras = ['sim-locked', 'sim-firmware', 'sim-days', 'sim-bond-refused'].filter((name) => args.has(name));
  if (!simulated) {
    if (extras.length > 0) throw new UsageError(`--${extras[0]} only works together with --sim`);
    return null;
  }
  const seed = args.int('sim', 0, MAX_SEED) ?? 1;
  const firmware = args.string('sim-firmware');
  if (firmware !== undefined && parseFirmware(firmware) === null) {
    throw new UsageError(`--sim-firmware must look like 50.38.1.0, got "${firmware}"`);
  }
  return {
    seed,
    locked: args.flag('sim-locked'),
    firmware,
    days: args.int('sim-days', 0, 30) ?? 1,
    bondRefused: args.flag('sim-bond-refused'),
  };
}

function resolveDbPath(args: ParsedArgs): string {
  const text = args.string('db') ?? DEFAULT_DB_PATH;
  if (text.length === 0 || text.includes('\0')) throw new UsageError('--db needs a file path');
  return text === ':memory:' ? text : resolve(text);
}

function parseProfile(text: string | null): Profile {
  const empty: Profile = { maxHr: null, birthYear: null, restingHr: null };
  if (text === null) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return empty;
  }
  if (typeof parsed !== 'object' || parsed === null) return empty;
  const candidate = parsed as Record<string, unknown>;
  const pick = (name: string): number | null => {
    const value = candidate[name];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  return { maxHr: pick('maxHr'), birthYear: pick('birthYear'), restingHr: pick('restingHr') };
}

export function createContext(args: ParsedArgs, sink: Sink): Context {
  const json = args.flag('json');
  const sim = readSimSettings(args);
  const dbPath = resolveDbPath(args);
  let opened: Store | null = null;
  const handles: TransportHandle[] = [];

  const context: Context = {
    args,
    json,
    dbPath,
    sim,
    deviceSelector: args.string('device'),
    tzOffsetS: -new Date().getTimezoneOffset() * 60,
    log: (line) => (json ? sink.stderr(`${line}\n`) : sink.stdout(`${line}\n`)),
    nowMs: () => Date.now(),

    async store() {
      if (opened !== null) return opened;
      if (dbPath !== ':memory:') await mkdir(dirname(dbPath), { recursive: true });
      opened = await openStore(openNodeDriver(dbPath));
      return opened;
    },

    async transport(overrides = {}) {
      if (sim === null) {
        const real = new NobleTransport();
        const handle: TransportHandle = { transport: real, sim: null, dispose: () => real.dispose() };
        handles.push(handle);
        return handle;
      }
      const band = new SimBand({
        seed: overrides.seed ?? sim.seed,
        now: () => Date.now() / 1000,
        historyDays: overrides.historyDays ?? sim.days,
        firmware: sim.firmware,
        locked: sim.locked,
        bondRefused: sim.bondRefused,
      });
      const handle: TransportHandle = { transport: band, sim: band, dispose: async () => undefined };
      handles.push(handle);
      return handle;
    },

    async loadProfile() {
      return parseProfile(await (await context.store()).getSetting(PROFILE_KEY));
    },

    async saveProfile(profile) {
      await (await context.store()).setSetting(PROFILE_KEY, JSON.stringify(profile));
    },

    async close() {
      for (const handle of handles) {
        try {
          await handle.transport.disconnect();
        } catch {
          continue;
        } finally {
          await handle.dispose().catch(() => undefined);
        }
      }
      if (opened !== null) {
        const store = opened;
        opened = null;
        await store.driver.close();
      }
    },
  };
  return context;
}
