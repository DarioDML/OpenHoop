import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

import { defaultNetworkPrefs, featureEnabled, parseNetworkPrefs, strictestPrefs, type NetworkPrefs } from '@/net/features';
import { NetworkRefusedError, checkRequest, createGate, type Transport } from '@/net/gate';
import { defaultUserData, parseUserData, serializeUserData } from '@/data/userData';

const ON: NetworkPrefs = { enabled: true, features: { coach: true, maps: false, labs: false, strava: false } };
const URL_OK = 'https://api.anthropic.com/v1/messages';

describe('network prefs', () => {
  it('default to everything off', () => {
    expect(defaultNetworkPrefs()).toEqual({ enabled: false, features: { coach: false, maps: false, labs: false, strava: false } });
    expect(defaultUserData().network).toEqual(defaultNetworkPrefs());
    expect(parseUserData(null).network).toEqual(defaultNetworkPrefs());
  });

  it('only accept literal true and survive a round trip', () => {
    expect(parseNetworkPrefs({ enabled: 'yes', features: { coach: 1, maps: false, labs: false, strava: false } })).toEqual(defaultNetworkPrefs());
    expect(parseNetworkPrefs([true])).toEqual(defaultNetworkPrefs());
    const stored = serializeUserData({ ...defaultUserData(), network: ON });
    expect(parseUserData(stored).network).toEqual(ON);
  });

  it('needs both switches for a feature', () => {
    expect(featureEnabled(ON, 'coach')).toBe(true);
    expect(featureEnabled({ enabled: false, features: { coach: true, maps: false, labs: false, strava: false } }, 'coach')).toBe(false);
    expect(featureEnabled({ enabled: true, features: { coach: false, maps: false, labs: false, strava: false } }, 'coach')).toBe(false);
  });

  it('take the strictest of two settings while a change is saved', () => {
    expect(strictestPrefs(ON, defaultNetworkPrefs())).toEqual(defaultNetworkPrefs());
    expect(strictestPrefs(ON, ON)).toEqual(ON);
  });
});

describe('network gate', () => {
  it.each([
    ['global switch off', { enabled: false, features: { coach: true, maps: false, labs: false, strava: false } }, URL_OK, 'network-off'],
    ['feature off', { enabled: true, features: { coach: false, maps: false, labs: false, strava: false } }, URL_OK, 'feature-off'],
    ['plain http', ON, 'http://api.anthropic.com/v1/messages', 'not-https'],
    ['another host', ON, 'https://example.com/v1/messages', 'host-not-allowed'],
    ['a look-alike host', ON, 'https://api.anthropic.com.evil.example/v1', 'host-not-allowed'],
    ['a subdomain', ON, 'https://x.api.anthropic.com/v1', 'host-not-allowed'],
    ['user info', ON, 'https://user@api.anthropic.com/v1', 'invalid-url'],
    ['another port', ON, 'https://api.anthropic.com:8443/v1', 'invalid-url'],
    ['whitespace', ON, 'https://api.anthropic.com/v1 x', 'invalid-url'],
    ['a backslash', ON, 'https://api.anthropic.com\\@evil.example/', 'invalid-url'],
    ['no scheme', ON, 'api.anthropic.com/v1', 'invalid-url'],
  ] as const)('refuses %s', (_label, prefs, url, reason) => {
    expect(checkRequest(prefs, 'coach', url)).toEqual({ allowed: false, reason });
  });

  it('allows the feature host over https, case-insensitively', () => {
    expect(checkRequest(ON, 'coach', URL_OK)).toEqual({ allowed: true });
    expect(checkRequest(ON, 'coach', 'HTTPS://API.Anthropic.com:443/v1/messages')).toEqual({ allowed: true });
  });

  it('never calls the transport when it refuses', async () => {
    const transport = jest.fn<ReturnType<Transport>, Parameters<Transport>>();
    const send = createGate(() => defaultNetworkPrefs(), transport);
    await expect(send('coach', URL_OK, { method: 'POST' })).rejects.toBeInstanceOf(NetworkRefusedError);
    expect(transport).not.toHaveBeenCalled();
  });

  it('reads the current switches on every request', async () => {
    let prefs = ON;
    const transport = jest.fn<ReturnType<Transport>, Parameters<Transport>>(async () => new Response('{}'));
    const send = createGate(() => prefs, transport);
    await send('coach', URL_OK, { method: 'POST', body: '{}' });
    prefs = { enabled: false, features: { coach: true, maps: false, labs: false, strava: false } };
    await expect(send('coach', URL_OK, { method: 'POST' })).rejects.toMatchObject({ reason: 'network-off' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', redirect: 'error', credentials: 'omit' });
  });

  it('refuses a response that landed on another host', async () => {
    const landed = new Response('{}');
    Object.defineProperty(landed, 'url', { value: 'https://evil.example/' });
    const send = createGate(() => ON, async () => landed);
    await expect(send('coach', URL_OK, { method: 'GET' })).rejects.toMatchObject({ reason: 'host-not-allowed' });
  });
});

describe('only the gate touches the network', () => {
  const SRC = join(__dirname, '..', 'src');
  const ALLOWED = new Set([join('net', 'index.ts')]);
  const FORBIDDEN = /\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\b|\bEventSource\b/;

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }

  it('finds no direct network call outside src/net/index.ts', () => {
    const offenders = files(SRC)
      .filter((path) => !ALLOWED.has(relative(SRC, path)))
      .filter((path) => FORBIDDEN.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path).split(sep).join('/'));
    expect(offenders).toEqual([]);
  });

  it('still sees the one allowed call, so the scan works', () => {
    expect(FORBIDDEN.test(readFileSync(join(SRC, 'net', 'index.ts'), 'utf8'))).toBe(true);
  });
});
