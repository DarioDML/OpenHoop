import type { BandModel } from '@openhoop/core';

import type { ConnectionState, SyncPhase } from './types';

export const ONBOARDING_SCREENS = ['welcome', 'profile', 'body', 'goals', 'permissions', 'official', 'pair', 'connected', 'setup', 'wear', 'calibration'] as const;
export type OnboardingScreen = (typeof ONBOARDING_SCREENS)[number];

export type OnboardingPart = 'you' | 'band';

export interface OnboardingStage {
  part: OnboardingPart;
  stage: number;
  total: number;
}

const STAGES: Readonly<Record<OnboardingScreen, { part: OnboardingPart; stage: number }>> = {
  welcome: { part: 'you', stage: 1 },
  profile: { part: 'you', stage: 2 },
  body: { part: 'you', stage: 2 },
  goals: { part: 'you', stage: 3 },
  permissions: { part: 'you', stage: 3 },
  official: { part: 'band', stage: 1 },
  pair: { part: 'band', stage: 1 },
  connected: { part: 'band', stage: 2 },
  setup: { part: 'band', stage: 3 },
  wear: { part: 'band', stage: 4 },
  calibration: { part: 'band', stage: 4 },
};

const PART_TOTALS: Readonly<Record<OnboardingPart, number>> = { you: 3, band: 4 };

export function onboardingStage(screen: OnboardingScreen): OnboardingStage {
  const { part, stage } = STAGES[screen];
  return { part, stage, total: PART_TOTALS[part] };
}

export type SignalStrength = 'strong' | 'medium' | 'weak';

export function signalStrength(rssi: number): SignalStrength | null {
  if (!Number.isFinite(rssi) || rssi >= 0) return null;
  if (rssi >= -60) return 'strong';
  if (rssi >= -75) return 'medium';
  return 'weak';
}

export function knownRssi(rssi: number | null | undefined): number | null {
  return typeof rssi === 'number' && Number.isFinite(rssi) && rssi < 0 ? Math.round(rssi) : null;
}

export function shortBandId(id: string): string {
  const hex = id.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length < 8) return id;
  return `${hex.slice(0, 4)}…${hex.slice(-2)}`;
}

export function modelFromName(name: string): BandModel | null {
  if (/\bMG\b/i.test(name)) return 'MG';
  if (/\b5\.0\b/.test(name)) return '5.0';
  return null;
}

export const RECORDS_PER_PAGE = 14;

export function pagesRead(processedRecords: number, pagesTotal: number | null): number | null {
  if (pagesTotal === null || pagesTotal <= 0 || !Number.isFinite(processedRecords) || processedRecords <= 0) return null;
  return Math.min(pagesTotal, Math.max(1, Math.floor(processedRecords / RECORDS_PER_PAGE)));
}

const DAY_S = 86_400;

export function historyDays(oldestSampleS: number | null, newestS: number | null): number | null {
  if (oldestSampleS === null || newestS === null || newestS < oldestSampleS) return null;
  return Math.max(1, Math.round((newestS - oldestSampleS) / DAY_S));
}

export const SETUP_STEPS = ['info', 'backup', 'history', 'compute'] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number];
export type SetupStepStatus = 'done' | 'active' | 'pending' | 'failed';
export type SetupStage = 'backup' | 'sync' | 'finished' | 'failed';

export interface SetupInput {
  stage: SetupStage;
  backupDone: boolean;
  reachedBand: boolean;
  connection: ConnectionState;
  phase: SyncPhase | null;
}

export function isOnBand(connection: ConnectionState, phase: SyncPhase | null): boolean {
  return (connection === 'connected' || connection === 'syncing') && phase !== 'connecting' && phase !== 'probing';
}

export function setupStepStatuses({ stage, backupDone, reachedBand, connection, phase }: SetupInput): Record<SetupStepId, SetupStepStatus> {
  if (stage === 'backup') {
    const onBand = isOnBand(connection, phase);
    return { info: onBand ? 'done' : 'active', backup: onBand ? 'active' : 'pending', history: 'pending', compute: 'pending' };
  }
  if (stage === 'failed') {
    return {
      info: reachedBand ? 'done' : 'failed',
      backup: backupDone ? 'done' : reachedBand ? 'failed' : 'pending',
      history: reachedBand ? 'failed' : 'pending',
      compute: 'pending',
    };
  }
  const backup: SetupStepStatus = backupDone ? 'done' : 'failed';
  if (stage === 'finished') return { info: 'done', backup, history: 'done', compute: 'done' };
  const computing = phase === 'compute';
  return { info: 'done', backup, history: computing ? 'done' : 'active', compute: computing ? 'active' : 'pending' };
}

export function backedUpSince(readAtS: number | null, startedS: number | null): boolean {
  return readAtS !== null && startedS !== null && readAtS >= startedS;
}
