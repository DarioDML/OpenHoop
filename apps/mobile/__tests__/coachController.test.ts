import { HISTORY_MESSAGES, historyTurns, type SendContext } from '@/coach/controller';
import { defaultCoachPrefs } from '@/coach/prefs';
import { createFixtureDays } from '@/data/fixtureSource';
import { defaultUserData, serializeUserData } from '@/data/userData';
import { parseJson } from '@/lib/json';
import type { GatedFetch } from '@/net/gate';

import { FIXTURE_NOW } from './support/appData';
import { TEST_KEY, jsonResponse, makeController, memoryRepo, messageBody, replyBody } from './support/coach';

const days = createFixtureDays(FIXTURE_NOW);
const today = days[days.length - 1]?.day ?? '2026-11-25';

function context(overrides: Partial<SendContext> = {}): SendContext {
  return {
    days,
    today,
    language: 'en',
    prefs: defaultCoachPrefs(),
    network: { enabled: true, features: { coach: true, maps: false, labs: false, strava: false } },
    ...overrides,
  };
}

function sender(...responses: Response[]) {
  const queue = [...responses];
  return jest.fn<ReturnType<GatedFetch>, Parameters<GatedFetch>>(async () => {
    const next = queue.shift();
    if (!next) throw new Error('no response queued');
    return next;
  });
}

function sentBody(send: jest.Mock<ReturnType<GatedFetch>, Parameters<GatedFetch>>, call = 0): string {
  return send.mock.calls[call]?.[2].body ?? '';
}

describe('coach controller', () => {
  it('stores the exchange, the chips and a requested memory note after a valid reply', async () => {
    const send = sender(jsonResponse(200, replyBody({ chips: [{ metric: 'hrv', day: today }], text: 'Your HRV is steady.', remember: 'Trains on Tuesdays' })));
    const { controller } = makeController({ send });
    await controller.load();
    expect(await controller.send('  How is my HRV?  ', context())).toBe(true);
    const state = controller.getState();
    expect(state.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'How is my HRV?'],
      ['coach', 'Your HRV is steady.'],
    ]);
    expect(parseJson(state.messages[1]?.chips ?? '')).toEqual([{ metric: 'hrv', day: today }]);
    expect(state.conversations).toHaveLength(1);
    expect(state.memory.map((n) => [n.text, n.source])).toEqual([['Trains on Tuesdays', 'coach']]);
    expect(state.error).toBeNull();
  });

  it('continues the same conversation with its history', async () => {
    const send = sender(jsonResponse(200, replyBody({ chips: [], text: 'One.' })), jsonResponse(200, replyBody({ chips: [], text: 'Two.' })));
    const { controller } = makeController({ send });
    await controller.send('First?', context());
    await controller.send('Second?', context());
    const body = parseJson(sentBody(send, 1));
    expect(body).toMatchObject({
      messages: [
        { role: 'user', content: 'First?' },
        { role: 'assistant', content: 'One.' },
        { role: 'user', content: 'Second?' },
      ],
    });
    expect(controller.getState().conversations).toHaveLength(1);
  });

  it('ignores the coach note when memory is off and leaves notes out of the prompt', async () => {
    const send = sender(jsonResponse(200, replyBody({ chips: [], text: 'Ok.', remember: 'Something' })));
    const repo = memoryRepo();
    await repo.addMemory('Private note', 'user', 1);
    const { controller } = makeController({ send, repo });
    await controller.load();
    await controller.send('Hi', context({ prefs: { ...defaultCoachPrefs(), memory: false } }));
    expect(sentBody(send)).not.toContain('Private note');
    expect(controller.getState().memory.map((n) => n.text)).toEqual(['Private note']);
  });

  it('sends nothing and stores nothing while the network is off', async () => {
    const { controller, send, repo } = makeController();
    expect(await controller.send('Hi', context({ network: { enabled: false, features: { coach: true, maps: false, labs: false, strava: false } } }))).toBe(false);
    expect(await controller.send('Hi', context({ network: { enabled: true, features: { coach: false, maps: false, labs: false, strava: false } } }))).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(repo.written).toEqual([]);
    expect(controller.getState().error).toBe('network-off');
  });

  it('asks for a key instead of sending without one', async () => {
    const { controller, send } = makeController({ key: null });
    expect(await controller.send('Hi', context())).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ hasKey: false, error: 'no-key' });
  });

  it.each([
    [401, 'invalid-key'],
    [429, 'rate-limited'],
    [529, 'overloaded'],
  ] as const)('reports HTTP %i as %s and stores nothing', async (status, error) => {
    const { controller, repo } = makeController({ send: sender(jsonResponse(status, { type: 'error' })) });
    expect(await controller.send('Hi', context())).toBe(false);
    expect(controller.getState()).toMatchObject({ error, sending: false, messages: [] });
    expect(repo.written).toEqual([]);
  });

  it('stores a plain text reply when the JSON shape is missing', async () => {
    const { controller } = makeController({ send: sender(jsonResponse(200, messageBody('Plain answer.'))) });
    expect(await controller.send('Hi', context())).toBe(true);
    expect(controller.getState().messages[1]).toMatchObject({ text: 'Plain answer.', chips: '[]' });
  });

  it('rejects empty and oversized questions without calling the API', async () => {
    const { controller, send } = makeController();
    expect(await controller.send('   ', context())).toBe(false);
    expect(await controller.send('x'.repeat(1001), context())).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('reports a storage failure instead of crashing', async () => {
    const repo = memoryRepo();
    repo.appendExchange = async () => Promise.reject(new Error('disk full'));
    const { controller } = makeController({ repo, send: sender(jsonResponse(200, replyBody({ chips: [], text: 'Ok.' }))) });
    expect(await controller.send('Hi', context())).toBe(false);
    expect(controller.getState().error).toBe('storage');
  });

  it('keeps the API key out of every stored and exported value', async () => {
    const send = sender(jsonResponse(200, replyBody({ chips: [], text: `Echo ${'x'}`, remember: 'note' })));
    const { controller, repo, keys } = makeController({ key: null, send });
    expect(await controller.saveKey(TEST_KEY)).toBe(true);
    await controller.send('What is my key?', context());
    expect(keys.current()).toBe(TEST_KEY);
    expect(repo.written.join('\n')).not.toContain(TEST_KEY);
    expect(JSON.stringify(controller.getState())).not.toContain(TEST_KEY);
    expect(serializeUserData({ ...defaultUserData(), coach: defaultCoachPrefs() })).not.toContain('sk-ant');
    expect(sentBody(send)).not.toContain(TEST_KEY);
    expect(send.mock.calls[0]?.[2].headers?.['x-api-key']).toBe(TEST_KEY);
  });

  it('removes the key, deletes conversations and wipes everything', async () => {
    const { controller, keys } = makeController({ send: sender(jsonResponse(200, replyBody({ chips: [], text: 'Ok.', remember: 'n' }))) });
    await controller.load();
    await controller.send('Hi', context());
    const id = controller.getState().activeId;
    expect(id).not.toBeNull();
    if (id === null) return;
    expect(await controller.deleteConversation(id)).toBe(true);
    expect(controller.getState()).toMatchObject({ conversations: [], activeId: null, messages: [] });
    await controller.removeKey();
    expect(keys.current()).toBeNull();
    expect(controller.getState().hasKey).toBe(false);
    await controller.saveKey(TEST_KEY);
    await controller.deleteAll();
    expect(keys.current()).toBeNull();
    expect(controller.getState()).toMatchObject({ hasKey: false, conversations: [], memory: [] });
  });

  function deferredSender() {
    let release: (response: Response) => void = () => undefined;
    const send = jest.fn<ReturnType<GatedFetch>, Parameters<GatedFetch>>(
      (_feature, _url, init) =>
        new Promise<Response>((resolve, reject) => {
          release = resolve;
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    return { send, release: (response: Response) => release(response) };
  }

  it.each([
    ['a new conversation is opened', (c: ReturnType<typeof makeController>['controller']) => c.open(null)],
    ['all coach data is deleted', (c: ReturnType<typeof makeController>['controller']) => c.deleteAll()],
    ['the key is removed', (c: ReturnType<typeof makeController>['controller']) => c.removeKey()],
  ])('drops an in-flight reply when %s', async (_label, interrupt) => {
    const { send, release } = deferredSender();
    const { controller, repo } = makeController({ send });
    const sending = controller.send('Hi', context());
    await new Promise((resolve) => setTimeout(resolve, 0));
    await interrupt(controller);
    release(jsonResponse(200, replyBody({ chips: [], text: 'Late.', remember: 'late note' })));
    expect(await sending).toBe(false);
    expect(repo.written).toEqual([]);
    expect(controller.getState()).toMatchObject({ sending: false, messages: [], activeId: null });
  });

  it('drops a reply that arrives after the network was switched off', async () => {
    let allowed = true;
    const { send, release } = deferredSender();
    const { controller, repo } = makeController({ send, allowed: () => allowed });
    const sending = controller.send('Hi', context());
    await new Promise((resolve) => setTimeout(resolve, 0));
    allowed = false;
    release(jsonResponse(200, replyBody({ chips: [], text: 'Late.' })));
    expect(await sending).toBe(false);
    expect(repo.written).toEqual([]);
    expect(controller.getState().error).toBe('network-off');
  });

  it('keeps only recent history and starts it with a user turn', () => {
    const messages = Array.from({ length: HISTORY_MESSAGES + 1 }, (_, i) => ({
      id: i,
      conversationId: 1,
      role: i % 2 === 0 ? ('user' as const) : ('coach' as const),
      text: `m${i}`,
      chips: '[]',
      createdAt: 0,
    }));
    const turns = historyTurns(messages);
    expect(turns[0]?.role).toBe('user');
    expect(turns.length).toBeLessThanOrEqual(HISTORY_MESSAGES);
  });
});
