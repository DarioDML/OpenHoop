import {
  addCoachMemory,
  appendCoachExchange,
  deleteAllCoachData,
  deleteCoachConversation,
  deleteCoachMemory,
  listCoachConversations,
  listCoachMemory,
  listCoachMessages,
  updateCoachMemory,
  type CoachConversation,
  type CoachMemoryNote,
  type CoachMemorySource,
  type CoachMessage,
  type CoachMessageInput,
  type SqlDriver,
} from '@openhoop/core';

export interface CoachRepo {
  conversations(): Promise<CoachConversation[]>;
  messages(conversationId: number): Promise<CoachMessage[]>;
  appendExchange(conversationId: number | null, title: string, messages: readonly CoachMessageInput[], now: number): Promise<number>;
  deleteConversation(conversationId: number): Promise<boolean>;
  memory(): Promise<CoachMemoryNote[]>;
  addMemory(text: string, source: CoachMemorySource, now: number): Promise<number | null>;
  updateMemory(id: number, text: string, now: number): Promise<boolean>;
  deleteMemory(id: number): Promise<boolean>;
  deleteAll(): Promise<void>;
}

export function sqlCoachRepo(driver: () => Promise<SqlDriver>): CoachRepo {
  return {
    conversations: async () => listCoachConversations(await driver()),
    messages: async (conversationId) => listCoachMessages(await driver(), conversationId),
    appendExchange: async (conversationId, title, messages, now) => appendCoachExchange(await driver(), conversationId, title, messages, now),
    deleteConversation: async (conversationId) => deleteCoachConversation(await driver(), conversationId),
    memory: async () => listCoachMemory(await driver()),
    addMemory: async (text, source, now) => addCoachMemory(await driver(), text, source, now),
    updateMemory: async (id, text, now) => updateCoachMemory(await driver(), id, text, now),
    deleteMemory: async (id) => deleteCoachMemory(await driver(), id),
    deleteAll: async () => deleteAllCoachData(await driver()),
  };
}
