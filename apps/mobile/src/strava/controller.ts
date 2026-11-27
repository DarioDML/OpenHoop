import type { GatedFetch } from '@/net/gate';

import {
  REDIRECT_URI,
  authorizeUrl,
  cleanClient,
  createManualActivity,
  createUpload,
  exchangeCode,
  getUpload,
  hasWriteScope,
  isOAuthState,
  readRedirect,
  refreshTokens,
  revokeToken,
  type StravaErrorKind,
  type StravaResult,
  type StravaTokens,
  type StravaUpload,
} from './api';
import { isLedgerKey, type Ledger, type LedgerEntry, type LedgerStore } from './ledger';
import { planUpload, type UploadSource } from './tcx';
import type { StravaVault } from './vault';

export const REFRESH_MARGIN_S = 600;
export const POLL_ATTEMPTS = 10;
export const POLL_INTERVAL_MS = 2_000;

export type StravaConnection = 'none' | 'connected' | 'reconnect';
export type StravaBusy = 'client' | 'connect' | 'disconnect' | null;

export interface StravaState {
  ready: boolean;
  hasClient: boolean;
  connection: StravaConnection;
  busy: StravaBusy;
  error: StravaErrorKind | null;
  revokeFailed: boolean;
  ledger: Ledger;
  uploading: string | null;
  uploadErrors: Readonly<Record<string, StravaErrorKind>>;
}

export type AuthSessionResult = { type: 'success'; url: string } | { type: 'cancel' };

export interface StravaDeps {
  vault: StravaVault;
  ledger: LedgerStore;
  send: GatedFetch;
  now: () => number;
  allowed: (url: string) => boolean;
  openAuth: (url: string, redirect: string) => Promise<AuthSessionResult>;
  randomState: () => Promise<string>;
  wait: (ms: number) => Promise<void>;
}

function failure<T>(error: StravaErrorKind): StravaResult<T> {
  return { ok: false, error };
}

export class StravaController {
  private state: StravaState = {
    ready: false,
    hasClient: false,
    connection: 'none',
    busy: null,
    error: null,
    revokeFailed: false,
    ledger: {},
    uploading: null,
    uploadErrors: {},
  };
  private readonly listeners = new Set<() => void>();
  private tokenChain: Promise<void> = Promise.resolve();

  constructor(private readonly deps: StravaDeps) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): StravaState => this.state;

  private patch(change: Partial<StravaState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of [...this.listeners]) listener();
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tokenChain.then(task, task);
    this.tokenChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  load = async (): Promise<void> => {
    try {
      const [client, tokens, ledger] = await Promise.all([this.deps.vault.loadClient(), this.deps.vault.loadTokens(), this.deps.ledger.load()]);
      this.patch({ hasClient: client !== null, connection: client !== null && tokens !== null ? 'connected' : 'none', ledger });
    } catch {
      this.patch({ error: 'storage' });
    }
    this.patch({ ready: true });
  };

  clearError = (): void => {
    this.patch({ error: null, revokeFailed: false });
  };

  saveClient = async (clientId: string, clientSecret: string): Promise<boolean> => {
    if (this.state.busy !== null || this.state.connection === 'connected') return false;
    const client = cleanClient(clientId, clientSecret);
    if (client === null) {
      this.patch({ error: 'invalid-client' });
      return false;
    }
    this.patch({ busy: 'client', error: null });
    try {
      await this.serial(async () => {
        await this.deps.vault.removeTokens();
        await this.deps.vault.saveClient(client);
      });
      this.patch({ hasClient: true, connection: 'none' });
      return true;
    } catch {
      this.patch({ error: 'storage' });
      return false;
    } finally {
      this.patch({ busy: null });
    }
  };

  connect = async (): Promise<boolean> => {
    if (this.state.busy !== null) return false;
    this.patch({ busy: 'connect', error: null, revokeFailed: false });
    try {
      const result = await this.authorize();
      if (!result.ok) {
        this.patch({ error: result.error });
        return false;
      }
      const tokens = result.value;
      await this.serial(() => this.deps.vault.saveTokens(tokens));
      this.patch({ connection: 'connected' });
      return true;
    } catch {
      this.patch({ error: 'storage' });
      return false;
    } finally {
      this.patch({ busy: null });
    }
  };

  private async authorize(): Promise<StravaResult<StravaTokens>> {
    const client = await this.deps.vault.loadClient();
    if (client === null) return failure('no-client');
    const state = await this.deps.randomState();
    if (!isOAuthState(state)) return failure('storage');
    const url = authorizeUrl(client.clientId, state);
    if (!this.deps.allowed(url)) return failure('network-off');
    const session = await this.deps.openAuth(url, REDIRECT_URI);
    if (session.type !== 'success') return failure('cancelled');
    const redirect = readRedirect(session.url, state);
    if (!redirect.ok) return redirect;
    const tokens = await exchangeCode(this.deps.send, client, redirect.value.code, redirect.value.scope);
    if (!tokens.ok) return tokens;
    return hasWriteScope(tokens.value.scope) ? tokens : failure('scope-missing');
  }

  disconnect = async (): Promise<boolean> => {
    if (this.state.busy !== null) return false;
    this.patch({ busy: 'disconnect', error: null, revokeFailed: false });
    try {
      const revoked = await this.serial(async () => {
        let outcome: boolean | null = null;
        try {
          const [client, tokens] = await Promise.all([this.deps.vault.loadClient(), this.deps.vault.loadTokens()]);
          if (client !== null && tokens !== null) outcome = (await revokeToken(this.deps.send, client, tokens.refreshToken)).ok;
        } catch {
          outcome = false;
        }
        await this.deps.vault.wipe();
        return outcome;
      });
      this.patch({ hasClient: false, connection: 'none', revokeFailed: revoked === false });
      return true;
    } catch {
      this.patch({ error: 'storage' });
      return false;
    } finally {
      this.patch({ busy: null });
    }
  };

  private freshTokens(force: boolean, stale: string | null): Promise<StravaResult<StravaTokens>> {
    return this.serial(async () => {
      const [client, tokens] = await Promise.all([this.deps.vault.loadClient(), this.deps.vault.loadTokens()]);
      if (client === null) return failure<StravaTokens>('no-client');
      if (tokens === null) return failure<StravaTokens>(this.state.connection === 'reconnect' ? 'reconnect' : 'not-connected');
      if (force && stale !== null && tokens.accessToken !== stale) return { ok: true, value: tokens };
      if (!force && tokens.expiresAt - this.deps.now() > REFRESH_MARGIN_S) return { ok: true, value: tokens };
      const next = await refreshTokens(this.deps.send, client, tokens);
      if (!next.ok) {
        if (next.error === 'reconnect') await this.dropTokens();
        return next;
      }
      await this.deps.vault.saveTokens(next.value);
      return next;
    });
  }

  private async dropTokens(): Promise<void> {
    await this.deps.vault.removeTokens();
    this.patch({ connection: 'reconnect' });
  }

  private async authorized<T>(task: (accessToken: string) => Promise<StravaResult<T>>): Promise<StravaResult<T>> {
    const first = await this.freshTokens(false, null);
    if (!first.ok) return first;
    const result = await task(first.value.accessToken);
    if (result.ok || result.error !== 'unauthorized') return result;
    const second = await this.freshTokens(true, first.value.accessToken);
    if (!second.ok) return second;
    const retry = await task(second.value.accessToken);
    if (retry.ok || retry.error !== 'unauthorized') return retry;
    await this.serial(() => this.dropTokens());
    return failure('reconnect');
  }

  private async saveLedger(ledger: Ledger): Promise<void> {
    await this.deps.ledger.save(ledger);
    this.patch({ ledger });
  }

  private async record(key: string, upload: StravaUpload): Promise<StravaErrorKind | null> {
    const at = this.deps.now();
    const { [key]: previous, ...rest } = this.state.ledger;
    let entry: LedgerEntry | null = null;
    let error: StravaErrorKind | null = null;
    if (upload.status === 'processing') entry = { status: 'processing', uploadId: upload.uploadId, at: previous?.at ?? at };
    else if (upload.status === 'ready' && upload.activityId !== null) entry = { status: 'done', uploadId: upload.uploadId, activityId: upload.activityId, at };
    else if (upload.status === 'duplicate') {
      entry = { status: 'duplicate', uploadId: upload.uploadId, activityId: upload.activityId, at };
      error = 'duplicate';
    } else error = upload.status === 'deleted' ? 'deleted' : 'processing-failed';
    await this.saveLedger(entry === null ? rest : { ...rest, [key]: entry });
    return error;
  }

  private setUploadError(key: string, error: StravaErrorKind | null): void {
    const { [key]: _previous, ...rest } = this.state.uploadErrors;
    this.patch({ uploadErrors: error === null ? rest : { ...rest, [key]: error } });
  }

  private async poll(key: string, uploadId: string, attempts: number): Promise<StravaErrorKind | null> {
    for (let i = 0; i < attempts; i++) {
      await this.deps.wait(POLL_INTERVAL_MS);
      const status = await this.authorized((access) => getUpload(this.deps.send, access, uploadId));
      if (!status.ok) return status.error;
      const error = await this.record(key, status.value);
      if (status.value.status !== 'processing') return error;
    }
    return null;
  }

  private async runUpload(key: string, task: () => Promise<StravaErrorKind | null>): Promise<boolean> {
    if (!isLedgerKey(key)) return false;
    if (this.state.uploading !== null) {
      this.setUploadError(key, 'busy');
      return false;
    }
    this.patch({ uploading: key });
    this.setUploadError(key, null);
    try {
      const error = await task();
      this.setUploadError(key, error);
      return error === null;
    } catch {
      this.setUploadError(key, 'storage');
      return false;
    } finally {
      this.patch({ uploading: null });
    }
  }

  upload = (source: UploadSource): Promise<boolean> =>
    this.runUpload(source.key, async () => {
      if (this.state.ledger[source.key] !== undefined) return 'already-uploaded';
      const plan = planUpload(source);
      if (plan === null) return 'rejected';
      if (plan.kind === 'manual') {
        const created = await this.authorized((access) => createManualActivity(this.deps.send, access, plan));
        if (!created.ok) return created.error;
        await this.saveLedger({ ...this.state.ledger, [source.key]: { status: 'done', uploadId: null, activityId: created.value, at: this.deps.now() } });
        return null;
      }
      const created = await this.authorized((access) =>
        createUpload(this.deps.send, access, plan.tcx, { externalId: plan.externalId, name: plan.name, sportType: plan.sportType }),
      );
      if (!created.ok) return created.error;
      const error = await this.record(source.key, created.value);
      if (created.value.status !== 'processing') return error;
      return this.poll(source.key, created.value.uploadId, POLL_ATTEMPTS);
    });

  checkUpload = (key: string): Promise<boolean> =>
    this.runUpload(key, async () => {
      const entry = this.state.ledger[key];
      if (entry === undefined || entry.status !== 'processing') return null;
      const status = await this.authorized((access) => getUpload(this.deps.send, access, entry.uploadId));
      if (!status.ok) return status.error;
      return this.record(key, status.value);
    });
}
