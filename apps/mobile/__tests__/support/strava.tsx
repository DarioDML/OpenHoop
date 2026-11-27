import { useSyncExternalStore, type ReactNode } from 'react';

import type { NetworkPrefs } from '@/net/features';
import type { GatedFetch, GatedRequestInit } from '@/net/gate';
import type { StravaClient, StravaTokens } from '@/strava/api';
import { StravaContext } from '@/strava/context';
import { StravaController, type AuthSessionResult, type StravaDeps } from '@/strava/controller';
import type { Ledger, LedgerStore } from '@/strava/ledger';
import type { StravaVault } from '@/strava/vault';

export const CLIENT: StravaClient = { clientId: '12345', clientSecret: 'abcdef0123456789abcdef0123456789abcdef01' };
export const STATE = 'a'.repeat(64);
export const NOW_S = 1_764_000_000;

export function tokens(overrides: Partial<StravaTokens> = {}): StravaTokens {
  return { accessToken: 'access0000000000000000000000000000000001', refreshToken: 'refresh000000000000000000000000000000001', expiresAt: NOW_S + 6 * 3_600, scope: 'activity:write', ...overrides };
}

export interface MemoryVault extends StravaVault {
  client: StravaClient | null;
  tokens: StravaTokens | null;
}

export function memoryVault(client: StravaClient | null = null, saved: StravaTokens | null = null): MemoryVault {
  const vault: MemoryVault = {
    client,
    tokens: saved,
    loadClient: async () => vault.client,
    saveClient: async (next) => {
      vault.client = next;
    },
    loadTokens: async () => vault.tokens,
    saveTokens: async (next) => {
      vault.tokens = next;
    },
    removeTokens: async () => {
      vault.tokens = null;
    },
    wipe: async () => {
      vault.tokens = null;
      vault.client = null;
    },
  };
  return vault;
}

export interface MemoryLedger extends LedgerStore {
  saved: Ledger;
}

export function memoryLedger(initial: Ledger = {}): MemoryLedger {
  const store: MemoryLedger = {
    saved: initial,
    load: async () => store.saved,
    save: async (ledger) => {
      store.saved = ledger;
    },
  };
  return store;
}

export interface SentRequest {
  url: string;
  init: GatedRequestInit;
}

export type Route = (request: SentRequest) => Response;

export function fakeStrava(routes: Route[]): { send: GatedFetch; sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  const queue = [...routes];
  const send: GatedFetch = async (_feature, url, init) => {
    const request = { url, init };
    sent.push(request);
    const next = queue.shift();
    if (next === undefined) throw new Error(`unexpected request to ${url}`);
    return next(request);
  };
  return { send, sent };
}

export function json(status: number, body: object | null): Route {
  return () => new Response(body === null ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const STRAVA_ON: NetworkPrefs = { enabled: true, features: { coach: false, maps: false, labs: false, strava: true } };

export function makeStrava(options: Partial<StravaDeps> & { vault?: MemoryVault; ledger?: MemoryLedger; redirect?: AuthSessionResult } = {}) {
  const vault = options.vault ?? memoryVault();
  const ledger = options.ledger ?? memoryLedger();
  const opened: string[] = [];
  const deps: StravaDeps = {
    vault,
    ledger,
    send: options.send ?? (async () => new Response('', { status: 500 })),
    now: options.now ?? (() => NOW_S),
    allowed: options.allowed ?? (() => true),
    openAuth:
      options.openAuth ??
      (async (url) => {
        opened.push(url);
        return options.redirect ?? { type: 'cancel' };
      }),
    randomState: options.randomState ?? (async () => STATE),
    wait: options.wait ?? (async () => undefined),
  };
  return { controller: new StravaController(deps), vault, ledger, opened };
}

export function StravaHost({ controller, children }: { controller: StravaController; children: ReactNode }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  return <StravaContext.Provider value={{ state, controller }}>{children}</StravaContext.Provider>;
}
