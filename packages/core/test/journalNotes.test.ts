import { beforeEach, describe, expect, it } from 'vitest';
import {
  JOURNAL_NOTE_MAX_CHARS,
  deleteJournalNote,
  exportCsv,
  insertJournalNote,
  listJournalNotes,
  openStore,
  updateJournalNote,
} from '../src/index';
import type { SqlDriver } from '../src/index';
import { openStrictDriver } from './strictDriver';

describe('journal notes', () => {
  let driver: SqlDriver;

  beforeEach(async () => {
    driver = openStrictDriver();
    await openStore(driver);
  });

  it('works without any paired band', async () => {
    expect(await listJournalNotes(driver)).toEqual([]);
    await insertJournalNote(driver, { day: '2026-11-20', body: 'No band yet', tags: [] }, 10);
    expect((await listJournalNotes(driver)).map((n) => n.body)).toEqual(['No band yet']);
  });

  it('round-trips text with newlines, quotes and non-latin characters, oldest day first', async () => {
    const body = 'Late dinner, "heavy"\nslept badly — café ☕ 睡眠';
    await insertJournalNote(driver, { day: '2026-11-20', body, tags: ['late-meal', 'caffeine-late'] }, 10);
    await insertJournalNote(driver, { day: '2026-11-10', body: 'Earlier', tags: [] }, 11);
    const list = await listJournalNotes(driver);
    expect(list.map((n) => n.day)).toEqual(['2026-11-10', '2026-11-20']);
    expect(list[1]).toEqual({ id: 1, day: '2026-11-20', body, tags: ['late-meal', 'caffeine-late'], createdAt: 10 });
  });

  it('updates and deletes by id and reports a missing id', async () => {
    const created = await insertJournalNote(driver, { day: '2026-11-20', body: 'a', tags: ['sauna'] }, 10);
    expect(await updateJournalNote(driver, created.id, { day: '2026-11-21', body: 'b', tags: [] })).toBe(true);
    expect(await listJournalNotes(driver)).toEqual([{ id: created.id, day: '2026-11-21', body: 'b', tags: [], createdAt: 10 }]);
    expect(await updateJournalNote(driver, 999, { day: '2026-11-21', body: 'b', tags: [] })).toBe(false);
    expect(await deleteJournalNote(driver, created.id)).toBe(true);
    expect(await deleteJournalNote(driver, created.id)).toBe(false);
    expect(await listJournalNotes(driver)).toEqual([]);
  });

  it('rejects empty or oversized text, malformed days and unsafe tags', async () => {
    await expect(insertJournalNote(driver, { day: '2026-11-20', body: '', tags: [] }, 1)).rejects.toThrow();
    await expect(insertJournalNote(driver, { day: '2026-11-20', body: 'x'.repeat(JOURNAL_NOTE_MAX_CHARS + 1), tags: [] }, 1)).rejects.toThrow();
    await expect(insertJournalNote(driver, { day: 'yesterday', body: 'a', tags: [] }, 1)).rejects.toThrow();
    await expect(insertJournalNote(driver, { day: '2026-11-20', body: 'a', tags: ['a,b'] }, 1)).rejects.toThrow();
    await expect(insertJournalNote(driver, { day: '2026-11-20', body: 'a', tags: ['a', 'b', 'c', 'd', 'e', 'f'] }, 1)).rejects.toThrow();
    await insertJournalNote(driver, { day: '2026-11-20', body: 'x'.repeat(JOURNAL_NOTE_MAX_CHARS), tags: [] }, 1);
    expect(await listJournalNotes(driver)).toHaveLength(1);
  });

  it('is part of the CSV export, quoting free text', async () => {
    const store = await openStore(driver);
    expect(await exportCsv(store, 'journal_notes')).toBe('id,day,body,tags,created_at\r\n');
    await insertJournalNote(driver, { day: '2026-11-20', body: 'Said "hi", then\nleft', tags: ['sauna', 'nap'] }, 10);
    expect(await exportCsv(store, 'journal_notes')).toBe('id,day,body,tags,created_at\r\n1,2026-11-20,"Said ""hi"", then\nleft","sauna,nap",10\r\n');
  });
});
