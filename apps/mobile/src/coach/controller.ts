import type { CoachConversation, CoachMemoryNote, CoachMessage, DayRecord } from '@openhoop/core';

import type { Language } from '@/data/types';
import { featureEnabled, type NetworkPrefs } from '@/net/features';
import type { GatedFetch } from '@/net/gate';

import { requestCoachReply, type CoachErrorKind, type CoachTurn } from './api';
import { buildSystemPrompt } from './context';
import type { KeyStore } from './keyStore';
import type { CoachPrefs } from './prefs';
import { parseCoachReply, serializeChips } from './reply';
import type { CoachRepo } from './repo';

export const MAX_QUESTION_LENGTH = 1000;
export const MEMORY_NOTE_LENGTH = 200;
export const MEMORY_NOTES = 50;
export const HISTORY_MESSAGES = 20;

export interface CoachState {
  ready: boolean;
  hasKey: boolean;
  conversations: CoachConversation[];
  memory: CoachMemoryNote[];
  activeId: number | null;
  messages: CoachMessage[];
  sending: boolean;
  error: CoachErrorKind | null;
}

export interface CoachDeps {
  repo: CoachRepo;
  keys: KeyStore;
  send: GatedFetch;
  now: () => number;
  allowed: () => boolean;
}

export interface SendContext {
  days: readonly DayRecord[];
  today: string;
  language: Language;
  prefs: CoachPrefs;
  network: NetworkPrefs;
}

export function historyTurns(messages: readonly CoachMessage[]): CoachTurn[] {
  const turns: CoachTurn[] = messages.slice(-HISTORY_MESSAGES).map((m) => ({ role: m.role === 'coach' ? 'assistant' : 'user', content: m.text }));
  while (turns[0]?.role === 'assistant') turns.shift();
  return turns;
}

export function promptFor(ctx: Omit<SendContext, 'network'>, memory: readonly CoachMemoryNote[]): string {
  return buildSystemPrompt({
    days: ctx.days,
    today: ctx.today,
    language: ctx.language,
    memory: ctx.prefs.memory ? memory.map((note) => note.text) : null,
  });
}

export class CoachController {
  private state: CoachState = {
    ready: false,
    hasKey: false,
    conversations: [],
    memory: [],
    activeId: null,
    messages: [],
    sending: false,
    error: null,
  };
  private readonly listeners = new Set<() => void>();
  private inflight: AbortController | null = null;

  constructor(private readonly deps: CoachDeps) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): CoachState => this.state;

  private patch(change: Partial<CoachState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of [...this.listeners]) listener();
  }

  private async guard<T>(task: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await task();
    } catch {
      this.patch({ error: 'storage' });
      return fallback;
    }
  }

  load = async (): Promise<void> => {
    await this.guard(async () => {
      const [hasKey, conversations, memory] = await Promise.all([
        this.deps.keys.load().then((key) => key !== null),
        this.deps.repo.conversations(),
        this.deps.repo.memory(),
      ]);
      this.patch({ hasKey, conversations, memory });
    }, undefined);
    this.patch({ ready: true });
  };

  private cancelInflight(): void {
    this.inflight?.abort();
    this.inflight = null;
  }

  open = async (conversationId: number | null): Promise<void> => {
    this.cancelInflight();
    if (conversationId === null) {
      this.patch({ activeId: null, messages: [], error: null });
      return;
    }
    await this.guard(async () => {
      const messages = await this.deps.repo.messages(conversationId);
      this.patch({ activeId: messages.length > 0 ? conversationId : null, messages, error: null });
    }, undefined);
  };

  clearError = (): void => {
    this.patch({ error: null });
  };

  send = async (question: string, ctx: SendContext): Promise<boolean> => {
    const text = question.trim();
    if (text === '' || text.length > MAX_QUESTION_LENGTH || this.state.sending) return false;
    if (!featureEnabled(ctx.network, 'coach')) {
      this.patch({ error: 'network-off' });
      return false;
    }
    const targetId = this.state.activeId;
    const turns: CoachTurn[] = [...historyTurns(this.state.messages), { role: 'user', content: text }];
    const abort = new AbortController();
    this.inflight = abort;
    this.patch({ sending: true, error: null });
    try {
      const apiKey = await this.deps.keys.load();
      if (abort.signal.aborted) return false;
      if (apiKey === null) {
        this.patch({ hasKey: false, error: 'no-key' });
        return false;
      }
      const result = await requestCoachReply(
        this.deps.send,
        { apiKey, model: ctx.prefs.model, system: promptFor(ctx, this.state.memory), turns },
        { signal: abort.signal },
      );
      if (abort.signal.aborted) return false;
      if (!this.deps.allowed()) {
        this.patch({ error: 'network-off' });
        return false;
      }
      if (!result.ok) {
        this.patch({ error: result.error });
        return false;
      }
      const reply = parseCoachReply(result.text);
      if (reply === null) {
        this.patch({ error: 'invalid-response' });
        return false;
      }
      return await this.guard(async () => {
        const now = this.deps.now();
        const id = await this.deps.repo.appendExchange(
          targetId,
          text,
          [
            { role: 'user', text, chips: '[]' },
            { role: 'coach', text: reply.text, chips: serializeChips(reply.chips) },
          ],
          now,
        );
        if (ctx.prefs.memory && reply.remember !== null) await this.deps.repo.addMemory(reply.remember, 'coach', now);
        const [messages, conversations, memory] = await Promise.all([
          this.deps.repo.messages(id),
          this.deps.repo.conversations(),
          this.deps.repo.memory(),
        ]);
        this.patch(abort.signal.aborted ? { conversations, memory } : { activeId: id, messages, conversations, memory });
        return true;
      }, false);
    } finally {
      if (this.inflight === abort) this.inflight = null;
      this.patch({ sending: false });
    }
  };

  deleteConversation = async (conversationId: number): Promise<boolean> =>
    this.guard(async () => {
      if (this.state.activeId === conversationId) this.cancelInflight();
      const deleted = await this.deps.repo.deleteConversation(conversationId);
      const conversations = await this.deps.repo.conversations();
      const closing = this.state.activeId === conversationId;
      this.patch({ conversations, ...(closing ? { activeId: null, messages: [] } : {}) });
      return deleted;
    }, false);

  private async refreshMemory(): Promise<void> {
    this.patch({ memory: await this.deps.repo.memory() });
  }

  addMemory = async (text: string): Promise<boolean> =>
    this.guard(async () => {
      const id = await this.deps.repo.addMemory(text, 'user', this.deps.now());
      await this.refreshMemory();
      return id !== null;
    }, false);

  updateMemory = async (id: number, text: string): Promise<boolean> =>
    this.guard(async () => {
      const updated = await this.deps.repo.updateMemory(id, text, this.deps.now());
      await this.refreshMemory();
      return updated;
    }, false);

  deleteMemory = async (id: number): Promise<boolean> =>
    this.guard(async () => {
      const deleted = await this.deps.repo.deleteMemory(id);
      await this.refreshMemory();
      return deleted;
    }, false);

  saveKey = async (key: string): Promise<boolean> =>
    this.guard(async () => {
      const saved = await this.deps.keys.save(key);
      if (saved) this.patch({ hasKey: true, error: null });
      return saved;
    }, false);

  removeKey = async (): Promise<boolean> =>
    this.guard(async () => {
      this.cancelInflight();
      await this.deps.keys.remove();
      this.patch({ hasKey: false });
      return true;
    }, false);

  deleteAll = async (): Promise<boolean> =>
    this.guard(async () => {
      this.cancelInflight();
      await this.deps.keys.remove();
      await this.deps.repo.deleteAll();
      this.patch({ hasKey: false, conversations: [], memory: [], activeId: null, messages: [], error: null });
      return true;
    }, false);
}
