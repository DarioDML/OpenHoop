import type { RoutePoint } from '@/data/route';
import type { Json } from '@/lib/json';
import { checkRequest, createGate } from '@/net/gate';
import {
  MULTIPART_BOUNDARY,
  REDIRECT_URI,
  authorizeUrl,
  cleanClient,
  multipartBody,
  parseTokens,
  parseUpload,
  readRedirect,
} from '@/strava/api';
import { REFRESH_MARGIN_S } from '@/strava/controller';
import { parseLedger, serializeLedger } from '@/strava/ledger';
import { isStravaCallback } from '@/strava/redirect';
import { buildTcx, externalId, localIso, planUpload, stravaKey, uploadRoute, type UploadSource } from '@/strava/tcx';
import { parseStoredClient, parseStoredTokens } from '@/strava/vault';

import { CLIENT, NOW_S, STATE, STRAVA_ON, fakeStrava, json, makeStrava, memoryLedger, memoryVault, tokens, type SentRequest } from './support/strava';

const START = NOW_S - 3_600;
const END = NOW_S - 1_800;

function line(count: number, stepM: number, startMs = START * 1000): RoutePoint[] {
  const dLat = stepM / 111_320;
  return Array.from({ length: count }, (_, i) => ({ tMs: startMs + i * 10_000, lat: 51 + i * dLat, lon: 4, altM: 10, accuracyM: 5, segment: 0 }));
}

function source(overrides: Partial<UploadSource> = {}): UploadSource {
  return {
    key: 'activity:7',
    type: 'running',
    name: 'Running',
    startS: START,
    endS: END,
    tzOffsetS: 3_600,
    heartRate: [
      { t: START + 5, hr: 120 },
      { t: START + 10, hr: 130.4 },
      { t: END + 60, hr: 140 },
      { t: START + 15, hr: 300 },
    ],
    route: [],
    hideEnds: true,
    ...overrides,
  };
}

function redirectUrl(params: Record<string, string>): string {
  return `${REDIRECT_URI}?${new URLSearchParams(params).toString()}`;
}

function form(request: SentRequest | undefined): Map<string, string> {
  const body = request?.init.body ?? '';
  return new Map(body.split('&').map((pair) => pair.split('=').map(decodeURIComponent) as [string, string]));
}

function tokenBody(access: string, refresh: string, expiresAt: number, scope?: string): { [key: string]: Json } {
  return { token_type: 'Bearer', access_token: access, refresh_token: refresh, expires_at: expiresAt, expires_in: 21_600, ...(scope === undefined ? {} : { scope }), athlete: { id: 1, firstname: 'X' } };
}

describe('Strava network gate', () => {
  it('allows only https://www.strava.com for the Strava feature, and nothing while it is off', () => {
    expect(checkRequest(STRAVA_ON, 'strava', 'https://www.strava.com/api/v3/uploads')).toEqual({ allowed: true });
    expect(checkRequest(STRAVA_ON, 'strava', 'https://strava.com/api/v3/uploads')).toEqual({ allowed: false, reason: 'host-not-allowed' });
    expect(checkRequest(STRAVA_ON, 'strava', 'http://www.strava.com/oauth/token')).toEqual({ allowed: false, reason: 'not-https' });
    expect(checkRequest(STRAVA_ON, 'coach', 'https://www.strava.com/oauth/token')).toEqual({ allowed: false, reason: 'feature-off' });
    expect(checkRequest({ ...STRAVA_ON, enabled: false }, 'strava', 'https://www.strava.com/oauth/token')).toEqual({ allowed: false, reason: 'network-off' });
  });

  it('reports network-off and sends nothing when Strava is switched off', async () => {
    const transport = jest.fn(async () => new Response('{}', { status: 200 }));
    const off = { ...STRAVA_ON, features: { ...STRAVA_ON.features, strava: false } };
    const { controller } = makeStrava({ vault: memoryVault(CLIENT, tokens()), send: createGate(() => off, transport) });
    await controller.load();
    expect(await controller.upload(source())).toBe(false);
    expect(controller.getState().uploadErrors['activity:7']).toBe('network-off');
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('Strava OAuth parsing', () => {
  it('asks only for activity:write with the app scheme redirect and the state', () => {
    const url = new URL(authorizeUrl('12345', STATE));
    expect(`${url.origin}${url.pathname}`).toBe('https://www.strava.com/oauth/mobile/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '12345',
      redirect_uri: 'openhoop://localhost/strava-callback',
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'activity:write',
      state: STATE,
    });
  });

  it('accepts the redirect only with the same state, a code and the write scope', () => {
    const good = { state: STATE, code: 'abcdef0123456789', scope: 'read,activity:write' };
    expect(readRedirect(redirectUrl(good), STATE)).toEqual({ ok: true, value: { code: good.code, scope: good.scope } });
    expect(readRedirect(redirectUrl({ ...good, state: 'b'.repeat(64) }), STATE)).toEqual({ ok: false, error: 'state-mismatch' });
    expect(readRedirect(redirectUrl({ code: good.code, scope: good.scope }), STATE)).toEqual({ ok: false, error: 'state-mismatch' });
    expect(readRedirect(redirectUrl({ state: STATE, error: 'access_denied' }), STATE)).toEqual({ ok: false, error: 'denied' });
    expect(readRedirect(redirectUrl({ ...good, scope: 'read' }), STATE)).toEqual({ ok: false, error: 'scope-missing' });
    expect(readRedirect(redirectUrl({ ...good, code: 'x<y' }), STATE)).toEqual({ ok: false, error: 'invalid-response' });
    expect(readRedirect(`${redirectUrl(good)}&state=${STATE}`, STATE)).toEqual({ ok: false, error: 'invalid-response' });
    expect(readRedirect(`https://evil.example/strava-callback?state=${STATE}&code=abcdef0123456789&scope=activity:write`, STATE)).toEqual({ ok: false, error: 'invalid-response' });
  });

  it('validates client details and token answers at the boundary', () => {
    expect(cleanClient(' 12345 ', ` ${CLIENT.clientSecret} `)).toEqual(CLIENT);
    expect(cleanClient('12a45', CLIENT.clientSecret)).toBeNull();
    expect(cleanClient('12345', 'short')).toBeNull();
    expect(cleanClient('12345', `${CLIENT.clientSecret}\r\nX-Evil: 1`)).toBeNull();
    const parsed = parseTokens(tokenBody('a'.repeat(40), 'r'.repeat(40), NOW_S + 100, 'activity:write'), 'read');
    expect(parsed).toEqual({ accessToken: 'a'.repeat(40), refreshToken: 'r'.repeat(40), expiresAt: NOW_S + 100, scope: 'activity:write' });
    expect(parseTokens(tokenBody('a'.repeat(40), 'r'.repeat(40), NOW_S + 100), 'activity:write')?.scope).toBe('activity:write');
    expect(parseTokens({ ...tokenBody('a'.repeat(40), 'r'.repeat(40), NOW_S), token_type: 'mac' }, '')).toBeNull();
    expect(parseTokens(tokenBody('a b', 'r'.repeat(40), NOW_S), '')).toBeNull();
    expect(parseTokens(tokenBody('a'.repeat(40), 'r'.repeat(40), 1.5), '')).toBeNull();
  });

  it('recognises the callback deep link so the router never keeps the code', () => {
    expect(isStravaCallback('openhoop://localhost/strava-callback?code=x&state=y')).toBe(true);
    expect(isStravaCallback('/localhost/strava-callback?code=x')).toBe(true);
    expect(isStravaCallback('/strava-callback')).toBe(true);
    expect(isStravaCallback('/settings/strava')).toBe(false);
    expect(isStravaCallback('/strava-callbackx')).toBe(false);
  });
});

describe('Strava uploads parsing', () => {
  it('reads upload states, with 64-bit ids as strings', () => {
    expect(parseUpload({ id: 1, id_str: '9007199254740993', error: null, status: 'Your activity is still being processed.', activity_id: null })).toEqual({
      uploadId: '9007199254740993',
      status: 'processing',
      activityId: null,
    });
    expect(parseUpload({ id_str: '5', error: null, status: 'Your activity is ready.', activity_id: 153 })).toEqual({ uploadId: '5', status: 'ready', activityId: '153' });
    expect(parseUpload({ id_str: '5', error: 'openhoop-activity-7.tcx duplicate of <a href="/activities/987">x</a>', status: 'There was an error processing your activity.', activity_id: null })).toEqual({
      uploadId: '5',
      status: 'duplicate',
      activityId: '987',
    });
    expect(parseUpload({ id_str: '5', error: 'Time information is missing', status: 'There was an error processing your activity.' })).toEqual({ uploadId: '5', status: 'failed', activityId: null });
    expect(parseUpload({ id_str: '5', error: null, status: 'The created activity has been deleted.', activity_id: null })?.status).toBe('deleted');
    expect(parseUpload({ id_str: 'x', status: '' })).toBeNull();
    expect(parseUpload(null)).toBeNull();
  });

  it('builds a multipart body that field values cannot break out of', () => {
    const body = multipartBody('<xml/>', { externalId: 'openhoop-activity-7.tcx', name: 'Run"\r\nContent-Type: evil', sportType: 'Run' });
    expect(body).not.toBeNull();
    expect(body?.split(`--${MULTIPART_BOUNDARY}`)).toHaveLength(7);
    expect(body).toContain('name="name"\r\n\r\nRun   Content-Type: evil\r\n');
    expect(body).toContain('name="file"; filename="openhoop-activity-7.tcx"\r\nContent-Type: application/vnd.garmin.tcx+xml\r\n\r\n<xml/>\r\n');
    expect(multipartBody(`x${MULTIPART_BOUNDARY}`, { externalId: 'a', name: 'b', sportType: 'c' })).toBeNull();
  });
});

describe('Strava activity file', () => {
  it('keeps the same key when a detected workout is edited, and makes a safe file name', () => {
    expect(stravaKey({ kind: 'detected', id: null, detectedStart: 100, start: 100 })).toBe('detected:100');
    expect(stravaKey({ kind: 'edited', id: 4, detectedStart: 100, start: 160 })).toBe('detected:100');
    expect(stravaKey({ kind: 'manual', id: 4, detectedStart: null, start: 160 })).toBe('activity:4');
    expect(externalId('activity:4')).toBe('openhoop-activity-4.tcx');
    expect(localIso(START, 3_600)).toBe(new Date((START + 3_600) * 1000).toISOString().slice(0, 19));
  });

  it('writes band heart rate within the activity as a TCX track', () => {
    const plan = planUpload(source());
    if (plan?.kind !== 'file') throw new Error('expected a file');
    expect(plan.sportType).toBe('Run');
    expect(plan.heartRatePoints).toBe(2);
    expect(plan.routePoints).toBe(0);
    expect(plan.tcx).toContain('<Activity Sport="Running">');
    expect(plan.tcx).toContain('<TotalTimeSeconds>1800</TotalTimeSeconds>');
    expect(plan.tcx).toContain('<HeartRateBpm><Value>130</Value></HeartRateBpm>');
    expect(plan.tcx).not.toContain('<Value>140</Value>');
    expect(plan.tcx).not.toContain('<Value>300</Value>');
    expect(plan.tcx).not.toContain('<Position>');
  });

  it('never uploads the part of a loop that passes the start again', () => {
    const out = line(41, 10);
    const turn = line(41, 10).map((p, i) => ({ ...p, tMs: p.tMs + 410_000, lat: (out[40]?.lat ?? 51) - (i * 10) / 111_320, lon: 4.0002 }));
    const sent = uploadRoute([...out, ...turn, ...line(30, 10).map((p, i) => ({ ...p, tMs: p.tMs + 820_000, lat: 51 - ((i + 25) * 10) / 111_320 }))], true);
    const home = out[0];
    if (home === undefined) throw new Error('route');
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((p) => Math.abs(p.lat - home.lat) * 111_320 >= 199 || Math.abs(p.lon - home.lon) * 70_000 >= 199)).toBe(true);
  });

  it('leaves out 200 m around the start and end of the route by default, and all of a route shorter than that', () => {
    const route = line(61, 10);
    expect(uploadRoute(route, false)).toHaveLength(61);
    const trimmed = uploadRoute(route, true);
    expect(trimmed.length).toBeGreaterThan(15);
    expect(trimmed.length).toBeLessThan(25);
    expect(trimmed[0]?.lat).toBeGreaterThan(route[19]?.lat ?? 0);
    expect(uploadRoute(line(30, 10), true)).toEqual([]);
    const plan = planUpload(source({ route }));
    if (plan?.kind !== 'file') throw new Error('expected a file');
    expect(plan.tcx).not.toContain(`<LatitudeDegrees>${(route[0]?.lat ?? 0).toFixed(7)}</LatitudeDegrees>`);
    expect(plan.tcx).toContain('<Position>');
    expect(buildTcx({ type: 'cycling', startS: START, endS: END, heartRate: [], route })).toMatch(/<TotalTimeSeconds>1800<\/TotalTimeSeconds><DistanceMeters>599\.\d<\/DistanceMeters>/);
  });

  it('creates a manual entry when there is neither heart rate nor a route to send', () => {
    expect(planUpload(source({ heartRate: [], route: line(30, 10) }))).toEqual({
      kind: 'manual',
      name: 'Running',
      sportType: 'Run',
      startDateLocal: localIso(START, 3_600),
      elapsedS: 1_800,
    });
    expect(planUpload(source({ endS: START }))).toBeNull();
  });
});

describe('Strava stored data', () => {
  it('reads secrets and the upload ledger back only when they are valid', () => {
    expect(parseStoredClient(JSON.stringify(CLIENT))).toEqual(CLIENT);
    expect(parseStoredClient('{"clientId":"x"}')).toBeNull();
    expect(parseStoredTokens(JSON.stringify(tokens()))).toEqual(tokens());
    expect(parseStoredTokens(JSON.stringify({ ...tokens(), accessToken: 'x' }))).toBeNull();
    const ledger = { 'activity:7': { status: 'done' as const, uploadId: '5', activityId: '9', at: NOW_S }, 'detected:100': { status: 'processing' as const, uploadId: '6', at: NOW_S } };
    expect(parseLedger(serializeLedger(ledger))).toEqual(ledger);
    expect(parseLedger(JSON.stringify({ 'evil:1': ledger['activity:7'], 'activity:8': { status: 'done', activityId: null, uploadId: null, at: NOW_S }, 'activity:9': { status: 'processing', uploadId: null, at: NOW_S } }))).toEqual({});
    expect(parseLedger('nope')).toEqual({});
  });
});

describe('Strava controller', () => {
  it('connects with the code from a matching redirect and keeps the tokens only in the vault', async () => {
    const { send, sent } = fakeStrava([json(200, tokenBody('a'.repeat(40), 'r'.repeat(40), NOW_S + 21_600, 'read,activity:write'))]);
    const vault = memoryVault(CLIENT);
    const { controller, opened } = makeStrava({ vault, send, redirect: { type: 'success', url: redirectUrl({ state: STATE, code: 'code0123456789', scope: 'read,activity:write' }) } });
    await controller.load();
    expect(await controller.connect()).toBe(true);
    expect(opened[0]).toContain('state=' + STATE);
    expect(sent[0]?.url).toBe('https://www.strava.com/oauth/token');
    expect(Object.fromEntries(form(sent[0]))).toEqual({ client_id: '12345', client_secret: CLIENT.clientSecret, code: 'code0123456789', grant_type: 'authorization_code' });
    expect(vault.tokens?.accessToken).toBe('a'.repeat(40));
    expect(controller.getState().connection).toBe('connected');
    expect(JSON.stringify(controller.getState())).not.toContain(CLIENT.clientSecret);
    expect(JSON.stringify(controller.getState())).not.toContain('a'.repeat(40));
  });

  it('never exchanges a code from a redirect with another state, a denial or a cancelled sign-in', async () => {
    const { send, sent } = fakeStrava([]);
    for (const [redirect, error] of [
      [{ type: 'success' as const, url: redirectUrl({ state: 'c'.repeat(64), code: 'code0123456789', scope: 'activity:write' }) }, 'state-mismatch'],
      [{ type: 'success' as const, url: redirectUrl({ state: STATE, error: 'access_denied' }) }, 'denied'],
      [{ type: 'cancel' as const }, 'cancelled'],
    ] as const) {
      const { controller, vault } = makeStrava({ vault: memoryVault(CLIENT), send, redirect });
      expect(await controller.connect()).toBe(false);
      expect(controller.getState().error).toBe(error);
      expect(vault.tokens).toBeNull();
    }
    const { controller } = makeStrava({ vault: memoryVault(CLIENT), send, allowed: () => false });
    expect(await controller.connect()).toBe(false);
    expect(controller.getState().error).toBe('network-off');
    expect(sent).toEqual([]);
  });

  it('refreshes before the token expires and keeps the rotated refresh token', async () => {
    const vault = memoryVault(CLIENT, tokens({ expiresAt: NOW_S + REFRESH_MARGIN_S - 1 }));
    const { send, sent } = fakeStrava([
      json(200, tokenBody('b'.repeat(40), 's'.repeat(40), NOW_S + 21_600)),
      json(201, { id_str: '55', error: null, status: 'Your activity is still being processed.', activity_id: null }),
      json(200, { id_str: '55', error: null, status: 'Your activity is ready.', activity_id: 777 }),
    ]);
    const { controller, ledger } = makeStrava({ vault, send });
    await controller.load();
    expect(await controller.upload(source())).toBe(true);
    expect(Object.fromEntries(form(sent[0]))).toEqual({ client_id: '12345', client_secret: CLIENT.clientSecret, grant_type: 'refresh_token', refresh_token: tokens().refreshToken });
    expect(vault.tokens).toEqual({ accessToken: 'b'.repeat(40), refreshToken: 's'.repeat(40), expiresAt: NOW_S + 21_600, scope: 'activity:write' });
    expect(sent[1]?.url).toBe('https://www.strava.com/api/v3/uploads');
    expect(sent[1]?.init.headers?.Authorization).toBe(`Bearer ${'b'.repeat(40)}`);
    expect(sent[1]?.init.headers?.['Content-Type']).toBe(`multipart/form-data; boundary=${MULTIPART_BOUNDARY}`);
    expect(sent[1]?.init.body).toContain('name="sport_type"\r\n\r\nRun');
    expect(sent[2]?.url).toBe('https://www.strava.com/api/v3/uploads/55');
    expect(ledger.saved['activity:7']).toEqual({ status: 'done', uploadId: '55', activityId: '777', at: NOW_S });
    expect(await controller.upload(source())).toBe(false);
    expect(controller.getState().uploadErrors['activity:7']).toBe('already-uploaded');
    expect(sent).toHaveLength(3);
  });

  it('retries a 401 once after a refresh, then asks to connect again', async () => {
    const vault = memoryVault(CLIENT, tokens());
    const { send, sent } = fakeStrava([
      json(401, { message: 'Authorization Error' }),
      json(200, tokenBody('b'.repeat(40), 's'.repeat(40), NOW_S + 21_600)),
      json(401, { message: 'Authorization Error' }),
    ]);
    const { controller } = makeStrava({ vault, send });
    await controller.load();
    expect(await controller.upload(source())).toBe(false);
    expect(sent.map((r) => r.url)).toEqual(['https://www.strava.com/api/v3/uploads', 'https://www.strava.com/oauth/token', 'https://www.strava.com/api/v3/uploads']);
    expect(controller.getState().uploadErrors['activity:7']).toBe('reconnect');
    expect(controller.getState().connection).toBe('reconnect');
    expect(vault.tokens).toBeNull();
    expect(vault.client).toEqual(CLIENT);
  });

  it('asks to connect again when Strava refuses the refresh token', async () => {
    const vault = memoryVault(CLIENT, tokens({ expiresAt: NOW_S }));
    const { send } = fakeStrava([json(400, { message: 'Bad Request', errors: [{ code: 'invalid', field: 'refresh_token' }] })]);
    const { controller } = makeStrava({ vault, send });
    await controller.load();
    expect(await controller.upload(source())).toBe(false);
    expect(controller.getState().uploadErrors['activity:7']).toBe('reconnect');
    expect(controller.getState().connection).toBe('reconnect');
    expect(vault.tokens).toBeNull();
  });

  it('records a duplicate so it is never uploaded again, and reports a rate limit honestly', async () => {
    const duplicate = fakeStrava([
      json(201, { id_str: '56', error: null, status: 'Your activity is still being processed.', activity_id: null }),
      json(200, { id_str: '56', error: 'openhoop-activity-7.tcx duplicate of activity 4242', status: 'There was an error processing your activity.', activity_id: null }),
    ]);
    const first = makeStrava({ vault: memoryVault(CLIENT, tokens()), send: duplicate.send });
    await first.controller.load();
    expect(await first.controller.upload(source())).toBe(false);
    expect(first.controller.getState().uploadErrors['activity:7']).toBe('duplicate');
    expect(first.ledger.saved['activity:7']).toEqual({ status: 'duplicate', uploadId: '56', activityId: '4242', at: NOW_S });

    const limited = fakeStrava([json(429, { message: 'Rate Limit Exceeded' })]);
    const second = makeStrava({ vault: memoryVault(CLIENT, tokens()), send: limited.send });
    await second.controller.load();
    expect(await second.controller.upload(source())).toBe(false);
    expect(second.controller.getState().uploadErrors['activity:7']).toBe('rate-limited');
    expect(second.ledger.saved).toEqual({});
  });

  it('forgets a failed upload so it can be tried again, and keeps one still processing to check later', async () => {
    const failed = fakeStrava([json(201, { id_str: '57', error: 'Time information is missing', status: 'There was an error processing your activity.', activity_id: null })]);
    const a = makeStrava({ vault: memoryVault(CLIENT, tokens()), send: failed.send, ledger: memoryLedger() });
    await a.controller.load();
    expect(await a.controller.upload(source())).toBe(false);
    expect(a.controller.getState().uploadErrors['activity:7']).toBe('processing-failed');
    expect(a.ledger.saved).toEqual({});

    const processing = { id_str: '58', error: null, status: 'Your activity is still being processed.', activity_id: null };
    const slow = fakeStrava([json(201, processing), ...Array.from({ length: 10 }, () => json(200, processing)), json(200, { ...processing, status: 'Your activity is ready.', activity_id: 9 })]);
    const b = makeStrava({ vault: memoryVault(CLIENT, tokens()), send: slow.send });
    await b.controller.load();
    expect(await b.controller.upload(source())).toBe(true);
    expect(b.ledger.saved['activity:7']?.status).toBe('processing');
    expect(await b.controller.checkUpload('activity:7')).toBe(true);
    expect(b.ledger.saved['activity:7']).toEqual({ status: 'done', uploadId: '58', activityId: '9', at: NOW_S });
  });

  it('writes the ledger before sending, so a lost answer or a crash never leads to a silent second upload', async () => {
    const lost = fakeStrava([
      () => {
        throw new Error('connection reset');
      },
      json(201, { id: 4_242, name: 'Running' }),
    ]);
    const saved: string[] = [];
    const ledger = memoryLedger();
    const save = ledger.save;
    ledger.save = async (next) => {
      saved.push(Object.values(next).map((e) => e.status).join(','));
      await save(next);
    };
    const { controller } = makeStrava({ vault: memoryVault(CLIENT, tokens()), send: lost.send, ledger });
    await controller.load();
    expect(await controller.upload(source({ heartRate: [] }))).toBe(false);
    expect(saved[0]).toBe('sending');
    expect(controller.getState().uploadErrors['activity:7']).toBe('maybe-sent');
    expect(ledger.saved['activity:7']).toEqual({ status: 'sending', at: NOW_S });
    expect(await controller.upload(source({ heartRate: [] }))).toBe(false);
    expect(lost.sent).toHaveLength(1);
    expect(await controller.upload(source({ heartRate: [] }), true)).toBe(true);
    expect(lost.sent).toHaveLength(2);
    expect(ledger.saved['activity:7']).toEqual({ status: 'done', uploadId: null, activityId: '4242', at: NOW_S });

    const restarted = makeStrava({ vault: memoryVault(CLIENT, tokens()), ledger: memoryLedger({ 'activity:7': { status: 'sending', at: NOW_S } }) });
    await restarted.controller.load();
    expect(await restarted.controller.upload(source())).toBe(false);
    expect(restarted.controller.getState().uploadErrors['activity:7']).toBe('maybe-sent');
    expect(parseLedger(serializeLedger({ 'activity:7': { status: 'sending', at: NOW_S } }))).toEqual({ 'activity:7': { status: 'sending', at: NOW_S } });
  });

  it('creates a manual activity when there is no heart rate or route', async () => {
    const { send, sent } = fakeStrava([json(201, { id: 31337, name: 'Running' })]);
    const { controller, ledger } = makeStrava({ vault: memoryVault(CLIENT, tokens()), send });
    await controller.load();
    expect(await controller.upload(source({ heartRate: [] }))).toBe(true);
    expect(sent[0]?.url).toBe('https://www.strava.com/api/v3/activities');
    expect(Object.fromEntries(form(sent[0]))).toEqual({ name: 'Running', sport_type: 'Run', start_date_local: localIso(START, 3_600), elapsed_time: '1800' });
    expect(ledger.saved['activity:7']).toEqual({ status: 'done', uploadId: null, activityId: '31337', at: NOW_S });
  });

  it('revokes on disconnect with basic auth and wipes the vault, and says so when Strava cannot be reached', async () => {
    const vault = memoryVault(CLIENT, tokens());
    const { send, sent } = fakeStrava([json(200, null)]);
    const { controller } = makeStrava({ vault, send, ledger: memoryLedger({ 'activity:1': { status: 'done', uploadId: null, activityId: '1', at: NOW_S } }) });
    await controller.load();
    expect(await controller.disconnect()).toBe(true);
    expect(sent[0]?.url).toBe('https://www.strava.com/oauth/revoke');
    expect(sent[0]?.init.headers?.Authorization).toBe(`Basic ${btoa(`${CLIENT.clientId}:${CLIENT.clientSecret}`)}`);
    expect(Object.fromEntries(form(sent[0]))).toEqual({ token: tokens().refreshToken, token_type_hint: 'refresh_token' });
    expect(vault.client).toBeNull();
    expect(vault.tokens).toBeNull();
    expect(controller.getState()).toMatchObject({ hasClient: false, connection: 'none', revokeFailed: false });
    expect(Object.keys(controller.getState().ledger)).toEqual(['activity:1']);

    const offline = memoryVault(CLIENT, tokens());
    const failing = makeStrava({ vault: offline, send: async () => Promise.reject(new Error('offline')) });
    await failing.controller.load();
    expect(await failing.controller.disconnect()).toBe(true);
    expect(offline.tokens).toBeNull();
    expect(offline.client).toBeNull();
    expect(failing.controller.getState().revokeFailed).toBe(true);
  });

  it('refuses bad app details and keeps them out of the state', async () => {
    const vault = memoryVault();
    const { controller } = makeStrava({ vault });
    expect(await controller.saveClient('abc', 'secret')).toBe(false);
    expect(controller.getState().error).toBe('invalid-client');
    expect(await controller.saveClient(CLIENT.clientId, CLIENT.clientSecret)).toBe(true);
    expect(vault.client).toEqual(CLIENT);
    expect(controller.getState().hasClient).toBe(true);
    expect(JSON.stringify(controller.getState())).not.toContain(CLIENT.clientSecret);
  });
});
