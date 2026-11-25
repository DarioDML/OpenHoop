import type { SqlDriver, SqlValue } from './store/types';

export const JOURNAL_NOTE_MAX_CHARS = 2000;
export const JOURNAL_NOTE_MAX_TAGS = 5;

const TAG = /^[a-z0-9-]{1,40}$/;

export interface JournalNoteInput {
  day: string;
  body: string;
  tags: string[];
}

export interface JournalNote extends JournalNoteInput {
  id: number;
  createdAt: number;
}

const COLUMNS = 'id, day, body, tags, created_at';

function splitTags(text: string): string[] {
  return text.split(',').filter((tag) => TAG.test(tag));
}

function joinTags(tags: readonly string[]): string {
  const unique = [...new Set(tags)];
  if (unique.length > JOURNAL_NOTE_MAX_TAGS || !unique.every((tag) => TAG.test(tag))) throw new Error('Invalid journal note tags');
  return unique.join(',');
}

function toNote(row: Record<string, SqlValue>): JournalNote {
  const { id, day, body, tags, created_at: createdAt } = row;
  if (typeof id !== 'number' || typeof day !== 'string' || typeof body !== 'string' || typeof tags !== 'string' || typeof createdAt !== 'number') {
    throw new Error('Invalid journal note row in database');
  }
  return { id, day, body, tags: splitTags(tags), createdAt };
}

export async function listJournalNotes(driver: SqlDriver): Promise<JournalNote[]> {
  const rows = await driver.all<Record<string, SqlValue>>(`SELECT ${COLUMNS} FROM journal_notes ORDER BY day, id`);
  return rows.map(toNote);
}

export async function insertJournalNote(driver: SqlDriver, input: JournalNoteInput, nowS: number): Promise<JournalNote> {
  const tags = joinTags(input.tags);
  const result = await driver.run('INSERT INTO journal_notes (day, body, tags, created_at) VALUES (?, ?, ?, ?)', [input.day, input.body, tags, nowS]);
  return { ...input, tags: splitTags(tags), id: result.lastInsertRowid, createdAt: nowS };
}

export async function updateJournalNote(driver: SqlDriver, id: number, input: JournalNoteInput): Promise<boolean> {
  const result = await driver.run('UPDATE journal_notes SET day = ?, body = ?, tags = ? WHERE id = ?', [input.day, input.body, joinTags(input.tags), id]);
  return result.changes > 0;
}

export async function deleteJournalNote(driver: SqlDriver, id: number): Promise<boolean> {
  const result = await driver.run('DELETE FROM journal_notes WHERE id = ?', [id]);
  return result.changes > 0;
}
