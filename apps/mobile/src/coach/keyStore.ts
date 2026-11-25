import { WHEN_UNLOCKED_THIS_DEVICE_ONLY, deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

const KEY_ITEM = 'openhoop.coach.apiKey';
const KEY_FORMAT = /^sk-ant-[A-Za-z0-9_-]{20,250}$/;
const OPTIONS = { keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export interface KeyStore {
  load(): Promise<string | null>;
  save(key: string): Promise<boolean>;
  remove(): Promise<void>;
}

export function cleanApiKey(text: string): string | null {
  const trimmed = text.trim();
  return KEY_FORMAT.test(trimmed) ? trimmed : null;
}

export const secureKeyStore: KeyStore = {
  async load() {
    const stored = await getItemAsync(KEY_ITEM, OPTIONS);
    return stored === null ? null : cleanApiKey(stored);
  },
  async save(key) {
    const clean = cleanApiKey(key);
    if (clean === null) return false;
    await setItemAsync(KEY_ITEM, clean, OPTIONS);
    return true;
  },
  async remove() {
    await deleteItemAsync(KEY_ITEM, OPTIONS);
  },
};
