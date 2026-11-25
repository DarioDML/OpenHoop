# Provenance of protocol facts

Every protocol fact the code relies on, where it is used, where it comes from, and whether it has been checked on the author's own hardware. No band has arrived yet, so the last column is "no" everywhere.

Sources are files and sections of the MIT-licensed reference project `wearable5.0` at commit `8ab57dcd2f72a23f0cf9348c8a9a8cb40ed44fe8`: `FINDINGS.md` (cited as "FINDINGS section n"), `re/SCORE_MODELS.md`, `re/score_formulas.py`, and the schema `whoop5_protocol.json` (copied to `packages/protocol/src/schema/`). The schema tags each fact with an evidence tier:

- `corpus`: verified in the reference project against donated real 5/MG frames with valid checksums.
- `apk`: read from static analysis of the official Android app 5.473.0, for interoperability, facts only.
- `noop`: documented by the community project ryanbr/noop, partly confirmed on hardware.
- `goose`: documented by b-nnett/goose.
- `johga`: author-reported on the author's own strap, from a Gadgetbridge fork.
- `constructed`: an arithmetic or structural rule with no physical validation.

A tier column below lists the tags as the schema or findings give them. A fact with several tags is attested by several sources. Where a fact comes from a section of FINDINGS that is not tagged in the schema, the tier column says so.

| Fact | Where used in this repo | Source | Evidence tier as the source states it | Verified on own hardware |
| --- | --- | --- | --- | --- |
| GATT service and characteristic UUIDs (service `fd4b0001`, command write, command response, events, data, memfault, standard heart rate measurement) | `packages/protocol/src/gatt.ts`, transports | Schema `gatt`; FINDINGS section 1 | apk, noop, goose | no |
| Envelope: start marker, format byte, length, CRC16-Modbus over the header, CRC32 over the body, padding to a multiple of 4, fragmentation over notifications | `packages/protocol/src/framing.ts`, `encode.ts` | Schema `envelope_format1`; FINDINGS section 2 | apk, noop, corpus | no |
| Hello frame (command 145 with one argument byte) and its reply body | `packages/protocol/src/commands.ts`, `encode.ts` (`encodeHelloBody`), `packages/core/src/session.ts`; golden vector in `packages/protocol/test/commands.test.ts` | Schema `responses/GET_HELLO`; golden vectors | noop | no |
| Command numbers and names | `packages/protocol/src/commands.ts` | Schema `commands`; FINDINGS section 19 for request bodies | apk, noop | no |
| Command classes, including the dangerous set and the never-buildable set | `packages/protocol/src/commands.ts` | OpenHoop's own design decision, applied to the command table above | not applicable (not a protocol fact) | no |
| Command response layout: type 36, sequence, command, origin sequence, result, body from frame offset 13; result codes 0 to 3 | `packages/protocol/src/decode.ts` | Schema `command_response`, `result_codes`; FINDINGS section 2 | apk, noop | no |
| GET_DATA_RANGE body: read, write and trim pages, ring capacity, clock of the newest page at offset 57, clock sentinels 0 and 0xFFFFFFFF, backlog is write minus trim | `packages/protocol/src/decode.ts`, `packages/core/src/session.ts` | Schema `responses/GET_DATA_RANGE`; FINDINGS section 3 | apk, noop (field 57: noop; confirmed on 589 captured replies per FINDINGS section 3) | no |
| History metadata (start, end, complete) and the end token | `packages/protocol/src/decode.ts`, `packages/core/src/sync.ts` | Schema `metadata_types`, `metadata_49`; FINDINGS section 10 | apk, noop | no |
| Acknowledgement frame for a history chunk (command 23 with the end token) | `packages/protocol/src/commands.ts` (`historyAck`), `packages/core/src/sync.ts`; golden vector in `packages/protocol/test/commands.test.ts` | FINDINGS sections 10 and 17 | observed by the reference author on own strap and in a capture of the official app; not tagged in the schema | no |
| R18 heart rate, R-R intervals in milliseconds, steps, skin temperature, band state | `packages/protocol/src/records.ts`, `packages/analytics` | Schema `records/18` fields; FINDINGS sections 8 and 12 | apk, noop, johga, goose, corpus (per field) | no |
| R-R values are milliseconds in R18 | `packages/protocol/src/records.ts` | FINDINGS section 8 | corpus | no |
| SpO2 in R18 byte 82, valid between 70 and 100, status codes otherwise | `packages/protocol/src/records.ts`, `packages/analytics/src/spo2.ts` | Schema `records/18/spo2`; FINDINGS section 13 | corpus, noop | no |
| R16 and R17 structure | `packages/protocol/src/records.ts` | Schema `records/16`, `records/17` | noop, corpus | no |
| R20 optical record structure | `packages/protocol/src/records.ts` | Schema `records/20`; FINDINGS section 4 | noop, corpus | no |
| R21 and R22 structure | `packages/protocol/src/records.ts` | Schema `records/21`, `records/22` | noop | no |
| R26 compact optical structure | `packages/protocol/src/records.ts` | Schema `records/26`; FINDINGS section 11 | noop | no |
| Live heart rate packet 40 | `packages/protocol/src/decode.ts`, `packages/core/src/live.ts` | Schema `realtime_hr_40`; FINDINGS section 8 | noop (R-R unit on moderate evidence) | no |
| Event record layout and the event table | `packages/protocol/src/decode.ts` | Schema `event_48`, `events`; FINDINGS section 9 | noop, goose, corpus | no |
| Console log layout | `packages/protocol/src/decode.ts` | Schema `console_50`; FINDINGS section 9 | noop, corpus | no |
| Feature flag and device config enumeration (key exchange, next, get value; 16 flags, 7 config keys) | `packages/core/src/config.ts` | Schema `feature_flags`; FINDINGS section 10 | corpus, noop | no |
| The standard heart rate characteristic (0x2A37) reports R-R in milliseconds, not in 1/1024 s | `packages/protocol/src/hrm.ts` | FINDINGS section 8 | corpus (iOS and MG captures); contrary to the Bluetooth specification | no |
| Score formulas and constants (Readiness, Load, Sleep score, sleep need, debt, zones) | `packages/analytics/src/*.ts`, `calibration.ts` | `re/score_formulas.py`, `re/SCORE_MODELS.md`; FINDINGS section 18 | fitted on one wearer against the vendor's API; not a wire-protocol tier | no |
| Firmware 50.43 data lock: the band answers commands but sends no history without a vendor-signed certificate; live heart rate over the standard profile still works | `packages/core/src/lockProbe.ts`, `packages/protocol/src/firmware.ts` | Public issue https://github.com/OpenStrap/edge/issues/673 | third-party report; not tagged | no |

## Guesses awaiting a band

These are built into the code or the design, but nothing is known about them from a source, or the source does not cover them. Each is untested until a band is available.

| Guess | Why it is a guess |
| --- | --- |
| Bonding from Windows through the Node Bluetooth library, and on Android | Never run against a band. |
| Pairing behaviour on Windows and on Android | Not documented in any source used. |
| Whether the firmware version can be read through the standard service without a bond | Not documented. |
| The exact body of `SET_CLOCK` | Not documented. |
| Throughput and behaviour with a real, full ring buffer | Only simulated. |
| ECG records on an MG | Believed to arrive only live. Not seen. |
| Whether the heart rate profile works while the band is bonded to another device | Unknown. |
| The shape of the reply when reading the value of a feature flag or a device config key | Not covered by a source. |
| The arguments of `GET_BATTERY_LEVEL` and `TOGGLE_REALTIME_HR` | The code sends the arguments listed in the code; no source confirms them. |
| Whether replies to history commands arrive at all | A locked band is reported to send nothing after them. See the issue above. |
