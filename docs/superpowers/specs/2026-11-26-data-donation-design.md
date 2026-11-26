# Donate your data

Date: 2026-11-26. Status: design, not built. Branch: `feature/data-donation`.

## Why

OpenHoop's scores are reconstructions of the official app's scores. The way to make them more accurate is
to compare raw band data with the official values for the same days, from many people. This feature lets a
user give their own raw band data, plus the official values they imported, to the project in a few taps.
It comes from the design's "Donate a night of data" row under "Support the project", widened by the owner
to any number of whole days.

## Decisions made by the owner

- **Where a donation goes: a public GitHub issue on `DarioDML/OpenHoop`, posted by the donor**, as
  wearable5.0 does. The data is public forever and tied to the donor's GitHub account.
- **The unit is a whole day, not only a night.** A day runs from falling asleep to the next time the user
  falls asleep, which is how the official export counts a cycle. So each day sits next to the official
  values of that day: recovery, sleep, strain and workouts.
- **Donors can give one day, several days, or everything**, chosen from one list with a "Select all" toggle.
- **The app does everything itself except attaching the files in GitHub.** The donor picks days, taps one
  button, and the app builds the files, saves them, and opens the prefilled GitHub form. The only manual
  step left is attaching the files there and submitting, because GitHub only takes attachments through
  its own website.
- **Licence: CC0 1.0.** Donated data is dedicated to the public domain, so anyone, the project included,
  may use it for anything without conditions. The in-app consent, the GitHub form, every README and
  every manifest say so.
- **The band model is visible at a glance**, so the owner sees whether a donation is from a 5.0 or an MG
  without opening it: in the issue title, the first line of the summary, every file name, the manifest
  and the README, and on the screen before donating. The model comes from `devices.model` (`'5.0'` or
  `'MG'`). When it is not known it says "unknown"; it is never guessed. A 4.0 cannot appear, because
  OpenHoop cannot read a 4.0 band.
- **Approved earlier in the conversation:** same layout as wearable5.0's donation; dates stay in; identity
  data is taken out; no profile data (name, age, sex, weight); never journal, notes, GPS, coach, cycle
  tracking or anything outside the chosen days; days with official values are marked "most useful"; the
  app itself makes no network request.

## Goals

- Picking days and building a donation takes one screen and one button.
- A donation never contains anything that identifies the band or the person, beyond what the donor's own
  GitHub account already shows.
- Any number of days works, within GitHub's 25 MB per-file limit for attachments.
- The raw part can be read by wearable5.0's tools without changes.

## Non-goals

- Uploading from the app. GitHub's REST API cannot attach files to an issue, and logging in from the app
  would need a GitHub token and network traffic.
- Any server or paid storage.
- Anonymity from GitHub: the donor posts under their own account.
- Withdrawing or editing a donation after it is posted.
- Shifting dates or times. Every raw record carries the band's clock, and changing it would mean editing
  the raw data.
- Donations from the desktop CLI. The builder lives in `packages/core`, so the CLI can add it later.
- Donating demo (fixture) data.

## Anti-goals (a failure even if it works)

- Any byte of the band's serial number, Bluetooth address or name in a file.
- Data from a previous owner of the band (records before `devices.owner_since`).
- Free text of any kind: notes, journal answers, workout labels, coach messages.
- GPS (`route_points`), cycle tracking, pregnancy, symptoms, lab results, body measurements, strength logs.
- A network request made by the app.
- A normal flow where the donor goes through a share sheet once per file. That is allowed only as the
  fallback when the folder picker fails (see the flow).

## Approaches considered

Where the donation goes (owner chose B):

- A. The donor emails the file to a published address. Free, but the project then holds health data
  privately, with the legal duties that brings, and every donation is manual work.
- **B. The donor posts the files in a public GitHub issue.** Free, open to everyone, no server. The cost
  is that it is public and tied to the donor's account.
- C. One-tap upload from the app to free cloud storage. Easiest for donors, but OpenHoop would get a
  server, costs can grow, and the app would send health data over the network.

How the files get from the phone into GitHub (owner chose the one-button version of A):

- **A. Pick a folder once.** The app writes every part into one folder (Downloads), then opens the GitHub
  form. The donor selects all parts at once in GitHub's file picker. One step, whatever the number of
  parts.
- B. One share sheet per part, like the current "export everything". Proven code, but 30 parts means
  30 share sheets.
- C. One large file that the donor uploads to Drive or WeTransfer and links in the issue. No parts, but the
  data then sits with a third party and the links expire.
- Dropped: uploading from the app (see non-goals) and the project's own server (cost, and it breaks the
  no-server principle).

## The flow

```
Support the project
  ⬆ Donate your data                                    ›
    Share raw band data + official values to improve accuracy

Donate your data
  [intro: why, what goes in, what stays out, needs a free GitHub account]
  Choose days                                 [ Select all ]
   ☑ Tue 24 Nov · slept 7 h 12 m · official values ✓   most useful
   ☑ Mon 23 Nov · slept 6 h 40 m · band data only
   ☐ Sun 22 Nov · slept 8 h 05 m · official values ✓   most useful
   Band 5.0 · 2 days · about 18 MB · 1 file
  ☐ I understand this becomes public on GitHub, under my account,
    and cannot be taken back.
  [ DONATE ]
```

1. **Entry.** A row "Donate your data" on the Support screen (`settings/support.tsx`), as in the design,
   and a second row on the Accuracy screen (`settings/accuracy.tsx`), where it is relevant. Both open a new
   screen `apps/mobile/src/app/settings/donate-data.tsx`. *(My call: the second entry point.)*
2. **Choose days.** One row per day that has a stored day record (`daily_metrics.record`, a `DayRecord`
   with `start`, `end` and `tzOffsetS`), whose `end` lies in the past, and that has raw band data from the
   current owner. Newest first. Each row shows the date, OpenHoop's sleep duration (`sleep.asleepS` of the
   record), and "official values ✓ · most useful" when a `vendor_cycles` or `vendor_sleeps` row overlaps
   the day's window (see "Official values"). "Select all" selects every listed day. There is no maximum
   (owner agreed). When no day has official values, a row links to the official-export import
   (`settings/import.tsx`). *(My call: today is not listed until it has finished.)*
3. **Summary.** Band model, number of days, date range, estimated size and number of files, updated live. The estimate
   comes from stored frame counts. Exact numbers are shown after building.
4. **Consent.** One checkbox, required before Donate is enabled: public, under the donor's GitHub account,
   cannot be taken back, and shared under CC0 1.0 (anyone may use it for anything). With more than one day, the text names the range: "14 days, from 3 Oct to
   24 Nov".
5. **Donate.** One button does the rest:
   1. Build the parts in the app's cache folder, with progress ("Packing day 3 of 14") and a Cancel button.
   2. Save them to a folder. On Android the first donation opens the system folder picker at Downloads
      (`Directory.pickDirectoryAsync(initialUri)` from `expo-file-system` 58, which takes a persistable
      permission), and the app remembers that folder for next time. If writing there fails later, it asks
      again. On iOS the picker opens every time (the picked URL is security-scoped and not bookmarked;
      unverified on a device). *(My call:)* if the folder picker is unavailable or writing into the picked
      folder fails on a platform, the app falls back to one share sheet per part ("Save part 1 of 3"),
      reusing `shareAsync` as `exportData.ts` does.
   3. Open the prefilled GitHub issue form in the same in-app sheet as the money donation (`openCheckout`
      in `support.tsx`, which falls back to `Linking.openURL`).
6. **Done state.** "3 files are in Downloads. Attach all 3 to the post, then submit." Buttons: "Open GitHub
   again" and "Done". *(My call:)* with more than 10 files, the text adds that the rest can be attached in
   comments on the same issue after posting. If saving was cancelled, the parts stay in the cache until the screen is left, so the
   donor can try another folder without rebuilding.

## What goes in a part

Each part is a zip named `openhoop-donation-<code>-<model>-part-<i>-of-<n>.zip`, where `<model>` is `5.0`,
`mg` or `unknown`, for example `openhoop-donation-k3f9x2ab-5.0-part-1-of-3.zip`. With two bands of the same
model, the second set gets `-band-2` after the model, so names never collide. *(My call: English names,
because the files end up in the repo, which is all English.)* `<code>` is 8 random characters, the same for all parts
of one donation, so the parts stay together. It is generated at random and derived from nothing about the
donor or the band.

```
frames.jsonl            raw band records, wearable5.0 format
official/cycles.csv     vendor_cycles rows for the part's days
official/sleeps.csv     vendor_sleeps rows for the part's days
official/workouts.csv   vendor_workouts rows for the part's days
openhoop/days.csv       OpenHoop's daily scores for those days
openhoop/sleeps.csv     OpenHoop's sleeps in those days
openhoop/activities.csv OpenHoop's activities in those days
MANIFEST.json
README.txt
```

- **`frames.jsonl`**: one `{"hex":"<lowercase hex>"}` per line, exactly as wearable5.0's
  `prepare_donation.py` writes it. Only frames that `decodeFrame` accepts (valid CRC), each distinct frame
  once across the whole donation, in time order.
- **Official CSVs**: every column of the `vendor_*` table except `source` and `imported_at`. These are the
  values the app imported, not the original export files: the app does not keep those. `vendor_workouts.activity`
  is the sport type from the export and stays. `vendor_journal` never goes in. Which rows: see
  "Official values" below.
- **OpenHoop CSVs**: numeric and category columns only. Days: `day`, `readiness`, `load`, `sleep_score`
  (not the `record` JSON). Sleeps: `day`, `onset`, `offset`, `asleep_s`, `in_bed_s`, `nap`, `source`.
  Activities that are not deleted: times, `type`, `active_s`, `load`, `zone_seconds`, `avg_hr`, `max_hr`,
  `active_minutes`. Never `note`, `label`, or route points.
- **`MANIFEST.json`**: a superset of wearable5.0's manifest. Its keys `tool`, `frames`, `frame_types`,
  `record_time_span_utc`, `firmware`, `whoop_export_files` and `removed` keep their meaning, and
  `whoop_export_files` lists the official CSVs. Added: `format: "openhoop-donation/1"`, `donation_code`,
  `part`, `parts`, `band_model`, `days` (each with `day`, `start`, `end`, `tz_offset_s`, `official`),
  `files`, and `licence: "CC0-1.0"`. `removed` counts each reason separately (identity frames, serial text, address text, before
  owner, invalid, duplicate, untimed).
- **`README.txt`**: plain English: what this is, what was removed, that dates are real, the CC0 1.0
  dedication with a link to its text, and how the parts belong together.

Never written: anything from `devices` except model and firmware (no `ble_id`, `serial`, `name`,
`owner_since`), and no other table than those listed above.

## Choosing the frames for a day

- **Day window.** The `start` and `end` of the stored day record, which the pipeline computed with
  `dayWindow` in `packages/core/src/pipeline.ts`: from the main night's onset of that day to the main
  night's onset of the next day, or local midnight when there is no main night. No second definition and
  no recomputation.
- **Which chunks.** The chunk ids for a window come from `samples_1hz.chunk_id` and `events.chunk_id` with
  `t` inside the window, both indexed by `(device_id, t, …)`. No full scan of `raw_chunks` and no
  migration. *(My call.)*
- **Which frames.** Frames come from those chunks (`decodeChunk(frames, sha256)`). A frame belongs to a day
  when its band time (`unixS` of the decoded packet) is inside the window, as `samples_1hz` uses. A chunk
  that spans two days gives frames to both. A frame without a band time takes the time of the nearest earlier timed frame in the
  same chunk, or the nearest later one; a chunk without any timed frame is left out. *(My call.)*
- **Owner.** Frames timed before `devices.owner_since` are left out, as `rebuildFromRaw` does.
- **Corrupt chunks.** A chunk that fails `decodeChunk` (`ChunkIntegrityError`) is skipped and counted in
  `removed`; the donation continues.
- **More than one band.** When the chosen days hold data from more than one band, each band gets its own
  set of parts, so every part has one band, one firmware line and one frame stream. *(My call.)*

## Official values

*(My call, all of this section.)* The `vendor_*` tables have no band column and their `day` can differ from
OpenHoop's day, because the official app and OpenHoop each detect sleep themselves. So rows are matched by
time, not by the `day` string:

- An official row goes with every chosen day whose window it overlaps: `vendor_cycles` by
  `start_t`..`end_t` (an open cycle, `end_t` null, counts until its `start_t` plus 24 hours),
  `vendor_sleeps` by `onset`..`wake`, `vendor_workouts` by `start_t`..`end_t`.
- A row that overlaps two days goes with both, so the same row can appear in two parts. README says so.
- When a day has frames from two bands, its official rows go into the parts of both bands.
- The CSVs keep the vendor `day` and all times, and the manifest gives every window, so anyone can redo
  the matching their own way.

## Identity filter

Taken over from wearable5.0's `re/prepare_donation.py`, applied to every frame before it is written:

- packet type 36 (command response) with command in {35, 145, 76, 77, 140, 141, 151};
- packet type 35 (command) with byte 10 in {77, 140};
- packet type 48 (event) with event in {61, 62, 109};
- any frame whose bytes, read as Latin-1 text, match the serial pattern `(?:5A[GM]|MGB)[0-9]{6,}` or the
  address pattern `(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}`;
- also any frame whose Latin-1 text contains the stored serial or Bluetooth name of any of the donor's
  bands, when those are known and at least 6 characters long after trimming, so an empty or generic value
  cannot match everything. *(My call: a second net in case a firmware uses another serial format.)*

Each rule has its own count in `removed`.

## Splitting into parts

- GitHub accepts files up to 25 MB on issues. A part is at most 24 MiB, which leaves a margin.
- Whole days are packed in date order, filling each part before starting the next. A day is split across
  parts, by time, only when it alone is larger than the limit.
- Each part is self-contained: its own manifest, README and CSV rows for its own days.
- Measured on simulated data: one day is 86,400 records, 22.4 MB of JSON lines and 1.4 MB zipped
  (16.6 bytes per record). Real band data is noisier and compresses less well, so real days will be larger;
  that is not measured yet. The on-screen estimate uses 20 bytes per record and is a lower bound; the exact
  sizes are shown after building. The limit holds either way because of splitting.
- Parts are built one at a time and written to disk before the next starts, so memory does not grow with
  the number of days. *(My call:)* a part is written with `fflate`'s streaming `Zip`/`ZipDeflate` into a
  file handle, not with `zipSync`, so a whole part never has to sit in memory as one string.
- *(My call:)* packing uses each day's compressed size, measured while building. The final size of every
  part is checked after writing; a part over the limit is rebuilt with its last day moved to the next part.

## The GitHub side

- New issue form `.github/ISSUE_TEMPLATE/data-donation.yml`: title prefix `Data donation: `, label
  `data-donation`, a short public-data warning, a textarea `summary` (prefilled by the app), a textarea
  `files` for the attachments (required), and a required consent checkbox repeating the in-app consent and
  the CC0 1.0 dedication. A template does not create labels, so the label `data-donation` is created on GitHub with
  `gh label create` when the work merges. *(My call.)*
- The app opens `https://github.com/DarioDML/OpenHoop/issues/new?template=data-donation.yml&title=…&summary=…`.
  The title starts with the band model, then the number of days and the date range:
  `Data donation: 5.0 · 14 days · 2026-10-03 to 2026-11-24` (with two bands: `5.0 + MG`). The summary
  starts with the band model, then the donation code, the number of parts, firmware, app version, and
  which days have official values. Labels per model are not set from the app, because a link can only
  add labels for people with write access to the repo. Kept short enough that
  the URL stays well under GitHub's length limit.

## Privacy and texts

- Opening GitHub is a browser page, like the money donation, outside the network gate. The app makes no
  request; README's privacy section says so.
- The screen says plainly what goes in, what stays out, that dates are real, and that it becomes public.
- All texts in English and Dutch (`manage.en.json` / `manage.nl.json`).
- Checkboxes and the Select-all toggle have checkbox roles and states; progress and errors are announced.

## Errors

- Folder picker cancelled: back to the screen with the parts kept; Donate becomes "Save files".
- Not enough space, or a write fails: say so, remove partial files, keep the selection.
- Build cancelled: remove the parts from the cache.
- GitHub cannot open: the same message as the money donation, plus where the files are.
- Leftover build folders in the cache are removed at app start, as `removeLeftoverExports` does.

## Testing

- `packages/core` (vitest): every identity rule, the owner cutoff, day windows, untimed frames, duplicates,
  invalid frames, corrupt chunks, one part vs several, a day larger than the limit, more than one band,
  manifest keys, CSV columns, and that forbidden tables and columns never appear.
- `apps/mobile` (jest): the day list, Select all, the consent gate, the one-button flow with the picker,
  file system and browser mocked, cancel, errors, the remembered Android folder, Dutch texts.
- On devices: Android emulator and iOS simulator, with a database that holds real raw chunks: the folder
  picker, the files in Downloads, GitHub opening with the form filled in. Attaching and posting needs a
  GitHub login, so the owner checks that step.

## Left to the builder

The exact layout and copy of the screen within the app's existing components, the size-estimate formula,
how the random code is generated (a secure random source), progress granularity, and the zip compression
level.
