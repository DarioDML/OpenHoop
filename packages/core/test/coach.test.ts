import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COACH_LIMITS,
  CoachInputError,
  addCoachMemory,
  appendCoachExchange,
  deleteAllCoachData,
  deleteCoachConversation,
  deleteCoachMemory,
  exportCsv,
  listCoachConversations,
  listCoachMemory,
  listCoachMessages,
  openStore,
  updateCoachMemory,
} from '../src/index';
import type { Store } from '../src/index';
import { openStrictDriver } from './strictDriver';

describe('coach storage', () => {
  let store: Store;
  beforeEach(async () => {
    store = await openStore(openStrictDriver());
  });
  afterEach(async () => {
    await store.driver.close();
  });

  it('creates a conversation with its first exchange and appends later ones', async () => {
    const id = await appendCoachExchange(
      store.driver,
      null,
      '  Why is my   HRV low?  ',
      [
        { role: 'user', text: 'Why is my HRV low?', chips: '[]' },
        { role: 'coach', text: 'Your HRV is 41 ms.', chips: '[{"metric":"hrv","day":"2026-11-24"}]' },
      ],
      1_000,
    );
    await appendCoachExchange(store.driver, id, 'ignored', [{ role: 'user', text: 'And sleep?', chips: '[]' }], 2_000);

    const conversations = await listCoachConversations(store.driver);
    expect(conversations).toEqual([{ id, title: 'Why is my HRV low?', createdAt: 1_000, updatedAt: 2_000, messageCount: 3 }]);
    const messages = await listCoachMessages(store.driver, id);
    expect(messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'Why is my HRV low?'],
      ['coach', 'Your HRV is 41 ms.'],
      ['user', 'And sleep?'],
    ]);
    expect(messages[1]?.chips).toBe('[{"metric":"hrv","day":"2026-11-24"}]');
  });

  it('rejects empty or oversized messages and unknown conversations without writing anything', async () => {
    await expect(appendCoachExchange(store.driver, null, 't', [{ role: 'user', text: '   ', chips: '[]' }], 1)).rejects.toThrow(CoachInputError);
    const long = 'x'.repeat(COACH_LIMITS.messageLength + 1);
    await expect(appendCoachExchange(store.driver, null, 't', [{ role: 'user', text: long, chips: '[]' }], 1)).rejects.toThrow(CoachInputError);
    await expect(appendCoachExchange(store.driver, 99, 't', [{ role: 'user', text: 'hi', chips: '[]' }], 1)).rejects.toThrow(CoachInputError);
    expect(await listCoachConversations(store.driver)).toEqual([]);
  });

  it('deletes one conversation with its messages', async () => {
    const keep = await appendCoachExchange(store.driver, null, 'keep', [{ role: 'user', text: 'a', chips: '[]' }], 1);
    const drop = await appendCoachExchange(store.driver, null, 'drop', [{ role: 'user', text: 'b', chips: '[]' }], 2);
    expect(await deleteCoachConversation(store.driver, drop)).toBe(true);
    expect(await deleteCoachConversation(store.driver, drop)).toBe(false);
    expect((await listCoachConversations(store.driver)).map((c) => c.id)).toEqual([keep]);
    expect(await listCoachMessages(store.driver, drop)).toEqual([]);
  });

  it('adds, edits and deletes memory notes within the limits', async () => {
    const id = await addCoachMemory(store.driver, ' I train on Tuesdays ', 'coach', 5);
    expect(id).not.toBeNull();
    if (id === null) return;
    expect(await updateCoachMemory(store.driver, id, 'I train on Tuesdays and Fridays', 6)).toBe(true);
    expect(await listCoachMemory(store.driver)).toEqual([{ id, text: 'I train on Tuesdays and Fridays', source: 'user', createdAt: 5, updatedAt: 6 }]);
    await expect(addCoachMemory(store.driver, 'y'.repeat(COACH_LIMITS.memoryLength + 1), 'user', 7)).rejects.toThrow(CoachInputError);
    expect(await deleteCoachMemory(store.driver, id)).toBe(true);
    expect(await listCoachMemory(store.driver)).toEqual([]);
  });

  it('stops adding notes at the cap', async () => {
    for (let i = 0; i < COACH_LIMITS.memoryNotes; i++) await addCoachMemory(store.driver, `note ${i}`, 'user', i);
    expect(await addCoachMemory(store.driver, 'one too many', 'user', 999)).toBeNull();
    expect(await listCoachMemory(store.driver)).toHaveLength(COACH_LIMITS.memoryNotes);
  });

  it('exports the coach tables and deletes all coach data', async () => {
    const id = await appendCoachExchange(store.driver, null, 'title, with comma', [{ role: 'user', text: 'hello "coach"', chips: '[]' }], 1);
    await addCoachMemory(store.driver, 'note', 'user', 1);
    expect(await exportCsv(store, 'coach_conversations')).toContain(`${id},"title, with comma",1,1`);
    expect(await exportCsv(store, 'coach_messages')).toContain('"hello ""coach"""');
    expect(await exportCsv(store, 'coach_memory')).toContain(',note,user,1,1');

    await deleteAllCoachData(store.driver);
    expect(await listCoachConversations(store.driver)).toEqual([]);
    expect(await listCoachMemory(store.driver)).toEqual([]);
    expect(await exportCsv(store, 'coach_messages')).toBe('id,conversation_id,role,text,chips,created_at\r\n');
  });
});
