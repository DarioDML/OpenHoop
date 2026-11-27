import { WHEN_UNLOCKED_THIS_DEVICE_ONLY, deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

import { isRecord, parseJson } from '@/lib/json';

import { cleanClient, isToken, type StravaClient, type StravaTokens } from './api';

const CLIENT_ITEM = 'openhoop.strava.client';
const TOKENS_ITEM = 'openhoop.strava.tokens';
const OPTIONS = { keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export interface StravaVault {
  loadClient(): Promise<StravaClient | null>;
  saveClient(client: StravaClient): Promise<void>;
  loadTokens(): Promise<StravaTokens | null>;
  saveTokens(tokens: StravaTokens): Promise<void>;
  removeTokens(): Promise<void>;
  wipe(): Promise<void>;
}

export function parseStoredClient(raw: string | null): StravaClient | null {
  if (raw === null) return null;
  const value = parseJson(raw);
  if (!isRecord(value) || typeof value.clientId !== 'string' || typeof value.clientSecret !== 'string') return null;
  return cleanClient(value.clientId, value.clientSecret);
}

export function parseStoredTokens(raw: string | null): StravaTokens | null {
  if (raw === null) return null;
  const value = parseJson(raw);
  if (!isRecord(value)) return null;
  const { accessToken, refreshToken, expiresAt, scope } = value;
  if (!isToken(accessToken) || !isToken(refreshToken)) return null;
  if (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) return null;
  if (typeof scope !== 'string' || scope.length > 200) return null;
  return { accessToken, refreshToken, expiresAt, scope };
}

export const secureStravaVault: StravaVault = {
  async loadClient() {
    return parseStoredClient(await getItemAsync(CLIENT_ITEM, OPTIONS));
  },
  async saveClient(client) {
    await setItemAsync(CLIENT_ITEM, JSON.stringify({ clientId: client.clientId, clientSecret: client.clientSecret }), OPTIONS);
  },
  async loadTokens() {
    return parseStoredTokens(await getItemAsync(TOKENS_ITEM, OPTIONS));
  },
  async saveTokens(tokens) {
    await setItemAsync(TOKENS_ITEM, JSON.stringify(tokens), OPTIONS);
  },
  async removeTokens() {
    await deleteItemAsync(TOKENS_ITEM, OPTIONS);
  },
  async wipe() {
    await deleteItemAsync(TOKENS_ITEM, OPTIONS);
    await deleteItemAsync(CLIENT_ITEM, OPTIONS);
  },
};
