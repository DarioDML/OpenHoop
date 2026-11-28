# Raw optical and motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream, store and use the band's raw optical (R20/R26) and motion (R21) data: Developer streams, stored history, workout motion with motion-weighted muscular load, and an ECG movement line.

**Architecture:**
- **Protocol** gains request bodies, encoders and rate fields.
- **Core** gains three modules, modelled on `ecg.ts`:
  - `signals.ts`: packing, storage, sync, rebuild and retention;
  - `rawStreams.ts`: stream switching and a collector;
  - `strengthMotion.ts`: per-set results and the post-sync recompute.
- **Analytics** gains the pure signal algorithm, `strengthMotion.ts`.
- **The app** gains a pure ownership/fail-safe policy, controller wiring, and UI in Developer → Streams, Device, strength live and summary, and the ECG result.

**Tech Stack:**
- TypeScript (strict, no `any`).
- Tests: vitest for `packages/*` (`npx vitest run <path>` from the repo root); jest for `apps/mobile` (`cd apps/mobile && npx jest <path>`).
- SQLite through the `SqlDriver` interface.
- React Native with expo-router.

**Spec:** `docs/superpowers/specs/2026-11-28-raw-optical-motion-design.md`. Read it first; this plan does not repeat its reasoning.

## Global Constraints
- **Code:**
  - No `any`, no untyped values, no comments unless the logic is non-obvious.
  - Edit files with the Edit tool. Never rewrite them through Python text mode, which writes CRLF; the repo is LF.
- **Band safety:**
  - Never build or send commands 153 or 154 (`TOGGLE_PERSISTENT_R20/R21`).
  - Live switches use body `[01 01]` on and `[01 00]` off.
  - Command 81 uses revision 2, `[02][u32 duration ms LE]`; command 82 uses `[01]`.
- **Timing and caps:**
  - Developer stream cap: 10 min.
  - Live workout motion cap: 4 h.
  - On-band workout recording: 3 h duration (10 800 000 ms).
- **Fail-safe:** at most once per 30 s; ignores live R20/R21 for 3 s after the app's own stop; off during an ECG reading and during sync.
- **Units:**
  - Accelerometer: g = raw / 4096.
  - Gyro: °/s = raw / 16.384, with -32768 meaning an invalid sample.
  - Stored time `t`: band unix seconds.
  - Phone → band: band = phone + `Session.clockOffsetS()` (treat null as 0).
- **Strength motion:** algo id `strength.motion@1`. The muscular-load factor ships switched off (`MOTION_FACTOR_ENABLED = false`) until the owner's light/heavy check.
- **UI and copy:**
  - Every new user-visible string in en and nl.
  - New metric names get `terms.ts` entries and explain in place.
  - Layouts hold at 360 dp, font scale 1.3.
  - Channel wavelengths are always "likely".
- **Data:** the owner's own frames are never committed. Test fixtures are synthetic, shaped like the real ones in the spec.

## Review Focus
1. **App killed, or band out of range while a stream runs.** On the next connect the flagged streams are switched off, unless an owner is active again; then they are re-asserted. Tests: Task 5 `connectAction`, Task 4 sim.
2. **Reconnect in the middle of a workout.** Motion resumes, and the flag is not cleared. Test: Task 5 `reassert when owner active`.
3. **A sync replays seconds already stored live**, or a backfill runs twice. No duplicate rows. Tests: Task 2 `insertSignals ignores duplicates`, Task 3 `rebuild twice`.
4. **Sets with mostly rest, slow 4 s reps, or exercises that barely move the wrist.** Reps come from the bout only; slow reps are counted; a still wrist gives "unreadable", never 0 reps with a factor. Tests: Task 8.
5. **Retention "Raw 7 d" with live workout rows (`chunk_id` NULL).** They are pruned by `t`; derived set motion and the ECG movement value survive. Test: Task 3 `prunes live rows by time`.

---

## PR 1: protocol, storage, stream control

### Task 1: Protocol: rates, request bodies, encoders, provenance

**Files:**
- Modify: `packages/protocol/src/records.ts`, `requests.ts`, `encode.ts`, `index.ts`, `schema/whoop5_protocol.json`
- Modify: `docs/provenance.md`
- Test: `packages/protocol/test/rawRecords.test.ts` (new), `packages/protocol/test/requests.test.ts`

**Interfaces:**
- Produces, in `records.ts`:
  - `RecordBody` `imu` gains `rateHz: number`. This is frame byte 22 when it is not 0; otherwise the accelerometer count.
  - `RecordBody` `optical` gains `rateHz: number`, the largest block count. The record covers 1 s.
  - `export const GYRO_INVALID = -32768`.
- Produces, in `requests.ts`: `streamSwitchBody(on: boolean): Uint8Array`, `rawSessionBody(durationMs: number): Uint8Array`, `rawStopBody(): Uint8Array`.
- Produces, in `encode.ts`:
  - `encodeImu(i: { recordIndex: number; unixS: number; subsec?: number; packetType?: 43 | 47; rateHz?: number; accel: [number[], number[], number[]]; gyro: [number[], number[], number[]] }): Uint8Array`. It writes byte 21 = 4 and byte 22 = `rateHz` (default 100).
  - `encodeOptical(i: { recordIndex: number; unixS: number; subsec?: number; packetType?: 43 | 47; blocks: OpticalBlockInput[] }): Uint8Array`. It writes byte 21 = 4 and u16 at 23 = the largest count.
  - `OpticalBlockInput` is `Omit<OpticalBlock, 'count'>`.

- [ ] **Step 1: Write failing tests**
  - In `rawRecords.test.ts`:
    - `encodeImu → decodeFrame round-trips` with rate 100, counts 100/100, `packetType` 43. Asserts `record.type === 'imu'`, `rateHz === 100`, `accel[2][0] === 4096`, `gyro[0][5] === GYRO_INVALID`.
    - `imu rateHz falls back to the count when byte 22 is 0`.
    - `encodeOptical → decodeFrame round-trips` with three blocks of count 25 and two of 0. Asserts `rateHz === 25`, `blocks[3].driveA === 0`, `blocks[0].slotA.length === 25`.
  - In `requests.test.ts`:
    - `streamSwitchBody(true)` equals `[1,1]` and `(false)` equals `[1,0]`.
    - `rawSessionBody(30000)` equals `[2,0x30,0x75,0,0]`.
    - `rawSessionBody(0)` and `(86_400_001)` throw RangeError.
    - `rawStopBody()` equals `[1]`.
- [ ] **Step 2:** Run `npx vitest run packages/protocol` and expect FAIL.
- [ ] **Step 3: Implement the above.**
  - Add `"124": "RAW_SESSION_STATE"` to `event_48.own_names`, with a note: 4× at an 81 start, 2× at stop or expiry, payload not decoded.
  - Add `"own"` to `records.20.evidence` and `records.21.evidence`, with a live note: packet 43, 1 record/s, R21 100 Hz, R20 25 Hz live and 50 Hz in ECG.
  - Add the request bodies for 81, 82, 106 and 108 under `commands.request_bodies`.
- [ ] **Step 4:** Add rows to `docs/provenance.md`, all "yes", own MG 50.43.2.0, 2026-11-28:
  - live R21 via 106;
  - live R20 via 108;
  - 81/82 on-band session saves R20+R21 to history;
  - 81 revision-2 duration ends the session but not the live switches;
  - event 124;
  - R26 windows of 40 s every ~20 min;
  - accelerometer scale 1.003 g still;
  - gyro warm-up −32768;
  - R20 block meanings with "likely".
- [ ] **Step 5:** Run `npx vitest run packages/protocol` and `npm run typecheck`. Expect PASS.
- [ ] **Step 6:** Commit `feat: decode live optical and motion rates and build raw stream requests`.

### Task 2: Core signal storage

**Files:**
- Create: `packages/core/src/signals.ts`
- Modify: `packages/core/src/store/migrations.ts` (add `V18`), `packages/core/src/index.ts` (exports)
- Test: `packages/core/test/signals.test.ts`, `packages/core/test/schemaVersion.test.ts`

**Interfaces:**
- Consumes: Task 1 `RecordBody` and `Packet`.
- Produces, in `signals.ts`:
  - `ImuSecond { deviceId: number; t: number; rateHz: number; accel: [number[], number[], number[]]; gyro: [number[], number[], number[]] }`.
  - `StoredOpticalBlock { sourceA: number; driveA: number; detectorA: number; sourceB: number; driveB: number; detectorB: number; slotA: number[]; slotB: number[] }`.
  - `OpticalSecond { deviceId: number; t: number; layout: 20 | 26; rateHz: number; blocks: StoredOpticalBlock[] }`.
  - `SignalRows { imu: ImuSecond[]; optical: OpticalSecond[] }`; `emptySignals(): SignalRows`.
  - `packImu(s: ImuSecond): Uint8Array` and `unpackImu(deviceId: number, t: number, data: Uint8Array): ImuSecond`.
  - `packOptical` and `unpackOptical`, with the same shape.
  - `signalsFromPacket(deviceId: number, packet: Packet): SignalRows`. R21 gives one `imu` row; R20 one `optical` row with layout 20; R26 one row with layout 26, one block, slot A = `samples`, slot B empty, rate 25, drive and LED fields 0.
  - `insertSignals(driver: SqlDriver, rows: SignalRows, chunkId: number | null): Promise<number>`.
  - `imuBetween(driver: SqlDriver, deviceId: number, from: number, to: number): Promise<ImuSecond[]>`, inclusive and ordered by `t`.
  - `opticalBetween(...)`, with the same shape.
  - `pruneSignalsBefore(driver: SqlDriver, deviceId: number, t: number): Promise<number>`.
- The packed formats are exactly as in the spec ("Stored formats").
- Migration `V18`, appended to `MIGRATIONS`:

```sql
ALTER TABLE optical_bursts ADD COLUMN layout INTEGER NOT NULL DEFAULT 20 CHECK (layout IN (20, 26));
DELETE FROM imu_blocks WHERE id NOT IN (SELECT MIN(id) FROM imu_blocks GROUP BY device_id, t);
DELETE FROM optical_bursts WHERE id NOT IN (SELECT MIN(id) FROM optical_bursts GROUP BY device_id, t, layout);
CREATE UNIQUE INDEX imu_blocks_second ON imu_blocks (device_id, t);
CREATE UNIQUE INDEX optical_bursts_second ON optical_bursts (device_id, t, layout);
CREATE TABLE strength_set_motion (
  set_id INTEGER PRIMARY KEY REFERENCES strength_sets(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('readable', 'unreadable', 'unmatched', 'none')),
  reps_detected INTEGER CHECK (reps_detected IS NULL OR reps_detected BETWEEN 0 AND 200),
  tut_s REAL CHECK (tut_s IS NULL OR tut_s >= 0),
  tempo_s REAL CHECK (tempo_s IS NULL OR tempo_s > 0),
  velocity_loss REAL,
  coverage REAL NOT NULL CHECK (coverage BETWEEN 0 AND 1),
  factor REAL NOT NULL CHECK (factor BETWEEN 0.7 AND 1.3),
  algo TEXT NOT NULL
);
ALTER TABLE ecg_recordings ADD COLUMN movement_g REAL CHECK (movement_g IS NULL OR movement_g >= 0);
```

- [ ] **Step 1: Write failing tests** in `signals.test.ts`, using an in-memory store (follow `ecg.test.ts`):
  - `packImu/unpackImu round-trip keeps -32768`.
  - `packOptical/unpackOptical round-trip keeps i32 extremes` (−524288 and 524287).
  - `signalsFromPacket maps R21, R20 and R26`; the R26 row has layout 26 and 25 samples.
  - `insertSignals ignores duplicates`: inserting the same second twice returns 1 then 0, and `imuBetween` gives 1 row.
  - `R20 and R26 at the same second both stay`.
  - `pruneSignalsBefore deletes by t whatever chunk_id`.
- [ ] **Step 2:** In `schemaVersion.test.ts`, add `V18 removes duplicate signal rows before the unique index`: build a V17 database with two `imu_blocks` rows of the same `(device_id, t)`, migrate, and expect 1 row.
- [ ] **Step 3:** Run `npx vitest run packages/core/test/signals.test.ts packages/core/test/schemaVersion.test.ts` and expect FAIL.
- [ ] **Step 4:** Implement `signals.ts` and `V18`. Use `bulkInsert`-style batched `INSERT OR IGNORE` (see `store.ts`).
- [ ] **Step 5:** Run the same tests plus `npx vitest run packages/core`. Expect PASS.
- [ ] **Step 6:** Commit `feat: store optical and motion seconds with a schema for set motion`.

### Task 3: Sync, rebuild, retention and the decoder bump

**Files:**
- Modify:
  - `packages/core/src/sync.ts` (tally gets `signals`; `SyncResult` gets `signalRange`);
  - `packages/core/src/store/types.ts` and `store.ts` (`commitChunk` extras accept `signals?: SignalRows`);
  - `packages/core/src/pipeline.ts` (`rebuildFromRaw` inserts signals per chunk);
  - `packages/core/src/retention.ts` (`pruneRawBefore` also calls `pruneSignalsBefore` and returns `signals: number`);
  - `packages/core/src/versions.ts` (`SAMPLE_DECODER_VERSION = 3`).
- Test: `packages/core/test/sync.test.ts`, `pipeline.test.ts`, `retention.test.ts`, `redecode.test.ts`

**Interfaces:**
- Consumes: Task 2 `signalsFromPacket` and `insertSignals`.
- Produces:
  - `SyncResult.signalRange: { from: number; to: number } | null`, the min and max `t` of signal rows committed in this run.
  - `rebuildFromRaw(...)` returns `{ chunks: number; samples: number; signalRange: { from: number; to: number } | null }`.
  - `RawPruneResult.signals: number`.

- [ ] **Step 1: Write failing tests:**
  - `sync stores R21 and R26 seconds with their chunk id`: the simulator history holds 2 R21 (`encodeImu`, `packetType` 47) and 3 R26 records. `imuBetween` gives 2 rows with `chunk_id` set, and `signalRange` covers them.
  - `rebuildFromRaw backfills signals from stored chunks`.
  - `rebuild twice` leaves the same row counts.
  - `pruneRawBefore prunes live rows by time`: an `imu_blocks` row with `chunk_id` NULL and `t` < cutoff is deleted; a `strength_set_motion` row and `ecg_recordings.movement_g` stay.
  - `decoder version 3 triggers a rebuild` (extend `redecode.test.ts`).
- [ ] **Step 2:** Run `npx vitest run packages/core` and expect FAIL.
- [ ] **Step 3:** Implement. Signals are added in `addFrameKind`'s `record` case for every frame at or after `ownerFloor`. `rebuildFromRaw` returns `signalRange` too, so Task 10 can run `afterSignals` after a backfill. **(owner)**
- [ ] **Step 4:** Run `npx vitest run packages/core` and `npm run typecheck`. Expect PASS.
- [ ] **Step 5:** Commit `feat: keep the band's optical windows and raw records from history`.

### Task 4: Core stream control and simulator support

**Files:**
- Create: `packages/core/src/rawStreams.ts`
- Modify: `packages/sim/src/simBand.ts` (106, 108, 81, 82)
- Test: `packages/core/test/rawStreams.test.ts`

**Interfaces:**
- Consumes: Task 1 bodies and encoders; `Session.send`, `onPacket`, `clock`.
- Produces, in `rawStreams.ts`:
  - `type StreamKind = 'imu' | 'optical'`.
  - `class RawStreamError extends Error { reason: 'unsupported' }`.
  - `switchStreams(session: Session, kinds: readonly StreamKind[], on: boolean): Promise<void>`. It sends 106 for imu and 108 for optical with `confirmWrite`. On `CommandFailedError` it throws `RawStreamError`.
  - `startBandRecording(session: Session, durationMs: number): Promise<void>` and `stopBandRecording(session: Session): Promise<void>`.
  - `isLiveSignal(packet: Packet): boolean`: a record with packet type 43 and layout 20 or 21.
  - `LiveImuSecond { t: number; recordIndex: number; rateHz: number; accel: [number[], number[], number[]]; gyro: [number[], number[], number[]] }`, where `t` = unix + subsec/32768.
  - `LiveOpticalSecond { t: number; recordIndex: number; rateHz: number; blocks: OpticalBlock[] }`.
  - `class StreamCollector { constructor(session: Session); onImu(cb: (s: LiveImuSecond) => void): () => void; onOptical(cb: (s: LiveOpticalSecond) => void): () => void; measuredRate(kind: StreamKind): number | null; close(): void }`. `measuredRate` is the median samples per record over the last 5 records.
- Produces, in `SimBand`:
  - While 106 is on it emits one `encodeImu` frame per second (packet 43, 100 samples, still wrist: z = 4096 ± 20, gyro ± 5). The first frame has `gyro` empty.
  - While 108 is on it emits one `encodeOptical` frame per second, shaped like the spec: blocks 0, 3 and 4 with 25 samples; block 0 slot A is a 1.2 Hz sine of amplitude 1000 around 200 000; block 3 is ~190.
  - 81 and 82 reply SUCCESS with `[01 00 00]`.
  - New public counters `imuOn` and `opticalOn`.

- [ ] **Step 1: Write failing tests:**
  - `switchStreams on then off`: the sim reports `imuOn` true, then false, and the collector got ≥ 2 `LiveImuSecond` with `rateHz` 100 in 2.5 s of sim time.
  - `optical collector reports rate 25`.
  - `switchStreams throws RawStreamError when the band refuses`: a sim option makes 106 FAILURE.
  - `startBandRecording sends [02][u32]`: assert the bytes the sim received.
  - `isLiveSignal is false for history R21` (packet 47).
- [ ] **Step 2:** Run `npx vitest run packages/core/test/rawStreams.test.ts` and expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run packages/core packages/sim` and expect PASS.
- [ ] **Step 5:** Commit `feat: switch live optical and motion streams and collect them`.

### Task 5: App stream policy and controller wiring

**Files:**
- Create: `apps/mobile/src/data/rawStreamPolicy.ts`
- Modify:
  - `apps/mobile/src/data/controller.ts`;
  - `apps/mobile/src/data/types.ts` (`RawLiveState`, `RawStreamActions`);
  - `apps/mobile/src/data/liveData.ts` (add `'rawLive'` to `LIVE_DATA_KEYS`);
  - `apps/mobile/src/data/context.tsx` (expose it).
- Test: `apps/mobile/__tests__/rawStreamPolicy.test.ts`

**Interfaces:**
- Consumes: Task 4.
- Produces, in `rawStreamPolicy.ts`:
  - `type StreamOwner = 'developer' | 'workout'`.
  - `STREAM_CAPS_MS: Record<StreamOwner, number>` = `{ developer: 600_000, workout: 14_400_000 }`.
  - `interface StreamFlags { imu: boolean; optical: boolean; band: boolean }`, with `parseFlags(text: string | null): StreamFlags` and `serializeFlags(f: StreamFlags): string`.
  - `class StreamOwners { claim(owner: StreamOwner, kinds: readonly StreamKind[], nowMs: number): StreamKind[]` (kinds newly needed); `release(owner: StreamOwner): StreamKind[]` (kinds nobody needs any more); `active(): StreamKind[]`; `expired(nowMs: number): StreamOwner[]` `}`.
  - `connectAction(active: readonly StreamKind[], flags: StreamFlags, bandOwner: boolean): { reassert: StreamKind[]; switchOff: StreamKind[]; stopBand: boolean }`.
  - `onBackground(owners: StreamOwners): StreamKind[]`. It releases the developer owner and returns the kinds that are now unneeded.
  - `class FailSafe { noteStop(nowMs: number): void; shouldStop(nowMs: number, ctx: { owned: boolean; ecg: boolean; syncing: boolean }): boolean }`, with a 30 s rate limit and a 3 s grace.
- Produces, in `types.ts`:
  - `RawLiveState { imu: { rateHz: number | null; seconds: number; tail: { ax: number[]; ay: number[]; az: number[]; gx: number[]; gy: number[]; gz: number[] } } | null; optical: { rateHz: number | null; seconds: number; blocks: LiveOpticalSecond['blocks']; tail: number[][] } | null }`. Tails are the last 5 s, in g, °/s and raw counts.
  - `RawStreamActions { start(owner: StreamOwner, kinds: StreamKind[]): Promise<boolean>; stop(owner: StreamOwner): Promise<void>; setBandRecording(on: boolean): Promise<boolean>; seconds(kind: StreamKind): readonly (LiveImuSecond | LiveOpticalSecond)[] }`. `seconds` returns the developer recording buffer, capped at the 10-minute cap.
- Produces, in the controller:
  - The cleanup flag lives in setting `raw.cleanup.<deviceId>`.
  - On connect it applies `connectAction` after the ECG cleanup.
  - The fail-safe runs in the `onPacket` hook.
  - A 1 s cap check runs while any owner is active.
  - Workout-owned `LiveImuSecond`s are written to `imu_blocks` (`chunk_id` NULL, `t` = floor(t)) through `insertSignals`.
  - Busy rules:
    - `startEcg` refuses while **any** stream owner (developer or workout) is active, because the ECG also uses packet 43. **(owner)**
    - `sync` refuses while a developer owner is active (`error.bandBusy`).
    - `start('developer', …)` refuses while an ECG reading or a sync runs.
    - A workout owner does not block sync or live heart rate; the fail-safe is off during sync.
  - The developer owner is released when the app goes to the background (`AppState` change). The workout owner is kept until its session ends or its cap expires.

- [ ] **Step 1: Write failing tests** in `rawStreamPolicy.test.ts`:
  - `claim and release share kinds between owners`: developer imu+optical, then workout imu; releasing developer returns `['optical']`.
  - `cleanup when no owner`: `connectAction([], {imu:true, optical:false, band:true}, false)` gives `switchOff ['imu']`, `stopBand` true.
  - `reassert when owner active`: `connectAction(['imu'], {imu:true, optical:false, band:false}, false)` gives `reassert ['imu']`, `switchOff []`.
  - `caps expire`: developer expires at 600 000 ms and workout at 14 400 000.
  - `fail-safe grace and rate limit`: false within 3 s of `noteStop`, true after, then false again for 30 s; always false when `ecg` or `syncing`; false when `owned`.
  - `developer owner is released on background, workout owner is kept`: a pure `onBackground(owners): StreamKind[]` helper in the policy returns the kinds to switch off.
  - `flags round-trip`, and `parseFlags('garbage')` gives all false.
- [ ] **Step 2:** Run `cd apps/mobile && npx jest __tests__/rawStreamPolicy.test.ts` and expect FAIL.
- [ ] **Step 3:** Implement the policy, then wire the controller.
- [ ] **Step 4:** Run `cd apps/mobile && npx jest && npx tsc --noEmit`, plus `npm run lint` at the root. Expect PASS.
- [ ] **Step 5:** Commit `feat: own raw streams in the app with cleanup, caps and a fail-safe`.
- [ ] **Step 6: Open PR 1.** Run one code review first (`feature-dev:code-reviewer`), rebase on master, push, and open the PR with the probe findings and research summary in the body.

---

## PR 2: Developer streams

### Task 6: Canvas artboards (owner gate)

**Files:** the Claude Design canvas (`https://claude.ai/artifact/B3d16Jgnrs2zrHx5pGefsv`) only.

- [ ] **Step 1:** Read the canvas SKILL.md, then the existing M6 Developer artboard and the strength live and summary and ECG result artboards.
- [ ] **Step 2:** Add artboards in the app's tokens, with sample numbers only:
  - (a) the Streams tab with motion and optical switches, traces, rate and Record;
  - (b) a strength live set row with the motion line and the "Band counted 7 · Use" chip, plus the Record on band switch;
  - (c) summary muscle rows with motion marks and the level D note;
  - (d) the ECG result movement line.
- [ ] **Step 3:** Ask the owner to approve, and apply their changes. UI tasks 7, 10 and 11 follow the approved artboards.

### Task 7: Streams tab

**Files:**
- Create:
  - `apps/mobile/src/ui/dev/SignalTrace.tsx`, which reuses `traceColumns` from `data/ecg.ts`;
  - `apps/mobile/src/data/opticalChannels.ts`;
  - `apps/mobile/src/data/signalCsv.ts`.
- Modify:
  - `apps/mobile/src/app/settings/developer.tsx`;
  - `apps/mobile/src/data/rawSessions.ts` (save a CSV by name);
  - `apps/mobile/src/data/terms.ts`;
  - i18n `manage.en.json` and `manage.nl.json`.
- Test: `apps/mobile/__tests__/developer.test.tsx`, `apps/mobile/__tests__/signalCsv.test.ts`

**Interfaces:**
- Consumes: Task 5 `rawLive` and `RawStreamActions`.
- Produces, in `opticalChannels.ts`: `channelRole(block: { sourceA: number; driveA: number; sourceB: number; driveB: number }, slot: 'A' | 'B'): 'pulse' | 'wear' | 'dark' | 'spo2Red' | 'spo2Ir' | 'unknown'`. The rules, in order:
  1. both drives 0 → `dark`;
  2. `sourceA === 1` → `pulse`;
  3. `sourceA === 2 && driveA <= 500` → `wear`;
  4. `sourceA === 3` → `spo2Red`;
  5. `sourceA === 2` → `spo2Ir`;
  6. otherwise `unknown`.
- Produces, in `signalCsv.ts`:
  - `imuCsv(seconds: readonly LiveImuSecond[]): string`. The header is `t_ms,ax_g,ay_g,az_g,gx_dps,gy_dps,gz_dps`; an invalid gyro is an empty cell.
  - `opticalCsv(seconds: readonly LiveOpticalSecond[]): string`. The header is `t_ms,block,slot,led,detector,drive,value`.
  - In both, `t_ms` = round((t + i / rate) × 1000), and lines end with `\r\n`, like `ecgCsv`.
- Terms: `ppg`, `accelerometer`, `gyroscope` and `opticalChannel`. The `opticalChannel` sheet gives the probe evidence in one or two lines: "Block 0 carries the strongest pulse… likely green".

- [ ] **Step 1: Write failing tests:**
  - `imuCsv` converts 4096 to `1.0000` g, gives an empty cell for −32768, and computes `t_ms` steps of 10 at 100 Hz.
  - `opticalCsv` gives one row per sample with its LED and drive.
  - `channelRole` matches each rule.
  - In `developer.test.tsx`:
    - switching the motion row on calls `start('developer', ['imu'])`;
    - unmounting the tab calls `stop('developer')`;
    - the "Not decoded yet" chips are gone;
    - a running stream shows its rate, e.g. "100 Hz".
- [ ] **Step 2:** Run `cd apps/mobile && npx jest __tests__/signalCsv.test.ts __tests__/developer.test.tsx` and expect FAIL.
- [ ] **Step 3:** Implement, following the approved artboard (a).
- [ ] **Step 4:** Run `cd apps/mobile && npx jest && npx tsc --noEmit` and expect PASS.
- [ ] **Step 5:** Commit `feat: live optical and motion traces and recording in Developer streams`.
- [ ] **Step 6: Device check, then PR 2.**
  - Build, install and open Developer → Streams on the S24. Switch motion on and see 100 Hz, then optical and see 25 Hz.
  - Leave the tab and confirm no packet 43 arrives within 5 s (packet log or logcat).
  - Record and confirm a CSV appears in Sessions.
  - Reinstall a master build if PR 2 is not merged the same day.
  - Run a code review, then open PR 2.

---

## PR 3: workout motion and muscular load

### Task 8: Analytics: bout segmentation and rep detection

**Files:**
- Create: `packages/analytics/src/strengthMotion.ts`, export it from `index.ts`
- Test: `packages/analytics/test/strengthMotion.test.ts`, with the helper `synthSession` in the same file

**Interfaces:**
- Produces:
  - `STRENGTH_MOTION`, a constants object with the spec values: `algo: 'strength.motion@1'`, `gravityWindowS: 3`, `envelopeWindowS: 0.5`, `searchS: 120`, `mergeGapS: 2`, `activityRatio: 3`, `bandLowHz: 0.15`, `bandHighHz: 2.5`, `minRepGapS: 0.6`, `prominence: 0.35`, `minReps: 2`, `minAmplitudeG: 0.03`, `minCoverage: 0.8`, `referenceSets: 3`, `factorMin: 0.7`, `factorMax: 1.3`.
  - `MotionSecond { t: number; rateHz: number; accel: [number[], number[], number[]]; gyro: [number[], number[], number[]] }`, in g and °/s, with invalid gyro already NaN.
  - `Bout { start: number; end: number }`.
  - `findBouts(seconds: readonly MotionSecond[], from: number, to: number): Bout[]`.
  - `lastBoutBefore(seconds: readonly MotionSecond[], doneAt: number, after: number): Bout | null`. The search runs from max(`doneAt` − 120, `after`) to `doneAt`, and a bout must start after `after`, which is the previous set's `doneAt` or the previous bout's end. **(owner)**
  - `SetMotion { status: 'readable' | 'unreadable' | 'none'; reps: number | null; tutS: number | null; tempoS: number | null; velocityLoss: number | null; coverage: number }`.
  - `analyseBout(seconds: readonly MotionSecond[], bout: Bout): SetMotion`.
  - `tempoFactor(tempoS: number | null, referenceTempos: readonly number[]): number`.
- The algorithm is exactly the spec's "Bout segmentation" and "Rep detection". `synthSession` builds 100 Hz seconds from segments:
  - `walk(s)`: 1.8 Hz, 0.15 g vertical;
  - `still(s)`: 0.005 g noise;
  - `lift(reps, periodS, ampG, decay?)`: a sine along a tilted axis, amplitude multiplied by `decay^k` per rep.

- [ ] **Step 1: Write failing tests:**
  - `counts 8 reps after a walk and setup`: `walk(60) still(10) lift(8, 2.5, 0.3) still(5)`, with `doneAt` at the end, gives `reps === 8` and a bout start inside the lift (≥ 70 s).
  - `counts slow 4 s reps`: `lift(6, 4, 0.2)` gives `reps === 6`. With `gravityWindowS: 1` this fails; assert the constant is 3.
  - `still wrist is unreadable`: `still(30)` with `lift(8, 2.5, 0.01)` gives status `unreadable` and reps null.
  - `missing seconds lower coverage`: drop 3 of 20 bout seconds, giving coverage < 0.9; drop 6, giving status `none`.
  - `velocity loss rises with fatigue`: decay 0.9 gives `velocityLoss > 0.3`, decay 1 gives < 0.05.
  - `slower set gets the higher factor`: `tempoFactor(3.5, [2.5, 2.4, 2.6])` > 1 and `tempoFactor(2.0, [2.5, 2.4, 2.6])` < 1.
  - `factor 1 below three references`.
  - `factor clamps to 0.7–1.3`.
  - `findBouts finds 3 bouts in 3 sets separated by walks`.
  - `a quick set cannot take the previous set's bout`: set 1's bout ends at 40 s, and set 2's `doneAt` is 60 s with only stillness in between. `lastBoutBefore(…, 60, 40)` returns null.
- [ ] **Step 2:** Run `npx vitest run packages/analytics/test/strengthMotion.test.ts` and expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run packages/analytics` and expect PASS.
- [ ] **Step 5:** Commit `feat: find lifting bouts and count reps from wrist motion`.

### Task 9: Core: per-set motion, matching, post-sync recompute and ECG movement

**Files:**
- Create: `packages/core/src/strengthMotion.ts`
- Modify: `packages/core/src/ecg.ts` (`EcgSummary.movementG: number | null`, read from the new column)
- Test: `packages/core/test/strengthMotion.test.ts`

**Interfaces:**
- Consumes: Task 2 `imuBetween`; Task 8 analytics; `StrengthSession` and `listStrengthData` from `strength.ts`.
- Produces:
  - `type SetMotionRow = Omit<SetMotion, 'status'> & { setId: number; status: SetMotion['status'] | 'unmatched'; factor: number; algo: string }`.
  - `toMotionSecond(s: ImuSecond): MotionSecond`: accelerometer / 4096, gyro / 16.384, and −32768 becomes NaN.
  - `computeSessionMotion(driver: SqlDriver, deviceId: number, session: StrengthSession, offsetS: number): Promise<SetMotionRow[]>`.
    - It loads the IMU from (`startedAt` − 120) to (last `doneAt` + 5), in band time.
    - It finds each set's bout with `lastBoutBefore`. Its lower bound is the previous set's `doneAt` (band time) or the previous bout's end, whichever is later; for the first set it is the session start.
    - **Fallback:** when more than half the sets have no bout, it runs `findBouts` over the whole session. If the bout count equals the set count, bouts are assigned in order; otherwise the sets without one get `unmatched`.
    - The factor comes from `tempoFactor`. Its references are readable sets of the same `exerciseKey` whose `doneAt` is strictly earlier than the current set's, in this session or earlier ones. The current set and later sets never count, also during live recomputes. **(owner)**
    - It upserts with `INSERT OR REPLACE`.
  - `listSetMotion(driver: SqlDriver, sessionIds: readonly number[]): Promise<Map<number, SetMotionRow>>`.
  - `sessionsNeedingMotion(driver: SqlDriver, fromBand: number, toBand: number, offsetS: number): Promise<number[]>`: sessions overlapping the range that have a set without a `readable` row.
  - `computeEcgMovement(driver: SqlDriver, deviceId: number, from: number, to: number): Promise<number>`: for each recording overlapping the range with `movement_g` NULL that has ≥ 50 % IMU coverage, it stores the RMS of dynamic |a| (3 s gravity window). It returns the count updated.
  - `afterSignals(driver: SqlDriver, deviceId: number, range: { from: number; to: number }, offsetS: number): Promise<{ sessions: number; ecg: number }>`.

- [ ] **Step 1: Write failing tests**, inserting IMU through `insertSignals` with `synthSession`-shaped seconds (import the helper by copying the generator into `packages/core/test/motionFactory.ts`):
  - `live session with three sets gets readable rows`.
  - `sets logged after the lifting are matched in order`: three bouts at 100, 300 and 500 s, with sets whose `doneAt` values all fall at 900–960 s.
  - `unequal bout count leaves sets unmatched`.
  - `post-sync range finds the session and fills it`: first no IMU (status `none`), then insert rows and call `afterSignals`; the status becomes `readable`.
  - `clock offset shifts set windows`: offset +30 s.
  - `references exclude the current and later sets`: three sets of one exercise; recomputing set 2 uses only set 1 (and older sessions), even when set 3 already has a row.
  - `ECG movement is stored once and survives pruneSignalsBefore`.
- [ ] **Step 2:** Run `npx vitest run packages/core/test/strengthMotion.test.ts` and expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run packages/core` and expect PASS.
- [ ] **Step 5:** Commit `feat: per-set motion with after-the-fact matching and the ECG movement value`.

### Task 10: App: high-rate motion, live set line, Record on band, summary

**Files:**
- Modify:
  - `apps/mobile/src/data/controller.ts`: the setting `strength.highRateMotion`; the workout owner tied to the open session; Record on band; recompute after `addStrengthSet`. `afterSignals` runs whenever a `signalRange` is set:
    - after `sync`;
    - after `redecodeStoredSamples`, through `rebuildFromRaw`'s range, so backfilled ECGs and sessions get their values. **(owner)**
  - `apps/mobile/src/data/types.ts`: `motion: { highRate: boolean; bandRecording: boolean }` and `setMotion: Map<number, SetMotionRow>`.
  - `apps/mobile/src/data/strength.ts`: `muscleLoad(sets, factors?: ReadonlyMap<number, number>)`, plus `export const MOTION_FACTOR_ENABLED = false`.
  - `apps/mobile/src/app/settings/device.tsx`: an enabled toggle; the not-built chip is removed; the body states the battery cost.
  - `apps/mobile/src/app/strength/live.tsx`: the set motion line, the suggestion chip, and the Record on band switch with its cost line.
  - `apps/mobile/src/app/strength/summary.tsx`: motion marks, level D, and a method sheet.
  - `apps/mobile/src/data/terms.ts`, and i18n in `strength.*` and `manage.*` (en and nl).
- Test: `apps/mobile/__tests__/strengthMotionUi.test.tsx` (new), `apps/mobile/__tests__/strength*.test.ts(x)` updates

**Interfaces:**
- Consumes: Task 5 actions; Task 9 `computeSessionMotion`, `listSetMotion`, `afterSignals`.
- Produces: `suggestReps(last: SetMotionRow | undefined, draftReps: string): number | null`. It returns the detected reps when the last set is readable and its count differs from `draftReps`; otherwise null.

- [ ] **Step 1: Write failing tests:**
  - `suggestReps` returns 7 for a readable row with 7 and draft "8", and null for draft "7", for `unreadable` and for `none`.
  - The live screen shows "Band counted 7 · Use", and tapping it sets the draft to 7 without saving a set.
  - `muscleLoad` with factors and `MOTION_FACTOR_ENABLED` false returns plain volume.
  - With factors, a 100 kg × 10 set with factor 1.2 gives 1200 kg.
  - The summary marks sets "with motion" and shows level D.
  - Device: the toggle is enabled and `motion-not-built` is gone.
  - Record on band: turning it on calls `setBandRecording(true)` and shows the cost line.
- [ ] **Step 2:** Run `cd apps/mobile && npx jest __tests__/strengthMotionUi.test.tsx` and expect FAIL.
- [ ] **Step 3:** Implement, following artboards (b) and (c).
- [ ] **Step 4:** Run `cd apps/mobile && npx jest && npx tsc --noEmit`, plus `npm test && npm run lint` at the root. Expect PASS.
- [ ] **Step 5:** Commit `feat: workout motion, set reps from the band and motion-weighted muscular load`.
- [ ] **Step 6: Device check and the owner's validation.**
  - Build and install. Start a strength session with high-rate motion on; log 2 sets; see the motion lines and the chip.
  - Finish the session and confirm no packet 43 arrives afterwards.
  - Ask the owner to do the light/heavy check from the spec. `MOTION_FACTOR_ENABLED` flips to true only in a follow-up after it passes.
  - Run a code review, then open PR 3.

---

## PR 4: ECG movement line

### Task 11: ECG result movement line

**Files:**
- Modify: `apps/mobile/src/app/health/ecg-result.tsx`, `apps/mobile/src/data/terms.ts`, i18n `health.*` (en and nl)
- Test: `apps/mobile/__tests__/ecgScreens.test.tsx`

**Interfaces:**
- Consumes: Task 9 `EcgSummary.movementG`.
- Produces, in `apps/mobile/src/data/ecg.ts`:
  - `movementBand(g: number): 'still' | 'some' | 'lots'`, with still < 0.02 g and some < 0.08 g.
  - `movementMissing(recordingT: number, durationMs: number, lastSyncNewestT: number | null): 'awaitingSync' | 'noData'`. It returns `awaitingSync` only when the reading ends after the newest synced sample (`SyncStateRow.newestSampleT`, null counts as waiting). **(owner)**

- [ ] **Step 1: Write failing tests:**
  - `movementBand` boundaries at 0.0199, 0.02, 0.0799 and 0.08.
  - The result shows "Wrist movement: still (0.01 g)" when `movementG` is 0.01.
  - When `movementG` is null, it shows the reason, never a bare dash:
    - for a reading newer than the last sync, "after the next sync";
    - for an older reading, "no motion data for this reading".
  - `movementMissing` boundaries.
- [ ] **Step 2:** Run `cd apps/mobile && npx jest __tests__/ecgScreens.test.tsx` and expect FAIL.
- [ ] **Step 3:** Implement, following artboard (d).
- [ ] **Step 4:** Run `cd apps/mobile && npx jest && npx tsc --noEmit` and expect PASS.
- [ ] **Step 5:** Commit `feat: show wrist movement during an ECG reading`.
- [ ] **Step 6:** Run a code review, open PR 4, and finish with the ledger.
