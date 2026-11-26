# Donate Your Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pick days in the app and, with one button, get their raw band data plus the official values for those days as zip files of at most 24 MiB in a folder, with a prefilled GitHub issue form open to attach them to.

**Architecture:** A pure, platform-free builder in `packages/core/src/donation/` selects and filters frames per day, writes CSVs, a manifest and a README, plans the parts and streams each zip into a `PartSink`. The app (`apps/mobile`) supplies the sinks (files in the cache), copies the finished parts into a folder the donor picks, opens the GitHub form, and shows one screen.

**Tech Stack:** TypeScript (strict), fflate 0.8 (streaming `Zip`/`ZipDeflate`, `deflateSync`, `unzipSync` in tests), expo-file-system 58 (`Directory.pickDirectoryAsync`, `File.open`), expo-sharing, expo-web-browser, expo-crypto, vitest (core), jest + @testing-library/react-native (app).

**Spec:** `docs/superpowers/specs/2026-11-26-data-donation-design.md`

## Global Constraints

- Work in `D:\dev\OpenHoop-worktrees\data-donation` on `feature/data-donation`. First run `npm ci` in the root and `npm ci` in `apps/mobile` (the worktree has no `node_modules`).
- TypeScript strict, never `any`. No comments unless the logic is not obvious.
- No new dependencies.
- Part limit: `PART_LIMIT_BYTES = 25_165_824` (24 MiB). GitHub accepts 25 MB per file.
- Licence: CC0 1.0; manifest `licence: "CC0-1.0"`.
- File name: `openhoop-donation-<code>-<model>[-band-<k>]-part-<i>-of-<n>.zip`, `<model>` is `5.0`, `mg` or `unknown`; `<i>`/`<n>` count within one band's set.
- Issue title: `Data donation: <models> · <n> days · <first> to <last>` (`1 day · <day>` for one day; models joined with ` + `, e.g. `5.0 + MG`).
- Never written to a part: `devices.ble_id`, `serial`, `name`, `owner_since`; free text (`note`, `label`, `notes`, coach, journal); `route_points`; any table not named in Task 3.
- The app makes no network request. GitHub opens in the in-app browser sheet.
- Every user-facing text exists in `manage.en.json` and `manage.nl.json` with the same keys.
- Commits: conventional messages ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands. Core test: `npx vitest run packages/core/test/<file>`. App test: `cd apps/mobile && npx jest __tests__/<file>`. Typecheck: `npm run typecheck` (root) and `cd apps/mobile && npm run typecheck`. Lint: `npm run lint`.

## Review Focus

- Leaving the screen while a build runs: the build is aborted and every part removed; nothing is left in the folder. Test in Task 7.
- The remembered Android folder was deleted or its permission revoked: the app asks for a folder again instead of failing, and falls back to share sheets if the picker cannot be used. Test in Task 5.
- A band row with `model`, `serial`, `name` and `firmware` all null: every place says `unknown`, and the known-value filter list is empty. Test in Task 4.
- A double tap on Donate starts one build. Test in Task 7.
- A chosen day lost its frames between listing and building (data deleted, band reset): that day is left out and reported; when nothing is left, an error, never an empty zip. Test in Task 4.

---

### Task 1: Frame timing and identity filter

**Files:**
- Create: `packages/core/src/donation/frames.ts`, `packages/core/src/donation/index.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './donation';`)
- Test: `packages/core/test/donationFrames.test.ts`

**Interfaces:**
- Consumes: `decodeFrame`, `FrameError`, `Packet` from `@openhoop/protocol`; `DeviceRow` from `../store/types`.
- Produces:
  ```ts
  export const REMOVAL_REASONS = ['identityCommand', 'identityEvent', 'serialText', 'addressText', 'knownText',
    'beforeOwner', 'invalid', 'duplicate', 'untimed', 'corruptChunk'] as const;
  export type RemovalReason = (typeof REMOVAL_REASONS)[number];
  export type RemovalCounts = Record<RemovalReason, number>;
  export function emptyRemovalCounts(): RemovalCounts;
  export function knownIdentityValues(devices: readonly Pick<DeviceRow, 'serial' | 'name'>[]): string[];
  export function identityReason(frame: Uint8Array, packet: Packet, known: readonly string[]): RemovalReason | null;
  export interface TimedFrame { frame: Uint8Array; packet: Packet; t: number }
  export function timeChunkFrames(frames: readonly Uint8Array[], removed: RemovalCounts): TimedFrame[];
  export function frameHex(frame: Uint8Array): string;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
it('removes each identity command response', () => {
  for (const command of [35, 145, 76, 77, 140, 141, 151]) {
    const frame = encodeCommandResponse({ sequence: 1, command, originSequence: 1, result: 1 });
    expect(identityReason(frame, decodeFrame(frame), [])).toBe('identityCommand');
  }
  const other = encodeCommandResponse({ sequence: 1, command: 7, originSequence: 1, result: 1 });
  expect(identityReason(other, decodeFrame(other), [])).toBeNull();
});
it('removes outgoing identity commands by byte 10', () => {
  const frame = new Uint8Array(16); frame[8] = 35; frame[10] = 140;
  expect(identityReason(frame, { kind: 'unknown', packetType: 35 }, [])).toBe('identityCommand');
});
it('removes identity events', () => {
  for (const event of [61, 62, 109]) {
    const frame = encodeEvent({ event, unixS: 1_700_000_000 });
    expect(identityReason(frame, decodeFrame(frame), [])).toBe('identityEvent');
  }
});
it('removes frames whose text holds a serial or a Bluetooth address', () => {
  const serial = encodeConsole({ consoleSequence: 1, unixS: 1_700_000_000, text: 'id 5AG1234567' });
  const address = encodeConsole({ consoleSequence: 2, unixS: 1_700_000_000, text: 'mac AA:BB:CC:DD:EE:FF' });
  expect(identityReason(serial, decodeFrame(serial), [])).toBe('serialText');
  expect(identityReason(address, decodeFrame(address), [])).toBe('addressText');
});
it('uses stored serials and names of at least 6 characters as a second net', () => {
  const known = knownIdentityValues([{ serial: null, name: ' MyBand42 ' }, { serial: '', name: 'WHOOP' }]);
  expect(known).toEqual(['MyBand42']);
  const frame = encodeConsole({ consoleSequence: 1, unixS: 1_700_000_000, text: 'hello MyBand42' });
  expect(identityReason(frame, decodeFrame(frame), known)).toBe('knownText');
});
it('keeps ordinary biometric frames', () => {
  const frame = encodeBiometric({ recordIndex: 1, unixS: 1_700_000_000, heartRate: 60 });
  expect(identityReason(frame, decodeFrame(frame), ['MyBand42'])).toBeNull();
});
it('gives an untimed frame the time of the nearest earlier timed frame, else the next one', () => {
  const cmd = () => encodeCommandResponse({ sequence: 1, command: 7, originSequence: 1, result: 1 });
  const bio = (t: number) => encodeBiometric({ recordIndex: t, unixS: t, heartRate: 60 });
  const removed = emptyRemovalCounts();
  expect(timeChunkFrames([cmd(), bio(100), cmd(), bio(200)], removed).map((f) => f.t)).toEqual([100, 100, 100, 200]);
});
it('treats unixS 0 as untimed and drops a chunk without any timed frame', () => {
  const removed = emptyRemovalCounts();
  const cmd = encodeCommandResponse({ sequence: 1, command: 7, originSequence: 1, result: 1 });
  expect(timeChunkFrames([cmd, encodeEvent({ event: 3, unixS: 0 })], removed)).toEqual([]);
  expect(removed.untimed).toBe(2);
});
it('counts frames that fail the CRC as invalid', () => {
  const broken = encodeBiometric({ recordIndex: 1, unixS: 100, heartRate: 60 });
  broken[20] = (broken[20] ?? 0) ^ 0xff;
  const removed = emptyRemovalCounts();
  expect(timeChunkFrames([broken], removed)).toEqual([]);
  expect(removed.invalid).toBe(1);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run packages/core/test/donationFrames.test.ts`
Expected: FAIL, the module `../src/donation` is missing.

- [ ] **Step 3: Implement `packages/core/src/donation/frames.ts`**

Values from the spec:
- Command rules work on raw bytes: `frame[8] === 36 && [35, 145, 76, 77, 140, 141, 151].includes(frame[10])`, and `frame[8] === 35 && [77, 140].includes(frame[10])`.
- Event rule: `packet.kind === 'event' && [61, 62, 109].includes(packet.event)`.
- Text rules: read the bytes as Latin-1 (`String.fromCharCode`, in slices of 4,096 bytes). Use `/(?:5A[GM]|MGB)[0-9]{6,}/` and `/(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}/`, then the known values.
- Order of the checks: command, event, serial, address, known.
- A frame is timed when `'unixS' in packet && packet.unixS > 0`.
- `FrameError` from `decodeFrame` counts as `invalid`; any other error is rethrown.
- `knownIdentityValues` trims each value, keeps only those of 6 characters or more, and removes duplicates.
- `frameHex` gives lowercase hex.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/core/test/donationFrames.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/donation packages/core/src/index.ts packages/core/test/donationFrames.test.ts
git commit -m "feat(core): time raw frames and filter identity data for donations"
```

### Task 2: Donation days and the frames of one day

**Files:**
- Create: `packages/core/src/donation/days.ts`
- Test: `packages/core/test/donationDays.test.ts`

**Interfaces:**
- Consumes: Task 1 (`timeChunkFrames`, `identityReason`, `frameHex`, `RemovalCounts`); `Store.listDevices`, `Store.listDays`, `Store.readChunkFrames`, `Store.driver.all`; `ChunkIntegrityError`.
- Produces:
  ```ts
  export interface DonationBandDay { deviceId: number; model: BandModel | null; day: string; start: number; end: number; tzOffsetS: number; frameEstimate: number }
  export interface DonationDay { day: string; asleepS: number | null; official: boolean; bands: DonationBandDay[] }
  export async function listDonationDays(store: Store, nowS: number): Promise<DonationDay[]>;
  export async function collectBandDayFrames(store: Store, band: DonationBandDay, ownerSince: number | null,
    known: readonly string[], removed: RemovalCounts): Promise<TimedFrame[]>;
  ```

- [ ] **Step 1: Write the failing tests**

Seed the store the way `packages/core/test/pipeline.test.ts` does: `openStore(openStrictDriver())`, one device, chunks of `encodeBiometric` frames through `store.commitChunk` with samples from `sampleFromPacket`, then `recomputeDays`. Use 3 days, and `nowS` in the middle of day 3.

```ts
it('lists finished days with band data, newest first', async () => {
  const days = await listDonationDays(store, nowS);
  expect(days.map((d) => d.day)).toEqual([day2, day1]);
  expect(days[0]?.bands[0]).toMatchObject({ deviceId: device.id, model: '5.0', start: record2.start, end: record2.end });
  expect(days[0]?.bands[0]?.frameEstimate).toBeGreaterThan(0);
});
it('marks official values by time overlap, not by the day text', async () => {
  await store.driver.run(`INSERT INTO vendor_sleeps (onset, wake, tz_offset_s, day, nap, imported_at) VALUES (?, ?, 3600, '1999-01-01', 0, 1)`,
    [record2.start + 60, record2.start + 3_600]);
  const days = await listDonationDays(store, nowS);
  expect(days.find((d) => d.day === day2)?.official).toBe(true);
  expect(days.find((d) => d.day === day1)?.official).toBe(false);
});
it('leaves out days from before the owner took the band', async () => { /* owner_since = record1.end */
  expect((await listDonationDays(store, nowS)).map((d) => d.day)).toEqual([day2]);
});
it('merges two bands on the same day into one row', async () => {
  expect((await listDonationDays(twoBandStore, nowS))[0]?.bands.map((b) => b.deviceId)).toEqual([bandA.id, bandB.id]);
});
it('returns one day of frames in time order without duplicates', async () => {
  // the same frames committed again in a second chunk
  const removed = emptyRemovalCounts();
  const frames = await collectBandDayFrames(store, band2, null, [], removed);
  expect(frames.map((f) => f.t)).toEqual([...frames.map((f) => f.t)].sort((a, b) => a - b));
  expect(new Set(frames.map((f) => frameHex(f.frame))).size).toBe(frames.length);
  expect(removed.duplicate).toBe(duplicatedCount);
});
it('skips a corrupt chunk and counts it', async () => {
  await store.driver.run(`UPDATE raw_chunks SET frames = X'00' WHERE id = ?`, [chunkId]);
  const removed = emptyRemovalCounts();
  await collectBandDayFrames(store, band2, null, [], removed);
  expect(removed.corruptChunk).toBe(1);
});
it('drops frames from before owner_since and identity frames in the window', async () => {
  const removed = emptyRemovalCounts();
  await collectBandDayFrames(store, band2, band2.start + 600, [], removed);
  expect(removed.beforeOwner).toBe(framesInFirstTenMinutes);
  expect(removed.serialText).toBe(1); // a console frame 'id 5AG1234567' committed inside the window
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run packages/core/test/donationDays.test.ts`
Expected: FAIL, `listDonationDays` is not exported.

- [ ] **Step 3: Implement `packages/core/src/donation/days.ts`**

- **Windows.** Per device, `store.listDays(id, '0000-01-01', '9999-12-31')`. Keep records with `end <= nowS`.
- **Lower bound.** `lower = max(start, ownerSince)`.
- **Frame estimate.** `frameEstimate` is the sum of:
  - `SELECT COUNT(*) AS n FROM samples_1hz WHERE device_id = ? AND t >= ? AND t < ? AND chunk_id IS NOT NULL`
  - the same count on `events`.
  Leave out days where it is 0.
- **Official overlap.**
  - `vendor_cycles`: `start_t < :end AND COALESCE(end_t, start_t + 86400) > :start`
  - `vendor_sleeps`: `onset < :end AND wake > :start`
- **Merging.** Merge by `day` across devices, with bands sorted by `deviceId`. `asleepS` comes from the band with the highest `frameEstimate` (`record.sleep.asleepS`). Sort days with the newest first.
- **Chunks.** `collectBandDayFrames` gets the chunk ids with
  `SELECT chunk_id FROM samples_1hz WHERE device_id = ? AND t >= ? AND t < ? AND chunk_id IS NOT NULL UNION SELECT chunk_id FROM events WHERE device_id = ? AND t >= ? AND t < ? AND chunk_id IS NOT NULL ORDER BY 1`.
- **Frames.** It reads each chunk (a `ChunkIntegrityError` counts as `corruptChunk`) and calls `timeChunkFrames`. It keeps frames with `start <= t < end`, then applies these checks in order:
  1. `beforeOwner`
  2. `identityReason`
  3. `duplicate`, by `frameHex` within the day
  Finally it sorts stably by `t`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/core/test/donationDays.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/donation/days.ts packages/core/test/donationDays.test.ts
git commit -m "feat(core): list donatable days and collect a day's raw frames"
```

### Task 3: Official and OpenHoop tables for a part

**Files:**
- Modify: `packages/core/src/export.ts` (pull the CSV body of `exportCsv` into an exported `csvText`; `exportCsv` uses it)
- Create: `packages/core/src/donation/tables.ts`
- Test: `packages/core/test/donationTables.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function csvText(columns: readonly string[], rows: readonly Record<string, SqlValue>[]): string; // export.ts
  export interface DonationWindow { day: string; start: number; end: number }
  export const DONATION_TABLE_FILES = ['official/cycles.csv', 'official/sleeps.csv', 'official/workouts.csv',
    'openhoop/days.csv', 'openhoop/sleeps.csv', 'openhoop/activities.csv'] as const;
  export type DonationTableFile = (typeof DONATION_TABLE_FILES)[number];
  export async function donationTables(driver: SqlDriver, deviceId: number, windows: readonly DonationWindow[]): Promise<Record<DonationTableFile, string>>;
  ```

Columns, exactly and in this order:

| File | Columns | Rows |
| --- | --- | --- |
| `official/cycles.csv` | `start_t,end_t,tz_offset_s,day,recovery_pct,resting_hr,hrv_ms,skin_temp_c,spo2_pct,respiratory_rate,day_strain` | overlap as in Task 2, open cycle +86400 |
| `official/sleeps.csv` | `onset,wake,tz_offset_s,day,nap,performance_pct,asleep_min,in_bed_min,light_min,deep_min,rem_min,awake_min,efficiency_pct,consistency_pct,respiratory_rate` | `onset < end AND wake > start` |
| `official/workouts.csv` | `start_t,end_t,tz_offset_s,day,activity,strain,avg_hr,max_hr` | `start_t < end AND end_t > start` |
| `openhoop/days.csv` | `day,readiness,load,sleep_score` | `device_id = ? AND day IN (…)` |
| `openhoop/sleeps.csv` | `day,onset,offset,asleep_s,in_bed_s,nap,source` | `device_id = ? AND day IN (…)` |
| `openhoop/activities.csv` | `start,end,type,active_s,load,zone_seconds,avg_hr,max_hr,active_minutes` | `device_id = ? AND deleted_at IS NULL AND start < end AND "end" > start` |

A row that overlaps more than one window of the same part appears once (deduplicate by primary key, which is the first column, and order by it).

- [ ] **Step 1: Write the failing tests**

```ts
it('writes the exact headers', async () => {
  const tables = await donationTables(driver, device.id, [window]);
  expect(tables['official/workouts.csv'].split('\r\n')[0]).toBe('start_t,end_t,tz_offset_s,day,activity,strain,avg_hr,max_hr');
  // same for the other five files, with the headers from the table above
});
it('matches official rows by time overlap and writes an overlapping row once', async () => {
  // a vendor sleep with day '1999-01-01' inside window A, a cycle spanning windows A and B
  const tables = await donationTables(driver, device.id, [windowA, windowB]);
  expect(tables['official/sleeps.csv']).toContain('1999-01-01');
  expect(tables['official/cycles.csv'].trim().split('\r\n')).toHaveLength(2);
});
it('counts an open cycle until 24 hours after its start', async () => {
  // cycle start_t = windowB.start - 3600, end_t NULL → included in windowB
});
it('never writes free text, deleted activities or other tables', async () => {
  // seed: activity note 'SECRET-NOTE', a deleted activity, workouts.label 'SECRET-LABEL', vendor_journal notes 'SECRET-JOURNAL', route_points
  const all = Object.values(await donationTables(driver, device.id, [window])).join('\n');
  for (const secret of ['SECRET-NOTE', 'SECRET-LABEL', 'SECRET-JOURNAL']) expect(all).not.toContain(secret);
  expect(tables['openhoop/activities.csv'].trim().split('\r\n')).toHaveLength(2);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run packages/core/test/donationTables.test.ts`
Expected: FAIL, `donationTables` is not exported.

- [ ] **Step 3: Implement `csvText` in `export.ts` and `donationTables` in `packages/core/src/donation/tables.ts`**

- [ ] **Step 4: Run the new and the existing export tests**

Run: `npx vitest run packages/core/test/donationTables.test.ts packages/core/test/pipeline.test.ts packages/core/test/store.test.ts`
Expected: PASS. `exportCsv` output is unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/export.ts packages/core/src/donation/tables.ts packages/core/test/donationTables.test.ts
git commit -m "feat(core): write official and OpenHoop values for donated days"
```

### Task 4: Build the parts

**Files:**
- Create: `packages/core/src/donation/manifest.ts`, `packages/core/src/donation/build.ts`
- Test: `packages/core/test/donationBuild.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  ```ts
  export const DONATION_FORMAT = 'openhoop-donation/1';
  export const DONATION_LICENCE = 'CC0-1.0';
  export const PART_LIMIT_BYTES = 25_165_824;
  export const PART_MARGIN_BYTES = 1_048_576;
  export const ESTIMATED_ZIPPED_BYTES_PER_FRAME = 110;
  export function donationCode(randomBytes: (count: number) => Uint8Array): string;
  export function modelSlug(model: BandModel | null): '5.0' | 'mg' | 'unknown';
  export function modelLabel(model: BandModel | null): '5.0' | 'MG' | 'unknown';
  export function partFileName(code: string, slug: string, bandIndex: number, part: number, parts: number): string;
  export function estimateDonation(days: readonly DonationDay[], limitBytes?: number): { bytes: number; files: number };
  export interface PartSink { write(chunk: Uint8Array): Promise<void>; finish(): Promise<number>; discard(): Promise<void> }
  export interface DonationProgress { phase: 'measure' | 'write'; done: number; total: number }
  export interface BuildDonationInput {
    store: Store; days: readonly string[]; nowS: number; appVersion: string; code: string;
    openPart(fileName: string): Promise<PartSink>;
    onProgress?(progress: DonationProgress): void;
    signal?: AbortSignal;
    partLimitBytes?: number;
  }
  export interface DonationPart { fileName: string; bytes: number; model: BandModel | null; part: number; parts: number; days: string[] }
  export interface DonationResult {
    code: string; parts: DonationPart[]; days: string[]; skippedDays: string[]; officialDays: string[];
    models: (BandModel | null)[]; firmware: string[]; removed: RemovalCounts; firstDay: string; lastDay: string;
  }
  export class DonationAbortedError extends Error {}
  export class DonationEmptyError extends Error {}
  export class DonationTooLargeError extends Error {}
  export async function buildDonation(input: BuildDonationInput): Promise<DonationResult>;
  export interface DonationManifest { /* keys below */ }
  export function readmeText(manifest: DonationManifest): string;
  ```

Manifest keys, exactly these:
- `format`
- `tool`: `OpenHoop <appVersion>`
- `donation_code`
- `part` and `parts`
- `band_model`: `modelLabel`
- `firmware`: `devices.firmware`, or `unknown`
- `licence`
- `frames`
- `frame_types`: packet type as a string key, then the count
- `record_time_span_utc`: `[firstIso, lastIso]` in UTC ISO 8601, or `null`. Match wearable5.0's `re/prepare_donation.py` if its format differs.
- `days`: `[{ day, start, end, tz_offset_s, official, piece?: { index, count } }]`
- `whoop_export_files`: the three `official/*.csv`
- `files`: every entry name
- `removed`: `RemovalCounts`

README is plain English and covers:
- what the files are
- what was removed
- that dates are real
- `CC0 1.0`, linking to https://creativecommons.org/publicdomain/zero/1.0/
- that parts sharing a code belong together, and that an official row can appear in two parts

`donationCode` gives 8 characters from `abcdefghjkmnpqrstuvwxyz23456789`, one per random byte modulo 31.

Algorithm for `buildDonation`. The tests do not fix it, so here it is:
1. **Select days.** Take the selected days from `listDonationDays(store, nowS)`. Days not found go into `skippedDays`. Group the bands by device. `known` is `knownIdentityValues(listDevices())`.
2. **Measure.** For each band and each day, in ascending order:
   - collect the frames with scratch counts and build the JSONL (`{"hex":"…"}\n` per frame);
   - compressed size = `deflateSync(strToU8(jsonl), { level: 6 }).length`;
   - a day with no frames goes into `skippedDays`;
   - `budget = limit − min(PART_MARGIN_BYTES, floor(limit / 8))`, so a small test limit still leaves room;
   - when the compressed size is above `budget`, the day becomes `ceil(size / budget)` pieces with equal frame counts.
   - Call `onProgress` with phase `measure`, and check `signal` between days.
3. If no piece is left, throw `DonationEmptyError`.
4. **Plan.** For each band, pack the pieces greedily in date order while the sum stays at or below `budget`.
5. **Write.** For each band and each part:
   1. open a sink with `partFileName(code, slug, bandIndex, i, n)`; `bandIndex` counts bands of the same slug by `deviceId`, so the second one gets `-band-2`;
   2. create a streaming `Zip` with an entry `frames.jsonl` (`ZipDeflate`, level 6);
   3. collect each piece again, using the real `removed` counts, and push its lines in batches of 1,000;
   4. after every batch, `await` the queued zip output into `sink.write` in order;
   5. add the six CSVs (`donationTables` for the part's windows), `MANIFEST.json` (2-space JSON) and `README.txt`;
   6. call `zip.end()`, drain the output, and get `bytes = await sink.finish()`.
6. **Too large.** When any part is over `limit`, discard every sink, set `budget -= (bytes − limit) + PART_MARGIN_BYTES`, and redo steps 4–5. After two retries, throw `DonationTooLargeError`.
7. **Abort or error.** On an aborted `signal`, discard every opened sink and throw `DonationAbortedError`. On any other error, discard every sink and rethrow.

- [ ] **Step 1: Write the failing tests**

Use a memory sink: an array of chunks, `finish` returns the summed length, and `discard` records the name. Seed as in Task 2, and read the parts back with `unzipSync`.

```ts
it('writes one part with frames, tables, manifest and readme', async () => {
  const result = await buildDonation(input({ days: [day1, day2] }));
  expect(result.parts.map((p) => p.fileName)).toEqual([`openhoop-donation-${code}-5.0-part-1-of-1.zip`]);
  const entries = unzipSync(sinkBytes(result.parts[0]));
  expect(Object.keys(entries).sort()).toEqual(['MANIFEST.json', 'README.txt', 'frames.jsonl', ...DONATION_TABLE_FILES].sort());
  for (const line of strFromU8(entries['frames.jsonl']).trim().split('\n')) expect(line).toMatch(/^\{"hex":"[0-9a-f]+"\}$/);
  expect(JSON.parse(strFromU8(entries['MANIFEST.json']))).toMatchObject({
    format: 'openhoop-donation/1', donation_code: code, part: 1, parts: 1, band_model: '5.0', licence: 'CC0-1.0',
  });
});
it('splits days over several parts under the limit and keeps every day once', async () => {
  const result = await buildDonation(input({ days: allDays, partLimitBytes: 1_200_000 }));
  expect(result.parts.length).toBeGreaterThan(1);
  for (const part of result.parts) expect(part.bytes).toBeLessThanOrEqual(1_200_000);
  expect(result.parts.flatMap((p) => p.days).sort()).toEqual([...allDays].sort());
  expect(new Set(result.parts.map((p) => p.parts))).toEqual(new Set([result.parts.length]));
});
it('splits a day larger than the limit by time', async () => {
  // one day, limit below its compressed size: pieces {index, count} in the manifests, frames of all parts == the day's frames
});
it('makes a separate set of parts per band', async () => {
  // two '5.0' bands → names end with '-5.0-part-1-of-1.zip' and '-5.0-band-2-part-1-of-1.zip'
});
it('never writes the serial, the address or the band name, in text or in hex', async () => {
  // device serial '5AG1234567', name 'MyBand42', ble_id 'AA:BB:CC:DD:EE:FF'; console frames with each inside the window
  const text = allEntriesText(result);
  for (const value of ['5AG1234567', 'MyBand42', 'AA:BB:CC:DD:EE:FF']) {
    expect(text).not.toContain(value);
    expect(text).not.toContain(frameHex(strToU8(value)));
  }
});
it('says unknown when model, serial, name and firmware are all null', async () => {
  expect(result.parts[0]?.fileName).toContain('-unknown-part-1-of-1.zip');
  expect(manifest).toMatchObject({ band_model: 'unknown', firmware: 'unknown' });
});
it('reports days that lost their frames and refuses an empty donation', async () => {
  await expect(buildDonation(input({ days: ['2000-01-01'] }))).rejects.toBeInstanceOf(DonationEmptyError);
  const result = await buildDonation(input({ days: [day1, '2000-01-01'] }));
  expect(result.skippedDays).toEqual(['2000-01-01']);
});
it('discards every part when cancelled', async () => {
  const controller = new AbortController();
  const run = buildDonation(input({ days: allDays, signal: controller.signal, onProgress: () => controller.abort() }));
  await expect(run).rejects.toBeInstanceOf(DonationAbortedError);
  expect(discarded).toEqual(opened);
});
it('discards written parts when a write fails', async () => { /* sink.write throws in part 2 → part 1 and 2 discarded */ });
it('rebuilds with more parts when a part comes out over the limit', async () => { /* first finish() reports limit + 1 once */ });
it('estimates bytes and files from frame counts', () => {
  expect(estimateDonation([dayWith(100_000)], PART_LIMIT_BYTES)).toEqual({ bytes: 100_000 * ESTIMATED_ZIPPED_BYTES_PER_FRAME, files: 1 });
});
it('generates an 8-character code from the given random bytes', () => {
  expect(donationCode(() => new Uint8Array(8))).toBe('aaaaaaaa');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run packages/core/test/donationBuild.test.ts`
Expected: FAIL, `buildDonation` is not exported.

- [ ] **Step 3: Implement `manifest.ts` and `build.ts`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/core/test/donationBuild.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Measure one simulated day**

Add a test `measures one simulated day`, guarded with `it.runIf(process.env.DONATION_MEASURE === '1')` so the normal run skips it. It builds 86,400 biometric frames (one per second, values from `lcg` in `sampleFactory.ts`) and logs `zipped bytes / frame`.
Run: `DONATION_MEASURE=1 npx vitest run packages/core/test/donationBuild.test.ts -t "measures one simulated day"`
Expected: PASS. Then:
- set `ESTIMATED_ZIPPED_BYTES_PER_FRAME` to the logged value, rounded up to the next 10;
- replace the "about 9 MB zipped" estimate in the spec's "Splitting into parts" section with the measured number, marked "simulated data".

- [ ] **Step 6: Run all core tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core docs/superpowers/specs/2026-11-26-data-donation-design.md
git commit -m "feat(core): build donation parts under GitHub's file limit"
```

### Task 5: App file handling and the GitHub link

**Files:**
- Create: `apps/mobile/src/data/donation/files.ts`, `apps/mobile/src/data/donation/issue.ts`
- Test: `apps/mobile/__tests__/donationFiles.test.ts`, `apps/mobile/__tests__/donationIssue.test.ts`

**Interfaces:**
- Consumes: `PartSink`, `DonationResult`, `modelLabel` from `@openhoop/core`; `REPO_URL` from `@/ui/manage/links`.
- Produces:
  ```ts
  // files.ts
  export const DONATION_WORK_PREFIX = 'donation-';
  export const ANDROID_DOWNLOADS_URI = 'content://com.android.externalstorage.documents/document/primary%3ADownload';
  export const COPY_CHUNK_BYTES = 1_048_576;
  export function removeLeftoverDonations(): void;
  export function createDonationWorkspace(now: Date): Directory;
  export function filePartSink(workspace: Directory, fileName: string): PartSink;
  export type SaveOutcome = { kind: 'saved'; folderUri: string } | { kind: 'shareEach' } | { kind: 'cancelled' };
  export async function saveDonationParts(workspace: Directory, fileNames: readonly string[], remembered: string | null, platform: 'android' | 'ios'): Promise<SaveOutcome>;
  export async function sharePartFile(workspace: Directory, fileName: string): Promise<void>;
  // issue.ts
  export const DONATION_TEMPLATE = 'data-donation.yml';
  export function donationIssueTitle(result: DonationResult): string;
  export function donationIssueSummary(result: DonationResult, appVersion: string): string;
  export function donationIssueUrl(result: DonationResult, appVersion: string): string;
  ```

Behaviour that the tests pin:
- **Writing a part.** `filePartSink` writes through `File.open()` / `writeBytes`. `finish` closes the handle and returns `file.size`. `discard` deletes the file.
- **Saving.**
  - With a `remembered` folder, `saveDonationParts` first tries that folder (Android only).
  - If that fails, or there is none, it calls `Directory.pickDirectoryAsync(platform === 'android' ? ANDROID_DOWNLOADS_URI : undefined)`.
  - It writes each part with `folder.createFile(name, 'application/zip')`, copying in `COPY_CHUNK_BYTES` chunks.
  - A picker rejection with code `ERR_PICKER_CANCELLED` or `ERR_FILE_PICKING_CANCELLED` returns `{ kind: 'cancelled' }`.
  - Any other picker or write failure removes the files it already wrote and returns `{ kind: 'shareEach' }`.
- **Summary.** It starts with `Band: <models>`, then: donation code, number of files, firmware, app version, `Official values: <k> of <n> days`.
- **URL.** `${REPO_URL}/issues/new?template=data-donation.yml&title=…&summary=…`, encoded with `encodeURIComponent`.

- [ ] **Step 1: Write the failing tests**

```ts
// donationIssue.test.ts
it('starts the title with the band model', () => {
  expect(donationIssueTitle(result({ models: ['5.0'], days: 14 }))).toBe('Data donation: 5.0 · 14 days · 2026-10-03 to 2026-11-24');
  expect(donationIssueTitle(result({ models: ['5.0', 'MG'], days: 14 }))).toBe('Data donation: 5.0 + MG · 14 days · 2026-10-03 to 2026-11-24');
  expect(donationIssueTitle(result({ models: [null], days: 1 }))).toBe('Data donation: unknown · 1 day · 2026-11-24');
});
it('builds the prefilled form link and stays short for a year of days', () => {
  const url = donationIssueUrl(result({ models: ['MG'], days: 365 }), '1.4.0');
  expect(url.startsWith('https://github.com/DarioDML/OpenHoop/issues/new?template=data-donation.yml&title=')).toBe(true);
  expect(decodeURIComponent(url)).toContain('Band: MG');
  expect(url.length).toBeLessThan(8_000);
});
// donationFiles.test.ts (expo-file-system and expo-sharing mocked as in healthReportScreen.test.tsx)
it('writes into the remembered folder without asking', async () => {
  expect(await saveDonationParts(workspace, names, 'content://remembered', 'android')).toEqual({ kind: 'saved', folderUri: 'content://remembered' });
  expect(mockPickDirectory).not.toHaveBeenCalled();
});
it('asks again at Downloads when the remembered folder fails', async () => {
  mockCreateFileFailsFor('content://remembered');
  await saveDonationParts(workspace, names, 'content://remembered', 'android');
  expect(mockPickDirectory).toHaveBeenCalledWith(ANDROID_DOWNLOADS_URI);
});
it('returns cancelled when the donor closes the picker', async () => {
  mockPickDirectory.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { code: 'ERR_FILE_PICKING_CANCELLED' }));
  expect(await saveDonationParts(workspace, names, null, 'ios')).toEqual({ kind: 'cancelled' });
});
it('falls back to share sheets when the folder cannot be written and removes partial files', async () => {
  mockCreateFileFailsAfter(1);
  expect(await saveDonationParts(workspace, names, null, 'android')).toEqual({ kind: 'shareEach' });
  expect(mockDeleted).toContain(`${pickedUri}/${names[0]}`);
});
it('removes leftover donation folders at start', () => { /* only entries starting with 'donation-' */ });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && npx jest __tests__/donationIssue.test.ts __tests__/donationFiles.test.ts`
Expected: FAIL, modules are missing.

- [ ] **Step 3: Implement `files.ts` and `issue.ts`**

- [ ] **Step 4: Run them to verify they pass**

Run: `cd apps/mobile && npx jest __tests__/donationIssue.test.ts __tests__/donationFiles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/data/donation apps/mobile/__tests__/donationIssue.test.ts apps/mobile/__tests__/donationFiles.test.ts
git commit -m "feat(mobile): save donation parts to a folder and build the GitHub link"
```

### Task 6: Controller actions and shared UI pieces

**Files:**
- Modify: `apps/mobile/src/data/types.ts`, `apps/mobile/src/data/controller.ts`, `apps/mobile/__tests__/support/appData.tsx`
- Create: `apps/mobile/src/ui/manage/inAppBrowser.ts` (move `openCheckout` out of `src/app/settings/support.tsx` as `openInAppBrowser(url: string, colors: ColorTokens): Promise<boolean>`; `support.tsx` imports it)
- Modify: `apps/mobile/src/ui/controls.tsx` (add `CheckRow`)
- Test: `apps/mobile/__tests__/manage.test.tsx` (existing Support tests must still pass), `apps/mobile/__tests__/checkRow.test.tsx`

**Interfaces:**
- Consumes: Tasks 4–5.
- Produces, on `AppData`:
  ```ts
  export interface BuiltDonation extends DonationResult { workspaceUri: string }
  listDonationDays(): Promise<DonationDay[]>;                       // [] unless settings.dataSource === 'band'
  buildDonation(days: readonly string[], onProgress: (p: DonationProgress) => void, signal: AbortSignal): Promise<BuiltDonation>;
  saveDonation(built: BuiltDonation): Promise<SaveOutcome>;          // remembers folderUri under setting key 'donation.folderUri' on Android
  shareDonationPart(built: BuiltDonation, fileName: string): Promise<void>;
  discardDonation(built: BuiltDonation): void;
  ```
  ```ts
  export function CheckRow(props: { label: string; subtitle?: string; badge?: string; checked: boolean;
    onChange(next: boolean): void; testID?: string }): ReactElement; // accessibilityRole 'checkbox', accessibilityState { checked }
  ```
- Notes:
  - `buildDonation` runs inside `this.exclusive`.
  - It uses `donationCode(getRandomBytes)` (expo-crypto), `Constants.expoConfig?.version ?? '0'`, `nowSeconds()`, and `filePartSink` in `createDonationWorkspace(new Date())`.
  - `start()` calls `removeLeftoverDonations()` next to `removeLeftoverExports()`.
  - In the test app data, the stubs return `[]`, reject, return `{ kind: 'cancelled' }`, and do nothing.

- [ ] **Step 1: Write the failing test**

```ts
it('toggles and announces its state', () => {
  const onChange = jest.fn();
  render(<CheckRow label="Tue 24 Nov" checked={false} onChange={onChange} testID="row" />);
  expect(screen.getByTestId('row')).toHaveProp('accessibilityRole', 'checkbox');
  expect(screen.getByTestId('row')).toHaveProp('accessibilityState', { checked: false });
  fireEvent.press(screen.getByTestId('row'));
  expect(onChange).toHaveBeenCalledWith(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/mobile && npx jest __tests__/checkRow.test.tsx`
Expected: FAIL, `CheckRow` is not exported.

- [ ] **Step 3: Implement `CheckRow`, `inAppBrowser.ts`, the `AppData` actions, the controller methods and the stubs**

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd apps/mobile && npx jest __tests__/checkRow.test.tsx __tests__/manage.test.tsx && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src apps/mobile/__tests__
git commit -m "feat(mobile): wire donation actions into the controller"
```

### Task 7: The donation screen and its entry rows

**Files:**
- Create: `apps/mobile/src/app/settings/donate-data.tsx`
- Modify: `apps/mobile/src/app/settings/support.tsx` and `apps/mobile/src/app/settings/accuracy.tsx` (a `ListRow` with `href="/settings/donate-data"`, icon `export`, testIDs `support-donate-data` and `accuracy-donate-data`)
- Modify: `apps/mobile/src/i18n/sections/manage.en.json`, `manage.nl.json` (keys under `aboutx.donateData.*`)
- Test: `apps/mobile/__tests__/donateData.test.tsx`

**Interfaces:**
- Consumes: `AppData` actions from Task 6; `estimateDonation`, `modelLabel` from core; `donationIssueUrl` from Task 5; `openInAppBrowser`.

The screen states are:
- **Loading.**
- **Demo.** Shown when `settings.dataSource !== 'band'`: an explanation that demo data cannot be donated.
- **Empty.** No day has band data.
- **Choose.**
  - Intro card: why, what goes in, what stays out, that dates are real, that it needs a free GitHub account.
  - "Select all" toggle (testID `donate-data-all`).
  - One `CheckRow` per day: testID `donate-data-day-<day>`, the localised date, the sleep duration, and the badge "official values ✓ · most useful" when `official`.
  - An import row (`href="/settings/import"`) when no day is official.
  - The summary line (testID `donate-data-summary`): `Band 5.0 · 2 days · about 18 MB · 1 file`, from `estimateDonation`.
  - The consent `CheckRow` (testID `donate-data-consent`), with text that names the date range when more than one day is chosen and mentions CC0 1.0.
  - The Donate button (testID `donate-data-go`), disabled until at least one day is chosen and consent is given.
- **Building.** Progress text "Packing day 3 of 14" (live region), and a Cancel button (testID `donate-data-cancel`).
- **Saved.**
  - "3 files are in your folder. Attach all 3 to the post, then submit." From 11 files on, it adds that the rest can go in comments on the issue.
  - Buttons "Open GitHub again" (testID `donate-data-github`) and "Done".
  - Skipped days are named.
- **Share each.** One button per part, "Save part 1 of 3" (testID `donate-data-share-<i>`), then the GitHub button.
- **Cancelled picker.** The parts are kept and the button says "Save files".
- **Error.** The reason, with the selection kept.

Flow:
1. `buildDonation` runs.
2. `saveDonation` runs.
3. On `saved`, `openInAppBrowser(donationIssueUrl(built, version))` runs.
4. On unmount, the screen aborts the build and calls `discardDonation`.

- [ ] **Step 1: Write the failing tests**

```ts
it('lists days, marks official ones and keeps Donate disabled until consent', async () => {
  renderDonate({ listDonationDays: async () => [day('2026-11-24', true), day('2026-11-23', false)] });
  expect(await screen.findByTestId('donate-data-day-2026-11-24')).toHaveTextContent(/official values/i);
  fireEvent.press(screen.getByTestId('donate-data-day-2026-11-24'));
  expect(screen.getByTestId('donate-data-go')).toBeDisabled();
  fireEvent.press(screen.getByTestId('donate-data-consent'));
  expect(screen.getByTestId('donate-data-go')).toBeEnabled();
  expect(screen.getByTestId('donate-data-summary')).toHaveTextContent('Band 5.0 · 1 day');
});
it('selects every day with Select all', async () => { /* summary says 2 days */ });
it('builds, saves and opens the prefilled GitHub form', async () => {
  // buildDonation resolves, saveDonation → { kind: 'saved', folderUri }
  fireEvent.press(screen.getByTestId('donate-data-go'));
  await waitFor(() => expect(openBrowserAsync).toHaveBeenCalledWith(expect.stringContaining('template=data-donation.yml'), expect.anything()));
  expect(screen.getByText(/Attach all 1/)).toBeTruthy();
});
it('starts one build on a double tap', async () => { /* press twice → buildDonation called once */ });
it('aborts the build and discards it when the screen closes', async () => { /* unmount during build → signal.aborted, discardDonation called */ });
it('offers one share button per part when the folder cannot be used', async () => { /* saveDonation → shareEach; 2 parts → donate-data-share-1, -2 */ });
it('explains that demo data cannot be donated', () => { /* settings.dataSource 'demo' */ });
it('shows the Dutch texts', async () => { /* withAppData(..., 'nl'): 'Alles selecteren' */ });
it('opens the donation screen from Support and Accuracy', () => { /* rows with href '/settings/donate-data' */ });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && npx jest __tests__/donateData.test.tsx`
Expected: FAIL, the screen is missing.

- [ ] **Step 3: Implement the screen, the rows and the texts**

The English and Dutch copy follows the spec's flow section. Dutch uses the same wording as in the brainstorm ("Kies dagen", "Alles selecteren", "officiële waarden ✓", "Ik begrijp dat dit openbaar wordt op GitHub, onder mijn account, en niet terug te nemen is").

- [ ] **Step 4: Run the screen, i18n and full app tests, and typecheck**

Run: `cd apps/mobile && npx jest && npm run typecheck`
Expected: all pass. `i18n.test.ts` confirms the key sets of en and nl match.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src apps/mobile/__tests__
git commit -m "feat(mobile): add the donate-your-data screen"
```

### Task 8: GitHub issue form and documentation

**Files:**
- Create: `.github/ISSUE_TEMPLATE/data-donation.yml`
- Modify: `README.md` (a "Donate your data" part under "Support the project", and a bullet in the Privacy section)

- [ ] **Step 1: Write the issue form**

```yaml
name: Data donation
description: Share raw band data and official values from the OpenHoop app to improve accuracy.
title: "Data donation: "
labels: ["data-donation"]
body:
  - type: markdown
    attributes:
      value: |
        Everything in this issue is public and stays public. It is linked to your GitHub account.
        Donated data is shared under CC0 1.0: anyone may use it for anything.
  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: Filled in by the app. Please leave it as it is.
    validations:
      required: true
  - type: textarea
    id: files
    attributes:
      label: Files
      description: Attach every openhoop-donation-…zip file the app saved. More files can go in comments.
    validations:
      required: true
  - type: checkboxes
    id: consent
    attributes:
      label: Consent
      options:
        - label: I understand this is public, linked to my GitHub account, cannot be taken back, and shared under CC0 1.0.
          required: true
```

- [ ] **Step 2: Validate the YAML**

Run: `node -e "require('yaml').parse(require('fs').readFileSync('.github/ISSUE_TEMPLATE/data-donation.yml','utf8'))"`. If `yaml` is not resolvable, use `npx --yes yaml@2.6.1 valid < .github/ISSUE_TEMPLATE/data-donation.yml`.
Expected: no output, exit code 0.

- [ ] **Step 3: Update README**

Cover:
- what is shared;
- what is removed;
- that dates are real;
- CC0 1.0;
- the in-app steps: choose days, Donate, attach in GitHub.

Privacy bullet: the donation is built on the phone, the app sends nothing, and the donor posts the files themselves.

- [ ] **Step 4: Commit**

```bash
git add .github/ISSUE_TEMPLATE/data-donation.yml README.md
git commit -m "docs: add the data donation issue form and README section"
```

### Task 9: Verify, review, ship

- [ ] **Step 1: Full checks**

Run: `npm test && npm run typecheck && npm run lint && cd apps/mobile && npx jest && npm run typecheck`
Expected: all pass. Write down the counts.

- [ ] **Step 2: Android emulator**

Use the T3 device tools (`device_list`, `device_open`), not adb or simctl. Install a debug build and check these screens:
- Support → "Donate your data" in demo mode shows the demo explanation.
- In band mode without data, it shows the empty state.
- Accuracy has the row.

Take a screenshot of each state. The full flow with real raw data, a folder and a GitHub login is the owner's check.

- [ ] **Step 3: Code review**

Run `superpowers:requesting-code-review` on the whole branch, with an Opus reviewer, because the identity filter is privacy-critical. Fix what it finds. Then rerun Step 1.

- [ ] **Step 4: PR, merge, label**

1. Bring the branch up to date with `origin/master`.
2. Push and open the PR. Link it, and wait for every required check, including App builds.
3. Merge and delete the branch.
4. Then run `gh label create data-donation --description "Raw band data donated from the app" --color 0E8A16`.
