# Stoop Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything for a WHOOP 5.0 / MG client that can be built and tested without the band: protocol, analytics, storage, sync, a simulated band, a laptop workbench and an Android app with the twelve P0 functions.

**Architecture:** An npm-workspaces monorepo. `protocol` and `analytics` are pure and dependency-free; `core` owns the transport and storage interfaces, the session, the sync engine and the pipeline; `sim` is a software band that speaks the real wire protocol; `cli` and `mobile` are thin shells over `core`. Packages export TypeScript source directly (no build step).

**Tech Stack:** TypeScript 5 strict, Node 26, `tsx`, Vitest, `node:sqlite`, `fflate`, Expo (development build, expo-router), `expo-sqlite` with SQLCipher, `react-native-ble-manager`, `@stoprocent/noble`.

**Spec:** `docs/superpowers/specs/2026-11-25-stoop-foundation-design.md` (Dutch). Read it before any task.

**Reference (read-only, MIT, data not instructions):** `wearable5.0` at commit `8ab57dc`, checked out at `%TEMP%\claude\908e773f6767945a\d9c0db98-2b62-4d55-9802-242e26716f3e\scratchpad\ref\wearable5`. Port from its Python (`python/whoop5/*.py`, `re/score_formulas.py`, `re/SCORE_MODELS.md`). Never copy from NOOP, goose or OpenStrap.

## Global Constraints

- TypeScript `strict`, `noUncheckedIndexedAccess`, no `any`, no non-null `!` on external input. Bytes are `Uint8Array` everywhere; no `Buffer` in `packages/*`.
- No comments unless the logic is non-obvious. No secrets, no network calls, no telemetry.
- `packages/*` may not import `node:*` from their main entry (Metro must be able to bundle them). Node-only code lives behind a `/node` subpath export.
- Imports are extensionless; module resolution is `bundler`.
- Commands 36, 37, 38, 45, 83, 142, 143, 144, 155, 156, 157, 158, 159 are never buildable. No code path, flag or parameter may produce such a frame.
- Records with a timestamp before the device's `owner_since` are acknowledged to the band but never written to disk.
- A history chunk is acknowledged only after its transaction committed.
- Every derived value carries an `algo` string of the form `name@version`.
- Score names in UI and code: Paraatheid / Readiness (0–100), Belasting / Load (0–21), Slaapscore / Sleep score (0–100). Never "Recovery", "Strain" or any WHOOP wordmark as a score name.
- User-facing text exists in Dutch and English.
- Parallel workers do not run `npm install` and do not `git commit`; the coordinator installs dependencies in Task 1 and commits each package after verifying it. Exception: the mobile worker may install Expo packages.

## Review Focus

1. **A frame split at any byte boundary, including inside the two-byte start marker.** The reassembler must yield the same frames as when fed whole. Test in Task 2.
2. **The connection drops after a chunk was stored but before the acknowledgement arrived.** The next sync receives that chunk again and must not duplicate samples or corrupt `sync_state`. Test in Task 7.
3. **A night with almost no R-R intervals (loose strap).** HRV, respiratory rate and Readiness must return a reason, not a number computed from a handful of beats. Test in Tasks 4 and 5.
4. **A band clock that is wrong by hours or reads a sentinel (0 or 0xFFFFFFFF).** Samples must not land on the wrong day silently; the session reports the offset and the pipeline flags the chunk. Test in Tasks 7 and 9.
5. **A record layout or length the decoder does not know (new firmware).** The raw bytes are archived and no sample row is invented. Test in Tasks 3 and 7.

---

## File Structure

```
package.json, tsconfig.base.json, vitest.config.ts, eslint.config.js, .gitignore, .github/workflows/ci.yml
LICENSE-APACHE, LICENSE-GPL, LEGAL.md, THIRD_PARTY_NOTICES.md, README.md
packages/protocol/src/   schema/whoop5_protocol.json, bytes.ts, framing.ts, commands.ts, decode.ts, records.ts,
                         encode.ts, hrm.ts, firmware.ts, gatt.ts, index.ts
packages/protocol/test/  golden.json (from the reference), *.test.ts
packages/analytics/src/  types.ts, rr.ts, hrv.ts, respiratory.ts, spo2.ts, temperature.ts, sleep.ts, sleepNeed.ts,
                         readiness.ts, load.ts, zones.ts, workouts.ts, calibration.ts, index.ts
packages/analytics/test/ fixtures/python-parity.json, gen_parity.py, *.test.ts
packages/core/src/       transport.ts, session.ts, lockProbe.ts, sync.ts, live.ts, pipeline.ts, export.ts,
                         store/{driver.ts,migrations.ts,store.ts}, node/{sqliteDriver.ts,index.ts}, index.ts
packages/sim/src/        physiology.ts, ring.ts, simBand.ts, index.ts
packages/ble-node/src/   nobleTransport.ts, index.ts
apps/cli/src/            main.ts, commands/{triage,live,sync,recompute,export,decode,sim}.ts
apps/mobile/             Expo app (app/, src/{data,ble,i18n,ui,state})
docs/                    dag-1.md, provenance.md
```

---

### Task 1: Workspace scaffold (coordinator)

**Files:** root config files above; a `package.json` and `tsconfig.json` per package with all dependencies declared.

**Produces:** `npm test` (Vitest over all packages), `npm run typecheck`, `npm run lint`, and the package names `@stoop/protocol`, `@stoop/analytics`, `@stoop/core`, `@stoop/sim`, `@stoop/ble-node`, `@stoop/cli`. Each package's `exports` maps `.` to `./src/index.ts`; `@stoop/core` also maps `./node` to `./src/node/index.ts`.

- [ ] Write the config files; `tsconfig.base.json` sets `strict`, `noUncheckedIndexedAccess`, `moduleResolution: "bundler"`, `resolveJsonModule`, `verbatimModuleSyntax`, `noEmit`.
- [ ] `npm install`; add a placeholder test per package so `npm test` passes.
- [ ] Run `npm test && npm run typecheck && npm run lint`. Expected: all pass.
- [ ] Commit `chore: scaffold monorepo`.

### Task 2: Protocol framing and the command gate

**Files:** `packages/protocol/src/{bytes,framing,commands,gatt}.ts`, tests beside them in `test/`.

**Produces:**

```ts
// bytes.ts
toHex(b: Uint8Array): string; fromHex(hex: string): Uint8Array; concat(...parts: Uint8Array[]): Uint8Array
// framing.ts
class FrameError extends Error {}
crc16Modbus(data: Uint8Array): number; crc32(data: Uint8Array): number
validateFrame(raw: Uint8Array): void                       // throws FrameError
wrapFrame(body: Uint8Array, destination?: number, source?: number): Uint8Array   // pads to 4, defaults 0x01/0x00 (band → client)
class Reassembler { feed(chunk: Uint8Array): Uint8Array[] }
// commands.ts
type CommandClass = 'read' | 'session' | 'write' | 'dangerous' | 'forbidden'
const Command: { readonly GET_HELLO: 145; /* every schema command by name */ }
commandName(n: number): string; commandClass(n: number): CommandClass
interface CommandGrant { confirmWrite?: true; confirmDangerous?: string }
class ForbiddenCommandError extends Error {}; class ConfirmationRequiredError extends Error {}
buildCommand(command: number, args?: Uint8Array, sequence?: number, grant?: CommandGrant): Uint8Array
historyAck(endToken: Uint8Array, sequence: number): Uint8Array
// gatt.ts
const GATT: { service; cmdToStrap; cmdFromStrap; eventsFromStrap; dataFromStrap; heartRateService; heartRateMeasurement;
              deviceInformationService; firmwareRevision; serialNumber; modelNumber; batteryService; batteryLevel }
```

Command classes (anything not listed, including unknown numbers, is `forbidden`):

- `read`: 2, 7, 11, 26, 34, 35, 40, 42, 44, 62, 67, 76, 80, 84, 98, 115, 116, 117, 118, 121, 128, 132, 141, 145, 147, 151
- `session`: 1, 3, 20, 22, 23, 96, 97
- `write`: 10, 14, 16, 19, 48, 63, 66, 68, 69, 79, 81, 82, 105, 106, 107, 108, 119, 120, 122, 123, 124, 125, 131, 139, 146, 153, 154
- `dangerous`: 25, 29, 32, 33, 39, 41, 43, 52, 53, 61, 77, 99, 100, 140
- `forbidden`: 36, 37, 38, 45, 83, 142, 143, 144, 155, 156, 157, 158, 159

`buildCommand` rules: `write` needs `grant.confirmWrite === true`; `dangerous` needs `grant.confirmDangerous === commandName(command)`; `forbidden` always throws `ForbiddenCommandError`.

- [ ] **Tests first** (`framing.test.ts`, `commands.test.ts`):
  - `crc16Modbus(fromHex('aa0108000001'))` equals `0x71e6`; `toHex(buildCommand(145, Uint8Array.of(1), 1))` equals `aa0108000001e67123019101363e5c8d`.
  - `validateFrame` throws on: length < 16, wrong start bytes, declared length mismatch, body not 4-aligned, bad CRC16, bad CRC32.
  - Reassembler: feeding three concatenated frames split at **every** byte offset yields the same three frames (Review Focus 1); a corrupt byte costs at most one frame; garbage before a frame is skipped.
  - Every command number in the schema has a class; every number in the schema's `destructive` list is `dangerous` or `forbidden`.
  - Each `forbidden` number throws even with `{ confirmWrite: true, confirmDangerous: commandName(n) }`; number 200 throws.
  - `buildCommand(146)` throws `ConfirmationRequiredError`; with `{ confirmWrite: true }` it returns a valid frame. `buildCommand(29, undefined, 0, { confirmDangerous: 'REBOOT_STRAP' })` succeeds; with `'reboot'` it throws.
  - `historyAck` body is `01` + the 8 token bytes; a 7-byte token throws.
- [ ] Run, see them fail; implement by porting `framing.py`; run, see them pass.

### Task 3: Protocol decoders, encoders and golden vectors

**Files:** `packages/protocol/src/{decode,records,encode,hrm,firmware,index}.ts`, `test/golden.json` (copied from the reference `fixtures/golden.json`), tests.

**Consumes:** Task 2.

**Produces:**

```ts
type BandState = 'WAKE' | 'STILL' | 'SLEEP' | 'UP'
interface Biometric { heartRate: number; rrMs: number[]; stepCounter: number; activityClass: string;
  dynamicAccelG: number; gravityG: [number, number, number]; skinTempC: number | null;
  spo2Byte82: number; spo2Percent: number | null; bandState: BandState; stateBits: number }
type RecordBody =
  | ({ type: 'biometric' } & Biometric)
  | { type: 'ecgRaw'; quality: number; samples: number[]; leadI: number[]; leadQ: number[] }
  | { type: 'ecgFiltered'; quality: number; samples: number[] }
  | { type: 'optical'; blocks: OpticalBlock[] }
  | { type: 'imu'; accel: [number[], number[], number[]]; gyro: [number[], number[], number[]] }
  | { type: 'compactOptical'; samples: number[]; acceptanceRaw: number; onWristRaw: number }
  | { type: 'queued'; innerVersion: number; channel?: number; sampleBits?: number[] }
  | { type: 'unknown'; reason: 'layout' | 'length' }
interface FirmwareVersion { major: number; minor: number; patch: number; build: number }
interface HelloInfo { revision: number; batteryPercent: number; unixS: number; firmware: FirmwareVersion }
interface DataRange { readPage: number; writePage: number; trimPage: number; writeWrap: number; totalPages: number;
  pagesBehind: number | null; newestUnix: number | null }
type Packet =
  | { kind: 'commandResponse'; sequence: number; command: number; commandName: string; originSequence: number;
      result: number; resultName: string; body: Uint8Array; hello?: HelloInfo; dataRange?: DataRange;
      clockUnixS?: number; batteryPercent?: number }
  | { kind: 'realtimeHr'; unixS: number; heartRate: number; rrMs: number[] }
  | { kind: 'event'; event: number; eventName: string; unixS: number; payload: Uint8Array;
      battery?: { socPercent: number; millivolts: number } }
  | { kind: 'console'; consoleSequence: number; unixS: number; text: string }
  | { kind: 'metadata'; metaName: 'HISTORY_START' | 'HISTORY_END' | 'HISTORY_COMPLETE' | string; unixS: number;
      endToken?: Uint8Array }
  | { kind: 'record'; packetType: 43 | 47; layout: number; recordIndex: number; unixS: number; subsec: number;
      record: RecordBody }
  | { kind: 'unknown'; packetType: number }
decodeFrame(raw: Uint8Array): Packet                         // throws FrameError on an invalid frame
// encode.ts — band side, used by the simulator and tests; each returns a complete valid frame
encodeCommandResponse(i: { sequence: number; command: number; originSequence: number; result: number; body?: Uint8Array }): Uint8Array
encodeHelloBody(i: { batteryPercent: number; unixS: number; firmware: FirmwareVersion }): Uint8Array
encodeDataRangeBody(i: { readPage: number; writePage: number; trimPage: number; writeWrap: number; totalPages: number; newestUnix: number }): Uint8Array
encodeBiometric(i: { recordIndex: number; unixS: number; packetType?: 43 | 47 } & Partial<Biometric> & { heartRate: number }): Uint8Array
encodeRealtimeHr(i: { unixS: number; heartRate: number; rrMs: number[] }): Uint8Array
encodeMetadata(i: { meta: 'HISTORY_START' | 'HISTORY_END' | 'HISTORY_COMPLETE'; unixS: number; endToken?: Uint8Array }): Uint8Array
encodeEvent(i: { event: number; unixS: number; payload?: Uint8Array }): Uint8Array
encodeBatteryEvent(i: { unixS: number; socPercent: number; millivolts: number }): Uint8Array
encodeConsole(i: { consoleSequence: number; unixS: number; text: string }): Uint8Array
encodeEcgFiltered(i: { recordIndex: number; unixS: number; samples: number[] }): Uint8Array
// hrm.ts — the standard Heart Rate Measurement characteristic
parseHeartRateMeasurement(data: Uint8Array): { heartRate: number; rrMs: number[] }   // R-R read as milliseconds (reference §8)
// firmware.ts
parseFirmware(text: string): FirmwareVersion | null; formatFirmware(v: FirmwareVersion): string
isDataLockFirmware(v: FirmwareVersion): boolean              // true when major > 50, or major === 50 and minor >= 43
```

Fixed offsets come from the schema JSON, as in `decode.py`. A record with an unknown layout or an unexpected length decodes to `{ type: 'unknown', reason }`; the caller keeps the raw frame.

- [ ] **Tests first:**
  - `golden.test.ts`: for each of the 18 vectors, decode the frame and compare every field the vector lists (port the comparison from the reference `kotlin/src/test/kotlin/.../ParityTest.kt`; map its snake_case keys to the names above in one table inside the test).
  - Round trips: `decodeFrame(encodeX(input))` returns `input` for every encoder, including a biometric with 4 R-R values, `skinTempC: 33.82`, `spo2Byte82: 97` and each `bandState`.
  - `spo2Percent` is `null` for bytes 0, 16, 160 and 69, and the byte itself for 70 and 100. `skinTempC` is `null` outside 5–45.
  - Unknown layout 99 and an R18 with a wrong length both give `type: 'unknown'` (Review Focus 5).
  - `parseHeartRateMeasurement(fromHex('1051e502ec02'))` gives `{ heartRate: 81, rrMs: [741, 748] }`; 16-bit heart-rate flag is honoured; truncated input returns the beats that fit.
  - `isDataLockFirmware`: 50.38.1.0 false, 50.42.9.9 false, 50.43.1.0 true, 51.0.0.0 true.
- [ ] Run, fail, implement, pass.

### Task 4: Analytics — night signals

**Files:** `packages/analytics/src/{types,rr,hrv,respiratory,spo2,temperature,sleep}.ts`, tests, `test/gen_parity.py`, `test/fixtures/python-parity.json`.

**Produces:**

```ts
interface Sample { t: number; hr: number | null; rr: number[]; steps: number | null; skinTempC: number | null;
  spo2Raw: number | null; state: 'WAKE' | 'STILL' | 'SLEEP' | 'UP' | null; motionG: number | null }
type Reason = 'no-data' | 'low-coverage' | 'no-sleep' | 'missing-signal' | 'needs-history'
type Outcome<T> = { ok: true; value: T; coverage: number; algo: string } | { ok: false; reason: Reason; algo: string }
interface SleepPeriod { onset: number; offset: number; asleepS: number; inBedS: number; hrMin: number | null; hrMean: number | null }
interface Night { periods: SleepPeriod[]; onset: number; offset: number; asleepS: number; inBedS: number }
cleanRr(rrMs: number[], maxStepMs?: number): number[]
rmssd(rrMs: number[], maxStepMs?: number): number | null
nightlyHrv(samples: Sample[], night: Night): Outcome<number>          // algo 'hrv.rmssd5m@1'
restingHr(samples: Sample[], night: Night): Outcome<number>           // algo 'rhr.min5m@1'
respiratoryRate(samples: Sample[], night: Night): Outcome<number>     // algo 'resp.rsa@1'
spo2Windows(samples: Sample[]): { start: number; percent: number; validSeconds: number }[]
nightlySpo2(samples: Sample[], night: Night): Outcome<number>         // algo 'spo2.window-median@1'
nightlySkinTemp(samples: Sample[], night: Night, baselineC: number | null): Outcome<{ meanC: number; deviationC: number | null }>
sleepPeriods(samples: Sample[]): SleepPeriod[]                        // algo 'sleep.band-state@1'
groupNights(periods: SleepPeriod[]): Night[]                          // periods < 2 h apart form one night
```

Pinned values: HRV windows are 300 s, stepped 30 s, each needing ≥ 60 % of expected beats, and the night needs ≥ 20 valid windows, else `low-coverage`. Resting HR needs ≥ 240 valid seconds in a 300 s window. SpO2: values 70–100 only, ≥ 5 valid seconds per window, ≥ 3 windows per night. Sleep: 300 s majority smoothing, gaps ≤ 600 s merged, ≥ 1200 s kept. `coverage` is the fraction of the night that contributed.

- [ ] Write `gen_parity.py`: with a fixed seed, build synthetic inputs, run the reference `whoop5.experimental` functions (`rmssd_ms`, `sleep_periods`, `respiratory_rate`, `spo2_windows`, `skin_temp_baseline`) on them, and write inputs plus outputs to `python-parity.json`. Run it with `python -I` and the reference on `PYTHONPATH`.
- [ ] **Tests first:** parity with every fixture case (absolute tolerance 1e-6, 0.05 breaths/min for respiration); synthetic sinus arrhythmia at 9, 14 and 18 per minute is recovered within 0.3; a night with 5 % of beats present returns `low-coverage` for HRV and respiration (Review Focus 3); an empty sample list returns `no-data`; two periods 90 minutes apart form one night, 150 minutes apart form two.
- [ ] Run, fail, implement, pass.

### Task 5: Analytics — scores

**Files:** `packages/analytics/src/{calibration,sleepNeed,readiness,load,zones,workouts,index}.ts`, tests.

**Consumes:** Task 4 types.

**Produces:**

```ts
interface Profile { maxHr: number | null; birthYear: number | null; restingHr: number | null }
interface Calibration { /* every fitted constant below, by name */ }
const DEFAULT_CALIBRATION: Calibration
effectiveMaxHr(profile: Profile, year: number): number                 // profile.maxHr, else 208 − 0.7 × age, else 190
debtMs(needMs: number, asleepMs: number, remMs: number | null, c?: Calibration): number
strainNeedMs(load: number, c?: Calibration): number
sleepNeedMs(i: { debtMs: number; load: number; napMs: number }, c?: Calibration): number
sleepConsistency(nights: { onset: number; offset: number }[], tzOffsetS: number): Outcome<number>   // algo 'sleep.consistency@1'
sleepScore(i: { asleepMs: number; needMs: number; consistency: number | null }, c?: Calibration): Outcome<number>  // 'sleep.score@1'
readiness(i: { history: { hrv: number; sleepScore: number; rhr: number }[]; hrv: number; sleepScore: number; rhr: number }, c?: Calibration):
  Outcome<{ score: number; calibrating: boolean; contributions: { hrv: number; sleep: number; rhr: number } }>   // 'readiness.rec-rhr@1'
dayLoad(minuteHr: (number | null)[], rest: number, max: number, c?: Calibration): Outcome<number>   // 'load.dse-hrr@1'
zoneSeconds(hr: (number | null)[], rest: number, max: number): [number, number, number, number, number, number]
detectWorkouts(samples: Sample[], rest: number, max: number): { start: number; end: number; zoneSeconds: number[]; avgHr: number; maxHr: number }[]
```

Pinned from `re/score_formulas.py` (port exactly, constants into `DEFAULT_CALIBRATION`): debt factor 9/14 when REM > 6 800 000 ms else 1/2 (unknown REM uses 1/2), cap 7 668 000 ms; `strainNeedMs = 25995.162137 · L^0.728090984 · e^(0.167421361·L)`; sleep baseline 27 834 000 ms; sleep score `94.81929 − 4.67893·(asleep/need)^−2.88390 + 0.23588·(C − 80)`, consistency `null` counts as 80, clamped 0–100; readiness exactly `recovery_lead` with `high_stress_min = 0`, HRV prior weight 5.0265 at 103.2555 ms, RHR reference 59.08321 until the history holds 4 nights and then the mean RHR of the history; the input RHR gets `rhrOffsetBpm` (4.6) added only while the published reference is in use; `calibrating` is true while the history holds fewer than 3 nights; each contribution is `(score − 100) · zᵢ / z` for its term `zᵢ` of the exponent `z` (all 0 when `z` is 0), computed before clamping. Load: `0.78115 · (Σ e^(0.065·(h′ − 100)))^0.40855` over minutes with `h′ ≥ 94`, where `h′ = 57 + (h − rest)/(max − rest) · (189 − 57)` maps the user's heart-rate reserve onto the reference wearer's; clamped 0–21; fewer than 600 valid minutes in the day returns `low-coverage`. Zones: edges 40/60/70/80/90 % of reserve. Workouts: ≥ 600 s continuously at or above 50 % of reserve, gaps ≤ 120 s bridged. Consistency (own method): 100 minus the mean absolute deviation, in minutes, of onset and offset clock times over the last 4 nights, divided by 1.8, clamped 0–100; fewer than 2 nights returns `needs-history`.

- [ ] **Tests first:** the reference self-test assertions (`debtMs(30e6, 20e6, 5e6) === 5_000_000`, `debtMs(30e6, 20e6, 7e6) === 6_428_571`, `debtMs(40e6, 20e6, 0) === 7_668_000`, `debtMs(20e6, 25e6, 0) === 0`, readiness with empty history, HRV 103.2555, sleep 80, RHR 59.08321 equals 100); for a profile with rest 57 and max 189, `dayLoad` equals the Python `day_strain` on the same minutes (add those cases to `gen_parity.py`); load is monotonic in every minute's heart rate and never exceeds 21; readiness stays within 0–100 for HRV 5–300 and RHR 30–120; `zoneSeconds` sums to the number of non-null seconds; a day with 200 valid minutes returns `low-coverage`; contributions sum to `score − 100` within 0.5 when the score is not clamped.
- [ ] Run, fail, implement, pass.

### Task 6: Core storage

**Files:** `packages/core/src/store/{driver,migrations,store}.ts`, `packages/core/src/node/{sqliteDriver,index}.ts`, `packages/core/src/export.ts`, tests.

**Produces:**

```ts
type SqlValue = string | number | null | Uint8Array
interface SqlDriver {
  exec(sql: string): Promise<void>
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number; lastInsertRowid: number }>
  all<T extends Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>
  transaction<T>(fn: () => Promise<T>): Promise<T>            // rolls back when fn throws
  close(): Promise<void>
}
openStore(driver: SqlDriver): Promise<Store>                   // applies pending migrations
openNodeDriver(path: string): SqlDriver                        // from '@stoop/core/node'; ':memory:' allowed
interface DeviceRow { id: number; bleId: string; name: string | null; model: '5.0' | 'MG' | null; firmware: string | null;
  serial: string | null; ownerSince: number | null; configSnapshot: string | null }
interface SampleRow { deviceId: number; t: number; source: 'history' | 'live' | 'hrm'; hr: number | null; rr: number[];
  steps: number | null; skinTempC: number | null; spo2Raw: number | null; state: string | null; motionG: number | null; chunkId: number | null }
interface ChunkInput { deviceId: number; endToken: Uint8Array | null; frames: Uint8Array[]; clockOffsetS: number | null; receivedAt: number }
interface Store {
  driver: SqlDriver
  upsertDevice(d: Omit<DeviceRow, 'id'>): Promise<DeviceRow>; getDevice(id: number): Promise<DeviceRow | null>; listDevices(): Promise<DeviceRow[]>
  commitChunk(chunk: ChunkInput, samples: SampleRow[], extras: { events: EventRow[]; console: ConsoleRow[]; unknownFrames: number }): Promise<number>
  readChunkFrames(chunkId: number): Promise<Uint8Array[]>; listChunkIds(deviceId: number): Promise<number[]>
  insertSamples(samples: SampleRow[]): Promise<number>          // returns rows actually inserted
  samplesBetween(deviceId: number, from: number, to: number): Promise<SampleRow[]>
  getSyncState(deviceId: number): Promise<SyncStateRow | null>; setSyncState(s: SyncStateRow): Promise<void>
  replaceDay(deviceId: number, day: string, d: DayRecord): Promise<void>; getDay(deviceId: number, day: string): Promise<DayRecord | null>
  listDays(deviceId: number, fromDay: string, toDay: string): Promise<DayRecord[]>
  getSetting(key: string): Promise<string | null>; setSetting(key: string, value: string): Promise<void>
  clearDerived(deviceId: number): Promise<void>
}
exportCsv(store: Store, table: ExportTable): Promise<string>   // header row + RFC 4180 quoting
driverContract(open: () => Promise<SqlDriver>): { name: string; run: () => Promise<void> }[]   // framework-free checks that throw on failure
```

`driverContract` covers: parameter binding of every `SqlValue` type including a 100 kB `Uint8Array`, rollback on throw, nested reads inside a transaction, `changes` and `lastInsertRowid`. The node tests run it through Vitest; the app runs it on the device from its self-test screen.

`DayRecord`, `SyncStateRow`, `EventRow`, `ConsoleRow` and `ExportTable` are defined in `store.ts` by this task; `DayRecord` holds the night (sleep periods, need, debt, score), the night signals, readiness, load, zone seconds, workouts, the timezone offset and a `flags: string[]`, each derived value as `{ value: number | null; reason: string | null; coverage: number | null; algo: string }`.

Pinned: tables per the spec's list; `samples_1hz` has primary key `(device_id, t, source)` and uses `INSERT OR IGNORE`; `raw_chunks.frames` is a deflate-compressed length-prefixed concatenation (u32 LE length + frame) with a SHA-256 over the uncompressed bytes (`fflate` + a pure-JS SHA-256, no `node:crypto`); `commitChunk` writes the chunk, samples, events, console lines and the new `sync_state` in one transaction; schema version in `PRAGMA user_version`; WAL mode and `foreign_keys = ON`.

- [ ] **Tests first** (in-memory driver): migrations are idempotent; `commitChunk` then `readChunkFrames` returns identical frames; a throw inside `commitChunk` leaves no chunk, no samples and the old sync state; inserting the same samples twice inserts 0 the second time; `samplesBetween` is ordered and inclusive-exclusive; a corrupted chunk blob fails its checksum with a clear error; `exportCsv` quotes commas, quotes and newlines.
- [ ] Run, fail, implement, pass.

### Task 7: Core session, lock probe, sync engine, live recorder

**Files:** `packages/core/src/{transport,session,lockProbe,sync,live,index}.ts`, tests with a scripted fake transport in `test/fakeTransport.ts`.

**Consumes:** Tasks 2, 3, 6.

**Produces:**

```ts
interface GattService { uuid: string; characteristics: { uuid: string; properties: string[] }[] }
type BondResult = 'bonded' | 'already-bonded' | 'refused' | 'unsupported'
interface Transport {
  scan(timeoutMs: number): Promise<{ id: string; name: string | null; rssi: number | null }[]>
  connect(id: string): Promise<void>; disconnect(): Promise<void>
  services(): Promise<GattService[]>
  read(service: string, characteristic: string): Promise<Uint8Array>
  write(service: string, characteristic: string, data: Uint8Array): Promise<void>
  subscribe(service: string, characteristic: string, onData: (d: Uint8Array) => void): Promise<() => Promise<void>>
  bond(): Promise<BondResult>
  onDisconnect(cb: () => void): () => void
}
class Session {
  constructor(transport: Transport, opts?: { now?: () => number; responseTimeoutMs?: number })
  open(): Promise<HelloInfo>                                   // subscribe to the three channels, send hello
  send(command: number, args?: Uint8Array, grant?: CommandGrant): Promise<Extract<Packet, { kind: 'commandResponse' }>>
  dataRange(): Promise<DataRange>; battery(): Promise<number>
  clockOffsetS(): number | null                                // band clock minus host clock at open; null for a sentinel clock
  onPacket(cb: (p: Packet, raw: Uint8Array) => void): () => void
  close(): Promise<void>
}
class CommandTimeoutError extends Error {}; class CommandFailedError extends Error {}
probeLock(session: Session): Promise<{ state: 'open' | 'locked' | 'no-data'; firmware: FirmwareVersion; pagesBehind: number | null;
  sawHistory: boolean; sawRealtime: boolean; waitedMs: number }>
syncHistory(session: Session, store: Store, opts: { deviceId: number; onProgress?: (p: SyncProgress) => void; signal?: AbortSignal; idleTimeoutMs?: number }):
  Promise<{ chunks: number; frames: number; samples: number; discardedBeforeOwner: number; unknownFrames: number;
            stoppedBy: 'complete' | 'disconnect' | 'abort' | 'idle' | 'locked' }>
recordHeartRate(transport: Transport, store: Store, opts: { deviceId: number; signal: AbortSignal; onBeat?: (hr: number, rrMs: number[]) => void }): Promise<{ seconds: number }>
readDeviceInformation(transport: Transport): Promise<{ firmware: string | null; serial: string | null; model: string | null; battery: number | null }>
```

Pinned: sequence numbers are a u8 counter starting at 1; a response matches on `command` and `originSequence`; result PENDING (2) keeps waiting for the final response; response timeout 5 s; `send` throws `CommandFailedError` on result 0 or 3. Lock probe exactly as the spec's "Het firmwareslot op de draad" (8 s history wait, 6 s realtime wait, always `ABORT_HISTORICAL_TRANSMITS` and never an acknowledgement). Sync: `SEND_HISTORICAL_DATA` with args `00`; collect frames from HISTORY_START to HISTORY_END; commit; then `historyAck(endToken)`; stop on HISTORY_COMPLETE or when `idleTimeoutMs` (default 15 s) passes without a frame; if no frame at all arrives and `isDataLockFirmware`, `stoppedBy: 'locked'`. Biometric records become `SampleRow`s with `source: 'history'`; records with `unixS < ownerSince` are counted in `discardedBeforeOwner`, excluded from the stored chunk, and the chunk is still acknowledged. `recordHeartRate` subscribes to the standard Heart Rate Measurement characteristic without bonding and writes one `SampleRow` per second with `source: 'hrm'`. `readDeviceInformation` reads each characteristic independently and returns `null` for any that fails.

- [ ] **Tests first** (fake transport scripted with frames built by Task 3's encoders): hello, data range and battery round-trip; a PENDING then SUCCESS pair resolves once; a missing response throws `CommandTimeoutError`; three chunks sync into three stored chunks with three acknowledgements in order, each sent after its commit (assert order through a recording driver wrapper); a disconnect after commit and before the acknowledgement, then a second sync that re-serves the chunk, leaves the sample count unchanged (Review Focus 2); a store that throws in `commitChunk` sends no acknowledgement; an unknown-layout record is archived raw and produces no sample (Review Focus 5); a hello with clock 0 gives `clockOffsetS() === null` and a 3-hour offset is reported as 10800 (Review Focus 4); records before `ownerSince` are discarded and still acknowledged; lock probe returns `locked` for 50.43.2.0 with silence, `no-data` for 50.38.1.0 with silence, `open` when a record arrives, and the wire log contains command 20 and never command 23; `syncHistory` never emits a frame whose command is `forbidden`.
- [ ] Run, fail, implement, pass.

### Task 8: Simulated band

**Files:** `packages/sim/src/{physiology,ring,simBand,index}.ts`, tests including an end-to-end test with `core`.

**Consumes:** Tasks 3, 7 (`Transport`), 6 (for the end-to-end test).

**Produces:**

```ts
interface SimOptions { seed: number; now: () => number; historyDays: number; firmware?: string; model?: '5.0' | 'MG';
  locked?: boolean; bondRefused?: boolean; clockOffsetS?: number; mtu?: number; recordsPerChunk?: number;
  faults?: { disconnectAfterFrames?: number; dropAckOnce?: boolean; corruptEveryNthFragment?: number } }
class SimBand implements Transport { constructor(opts: SimOptions); readonly wireLog: { dir: 'in' | 'out'; hex: string }[] }
simulateSecond(seed: number, unixS: number): { heartRate: number; rrMs: number[]; stepCounter: number; skinTempC: number;
  spo2Byte82: number; bandState: BandState; dynamicAccelG: number }
```

Pinned: `simulateSecond` is a pure function of seed and time (no stored arrays), so months of history cost nothing; the persona sleeps roughly 23:15–07:00 local with nightly variation, has respiratory sinus arrhythmia at about 14 breaths per minute in its R-R, SpO2 windows of 30 s every 1200 s while asleep, one workout on most days, and occasional 2–10 minute R-R dropouts. Defaults: firmware `50.38.1.0`, MTU 244, 14 records per page, 40 pages per chunk, ring capacity 131 072 pages. The band keeps `trim` and `write` positions; an acknowledgement with the last chunk's token advances trim; `locked: true` answers every command with SUCCESS and never sends data, but still serves the standard heart-rate characteristic; `bondRefused: true` makes `bond()` return `'refused'` and rejects writes to the command characteristic; forbidden commands are answered with result 3 and counted in a public `forbiddenReceived` counter. Notifications are fragmented at `mtu − 3` bytes.

- [ ] **Tests first:** the same seed and time give the same second; a simulated night run through `sleepPeriods` yields one night of 6–9 h, and through `nightlyHrv` and `respiratoryRate` yields `ok` values of 20–150 ms and 10–20 per minute; end to end, `syncHistory` against a band with 2 days of history stores 172 800 ± 60 samples and reports `complete`, and a second sync stores 0 new samples; with `disconnectAfterFrames` mid-chunk, repeated syncs converge to the same sample set as an uninterrupted run; with `dropAckOnce` likewise; with `corruptEveryNthFragment` no invalid frame reaches the store; `locked` gives `probeLock().state === 'locked'` while `recordHeartRate` still records; `forbiddenReceived` is 0 after every scenario.
- [ ] Run, fail, implement, pass.

### Task 9: Core pipeline

**Files:** `packages/core/src/pipeline.ts`, tests.

**Consumes:** Tasks 4, 5, 6.

**Produces:**

```ts
recomputeDays(store: Store, opts: { deviceId: number; from: number; to: number; profile: Profile; tzOffsetS: number;
  calibration?: Calibration }): Promise<DayRecord[]>
rebuildFromRaw(store: Store, deviceId: number): Promise<{ chunks: number; samples: number }>   // clear derived data and samples, re-decode every chunk
dayKey(unixS: number, tzOffsetS: number): string                                              // 'YYYY-MM-DD'
```

Pinned: a physiological day runs from the main night's onset to the next main night's onset and is keyed by the local date of that night's offset; without a night it is the local calendar day. The main night is the longest night ending between 00:00 and 15:00 local; other periods are naps and reduce the next sleep need. Readiness history is every earlier day with all three inputs. A chunk whose stored clock offset exceeds 120 s in magnitude adds the flag `clock-offset` to the days it touches; it is not corrected. Days are recomputed in chronological order so debt chains forward. Steps per day are the sum of positive differences of the u16 counter, treating a drop as a wrap or reset.

- [ ] **Tests first:** seven simulated days produce seven `DayRecord`s with `ok` sleep, HRV, readiness and load, and `calibrating` true on the first three; removing all R-R from one night gives that day `reason: 'low-coverage'` for HRV and readiness while load stays `ok`; `rebuildFromRaw` after deleting all samples reproduces byte-identical `DayRecord`s; a chunk with a 3-hour clock offset flags its days (Review Focus 4); a step counter wrapping from 65530 to 4 counts 10 steps; a night crossing midnight belongs to the wake-up date.
- [ ] Run, fail, implement, pass.

### Task 10: Laptop workbench

**Files:** `apps/cli/src/main.ts`, `apps/cli/src/commands/*.ts`, `packages/ble-node/src/{nobleTransport,index}.ts`, tests for the CLI against the simulator.

**Consumes:** Tasks 6–9.

**Produces:** `npm run stoop -- <command>`; `NobleTransport implements Transport`.

Commands (all accept `--sim[=seed]`, `--db <path>` defaulting to `./stoop-data/stoop.db`, and `--json`):

- `triage [--out <file>]`: read-only. Scan, connect, list services, read device information and battery without bonding, sample the standard heart rate for 10 s; then bond, open a session, print firmware, battery, clock offset, ring positions and backlog, enumerate feature flags and device config keys with their values, run `probeLock`. Print a verdict line: `OPEN`, `LOCKED (firmware 50.43+, data withheld)` or `NO DATA`. Save the snapshot as JSON and into `devices.config_snapshot`. Each step is independent: a failure prints the reason and the remaining steps still run.
- `live [--seconds n] [--record]`: standard heart-rate profile; `--record` stores samples.
- `sync [--owner-since <ISO date>]`: refuses to run on a device without `owner_since` unless the flag is given; prints progress and the result.
- `recompute [--from --to] [--rebuild]`, `days [--last n]` (table of day records), `export --dir <path>` (database copy plus one CSV per table), `decode <hex | file>` (print decoded packets), `sim --days n` (seed a database from the simulator).

Pinned: argument parsing with `node:util` `parseArgs`; no command can send a `write` or `dangerous` command except `sync`'s session commands; `NobleTransport.bond()` returns `'unsupported'` if the library cannot pair, and `triage` then prints the instruction to pair in Windows Bluetooth settings first. Everything in `ble-node` is marked `UNTESTED until day 1` in its file header and in command output.

- [ ] **Tests first** (spawn the CLI with `--sim=7 --db <tmp>`): `triage --json` reports firmware `50.38.1.0` and state `open`, and with a locked simulator reports `locked`; `sim --days 3` then `days --json` lists 3 days; `sync` without `owner_since` exits non-zero with an explanatory message; `export` writes the database and CSV files; `decode aa0108000001e67123019101363e5c8d` prints a COMMAND frame for `GET_HELLO`.
- [ ] Run, fail, implement, pass; `npm run typecheck` covers `ble-node`.

### Task 11: Android app

**Files:** `apps/mobile/**`.

**Consumes:** Tasks 3–9.

**Produces:** an Expo development build that runs on the Android emulator with the demo band as data source.

Pinned: created with the current `create-expo-app` template (check the Expo docs for the current SDK and for npm-workspaces setup before starting); expo-router with tabs Vandaag, Slaap, Belasting, Trends, Band, plus stack screens Koppelen, Paraatheid and Instellingen; `expo-sqlite` driver implementing `SqlDriver` with SQLCipher enabled and a random 32-byte key in `expo-secure-store`; `react-native-ble-manager` transport implementing `Transport` (explicit `createBond`, MTU request, the required Android 12+ permissions), marked untested until day 1; data source setting `demo | band`, default `demo`, where demo runs `SimBand` in-process; i18n with Dutch and English resource files and no hard-coded user-facing strings in components; charts drawn with `react-native-svg`; every metric tile shows its parity level (A–D) and, when a value is absent, the translated reason instead of a number; the Band screen shows firmware, battery, last sync, backlog, lock state and a sync button; a destructive action is reachable only through a confirmation dialog that requires typing the command name; Instellingen has profile (birth year, maximum heart rate), language, data source, "sinds wanneer draag je deze band" and export (share the database file and a CSV zip).

- [ ] **Tests first** (Jest with the Expo preset): the reason-to-text mapping covers every `Reason` in both languages; the metric tile renders the reason and no number for `{ ok: false }`; the Dutch and English resource files have identical key sets.
- [ ] Implement screens against the demo data source, plus a "Zelftest" screen under Instellingen that runs `driverContract` against the `expo-sqlite` driver and a two-day demo sync and pipeline run, listing each check as passed or failed.
- [ ] Build and run on the emulator; walk through Koppelen → sync → Vandaag → each tab; capture screenshots into `docs/screenshots/`.

### Task 12: Legal, documentation and CI (coordinator)

**Files:** `README.md`, `LEGAL.md`, `LICENSE-APACHE`, `LICENSE-GPL`, per-package `LICENSE` pointers, `THIRD_PARTY_NOTICES.md`, `docs/provenance.md`, `docs/dag-1.md`, `.github/workflows/ci.yml`.

- [ ] `docs/dag-1.md` (Dutch): the day-one runbook, in order — do not install the official app; charge; `triage` before anything else; what each verdict means and the next step for each; setting `owner_since`; first sync; the untested items from the spec as a checklist with a place to note the result.
- [ ] `docs/provenance.md`: one row per protocol fact used, with its source and evidence tier.
- [ ] CI: install, lint, typecheck, test on push to a pull request.
- [ ] Run the whole suite; request one code review of the branch; open the pull request.
