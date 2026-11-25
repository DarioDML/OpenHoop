import type { CoachConversation, CoachMemoryNote, CoachMessage } from '@openhoop/core';
import type { ReactElement, ReactNode } from 'react';
import { useSyncExternalStore } from 'react';

import { CoachContext } from '@/coach/CoachContext';
import { CoachController } from '@/coach/controller';
import type { KeyStore } from '@/coach/keyStore';
import type { CoachRepo } from '@/coach/repo';
import type { AppData, Language } from '@/data/types';
import type { GatedFetch } from '@/net/gate';

import { withAppData } from './appData';

export const TEST_KEY = 'sk-ant-api03-TESTKEYabcdefghijklmnopqrstuvwxyz0123456789';

export interface MemoryRepo extends CoachRepo {
  written: string[];
}

export function memoryRepo(): MemoryRepo {
  const conversations: Array<Omit<CoachConversation, 'messageCount'>> = [];
  const messages: CoachMessage[] = [];
  let notes: CoachMemoryNote[] = [];
  let nextId = 1;
  const written: string[] = [];
  return {
    written,
    async conversations() {
      return conversations
        .map((c) => ({ ...c, messageCount: messages.filter((m) => m.conversationId === c.id).length }))
        .sort((a, b) => b.updatedAt - a.updatedAt || b.id - a.id);
    },
    async messages(conversationId) {
      return messages.filter((m) => m.conversationId === conversationId);
    },
    async appendExchange(conversationId, title, input, now) {
      written.push(title, ...input.map((m) => `${m.text}${m.chips}`));
      let id = conversationId;
      if (id === null) {
        id = nextId++;
        conversations.push({ id, title: title.slice(0, 80), createdAt: now, updatedAt: now });
      } else {
        const found = conversations.find((c) => c.id === id);
        if (!found) throw new Error('missing conversation');
        found.updatedAt = now;
      }
      for (const m of input) messages.push({ id: nextId++, conversationId: id, role: m.role, text: m.text, chips: m.chips, createdAt: now });
      return id;
    },
    async deleteConversation(conversationId) {
      const index = conversations.findIndex((c) => c.id === conversationId);
      if (index < 0) return false;
      conversations.splice(index, 1);
      for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.conversationId === conversationId) messages.splice(i, 1);
      return true;
    },
    async memory() {
      return notes;
    },
    async addMemory(text, source, now) {
      written.push(text);
      if (notes.length >= 50) return null;
      const id = nextId++;
      notes = [...notes, { id, text: text.trim(), source, createdAt: now, updatedAt: now }];
      return id;
    },
    async updateMemory(id, text, now) {
      written.push(text);
      const found = notes.some((n) => n.id === id);
      notes = notes.map((n) => (n.id === id ? { ...n, text: text.trim(), source: 'user', updatedAt: now } : n));
      return found;
    },
    async deleteMemory(id) {
      const before = notes.length;
      notes = notes.filter((n) => n.id !== id);
      return notes.length < before;
    },
    async deleteAll() {
      conversations.splice(0);
      messages.splice(0);
      notes = [];
    },
  };
}

export function fakeKeys(initial: string | null): KeyStore & { current: () => string | null } {
  let key = initial;
  return {
    current: () => key,
    async load() {
      return key;
    },
    async save(next) {
      const trimmed = next.trim();
      if (!/^sk-ant-[A-Za-z0-9_-]{20,250}$/.test(trimmed)) return false;
      key = trimmed;
      return true;
    },
    async remove() {
      key = null;
    },
  };
}

export function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function messageBody(text: string, stopReason = 'end_turn'): object {
  return { id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'text', text }], stop_reason: stopReason };
}

export function replyBody(reply: { chips: Array<{ metric: string; day: string }>; text: string; remember?: string | null }): object {
  return messageBody(JSON.stringify({ remember: null, ...reply }));
}

export function makeController(options: { key?: string | null; send?: GatedFetch; repo?: MemoryRepo } = {}) {
  const repo = options.repo ?? memoryRepo();
  const keys = fakeKeys(options.key === undefined ? TEST_KEY : options.key);
  const send = options.send ?? jest.fn<Promise<Response>, Parameters<GatedFetch>>(async () => jsonResponse(500, {}));
  const controller = new CoachController({ repo, keys, send, now: () => 1_000 });
  return { controller, repo, keys, send };
}

function CoachHost({ controller, children }: { controller: CoachController; children: ReactNode }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  return <CoachContext.Provider value={{ state, controller }}>{children}</CoachContext.Provider>;
}

export function withCoach(children: ReactNode, controller: CoachController, overrides: Partial<AppData> = {}, language: Language = 'en'): ReactElement {
  return withAppData(<CoachHost controller={controller}>{children}</CoachHost>, language, overrides);
}
