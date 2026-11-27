# Using the decoded band events in the app

Short design. Approved on 2026-11-27 ("sounds good") after PR #76 decoded band events 61, 62, 110, 112, 117 and 120.

## Intent
Put the newly decoded values where they make the app more useful or more honest. The owner left the choice of where to me.

## Goals
- **Wear time per day.** Event 120 (wear-detect state) and WRIST_ON/OFF give the exact on- and off-wrist moments. Each day record gets a `worn` value (seconds on the wrist, level A). The home dashboard offers it as a "Worn" tile.
- **Sleep guard.** Seconds the band itself reports as off the wrist are not counted as sleep. This complements the skin-temperature rule from #73.
- **Device screen.** It shows:
  - the current wear state with its time ("On your wrist since 18:07");
  - charging or not charging, as of the last sync;
  - band info: signal-processing version, number of restarts, and the last restart with its raw reason code.
- **Home status card.** The design's existing "Charging" state shows when the band was charging at a sync less than 15 minutes ago.
- **Existing installs.** Days are recomputed once, so wear time appears on old days too.

## Non-goals
- The skin temperature, optical and motion fields in event 120. The per-second records give better values.
- Event 116, reboot-reason meanings, and charger status codes other than 0 and 2.

## Anti-goals
- A wear state or charging state presented as current when it is only as fresh as the last sync. Always show its time.
- Wear time inferred from heart rate when the band never reported a wear change. Show the reason instead.

## Approaches
Wear time:
1. Computed in the core day pipeline (picked). It is stored in each day record, so the day screens, export, coach and widgets share one number, recomputed with everything else.
2. Computed on demand in the app from the events table. It is cheaper to build, but every consumer would have to repeat the logic.

Current state, charging and band info: read from the newest stored events on demand, the same way `latestBatteryPack` works (picked). These are "latest" values, not day values, so storing them would only add a cache to keep in step.

## Decided
- **Wear phase.** On = wear state 1 or 2, or WRIST_ON. Off = wear state 3, or WRIST_OFF. Wear states 0 and 4 leave the phase unknown. Before the first known change the phase is unknown and nothing is counted.
- **`worn` (Derived, algo `wear.time@1`).** The value is the on-wrist seconds in the day window, up to the last sample. Coverage is the share of the window whose phase is known. The reason is `no-data` when no wear change is known by the end of the window.
- **Sleep guard.** In `mergedPeriods`, a SLEEP sample in a known off phase is passed to sleep detection with no state.
- **One-time recompute.** A `DAY_RECORD_VERSION` setting next to `SAMPLE_DECODER_VERSION` makes the app recompute every device's days once on start.

## Left to the builder
Exact strings (en and nl), tile placement in the customise list, and test fixtures.
