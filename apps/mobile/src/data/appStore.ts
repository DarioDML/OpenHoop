import { openStore, type Store } from '@openhoop/core';
import { getRandomBytes } from 'expo-crypto';
import { getItemAsync, setItemAsync } from 'expo-secure-store';

import { openExpoDriver, type ExpoDriver } from './expoSqliteDriver';
import { keyToHex, parseKeyHex } from './keyHex';

const DATABASE_NAME = 'openhoop.db';
const KEY_ITEM = 'openhoop.database.key';
const KEY_BYTES = 32;

export interface AppStore {
  store: Store;
  driver: ExpoDriver;
  databaseName: string;
  key: Uint8Array;
}

async function loadOrCreateKey(): Promise<Uint8Array> {
  const existing = parseKeyHex(await getItemAsync(KEY_ITEM));
  if (existing !== null) return existing;
  const fresh = getRandomBytes(KEY_BYTES);
  await setItemAsync(KEY_ITEM, keyToHex(fresh));
  return fresh;
}

let opening: Promise<AppStore> | null = null;

export function openAppStore(): Promise<AppStore> {
  if (opening === null) {
    opening = (async () => {
      const key = await loadOrCreateKey();
      const driver = await openExpoDriver(DATABASE_NAME, key);
      const store = await openStore(driver);
      return { store, driver, databaseName: DATABASE_NAME, key };
    })();
    opening.catch(() => {
      opening = null;
    });
  }
  return opening;
}
