# Band Events in the App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the decoded wear-detect, charger and boot events in OpenHoop: wear time per day, a sleep guard, band status on the device screen, and the home "Charging" state.

**Architecture:** Two PRs.
- **PR A (`feature/wear-time`).** A wear timeline built from events 120, 9 and 10 feeds a new `worn` value in each day record, plus an off-wrist sleep guard, both inside the core day pipeline. A one-time day recompute fills in old days. A "Worn" dashboard tile shows the value.
- **PR B (`feature/band-status`).** `latestBandStatus` reads the newest wear, charger and boot events on demand. The device screen and the home status card show them.

**Tech Stack:** TypeScript (strict), vitest for packages, jest + @testing-library/react-native for `apps/mobile`, SQLite through the core `Store`.

**Spec:** `docs/superpowers/specs/2026-11-27-band-events-in-app-design.md`

## Global Constraints
- Strict TypeScript: no `any`, no unchecked casts. Add no comments unless the logic is non-obvious.
- TDD: write the failing test first and watch it fail.
- Phase rules:
  - **On:** wear state 1 or 2 (`onWristUnconfirmed`, `onWrist`), or event 9 (WRIST_ON).
  - **Off:** wear state 3 (`offWrist`), or event 10 (WRIST_OFF).
  - **Unknown:** wear states 0 and 4, and everything before the first change.
- `worn`: Derived, `algo: 'wear.time@1'`, value in seconds, `coverage` = known share of the window, `reason: 'no-data'` when no change is known by the end of the window.
- Level A for wear time.
- Charging card threshold: the last sync less than 900 s ago.
- en and nl strings for every new key.
- Never present a wear or charging state without its time.

## Review Focus
- **A day before the first wear event:** `worn` must be `no-data`, not 0.
  - Task 2 tests `wornSeconds` with no prior change.
  - Task 3 tests a day record without events.
- **A band without event 120, such as older firmware:** WRIST_ON and WRIST_OFF alone must give wear time. Task 2 tests that.
- **Unreadable event 120 payloads (wrong length):** skip them, don't crash. Task 2 tests that.
- **Charging that ended after the last sync:** the home card must not say "Charging" once the sync is stale. Task 8 tests a sync 901 s ago.
- **A demo band without events:** the device screen shows "unknown" and no times. Task 7 tests that.

---

## PR A — wear time and sleep guard

### Task 1: Store queries for events by number

**Files:**
- Modify: `packages/core/src/store/types.ts` (Store interface), `packages/core/src/store/store.ts`
- Test: `packages/core/test/wear.test.ts` (new, shared with Task 2)

**Interfaces:**
- Produces:
  - `Store.eventsOf(deviceId: number, events: readonly number[]): Promise<EventRow[]>`, ordered by `t, id`.
  - `Store.latestEventsOf(deviceId: number, events: readonly number[], limit: number): Promise<EventRow[]>`, ordered by `t DESC, id DESC`.

- [ ] **Step 1: Failing test.** `it('lists the events of the given numbers, oldest first, and newest first with a limit')`. Insert events 9, 120, 3 and 10 through `commitChunk` extras. Then:
  - `eventsOf(id, [9, 10, 120])` returns 9, 120, 10 in time order, without event 3.
  - `latestEventsOf(id, [9, 10], 1)` returns only the newest of the two.
- [ ] **Step 2: Run `npx vitest run packages/core/test/wear.test.ts`.** Expect FAIL: `eventsOf` is not a function.
- [ ] **Step 3: Implement both methods.** Use `IN (?, ?, …)` placeholders built from the array length, and return `[]` for an empty list.
- [ ] **Step 4: Run again.** Expect PASS.

### Task 2: Wear timeline

**Files:**
- Create: `packages/core/src/wear.ts`, exported from `packages/core/src/index.ts`
- Test: `packages/core/test/wear.test.ts`

**Interfaces:**
- Consumes: `decodeEventDetail` from `@openhoop/protocol`, and Task 1.
- Produces:
  - `type WearPhase = 'on' | 'off'`
  - `interface WearChange { t: number; phase: WearPhase }`
  - `wearChanges(rows: readonly EventRow[]): WearChange[]`. Sorted. It skips undecodable or unknown-state rows and drops a change that repeats the previous phase.
  - `wornSeconds(changes: readonly WearChange[], from: number, to: number): { wornS: number; knownS: number } | null`. Returns null when no change is at or before `to - 1`.
  - `phaseAt(changes: readonly WearChange[]): (t: number) => WearPhase | null`. A sweeping lookup for ascending `t`.
  - `loadWearChanges(store: Store, deviceId: number): Promise<WearChange[]>`, which calls `eventsOf(deviceId, [9, 10, 120])`.

- [ ] **Step 1: Failing tests.**
  - `it('turns wear-detect, WRIST_ON and WRIST_OFF events into on and off changes')`. Use real event 120 payloads from `packages/protocol/test/bandEvents.test.ts`: 3→1, 1→3, 1→2, and 2→2 (a repeat). The results are on, off, on, with the repeat dropped.
  - `it('ignores a wear-detect payload of the wrong length and the boot state')`.
  - `it('counts worn seconds inside a window, and only what is known')`:
    - changes on at 100 and off at 400, window [0, 1000) → `{ wornS: 300, knownS: 900 }`;
    - window [200, 300) → `{ wornS: 100, knownS: 100 }`.
  - `it('knows nothing about a window before the first change')`. A window [0, 50) with the first change at 100 → `null`.
  - `it('uses WRIST_ON and WRIST_OFF alone for a band without wear-detect events')`.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.**
  - 120 → `decodeEventDetail(120, fromHex(payloadHex))`. `toState` maps `onWrist`/`onWristUnconfirmed` to on and `offWrist` to off. Anything else is skipped.
  - 9 → on, 10 → off.
- [ ] **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Commit** with `feat(core): build a wear timeline from wear-detect and wrist events`.

### Task 3: `worn` in day records and the off-wrist sleep guard

**Files:**
- Modify:
  - `packages/core/src/store/types.ts` (`DayRecord.worn?: Derived`)
  - `packages/core/src/pipeline.ts`: `Context.wear: WearChange[]`, loaded in `recomputeDays`; `mergedPeriods` masks samples; `computeDay` sets `worn`
- Test: `packages/core/test/pipeline.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces: `DayRecord.worn?: Derived`. It is optional because records stored before this change don't have it.

- [ ] **Step 1: Failing tests.** Use `simulateDays` from `sampleFactory` and commit wear events with `commitChunk` extras.
  - `it('records how long the band was worn each day')`. With on at the window start and off at +10 h, `worn.value` is 36 000, `algo` is `'wear.time@1'`, and `reason` is null.
  - `it('says there is no wear data for a day without wear events')`. `worn` has `value: null` and `reason: 'no-data'`.
  - `it('does not count SLEEP while the band says it is off the wrist')`. Off is known from the night's start to 3 h later: the main night's `asleepS` drops by about 3 h compared with the same data without events. Assert that it is ≤ the original minus 10 000.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.**
  - `mergedPeriods(ctx, samples, from, to)` passes `samples.map(s => s.state === 'SLEEP' && lookup(s.t) === 'off' ? { ...s, state: null } : s)` to both `sleepPeriods` and `applySleepEdits`. Use a fresh `phaseAt(ctx.wear)` per call.
  - `computeDay` adds `worn` from `wornSeconds(ctx.wear, start, end)`, with coverage = `knownS / (end - start)`.
- [ ] **Step 4: Run** `npx vitest run packages/core`. Expect PASS, and the existing pipeline tests unchanged.
- [ ] **Step 5: Commit** with `feat(core): wear time per day and no sleep while the band is off the wrist`.

### Task 4: One-time day recompute

**Files:**
- Modify: `packages/core/src/redecode.ts`, `apps/mobile/src/data/controller.ts` (`redecodeStoredSamples`)
- Test: `packages/core/test/redecode.test.ts`

**Interfaces:**
- Produces:
  - `DAY_RECORD_VERSION = 1`
  - `DAY_RECORD_VERSION_KEY = 'days.recordVersion'`
  - `recomputeStaleDays(store: Store, recompute: (deviceId: number) => Promise<void>): Promise<number[]>`. It recomputes each device that has samples. It records the version only when all of them succeed, the same pattern as `rebuildStaleSamples`.

- [ ] **Step 1: Failing tests.**
  - `it('recomputes every device with samples once')`
  - `it('does nothing once the day records are current')`
  - `it('keeps the version stale when a recompute fails')`
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement**, then call it in the controller after `rebuildStaleSamples`, with the same recompute callback.
- [ ] **Step 4: Run** the core tests and mobile `npx tsc --noEmit`. Expect PASS.
- [ ] **Step 5: Commit** with `feat: recompute stored days once when day records gain a value`.

### Task 5: "Worn" dashboard tile

**Files:**
- Modify:
  - `apps/mobile/src/data/userData.ts` (`DASHBOARD_TILES` gains `'wearTime'`; the default stays unchanged)
  - `apps/mobile/src/ui/daily/metrics.ts` (`TILE_LABEL`)
  - `apps/mobile/src/ui/daily/cards.tsx` (`DashboardGrid` branch)
  - `apps/mobile/src/ui/parity.ts` (`wearTime: 'A'`)
  - the accuracy screen labels
  - `src/i18n/sections/daily.{en,nl}.json`
- Test: `apps/mobile/__tests__/daily.test.tsx`

- [ ] **Step 1: Failing tests.**
  - `it('shows wear time as a dashboard tile')`. With dashboard tiles `['wearTime']` and a day `worn.value` of 54 720, the tile `tile-wearTime` shows "15 h 12 min" and level A.
  - `it('says why wear time is missing')`. For `worn` undefined or `no-data`, the tile shows the no-data reason.
- [ ] **Step 2: Run** `npx jest __tests__/daily.test.tsx`. Expect FAIL.
- [ ] **Step 3: Implement.** Use the Sleep-debt branch pattern with `format={(v) => formatDuration(t, v)}`, no href. Strings: `metric.wearTime` = "Worn" / "Gedragen".
- [ ] **Step 4: Run** the jest suite and `tsc`. Expect PASS.
- [ ] **Step 5: Commit, review, push, PR.**

## PR B — band status

### Task 6: `latestBandStatus`

**Files:**
- Create: `packages/core/src/bandStatus.ts`, exported from the index
- Test: `packages/core/test/bandStatus.test.ts`

**Interfaces:**
- Consumes: Task 1 (`latestEventsOf`), Task 2 (`wearChanges`), `decodeEventDetail`.
- Produces:
  - `interface BandStatus { wear: { phase: WearPhase; since: number } | null; charging: { charging: boolean; at: number } | null; boot: { lastBootAt: number | null; bootCount: number | null; rebootReason: number | null; signalProcessingVersion: string | null } }`
  - `latestBandStatus(store: Store, deviceId: number): Promise<BandStatus>`
- Sources:
  - **wear:** the newest change from `wearChanges(latestEventsOf([9, 10, 120], 50))`.
  - **charging:** the newest of event 117 (status ≠ 0), event 110 (charging flag), event 7 (on) and event 8 (off).
  - **boot:** event 15 time, event 62 count, event 112 reason, and event 61 as `major.minor.patch`.

- [ ] **Step 1: Failing tests.**
  - `it('reports the newest wear change and when it happened')`
  - `it('reports charging from the newest charger event, CHARGING_OFF included')`
  - `it('reports the last boot with its count, reason and signal processing version')`
  - `it('reports nothing it has not seen')`. With no events, everything is null.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** with `feat(core): read the band's latest wear, charging and boot status`.

### Task 7: Device screen

**Files:**
- Modify:
  - `apps/mobile/src/data/types.ts` (`DeviceStatus.band: BandStatus | null`)
  - `src/data/controller.ts`: load in `loadActiveDevice`; refresh after sync, after the re-decode and after an owner-date change, the same places as `batteryPack`
  - `src/data/fixtureSource.ts`
  - `src/app/settings/device.tsx`
  - `src/i18n/sections/manage.{en,nl}.json`
- Test: `apps/mobile/__tests__/manage.test.tsx`

- [ ] **Step 1: Failing tests.**
  - `it('shows the wear state with its time')`. "On your wrist" and "since" show with formatAgo.
  - `it('shows charging as of the last sync')`
  - `it('shows the band info rows')`. Signal processing "12.0.6", restarts "31", last restart, and reason "0x1001".
  - `it('shows unknown band status for a band without these events')`
- [ ] **Step 2–4:** Run (FAIL), implement `KeyValueRow`s in a new "Band" card, run (PASS).

### Task 8: Home "Charging" state

**Files:**
- Modify: `apps/mobile/src/ui/manage/deviceState.ts` (`DeviceStateId` gains `'charging'`), `src/ui/manage/DeviceStateCard.tsx`
- Test: `apps/mobile/__tests__/manage.test.tsx` (`pickDeviceState`)

- [ ] **Step 1: Failing tests.**
  - `it('shows Charging when the band was charging at a sync under 15 minutes ago')`. With `band.charging.charging` true and `lastSyncAt` at `nowS - 600`, the result is `'charging'`, before `'lowBattery'`.
  - `it('drops Charging once the sync is older than 15 minutes')`. `lastSyncAt` at `nowS - 901` → not charging.
- [ ] **Step 2–4:** Run (FAIL), implement (constant `CHARGING_FRESH_S = 900`, using the existing `states.charging.*` strings and the plug icon), run (PASS).
- [ ] **Step 5: Commit, review, push, PR.**
