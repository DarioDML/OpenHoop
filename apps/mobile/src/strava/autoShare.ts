import type { ActivityRow, DayRecord } from '@openhoop/core';

import { dayEntries, type ActivityEntry } from '@/data/activities';
import { ACTIVITY_TYPES, type ActivityType } from '@/data/activityDerived';
import { isRecord, type Json } from '@/lib/json';

import type { Ledger } from './ledger';
import { stravaKey } from './tcx';

export const AUTO_SHARE_MODES = ['all', 'byType', 'manual'] as const;
export type AutoShareMode = (typeof AUTO_SHARE_MODES)[number];

export const DEFAULT_AUTO_SHARE_TYPES: readonly ActivityType[] = ['running', 'cycling'];
export const AUTO_SHARE_SETTLE_S = 15 * 60;
export const AUTO_SHARE_LOOKBACK_DAYS = 3;

export interface AutoSharePrefs {
  mode: AutoShareMode;
  types: ActivityType[];
  since: number | null;
}

export function defaultAutoSharePrefs(): AutoSharePrefs {
  return { mode: 'manual', types: [...DEFAULT_AUTO_SHARE_TYPES], since: null };
}

export function parseAutoSharePrefs(value: Json | undefined): AutoSharePrefs {
  const base = defaultAutoSharePrefs();
  if (!isRecord(value)) return base;
  const mode = typeof value.mode === 'string' && (AUTO_SHARE_MODES as readonly string[]).includes(value.mode) ? (value.mode as AutoShareMode) : base.mode;
  const types = Array.isArray(value.types)
    ? ACTIVITY_TYPES.filter((type) => (value.types as Json[]).includes(type))
    : base.types;
  const since = typeof value.since === 'number' && Number.isSafeInteger(value.since) && value.since > 0 ? value.since : null;
  return { mode, types, since: mode === 'manual' ? null : since };
}

export function withMode(prefs: AutoSharePrefs, mode: AutoShareMode, nowS: number): AutoSharePrefs {
  if (mode === 'manual') return { ...prefs, mode, since: null };
  return { ...prefs, mode, since: prefs.mode === 'manual' || prefs.since === null ? nowS : prefs.since };
}

export function toggleType(prefs: AutoSharePrefs, type: ActivityType): AutoSharePrefs {
  const types = prefs.types.includes(type) ? prefs.types.filter((item) => item !== type) : ACTIVITY_TYPES.filter((item) => item === type || prefs.types.includes(item));
  return { ...prefs, types };
}

export function sharesType(prefs: AutoSharePrefs, type: ActivityType | null): boolean {
  if (prefs.mode === 'all') return true;
  if (prefs.mode === 'byType') return type !== null && prefs.types.includes(type);
  return false;
}

export interface CandidateInput {
  days: readonly DayRecord[];
  activities: readonly ActivityRow[];
  prefs: AutoSharePrefs;
  ledger: Ledger;
  failed: ReadonlySet<string>;
  nowS: number;
}

export interface AutoShareCandidate {
  entry: ActivityEntry;
  tzOffsetS: number;
}

export function autoShareCandidates({ days, activities, prefs, ledger, failed, nowS }: CandidateInput): AutoShareCandidate[] {
  const since = prefs.since;
  if (prefs.mode === 'manual' || since === null) return [];
  const out: AutoShareCandidate[] = [];
  for (const day of days.slice(-AUTO_SHARE_LOOKBACK_DAYS)) {
    for (const entry of dayEntries(days, day, activities)) {
      if (entry.kind === 'live' || entry.start < since || entry.end > nowS - AUTO_SHARE_SETTLE_S) continue;
      if (!sharesType(prefs, entry.type)) continue;
      const key = stravaKey(entry);
      if (ledger[key] !== undefined || failed.has(key)) continue;
      out.push({ entry, tzOffsetS: day.tzOffsetS });
    }
  }
  return out.sort((a, b) => a.entry.start - b.entry.start);
}
