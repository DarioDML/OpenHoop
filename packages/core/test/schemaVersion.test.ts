import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, copySchemaVersion, openStore } from '../src/index';
import type { Store } from '../src/index';
import { openNodeDriver } from '../src/node/index';

describe('copySchemaVersion', () => {
  let dir: string;
  let store: Store;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'openhoop-schema-'));
    store = await openStore(openNodeDriver(join(dir, 'main.db')));
  });
  afterEach(async () => {
    await store.driver.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('gives an exported copy the schema version of the database it came from', async () => {
    const copy = join(dir, 'copy.db');
    await store.driver.exec(`VACUUM main INTO '${copy}'`);
    await store.driver.exec(`ATTACH DATABASE '${copy}' AS plaintext`);
    await store.driver.exec('PRAGMA plaintext.user_version = 0');
    await copySchemaVersion(store.driver, 'plaintext');
    const rows = await store.driver.all<{ user_version: number }>('PRAGMA plaintext.user_version');
    expect(rows[0]?.user_version).toBe(SCHEMA_VERSION);
    await store.driver.exec('DETACH DATABASE plaintext');
    const reopened = await openStore(openNodeDriver(copy));
    expect(await reopened.listDevices()).toEqual([]);
    await reopened.driver.close();
  });

  it('is needed because a copy without the version cannot be opened again', async () => {
    const copy = join(dir, 'copy.db');
    await store.driver.exec(`VACUUM main INTO '${copy}'`);
    const raw = openNodeDriver(copy);
    await raw.exec('PRAGMA user_version = 0');
    await expect(openStore(raw)).rejects.toThrow('already exists');
    await raw.close();
  });

  it('refuses a schema name that is not a plain identifier', async () => {
    await expect(copySchemaVersion(store.driver, 'x; DROP TABLE devices')).rejects.toThrow('schema name');
  });
});
