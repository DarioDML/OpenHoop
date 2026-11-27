# Explain metrics and missing values — design

Date: 2026-11-27. Owner-approved screens: design canvas page "N · States & patterns", artboards N2–N6
(https://claude.ai/artifact/B3d16Jgnrs2zrHx5pGefsv#page-states).

## Why

After the first real night on the S24 (26→27 Nov) the app showed many blanks: "Not enough readings",
"Calibrating range", "Needs more nights first", "No data". The owner could not tell whether the band was
not read or the app simply needed more data. Most were the app waiting for history; none were read failures.
Many names (HRV, SpO2, Load, consistency, efficiency, "Sleep nights") also mean nothing to a normal person.

The owner rejected a glossary-first approach: people must learn **where the number is shown**, not on a
separate page. WHOOP opens every score into what is behind it; Fitbit Air opens a tile into a detail page
with "Learn more" and a per-metric coach shortcut. Reviewers criticise both for chatty coaches and
information overload, so explanations stay short.

## Goals

1. Every missing value says in plain words: is the band being read, what is missing (with "have / need"),
   and when the number will appear.
2. Every metric name, where it is displayed, opens a plain explanation in place (bottom sheet), showing
   the user's own value.
3. Lists of jargon metrics carry a one-line plain meaning under the name; friendly names lead
   ("Blood oxygen", with SpO₂ as the secondary name).
4. Home in the first nights: readiness is hidden until it has 3 nights ("2 nights left" ring), and a
   "Your first week" card lists what is still building and how many nights each needs.
5. Load shows a running "so far" number for the current day.
6. Sleep efficiency is computed from the sleep stages when stages exist.
7. An "All terms" list exists as a secondary index (Settings › About), built from the same registry.
8. English and Dutch for every new string.

## Non-goals

- No change to any analytics model or calibration. The readiness HRV starting value (103 ms) that pulls
  first-weeks readiness down gets its own issue.
- No new metrics, no AI-written explanations. The coach is only linked to.
- No chart rework. No change to PR #87 (alarm).

## Anti-goals

- Never fill a gap with a guess or show a placeholder number.
- No medical claims beyond what README/LEGAL already promise (no "normal is 95–100 %", no diagnosis).
- No lecture: a sheet is short; a list line is one line.

## Approaches considered

- **A. Explanations in place (chosen).** Name → explanation sheet; missing value → "why" sheet; plain
  one-liners in lists; glossary only as an index. Matches the owner's request and the WHOOP/Fitbit pattern.
- **B. Glossary page only.** First proposal; rejected by the owner because users must leave the data.
- **C. Long explanations always visible.** Rejected: clutter, the overload reviewers complain about.
- **D. Per-metric AI answers.** Rejected: coach needs the user's own API key, and reviewers found such
  answers chatty and sometimes wrong. A plain link to the coach stays.

## Decisions

| Topic | Decision | By |
|---|---|---|
| Visual design | Canvas N2–N6, existing OpenHoop tokens and components | Owner, 2026-11-27 |
| Readiness in first nights | Hidden until 3 earlier nights (`READINESS_CALIBRATING_NIGHTS`); ring shows nights left | Owner (approved N2) |
| Load today | Show "so far" value for the current day | Owner (approved N2) |
| Finished day under 10 h | Keep "no number"; the why sheet says "worn X h of 10 h" | Owner (approved N4) |
| Efficiency | From stages when present: (in bed − stage wake) / in bed | Claude's call, owner did not object |
| Names | App names Readiness and Load, not the canvas's Recovery and Strain | Claude's call |

## Design

### 1. Why a value is missing

A pure mobile function turns a metric's stored state into an explanation:

- **Input:** term id, the day list and index, now, device sync state.
- **Output:** a kind, whether the band was read (last sync, night recorded), progress `{have, need, unit}`
  where it applies, and the expected moment (weekday morning for nights, clock time for today).

| Kind | Comes from | User sees (short status / sheet) |
|---|---|---|
| needs-nights | `needs-history`, calibrating readiness, missing baseline | "2 more nights" / band read ✓, "needs 3 nights, you have 1", "expected Sunday morning" |
| day-running | load on a finished day with < 600 valid minutes | "worn 6 h of 10 h" / why the 10 h rule exists |
| not-recorded | `no-sleep`, `no-data`, no samples for the night | "Not recorded" / no band data for the night, next chance tonight |
| thin-signal | `low-coverage` on a night metric | "Too little signal" / signal too noisy, fit tip; the measured share only if the pipeline exposes it |
| needs-profile | `no-profile` | names the missing profile fields, links to profile |
| signal-missing | `missing-signal` | "The band did not send this signal" |

Thresholds are imported from the packages that own them (analytics, core, `data/derived.ts`). No new
magic numbers in UI code. Pipeline reasons that are not in the table keep today's fallback text.

### 2. Explanation sheets in place

- **Sheet primitive:** one reusable bottom sheet (RN `Modal`, slide, dimmed backdrop that closes it),
  extracted from the pattern in `ui/strava/StravaUploadCard.tsx`.
- **Provider:** an app-level explain provider lets any component open the "about" sheet for a term,
  or the "why" sheet for a missing value.
- **Term registry:** one entry per term with:
  - name, full name and a one-line meaning;
  - a short body;
  - two optional "often higher / often lower" lists;
  - its level, taken from `ui/parity.ts`, and its method line.

  All text lives in i18n (en + nl). The registry drives the sheets, the one-liners and the All terms list.
- **Metric name with info:** the name plus a small (i). It is a button with a hit area of at least
  44 px and the a11y label "What is X?".
- **Surfaces wired at minimum:**
  - Home: rings, cards and tiles via `MetricTile`.
  - Metric detail: an (i) in the top bar, as in design D4.
  - Readiness: the contributor rows.
  - Sleep: the tiles and contributors.
  - Vitals: the rows.
  - Load: the hero.
  - Stress: the tile.
  - All metrics: the list.

  On these surfaces a missing value opens the why sheet.
- **Sheet content:**
  - title, full name and body;
  - "Your night / today", showing either the value or the missing status;
  - the two lists;
  - level badge and method;
  - "Ask the coach about this ›", which only navigates.

### 3. Home in the first nights

- **Readiness ring:** while fewer than 3 earlier nights have readiness inputs, it shows a segmented ring
  with "N nights left" and no number. The readiness number is hidden consistently wherever it appears as a
  day's score: home, the readiness screen, the morning brief, widget, digest notification and trends.
  The stored record is unchanged.
- **"Your first week" card:** replaces the yellow calibrating notice. Each row is an item still building
  (readiness, consistency, normal ranges, skin temp change, stress) with progress dots and "N more nights".
  The card disappears when nothing is building.
- **Vitals card:** "5/5 measured · ranges from night 4" instead of "Calibrating range".
- **Stress tile:** "Not yet", plus the reason.
- **"Sleep nights" (weekly plan):** reads as "Nights at sleep need".

### 4. Load so far

The pipeline stores an optional `loadSoFar` on `DayRecord` when the day has heart rate but fewer than
`LOAD_MIN_VALID_MINUTES`. It is the same sum → load mapping, so there is no model change. Older records
without the field still parse.

The UI shows it, labelled "so far", only for the current, still-open day. Finished days keep the 10-hour
rule.

### 5. Efficiency

When a night has stage totals: efficiency = (in bed − stage wake) / in bed. Otherwise: asleep / in bed.

### 6. Wording

- Plain, short sentences in the existing OpenHoop tone. The canvas copy is the reference.
- Dutch translations are written, not machine-literal.

## Testing

- Unit tests:
  - the why mapping for every kind, including have/need and expected weekday/time;
  - the readiness-hiding helper;
  - efficiency;
  - `loadSoFar` in the pipeline, with old records still parsing.
- Component tests:
  - tapping a name opens the about sheet;
  - tapping a missing value opens the why sheet;
  - the first-week card shows and hides;
  - the readiness ring shows nights left.
- Existing i18n parity test covers en/nl keys. Run `npm test`, `npm run typecheck` and lint at the root and
  in `apps/mobile`.
- Manual check on the S24 with a release build that keeps the user's data (see the device workflow memory).

## Settled during the builder check (Claude's calls)

1. **Copy.**
   - The approved copy is the canvas text (N2–N6). It covers the five vitals, consistency, load, the four
     "why" cases and the All terms one-liners.
   - Terms the canvas does not cover get copy in the same tone. "Often higher / lower" lists appear only
     where the canvas has them.
   - The owner reviews all copy in the PR.
2. **Readiness hiding.**
   - One accessor decides whether a day's readiness is shown. It uses the stored per-day
     `readinessCalibrating` flag, so the first nights stay hidden in trends too.
   - Every surface uses it:
     - ring, readiness screen and trends;
     - morning brief: "Readiness appears after N more nights";
     - widget: "N nights left";
     - digest notification: leaves readiness out;
     - coach context: no readiness value while hidden.
3. **Load so far.**
   - It is refreshed whenever the pipeline recomputes the open day, which is every sync, and is shown as
     "so far" next to the sync time.
   - The current day is the last day in the list.
   - The "day-running" why case is only for finished days ("worn X h of 10 h"), so it never predicts a
     clock time.
4. **"Band is being read".** Shown with a check mark only when that day's record exists with samples for
   the relevant window and the last sync is under 24 h old. Otherwise the first line says when the last
   sync was.
5. **Thresholds.** Constants not yet exported get exported from their owning module, for example the skin
   baseline nights in the pipeline. UI code imports them.
6. **Missing profile fields.** Computed in the app from the stored profile, as the calories card already
   does.

## Left to the builder

- File layout.
- Which extra surfaces get the (i) beyond the minimum.
- How readiness hiding is centralised, as long as it is consistent.
- Whether the coach link pre-fills a question.
