import type { SqlDriver } from './store/types';

export type CoachRole = 'user' | 'coach';
export type CoachMemorySource = 'user' | 'coach';

export const COACH_LIMITS = {
  titleLength: 80,
  messageLength: 4000,
  chipsLength: 2000,
  memoryLength: 200,
  memoryNotes: 50,
} as const;

export interface CoachConversation {
  id: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface CoachMessage {
  id: number;
  conversationId: number;
  role: CoachRole;
  text: string;
  chips: string;
  createdAt: number;
}

export interface CoachMessageInput {
  role: CoachRole;
  text: string;
  chips: string;
}

export interface CoachMemoryNote {
  id: number;
  text: string;
  source: CoachMemorySource;
  createdAt: number;
  updatedAt: number;
}

export class CoachInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoachInputError';
  }
}

function cleanText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.length > maxLength) throw new CoachInputError(`text must be 1-${maxLength} characters`);
  return trimmed;
}

function cleanTitle(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') throw new CoachInputError('title must not be empty');
  return flat.slice(0, COACH_LIMITS.titleLength);
}

function cleanChips(chips: string): string {
  if (chips.length > COACH_LIMITS.chipsLength) throw new CoachInputError('chips are too long');
  return chips;
}

type ConversationRow = { id: number; title: string; created_at: number; updated_at: number; message_count: number };
type MessageRow = { id: number; conversation_id: number; role: string; text: string; chips: string; created_at: number };
type MemoryRow = { id: number; text: string; source: string; created_at: number; updated_at: number };

function toRole(value: string): CoachRole {
  return value === 'coach' ? 'coach' : 'user';
}

export async function listCoachConversations(driver: SqlDriver): Promise<CoachConversation[]> {
  const rows = await driver.all<ConversationRow>(
    `SELECT c.id, c.title, c.created_at, c.updated_at, COUNT(m.id) AS message_count
     FROM coach_conversations c LEFT JOIN coach_messages m ON m.conversation_id = c.id
     GROUP BY c.id ORDER BY c.updated_at DESC, c.id DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
  }));
}

export async function listCoachMessages(driver: SqlDriver, conversationId: number): Promise<CoachMessage[]> {
  const rows = await driver.all<MessageRow>(
    'SELECT id, conversation_id, role, text, chips, created_at FROM coach_messages WHERE conversation_id = ? ORDER BY id',
    [conversationId],
  );
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    role: toRole(row.role),
    text: row.text,
    chips: row.chips,
    createdAt: row.created_at,
  }));
}

export async function appendCoachExchange(
  driver: SqlDriver,
  conversationId: number | null,
  title: string,
  messages: readonly CoachMessageInput[],
  now: number,
): Promise<number> {
  const clean = messages.map((message) => ({
    role: message.role,
    text: cleanText(message.text, COACH_LIMITS.messageLength),
    chips: cleanChips(message.chips),
  }));
  return driver.transaction(async (tx) => {
    let id = conversationId;
    if (id === null) {
      const result = await tx.run('INSERT INTO coach_conversations (title, created_at, updated_at) VALUES (?, ?, ?)', [cleanTitle(title), now, now]);
      id = result.lastInsertRowid;
    } else {
      const updated = await tx.run('UPDATE coach_conversations SET updated_at = ? WHERE id = ?', [now, id]);
      if (updated.changes === 0) throw new CoachInputError('conversation does not exist');
    }
    for (const message of clean) {
      await tx.run('INSERT INTO coach_messages (conversation_id, role, text, chips, created_at) VALUES (?, ?, ?, ?, ?)', [
        id,
        message.role,
        message.text,
        message.chips,
        now,
      ]);
    }
    return id;
  });
}

export async function deleteCoachConversation(driver: SqlDriver, conversationId: number): Promise<boolean> {
  return driver.transaction(async (tx) => {
    await tx.run('DELETE FROM coach_messages WHERE conversation_id = ?', [conversationId]);
    const result = await tx.run('DELETE FROM coach_conversations WHERE id = ?', [conversationId]);
    return result.changes > 0;
  });
}

export async function listCoachMemory(driver: SqlDriver): Promise<CoachMemoryNote[]> {
  const rows = await driver.all<MemoryRow>('SELECT id, text, source, created_at, updated_at FROM coach_memory ORDER BY id');
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    source: row.source === 'coach' ? 'coach' : 'user',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function addCoachMemory(driver: SqlDriver, text: string, source: CoachMemorySource, now: number): Promise<number | null> {
  const clean = cleanText(text, COACH_LIMITS.memoryLength);
  return driver.transaction(async (tx) => {
    const count = await tx.all<{ n: number }>('SELECT COUNT(*) AS n FROM coach_memory');
    if ((count[0]?.n ?? 0) >= COACH_LIMITS.memoryNotes) return null;
    const result = await tx.run('INSERT INTO coach_memory (text, source, created_at, updated_at) VALUES (?, ?, ?, ?)', [clean, source, now, now]);
    return result.lastInsertRowid;
  });
}

export async function updateCoachMemory(driver: SqlDriver, id: number, text: string, now: number): Promise<boolean> {
  const clean = cleanText(text, COACH_LIMITS.memoryLength);
  const result = await driver.run("UPDATE coach_memory SET text = ?, source = 'user', updated_at = ? WHERE id = ?", [clean, now, id]);
  return result.changes > 0;
}

export async function deleteCoachMemory(driver: SqlDriver, id: number): Promise<boolean> {
  const result = await driver.run('DELETE FROM coach_memory WHERE id = ?', [id]);
  return result.changes > 0;
}

export async function deleteAllCoachData(driver: SqlDriver): Promise<void> {
  await driver.transaction(async (tx) => {
    await tx.run('DELETE FROM coach_messages');
    await tx.run('DELETE FROM coach_conversations');
    await tx.run('DELETE FROM coach_memory');
  });
}
