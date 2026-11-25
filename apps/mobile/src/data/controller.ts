import {
  Session,
  bindStore,
  deleteDataBefore,
  exportCsv,
  probeLock,
  readDeviceInformation,
  recomputeDays,
  recordHeartRate,
  syncHistory,
  type BandModel,
  type DayRecord,
  type DeviceRow,
  type SyncProgress,
  type SyncStop,
  type Transport,
} from '@openhoop/core';
import { formatFirmware } from '@openhoop/protocol';
import { SimBand } from '@openhoop/sim';
import { getLocales } from 'expo-localization';

import { BleManagerTransport } from '@/ble/bleManagerTransport';
import { BleError } from '@/ble/errors';
import { detectLanguage, translate, type TranslationKey } from '@/i18n';
import { deviceTzOffsetS, isoDaysAgo, ownerSinceToUnix, unixToIsoDate } from '@/lib/dates';

import { openAppStore, type AppStore } from './appStore';
import { AppError, toAppError } from './errors';
import { exportAll, removeLeftoverExports } from './exportData';
import { USER_DATA_KEY, defaultUserData, parseUserData, serializeUserData, type UserData } from './userData';
import { SETTING_KEYS, parseDataSource, parseLanguage, parseProfile, serializeOptionalInteger } from './settingsCodec';
import type {
  AppData,
  ConnectionState,
  DataSource,
  DeviceStatus,
  DiscoveredBand,
  HeartRatePoint,
  LiveState,
  LockState,
  Notice,
  Profile,
  Settings,
  SyncProgressView,
} from './types';

export const DEMO_SEED = 20261125;
export const DEMO_BLE_ID = `sim:${DEMO_SEED}`;
export const DEMO_OWNER_SINCE_DAYS = 10;
export const DEMO_HISTORY_DAYS = 1;
const DAY_S = 86_400;
const SCAN_MS = 6_000;
const PROGRESS_INTERVAL_MS = 250;
const EARLIEST_DAY = '0000-01-01';
const LATEST_DAY = '9999-12-31';
const INCREMENTAL_RECOMPUTE_BACK_S = 2 * DAY_S;
const MAX_DEMO_BACKLOG_DAYS = 20;
const STOP_NOTICES: Readonly<Partial<Record<SyncStop, TranslationKey>>> = {
  clock: 'sync.stop.clock',
  corrupt: 'sync.stop.corrupt',
};

export interface Snapshot {
  ready: boolean;
  days: DayRecord[];
  device: DeviceStatus;
  live: LiveState;
  profile: Profile;
  settings: Settings;
  userData: UserData;
  syncProgress: SyncProgressView | null;
  notice: Notice | null;
}

interface Connection {
  transport: Transport;
  session: Session;
  deviceId: number;
}

export interface SyncTimings {
  transferMs: number;
  computeMs: number;
  samples: number;
  chunks: number;
}

const IDLE_LIVE: LiveState = { active: false, heartRate: null, lastRrMs: null, updatedAt: null };

function emptyDevice(): DeviceStatus {
  return {
    name: null,
    model: null,
    firmware: null,
    batteryPercent: null,
    lastSyncAt: null,
    backlogPages: null,
    lockState: 'unknown',
    connection: 'disconnected',
  };
}

function toModel(text: string | null): BandModel | null {
  if (text === null) return null;
  if (/MG/i.test(text)) return 'MG';
  if (/5\.0/.test(text)) return '5.0';
  return null;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export class AppController {
  private snapshot: Snapshot;
  private readonly listeners = new Set<() => void>();
  private app: AppStore | null = null;
  private deviceRow: DeviceRow | null = null;
  private conn: Connection | null = null;
  private demoBand: SimBand | null = null;
  private bleTransport: BleManagerTransport | null = null;
  private lockState: LockState = 'unknown';
  private connection: ConnectionState = 'disconnected';
  private battery: number | null = null;
  private backlogPages: number | null = null;
  private lastSyncAt: number | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private syncRun: Promise<void> | null = null;
  private liveAbort: AbortController | null = null;
  private liveRun: Promise<void> | null = null;
  private lastProgressAt = 0;
  private started = false;
  lastTimings: SyncTimings | null = null;

  constructor() {
    const language = detectLanguage(getLocales()[0]?.languageCode);
    this.snapshot = {
      ready: false,
      days: [],
      device: emptyDevice(),
      live: IDLE_LIVE,
      profile: { birthYear: null, maxHeartRate: null },
      settings: { language, dataSource: 'demo', ownerSince: null },
      userData: defaultUserData(),
      syncProgress: null,
      notice: null,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): Snapshot => this.snapshot;

  private patch(change: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of [...this.listeners]) listener();
  }

  private patchDevice(): void {
    const row = this.deviceRow;
    const source = this.snapshot.settings.dataSource;
    const language = this.snapshot.settings.language;
    this.patch({
      device: {
        name: source === 'demo' ? translate(language, 'band.demoName') : (row?.name ?? null),
        model: row?.model ?? null,
        firmware: row?.firmware ?? null,
        batteryPercent: this.battery,
        lastSyncAt: this.lastSyncAt,
        backlogPages: this.backlogPages,
        lockState: this.lockState,
        connection: this.connection,
      },
    });
  }

  private setConnection(state: ConnectionState): void {
    this.connection = state;
    this.patchDevice();
  }

  private fail(error: unknown): AppError {
    const appError = toAppError(error);
    this.patch({ notice: { key: appError.key, params: appError.params } });
    return appError;
  }

  clearNotice = (): void => {
    this.patch({ notice: null });
  };

  private requireApp(): AppStore {
    if (this.app === null) throw new AppError('error.storage');
    return this.app;
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.catch(() => undefined);
    return run;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      removeLeftoverExports();
    } catch {
      // a leftover export is removed again before the next export
    }
    try {
      this.app = await openAppStore();
    } catch (error) {
      this.patch({ ready: true });
      this.fail(error instanceof AppError ? error : new AppError('error.storage', undefined, { cause: error }));
      return;
    }
    const { store } = this.app;
    const language = parseLanguage(await store.getSetting(SETTING_KEYS.language)) ?? this.snapshot.settings.language;
    const dataSource = parseDataSource(await store.getSetting(SETTING_KEYS.dataSource));
    const profile = parseProfile(
      await store.getSetting(SETTING_KEYS.birthYear),
      await store.getSetting(SETTING_KEYS.maxHeartRate),
      new Date().getFullYear(),
    );
    const userData = parseUserData(await store.getSetting(USER_DATA_KEY));
    this.patch({ settings: { ...this.snapshot.settings, language, dataSource }, profile, userData });
    await this.loadActiveDevice();
    this.patch({ ready: true });
    if (dataSource === 'demo') void this.sync();
  }

  private async activeBleId(): Promise<string | null> {
    if (this.snapshot.settings.dataSource === 'demo') return DEMO_BLE_ID;
    return this.requireApp().store.getSetting(SETTING_KEYS.bandBleId);
  }

  private async loadActiveDevice(): Promise<void> {
    const { store } = this.requireApp();
    const bleId = await this.activeBleId();
    const rows = await store.listDevices();
    this.deviceRow = rows.find((row) => row.bleId === bleId) ?? null;
    this.lockState = 'unknown';
    this.battery = null;
    this.backlogPages = null;
    this.lastSyncAt = null;
    let ownerSince: string | null = null;
    if (this.deviceRow !== null) {
      const state = await store.getSyncState(this.deviceRow.id);
      this.lastSyncAt = state?.lastSyncAt ?? null;
      const savedLock = await store.getSetting(this.lockKey(this.deviceRow.id));
      if (savedLock === 'open' || savedLock === 'locked' || savedLock === 'no-data') this.lockState = savedLock;
      if (this.deviceRow.ownerSince !== null) {
        ownerSince = unixToIsoDate(this.deviceRow.ownerSince, deviceTzOffsetS(new Date()));
      }
    }
    this.patch({ settings: { ...this.snapshot.settings, ownerSince } });
    this.patchDevice();
    await this.refreshDays();
  }

  private lockKey(deviceId: number): string {
    return `lock.${deviceId}`;
  }

  private async refreshDays(): Promise<void> {
    const { store } = this.requireApp();
    const days =
      this.deviceRow === null ? [] : await store.listDays(this.deviceRow.id, EARLIEST_DAY, LATEST_DAY);
    this.patch({ days });
  }

  private analyticsProfile(): { maxHr: number | null; birthYear: number | null; restingHr: number | null } {
    const { birthYear, maxHeartRate } = this.snapshot.profile;
    return { maxHr: maxHeartRate, birthYear, restingHr: null };
  }

  private createDemoBand(newestSampleT: number | null): SimBand {
    const nowS = nowSeconds();
    const earliest = nowS - MAX_DEMO_BACKLOG_DAYS * DAY_S;
    const wanted =
      newestSampleT === null ? nowS - DEMO_HISTORY_DAYS * DAY_S + 1 : Math.max(newestSampleT + 1, earliest);
    const historyDays = (nowS - wanted + 1.5) / DAY_S;
    return new SimBand({ seed: DEMO_SEED, now: () => Date.now() / 1000, historyDays });
  }

  private async transportFor(source: DataSource): Promise<Transport> {
    if (source === 'demo') {
      if (this.demoBand === null) {
        const { store } = this.requireApp();
        const state = this.deviceRow === null ? null : await store.getSyncState(this.deviceRow.id);
        this.demoBand = this.createDemoBand(state?.newestSampleT ?? null);
      }
      return this.demoBand;
    }
    if (this.bleTransport === null) this.bleTransport = new BleManagerTransport();
    return this.bleTransport;
  }

  private async dropConnection(): Promise<void> {
    const conn = this.conn;
    this.conn = null;
    if (conn === null) return;
    try {
      await conn.session.close();
      await conn.transport.disconnect();
    } catch {
      // the link is already gone
    }
  }

  private async openConnection(bleId: string, ownerSinceUnix: number | null): Promise<Connection> {
    const { store } = this.requireApp();
    const source = this.snapshot.settings.dataSource;
    const existing = (await store.listDevices()).find((row) => row.bleId === bleId) ?? null;
    const ownerSince = ownerSinceUnix ?? existing?.ownerSince ?? null;
    if (source === 'band' && ownerSince === null) throw new AppError('error.ownerSinceMissing');
    this.setConnection('connecting');
    const transport = await this.transportFor(source);
    try {
      await transport.connect(bleId);
      if ((await transport.bond()) === 'refused') throw new BleError('bond-refused');
      const info = await readDeviceInformation(transport);
      const session = new Session(transport, { now: () => Date.now() });
      const hello = await session.open();
      const row = await store.upsertDevice({
        bleId,
        name: source === 'demo' ? 'WHOOP SIM' : (info.model ?? existing?.name ?? null),
        model: toModel(info.model) ?? existing?.model ?? null,
        firmware: formatFirmware(hello.firmware),
        serial: info.serial ?? existing?.serial ?? null,
        ownerSince,
        configSnapshot: existing?.configSnapshot ?? null,
      });
      this.deviceRow = row;
      if (row.ownerSince !== null) {
        const ownerSinceIso = unixToIsoDate(row.ownerSince, deviceTzOffsetS(new Date()));
        this.patch({ settings: { ...this.snapshot.settings, ownerSince: ownerSinceIso } });
      }
      session.onDisconnect(() => {
        if (this.conn?.session === session) this.conn = null;
        this.connection = 'disconnected';
        this.patchDevice();
      });
      const conn: Connection = { transport, session, deviceId: row.id };
      this.conn = conn;
      this.battery = await session.battery().catch(() => hello.batteryPercent);
      this.setConnection('connected');
      return conn;
    } catch (error) {
      this.conn = null;
      try {
        await transport.disconnect();
      } catch {
        // nothing to clean up
      }
      this.setConnection('disconnected');
      throw error;
    }
  }

  private async ensureConnection(): Promise<Connection> {
    if (this.conn !== null && this.conn.session.isConnected) return this.conn;
    await this.dropConnection();
    const bleId = await this.activeBleId();
    if (bleId === null) throw new AppError('error.noBandPaired');
    const ownerSince =
      this.deviceRow === null && this.snapshot.settings.dataSource === 'demo'
        ? (ownerSinceToUnix(isoDaysAgo(nowSeconds(), DEMO_OWNER_SINCE_DAYS, deviceTzOffsetS(new Date())), deviceTzOffsetS(new Date())))
        : null;
    const conn = await this.openConnection(bleId, ownerSince);
    await this.probe(conn);
    return conn;
  }

  private async probe(conn: Connection): Promise<void> {
    this.patch({ syncProgress: this.progressView('probing', 0, null, 0, 0) });
    try {
      const result = await probeLock(conn.session);
      this.lockState = result.state;
      await this.requireApp().store.setSetting(this.lockKey(conn.deviceId), result.state);
      this.backlogPages = result.pagesBehind;
    } finally {
      this.patch({ syncProgress: null });
      this.patchDevice();
    }
  }

  private progressView(
    phase: SyncProgressView['phase'],
    chunks: number,
    percent: number | null,
    daysDone: number,
    daysTotal: number,
  ): SyncProgressView {
    return { phase, chunks, percent, daysDone, daysTotal };
  }

  sync = (): Promise<void> => {
    if (this.syncRun !== null) return this.syncRun;
    const run = this.exclusive(() => this.runSync()).then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      this.syncRun = null;
    });
    this.syncRun = run;
    return run;
  };

  private async runSync(): Promise<void> {
    await this.stopLiveInternal();
    const { store } = this.requireApp();
    try {
      this.patch({ notice: null, syncProgress: this.progressView('connecting', 0, null, 0, 0) });
      await this.requireOwnerSince();
      const conn = await this.ensureConnection();
      const deviceId = conn.deviceId;
      const before = await store.getSyncState(deviceId);
      const previousNewest = before?.newestSampleT ?? null;
      let backlogRecords: number | null = null;
      try {
        const range = await conn.session.dataRange();
        this.backlogPages = range.pagesBehind;
        backlogRecords = range.pagesBehind === null ? null : range.pagesBehind * 14;
      } catch {
        backlogRecords = null;
      }
      this.setConnection('syncing');
      const startedAt = Date.now();
      this.patch({ syncProgress: this.progressView('transfer', 0, 0, 0, 0) });
      const result = await syncHistory(conn.session, store, {
        deviceId,
        onProgress: (progress) => this.onTransferProgress(progress, backlogRecords),
      });
      const transferMs = Date.now() - startedAt;
      if (result.stoppedBy === 'locked') {
        this.lockState = 'locked';
        await store.setSetting(this.lockKey(deviceId), 'locked');
      } else if (result.stoppedBy === 'complete') {
        this.backlogPages = 0;
      }
      const computeStarted = Date.now();
      await this.recompute(deviceId, previousNewest === null ? null : previousNewest - INCREMENTAL_RECOMPUTE_BACK_S);
      const computeMs = Date.now() - computeStarted;
      const after = await store.getSyncState(deviceId);
      this.lastSyncAt = after?.lastSyncAt ?? this.lastSyncAt;
      this.lastTimings = { transferMs, computeMs, samples: result.samples, chunks: result.chunks };
      if (__DEV__) console.log(`openhoop sync timings: ${JSON.stringify(this.lastTimings)}`);
      if (conn.session.isConnected) this.battery = await conn.session.battery().catch(() => this.battery);
      if (result.stoppedBy === 'disconnect') throw new AppError('error.disconnected');
      const stopNotice = STOP_NOTICES[result.stoppedBy];
      if (stopNotice !== undefined) throw new AppError(stopNotice);
    } catch (error) {
      throw this.fail(error);
    } finally {
      if (this.connection === 'syncing') this.connection = this.conn?.session.isConnected === true ? 'connected' : 'disconnected';
      this.patch({ syncProgress: null });
      this.patchDevice();
    }
  }

  private async requireOwnerSince(): Promise<void> {
    if (this.snapshot.settings.dataSource !== 'band') return;
    const bleId = await this.activeBleId();
    if (bleId === null) return;
    const row = (await this.requireApp().store.listDevices()).find((device) => device.bleId === bleId) ?? null;
    if (row !== null && row.ownerSince === null) throw new AppError('error.ownerSinceMissing');
  }

  private onTransferProgress(progress: SyncProgress, backlogRecords: number | null): void {
    const now = Date.now();
    if (now - this.lastProgressAt < PROGRESS_INTERVAL_MS) return;
    this.lastProgressAt = now;
    const processed = progress.frames + progress.discardedBeforeOwner;
    const percent =
      backlogRecords === null || backlogRecords === 0 ? null : Math.min(99, Math.floor((processed / backlogRecords) * 100));
    this.patch({ syncProgress: this.progressView('transfer', progress.chunks, percent, 0, 0) });
  }

  private async recompute(deviceId: number, from: number | null): Promise<void> {
    const { store } = this.requireApp();
    this.patch({ syncProgress: this.progressView('compute', this.snapshot.syncProgress?.chunks ?? 0, null, 0, 0) });
    await recomputeDays(store, {
      deviceId,
      from: from ?? 0,
      to: Number.MAX_SAFE_INTEGER,
      profile: this.analyticsProfile(),
      tzOffsetS: deviceTzOffsetS(new Date()),
    });
    await this.refreshDays();
  }

  scan = async (): Promise<DiscoveredBand[]> => {
    try {
      const source = this.snapshot.settings.dataSource;
      const transport = await this.transportFor(source);
      const found = await transport.scan(SCAN_MS);
      return found.map((device) => ({ id: device.id, name: device.name ?? device.id, rssi: device.rssi ?? 0 }));
    } catch (error) {
      throw toAppError(error);
    }
  };

  pair = (bandId: string, ownerSince: string): Promise<void> =>
    this.exclusive(async () => {
      const tz = deviceTzOffsetS(new Date());
      const ownerSinceUnix = ownerSinceToUnix(ownerSince, tz);
      if (ownerSinceUnix === null) throw new AppError('pairing.sinceInvalid');
      const { store } = this.requireApp();
      await this.stopLiveInternal();
      await this.dropConnection();
      try {
        const conn = await this.openConnection(bandId, ownerSinceUnix);
        if (this.snapshot.settings.dataSource === 'band') await store.setSetting(SETTING_KEYS.bandBleId, bandId);
        await this.loadActiveDevice();
        await this.probe(conn);
      } catch (error) {
        throw toAppError(error);
      }
    });

  private async stopLiveInternal(): Promise<void> {
    const abort = this.liveAbort;
    if (abort === null) return;
    abort.abort();
    try {
      await this.liveRun;
    } catch {
      // the recorder already reported its failure through the live state
    }
  }

  startLive = async (): Promise<void> => {
    if (this.liveAbort !== null) return;
    if (this.syncRun !== null) {
      this.fail(new AppError('error.busySyncing'));
      return;
    }
    const abort = new AbortController();
    this.liveAbort = abort;
    try {
      const conn = await this.exclusive(() => this.ensureConnection());
      const { store } = this.requireApp();
      this.patch({ live: { active: true, heartRate: null, lastRrMs: null, updatedAt: null } });
      this.liveRun = recordHeartRate(conn.transport, store, {
        deviceId: conn.deviceId,
        signal: abort.signal,
        onBeat: (heartRate, rrMs) =>
          this.patch({
            live: { active: true, heartRate, lastRrMs: rrMs[rrMs.length - 1] ?? null, updatedAt: Date.now() },
          }),
      }).then(
        () => undefined,
        (error: unknown) => {
          this.fail(error);
        },
      );
      void this.liveRun.finally(() => {
        if (this.liveAbort === abort) this.liveAbort = null;
        this.patch({ live: IDLE_LIVE });
      });
    } catch (error) {
      this.liveAbort = null;
      this.patch({ live: IDLE_LIVE });
      this.fail(error);
    }
  };

  stopLive = async (): Promise<void> => {
    await this.stopLiveInternal();
    this.patch({ live: IDLE_LIVE });
  };

  updateProfile = async (patch: Partial<Profile>): Promise<void> => {
    const { store } = this.requireApp();
    const profile = { ...this.snapshot.profile, ...patch };
    await store.setSetting(SETTING_KEYS.birthYear, serializeOptionalInteger(profile.birthYear));
    await store.setSetting(SETTING_KEYS.maxHeartRate, serializeOptionalInteger(profile.maxHeartRate));
    this.patch({ profile });
    const deviceId = this.deviceRow?.id;
    if (deviceId === undefined) return;
    await this.exclusive(async () => {
      this.patch({ syncProgress: this.progressView('compute', 0, null, 0, 0) });
      try {
        await this.recompute(deviceId, null);
      } catch (error) {
        throw this.fail(error);
      } finally {
        this.patch({ syncProgress: null });
      }
    });
  };

  updateSettings = async (patch: Partial<Settings>): Promise<void> => {
    const { store } = this.requireApp();
    const current = this.snapshot.settings;
    if (patch.language !== undefined && patch.language !== current.language) {
      await store.setSetting(SETTING_KEYS.language, patch.language);
      this.patch({ settings: { ...this.snapshot.settings, language: patch.language } });
      this.patchDevice();
    }
    if (patch.ownerSince !== undefined && patch.ownerSince !== null && patch.ownerSince !== current.ownerSince) {
      await this.changeOwnerSince(patch.ownerSince);
    }
    if (patch.dataSource !== undefined && patch.dataSource !== current.dataSource) {
      await this.switchSource(patch.dataSource);
    }
  };

  private async changeOwnerSince(iso: string): Promise<void> {
    const unix = ownerSinceToUnix(iso, deviceTzOffsetS(new Date()));
    const row = this.deviceRow;
    if (unix === null || row === null) {
      this.patch({ settings: { ...this.snapshot.settings, ownerSince: iso } });
      return;
    }
    const { store } = this.requireApp();
    const later = row.ownerSince === null || unix > row.ownerSince;
    await this.exclusive(async () => {
      try {
        this.deviceRow = await store.driver.transaction(async (tx) => {
          const inner = bindStore(tx);
          const updated = await inner.upsertDevice({ ...row, ownerSince: unix });
          if (later) await deleteDataBefore(inner, row.id, unix);
          return updated;
        });
        this.patch({ settings: { ...this.snapshot.settings, ownerSince: iso } });
        if (later) {
          this.patch({ syncProgress: this.progressView('compute', 0, null, 0, 0) });
          await this.recompute(row.id, null);
        }
      } catch (error) {
        throw this.fail(error);
      } finally {
        this.patch({ syncProgress: null });
      }
    });
  }

  private async switchSource(source: DataSource): Promise<void> {
    const { store } = this.requireApp();
    await this.stopLiveInternal();
    await this.exclusive(async () => {
      await this.dropConnection();
      await store.setSetting(SETTING_KEYS.dataSource, source);
      this.patch({ settings: { ...this.snapshot.settings, dataSource: source }, notice: null });
      this.connection = 'disconnected';
      await this.loadActiveDevice();
    });
    if (source === 'demo') {
      void this.sync();
      return;
    }
    try {
      const transport = await this.transportFor('band');
      if (transport instanceof BleManagerTransport) await transport.prepare();
      if ((await this.activeBleId()) === null) this.fail(new AppError('error.noBandPaired'));
    } catch (error) {
      this.fail(error);
    }
  }

  updateUserData = async (patch: Partial<UserData>): Promise<void> => {
    const { store } = this.requireApp();
    const next = parseUserData(serializeUserData({ ...this.snapshot.userData, ...patch }));
    await store.setSetting(USER_DATA_KEY, serializeUserData(next));
    this.patch({ userData: next });
  };

  heartRateBetween = async (fromS: number, toS: number, bucketS = 60): Promise<HeartRatePoint[]> => {
    const row = this.deviceRow;
    if (this.app === null || row === null || toS <= fromS) return [];
    const samples = await this.app.store.samplesBetween(row.id, fromS, toS);
    const buckets = new Map<number, { sum: number; count: number }>();
    for (const sample of samples) {
      if (sample.hr === null || sample.hr <= 0) continue;
      const key = Math.floor(sample.t / bucketS) * bucketS;
      const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
      bucket.sum += sample.hr;
      bucket.count += 1;
      buckets.set(key, bucket);
    }
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => ({ t, hr: b.sum / b.count }));
  };

  exportData = async (): Promise<void> => {
    const app = this.requireApp();
    try {
      await this.exclusive(() => exportAll(app, exportCsv));
    } catch (error) {
      this.fail(error);
    }
  };

  appData(): AppData {
    const snapshot = this.snapshot;
    return {
      ...snapshot,
      scan: this.scan,
      pair: this.pair,
      sync: this.sync,
      startLive: this.startLive,
      stopLive: this.stopLive,
      exportData: this.exportData,
      updateProfile: this.updateProfile,
      updateSettings: this.updateSettings,
      updateUserData: this.updateUserData,
      heartRateBetween: this.heartRateBetween,
      clearNotice: this.clearNotice,
    };
  }
}
