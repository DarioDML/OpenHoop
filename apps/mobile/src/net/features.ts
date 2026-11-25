import { isRecord, type Json } from '@/lib/json';

export const NETWORK_FEATURES = ['coach'] as const;
export type NetworkFeature = (typeof NETWORK_FEATURES)[number];

export const FEATURE_HOSTS: Readonly<Record<NetworkFeature, readonly string[]>> = {
  coach: ['api.anthropic.com'],
};

export interface NetworkPrefs {
  enabled: boolean;
  features: Record<NetworkFeature, boolean>;
}

export function defaultNetworkPrefs(): NetworkPrefs {
  return { enabled: false, features: { coach: false } };
}

export function parseNetworkPrefs(value: Json | undefined): NetworkPrefs {
  const prefs = defaultNetworkPrefs();
  if (!isRecord(value)) return prefs;
  prefs.enabled = value.enabled === true;
  const features = value.features;
  if (isRecord(features)) {
    for (const feature of NETWORK_FEATURES) prefs.features[feature] = features[feature] === true;
  }
  return prefs;
}

export function featureEnabled(prefs: NetworkPrefs, feature: NetworkFeature): boolean {
  return prefs.enabled && prefs.features[feature];
}

export function strictestPrefs(a: NetworkPrefs, b: NetworkPrefs): NetworkPrefs {
  return { enabled: a.enabled && b.enabled, features: { coach: a.features.coach && b.features.coach } };
}
