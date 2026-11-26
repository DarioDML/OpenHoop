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
| C | Sleep consistency, automatic workouts, calories (estimate), coach check-ins (latest day against your own 30-day range), stress (estimate), muscular load and estimated 1RM (strength training), jet lag plan (rule-based guidance), VO2 max (estimate), healthspan pillars, body age (fitness age and Phenotypic Age, two estimates), route distance, pace, speed and elevation gain from the phone GPS (estimates) |
| D | Raw records, for example optical and motion data. Also the values you enter by hand or read from Health Connect (weight, body fat, lab results with the reference range you copied from your own report, periods, symptoms, due date) and the plain arithmetic on them (BMI, lean mass, change over a period, unit conversion, inside or outside the range you entered, average cycle and period length, next-period estimate, pregnancy week). OpenHoop ships no reference ranges of its own |

When the data does not support a number, the app shows the reason instead of a number.

You can correct the start and end of a detected sleep and add a nap by hand. A correction is stored next to the detected sleep, which is kept, so it can be restored. Sleep need, debt, Sleep score and Readiness are recomputed from your times, keep their level, and the sleep is labelled "edited" or "added by hand". HRV, resting heart rate and the other night values still come only from what the band measured while you slept.

An activity's Load uses the same minute formula as the day's Load, over the heart rate the band recorded during the activity (pauses left out). The day's Load already counts every minute of heart rate once, so adding an activity never counts the same minutes twice, also when it overlaps a detected workout. Editing or deleting a detected workout is stored next to it; the detected record is kept.

## Sharing an activity

From an activity you can make a snapshot image. The card is drawn on the phone, handed to the system share sheet and the temporary file is deleted afterwards. Nothing is uploaded. You choose which values appear, the name is off by default, and the time of day is never drawn. Each value keeps its level. A value the data cannot support is left out, and a card without heart rate says so.
An activity started "with route" also records the phone's GPS position while it runs and the app is open. Fixes with an accuracy worse than 30 m, impossible jumps (faster than 12 m/s on foot or 30 m/s otherwise) and positions that did not move are skipped. Distance is the haversine sum over the recorded parts; a pause or a GPS gap of more than a minute starts a new part and adds no distance. Pace and speed use the activity's active time, and need at least 100 m. Elevation gain needs altitude on most fixes and ignores changes below 3 m.

## Scores

The scores are called Readiness (0 to 100), Load (0 to 21) and Sleep score (0 to 100). They are OpenHoop's own models. Their constants come from the open reference project `wearable5.0` and were fitted on one wearer, so they are not the vendor's scores and may differ for you. The constants live in a `Calibration` object so they can be refitted without changing code. The first three nights are labelled "calibrating".

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
- No network access by default. Every request goes through one gate in the app that refuses it unless you switch on "Network features" and the specific feature under Privacy, and the address is https on that feature's fixed host. Both switches start off.
- Opt-in network features and what leaves the phone:
  - **Coach** sends your question, the current conversation, a summary of the last 7 days of Readiness, Sleep score, Load, HRV and resting heart rate (with their levels) and your coach memory notes to Anthropic (`api.anthropic.com`), using your own API key. No name, band identifiers or raw readings are sent. Coach settings show the exact text. The key stays in the device's secure storage and is never written to the database or the export. Anthropic's own terms apply to what you send.
  - **Maps** loads the standard map tiles from the OpenStreetMap Foundation (`tile.openstreetmap.org`) behind a saved route when you open it. The request carries the tile numbers of the area shown, which reveal roughly where the route was, your IP address, and a User-Agent with the app name and version. The route points are never sent. Only the tiles in view are loaded, at one zoom level; there is no prefetch or offline download. Tiles are kept in the phone's image cache (iOS follows the server's caching headers, Android keeps them until its image cache is full), and requests never ask to bypass a cache. The map shows "© OpenStreetMap contributors". The OSMF privacy policy applies. With Maps off the route is still drawn on the phone, without a background.
- Location is asked for only when you start an activity with route, and used only while it records with the app open: no background location and no "always" permission. The route is stored in the encrypted database and never uploaded. By default the first and last 200 m of a route are hidden wherever it is shown; the stored route and the export keep every point.
- The database on the phone is encrypted. The key is kept in the device's secure storage.
- When you pair a band you say since when you have worn it. Records from before that date are acknowledged to the band but never stored, so data from a previous owner is discarded.
- Export gives you the whole database and one CSV file per table, including coach conversations, memory notes and the GPS points of your routes (`route_points.csv`), plus `notifications.json` with your notification settings and inbox, and `health-connect.json` with your Health Connect choices and the last sync result.
- Journal notes you type are kept in the same encrypted database. They are not sent anywhere and they are part of the export.
- Notifications are local only: they are scheduled on the phone, with no push service, no push token and no Firebase. The phone asks for permission only when you turn them on.
- Cycle, symptom and pregnancy entries are sensitive. They stay in the encrypted database on the phone, are part of the export, and can be deleted one by one or all at once on the cycle screen. The next-period date is a plain average of your own logged cycles. It is not a fertility or ovulation prediction.
- Import reads a data export file (ZIP or CSV) that you requested from the official app yourself, for interoperability. Nothing is fetched from the vendor and the file is read on the phone. Its values are stored in separate tables tagged `vendor-export`, shown as "from the official app's export", and never mixed with band data or OpenHoop's own scores. Removing them is one button.
- Health Connect (Android only) is opt-in per data type and off by default. It is a store on the phone, not a server, but other apps you allow in Health Connect can read what OpenHoop writes there. See "Health Connect".

## Health Connect

On Android, OpenHoop can write heart rate (minute averages), resting heart rate, HRV (RMSSD), sleep sessions, exercise sessions, SpO2, respiratory rate and skin temperature to Health Connect, and read weight and body fat from it. Each type has its own switch, and OpenHoop asks Health Connect only for the permissions of the types you turn on. The app declares these Health Connect permissions and no others: write heart rate, resting heart rate, heart rate variability, sleep, exercise, oxygen saturation, respiratory rate and skin temperature; read weight and body fat.

- It writes only band data, never the simulated demo data, and only values the app also shows: a value the data cannot support is left out, not estimated. Sleep sessions have a start and an end but no stages.
- Each sync replaces only the records OpenHoop wrote itself in the last 30 days, with stable record ids, so a re-sync or a sleep correction updates instead of duplicating. Data from other apps is never changed or deleted.
- Weight and body fat from other apps go into the body log, labelled with the app they came from. They never overwrite or compete with your own entries: a day you entered by hand is skipped, an imported entry you edit becomes yours, and one you delete stays deleted.
- Sync runs when you tap "Sync now", and after each band sync if you turn that on. To withdraw a permission or delete what OpenHoop wrote, use Health Connect itself.
- Third-party cloud services (for example Strava) are not built.
- Android home-screen widgets cannot open the encrypted database. While at least one OpenHoop widget is on the home screen, the app keeps a small unencrypted file in its private cache with only the numbers the widget shows (Readiness, Sleep score, Load, resting heart rate, HRV, or the reason a value is missing), the day, the sync time and the app language. There is no name and no raw data in it. Android also keeps the drawn widget images in the app's private storage. Turning "Show values on widgets" off replaces the file with one that holds no values; removing the last widget deletes the file and the images. Neither is included in Android backups.

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

## More documents

- [LEGAL.md](LEGAL.md): why this project exists, what it does not do, and trademark and patent notes.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): third-party licences.
- [docs/provenance.md](docs/provenance.md): the source and test status of every protocol fact.
- [docs/dag-1.md](docs/dag-1.md): the day-one runbook (Dutch).

## Licence

Code under `packages/` is Apache-2.0 (`LICENSE-APACHE`). Code under `apps/` is GPL-3.0-only (`LICENSE-GPL`). Third-party material follows its own licence, listed in `THIRD_PARTY_NOTICES.md`. The root `LICENSE` file explains the split.

Created in [T3 Code](https://t3.codes).
