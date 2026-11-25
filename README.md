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

The `App builds` workflow (`.github/workflows/apps.yml`) builds an Android APK and an unsigned iOS IPA, and starts the iOS build on a simulator to check that it launches. It runs on pull requests that change the native setup, on demand from the Actions tab, and on every `v*` tag. A tag also publishes both files as a GitHub release. To install them on a phone, see [docs/installeren.md](docs/installeren.md) (Dutch).

Pull request and on-demand builds sign the APK with the public debug key: fine for testing, but anyone could sign an update for it. A tagged release signs with your own key and fails without it. Set the repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`; only tag builds can read them. The IPA needs no secrets: every iPhone user signs it with their own Apple ID.

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
| A | SpO2, skin temperature |
| A/B | HRV, resting heart rate |
| B | Respiratory rate, sleep periods, sleep need and debt, Sleep score, Readiness, Load, heart rate zones |
| C | Sleep consistency, automatic workouts, calories (estimate) |
| D | Raw records, for example optical and motion data. Also the values you enter by hand (weight, body fat, lab results with the reference range you copied from your own report) and the plain arithmetic on them (BMI, lean mass, change over a period, unit conversion, inside or outside the range you entered). OpenHoop ships no reference ranges of its own |

When the data does not support a number, the app shows the reason instead of a number.

You can correct the start and end of a detected sleep and add a nap by hand. A correction is stored next to the detected sleep, which is kept, so it can be restored. Sleep need, debt, Sleep score and Readiness are recomputed from your times, keep their level, and the sleep is labelled "edited" or "added by hand". HRV, resting heart rate and the other night values still come only from what the band measured while you slept.

## Scores

The scores are called Readiness (0 to 100), Load (0 to 21) and Sleep score (0 to 100). They are OpenHoop's own models. Their constants come from the open reference project `wearable5.0` and were fitted on one wearer, so they are not the vendor's scores and may differ for you. The constants live in a `Calibration` object so they can be refitted without changing code. The first three nights are labelled "calibrating".

## Calories

Calories are an estimate, OpenHoop's own method (level C). Minutes with a heart rate at or above 40 % of heart rate reserve use the sex-specific equations without VO2max from Keytel et al., "Prediction of energy expenditure from heart rate monitoring during submaximal exercise", J Sports Sci 2005;23(3):289-297. All other minutes, including minutes without heart rate, use resting energy from the Mifflin-St Jeor equation (Mifflin et al., Am J Clin Nutr 1990;51(2):241-247). The estimate needs height, weight, sex and birth year. For the sex "other" it uses the mean of the male and female equations. Without a complete profile or with fewer than 600 minutes of heart rate in a day, the app shows the reason instead of a number.

## Privacy

- No account, no server, no network access and no telemetry.
- The database on the phone is encrypted. The key is kept in the device's secure storage.
- When you pair a band you say since when you have worn it. Records from before that date are acknowledged to the band but never stored, so data from a previous owner is discarded.
- Export gives you the whole database and one CSV file per table, plus `notifications.json` with your notification settings and inbox.
- Notifications are local only: they are scheduled on the phone, with no push service, no push token and no Firebase. The phone asks for permission only when you turn them on.

## Not a medical device

OpenHoop is not a medical device. It does not diagnose, treat or monitor any condition, and it makes no rhythm classification and no blood pressure value. Its numbers are estimates from a consumer sensor and from models that have not been validated for clinical use. Do not use them for medical decisions.

## More documents

- [LEGAL.md](LEGAL.md): why this project exists, what it does not do, and trademark and patent notes.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): third-party licences.
- [docs/provenance.md](docs/provenance.md): the source and test status of every protocol fact.
- [docs/dag-1.md](docs/dag-1.md): the day-one runbook (Dutch).

## Licence

Code under `packages/` is Apache-2.0 (`LICENSE-APACHE`). Code under `apps/` is GPL-3.0-only (`LICENSE-GPL`). Third-party material follows its own licence, listed in `THIRD_PARTY_NOTICES.md`. The root `LICENSE` file explains the split.

Created in [T3 Code](https://t3.codes).
