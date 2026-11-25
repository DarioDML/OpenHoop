import { isRecord, parseJson, type Json } from '@/lib/json';
import { NetworkRefusedError, type GatedFetch } from '@/net/gate';

import { COACH_METRICS } from './metrics';
import type { CoachModel } from './prefs';

export const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2026-10-21';
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
export const MAX_TOKENS = 2048;
export const REQUEST_TIMEOUT_MS = 60_000;

const MODELS_WITH_FALLBACK: readonly CoachModel[] = ['claude-sonnet-5-5', 'claude-opus-5-5'];

export const REPLY_SCHEMA: Json = {
  type: 'object',
  properties: {
    chips: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          metric: { type: 'string', enum: [...COACH_METRICS] },
          day: { type: 'string', format: 'date' },
        },
        required: ['metric', 'day'],
        additionalProperties: false,
      },
    },
    text: { type: 'string' },
    remember: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['chips', 'text', 'remember'],
  additionalProperties: false,
};

export type CoachErrorKind =
  | 'network-off'
  | 'no-key'
  | 'invalid-key'
  | 'forbidden'
  | 'billing'
  | 'rate-limited'
  | 'overloaded'
  | 'server'
  | 'model-unavailable'
  | 'rejected'
  | 'refused'
  | 'incomplete'
  | 'invalid-response'
  | 'timeout'
  | 'network'
  | 'storage';

export interface CoachTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type CoachApiResult = { ok: true; text: string } | { ok: false; error: CoachErrorKind };

export interface CoachRequest {
  apiKey: string;
  model: CoachModel;
  system: string;
  turns: readonly CoachTurn[];
}

export function buildRequestBody({ model, system, turns }: Omit<CoachRequest, 'apiKey'>): string {
  const body: { [key: string]: Json } = {
    model,
    max_tokens: MAX_TOKENS,
    system,
    messages: turns.map((turn) => ({ role: turn.role, content: turn.content })),
    output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLY_SCHEMA } },
  };
  if (MODELS_WITH_FALLBACK.includes(model)) body.fallbacks = 'default';
  return JSON.stringify(body);
}

export function buildHeaders(apiKey: string, model: CoachModel): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
  };
  if (MODELS_WITH_FALLBACK.includes(model)) headers['anthropic-beta'] = FALLBACK_BETA;
  return headers;
}

export function errorForStatus(status: number): CoachErrorKind {
  if (status === 401) return 'invalid-key';
  if (status === 402) return 'billing';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'model-unavailable';
  if (status === 429) return 'rate-limited';
  if (status === 503 || status === 529) return 'overloaded';
  if (status >= 500) return 'server';
  return 'rejected';
}

export function readMessageResponse(body: Json | undefined): CoachApiResult {
  if (!isRecord(body) || !Array.isArray(body.content)) return { ok: false, error: 'invalid-response' };
  if (body.stop_reason === 'refusal') return { ok: false, error: 'refused' };
  const texts: string[] = [];
  for (const block of body.content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') texts.push(block.text);
  }
  const text = texts.join('').trim();
  if (text === '') return { ok: false, error: body.stop_reason === 'max_tokens' ? 'incomplete' : 'invalid-response' };
  if (body.stop_reason === 'max_tokens' && text.startsWith('{')) return { ok: false, error: 'incomplete' };
  return { ok: true, text };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function requestCoachReply(send: GatedFetch, request: CoachRequest, options: RequestOptions = {}): Promise<CoachApiResult> {
  const abort = new AbortController();
  const stop = (): void => abort.abort();
  const timer = setTimeout(stop, options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  options.signal?.addEventListener('abort', stop);
  if (options.signal?.aborted === true) stop();
  try {
    const response = await send('coach', MESSAGES_URL, {
      method: 'POST',
      headers: buildHeaders(request.apiKey, request.model),
      body: buildRequestBody(request),
      signal: abort.signal,
    });
    if (!response.ok) return { ok: false, error: errorForStatus(response.status) };
    return readMessageResponse(parseJson(await response.text()));
  } catch (error) {
    if (error instanceof NetworkRefusedError) return { ok: false, error: 'network-off' };
    if (isAbort(error)) return { ok: false, error: 'timeout' };
    return { ok: false, error: 'network' };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', stop);
  }
}
