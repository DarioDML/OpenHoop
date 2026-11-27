# Mockup Redesign Plan

**Goal:** Every app screen takes the layout and look of its mockup on the design canvas. The app keeps every useful function and piece of information it has today, and it gains the features the mockups show that it lacks.

**Owner decision (2026-11-27):** use the mockup design for every screen. Do not lose any useful function or info the app has now. Build the features the mockups show and the app lacks.

**References**, kept outside the repo because the canvas is private. All are under `D:\dev\OpenHoop-design-ref\`:

| Folder | What it holds |
|---|---|
| `mockups/<Code>.dc.html` | Mockup source: static HTML with inline styles. Values in `{{ }}` come from the `<script type="text/x-dc">` block at the bottom. |
| `renders/<Code>.png` | The mockup rendered at 2x. Read it to see the target. |
| `app-before/<Code>.jpg` | The app before the redesign, on demo data, viewport slices side by side. |
| `compare/batch-1..4.json` | Per screen: `mockupOnly`, `appOnly` and `changed`. **`appOnly` is the list of things to keep.** |

If the folder is gone, re-download the artboards from https://claude.ai/artifact/B3d16Jgnrs2zrHx5pGefsv (`project/<Code>.dc.html`).

## Rules for every screen

1. **Layout comes from the mockup.** Order of sections, hero type (ring, big number, gradient band), cards vs lists, tiles vs rows, chips, charts and primary actions all follow it. Sample numbers in the mockup are placeholders: show real data.
2. **Keep what the app has.** Each `appOnly` item and each function the screen has today keeps a place. Fold it into the mockup's structure: a card, row or tile in the same visual language, placed where it fits the mockup's flow. Usually that is after the mockup's sections or inside the closest one. Never drop a feature, a link, an explanation (`MetricName`, `explain` props, Why or About sheets), a state (empty, calibrating, not built, error) or a test-covered behaviour. Remove an app element only when the mockup shows the same information in another form.
3. **Build what the mockup has.** Each `mockupOnly` item becomes real, working functionality backed by real data. Do not draw static fake UI. If data the feature needs does not exist yet, add it: data layer, settings, storage migrations as the repo does them, and pure functions with tests.
4. **These decisions win over the mockup:**
   - Score names stay **Readiness** and **Load**, never Recovery or Strain (LEGAL.md, Trademarks). Other mockup wording may be used.
   - ECG is a raw trace only, level D. No verdict, no rhythm classification and no ECG heart rate. Irregular rhythm screens say "not part of OpenHoop".
   - No blood-pressure values or estimates. Blood pressure and cuff screens stay "not part of OpenHoop", drawn in the mockup's style. A cuff reading may be logged only if it is shown as the user's own entry. Nothing may be derived from it.
   - No accounts, no cloud backup and no community server (issues #23 and #28). Show those sections honestly, in the mockup style, as not built.
   - Apple Health exists only on iOS. On Android show Health Connect.
   - Accuracy numbers never measured stay "not measured yet". Never invent error values.
   - Nothing is sent off the phone unless the user turns on a network feature. Coach features use the user's own API key through the existing coach client.
5. **Honest states.** Never a bare dash or "No data" without a reason (see PR #88). New metrics get a `data/terms.ts` entry (en + nl) and use `MetricName` / the `explain` props.
6. **Code rules:**
   - No `any` and no implicit `unknown`. No comments unless the logic is non-obvious.
   - Theme tokens only, no hex values in UI code. Icons from `ui/Icon.tsx` (add a path there when one is missing). Text through `AppText` / `Num`.
   - Every string in English and Dutch, with matching placeholders (`__tests__/i18n.test.ts`). Dutch is written, not machine-literal.
   - New keys go in your section's file in `src/i18n/sections/` (table below). Create that file pair if it doesn't exist, and register it the way existing section files are registered.
   - Pure functions take the clock as a parameter.
   - Weight, height, distance, pace and temperature go through `src/lib/units.ts` (`useUnits()`, `formatWeight`, `formatDistance`, `formatTemperature`, …). Users can pick imperial.
7. **Shared components to use first:** `Screen` (with `header` + `tint` for the gradient band and overlapping sheet), `TopBar`, `IconButton`, `Card`, `CardHeader`, `ListGroup` / `ListRow`, `MetricTile`, `StatTile`, `Num`, `Chip`, `Pill`, `ParityBadge`, `Segmented`, `Toggle`, `ToggleRow`, `Field`, `Stepper`, `Button`, `ScoreRing` / `HeroRing`, `LineChart`, `BarChart`, `ZoneBar`, `Sheet`.
   The new ones from the foundation PR:
   - `ValueBars`: bars with values above and a highlighted day.
   - `LevelNote`: the bordered "Level X" note.
   - `CoachAsk`: the gradient-ring coach question pill. It opens `/coach?ask=…`.
   - `SheetScreen`: a route drawn as a bottom sheet over the dimmed screen below. The route also needs an entry in `SHEET_ROUTES` in `app/_layout.tsx`.
   - `RadioRow` in `ui/controls.tsx`.
   - `ActionTile` and `MetricLinkTile` in `ui/Tiles.tsx`.

   A pattern used by two or more screens becomes a component in `src/ui/`. Search first so you don't duplicate one.
8. **Tests:** keep the behaviour tests and update the selectors that move. Add tests for new features and pure functions. Before every push run `npx tsc --noEmit`, `npx jest` and `npx eslint apps/mobile/src --quiet` (from the repo root for eslint).
9. **Git:**
   - Branch `feature/mockup-<section>` from current `master`.
   - One conventional commit per screen or feature. Write the message with `git commit -F <tempfile>` and end it with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   - Push after each commit. Open the PR when the section is done.
   - The PR body lists each screen and what was kept and added, and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
   - Rebase on `master` before opening the PR.
   - Scope Grep/Glob to `apps/mobile/src`, `apps/mobile/__tests__` and `packages/*/src`.

## Sections

| # | Section | Mockups | Route files (`apps/mobile/src/app/`) | i18n section |
|---|---|---|---|---|
| 1 | Home | Main, N2-FirstDays, B2–B9, K1 | `(tabs)/index`, `action-center`, `home/*`, `day/[day]`, `(tabs)/community`, `ui/daily/*`, `widgets/` | daily |
| 2 | Onboarding | A1–A11 | `onboarding/*`, `ui/manage/OnboardingPage` | onboarding (new) |
| 3 | Sleep | C1–C8 | `sleep/*` | sleep (new) |
| 4 | Readiness | D1–D5 (HRV, RHR, Resp, SpO2, SkinTemp) | `recovery/*` | readiness (new) |
| 5 | Load | E1, E2, E10, E11, E12 | `load/*`, `steps` | activity |
| 6 | Activity recording | E3–E9 | `activity/*`, `ui/activity/*` | activity |
| 7 | Strength | F1–F6 | `strength/*`, `ui/strength/*` | strength |
| 8 | Health A | G1–G8, G21, G22, N3, N4, N6 | `(tabs)/health`, `health/{vitals,report,stress,breathing,body-age,pillar,vo2max,heart-rate,metrics}`, `ui/explain/*` | health |
| 9 | Health B | G9–G20 | `health/{ecg,ecg-result,irregular-rhythm,blood-pressure,bp-calibration,cycle,symptoms,pregnancy,labs,biomarker,labs-upload,labs-import,body-composition}` | health |
| 10 | Journal & Coach | H1–H5, I1–I5 | `journal/*`, `coach/*`, `ui/coach/*` | coach / journal (new) |
| 11 | Plan & Profile | J1–J4, L1–L3 | `plan/*`, `profile/*`, `ui/activity/PeriodReport` | plan (new) |
| 12 | Settings & states | M1–M13, X1, N-SystemStates, N5 | `(tabs)/more`, `settings/*` | manage |

### Features to build per section

The full lists are under `mockupOnly` in the compare JSON. These are the ones that need new data or logic.

1. **Home:**
   - Action center and date picker become bottom sheets over Home.
   - Customize dashboard: drag to reorder with `PanResponder` (no gesture-handler library).
   - Evening review: key-behaviour rows with on-target or late status from the journal, wind-down tips, a Tonight card, and a summary sentence.
   - Notifications: Goals filter, Today and Earlier groups, mark all read.
   - Widgets: show a widget style only if Android supports it; say plainly which styles are iOS-only.
   - Past day: a plain title bar with a calendar button, and a coach pill with the date.
2. **Onboarding:**
   - Metric/imperial switch (writes `settings.units`).
   - Full birth date. Section 11 owns the profile model: coordinate through `data/types.ts` `Profile`, and if section 11 has merged, use its field.
   - Sex chips, more goals, a Health Connect permission row and a location switch.
   - Found bands with signal strength (`DiscoveredBand.rssi`).
   - A "back up band configuration" setup step and the page-count progress.
   - Selectable wear location (stored; section 12 shows it).
   - Official-app radio choices.
   - The optional account row stays honest: not built.
3. **Sleep** (start after PR #87, smart wake, is on master):
   - Contributor status bars (Optimal, Sufficient, …) and High sleep stress.
   - Sleep need breakdown: baseline, load, debt, naps.
   - Planner goals Follow plan, Peak and Just get by, plus a wind-down reminder notification.
   - Alarm types: exact, hit sleep goal, in the green. Smart window chips and repeat days, built on #87.
   - Edit sleep: a 24-hour timeline with drag handles, and an Add nap mode.
   - Jet lag: route hero, a 3-day shift chart, tip chips and a shift-my-alarm switch.
   - Trends: a bed and wake range chart and four stat tiles.
   - Last night: typical ranges per stage and the KPI grid (restorative, latency, disturbances, respiratory rate).
4. **Readiness:**
   - Load target card.
   - Contributors as baseline rows with delta chips.
   - 7-day `ValueBars`.
   - Trends: a bar chart plus a high/medium/low split bar.
   - Impacts ranked by journal behaviour, using the journal insights logic, with a confidence label and a needs-more-logs list.
5. **Load:**
   - Ready-to-perform advice card.
   - Buzz at target: band haptic when today's load reaches the target. Use the band actions from PR #83, run on sync or live. Say when it can run.
   - Target page: live progress plus two buzz switches.
   - Steps: progress ring and an hour-by-hour chart.
   - Combined load vs readiness charts and weekly daily blocks.
6. **Activity recording:**
   - Recent activities as chips and an icon grid.
   - Start switches: GPS, broadcast heart rate (`data/hrBroadcast.ts`) and target buzz, plus the band status.
   - Live HUD: a heart-rate ring with zones and a load ring.
   - Full-screen GPS map with per-km or per-mile splits.
   - Details: a load ring, a heart-rate chart over the session and distance.
   - Share: Story 9:16, Square and Transparent formats, a route background, toggle chips, and "hide start and end".
   - Edit: a time-range slider.
7. **Strength:**
   - Build with coach: describe a session and get exercises through the user's coach key. The result goes into the normal editor.
   - Preset templates.
   - Live session: reps and weight steppers, a rest timer (±15 s) and live load.
   - Summary: muscular-load body figure and new records.
   - Exercise: personal records.
   - Trends: strength minutes per week against a weekly goal.
8. **Health A:**
   - Hub tile grid with live values.
   - Vitals: a live heart-rate card and a calibrating banner.
   - Report: summary stats with sparklines, section chips, a custom period, and separate PDF and share actions.
   - Stress: gauge hero and a 12-hour timeline.
   - Breathing: blob animation, driven by `Animated`.
   - Body age: dot-cloud hero, pace of aging and nine contributor rows.
   - Pillar detail: one contributor against the target for your age.
   - VO₂ max: a fitness-level scale.
   - 24-hour heart rate: tabs and a night blood-oxygen chart.
   - All metrics: category chips.
   - About and Why sheets follow N3 and N4.
9. **Health B:**
   - ECG record: countdown ring and signal quality (MG only).
   - ECG result: symptom tags, plus PDF and CSV export.
   - Irregular rhythm: Record an ECG and Connect a provider buttons.
   - Blood pressure: stays not offered, in mockup style.
   - Cycle: phase wheel and predictions, labelled as estimates.
   - Symptoms: flow selector.
   - Pregnancy: adjusted-baseline card and its toggles.
   - Labs: donut summary and status colours.
   - Biomarker: range bar.
   - Upload labs: a three-option chooser.
   - Body composition: a tile grid, the Health Connect source and a chart.
10. **Journal & Coach:**
    - Journal: Yesterday/Today toggle, a voice row, and categories with search.
    - Voice log: detect behaviours from the transcript with local keyword rules, then confirm.
    - Trends: streak, calendar and times-per-week.
    - Insights: a Readiness/Sleep/HRV switch and a ranked list.
    - Coach chat: bubbles, quick prompts and stop.
    - History: grouping by date.
    - Memory: categories.
    - Proactive check-in: the message plus quick replies.
    - Coach settings: tone, proactivity and data-access switches. An on-device model is not possible, so say so.
11. **Plan & Profile:**
    - Plan goals: load days, sleep score, strength minutes and steps, with a difficulty setting.
    - Plan header and what's left.
    - Weekly report: verdict and charts.
    - Monthly report: story pages, best day and next focus.
    - Profile dashboard: body age, level, streaks and hours worn.
    - Badge grid.
    - Edit profile: heart-rate zones auto or custom, resting HR and birth date. **This section owns the profile model.**
12. **Settings & states:**
    - More: Help row.
    - Device: battery health tiles, buzz and find, broadcast HR, wear location.
    - App settings: units, a theme selector (dark, light or system), more notification types, restore layout.
    - Integrations: Strava auto-share modes.
    - Data and privacy: database size, retention and delete all.
    - Developer: packet log, streams and versions, record a raw session.
    - Accuracy: summary and pass/fail only where measured.
    - Band config: compare with the official profile, plus snapshots.
    - Import: a guided flow.
    - Battery pack: ring and charges chart.
    - System states: a board.

## Order

- Foundation PR (shared components, units, this plan).
- Wave 1: sections 11, 12, 1, 4.
- Wave 2: sections 2, 3, 5, 6. Section 3 needs #87 merged.
- Wave 3: sections 7, 8, 9, 10.

Each section: an Opus implementer in its own worktree, then a Sonnet review of the PR, then fixes, CI green and merge. After each wave, the main session builds a 14-day demo APK and captures every changed screen on the emulator against `renders/`. Fixes go in a follow-up PR.
