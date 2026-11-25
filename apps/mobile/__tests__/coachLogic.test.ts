import type { DayRecord } from '@openhoop/core';

import { API_VERSION, FALLBACK_BETA, MESSAGES_URL, buildHeaders, buildRequestBody, errorForStatus, readMessageResponse, requestCoachReply } from '@/coach/api';
import { scanForCheckIns } from '@/coach/checkIns';
import { CONTEXT_DAYS, buildDataSummary, buildSystemPrompt } from '@/coach/context';
import { cleanApiKey, secureKeyStore } from '@/coach/keyStore';
import { DEFAULT_COACH_MODEL, defaultCoachPrefs, parseCoachPrefs, withDismissed } from '@/coach/prefs';
import { MAX_CHIPS, parseCoachReply, parseStoredChips, resolveChips, serializeChips } from '@/coach/reply';
import { createFixtureDays } from '@/data/fixtureSource';
import { defaultUserData, parseUserData } from '@/data/userData';
import { parseJson, type Json } from '@/lib/json';
import { NetworkRefusedError, type GatedFetch } from '@/net/gate';

import { FIXTURE_NOW } from './support/appData';
import { TEST_KEY, jsonResponse, messageBody } from './support/coach';

jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
    getItemAsync: jest.fn(async (key: string) => items.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      items.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      items.delete(key);
    }),
  };
});

const days = createFixtureDays(FIXTURE_NOW);
const today = days[days.length - 1]?.day ?? '2026-11-25';

function withValue(day: DayRecord, patch: { hrv?: number | null; readiness?: number | null }): DayRecord {
  return {
    ...day,
    hrv: patch.hrv === undefined ? day.hrv : { ...day.hrv, value: patch.hrv },
    readiness: patch.readiness === undefined ? day.readiness : { ...day.readiness, value: patch.readiness },
  };
}

function bodyOf(model: Parameters<typeof buildRequestBody>[0]['model']): { [key: string]: Json } {
  const parsed = parseJson(buildRequestBody({ model, system: 'S', turns: [{ role: 'user', content: 'Q' }] }));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('body is not an object');
  return parsed;
}

describe('coach request', () => {
  it('asks the Messages API for the JSON reply shape with the chosen model', () => {
    const body = bodyOf('claude-sonnet-5-5');
    expect(body).toMatchObject({
      model: 'claude-sonnet-5-5',
      system: 'S',
      messages: [{ role: 'user', content: 'Q' }],
      output_config: { effort: 'low', format: { type: 'json_schema' } },
      fallbacks: 'default',
    });
    expect(body).not.toHaveProperty('temperature');
    expect(bodyOf('claude-haiku-5-5')).not.toHaveProperty('fallbacks');
  });

  it('sends the key only as a header, with the API version', () => {
    expect(buildHeaders(TEST_KEY, 'claude-opus-5-5')).toEqual({
      'content-type': 'application/json',
      'x-api-key': TEST_KEY,
      'anthropic-version': API_VERSION,
      'anthropic-beta': FALLBACK_BETA,
    });
    expect(buildHeaders(TEST_KEY, 'claude-haiku-5-5')).not.toHaveProperty('anthropic-beta');
    expect(buildRequestBody({ model: 'claude-sonnet-5-5', system: 'S', turns: [] })).not.toContain(TEST_KEY);
  });

  it.each([
    [401, 'invalid-key'],
    [402, 'billing'],
    [403, 'forbidden'],
    [404, 'model-unavailable'],
    [429, 'rate-limited'],
    [529, 'overloaded'],
    [503, 'overloaded'],
    [500, 'server'],
    [400, 'rejected'],
    [413, 'rejected'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    expect(errorForStatus(status)).toBe(kind);
    const send: GatedFetch = async () => jsonResponse(status, { type: 'error', error: { type: 'x', message: 'secret detail' } });
    expect(await requestCoachReply(send, { apiKey: TEST_KEY, model: DEFAULT_COACH_MODEL, system: 'S', turns: [] })).toEqual({ ok: false, error: kind });
  });

  it('maps a refused gate, a network failure and a timeout', async () => {
    const request = { apiKey: TEST_KEY, model: DEFAULT_COACH_MODEL, system: 'S', turns: [] };
    expect(await requestCoachReply(async () => Promise.reject(new NetworkRefusedError('feature-off')), request)).toEqual({ ok: false, error: 'network-off' });
    expect(await requestCoachReply(async () => Promise.reject(new TypeError('Network request failed')), request)).toEqual({ ok: false, error: 'network' });
    const hang: GatedFetch = (_feature, _url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    expect(await requestCoachReply(hang, request, 5)).toEqual({ ok: false, error: 'timeout' });
  });

  it('posts to the Messages URL through the gate', async () => {
    const send = jest.fn<ReturnType<GatedFetch>, Parameters<GatedFetch>>(async () => jsonResponse(200, messageBody('hi')));
    await requestCoachReply(send, { apiKey: TEST_KEY, model: DEFAULT_COACH_MODEL, system: 'S', turns: [] });
    expect(send).toHaveBeenCalledWith('coach', MESSAGES_URL, expect.objectContaining({ method: 'POST' }));
  });

  it('reads text blocks and handles refusal, truncation and junk', () => {
    expect(readMessageResponse({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }], stop_reason: 'end_turn' })).toEqual({ ok: true, text: 'ab' });
    expect(readMessageResponse({ content: [], stop_reason: 'refusal' })).toEqual({ ok: false, error: 'refused' });
    expect(readMessageResponse({ content: [{ type: 'text', text: '{"chips":[' }], stop_reason: 'max_tokens' })).toEqual({ ok: false, error: 'incomplete' });
    expect(readMessageResponse({ content: 'nope' })).toEqual({ ok: false, error: 'invalid-response' });
    expect(readMessageResponse(undefined)).toEqual({ ok: false, error: 'invalid-response' });
  });
});

describe('coach reply', () => {
  it('validates the JSON shape and keeps only known metric chips', () => {
    const reply = parseCoachReply(
      JSON.stringify({
        chips: [
          { metric: 'hrv', day: '2026-11-24' },
          { metric: 'hrv', day: '2026-11-24' },
          { metric: 'weight', day: '2026-11-24' },
          { metric: 'load', day: 'yesterday' },
          'junk',
          { metric: 'readiness', day: '2026-11-23' },
          { metric: 'restingHr', day: '2026-11-22' },
          { metric: 'sleepScore', day: '2026-11-21' },
        ],
        text: '  Your HRV dipped.  ',
        remember: 'Trains on Tuesdays',
      }),
    );
    expect(reply).toEqual({
      chips: [
        { metric: 'hrv', day: '2026-11-24' },
        { metric: 'readiness', day: '2026-11-23' },
        { metric: 'restingHr', day: '2026-11-22' },
      ],
      text: 'Your HRV dipped.',
      remember: 'Trains on Tuesdays',
      structured: true,
    });
    expect(reply?.chips).toHaveLength(MAX_CHIPS);
  });

  it('falls back to plain text when the shape is invalid', () => {
    expect(parseCoachReply('Just words.')).toEqual({ chips: [], text: 'Just words.', remember: null, structured: false });
    expect(parseCoachReply('{"text": 5}')).toEqual({ chips: [], text: '{"text": 5}', remember: null, structured: false });
    expect(parseCoachReply('{"chips":[],"text":"  "}')?.structured).toBe(false);
    expect(parseCoachReply('   ')).toBeNull();
  });

  it('round-trips stored chips and drops chips without a local value', () => {
    const latest = days[days.length - 1];
    if (!latest) throw new Error('fixture has no days');
    const chips = [
      { metric: 'readiness' as const, day: latest.day },
      { metric: 'hrv' as const, day: '1999-01-01' },
    ];
    expect(parseStoredChips(serializeChips(chips))).toEqual(chips);
    expect(parseStoredChips('not json')).toEqual([]);
    const missing = [withValue(latest, { readiness: null })];
    expect(resolveChips(chips, missing)).toEqual([]);
    const present = [withValue(latest, { readiness: 71 })];
    expect(resolveChips(chips, present)).toEqual([{ metric: 'readiness', day: latest.day, value: 71 }]);
  });
});

describe('what the coach sees', () => {
  it('sends a compact table of the last days with levels and gaps, never a name', () => {
    const named = { ...defaultUserData(), name: 'Alexandra' };
    const prompt = buildSystemPrompt({ days, today, language: 'en', memory: null });
    expect(prompt).not.toContain(named.name);
    expect(prompt).toContain('not a doctor');
    expect(prompt).toContain('day | readiness | sleepScore | load | hrv | restingHr');
    expect(prompt).toContain('level B');
    const rows = prompt.split('\n').filter((line) => /^\d{4}-\d{2}-\d{2} \|/.test(line));
    expect(rows.length).toBeLessThanOrEqual(CONTEXT_DAYS);
    expect(rows[rows.length - 1]?.startsWith(today)).toBe(true);
    expect(prompt).not.toMatch(/sim:|WHOOP|serial/i);
  });

  it('marks missing values and says when there are no days', () => {
    const latest = days[days.length - 1];
    if (!latest) throw new Error('fixture has no days');
    expect(buildDataSummary([withValue(latest, { hrv: null })], today)).toMatch(/ \| - \| /);
    expect(buildDataSummary([], today)).toContain('No days are recorded yet.');
  });

  it('adds memory notes only when given and asks for the user language', () => {
    expect(buildSystemPrompt({ days: [], today, language: 'nl', memory: ['Runs on Sunday'] })).toContain('- Runs on Sunday');
    expect(buildSystemPrompt({ days: [], today, language: 'nl', memory: ['Runs on Sunday'] })).toContain('Reply in Dutch');
    expect(buildSystemPrompt({ days: [], today, language: 'en', memory: null })).not.toContain('remember:');
  });
});

describe('check-ins', () => {
  const base = days.slice(-8);

  function series(values: number[]): DayRecord[] {
    const template = base[0];
    if (!template) throw new Error('fixture has no days');
    return values.map((hrv, i) => withValue(base[i] ?? template, { hrv, readiness: null }));
  }

  it('flags only a clear change on the latest day', () => {
    const steady = series([50, 52, 48, 51, 49, 50, 51, 50]);
    const scan = scanForCheckIns(steady, []);
    expect(scan.status === 'ok' ? scan.checkIns.filter((c) => c.metric === 'hrv') : null).toEqual([]);
    const dropped = series([50, 52, 48, 51, 49, 50, 51, 30]);
    const found = scanForCheckIns(dropped, []);
    expect(found.status).toBe('ok');
    const hrv = found.status === 'ok' ? found.checkIns.find((c) => c.metric === 'hrv') : undefined;
    expect(hrv).toMatchObject({ direction: 'down', value: 30 });
    expect(hrv?.usual).toBeCloseTo(351 / 7, 5);
  });

  it('hides dismissed check-ins and is honest about missing history', () => {
    const dropped = series([50, 52, 48, 51, 49, 50, 51, 30]);
    const first = scanForCheckIns(dropped, []);
    const id = first.status === 'ok' ? first.checkIns.find((c) => c.metric === 'hrv')?.id : undefined;
    if (id === undefined) throw new Error('expected an hrv check-in');
    const again = scanForCheckIns(dropped, [id]);
    expect(again.status === 'ok' ? again.checkIns.some((c) => c.id === id) : true).toBe(false);
    expect(scanForCheckIns([], [])).toEqual({ status: 'no-data' });
    expect(scanForCheckIns(series([50, 30]).map((d) => ({ ...d, restingHr: { ...d.restingHr, value: null }, sleep: { ...d.sleep, score: { ...d.sleep.score, value: null } } })), [])).toEqual({ status: 'needs-history' });
  });
});

describe('coach prefs', () => {
  it('default to Sonnet 5.5 with check-ins off', () => {
    expect(defaultCoachPrefs()).toEqual({ model: 'claude-sonnet-5-5', memory: true, checkIns: false, dismissedCheckIns: [] });
    expect(parseUserData(null).coach).toEqual(defaultCoachPrefs());
  });

  it('reject unknown models and malformed dismissals', () => {
    expect(parseCoachPrefs({ model: 'gpt-x', memory: 'no', checkIns: 'yes', dismissedCheckIns: ['2026-11-25:hrv', 'bad', 3] })).toEqual({
      model: 'claude-sonnet-5-5',
      memory: true,
      checkIns: false,
      dismissedCheckIns: ['2026-11-25:hrv'],
    });
    expect(parseCoachPrefs({ model: 'claude-haiku-5-5', memory: false, checkIns: true }).model).toBe('claude-haiku-5-5');
    expect(withDismissed(defaultCoachPrefs(), '2026-11-25:hrv').dismissedCheckIns).toEqual(['2026-11-25:hrv']);
  });
});

describe('API key storage', () => {
  it('accepts only key-shaped input', () => {
    expect(cleanApiKey(`  ${TEST_KEY}\n`)).toBe(TEST_KEY);
    expect(cleanApiKey('sk-ant-short')).toBeNull();
    expect(cleanApiKey('hello world')).toBeNull();
  });

  it('keeps the key in secure storage only, device-bound, and removes it', async () => {
    const store = jest.requireMock<typeof import('expo-secure-store')>('expo-secure-store');
    expect(await secureKeyStore.save('nope')).toBe(false);
    expect(store.setItemAsync).not.toHaveBeenCalled();
    expect(await secureKeyStore.save(TEST_KEY)).toBe(true);
    expect(store.setItemAsync).toHaveBeenCalledWith('openhoop.coach.apiKey', TEST_KEY, { keychainAccessible: 5 });
    expect(await secureKeyStore.load()).toBe(TEST_KEY);
    await secureKeyStore.remove();
    expect(await secureKeyStore.load()).toBeNull();
  });
});
