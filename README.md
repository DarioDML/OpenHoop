<img src="assets/icon.svg" width="64" height="64" alt="">

# OpenHoop

OpenHoop is a local, open-source client for the WHOOP 5.0 / MG fitness band. It reads the band over Bluetooth, stores the data on your own device and computes sleep, heart rate variability, readiness and load from it. There is no account, no server and no subscription.

OpenHoop is not affiliated with or endorsed by WHOOP, Inc.

OpenHoop is not a copy of the vendor's app. It does not reproduce the vendor's scores. It has its own scores, built from published facts about the protocol and from models fitted on one wearer, and it labels how close each value is expected to be to the vendor's (see "Parity levels").

> **Status: tested only against a simulated band.**
> The physical bands have not arrived. Every test so far runs against a software band that speaks the same wire protocol. Every Bluetooth path (pairing, reading, history transfer, live heart rate) is untested until real hardware is available. Treat every protocol detail as a documented guess until it appears as verified in `docs/provenance.md`.

## The firmware 50.43+ data lock

From firmware 50.43 the band withholds history unless it holds a certificate signed by the vendor. OpenHoop does not and will not bypass this: it never tries to capture, replay or forge that certificate, and the commands involved cannot be built in the code. Live heart rate over the standard Bluetooth heart rate profile still works on a locked band. The public report of this behaviour is https://github.com/OpenStrap/edge/issues/673.

On a locked band OpenHoop says so and shows no history. The first command to run on a new band is `triage`, which is read-only and reports the firmware version and whether the band releases data.

## Quick start

You need Node 22.13 or newer. The project is developed on Node 26.

```
npm install
npm test
npm run openhoop -- sim --days 3 --db ./openhoop-data/demo.db
npm run openhoop -- days --db ./openhoop-data/demo.db
```

The `sim` command fills a database from the simulated band. The `days` command prints the day records: readiness, load, sleep, HRV and resting heart rate.

Run `npm run openhoop -- help` for the other commands: `triage`, `live`, `sync`, `recompute`, `export`, `decode`, `profile`. Commands that use Bluetooth print "Bluetooth path: UNTESTED until day 1" unless `--sim` is given.

The phone app is an Expo app for Android and iOS. To run it from source on Android (it needs the Android SDK and an emulator or a device, and it is a development build, not Expo Go):

```
cd apps/mobile && npm install && npx expo run:android
```

On a Mac with Xcode, `npx expo run:ios` does the same for iOS. The app can use the real band or a built-in demo band.

### Ready-made builds

The `App builds` workflow (`.github/workflows/apps.yml`) builds an Android APK and an iOS simulator build, and launches the app to check that it stays up. It runs on pull requests and `master` pushes that change the native setup, on demand from the Actions tab, and on every `v*` tag. Tags and manual runs also build the unsigned iOS IPA. To install the files on a phone, see [docs/installeren.md](docs/installeren.md) (Dutch).

Pull request and on-demand builds sign the APK with the public debug key: fine for testing, but anyone could sign an update for it.

#### Releasing

1. Bump `expo.version` in `apps/mobile/app.json` in a PR and merge it. The Android `versionCode` and iOS `buildNumber` are derived from it in `app.config.ts` (`1.2.3` becomes `1002003`), so every release installs over the previous one.
2. Tag the merge commit on `master` as `v<version>` (or `v<version>-rc.1`) and push the tag. Only admins can create `v*` tags, and tags cannot be moved or deleted.
3. The tag run checks that the tag matches `app.json` and is on `master`, reruns CI, and builds an **unsigned** APK. Signing happens in a separate job in the `release` environment, which waits for your approval and is the only place the key exists.
4. The release gets the APK, the IPA, `SHA256SUMS.txt` and a build-provenance attestation (`gh attestation verify <file> --repo DarioDML/OpenHoop`).

Put the signing key in the `release` environment as secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Then set the repository variable `ANDROID_SIGNING_CERT_SHA256` to the certificate fingerprint (`keytool -list -v -keystore <file>`). Releases refuse to publish until it is set, and fail if the APK was signed with any other key. To rehearse a release without publishing, start **App builds** from the Actions tab with **release dry run** checked: it runs the whole path and signs with a throwaway key. The IPA needs no secrets: every iPhone user signs it with their own Apple ID.

A Dutch runbook for the first day with a real band is in [docs/dag-1.md](docs/dag-1.md).

## Package map

| Path | What it is |
| --- | --- |
| `packages/protocol` | Bluetooth frame format, decoders, encoders, command table and the safety lock on commands. No dependencies. |
| `packages/analytics` | Pure functions from samples to nightly values and scores. |
| `packages/core` | Transport and storage interfaces, session, lock detection, sync engine, database schema, pipeline, export. |
| `packages/sim` | A simulated band that speaks the real protocol, with fault injection. |
| `packages/ble-node` | Bluetooth transport for Node on a laptop. Untested until a band is available. |
| `apps/cli` | The laptop workbench: `npm run openhoop`. |
| `apps/mobile` | The Expo app for Android and iOS. |

Dependencies point one way: `protocol`, then `analytics`, then `core`, then `sim`, `ble-node`, `cli` and `mobile`.

## Parity levels

Every value carries a level that says how it relates to the vendor's equivalent. The level is fixed per value and does not change per night.

- **A**: the band measures it itself.
- **B**: an own model, calibrated against the vendor's output.
- **C**: an own method that gives a different result.
- **D**: raw data only, with no judgement attached.

| Level | Values |
| --- | --- |
| A | SpO2, skin temperature, battery pack charge (experimental, as the band relays it from the pack) |
| A/B | HRV, resting heart rate |
| B | Respiratory rate, sleep periods, sleep need and debt, Sleep score, Readiness, Load, heart rate zones, the Load and zone split of an activity you add or record live |
| C | Sleep consistency, sleep stages (estimate), automatic workouts, calories (estimate), coach check-ins (latest day against your own 30-day range), stress (estimate), muscular load and estimated 1RM (strength training), jet lag plan (rule-based guidance), VO2 max (estimate), healthspan pillars, body age (fitness age and Phenotypic Age, two estimates), route distance, pace, speed and elevation gain from the phone GPS (estimates) |
| D | Raw records, for example optical and motion data, and the ECG trace. Also the values you enter by hand or read from Health Connect (weight, body fat, steps on days without band steps, lab results with the reference range you copied from your own report, periods, symptoms, due date) and the plain arithmetic on them (BMI, lean mass, change over a period, unit conversion, inside or outside the range you entered, average cycle and period length, next-period estimate, pregnancy week). OpenHoop ships no reference ranges of its own |

When the data does not support a number, the app shows the reason instead of a number.

You can correct the start and end of a detected sleep and add a nap by hand. A correction is stored next to the detected sleep, which is kept, so it can be restored. Sleep need, debt, Sleep score and Readiness are recomputed from your times, keep their level, and the sleep is labelled "edited" or "added by hand". HRV, resting heart rate and the other night values still come only from what the band measured while you slept.

An activity's Load uses the same minute formula as the day's Load, over the heart rate the band recorded during the activity (pauses left out). The day's Load already counts every minute of heart rate once, so adding an activity never counts the same minutes twice, also when it overlaps a detected workout. Editing or deleting a detected workout is stored next to it; the detected record is kept.

## Sharing an activity

From an activity you can make a snapshot image. The card is drawn on the phone, handed to the system share sheet and the temporary file is deleted afterwards. Nothing is uploaded. You choose which values appear, the name is off by default, and the time of day is never drawn. Each value keeps its level. A value the data cannot support is left out, and a card without heart rate says so.
An activity started "with route" also records the phone's GPS position while it runs and the app is open. Fixes with an accuracy worse than 30 m, impossible jumps (faster than 12 m/s on foot or 30 m/s otherwise) and positions that did not move are skipped. Distance is the haversine sum over the recorded parts; a pause or a GPS gap of more than a minute starts a new part and adds no distance. Pace and speed use the activity's active time, and need at least 100 m. Elevation gain needs altitude on most fixes and ignores changes below 3 m.

## Scores

The scores are called Readiness (0 to 100), Load (0 to 21) and Sleep score (0 to 100). They are OpenHoop's own models. Their constants come from the open reference project `wearable5.0` and were fitted on one wearer, so they are not the vendor's scores and may differ for you. The constants live in a `Calibration` object so they can be refitted without changing code. The first three nights are labelled "calibrating".

## Sleep stages

Sleep stages are an estimate, OpenHoop's own method (level C). They are not the vendor's stages and not a sleep lab result. The classes are awake, light (N1 and N2), deep (N3) and REM, per 30-second epoch.

The design follows Walch O, Huang Y, Forger D, Goldstein C, "Sleep stage prediction with raw acceleration and photoplethysmography heart rate data derived from a consumer wearable device", Sleep 2019;42(12):zsz180: heart rate and motion from the wrist plus time in the night. The model is fitted on their open dataset (Walch O, "Motion and heart rate from a wrist-worn wearable and labeled sleep from polysomnography", version 1.0.0, PhysioNet 2019, ODC-BY 1.0): 31 people, one night each, with an Apple Watch and a sleep lab recording (polysomnography). Only the fitted coefficients ship, in `packages/analytics/src/stagesModel.ts`. `packages/analytics/test/train_stages.py` downloads nothing and is not run in CI; pointed at a copy of the dataset it reproduces the coefficients, the numbers below and the test fixture.

- **Per epoch**: the mean heart rate and the mean band motion value, each from at least 10 of the 30 seconds. Each night is referenced to itself: heart rate as (value − the night's median) ÷ (1.4826 × MAD), motion as ln(value ÷ the night's median + 0.1).
- **Features** use only the current and earlier epochs: heart rate over 2.5, 10 and 30 minutes, its spread over 5 minutes, the change from one epoch to the next, the current epoch against the 30-minute mean, motion now and over 5, 20 and 60 minutes, the time since motion last exceeded twice the night's median, and the hours since sleep onset.
- **Model**: a multinomial logistic regression (L2) gives the four probabilities. A four-state hidden Markov model with transition rates counted from the dataset smooths them. Its emission is the probability divided by the class share to the power 0.5; that power was chosen by cross-validation from 0.25, 0.5 and 0.75. A finished night is smoothed forward and backward.

Validation: leave one person out, with the power chosen again inside each training fold (nested), over 24,497 scored epochs.

| Lab \ OpenHoop | awake | light | deep | REM | agrees (recall) |
| --- | --- | --- | --- | --- | --- |
| awake | 332 | 649 | 34 | 218 | 27 % |
| light | 276 | 10,000 | 1,852 | 2,078 | 70 % |
| deep | 23 | 893 | 2,510 | 117 | 71 % |
| REM | 132 | 2,429 | 216 | 2,738 | 50 % |
| right when it says this (precision) | 44 % | 72 % | 54 % | 53 % | |

- Overall 63.6 % of epochs agree, Cohen's kappa 0.39 (per person median 0.37, range 0.00 to 0.67). Always answering "light" would agree on 58.0 % with kappa 0, so most of the gain is in kappa, not in accuracy.
- As awake, NREM and REM the same predictions agree on 74.8 %, kappa 0.37.
- Light against deep: of the epochs that both the lab and OpenHoop call light or deep, 82 % agree, kappa 0.53. Deep sleep can be told apart from light sleep moderately, so it is shown, but it is the least certain stage on a night-by-night basis.
- Totals are biased: deep sleep reads 1.30 times the lab's share, awake 0.62 times, light 0.98 and REM 0.93. Stages are only computed inside detected sleep, so most awake epochs are short awakenings, and the model misses most of them.

Limits that matter for this band:

- The motion value is not the same signal. The dataset has raw acceleration at about 50 Hz; for training, each second's motion is the mean distance of its samples from that second's mean vector (gravity and offset removed), the closest match to the band's `dynamic_accel_g` (stored as `motion_g`), whose exact filter is not known. Because motion only enters relative to the night's own median, a constant scale difference cancels out (tested), but a different filter, noise floor or sampling rate still changes the shape of the values. In the dataset the median during sleep was about 0.002 g.
- The heart rate in the dataset is the watch's estimate every few seconds, interpolated to one second; the band reports every second.
- The model has not been checked against a sleep lab on a WHOOP band, and the people in the dataset are few. Treat the stages as untested on this band.

Where stages are computed: only for the main night, inside its sleep periods, and only from band readings. For a corrected night the stages follow your corrected times, still using only what the band measured. Naps and sleep you add by hand get no stages, because the model was fitted on whole nights and uses the hours since sleep onset. When fewer than 80 % of the night's epochs have enough heart rate and motion, the app shows the reason instead of stages. Stage totals do not replace "asleep", which stays the band's own sleep detection (level B), so the two can differ. The epochs are stored in the `sleep_stages` table and are part of the export (`sleep_stages.csv`); Health Connect gets no stages. After an update that adds or changes a derived value, the app recomputes every stored day once at the next start, so older nights get stages as well.

For a night that is still going on (for example an alarm that waits for light sleep), the same model runs forward only on the epochs so far, so a stage never depends on later data. For the last epoch at 5-minute cut points it agreed on 63.1 %, kappa 0.34.

## Strength training

Sessions, sets, templates and your own exercises are stored on the phone and are part of the export. Reps, weight and RPE are what you enter (level D). Everything computed from them is an own method (level C) and is labelled as such.

- **Volume** is reps × weight in kg, summed over the sets. A set with 0 kg (bodyweight) counts as a set but adds no volume.
- **Muscular load** is the volume summed per primary muscle group of each exercise, next to the number of sets and the share of the session volume. It has no secondary muscles and no physiological weighting, so it is a plain volume count and not a measure of strain on the muscle.
- **Estimated 1RM** uses the Epley formula, 1RM ≈ weight × (1 + reps / 30) (Epley B., Poundage Chart, Boyd Epley Workout, Body Enterprises, Lincoln NE, 1985), only for sets of 1 to 12 reps with weight. It is an estimate, not a tested maximum.
- **Heart rate** in a session summary is taken from the band samples between the start and the end of the session. Without samples the app says so. A session works without a band.

## Calories

Calories are an estimate, OpenHoop's own method (level C). Minutes with a heart rate at or above 40 % of heart rate reserve use the sex-specific equations without VO2max from Keytel et al., "Prediction of energy expenditure from heart rate monitoring during submaximal exercise", J Sports Sci 2005;23(3):289-297. All other minutes, including minutes without heart rate, use resting energy from the Mifflin-St Jeor equation (Mifflin et al., Am J Clin Nutr 1990;51(2):241-247). The estimate needs height, weight, sex and birth year. For the sex "other" it uses the mean of the male and female equations. Without a complete profile or with fewer than 600 minutes of heart rate in a day, the app shows the reason instead of a number.

## Stress

Stress is an estimate, OpenHoop's own method (level C), and not a diagnosis. The day is split into 5-minute windows, the short-term HRV length of the Task Force of the ESC and NASPE (Circulation 1996;93(5):1043-1065). A window counts only when the band reports the wearer awake (WAKE or STILL), mean motion stays at or below 0.1 g, mean heart rate stays below 40 % of heart rate reserve, and the window does not touch a sleep period (including hand-added ones), a workout or the 30 minutes after it (vagal reactivation after exercise, Stanley et al., Sports Med 2013;43(12):1259-1277), so exercise and sleep do not read as stress. Each window gets its mean heart rate and, when at least 30 successive beat-to-beat differences are present, its RMSSD (ultra-short RMSSD: Munoz et al., PLoS One 2015;10(9):e0138921). Acute stress raises heart rate and lowers RMSSD (Kim et al., Psychiatry Investig 2018;15(3):235-245).

The baseline is the windows of up to 14 earlier days, at least 3 days with an hour of windows each; until then the day is labelled "calibrating". Centre and spread are the median and 1.4826 × MAD (Leys et al., J Exp Soc Psychol 2013;49(4):764-766), with RMSSD on a log scale (Plews et al., Sports Med 2013;43(9):773-781). A window's score is the mean of the heart rate z-score and the inverted ln RMSSD z-score (heart rate alone when there is no RMSSD), clamped to 0–3: the number of standard deviations above the wearer's own calm, awake normal. Low is below 1, medium from 1, high from 2. Because the baseline is personal, a long stressful period slowly becomes the new normal, and caffeine, illness, heat or alcohol raise the score as well.
## Healthspan

VO2 max and the healthspan pillars are estimates, OpenHoop's own methods (level C). They are not medical values.

VO2 max uses the heart rate ratio method from Uth et al., "Estimation of VO2max from the ratio between HRmax and HRrest - the Heart Rate Ratio Method", Eur J Appl Physiol 2004;91(1):111-115: VO2 max ≈ 15.3 × maximum heart rate ÷ resting heart rate. The resting heart rate is the median of at least 5 nightly values in the last 14 days. The maximum heart rate comes from your profile, or else from 208 − 0.7 × age (Tanaka et al., J Am Coll Cardiol 2001;37(1):153-156). The formula was fitted on 46 well-trained men aged 21 to 51, with a standard error of 2.7 mL/kg/min for a measured maximum and 4.7 for an age-predicted one; the authors say other groups still need validation. OpenHoop's resting heart rate is the lowest 5-minute average during sleep, which is usually lower than a resting value taken awake, so the estimate may read high. Without enough nights, or without a birth year and a maximum heart rate, the app shows the reason instead of a number.

There are four pillars and no combined score:

- Sleep: the mean of the last 7 nights against the recommendation of at least 7 hours for adults (Watson et al., Sleep 2015;38(6):843-844), against OpenHoop's sleep need, and the sleep consistency.
- Recovery: the mean HRV and resting heart rate of the last 7 nights against your own range (mean ± 1 SD) over the 30 nights before.
- Activity: minutes at or above 40 % of heart rate reserve in the last 7 days against the WHO range of 150 to 300 minutes of moderate activity a week (Bull et al., Br J Sports Med 2020;54(24):1451-1462). A vigorous minute counts once, not twice as in the WHO guideline, so the count is conservative. Below 150 minutes is only judged when all 7 days were measured for at least 10 hours.
- Fitness: the VO2 max estimate against the treadmill reference values per sex and age group in Loe et al., "Aerobic capacity reference data in 3816 healthy men and women 20-90 years", PLoS One 2013;8(5):e64319, Table 2.

Body age is two separate estimates (level C), never merged into one number:

- Fitness age: the age at which the Loe 2013 mean VO2 max for your sex equals your estimate, on a straight line between the middle of each age group (25 to 75; the 70+ group counts as 70 to 79). It is shown as a band: the VO2 max estimate plus and minus its standard error (2.7 or 4.7 mL/kg/min), each turned into an age. Outside 25 to 75 it only says "younger than" or "older than". It needs your sex (men or women, as in the reference data) and a VO2 max estimate.
- Phenotypic Age: Levine et al., "An epigenetic biomarker of aging for lifespan and healthspan", Aging 2018;10(4):573-591, with the equations as corrected in Liu et al., PLoS Med 2018;15(12):e1002718 (correction 2019) and the unrounded constants of the BioAge R package (Kwon and Belsky, GeroScience 2021). It uses the newest albumin, creatinine, glucose, CRP (ln, mg/dL), lymphocyte %, MCV, RDW, alkaline phosphatase and white blood cell count you entered, all within 90 days of the newest one, and your age in the year of that newest draw. A missing or older marker is listed instead of a number, and a CRP of 0 is refused because ln(0) does not exist.
## Health report

The health report is a PDF of the last 30 or 90 days that you can share with your doctor. It is made on the phone with `expo-print` from HTML that contains no network references, and is handed to the system share sheet. The temporary file is deleted after sharing and any leftover is removed at the next start. You choose the period, the sections and whether your name is on it. For each value it shows the average, the range, the trend, the coverage (days with data out of the days in the period) and the parity level of the value. Averages and ranges keep the level of the value they summarise. The trend compares the mean of the first half of the values with the mean of the second half and calls it rising or falling only when the difference is larger than the noise of the series (twice the standard deviation divided by the square root of the number of values), and needs at least 6 values. When there is no value, the report shows the reason, not a number. It ends with: not a medical device, OpenHoop's own estimates, generated on the date on this phone.

## Privacy

- No account, no OpenHoop server and no telemetry.
- The Donate button opens the GitHub Sponsors checkout in the system browser, shown as a sheet over the app; the GitHub links on the support page open the browser itself. The app sends no request for them and does not see what you enter on GitHub. The link carries only the amount and whether it is once or monthly.
- Donate your data builds its files on the phone and saves them in a folder you pick. The app sends nothing: it opens a prefilled GitHub issue form in the same browser sheet, and you attach and post the files yourself. The link carries the band model, the number of days and files, the date range, the firmware and the app version. See "Donate your data".
- No network access by default. Every request goes through one gate in the app that refuses it unless you switch on "Network features" and the specific feature under Privacy, and the address is https on that feature's fixed host. Both switches start off.
- Opt-in network features and what leaves the phone:
  - **Coach** sends your question, the current conversation, a summary of the last 7 days of Readiness, Sleep score, Load, HRV and resting heart rate (with their levels) and your coach memory notes to Anthropic (`api.anthropic.com`), using your own API key. No name, band identifiers or raw readings are sent. Coach settings show the exact text. The key stays in the device's secure storage and is never written to the database or the export. Anthropic's own terms apply to what you send.
  - **Maps** loads the standard map tiles from the OpenStreetMap Foundation (`tile.openstreetmap.org`) behind a saved route when you open it. The request carries the tile numbers of the area shown, which reveal roughly where the route was, your IP address, and a User-Agent with the app name and version. The route points are never sent. Only the tiles in view are loaded, at one zoom level; there is no prefetch or offline download. Tiles are kept in the phone's image cache (iOS follows the server's caching headers, Android keeps them until its image cache is full), and requests never ask to bypass a cache. The map shows "© OpenStreetMap contributors". The OSMF privacy policy applies. With Maps off the route is still drawn on the phone, without a background.
  - **Strava** sends an activity to your own Strava account (`www.strava.com`) only when you tap "Upload to Strava" on that activity and confirm. It sends its start and end, its Strava sport type, its name as OpenHoop shows it (for example "Running"), the band's heart rate during it (5-second averages), and its GPS route without the first and last 200 m unless you switch that off for that upload. Your notes, scores, sleep, other days and band identifiers are never sent. Connecting sends your own Strava app's client ID and secret and the authorization code to Strava, and keeps the client ID, secret and tokens only in the device's secure storage: never in the database, the export, logs or error messages. Disconnecting asks Strava to revoke access and wipes them. Strava's own privacy policy applies to what you upload. See "Strava".
- Location is asked for only when you start an activity with route, and used only while it records with the app open: no background location and no "always" permission. The route is stored in the encrypted database and leaves the phone only if you upload that activity to Strava yourself. By default the first and last 200 m of a route are hidden wherever it is shown; the stored route and the export keep every point.
- The database on the phone is encrypted. The key is kept in the device's secure storage.
- When you pair a band you say since when you have worn it. Records from before that date are acknowledged to the band but never stored, so data from a previous owner is discarded.
- Export gives you the whole database and one CSV file per table, including coach conversations, memory notes and the GPS points of your routes (`route_points.csv`), plus `notifications.json` with your notification settings and inbox, and `health-connect.json` with your Health Connect choices and the last sync result.
- Journal notes you type or dictate are kept in the same encrypted database. They are not sent anywhere and they are part of the export.
- Dictating a journal note works on the phone only and only with the phone's own speech recogniser, which OpenHoop requires to run offline: Android 13 and later with an offline language pack for your app language (English or Dutch). It never falls back to an online service, so on a phone without that recogniser or language pack the Dictate button is replaced by a message and typing keeps working. The audio is never recorded to a file, stored or sent, only the text lands in the note field, and nothing is saved until you tap Save note. The microphone permission is asked for only when you tap Dictate. If the language pack is missing, the app can ask Android to download it on your tap: that download is done by Android's own speech service, not by OpenHoop, and OpenHoop's network gate is not involved. Dictation is off on iPhone for now, because iOS can silently use Apple's servers when a language has no on-device model and the speech library offers no per-language check.
- Notifications are local only: they are scheduled on the phone, with no push service, no push token and no Firebase. The phone asks for permission only when you turn them on.
- Cycle, symptom and pregnancy entries are sensitive. They stay in the encrypted database on the phone, are part of the export, and can be deleted one by one or all at once on the cycle screen. The next-period date is a plain average of your own logged cycles. It is not a fertility or ovulation prediction.
- Import reads a data export file (ZIP or CSV) that you requested from the official app yourself, for interoperability. Nothing is fetched from the vendor and the file is read on the phone. Its values are stored in separate tables tagged `vendor-export`, shown as "from the official app's export", and never mixed with band data or OpenHoop's own scores. Removing them is one button.
- Health Connect (Android only) is opt-in per data type and off by default. It is a store on the phone, not a server, but other apps you allow in Health Connect can read what OpenHoop writes there. See "Health Connect".

## Health Connect

On Android, OpenHoop can write heart rate (minute averages), resting heart rate, HRV (RMSSD), sleep sessions, exercise sessions, SpO2, respiratory rate and skin temperature to Health Connect, and read weight, body fat and steps from it. Each type has its own switch, and OpenHoop asks Health Connect only for the permissions of the types you turn on. The app declares these Health Connect permissions and no others: write heart rate, resting heart rate, heart rate variability, sleep, exercise, oxygen saturation, respiratory rate and skin temperature; read weight, body fat and steps.

- It writes only band data, never the simulated demo data, and only values the app also shows: a value the data cannot support is left out, not estimated. Sleep sessions have a start and an end but no stages.
- Each sync replaces only the records OpenHoop wrote itself in the last 30 days, with stable record ids, so a re-sync or a sleep correction updates instead of duplicating. Data from other apps is never changed or deleted.
- Weight and body fat from other apps go into the body log, labelled with the app they came from. They never overwrite or compete with your own entries: a day you entered by hand is skipped, an imported entry you edit becomes yours, and one you delete stays deleted.
- Steps from Health Connect only fill days without band steps. A day with any steps from the band keeps the band value, so the two are never added up. OpenHoop reads Health Connect's daily total, which Health Connect already de-duplicates across apps, keeps one total per day with the apps that wrote it, and shows it as level D "from Health Connect" on the steps screen, the steps tile and the steps card on the Load screen. Trends, lifetime totals, the daily brief and the coach still use band steps only. It never writes steps. The daily totals are stored in `health-connect.json` in the export, and turning the steps switch off removes them from OpenHoop (Health Connect keeps its own).
- Sync runs when you tap "Sync now", and after each band sync if you turn that on. To withdraw a permission or delete what OpenHoop wrote, use Health Connect itself.
- Android home-screen widgets cannot open the encrypted database. While at least one OpenHoop widget is on the home screen, the app keeps a small unencrypted file in its private cache with only the numbers the widget shows (Readiness, Sleep score, Load, resting heart rate, HRV, or the reason a value is missing), the day, the sync time and the app language. There is no name and no raw data in it. Android also keeps the drawn widget images in the app's private storage. Turning "Show values on widgets" off replaces the file with one that holds no values; removing the last widget deletes the file and the images. Neither is included in Android backups.

## ECG

On an MG band, the ECG screen records 30 seconds while you hold a fingertip of the other hand on the top of the band. OpenHoop sends the band's filtered-reading start sequence, stores the trace it streams (about 100 samples per second) and always switches the reading off again, also on the next connection when the link was lost halfway. The trace is level D: it is drawn in 5-second strips on one shared scale, stored on the phone, part of the export (`ecg_recordings.csv`) and can be shared as a CSV file. OpenHoop computes nothing from it: no heart rate, no rhythm and no verdict. The result screen shows the band's optical heart rate during the recording separately, labelled as such. OpenHoop does not check your pulse for rhythm problems and makes no blood pressure value; those screens say so.

## Haptic alarm

The alarm screen sets one alarm on the band. The band runs it by itself at the set time, also when the phone is off or far away, and stops after 30 seconds or when you double-tap the band. OpenHoop reads the alarm back from the band before it says it is set, and converts between the phone's clock and the band's. The band rings an alarm once; after it has rung, OpenHoop sets the next day's alarm each time it syncs. Home and the sleep planner show the time, and the alarm screen says when it last rang and whether it was stopped early.

Smart wake (Android) can ring the band earlier. With Smart window, from 15, 30 or 45 minutes before the set time, the phone connects to the band every 5 minutes, syncs, estimates the stage of the last minutes with the sleep stage model and rings at a light moment (wake and light together at least 60 % over the last two epochs), or right away when the band reports you have been awake for the last 10 minutes. With Sleep goal it does the same from 90 minutes before and rings once the night's sleep reaches today's sleep need. The band's own alarm at the set time stays as the fallback: when the phone cannot reach the band, or nothing qualifies, the band rings at the set time by itself. The checks use an exact system alarm and a short foreground task with a notification, so the app does not have to be open, but the phone must be near the band with Bluetooth on. Android shows the next check as the phone's next alarm, and a phone restart during the night drops the checks until the next sync; the band alarm still rings. After a smart ring OpenHoop waits until the buzz has ended and then sets the band alarm for the next morning. The stage estimate is level C.

## Band actions and settings

Device settings can make the band buzz once (Test haptics) or for about four seconds (Find band, with a Stop button), and switch the standard Bluetooth heart rate service on or off (Heart rate broadcast, which gym equipment and other apps use). Switching it off also stops live heart rate in OpenHoop. The band keeps that setting after a restart and does not report it, so OpenHoop shows only what it last set itself.

Feature flags and device settings whose value is 1 (on) or 2 (off) can be changed under Configuration and flags. A change is written to the band's memory, stays after a restart and needs the typed word CHANGE; the command gate refuses to build a flag or setting write without that confirmation. OpenHoop keeps the value from before its first change in the stored configuration, also after a new read, and puts it back in one tap. Other values, such as the 0 that every device setting reads on the MG, are never changed, because there is no known way to put them back. Wiping, restarting, unpairing and firmware updates are still never sent.

## Strava

OpenHoop can upload activities you choose to your own Strava account. It never reads anything from Strava: it asks only for `activity:write`.

- Strava offers no PKCE sign-in for apps without a server, and OpenHoop has no server. So you register a free Strava API application of your own at [strava.com/settings/api](https://www.strava.com/settings/api), set its **Authorization Callback Domain** to `localhost`, and paste its Client ID and Client Secret into Settings, Integrations, Strava. They are kept only in the device's secure storage.
- Turn on "Network features" and "Strava" under Privacy first. Every request goes through the app's network gate, to `https://www.strava.com` only.
- Connecting opens Strava's mobile sign-in (`/oauth/mobile/authorize`) in a browser with the redirect `openhoop://localhost/strava-callback` and a random `state` that must come back unchanged; the code is exchanged at `/oauth/token`. Tokens are refreshed before they expire. If Strava refuses them (for example after you remove the app on strava.com), OpenHoop tries one refresh and then asks you to connect again. Disconnecting calls `/oauth/revoke` and wipes the app details and tokens from the phone.
- "Upload to Strava" is on the activity details screen. The sheet says exactly what will be sent. An activity with band heart rate or a GPS route is sent as a TCX file to `/api/v3/uploads`, and OpenHoop polls the upload until Strava has processed it. An activity with neither has no file to send, so OpenHoop creates a manual Strava entry with just the start, duration, sport type and name (`/api/v3/activities`).
- The first and last 200 m of a route are left out by default, as everywhere OpenHoop shows a route. A route shorter than 400 m is then not sent at all.
- OpenHoop remembers which activities it uploaded (the Strava upload and activity ids, in the app's settings), so the same activity is never uploaded twice. It notes an upload before sending it, so if Strava does not answer or the app is closed mid-upload, the activity shows "may already be on Strava" and is sent again only when you tap "Upload anyway". Strava's own duplicate check is reported as "already on Strava". Rate limits, a revoked sign-in, a rejected file and network errors are shown as such.

## Not a medical device

OpenHoop is not a medical device. It does not diagnose, treat or monitor any condition, and it makes no rhythm classification and no blood pressure value. Its numbers are estimates from a consumer sensor and from models that have not been validated for clinical use. Do not use them for medical decisions.

## Support the project

OpenHoop is free and has no paywalls. Donations help pay for test bands and reference devices. They go through [GitHub Sponsors](https://github.com/sponsors/DarioDML), once or every month, with a preset or your own amount:

| | $3 | $5 | $10 | Other |
| --- | --- | --- | --- | --- |
| Once | [$3](https://github.com/sponsors/DarioDML/sponsorships?preview=false&frequency=one-time&amount=3) | [$5](https://github.com/sponsors/DarioDML/sponsorships?preview=false&frequency=one-time&amount=5) | [$10](https://github.com/sponsors/DarioDML/sponsorships?preview=false&frequency=one-time&amount=10) | [Choose](https://github.com/sponsors/DarioDML?frequency=one-time) |
| Monthly | [$3](https://github.com/sponsors/DarioDML/sponsorships?preview=false&frequency=recurring&amount=3) | [$5](https://github.com/sponsors/DarioDML/sponsorships?preview=false&frequency=recurring&amount=5) | [$10](https://github.com/sponsors/DarioDML/sponsorships?preview=false&frequency=recurring&amount=10) | [Choose](https://github.com/sponsors/DarioDML?frequency=recurring) |

GitHub takes no fee on sponsorships from personal accounts; sponsorships paid by an organisation carry up to 6% ([GitHub's fee terms](https://docs.github.com/en/sponsors/sponsoring-open-source-contributors/about-sponsorships-fees-and-taxes)). You pay by card in US dollars and need a GitHub account. A monthly sponsorship can be changed or cancelled on GitHub.

In the app, go to More → Support the project. Pick $3, $5, $10 or type any whole-dollar amount up to $12,000, choose one-off or monthly, and tap Donate. The GitHub Sponsors checkout opens in a sheet over the app with that amount filled in (a Chrome Custom Tab on Android, a Safari view on iOS). Closing it brings you back to the app. On Android the sheet uses your default browser, so if you are signed in to GitHub there you are signed in here too. On iOS the sheet keeps its own sign-in, separate from Safari, so you sign in to GitHub in the sheet the first time.

You can also help by [reporting a problem or contributing code](https://github.com/DarioDML/OpenHoop/issues).

### Donate your data

Raw band data next to the official values for the same days is what makes the scores more accurate. In the app, go to More → Support the project → Donate your data (it is also on the Accuracy page):

1. Choose one or more days, or Select all. Days that also have official values are marked "most useful"; import the official export first to get those.
2. Confirm that the data becomes public and tap Donate. The app packs the days into zip files of at most 24 MiB each and saves them in a folder you pick. On Android, Download itself cannot be picked, so create a folder inside it, for example Download/OpenHoop; the app remembers that folder. If you skip the folder, you can save each file through the share menu instead.
3. A prefilled "Data donation" issue opens on GitHub. Attach the files and submit. You need a free GitHub account.

What goes in: the raw band records of the chosen days in the format of wearable5.0's donations (`frames.jsonl`), the official values you imported for those days, OpenHoop's own results for them, a `MANIFEST.json` and a `README.txt`. The band model is in the issue title and every file name.

What stays out: your name and profile, the serial number, Bluetooth address and name of the band and its battery pack (and every raw record that carries them), every piece of a band log line that names one of them or that cannot be read whole, records from before you started wearing the band, journal answers, notes, GPS routes, coach chats, cycle tracking, lab results, body measurements and every other day.

Dates and times are real, because every raw record carries the band's clock. The issue is public, linked to your GitHub account and cannot be taken back. Donated data is shared under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): anyone may use it for anything.

## More documents

- [LEGAL.md](LEGAL.md): why this project exists, what it does not do, and trademark and patent notes.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): third-party licences.
- [docs/provenance.md](docs/provenance.md): the source and test status of every protocol fact.
- [docs/dag-1.md](docs/dag-1.md): the day-one runbook (Dutch).

## Licence

Code under `packages/` is Apache-2.0 (`LICENSE-APACHE`). Code under `apps/` is GPL-3.0-only (`LICENSE-GPL`). Third-party material follows its own licence, listed in `THIRD_PARTY_NOTICES.md`. The root `LICENSE` file explains the split.

Created in [T3 Code](https://t3.codes).
