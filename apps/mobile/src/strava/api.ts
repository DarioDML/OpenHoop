import { isRecord, parseJson, type Json } from '@/lib/json';
import { NetworkRefusedError, type GatedFetch, type GatedRequestInit } from '@/net/gate';

export const STRAVA_HOST = 'www.strava.com';
export const AUTHORIZE_URL = `https://${STRAVA_HOST}/oauth/mobile/authorize`;
export const TOKEN_URL = `https://${STRAVA_HOST}/oauth/token`;
export const REVOKE_URL = `https://${STRAVA_HOST}/oauth/revoke`;
export const UPLOADS_URL = `https://${STRAVA_HOST}/api/v3/uploads`;
export const ACTIVITIES_URL = `https://${STRAVA_HOST}/api/v3/activities`;
export const CALLBACK_DOMAIN = 'localhost';
export const REDIRECT_URI = `openhoop://${CALLBACK_DOMAIN}/strava-callback`;
export const SCOPE = 'activity:write';
export const REQUEST_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

const CLIENT_ID = /^\d{1,12}$/;
const CLIENT_SECRET = /^[A-Za-z0-9]{20,128}$/;
const TOKEN = /^[A-Za-z0-9]{20,256}$/;
const CODE = /^[A-Za-z0-9]{10,256}$/;
const STATE = /^[0-9a-f]{32,128}$/;
const NUMERIC_ID = /^\d{1,20}$/;
const DUPLICATE = /duplicate of/i;
const DUPLICATE_ID = /duplicate of\D{0,60}?(\d{1,20})/i;

export interface StravaClient {
  clientId: string;
  clientSecret: string;
}

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

export type StravaErrorKind =
  | 'network-off'
  | 'no-client'
  | 'invalid-client'
  | 'not-connected'
  | 'reconnect'
  | 'cancelled'
  | 'denied'
  | 'state-mismatch'
  | 'scope-missing'
  | 'unauthorized'
  | 'rate-limited'
  | 'duplicate'
  | 'already-uploaded'
  | 'maybe-sent'
  | 'busy'
  | 'rejected'
  | 'processing-failed'
  | 'deleted'
  | 'server'
  | 'invalid-response'
  | 'timeout'
  | 'network'
  | 'storage';

export type StravaResult<T> = { ok: true; value: T } | { ok: false; error: StravaErrorKind };

export function cleanClient(clientId: string, clientSecret: string): StravaClient | null {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  return CLIENT_ID.test(id) && CLIENT_SECRET.test(secret) ? { clientId: id, clientSecret: secret } : null;
}

export function isToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN.test(value);
}

export function hasWriteScope(scope: string): boolean {
  return scope.split(/[\s,]+/).includes(SCOPE);
}

export function formEncode(fields: Readonly<Record<string, string>>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export function authorizeUrl(clientId: string, state: string): string {
  return `${AUTHORIZE_URL}?${formEncode({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: SCOPE,
    state,
  })}`;
}

export function isOAuthState(value: string): boolean {
  return STATE.test(value);
}

function queryOf(url: string): Map<string, string> | null {
  if (!url.startsWith(`${REDIRECT_URI}?`) && !url.startsWith(`${REDIRECT_URI}/?`)) return null;
  const query = url.slice(url.indexOf('?') + 1).split('#')[0] ?? '';
  const out = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    const rawKey = eq < 0 ? pair : pair.slice(0, eq);
    const rawValue = eq < 0 ? '' : pair.slice(eq + 1);
    try {
      const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      if (out.has(key)) return null;
      out.set(key, decodeURIComponent(rawValue.replace(/\+/g, ' ')));
    } catch {
      return null;
    }
  }
  return out;
}

export function readRedirect(url: string, expectedState: string): StravaResult<{ code: string; scope: string }> {
  const query = queryOf(url);
  if (query === null) return { ok: false, error: 'invalid-response' };
  if (query.get('state') !== expectedState) return { ok: false, error: 'state-mismatch' };
  if (query.has('error')) return { ok: false, error: query.get('error') === 'access_denied' ? 'denied' : 'rejected' };
  const code = query.get('code') ?? '';
  const scope = query.get('scope') ?? '';
  if (!CODE.test(code)) return { ok: false, error: 'invalid-response' };
  if (!hasWriteScope(scope)) return { ok: false, error: 'scope-missing' };
  return { ok: true, value: { code, scope } };
}

export function parseTokens(body: Json | undefined, fallbackScope: string): StravaTokens | null {
  if (!isRecord(body)) return null;
  const { token_type: type, access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, scope } = body;
  if (typeof type !== 'string' || type.toLowerCase() !== 'bearer') return null;
  if (!isToken(accessToken) || !isToken(refreshToken)) return null;
  if (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) return null;
  const granted = typeof scope === 'string' && scope.length <= 200 ? scope : fallbackScope;
  return { accessToken, refreshToken, expiresAt, scope: granted };
}

export function errorForStatus(status: number): StravaErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'scope-missing';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server';
  return 'rejected';
}

interface Reply {
  status: number;
  body: Json | undefined;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function request(send: GatedFetch, url: string, init: GatedRequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<StravaResult<Reply>> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await send('strava', url, { ...init, signal: abort.signal });
    const text = await response.text();
    return { ok: true, value: { status: response.status, body: text === '' ? undefined : parseJson(text) } };
  } catch (error) {
    if (error instanceof NetworkRefusedError) return { ok: false, error: 'network-off' };
    if (isAbort(error)) return { ok: false, error: 'timeout' };
    return { ok: false, error: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } as const;

function bearer(accessToken: string): Record<string, string> {
  if (!isToken(accessToken)) throw new Error('invalid token');
  return { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
}

async function tokenRequest(send: GatedFetch, client: StravaClient, fields: Record<string, string>, fallbackScope: string): Promise<StravaResult<StravaTokens>> {
  const reply = await request(send, TOKEN_URL, {
    method: 'POST',
    headers: { ...FORM_HEADERS },
    body: formEncode({ client_id: client.clientId, client_secret: client.clientSecret, ...fields }),
  });
  if (!reply.ok) return reply;
  const { status, body } = reply.value;
  if (status === 400 || status === 401 || status === 403) return { ok: false, error: fields.grant_type === 'refresh_token' ? 'reconnect' : 'invalid-client' };
  if (status !== 200) return { ok: false, error: errorForStatus(status) };
  const tokens = parseTokens(body, fallbackScope);
  return tokens === null ? { ok: false, error: 'invalid-response' } : { ok: true, value: tokens };
}

export function exchangeCode(send: GatedFetch, client: StravaClient, code: string, scope: string): Promise<StravaResult<StravaTokens>> {
  return tokenRequest(send, client, { code, grant_type: 'authorization_code' }, scope);
}

export function refreshTokens(send: GatedFetch, client: StravaClient, tokens: StravaTokens): Promise<StravaResult<StravaTokens>> {
  return tokenRequest(send, client, { grant_type: 'refresh_token', refresh_token: tokens.refreshToken }, tokens.scope);
}

export function basicAuth(client: StravaClient): string {
  return `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`;
}

export async function revokeToken(send: GatedFetch, client: StravaClient, refreshToken: string): Promise<StravaResult<null>> {
  if (!isToken(refreshToken)) return { ok: false, error: 'invalid-response' };
  const reply = await request(send, REVOKE_URL, {
    method: 'POST',
    headers: { ...FORM_HEADERS, Authorization: basicAuth(client) },
    body: formEncode({ token: refreshToken, token_type_hint: 'refresh_token' }),
  });
  if (!reply.ok) return reply;
  return reply.value.status === 200 ? { ok: true, value: null } : { ok: false, error: errorForStatus(reply.value.status) };
}

export type UploadStatus = 'processing' | 'ready' | 'duplicate' | 'failed' | 'deleted';

export interface StravaUpload {
  uploadId: string;
  status: UploadStatus;
  activityId: string | null;
}

function idOf(value: Json | undefined): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && NUMERIC_ID.test(value)) return value;
  return null;
}

export function parseUpload(body: Json | undefined): StravaUpload | null {
  if (!isRecord(body)) return null;
  const uploadId = idOf(body.id_str) ?? idOf(body.id);
  if (uploadId === null) return null;
  const activityId = idOf(body.activity_id);
  const error = typeof body.error === 'string' ? body.error.slice(0, 2_000) : null;
  const status = typeof body.status === 'string' ? body.status.slice(0, 500).toLowerCase() : '';
  if (error !== null && error.trim() !== '') {
    if (DUPLICATE.test(error)) return { uploadId, status: 'duplicate', activityId: DUPLICATE_ID.exec(error)?.[1] ?? activityId };
    return { uploadId, status: 'failed', activityId: null };
  }
  if (status.includes('deleted')) return { uploadId, status: 'deleted', activityId };
  if (activityId !== null) return { uploadId, status: 'ready', activityId };
  if (status.includes('error')) return { uploadId, status: 'failed', activityId: null };
  return { uploadId, status: 'processing', activityId: null };
}

export interface UploadFields {
  externalId: string;
  name: string;
  sportType: string;
}

export const MULTIPART_BOUNDARY = 'OpenHoopStravaUpload7f3a9c2e51d84b06';
const CONTROL = /[\u0000-\u001f\u007f"]/g;

function safeField(value: string, max: number): string {
  return value.replace(CONTROL, ' ').trim().slice(0, max);
}

export function multipartBody(tcx: string, fields: UploadFields): string | null {
  const parts: Array<[string, string]> = [
    ['data_type', 'tcx'],
    ['external_id', safeField(fields.externalId, 100)],
    ['name', safeField(fields.name, 100)],
    ['sport_type', safeField(fields.sportType, 60)],
  ];
  if (tcx.includes(MULTIPART_BOUNDARY) || parts.some(([, value]) => value === '')) return null;
  const lines: string[] = [];
  for (const [name, value] of parts) {
    lines.push(`--${MULTIPART_BOUNDARY}`, `Content-Disposition: form-data; name="${name}"`, '', value);
  }
  lines.push(
    `--${MULTIPART_BOUNDARY}`,
    `Content-Disposition: form-data; name="file"; filename="${safeField(fields.externalId, 100)}"`,
    'Content-Type: application/vnd.garmin.tcx+xml',
    '',
    tcx,
    `--${MULTIPART_BOUNDARY}--`,
    '',
  );
  return lines.join('\r\n');
}

export async function createUpload(send: GatedFetch, accessToken: string, tcx: string, fields: UploadFields): Promise<StravaResult<StravaUpload>> {
  const body = multipartBody(tcx, fields);
  if (body === null) return { ok: false, error: 'rejected' };
  const reply = await request(
    send,
    UPLOADS_URL,
    { method: 'POST', headers: { ...bearer(accessToken), 'Content-Type': `multipart/form-data; boundary=${MULTIPART_BOUNDARY}` }, body },
    UPLOAD_TIMEOUT_MS,
  );
  if (!reply.ok) return reply;
  const { status } = reply.value;
  const upload = parseUpload(reply.value.body);
  if (status === 400) return upload?.status === 'duplicate' ? { ok: true, value: upload } : { ok: false, error: 'rejected' };
  if (status !== 200 && status !== 201) return { ok: false, error: errorForStatus(status) };
  return upload === null ? { ok: false, error: 'invalid-response' } : { ok: true, value: upload };
}

export async function getUpload(send: GatedFetch, accessToken: string, uploadId: string): Promise<StravaResult<StravaUpload>> {
  if (!NUMERIC_ID.test(uploadId)) return { ok: false, error: 'invalid-response' };
  const reply = await request(send, `${UPLOADS_URL}/${uploadId}`, { method: 'GET', headers: bearer(accessToken) });
  if (!reply.ok) return reply;
  if (reply.value.status === 404) return { ok: true, value: { uploadId, status: 'deleted', activityId: null } };
  if (reply.value.status !== 200) return { ok: false, error: errorForStatus(reply.value.status) };
  const upload = parseUpload(reply.value.body);
  return upload === null || upload.uploadId !== uploadId ? { ok: false, error: 'invalid-response' } : { ok: true, value: upload };
}

export interface ManualActivity {
  name: string;
  sportType: string;
  startDateLocal: string;
  elapsedS: number;
}

export async function createManualActivity(send: GatedFetch, accessToken: string, activity: ManualActivity): Promise<StravaResult<string>> {
  const reply = await request(send, ACTIVITIES_URL, {
    method: 'POST',
    headers: { ...bearer(accessToken), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formEncode({
      name: activity.name,
      sport_type: activity.sportType,
      start_date_local: activity.startDateLocal,
      elapsed_time: String(activity.elapsedS),
    }),
  });
  if (!reply.ok) return reply;
  const { status, body } = reply.value;
  if (status !== 200 && status !== 201) return { ok: false, error: errorForStatus(status) };
  const id = isRecord(body) ? idOf(body.id) : null;
  return id === null ? { ok: false, error: 'invalid-response' } : { ok: true, value: id };
}
