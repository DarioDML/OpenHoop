import { GOAL_KINDS, INBOX_LIMIT, SENT_LIMIT, goalAlertId, type Alert, type NotificationLedger } from '@/lib/notificationPlan';

import type { UserData } from './userData';

export const NOTIFICATION_STATE_KEY = 'notifications.state';
const MAX_PENDING = 20;

export type NotificationState = NotificationLedger;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isRecord(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ALERT_ID = /^(digest:\d{4}-\d{2}-\d{2}|risk:\d{1,15}|sync:\d{1,15}|goal:(load|sleep|strength):\d{4}-\d{2}-\d{2}|wind:\d{1,15}|steps:\d{4}-\d{2}-\d{2}|coach:\d{4}-\d{2}-\d{2})$/;

function score(value: Json | undefined, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

function parseAlert(value: Json | undefined): Alert | null {
  if (!isRecord(value)) return null;
  const { id, at, kind } = value;
  if (typeof id !== 'string' || !ALERT_ID.test(id)) return null;
  if (typeof at !== 'number' || !Number.isSafeInteger(at) || at <= 0) return null;
  if (kind === 'digest') {
    if (typeof value.day !== 'string' || !ISO_DAY.test(value.day) || id !== `digest:${value.day}`) return null;
    return { kind, id, at, day: value.day, readiness: score(value.readiness, 100), sleepScore: score(value.sleepScore, 100), load: score(value.load, 21) };
  }
  if (kind === 'syncFailed' && id.startsWith('sync:')) return { kind, id, at };
  if (kind === 'goal') {
    const goal = GOAL_KINDS.find((candidate) => candidate === value.goal);
    const { week, count, target } = value;
    if (goal === undefined || typeof week !== 'string' || !ISO_DAY.test(week) || id !== goalAlertId({ goal, week })) return null;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 10_000) return null;
    if (typeof target !== 'number' || !Number.isInteger(target) || target <= 0 || target > 10_000) return null;
    const scoreMin = value.scoreMin === undefined || value.scoreMin === null ? null : score(value.scoreMin, 100);
    if (goal === 'sleep' && scoreMin === null) return null;
    return { kind, id, at, goal, week, count, target, scoreMin };
  }
  if (kind === 'windDown' && id === `wind:${at}`) {
    const bed = typeof value.bed === 'number' && Number.isInteger(value.bed) && value.bed >= 0 && value.bed < 1440 ? value.bed : null;
    return bed === null ? null : { kind, id, at, bed };
  }
  if (kind === 'stepsGoal') {
    const steps = score(value.value, 1_000_000);
    const target = score(value.target, 1_000_000);
    if (typeof value.day !== 'string' || id !== `steps:${value.day}` || steps === null || target === null) return null;
    return { kind, id, at, day: value.day, value: steps, target };
  }
  if (kind === 'coachCheckin') {
    if (typeof value.day !== 'string' || id !== `coach:${value.day}`) return null;
    return { kind, id, at, day: value.day };
  }
  if (kind === 'dataAtRisk' && id.startsWith('risk:')) {
    const days = typeof value.days === 'number' && Number.isInteger(value.days) && value.days > 0 && value.days <= 3650 ? value.days : null;
    return days === null ? null : { kind, id, at, days };
  }
  return null;
}

function parseList<T>(value: Json | undefined, limit: number, parse: (item: Json) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value.slice(0, limit)) {
    const parsed = parse(item);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}

export function refreshesNotifications(patch: Partial<UserData>): boolean {
  return (
    patch.notifications !== undefined ||
    patch.weeklyPlan !== undefined ||
    patch.windDown !== undefined ||
    patch.coach !== undefined ||
    patch.network !== undefined
  );
}

export function emptyNotificationState(): NotificationState {
  return { pending: [], inbox: [], sent: [] };
}

export function parseNotificationState(raw: string | null): NotificationState {
  if (raw === null || raw === '') return emptyNotificationState();
  let parsed: Json;
  try {
    parsed = JSON.parse(raw) as Json;
  } catch {
    return emptyNotificationState();
  }
  if (!isRecord(parsed)) return emptyNotificationState();
  return {
    pending: parseList(parsed.pending, MAX_PENDING, parseAlert),
    inbox: parseList(parsed.inbox, INBOX_LIMIT, (item) => {
      const alert = parseAlert(item);
      if (alert === null || !isRecord(item)) return null;
      return { ...alert, read: item.read === true };
    }),
    sent: Array.isArray(parsed.sent)
      ? parsed.sent.slice(-SENT_LIMIT).filter((id): id is string => typeof id === 'string' && ALERT_ID.test(id))
      : [],
  };
}

export function serializeNotificationState(state: NotificationState): string {
  return JSON.stringify(state);
}
