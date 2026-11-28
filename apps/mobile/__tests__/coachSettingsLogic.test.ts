import type { DayRecord } from '@openhoop/core';

import { chipStatus } from '@/coach/chipStatus';
import { checkInStreak, coachCheckIns, findCheckIn, scanForCheckIns, weeklyCheckIn } from '@/coach/checkIns';
import { buildJournalSummary, buildSensorSummary, buildSystemPrompt } from '@/coach/context';
import { promptFor, type SendContext } from '@/coach/controller';
import {
  checkInReplyFor,
  coachActive,
  defaultCoachPrefs,
  effectiveProactivity,
  guessMemoryCategory,
  memoryCategoryOf,
  parseCoachPrefs,
  withCheckInReply,
  withCheckInsShown,
  withMemoryCategory,
  withProactivity,
  withoutMemoryCategories,
} from '@/coach/prefs';
import { addDays } from '@/data/derived';
import { createFixtureDays } from '@/data/fixtureSource';
import { defaultUserData, parseUserData, serializeUserData, type JournalAnswer } from '@/data/userData';
import type { GatedFetch } from '@/net/gate';

import { FIXTURE_NOW } from './support/appData';
import { jsonResponse, makeController, memoryRepo, replyBody } from './support/coach';

const days = createFixtureDays(FIXTURE_NOW);
const today = days[days.length - 1]?.day ?? '2026-11-25';
const journal: Record<string, Record<string, JournalAnswer>> = { [today]: { alcohol: 2, sauna: false }, [addDays(today, -1)]: { 'caffeine-late': true }, [addDays(today, -30)]: { nap: true } };
const NETWORK = { enabled: true, features: { coach: true, maps: false, labs: false, strava: false } };

function withValue(day: DayRecord, hrv: number | null): DayRecord {
  return { ...day, hrv: { ...day.hrv, value: hrv } };
}

describe('what the coach may read', () => {
  it('sends scores by default and nothing from the journal or sensors', () => {
    const prompt = buildSystemPrompt({ days, today, language: 'en', memory: null, journal });
    expect(prompt).toContain('day | readiness | sleepScore | load | hrv | restingHr');
    expect(prompt).not.toContain('alcohol 2');
    expect(prompt).not.toContain('respiratoryRate');
  });

  it('leaves the score table out when scores are off', () => {
    const prompt = buildSystemPrompt({ days, today, language: 'en', memory: null, access: { scores: false, journal: false, sensors: false } });
    expect(prompt).not.toContain('day | readiness');
    expect(prompt).not.toMatch(/^\d{4}-\d{2}-\d{2} \|/m);
    expect(prompt).toContain('chose not to share scores');
  });

  it('adds the recent journal answers only when allowed', () => {
    const prompt = buildSystemPrompt({ days, today, language: 'en', memory: null, journal, access: { scores: true, journal: true, sensors: false } });
    expect(prompt).toContain(`${today}: alcohol 2, sauna no`);
    expect(prompt).toContain('caffeine-late yes');
    expect(prompt).not.toContain('nap yes');
    expect(buildJournalSummary({}, today)).toContain('No journal answers');
  });

  it('adds daily sensor summaries, never raw samples, only when allowed', () => {
    const prompt = buildSystemPrompt({ days, today, language: 'en', memory: null, access: { scores: false, journal: false, sensors: true } });
    expect(prompt).toContain('day | respiratoryRate | spo2 | skinTempDeviationC | hrMin | hrAvg | hrMax | steps | asleepH');
    expect(prompt).toContain('not raw samples');
    expect(buildSensorSummary([], today)).toContain('No days are recorded yet.');
  });

  it('follows the tone and proactivity settings', () => {
    expect(buildSystemPrompt({ days: [], today, language: 'en', memory: null, tone: 'direct' })).toContain('Tone: direct');
    expect(buildSystemPrompt({ days: [], today, language: 'en', memory: null, tone: 'encouraging' })).toContain('Tone: warm and encouraging');
    expect(buildSystemPrompt({ days: [], today, language: 'en', memory: null })).toContain('Tone: neutral');
    expect(buildSystemPrompt({ days: [], today, language: 'en', memory: null, proactivity: 'weekly' })).toContain('weekly review');
    expect(buildSystemPrompt({ days: [], today, language: 'en', memory: null })).toContain('Do not offer follow-up check-ins');
  });

  it('builds the prompt from the saved preferences, with memory behind its own switch', () => {
    const prefs = withProactivity({ ...defaultCoachPrefs(), tone: 'direct', memory: false, access: { scores: false, journal: true, sensors: false } }, 'patterns');
    const ctx: Omit<SendContext, 'network'> = { days, today, language: 'en', prefs, journal };
    const prompt = promptFor(ctx, [{ id: 1, text: 'Runs on Sunday', source: 'user', createdAt: 1, updatedAt: 1 }]);
    expect(prompt).toContain('Tone: direct');
    expect(prompt).toContain('mention it');
    expect(prompt).toContain('alcohol 2');
    expect(prompt).not.toContain('Runs on Sunday');
    expect(prompt).not.toContain('day | readiness');
  });

  it('sends the journal to the API only when the switch is on', async () => {
    const send = jest.fn<ReturnType<GatedFetch>, Parameters<GatedFetch>>(async () => jsonResponse(200, replyBody({ chips: [], text: 'Fine.' })));
    const { controller } = makeController({ send });
    await controller.load();
    const base: SendContext = { days, today, language: 'en', prefs: defaultCoachPrefs(), network: NETWORK, journal };
    await controller.send('How was yesterday?', base);
    expect(send.mock.calls[0]?.[2].body).not.toContain('alcohol 2');
    await controller.send('And now?', { ...base, prefs: { ...defaultCoachPrefs(), access: { scores: true, journal: true, sensors: false } } });
    expect(send.mock.calls[1]?.[2].body).toContain('alcohol 2');
  });
});

describe('coach on and off', () => {
  it('sends nothing while the coach is switched off', async () => {
    const send = jest.fn<ReturnType<GatedFetch>, Parameters<GatedFetch>>(async () => jsonResponse(200, replyBody({ chips: [], text: 'Hi' })));
    const { controller } = makeController({ send });
    await controller.load();
    const sent = await controller.send('Hello', { days, today, language: 'en', prefs: { ...defaultCoachPrefs(), enabled: false }, network: NETWORK });
    expect(sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(coachActive({ ...defaultCoachPrefs(), enabled: false }, NETWORK)).toBe(false);
    expect(coachActive(defaultCoachPrefs(), NETWORK)).toBe(true);
    expect(coachActive(defaultCoachPrefs(), { ...NETWORK, enabled: false })).toBe(false);
  });

  it('stops a running request without an error and keeps the conversation unchanged', async () => {
    let release: () => void = () => undefined;
    const send = jest.fn<ReturnType<GatedFetch>, Parameters<GatedFetch>>(
      (_feature, _url, init) =>
        new Promise<Response>((resolve, reject) => {
          release = () => resolve(jsonResponse(200, replyBody({ chips: [], text: 'Late answer' })));
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const { controller, repo } = makeController({ send });
    await controller.load();
    const pending = controller.send('Slow question', { days, today, language: 'en', prefs: defaultCoachPrefs(), network: NETWORK });
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getState().sending).toBe(true);
    controller.stop();
    expect(controller.getState().sending).toBe(false);
    release();
    expect(await pending).toBe(false);
    expect(controller.getState().error).toBeNull();
    expect(controller.getState().messages).toEqual([]);
    expect(repo.written).toEqual([]);
  });

  it('stores nothing more once Stop lands while the answer is being saved', async () => {
    const send = jest.fn<ReturnType<GatedFetch>, Parameters<GatedFetch>>(async () => jsonResponse(200, replyBody({ chips: [], text: 'Noted.', remember: 'Runs on Sunday' })));
    const repo = memoryRepo();
    const holder: { stop: () => void } = { stop: () => undefined };
    const append = repo.appendExchange;
    repo.appendExchange = async (...args) => {
      holder.stop();
      return append(...args);
    };
    const { controller } = makeController({ send, repo });
    holder.stop = controller.stop;
    await controller.load();
    await controller.send('Remember I run on Sunday', { days, today, language: 'en', prefs: defaultCoachPrefs(), network: NETWORK });
    expect(await repo.memory()).toEqual([]);
    expect(controller.getState().messages).toEqual([]);
    expect(controller.getState().sending).toBe(false);
  });

  it('returns the new memory note so its category can be stored', async () => {
    const { controller } = makeController();
    await controller.load();
    const note = await controller.addMemoryNote('Run a sub-50 10K');
    expect(note).toMatchObject({ text: 'Run a sub-50 10K', source: 'user' });
  });
});

describe('coach preferences', () => {
  it('reads old preferences without the new fields', () => {
    const old = parseCoachPrefs({ model: 'claude-opus-5-5', memory: false, checkIns: true, dismissedCheckIns: [] });
    expect(old).toMatchObject({ model: 'claude-opus-5-5', memory: false, checkIns: true, enabled: true, tone: 'neutral', proactivity: 'patterns' });
    expect(old.access).toEqual({ scores: true, journal: false, sensors: false });
    expect(parseCoachPrefs({ checkIns: false }).proactivity).toBe('off');
  });

  it('rejects malformed new fields', () => {
    const parsed = parseCoachPrefs({
      enabled: 'no',
      tone: 'shouty',
      proactivity: 'hourly',
      access: { scores: 'yes', journal: true },
      memoryCategories: { '1@2': 'goals', bad: 'goals', '3@4': 'secrets' },
      checkInReplies: [{ id: '2026-11-25:hrv', reply: 'sick', conversationId: 4 }, { id: 'nope', reply: 'sick' }, { id: '2026-11-25:hrv', reply: 'tired', conversationId: -1 }],
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.tone).toBe('neutral');
    expect(parsed.proactivity).toBe('off');
    expect(parsed.access).toEqual({ scores: true, journal: true, sensors: false });
    expect(parsed.memoryCategories).toEqual({ '1@2': 'goals' });
    expect(parsed.checkInReplies).toEqual([{ id: '2026-11-25:hrv', reply: 'tired', conversationId: null }]);
  });

  it('survives a save and reload', () => {
    const prefs = withCheckInReply(withProactivity({ ...defaultCoachPrefs(), tone: 'direct', enabled: false }, 'weekly'), { id: '2026-11-25:hrv', reply: 'sick', conversationId: 3 });
    const loaded = parseUserData(serializeUserData({ ...defaultUserData(), coach: prefs })).coach;
    expect(loaded).toEqual(prefs);
  });

  it('keeps the old check-ins switch and proactivity in step', () => {
    const on = withCheckInsShown(defaultCoachPrefs(), true);
    expect(on).toMatchObject({ checkIns: true, proactivity: 'patterns' });
    expect(withCheckInsShown(withProactivity(defaultCoachPrefs(), 'weekly'), true).proactivity).toBe('weekly');
    expect(withCheckInsShown(on, false)).toMatchObject({ checkIns: false, proactivity: 'off' });
    expect(effectiveProactivity({ ...defaultCoachPrefs(), checkIns: true })).toBe('patterns');
    expect(effectiveProactivity({ ...defaultCoachPrefs(), checkIns: false, proactivity: 'weekly' })).toBe('off');
  });

  it('stores one reply per check-in', () => {
    const first = withCheckInReply(defaultCoachPrefs(), { id: '2026-11-25:hrv', reply: 'tired', conversationId: null });
    const second = withCheckInReply(first, { id: '2026-11-25:hrv', reply: 'sick', conversationId: 9 });
    expect(second.checkInReplies).toEqual([{ id: '2026-11-25:hrv', reply: 'sick', conversationId: 9 }]);
    expect(checkInReplyFor(second, '2026-11-25:hrv')?.conversationId).toBe(9);
    expect(checkInReplyFor(second, '2026-11-24:hrv')).toBeNull();
  });
});

describe('memory categories', () => {
  it('guesses a category for notes without one', () => {
    expect(guessMemoryCategory('Run a sub-50 10K in spring')).toBe('goals');
    expect(guessMemoryCategory('Flight to New York, 4 Dec')).toBe('events');
    expect(guessMemoryCategory('Short answers, numbers first')).toBe('preferences');
    expect(guessMemoryCategory('Desk job, sits most of the day')).toBe('lifestyle');
    expect(guessMemoryCategory('Wil een marathon lopen, doel is 3u30')).toBe('goals');
    expect(guessMemoryCategory('Bench 80 kg')).toBe('other');
    expect(guessMemoryCategory('No allergies')).toBe('other');
    expect(guessMemoryCategory('Geen allergieën')).toBe('other');
    expect(guessMemoryCategory('No calorie targets')).toBe('preferences');
    expect(guessMemoryCategory("Don't mention weight")).toBe('preferences');
  });

  it('prefers the stored category and prunes deleted notes', () => {
    const note = { id: 5, createdAt: 100, text: 'Bench 80 kg' };
    const gone = { id: 6, createdAt: 101, text: 'Old' };
    const prefs = withMemoryCategory(withMemoryCategory(defaultCoachPrefs(), gone, 'events', [gone]), note, 'goals', [note]);
    expect(memoryCategoryOf(prefs, note)).toBe('goals');
    expect(prefs.memoryCategories).toEqual({ '5@100': 'goals' });
    expect(memoryCategoryOf(defaultCoachPrefs(), note)).toBe('other');
    expect(withoutMemoryCategories(prefs, []).memoryCategories).toEqual({});
  });
});

describe('check-in logic', () => {
  const recent = days.slice(-12);
  const steady = recent.map((day, i) => withValue(day, [50, 52, 48, 51, 49, 50, 51, 50, 49, 51, 50, 50][i] ?? 50));
  const dropped = steady.map((day, i) => (i >= steady.length - 3 ? withValue(day, 30) : day));

  it('counts how many days a change has lasted', () => {
    const scan = scanForCheckIns(dropped, []);
    const hrv = scan.status === 'ok' ? scan.checkIns.find((c) => c.metric === 'hrv') : undefined;
    if (!hrv) throw new Error('expected an hrv check-in');
    expect(hrv.kind).toBe('change');
    expect(checkInStreak(dropped, hrv)).toBeGreaterThanOrEqual(2);
  });

  it('shows nothing when proactivity is off, changes for patterns and a weekly review for weekly', () => {
    const last = dropped[dropped.length - 1]?.day ?? today;
    expect(coachCheckIns(dropped, defaultCoachPrefs(), last)).toEqual([]);
    expect(coachCheckIns(dropped, { ...withProactivity(defaultCoachPrefs(), 'patterns'), enabled: false }, last)).toEqual([]);
    const patterns = coachCheckIns(dropped, withProactivity(defaultCoachPrefs(), 'patterns'), last);
    expect(patterns.some((c) => c.metric === 'hrv')).toBe(true);
    expect(patterns.some((c) => c.kind === 'week')).toBe(false);
    const weekly = coachCheckIns(days, withProactivity(defaultCoachPrefs(), 'weekly'), today);
    const week = weeklyCheckIn(days, today);
    if (week === null) expect(weekly.some((c) => c.kind === 'week')).toBe(false);
    else {
      expect(weekly[0]).toEqual(week);
      expect(findCheckIn(days, week.id, today)).toEqual(week);
    }
  });

  it('builds the weekly review from two full weeks of readiness', () => {
    const weekly = weeklyCheckIn(days, today);
    if (weekly === null) throw new Error('fixture should cover two weeks');
    expect(weekly.id).toMatch(/^\d{4}-\d{2}-\d{2}:week$/);
    expect(weekly.kind).toBe('week');
    expect(weeklyCheckIn(days.slice(-3), today)).toBeNull();
  });
});

describe('chip status', () => {
  const recent = days.slice(-12).map((day, i) => withValue(day, [50, 52, 48, 51, 49, 50, 51, 50, 49, 51, 50, 50][i] ?? 50));
  const last = recent[recent.length - 1];

  it('compares a value with the personal baseline before it', () => {
    if (!last) throw new Error('no days');
    const low = chipStatus(recent, 'hrv', last.day, 40);
    expect(low.tone).toBe('worse');
    expect(low.delta?.kind).toBe('pct');
    expect(low.delta?.value).toBeLessThan(-15);
    expect(chipStatus(recent, 'hrv', last.day, 50).tone).toBe('usual');
    expect(chipStatus(recent, 'hrv', '1999-01-01', 50)).toEqual({ tone: 'unknown', delta: null });
    expect(chipStatus(recent, 'load', last.day, 10)).toEqual({ tone: 'unknown', delta: null });
  });
});
