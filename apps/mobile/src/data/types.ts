import type { Interval } from '@openhoop/analytics';
import type { ActivityRow, ActivitySource, BandModel, BodyMeasurement, BodyMeasurementInput, CustomExerciseInput, CycleData, DayRecord, JournalNote, JournalNoteInput, LabResult, LabResultInput, PeriodInput, PlannedExercise, SleepEditProblem, SleepEditRow, StrengthData, StrengthSetInput, StrengthTemplateInput, SymptomInput, VendorData, WorkoutRecord } from '@openhoop/core';

import type { TranslationKey, TranslationParams } from '@/i18n';
import type { HcDataType } from '@/lib/healthConnectMapping';
import type { InboxEntry } from '@/lib/notificationPlan';

import type { HcAvailability } from './healthConnectApi';
import type { HealthConnectState } from './healthConnectState';
import type { PermissionState } from './notifier';

import type { SleepEditRequest } from './sleepEditForm';
import type { UserData } from './userData';
import type { FileReport } from './vendorExport/parse';
import type { SourceFile } from './vendorExport/sources';
import type { VendorImportResult } from './vendorExport/summary';

export type Language = 'nl' | 'en';
export type DataSource = 'demo' | 'band';
export type LockState = 'open' | 'locked' | 'no-data' | 'unknown';
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'syncing';

export interface DeviceStatus {
  name: string | null;
  model: BandModel | null;
  firmware: string | null;
  batteryPercent: number | null;
  lastSyncAt: number | null;
  backlogPages: number | null;
  lockState: LockState;
  connection: ConnectionState;
  configSnapshot: string | null;
}

export interface LiveState {
  active: boolean;
  heartRate: number | null;
  lastRrMs: number | null;
  updatedAt: number | null;
}

export interface Profile {
  birthYear: number | null;
  maxHeartRate: number | null;
}

export interface Settings {
  language: Language;
  dataSource: DataSource;
  ownerSince: string | null;
}

export interface DiscoveredBand {
  id: string;
  name: string;
  rssi: number;
}

export type SyncPhase = 'connecting' | 'probing' | 'transfer' | 'compute';

export interface SyncProgressView {
  phase: SyncPhase;
  chunks: number;
  percent: number | null;
  daysDone: number;
  daysTotal: number;
}

export interface Notice {
  key: TranslationKey;
  params?: TranslationParams;
}

export interface HeartRatePoint {
  t: number;
  hr: number;
}

export interface ActivityDraft {
  source: ActivitySource;
  detectedStart: number | null;
  type: string;
  start: number;
  end: number;
  paused: Interval[];
  note: string | null;
}

export type DeleteTarget = { kind: 'activity'; id: number } | { kind: 'detected'; workout: WorkoutRecord };

export interface PendingDelete {
  id: number;
  until: number;
}

export type SleepEditOutcome = 'saved' | SleepEditProblem | 'error';

export interface SleepEditLimits {
  napMaxS: number;
  sleepMaxS: number;
}

export interface StrengthActions {
  saveExercise(input: CustomExerciseInput): Promise<boolean>;
  removeExercise(id: number): Promise<boolean>;
  saveTemplate(id: number | null, input: StrengthTemplateInput): Promise<number | null>;
  removeTemplate(id: number): Promise<boolean>;
  startSession(templateId: number | null, name: string, exercises: PlannedExercise[]): Promise<number | null>;
  addSessionExercise(sessionId: number, exercise: PlannedExercise): Promise<boolean>;
  removeSessionExercise(id: number): Promise<boolean>;
  logSet(sessionId: number, input: StrengthSetInput): Promise<boolean>;
  removeSet(id: number): Promise<boolean>;
  finishSession(id: number): Promise<boolean>;
  removeSession(id: number): Promise<boolean>;
}

export interface HealthConnectView {
  availability: HcAvailability | 'checking';
  granted: string[];
  state: HealthConnectState;
  syncing: boolean;
}

export interface AppData {
  ready: boolean;
  days: DayRecord[];
  sleepEdits: SleepEditRow[];
  sleepEditLimits: SleepEditLimits;
  device: DeviceStatus;
  live: LiveState;
  profile: Profile;
  settings: Settings;
  userData: UserData;
  bodyMeasurements: BodyMeasurement[];
  labResults: LabResult[];
  cycle: CycleData;
  strength: StrengthData;
  strengthActions: StrengthActions;
  journalNotes: JournalNote[];
  vendorData: VendorData;
  syncProgress: SyncProgressView | null;
  notice: Notice | null;
  inbox: InboxEntry[];
  notificationPermission: PermissionState;
  healthConnect: HealthConnectView;
  activities: ActivityRow[];
  pendingDelete: PendingDelete | null;
  scan(): Promise<DiscoveredBand[]>;
  pair(bandId: string, ownerSince: string): Promise<void>;
  sync(): Promise<void>;
  startLive(): Promise<void>;
  readBandConfig(): Promise<void>;
  stopLive(): Promise<void>;
  exportData(): Promise<void>;
  updateProfile(patch: Partial<Profile>): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  updateUserData(patch: Partial<UserData>): Promise<boolean>;
  saveBodyMeasurement(id: number | null, input: BodyMeasurementInput): Promise<boolean>;
  removeBodyMeasurement(id: number): Promise<boolean>;
  saveLabResult(id: number | null, input: LabResultInput): Promise<boolean>;
  removeLabResult(id: number): Promise<boolean>;
  savePeriod(id: number | null, input: PeriodInput): Promise<boolean>;
  removePeriod(id: number): Promise<boolean>;
  saveSymptom(input: SymptomInput): Promise<boolean>;
  removeSymptom(id: number): Promise<boolean>;
  savePregnancy(dueDay: string): Promise<boolean>;
  removePregnancy(): Promise<boolean>;
  removeAllCycleData(): Promise<boolean>;
  saveJournalNote(id: number | null, input: JournalNoteInput): Promise<boolean>;
  removeJournalNote(id: number): Promise<boolean>;
  importVendorFiles(files: SourceFile[], rejected: FileReport[]): Promise<VendorImportResult | null>;
  removeVendorData(): Promise<boolean>;
  heartRateBetween(fromS: number, toS: number, bucketS?: number): Promise<HeartRatePoint[]>;
  saveSleepEdit(request: SleepEditRequest): Promise<SleepEditOutcome>;
  deleteSleepEdit(id: number): Promise<boolean>;
  saveActivity(draft: ActivityDraft, id?: number): Promise<number | null>;
  deleteActivity(target: DeleteTarget): Promise<boolean>;
  undoDelete(): Promise<void>;
  clearNotice(): void;
  refreshNotifications(): Promise<void>;
  setNotificationsEnabled(enabled: boolean): Promise<PermissionState>;
  refreshWidgets(): Promise<void>;
  refreshWidgetsAfterPin(): Promise<void>;
  markInboxRead(): Promise<void>;
  clearInbox(): Promise<void>;
  refreshHealthConnect(): Promise<void>;
  setHealthConnectType(type: HcDataType, enabled: boolean): Promise<boolean>;
  setHealthConnectAfterSync(enabled: boolean): Promise<void>;
  requestHealthConnectAccess(): Promise<void>;
  syncHealthConnect(): Promise<void>;
  openHealthConnectSettings(): void;
  installHealthConnect(): Promise<void>;
}

export type ParityLevel = 'A' | 'B' | 'C' | 'D';
