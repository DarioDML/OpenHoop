import { FEATURE_HOSTS, type NetworkFeature, type NetworkPrefs } from './features';

export type GateRefusal = 'network-off' | 'feature-off' | 'invalid-url' | 'not-https' | 'host-not-allowed';
export type GateDecision = { allowed: true } | { allowed: false; reason: GateRefusal };

export class NetworkRefusedError extends Error {
  readonly reason: GateRefusal;

  constructor(reason: GateRefusal) {
    super(`network request refused: ${reason}`);
    this.name = 'NetworkRefusedError';
    this.reason = reason;
  }
}

export interface GatedRequestInit {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type Transport = (url: string, init: RequestInit) => Promise<Response>;
export type GatedFetch = (feature: NetworkFeature, url: string, init: GatedRequestInit) => Promise<Response>;

const URL_PARTS = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([/?#][^\s]*)?$/;
const AUTHORITY = /^([a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::443)?$/;
const UNSAFE = /[\s\\\u0000-\u001f\u007f]/;

function hostOf(url: string): { scheme: string; host: string } | null {
  if (UNSAFE.test(url)) return null;
  const parts = URL_PARTS.exec(url);
  if (parts === null) return null;
  const scheme = (parts[1] ?? '').toLowerCase();
  const authority = (parts[2] ?? '').toLowerCase();
  const host = AUTHORITY.exec(authority)?.[1];
  if (host === undefined) return null;
  return { scheme, host };
}

export function checkRequest(prefs: NetworkPrefs, feature: NetworkFeature, url: string): GateDecision {
  if (!prefs.enabled) return { allowed: false, reason: 'network-off' };
  if (!prefs.features[feature]) return { allowed: false, reason: 'feature-off' };
  const target = hostOf(url);
  if (target === null) return { allowed: false, reason: 'invalid-url' };
  if (target.scheme !== 'https') return { allowed: false, reason: 'not-https' };
  if (!FEATURE_HOSTS[feature].includes(target.host)) return { allowed: false, reason: 'host-not-allowed' };
  return { allowed: true };
}

export function createGate(getPrefs: () => NetworkPrefs, transport: Transport): GatedFetch {
  return async (feature, url, init) => {
    const decision = checkRequest(getPrefs(), feature, url);
    if (!decision.allowed) throw new NetworkRefusedError(decision.reason);
    const response = await transport(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: init.signal,
      redirect: 'error',
      credentials: 'omit',
    });
    if (response.url !== '' && response.url !== url) {
      const landed = checkRequest(getPrefs(), feature, response.url);
      if (!landed.allowed) throw new NetworkRefusedError(landed.reason);
    }
    return response;
  };
}
