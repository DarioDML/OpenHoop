import {
  ActivityInputError,
  Session,
  bindActivityStore,
  bindStore,
  checkActivityInput,
  computeActivityMetrics,
  addStrengthSessionExercise,
  addStrengthSet,
  deleteCustomExercise,
  deleteStrengthSession,
  deleteStrengthSet,
  deleteStrengthTemplate,
  emptyStrengthData,
  finishStrengthSession,
  insertCustomExercise,
  listStrengthData,
  removeStrengthSessionExercise,
  saveStrengthTemplate,
  startStrengthSession,
  deleteBodyMeasurement,
  deleteJournalNote,
  deleteDataBefore,
  deleteLabResult,
  exportCsv,
  emptyVendorData,
  insertBodyMeasurement,
  insertJournalNote,
  insertLabResult,
  listBodyMeasurements,
  listJournalNotes,
  listLabResults,
  loadReference,
  listVendorData,
  clearPregnancy,
  deleteAllCycleData,
  deletePeriod,
  deleteSymptom,
  emptyCycleData,
  insertPeriod,
  loadCycleData,
  probeLock,
  readDeviceInformation,
  readKeys,
  recomputeDays,
  recordHeartRate,
  setPregnancy,
  syncHistory,
  validateSleepEdit,
  EDITED_SLEEP_MAX_S,
  MANUAL_NAP_MAX_S,
  updateBodyMeasurement,
  updateLabResult,
  type ActivityInput,
  type ActivityMetricsRecord,
  type ActivityRow,
  type ActivityStore,
  upsertVendorData,
  clearVendorData,
  updatePeriod,
  upsertSymptom,
  updateJournalNote,
  type BandModel,
  type BodyMeasurement,
  type BodyMeasurementInput,
  type JournalNote,
  type JournalNoteInput,
  type CycleData,
  type CustomExerciseInput,
  type PlannedExercise,
  type StrengthData,
  type StrengthSetInput,
  type StrengthTemplateInput,
  type DayRecord,
  type DeviceRow,
  type LabResult,
  type LabResultInput,
  type PeriodInput,
  type SleepEditRow,
  type VendorData,
  type SymptomInput,
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
import { planAlerts, reconcile, syncFailedAlert, type Alert, type DigestFacts, type InboxEntry } from '@/lib/notificationPlan';
import { alertText } from '@/lib/notificationText';
import { setNetworkPrefs } from '@/net';
import { strictestPrefs } from '@/net/features';

import { buildSnapshot, serializeSnapshot } from './bandConfig';
import { newestChanged } from './bodyComposition';
import { openAppStore, type AppStore } from './appStore';
import { addDays } from './derived';
import { AppError, toAppError } from './errors';
import { exportAll, removeLeftoverExports } from './exportData';
import {
  NOTIFICATION_STATE_KEY,
  emptyNotificationState,
  parseNotificationState,
  serializeNotificationState,
  type NotificationState,
} from './notificationState';
import { expoNotifier, type Notifier, type PermissionState } from './notifier';
import { otherSleepSpans, recomputeFrom, type SleepEditRequest } from './sleepEditForm';
import { parseVendorSources } from './vendorExport/sources';
import type { FileReport } from './vendorExport/parse';
import type { SourceFile } from './vendorExport/sources';
import { summariseImport, type VendorImportResult } from './vendorExport/summary';
import { USER_DATA_KEY, defaultUserData, parseUserData, serializeUserData, type UserData } from './userData';
import { SETTING_KEYS, parseDataSource, parseLanguage, parseProfile, serializeOptionalInteger } from './settingsCodec';
import type {
  ActivityDraft,
  AppData,
  ConnectionState,
  DataSource,
  DeleteTarget,
  DeviceStatus,
  DiscoveredBand,
  HeartRatePoint,
  LiveState,
  LockState,
  Notice,
  PendingDelete,
  Profile,
  Settings,
  SleepEditOutcome,
  StrengthActions,
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
export const UNDO_MS = 5_000;
const NO_METRICS: ActivityMetricsRecord = { activeS: 0, load: null, loadReason: 'no-data', zoneSeconds: [0, 0, 0, 0, 0, 0], avgHr: null, maxHr: null, hrSeconds: 0, activeMinutes: null };
const STOP_NOTICES: Readonly<Partial<Record<SyncStop, TranslationKey>>> = {
  clock: 'sync.stop.clock',
  corrupt: 'sync.stop.corrupt',
};

export interface Snapshot {
  ready: boolean;
  days: DayRecord[];
  sleepEdits: SleepEditRow[];
  device: DeviceStatus;
  live: LiveState;
  profile: Profile;
  settings: Settings;
  userData: UserData;
  bodyMeasurements: BodyMeasurement[];
  journalNotes: JournalNote[];
  labResults: LabResult[];
  vendorData: VendorData;
  cycle: CycleData;
  strength: StrengthData;
  syncProgress: SyncProgressView | null;
  notice: Notice | null;
  inbox: InboxEntry[];
  notificationPermission: PermissionState;
  activities: ActivityRow[];
  pendingDelete: PendingDelete | null;
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

const SYNC_FAILURES_NOT_ALERTED: ReadonlySet<TranslationKey> = new Set<TranslationKey>(['error.noBandPaired', 'error.ownerSinceMissing']);

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
    configSnapshot: null,
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
  private userDataChain: Promise<void> = Promise.resolve();
  private syncRun: Promise<void> | null = null;
  private liveAbort: AbortController | null = null;
  private liveRun: Promise<void> | null = null;
  private lastProgressAt = 0;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCreated = false;
  private started = false;
  private notificationState: NotificationState = emptyNotificationState();
  private notificationChain: Promise<void> = Promise.resolve();
  lastTimings: SyncTimings | null = null;

  constructor(private readonly notifier: Notifier = expoNotifier) {
    const language = detectLanguage(getLocales()[0]?.languageCode);
    this.snapshot = {
      ready: false,
      days: [],
      sleepEdits: [],
      device: emptyDevice(),
      live: IDLE_LIVE,
      profile: { birthYear: null, maxHeartRate: null },
      settings: { language, dataSource: 'demo', ownerSince: null },
      userData: defaultUserData(),
      bodyMeasurements: [],
      journalNotes: [],
      labResults: [],
      vendorData: emptyVendorData(),
      cycle: emptyCycleData(),
      strength: emptyStrengthData(),
      syncProgress: null,
      notice: null,
      inbox: [],
      notificationPermission: 'undetermined',
      activities: [],
      pendingDelete: null,
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
        configSnapshot: row?.configSnapshot ?? null,
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
    await this.activityStore().purgeDeleted(null);
    const language = parseLanguage(await store.getSetting(SETTING_KEYS.language)) ?? this.snapshot.settings.language;
    const dataSource = parseDataSource(await store.getSetting(SETTING_KEYS.dataSource));
    const profile = parseProfile(
      await store.getSetting(SETTING_KEYS.birthYear),
      await store.getSetting(SETTING_KEYS.maxHeartRate),
      new Date().getFullYear(),
    );
    const rawUserData = await store.getSetting(USER_DATA_KEY);
    const userData = parseUserData(rawUserData);
    if (rawUserData === null && (await store.listDevices()).length > 0) userData.onboardingDone = true;
    this.notificationState = parseNotificationState(await store.getSetting(NOTIFICATION_STATE_KEY));
    setNetworkPrefs(userData.network);
    const bodyMeasurements = await listBodyMeasurements(this.app.driver);
    const labResults = await listLabResults(this.app.driver);
    const vendorData = await listVendorData(this.app.driver);
    const cycle = await loadCycleData(this.app.driver);
    const strength = await listStrengthData(this.app.driver);
    const journalNotes = await listJournalNotes(this.app.driver);
    this.patch({
      settings: { ...this.snapshot.settings, language, dataSource },
      profile,
      userData,
      bodyMeasurements,
      journalNotes,
      labResults,
      vendorData,
      cycle,
      inbox: this.notificationState.inbox,
      strength,
    });
    await this.loadActiveDevice();
    this.patch({ ready: true });
    void this.refreshNotifications();
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
    const row = this.deviceRow;
    const days = row === null ? [] : await store.listDays(row.id, EARLIEST_DAY, LATEST_DAY);
    const sleepEdits = row === null ? [] : await store.listSleepEdits(row.id);
    const activities = row === null ? [] : await this.activityStore().list(row.id);
    this.patch({ days, sleepEdits, activities });
  }

  private activityStore(): ActivityStore {
    return bindActivityStore(this.requireApp().store.driver);
  }

  private async loadActivities(): Promise<void> {
    const activities = this.deviceRow === null ? [] : await this.activityStore().list(this.deviceRow.id);
    this.patch({ activities });
  }

  private async metricsFor(deviceId: number, input: ActivityInput, days: readonly DayRecord[]): Promise<ActivityMetricsRecord> {
    const year = new Date(input.start * 1000).getFullYear();
    const ref = loadReference(days, this.analyticsProfile(), input.start, year);
    return computeActivityMetrics(this.requireApp().store, deviceId, { start: input.start, end: input.end }, input.paused, ref);
  }

  private async refreshActivityMetrics(deviceId: number, from: number | null): Promise<void> {
    const { store } = this.requireApp();
    const activities = this.activityStore();
    const days = await store.listDays(deviceId, EARLIEST_DAY, LATEST_DAY);
    for (const row of await activities.list(deviceId)) {
      if (row.deletedAt !== null || (from !== null && row.end < from)) continue;
      await activities.setMetrics(row.id, await this.metricsFor(deviceId, row, days));
    }
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
    let failed = false;
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
      const appError = this.fail(error);
      failed = this.snapshot.settings.dataSource === 'band' && !SYNC_FAILURES_NOT_ALERTED.has(appError.key);
      throw appError;
    } finally {
      void this.refreshNotifications({ syncFailed: failed });
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
    await this.refreshActivityMetrics(deviceId, from);
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

  readBandConfig = async (): Promise<void> => {
    if (this.syncRun !== null || this.liveAbort !== null) {
      this.fail(new AppError('error.bandConfigBusy'));
      return;
    }
    try {
      await this.exclusive(async () => {
        const conn = await this.ensureConnection();
        const flags = await readKeys(conn.session, 'featureFlags');
        const config = await readKeys(conn.session, 'deviceConfig');
        if (flags.length + config.length === 0) throw new AppError('error.bandConfigEmpty');
        const snapshot = buildSnapshot(nowSeconds(), this.snapshot.settings.dataSource, flags, config);
        const row = this.deviceRow;
        if (row === null) throw new AppError('error.noBandPaired');
        this.deviceRow = await this.requireApp().store.upsertDevice({
          bleId: row.bleId,
          name: row.name,
          model: row.model,
          firmware: row.firmware,
          serial: row.serial,
          ownerSince: row.ownerSince,
          configSnapshot: serializeSnapshot(snapshot),
        });
        this.patchDevice();
      });
    } catch (error) {
      this.fail(error);
    }
  };

  stopLive = async (): Promise<void> => {
    await this.stopLiveInternal();
    this.patch({ live: IDLE_LIVE });
  };

  updateProfile = async (patch: Partial<Profile>): Promise<void> => {
    const { store } = this.requireApp();
    const before = this.snapshot.profile;
    const profile = { ...before, ...patch };
    await store.setSetting(SETTING_KEYS.birthYear, serializeOptionalInteger(profile.birthYear));
    await store.setSetting(SETTING_KEYS.maxHeartRate, serializeOptionalInteger(profile.maxHeartRate));
    this.patch({ profile });
    const deviceId = this.deviceRow?.id;
    const changed = profile.birthYear !== before.birthYear || profile.maxHeartRate !== before.maxHeartRate;
    if (deviceId === undefined || !changed) return;
    void this.exclusive(async () => {
      this.patch({ syncProgress: this.progressView('compute', 0, null, 0, 0) });
      try {
        await this.recompute(deviceId, null);
      } catch (error) {
        this.fail(error);
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
      void this.refreshNotifications();
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
    void this.refreshNotifications();
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

  updateUserData = (patch: Partial<UserData>): Promise<boolean> => {
    const run = this.userDataChain.then(async () => {
      const network = this.snapshot.userData.network;
      try {
        const { store } = this.requireApp();
        const next = parseUserData(serializeUserData({ ...this.snapshot.userData, ...patch }));
        setNetworkPrefs(strictestPrefs(network, next.network));
        await store.setSetting(USER_DATA_KEY, serializeUserData(next));
        setNetworkPrefs(next.network);
        this.patch({ userData: next });
        if (patch.notifications !== undefined) void this.refreshNotifications();
        return true;
      } catch (error) {
        setNetworkPrefs(network);
        this.fail(error);
        return false;
      }
    });
    this.userDataChain = run.then(() => undefined);
    return run;
  };

  private async applyBodyChange(before: readonly BodyMeasurement[]): Promise<void> {
    const { driver } = this.requireApp();
    const after = await listBodyMeasurements(driver);
    this.patch({ bodyMeasurements: after });
    const newest = newestChanged(before, after);
    if (newest !== null && newest.weightKg !== this.snapshot.userData.weightKg) {
      const next = parseUserData(serializeUserData({ ...this.snapshot.userData, weightKg: newest.weightKg }));
      await this.requireApp().store.setSetting(USER_DATA_KEY, serializeUserData(next));
      this.patch({ userData: next });
    }
  }

  private runBodyChange(task: (driver: AppStore['driver']) => Promise<boolean>): Promise<boolean> {
    const run = this.userDataChain.then(async () => {
      try {
        const { driver } = this.requireApp();
        const before = this.snapshot.bodyMeasurements;
        const done = await task(driver);
        await this.applyBodyChange(before);
        return done;
      } catch (error) {
        this.fail(error);
        return false;
      }
    });
    this.userDataChain = run.then(() => undefined);
    return run;
  }

  saveBodyMeasurement = (id: number | null, input: BodyMeasurementInput): Promise<boolean> =>
    this.runBodyChange(async (driver) => {
      if (id === null) {
        await insertBodyMeasurement(driver, input, nowSeconds());
        return true;
      }
      return updateBodyMeasurement(driver, id, input);
    });

  removeBodyMeasurement = (id: number): Promise<boolean> => this.runBodyChange((driver) => deleteBodyMeasurement(driver, id));

  private runLabChange(task: (driver: AppStore['driver']) => Promise<boolean>): Promise<boolean> {
    const run = this.userDataChain.then(async () => {
      try {
        const { driver } = this.requireApp();
        const done = await task(driver);
        this.patch({ labResults: await listLabResults(driver) });
        return done;
      } catch (error) {
        this.fail(error);
        return false;
      }
    });
    this.userDataChain = run.then(() => undefined);
    return run;
  }

  importVendorFiles = (files: SourceFile[], rejected: FileReport[]): Promise<VendorImportResult | null> => {
    const run = this.userDataChain.then(async () => {
      try {
        const { driver } = this.requireApp();
        const parsed = parseVendorSources(files);
        const written = await upsertVendorData(driver, parsed.data, nowSeconds());
        this.patch({ vendorData: await listVendorData(driver) });
        return summariseImport(parsed, written, rejected);
      } catch (error) {
        this.fail(error);
        return null;
      }
    });
    this.userDataChain = run.then(() => undefined);
    return run;
  };

  removeVendorData = (): Promise<boolean> => {
    const run = this.userDataChain.then(async () => {
      try {
        await clearVendorData(this.requireApp().driver);
        this.patch({ vendorData: emptyVendorData() });
        return true;
      } catch (error) {
        this.fail(error);
        return false;
      }
    });
    this.userDataChain = run.then(() => undefined);
    return run;
  };

  private runStrength<T>(task: (driver: AppStore['driver']) => Promise<T>, failed: T): Promise<T> {
    const run = this.userDataChain.then(async () => {
      try {
        const { driver } = this.requireApp();
        const result = await task(driver);
        this.patch({ strength: await listStrengthData(driver) });
        return result;
      } catch (error) {
        this.fail(error);
        return failed;
      }
    });
    this.userDataChain = run.then(() => undefined);
    return run;
  }

  private runCycleChange<T>(task: (driver: AppStore['driver']) => Promise<T>, fallback: T): Promise<T> {
    const run = this.userDataChain.then(async () => {
      try {
        const { driver } = this.requireApp();
        const result = await task(driver);
        this.patch({ cycle: await loadCycleData(driver) });
        return result;
      } catch (error) {
        this.fail(error);
        return fallback;
      }
    });
    this.userDataChain = run.then(() => undefined);
    return run;
  }

  saveLabResult = (id: number | null, input: LabResultInput): Promise<boolean> =>
    this.runLabChange(async (driver) => {
      if (id === null) {
        await insertLabResult(driver, input, nowSeconds());
        return true;
      }
      return updateLabResult(driver, id, input);
    });

  removeLabResult = (id: number): Promise<boolean> => this.runLabChange((driver) => deleteLabResult(driver, id));

  savePeriod = (id: number | null, input: PeriodInput): Promise<boolean> =>
    this.runCycleChange(async (driver) => {
      if (id === null) {
        await insertPeriod(driver, input, nowSeconds());
        return true;
      }
      return updatePeriod(driver, id, input);
    }, false);

  removePeriod = (id: number): Promise<boolean> => this.runCycleChange((driver) => deletePeriod(driver, id), false);

  saveSymptom = (input: SymptomInput): Promise<boolean> =>
    this.runCycleChange(async (driver) => {
      await upsertSymptom(driver, input, nowSeconds());
      return true;
    }, false);

  removeSymptom = (id: number): Promise<boolean> => this.runCycleChange((driver) => deleteSymptom(driver, id), false);

  savePregnancy = (dueDay: string): Promise<boolean> =>
    this.runCycleChange(async (driver) => {
      await setPregnancy(driver, dueDay, nowSeconds());
      return true;
    }, false);

  removePregnancy = (): Promise<boolean> => this.runCycleChange((driver) => clearPregnancy(driver), false);

  removeAllCycleData = (): Promise<boolean> =>
    this.runCycleChange(async (driver) => {
      await deleteAllCycleData(driver);
      return true;
    }, false);

  private readonly strengthActionSet: StrengthActions = this.strengthActions();

  private strengthActions(): StrengthActions {
    return {
      saveExercise: (input: CustomExerciseInput) =>
        this.runStrength(async (driver) => {
          await insertCustomExercise(driver, input, nowSeconds());
          return true;
        }, false),
      removeExercise: (id: number) => this.runStrength((driver) => deleteCustomExercise(driver, id), false),
      saveTemplate: (id: number | null, input: StrengthTemplateInput) =>
        this.runStrength((driver) => saveStrengthTemplate(driver, id, input, nowSeconds()), null),
      removeTemplate: (id: number) => this.runStrength((driver) => deleteStrengthTemplate(driver, id), false),
      startSession: (templateId: number | null, name: string, exercises: PlannedExercise[]) =>
        this.runStrength(async (driver) => {
          const open = this.snapshot.strength.sessions.find((session) => session.endedAt === null);
          if (open !== undefined) return open.id;
          const now = new Date(Date.now());
          const day = unixToIsoDate(Math.floor(now.getTime() / 1000), deviceTzOffsetS(now));
          return startStrengthSession(driver, { templateId, name, day, exercises }, nowSeconds());
        }, null),
      addSessionExercise: (sessionId: number, exercise: PlannedExercise) =>
        this.runStrength((driver) => addStrengthSessionExercise(driver, sessionId, exercise), false),
      removeSessionExercise: (id: number) => this.runStrength((driver) => removeStrengthSessionExercise(driver, id), false),
      logSet: (sessionId: number, input: StrengthSetInput) =>
        this.runStrength(async (driver) => (await addStrengthSet(driver, sessionId, input, nowSeconds())) !== null, false),
      removeSet: (id: number) => this.runStrength((driver) => deleteStrengthSet(driver, id), false),
      finishSession: (id: number) => this.runStrength((driver) => finishStrengthSession(driver, id, nowSeconds()), false),
      removeSession: (id: number) => this.runStrength((driver) => deleteStrengthSession(driver, id), false),
    };
  }

  private runNoteChange(task: (driver: AppStore['driver']) => Promise<boolean>): Promise<boolean> {
    const run = this.userDataChain.then(async () => {
      try {
        const { driver } = this.requireApp();
        const done = await task(driver);
        this.patch({ journalNotes: await listJournalNotes(driver) });
        return done;
      } catch (error) {
        this.fail(error);
        return false;
      }
    });
    this.userDataChain = run.then(() => undefined);
    return run;
  }

  saveJournalNote = (id: number | null, input: JournalNoteInput): Promise<boolean> =>
    this.runNoteChange(async (driver) => {
      if (id === null) {
        await insertJournalNote(driver, input, nowSeconds());
        return true;
      }
      return updateJournalNote(driver, id, input);
    });

  removeJournalNote = (id: number): Promise<boolean> => this.runNoteChange((driver) => deleteJournalNote(driver, id));

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

  private digestFacts(now: Date): (day: string) => DigestFacts | null {
    const byDay = new Map(this.snapshot.days.map((record) => [record.day, record]));
    return (day) => {
      const record = byDay.get(day);
      if (record === undefined) return null;
      const yesterday = byDay.get(addDays(day, -1));
      return {
        readiness: record.readiness.value,
        sleepScore: record.sleep.score.value,
        load: yesterday !== undefined && yesterday.end * 1000 <= now.getTime() ? yesterday.load.value : null,
      };
    };
  }

  private async saveNotificationState(state: NotificationState): Promise<void> {
    this.notificationState = state;
    await this.requireApp().store.setSetting(NOTIFICATION_STATE_KEY, serializeNotificationState(state));
    this.patch({ inbox: state.inbox });
  }

  private notificationTask(task: () => Promise<void>): Promise<void> {
    const run = this.notificationChain.then(task).catch(() => undefined);
    this.notificationChain = run;
    return run;
  }

  refreshNotifications = (options: { syncFailed?: boolean } = {}): Promise<void> =>
    this.notificationTask(async () => {
      if (this.app === null) return;
      const permission = await this.notifier.permission();
      const stillScheduled = await this.notifier.scheduledIds();
      const now = new Date();
      const { userData, settings } = this.snapshot;
      const prefs = userData.notifications;
      const delivered = permission === 'granted';
      const settled = reconcile(this.notificationState, now, delivered, stillScheduled);
      const active = prefs.enabled && delivered;
      const recentIds = [...settled.pending.map((alert) => alert.id), ...settled.sent];
      const failure = options.syncFailed === true ? syncFailedAlert(now, prefs, recentIds) : null;
      const fresh: Alert[] = failure === null ? [] : [failure];
      let pending = active
        ? planAlerts({
            now,
            prefs,
            pending: settled.pending,
            sent: settled.sent,
            factsFor: this.digestFacts(now),
            lastSyncAt: this.lastSyncAt === null ? null : this.lastSyncAt * 1000,
            watchBand: settings.dataSource === 'band' && this.deviceRow !== null,
            fresh,
          })
        : [];
      this.patch({ notificationPermission: permission });
      try {
        if (active) {
          const channel = translate(settings.language, 'notif.channel');
          const texts = pending.map((alert) => ({ id: alert.id, at: alert.at, ...alertText(settings.language, alert) }));
          await this.notifier.replaceAll(texts, channel, now.getTime());
        } else {
          await this.notifier.cancelAll();
        }
      } catch {
        pending = [];
        await this.notifier.cancelAll().catch(() => undefined);
      }
      await this.saveNotificationState({ ...settled, pending });
    });

  setNotificationsEnabled = async (enabled: boolean): Promise<PermissionState> => {
    if (!enabled) {
      await this.updateUserData({ notifications: { ...this.snapshot.userData.notifications, enabled: false } });
      return this.snapshot.notificationPermission;
    }
    const channel = translate(this.snapshot.settings.language, 'notif.channel');
    const permission = await this.notifier.request(channel).catch((): PermissionState => 'denied');
    this.patch({ notificationPermission: permission });
    if (permission === 'granted') await this.updateUserData({ notifications: { ...this.snapshot.userData.notifications, enabled: true } });
    return permission;
  };

  markInboxRead = (): Promise<void> =>
    this.notificationTask(async () => {
      if (this.app === null || this.notificationState.inbox.every((entry) => entry.read)) return;
      await this.saveNotificationState({
        ...this.notificationState,
        inbox: this.notificationState.inbox.map((entry) => ({ ...entry, read: true })),
      });
    });

  clearInbox = (): Promise<void> =>
    this.notificationTask(async () => {
      if (this.app === null) return;
      await this.saveNotificationState({ ...this.notificationState, inbox: [] });
    });

  private notificationsExport(): string {
    const { pending, inbox, sent } = this.notificationState;
    return JSON.stringify({ preferences: this.snapshot.userData.notifications, inbox, scheduled: pending, sent }, null, 2);
  }

  saveSleepEdit = (request: SleepEditRequest): Promise<SleepEditOutcome> =>
    this.exclusive(async () => {
      try {
        const row = this.deviceRow;
        if (row === null) throw new AppError('error.noBandPaired');
        const { sleepEdits, days } = this.snapshot;
        const problem = validateSleepEdit(request, otherSleepSpans(days, sleepEdits, request), nowSeconds());
        if (problem !== null) return problem;
        const previous = request.id === null ? null : (sleepEdits.find((e) => e.id === request.id) ?? null);
        await this.requireApp().store.saveSleepEdit({
          id: request.id,
          deviceId: row.id,
          targetOnset: request.targetOnset,
          targetOffset: request.targetOffset,
          onset: request.onset,
          offset: request.offset,
          createdAt: nowSeconds(),
        });
        await this.recompute(row.id, recomputeFrom(request, previous));
        return 'saved';
      } catch (error) {
        this.fail(error);
        return 'error';
      } finally {
        this.patch({ syncProgress: null });
      }
    });

  deleteSleepEdit = (id: number): Promise<boolean> =>
    this.exclusive(async () => {
      try {
        const row = this.deviceRow;
        const edit = this.snapshot.sleepEdits.find((e) => e.id === id) ?? null;
        if (row === null || edit === null) return false;
        if (!(await this.requireApp().store.deleteSleepEdit(row.id, id))) return false;
        await this.recompute(row.id, recomputeFrom(edit, null));
        return true;
      } catch (error) {
        this.fail(error);
        return false;
      } finally {
        this.patch({ syncProgress: null });
      }
    });

  saveActivity = (draft: ActivityDraft, id?: number): Promise<number | null> =>
    this.exclusive(async () => {
      try {
        const device = this.deviceRow;
        if (device === null) throw new AppError('activity.error.noBand');
        const input = checkActivityInput({ ...draft, deviceId: device.id });
        const metrics = await this.metricsFor(device.id, input, this.snapshot.days);
        const saved = await this.activityStore().save(input, metrics, nowSeconds(), id);
        if (input.source === 'live') {
          this.patch({ syncProgress: this.progressView('compute', 0, null, 0, 0) });
          try {
            await this.recompute(device.id, input.start);
          } finally {
            this.patch({ syncProgress: null });
          }
        } else {
          await this.loadActivities();
        }
        return saved.id;
      } catch (error) {
        this.fail(error instanceof ActivityInputError ? new AppError('activity.error.invalid') : error);
        return null;
      }
    });

  deleteActivity = (target: DeleteTarget): Promise<boolean> =>
    this.exclusive(async () => {
      try {
        await this.finishPendingDelete();
        const device = this.deviceRow;
        if (device === null) throw new AppError('activity.error.noBand');
        const activities = this.activityStore();
        const now = nowSeconds();
        let id: number;
        let created = false;
        if (target.kind === 'activity') {
          const row = await activities.get(target.id);
          if (row === null || row.deviceId !== device.id) throw new AppError('activity.error.missing');
          id = row.id;
        } else {
          const existing = await activities.findDetected(device.id, target.workout.start);
          if (existing !== null) {
            id = existing.id;
          } else {
            const w = target.workout;
            const draft: ActivityInput = { deviceId: device.id, source: 'auto', detectedStart: w.start, type: 'other', start: w.start, end: w.end, paused: [], note: null };
            id = (await activities.save(draft, NO_METRICS, now)).id;
            created = true;
          }
        }
        await activities.setDeleted(id, now, now);
        this.pendingCreated = created;
        this.pendingTimer = setTimeout(() => {
          void this.exclusive(() => (this.snapshot.pendingDelete?.id === id ? this.finishPendingDelete() : Promise.resolve())).catch((error: unknown) =>
            this.fail(error),
          );
        }, UNDO_MS);
        this.patch({ pendingDelete: { id, until: Date.now() + UNDO_MS } });
        await this.loadActivities();
        return true;
      } catch (error) {
        this.fail(error);
        return false;
      }
    });

  undoDelete = (): Promise<void> =>
    this.exclusive(async () => {
      const pending = this.snapshot.pendingDelete;
      if (pending === null) return;
      this.clearPendingTimer();
      try {
        const activities = this.activityStore();
        if (this.pendingCreated) await activities.remove(pending.id);
        else await activities.setDeleted(pending.id, null, nowSeconds());
        await this.loadActivities();
      } catch (error) {
        this.fail(error);
      } finally {
        this.pendingCreated = false;
        this.patch({ pendingDelete: null });
      }
    });

  private clearPendingTimer(): void {
    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
  }

  private async finishPendingDelete(): Promise<void> {
    this.clearPendingTimer();
    if (this.snapshot.pendingDelete === null) return;
    this.pendingCreated = false;
    this.patch({ pendingDelete: null });
    await this.activityStore().purgeDeleted(null);
    await this.loadActivities();
  }

  exportData = async (): Promise<void> => {
    const app = this.requireApp();
    try {
      await this.exclusive(() => exportAll(app, exportCsv, { 'notifications.json': this.notificationsExport() }));
    } catch (error) {
      this.fail(error);
    }
  };

  appData(): AppData {
    const snapshot = this.snapshot;
    return {
      ...snapshot,
      sleepEditLimits: { napMaxS: MANUAL_NAP_MAX_S, sleepMaxS: EDITED_SLEEP_MAX_S },
      scan: this.scan,
      pair: this.pair,
      sync: this.sync,
      startLive: this.startLive,
      readBandConfig: this.readBandConfig,
      stopLive: this.stopLive,
      exportData: this.exportData,
      updateProfile: this.updateProfile,
      updateSettings: this.updateSettings,
      updateUserData: this.updateUserData,
      saveBodyMeasurement: this.saveBodyMeasurement,
      removeBodyMeasurement: this.removeBodyMeasurement,
      saveJournalNote: this.saveJournalNote,
      removeJournalNote: this.removeJournalNote,
      saveLabResult: this.saveLabResult,
      removeLabResult: this.removeLabResult,
      importVendorFiles: this.importVendorFiles,
      removeVendorData: this.removeVendorData,
      savePeriod: this.savePeriod,
      removePeriod: this.removePeriod,
      saveSymptom: this.saveSymptom,
      removeSymptom: this.removeSymptom,
      savePregnancy: this.savePregnancy,
      removePregnancy: this.removePregnancy,
      removeAllCycleData: this.removeAllCycleData,
      strengthActions: this.strengthActionSet,
      heartRateBetween: this.heartRateBetween,
      saveSleepEdit: this.saveSleepEdit,
      deleteSleepEdit: this.deleteSleepEdit,
      saveActivity: this.saveActivity,
      deleteActivity: this.deleteActivity,
      undoDelete: this.undoDelete,
      clearNotice: this.clearNotice,
      refreshNotifications: this.refreshNotifications,
      setNotificationsEnabled: this.setNotificationsEnabled,
      markInboxRead: this.markInboxRead,
      clearInbox: this.clearInbox,
    };
  }
}
