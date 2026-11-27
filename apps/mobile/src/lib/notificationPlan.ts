import type { DayRecord } from '@openhoop/core';

import { addDays, visibleReadiness } from '@/data/derived';
import type { NotificationPrefs } from '@/data/userData';
import { planWeek, type PlanGoal, type PlanInput as WeekInput, type WeeklyPlan } from '@/data/weeklyPlan';

export const DIGEST_CLOCK = '07:00';
export const DATA_AT_RISK_DAYS = 2;
export const DIGEST_HORIZON_DAYS = 3;
export const SYNC_ALERT_GAP_MS = 6 * 3_600_000;
export const INBOX_LIMIT = 50;
export const SENT_LIMIT = 100;
const DAY_MS = 86_400_000;

export interface DigestFacts {
  readiness: number | null;
  sleepScore: number | null;
  load: number | null;
}

export function digestFacts(days: readonly DayRecord[], now: Date): (day: string) => DigestFacts | null {
  const byDay = new Map(days.map((record) => [record.day, record]));
  return (day) => {
    const record = byDay.get(day);
    if (record === undefined) return null;
    const yesterday = byDay.get(addDays(day, -1));
    return {
      readiness: visibleReadiness(record).value,
      sleepScore: record.sleep.score.value,
      load: yesterday !== undefined && yesterday.end * 1000 <= now.getTime() ? yesterday.load.value : null,
    };
  };
}

export const GOAL_KINDS = ['load', 'sleep', 'strength'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export interface GoalFact {
  goal: GoalKind;
  week: string;
  count: number;
  target: number;
  scoreMin: number | null;
}

const ALERT_GOAL: Readonly<Partial<Record<PlanGoal, GoalKind>>> = { loadDays: 'load', sleepScore: 'sleep', strength: 'strength' };

export function goalFacts(plan: WeeklyPlan | null, input: WeekInput): GoalFact[] {
  if (plan === null) return [];
  const week = planWeek(plan, input);
  const facts: GoalFact[] = [];
  for (const progress of week.goals) {
    const goal = ALERT_GOAL[progress.goal];
    if (goal === undefined || progress.state !== 'met') continue;
    facts.push({ goal, week: week.start, count: progress.done, target: progress.target, scoreMin: progress.goal === 'sleepScore' ? plan.sleepScoreMin : null });
  }
  return facts;
}

export type AlertPayload =
  | ({ kind: 'digest'; day: string } & DigestFacts)
  | { kind: 'syncFailed' }
  | { kind: 'dataAtRisk'; days: number }
  | ({ kind: 'goal' } & GoalFact)
  | { kind: 'windDown'; bed: number };

export type AlertKind = AlertPayload['kind'];
export type Alert = AlertPayload & { id: string; at: number };
export type InboxEntry = Alert & { read: boolean };

export interface PlanInput {
  now: Date;
  prefs: NotificationPrefs;
  pending: readonly Alert[];
  sent: readonly string[];
  factsFor: (day: string) => DigestFacts | null;
  lastSyncAt: number | null;
  watchBand: boolean;
  fresh?: readonly Alert[];
  goals?: readonly GoalFact[];
  windDown?: WindDown | null;
}

export interface WindDown {
  at: number;
  bed: number;
}

export function windDownAlert(windDown: WindDown | null | undefined, now: Date): Alert | null {
  if (windDown === null || windDown === undefined || windDown.at <= now.getTime()) return null;
  return { kind: 'windDown', id: `wind:${windDown.at}`, at: windDown.at, bed: windDown.bed };
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function clockMinutes(clock: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function atMinutes(date: Date, minutes: number, dayOffset = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset, Math.floor(minutes / 60), minutes % 60);
}

export function isQuiet(date: Date, quietStart: string, quietEnd: string): boolean {
  const start = clockMinutes(quietStart);
  const end = clockMinutes(quietEnd);
  if (start === null || end === null || start === end) return false;
  const minute = date.getHours() * 60 + date.getMinutes();
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function outOfQuiet(date: Date, prefs: Pick<NotificationPrefs, 'quietStart' | 'quietEnd'>): Date {
  if (!isQuiet(date, prefs.quietStart, prefs.quietEnd)) return date;
  const end = clockMinutes(prefs.quietEnd);
  if (end === null) return date;
  const sameDay = atMinutes(date, end);
  return sameDay.getTime() > date.getTime() ? sameDay : atMinutes(date, end, 1);
}

export function planDigests(input: Pick<PlanInput, 'now' | 'prefs' | 'sent' | 'factsFor'>): Alert[] {
  const { now, prefs } = input;
  const digestAt = clockMinutes(DIGEST_CLOCK) ?? 7 * 60;
  const sent = new Set(input.sent);
  const out: Alert[] = [];
  for (let offset = 0; out.length < DIGEST_HORIZON_DAYS && offset <= DIGEST_HORIZON_DAYS + 1; offset += 1) {
    const at = outOfQuiet(atMinutes(now, digestAt, offset), prefs);
    if (at.getTime() <= now.getTime()) continue;
    const day = localDay(at);
    const id = `digest:${day}`;
    if (sent.has(id) || out.some((alert) => alert.id === id)) continue;
    const facts = input.factsFor(day) ?? { readiness: null, sleepScore: null, load: null };
    out.push({ kind: 'digest', id, at: at.getTime(), day, ...facts });
  }
  return out;
}

export function planDataAtRisk(input: Pick<PlanInput, 'now' | 'prefs' | 'sent' | 'lastSyncAt' | 'watchBand'>): Alert | null {
  const { now, prefs, lastSyncAt } = input;
  if (!input.watchBand || lastSyncAt === null) return null;
  const id = `risk:${lastSyncAt}`;
  if (input.sent.includes(id)) return null;
  const due = Math.max(lastSyncAt + DATA_AT_RISK_DAYS * DAY_MS, now.getTime());
  const at = outOfQuiet(new Date(due), prefs).getTime();
  const days = Math.max(DATA_AT_RISK_DAYS, Math.floor((at - lastSyncAt) / DAY_MS));
  return { kind: 'dataAtRisk', id, at, days };
}

function syncAlertTime(id: string): number | null {
  const match = /^sync:(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

export function syncFailedAlert(now: Date, prefs: NotificationPrefs, recentIds: readonly string[]): Alert | null {
  if (!prefs.enabled || !prefs.syncProblems) return null;
  const since = now.getTime() - SYNC_ALERT_GAP_MS;
  if (recentIds.some((id) => (syncAlertTime(id) ?? 0) > since)) return null;
  return { kind: 'syncFailed', id: `sync:${now.getTime()}`, at: outOfQuiet(now, prefs).getTime() };
}

export function goalAlertId(fact: Pick<GoalFact, 'goal' | 'week'>): string {
  return `goal:${fact.goal}:${fact.week}`;
}

export function planGoals(input: Pick<PlanInput, 'now' | 'prefs' | 'sent' | 'pending' | 'goals'>): Alert[] {
  const known = new Set([...input.sent, ...input.pending.map((alert) => alert.id)]);
  const at = outOfQuiet(input.now, input.prefs).getTime();
  return (input.goals ?? [])
    .filter((fact) => fact.target > 0 && fact.count >= fact.target && !known.has(goalAlertId(fact)))
    .map((fact) => ({ kind: 'goal', id: goalAlertId(fact), at, ...fact }));
}

function wanted(alert: Alert, prefs: NotificationPrefs): boolean {
  if (alert.kind === 'digest') return prefs.morningDigest;
  if (alert.kind === 'goal') return prefs.goals;
  if (alert.kind === 'windDown') return true;
  return prefs.syncProblems;
}

export function planAlerts(input: PlanInput): Alert[] {
  const { prefs, now } = input;
  const wind = windDownAlert(input.windDown, now);
  const dueWind = input.pending.filter((alert) => alert.kind === 'windDown' && alert.at <= now.getTime());
  if (!prefs.enabled) return [...dueWind, ...(wind === null ? [] : [wind])];
  const planned: Alert[] = input.pending.filter((alert) => (alert.at <= now.getTime() || alert.kind === 'goal') && wanted(alert, prefs));
  if (wind !== null) planned.push(wind);
  if (prefs.syncProblems) {
    for (const alert of input.pending) {
      if (alert.kind === 'syncFailed' && alert.at > now.getTime()) planned.push(alert);
    }
    planned.push(...(input.fresh ?? []).filter((alert) => alert.kind === 'syncFailed'));
    const risk = planDataAtRisk(input);
    if (risk !== null) planned.push(risk);
  }
  if (prefs.morningDigest) planned.push(...planDigests(input));
  if (prefs.goals) planned.push(...planGoals(input));
  const seen = new Set<string>();
  return planned
    .filter((alert) => {
      if (seen.has(alert.id)) return false;
      seen.add(alert.id);
      return true;
    })
    .sort((a, b) => a.at - b.at);
}

export function trimInbox(entries: readonly InboxEntry[], now: Date): InboxEntry[] {
  const oldest = now.getTime() - 30 * DAY_MS;
  const seen = new Set<string>();
  return [...entries]
    .filter((entry) => entry.at >= oldest)
    .sort((a, b) => b.at - a.at)
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .slice(0, INBOX_LIMIT);
}

export interface NotificationLedger {
  pending: Alert[];
  inbox: InboxEntry[];
  sent: string[];
}

export function reconcile(ledger: NotificationLedger, now: Date, delivered: boolean, stillScheduled: ReadonlySet<string>): NotificationLedger {
  const isDone = (alert: Alert): boolean => alert.at <= now.getTime() && !stillScheduled.has(alert.id);
  const done = ledger.pending.filter(isDone);
  const pending = ledger.pending.filter((alert) => !isDone(alert));
  const arrived = delivered ? done.filter((alert) => !ledger.sent.includes(alert.id)) : [];
  const inbox = trimInbox([...arrived.map((alert) => ({ ...alert, read: false })), ...ledger.inbox], now);
  const sent = [...ledger.sent, ...arrived.map((alert) => alert.id)].slice(-SENT_LIMIT);
  return { pending, inbox, sent };
}

export function unreadCount(inbox: readonly InboxEntry[]): number {
  return inbox.filter((entry) => !entry.read).length;
}
