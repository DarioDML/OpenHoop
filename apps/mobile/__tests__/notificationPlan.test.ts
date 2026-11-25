import { parseNotificationState, serializeNotificationState } from '@/data/notificationState';
import { defaultUserData, parseUserData, type NotificationPrefs } from '@/data/userData';
import {
  DATA_AT_RISK_DAYS,
  DIGEST_HORIZON_DAYS,
  INBOX_LIMIT,
  isQuiet,
  localDay,
  outOfQuiet,
  planAlerts,
  planDataAtRisk,
  planDigests,
  reconcile,
  syncFailedAlert,
  trimInbox,
  unreadCount,
  type Alert,
  type InboxEntry,
  type PlanInput,
} from '@/lib/notificationPlan';
import { alertText } from '@/lib/notificationText';

const DAY_MS = 86_400_000;
const PREFS: NotificationPrefs = { enabled: true, morningDigest: true, syncProblems: true, quietStart: '22:00', quietEnd: '07:00' };

function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 10, day, hour, minute);
}

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    now: at(25, 12),
    prefs: PREFS,
    pending: [],
    inbox: [],
    factsFor: () => null,
    lastSyncAt: null,
    watchBand: false,
    ...overrides,
  };
}

function sent(alert: Alert): InboxEntry {
  return { ...alert, read: false };
}

describe('quiet hours', () => {
  it('treats a window that crosses midnight as quiet on both sides of it', () => {
    expect(isQuiet(at(25, 22), '22:00', '07:00')).toBe(true);
    expect(isQuiet(at(25, 23, 59), '22:00', '07:00')).toBe(true);
    expect(isQuiet(at(26, 0), '22:00', '07:00')).toBe(true);
    expect(isQuiet(at(26, 6, 59), '22:00', '07:00')).toBe(true);
    expect(isQuiet(at(26, 7), '22:00', '07:00')).toBe(false);
    expect(isQuiet(at(25, 21, 59), '22:00', '07:00')).toBe(false);
  });

  it('handles a daytime window and an empty window', () => {
    expect(isQuiet(at(25, 13, 30), '13:00', '15:00')).toBe(true);
    expect(isQuiet(at(25, 15), '13:00', '15:00')).toBe(false);
    expect(isQuiet(at(25, 3), '08:00', '08:00')).toBe(false);
  });

  it('moves an alert in the evening to the end of quiet hours the next morning', () => {
    expect(outOfQuiet(at(25, 23, 15), PREFS)).toEqual(at(26, 7));
  });

  it('moves an alert after midnight to the same morning', () => {
    expect(outOfQuiet(at(26, 2), PREFS)).toEqual(at(26, 7));
  });

  it('leaves an alert outside quiet hours alone', () => {
    expect(outOfQuiet(at(25, 12), PREFS)).toEqual(at(25, 12));
  });
});

describe('morning digest', () => {
  it('plans one digest per day at 07:00, starting tomorrow when today has passed', () => {
    const plan = planDigests(input());
    expect(plan).toHaveLength(DIGEST_HORIZON_DAYS);
    expect(plan.map((alert) => alert.at)).toEqual([at(26, 7).getTime(), at(27, 7).getTime(), at(28, 7).getTime()]);
    expect(new Set(plan.map((alert) => alert.id)).size).toBe(plan.length);
  });

  it('includes today when it is still early', () => {
    const plan = planDigests(input({ now: at(25, 6, 30) }));
    expect(plan[0]?.id).toBe(`digest:${localDay(at(25, 7))}`);
  });

  it('waits for quiet hours to end', () => {
    const plan = planDigests(input({ now: at(25, 6), prefs: { ...PREFS, quietStart: '23:00', quietEnd: '09:30' } }));
    expect(plan[0]?.at).toBe(at(25, 9, 30).getTime());
  });

  it('never sends a second digest for a day that already had one', () => {
    const now = at(25, 8);
    const first = planDigests(input({ now: at(25, 6) }))[0];
    if (first === undefined) throw new Error('expected a digest');
    const later = planDigests(input({ now, inbox: [sent(first)], prefs: { ...PREFS, quietEnd: '09:00' } }));
    expect(later.map((alert) => alert.id)).not.toContain(first.id);
    expect(later.every((alert) => alert.at > now.getTime())).toBe(true);
  });

  it('collapses days that quiet hours push onto the same date', () => {
    const plan = planDigests(input({ now: at(25, 5), prefs: { ...PREFS, quietStart: '06:00', quietEnd: '05:00' } }));
    expect(new Set(plan.map((alert) => alert.id)).size).toBe(plan.length);
  });

  it('uses the day facts when they exist and is honest when they do not', () => {
    const facts = { readiness: 72.4, sleepScore: 81, load: 11.25 };
    const plan = planDigests(input({ now: at(25, 6), factsFor: (day) => (day === localDay(at(25, 6)) ? facts : null) }));
    const [today, tomorrow] = plan;
    if (today?.kind !== 'digest' || tomorrow?.kind !== 'digest') throw new Error('expected digests');
    expect(alertText('en', today)).toEqual({ title: 'Morning digest', body: "Readiness 72% · Sleep score 81 · Yesterday's Load 11.3" });
    expect(alertText('nl', today).body).toBe('Paraatheid 72% · Slaapscore 81 · Belasting gisteren 11,3');
    expect(alertText('en', tomorrow).body).toBe('No data for today yet. Open OpenHoop to sync your band.');
  });
});

describe('data at risk', () => {
  const lastSyncAt = at(25, 12).getTime();

  it(`fires ${DATA_AT_RISK_DAYS} days after the last successful sync`, () => {
    const alert = planDataAtRisk(input({ watchBand: true, lastSyncAt, now: at(25, 13) }));
    expect(alert).toEqual({ kind: 'dataAtRisk', id: `risk:${lastSyncAt}`, at: lastSyncAt + DATA_AT_RISK_DAYS * DAY_MS, days: DATA_AT_RISK_DAYS });
  });

  it('fires right away when the threshold has already passed', () => {
    const now = at(28, 15);
    const alert = planDataAtRisk(input({ watchBand: true, lastSyncAt, now }));
    expect(alert?.at).toBe(now.getTime());
    expect(alert?.kind === 'dataAtRisk' ? alert.days : null).toBe(3);
  });

  it('respects quiet hours', () => {
    const late = at(25, 23).getTime();
    const alert = planDataAtRisk(input({ watchBand: true, lastSyncAt: late, now: at(25, 23, 30) }));
    expect(alert?.at).toBe(at(28, 7).getTime());
  });

  it('is not planned without a band, without a sync, or once it was sent', () => {
    expect(planDataAtRisk(input({ watchBand: false, lastSyncAt }))).toBeNull();
    expect(planDataAtRisk(input({ watchBand: true, lastSyncAt: null }))).toBeNull();
    const first = planDataAtRisk(input({ watchBand: true, lastSyncAt }));
    if (first === null) throw new Error('expected an alert');
    expect(planDataAtRisk(input({ watchBand: true, lastSyncAt, now: at(29, 12), inbox: [sent(first)] }))).toBeNull();
  });

  it('moves forward after a new sync', () => {
    const first = planDataAtRisk(input({ watchBand: true, lastSyncAt }));
    const next = planDataAtRisk(input({ watchBand: true, lastSyncAt: lastSyncAt + DAY_MS }));
    expect(next?.at).toBe((first?.at ?? 0) + DAY_MS);
  });
});

describe('sync failures', () => {
  it('sends at most one alert in six hours', () => {
    const first = syncFailedAlert(at(25, 12), PREFS, []);
    if (first === null) throw new Error('expected an alert');
    expect(syncFailedAlert(at(25, 14), PREFS, [first])).toBeNull();
    expect(syncFailedAlert(at(25, 19), PREFS, [first])).not.toBeNull();
  });

  it('respects the preference and quiet hours', () => {
    expect(syncFailedAlert(at(25, 12), { ...PREFS, syncProblems: false }, [])).toBeNull();
    expect(syncFailedAlert(at(25, 23), PREFS, [])?.at).toBe(at(26, 7).getTime());
  });
});

describe('planAlerts', () => {
  it('plans nothing while notifications are off', () => {
    expect(planAlerts(input({ prefs: { ...PREFS, enabled: false }, watchBand: true, lastSyncAt: at(25, 12).getTime() }))).toEqual([]);
  });

  it('defaults to the digest and sync problems', () => {
    const prefs = defaultUserData().notifications;
    expect(prefs).toMatchObject({ enabled: false, morningDigest: true, syncProblems: true });
    const plan = planAlerts(input({ prefs: { ...prefs, enabled: true }, watchBand: true, lastSyncAt: at(25, 12).getTime() }));
    expect(new Set(plan.map((alert) => alert.kind))).toEqual(new Set(['digest', 'dataAtRisk']));
  });

  it('drops a category that is turned off and sorts by time', () => {
    const fresh = syncFailedAlert(at(25, 12), PREFS, []);
    const plan = planAlerts(input({ prefs: { ...PREFS, morningDigest: false }, fresh: fresh === null ? [] : [fresh] }));
    expect(plan.map((alert) => alert.kind)).toEqual(['syncFailed']);
    const all = planAlerts(input({ watchBand: true, lastSyncAt: at(25, 12).getTime() }));
    expect(all.map((alert) => alert.at)).toEqual([...all.map((alert) => alert.at)].sort((a, b) => a - b));
  });
});

describe('inbox', () => {
  const digest: Alert = { kind: 'digest', id: 'digest:2026-11-25', at: at(25, 7).getTime(), day: '2026-11-25', readiness: null, sleepScore: null, load: null };
  const later: Alert = { kind: 'digest', id: 'digest:2026-11-26', at: at(26, 7).getTime(), day: '2026-11-26', readiness: null, sleepScore: null, load: null };

  it('moves delivered alerts into the inbox once their time has passed', () => {
    const result = reconcile([digest, later], [], at(25, 12), true);
    expect(result.inbox.map((entry) => entry.id)).toEqual([digest.id]);
    expect(result.pending).toEqual([later]);
    expect(unreadCount(result.inbox)).toBe(1);
  });

  it('records nothing when the phone did not allow notifications', () => {
    expect(reconcile([digest], [], at(25, 12), false).inbox).toEqual([]);
  });

  it('keeps 30 days and at most the limit, newest first, without duplicates', () => {
    const now = at(25, 12);
    const many: InboxEntry[] = Array.from({ length: INBOX_LIMIT + 10 }, (_, i) => ({ kind: 'syncFailed', id: `sync:${i + 1}`, at: now.getTime() - i * 60_000, read: true }));
    const old: InboxEntry = { kind: 'syncFailed', id: 'sync:9', at: now.getTime() - 31 * DAY_MS, read: false };
    const trimmed = trimInbox([...many, many[0] as InboxEntry, old], now);
    expect(trimmed).toHaveLength(INBOX_LIMIT);
    expect(trimmed[0]?.id).toBe('sync:1');
    expect(trimmed.some((entry) => entry.id === old.id && !entry.read)).toBe(false);
  });

  it('round-trips through storage and rejects tampered entries', () => {
    const state = { pending: [later], inbox: [{ ...digest, read: true }] };
    expect(parseNotificationState(serializeNotificationState(state))).toEqual(state);
    const tampered = JSON.stringify({
      pending: [{ kind: 'digest', id: 'digest:2026-11-25', at: 1, day: '2026-11-26' }, { kind: 'dataAtRisk', id: 'risk:1', at: 5, days: -1 }, 'x'],
      inbox: [{ kind: 'evil', id: 'sync:1', at: 5 }, { kind: 'syncFailed', id: 'sync:2', at: 5, read: 'yes' }],
    });
    expect(parseNotificationState(tampered)).toEqual({ pending: [], inbox: [{ kind: 'syncFailed', id: 'sync:2', at: 5, read: false }] });
    expect(parseNotificationState('not json')).toEqual({ pending: [], inbox: [] });
  });

  it('keeps the notification switch off for older saved preferences', () => {
    expect(parseUserData(JSON.stringify({ notifications: { morningDigest: false } })).notifications).toEqual({
      enabled: false,
      morningDigest: false,
      syncProblems: true,
      quietStart: '22:00',
      quietEnd: '07:00',
    });
  });
});
